package com.foresight.inbox.application;

import com.foresight.common.json.JsonCodec;
import com.foresight.common.time.TimeProvider;
import com.foresight.inbox.domain.InboxItem;
import com.foresight.inbox.domain.InboxItemRepository;
import com.foresight.recommendation.application.AiGenerationLog.GenerationContext;
import com.foresight.recommendation.application.ExplanationService;
import com.foresight.risk.application.RiskDeliveryStore;
import com.foresight.risk.application.explanation.ExplanationView;
import com.foresight.risk.domain.RiskAssessment;
import com.foresight.risk.domain.RiskEnums.DeliveryStatus;
import com.foresight.risk.engine.model.RiskCategory;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Delivery pipeline for one assessment revision:
 * <ol>
 *   <li>claim (conditional update, lease) – only one worker proceeds;</li>
 *   <li>generate the explanation with no transaction open (may call an external AI provider);</li>
 *   <li>short transaction: lock the assessment, verify the claimed revision is still current, upsert one inbox
 *       item per recipient (unique per assessment+recipient), mark delivered.</li>
 * </ol>
 * Failures release the claim with backoff; the sweeper retries. Re-running is idempotent.
 */
@Service
public class RiskAlertDeliveryService {

    private static final Logger log = LoggerFactory.getLogger(RiskAlertDeliveryService.class);

    private final RiskDeliveryStore store;
    private final ExplanationService explanations;
    private final RecipientResolver recipients;
    private final InboxItemRepository items;
    private final JsonCodec json;
    private final TimeProvider time;
    private final TransactionTemplate tx;
    private final MeterRegistry meters;

    public RiskAlertDeliveryService(RiskDeliveryStore store, ExplanationService explanations,
                                    RecipientResolver recipients, InboxItemRepository items, JsonCodec json,
                                    TimeProvider time, PlatformTransactionManager txManager, MeterRegistry meters) {
        this.store = store;
        this.explanations = explanations;
        this.recipients = recipients;
        this.items = items;
        this.json = json;
        this.time = time;
        this.tx = new TransactionTemplate(txManager);
        this.meters = meters;
    }

    /** Delivers all due assessments (bounded batch). Returns the number processed. */
    public int deliverPending(int limit) {
        List<UUID> ids = store.findDeliverable(limit);
        for (UUID id : ids) {
            deliver(id);
        }
        return ids.size();
    }

    public void deliver(UUID assessmentId) {
        Optional<RiskAssessment> found = store.find(assessmentId);
        if (found.isEmpty()) {
            return;
        }
        RiskAssessment snapshot = found.get();
        if (snapshot.getDeliveryStatus() != DeliveryStatus.PENDING
                && snapshot.getDeliveryStatus() != DeliveryStatus.IN_PROGRESS) {
            return;
        }
        int revision = snapshot.getRevision();
        if (!store.claim(assessmentId, revision)) {
            return;
        }
        try {
            ExplanationView explanation = explanations.explain(explanations.requestFor(snapshot),
                    new GenerationContext(assessmentId, snapshot.getProjectId(), revision));
            Integer delivered = tx.execute(status -> finalizeDelivery(assessmentId, revision, explanation));
            if (delivered != null && delivered > 0) {
                meters.counter("foresight.inbox.deliveries").increment(delivered);
            }
        } catch (RuntimeException e) {
            log.warn("Delivery of assessment {} revision {} failed; will retry", assessmentId, revision, e);
            meters.counter("foresight.inbox.delivery.failures").increment();
            store.markFailed(assessmentId, revision);
        }
    }

    private Integer finalizeDelivery(UUID assessmentId, int revision, ExplanationView explanation) {
        Optional<RiskAssessment> locked = store.lockIfStillClaimed(assessmentId, revision);
        if (locked.isEmpty()) {
            log.debug("Assessment {} changed after claim; skipping stale revision {}", assessmentId, revision);
            return 0;
        }
        RiskAssessment a = locked.get();
        if (!a.isActive()) {
            store.markNotRequired(a);
            return 0;
        }
        Instant now = time.now();
        String explanationJson = json.write(explanation);
        String actionsJson = json.write(explanation.recommendedActions());
        String title = titlePrefix(a.getCategory()) + a.getTitle();
        int count = 0;
        for (UUID recipient : recipients.resolve(a)) {
            InboxItem item = items.findByAssessmentIdAndRecipientId(a.getId(), recipient)
                    .orElseGet(() -> new InboxItem(recipient, a.getProjectId(), a.getTaskId(), a.getId(), now));
            if (item.deliver(a.getCategory(), a.getSeverity(), title, explanationJson, actionsJson, revision, now)) {
                items.save(item);
                count++;
            }
        }
        store.markDelivered(a, explanationJson, explanation.source());
        log.info("Delivered risk {} ({} {}) revision {} to {} inbox(es)", a.getId(), a.getCategory(), a.getSeverity(),
                revision, count);
        return count;
    }

    static String titlePrefix(RiskCategory category) {
        return switch (category) {
            case OVERDUE_TASK -> "Overdue: ";
            case APPROACHING_DEADLINE -> "Potential delay: ";
            case STALLED_TASK -> "Stalled work: ";
            case BLOCKED_DEPENDENCY -> "Blocked dependency: ";
            case PROJECT_DEADLINE -> "Project deadline at risk: ";
            case WORKLOAD_IMBALANCE -> "Workload warning: ";
        };
    }
}
