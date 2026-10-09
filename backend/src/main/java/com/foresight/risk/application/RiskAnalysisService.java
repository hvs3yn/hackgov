package com.foresight.risk.application;

import com.foresight.common.error.ApiException;
import com.foresight.common.error.TooManyRequestsException;
import com.foresight.common.time.TimeProvider;
import com.foresight.project.application.ProjectAccessService;
import com.foresight.project.application.ProjectAccessService.ProjectAccess;
import com.foresight.project.application.ProjectQueryApi;
import com.foresight.project.domain.ProjectRole.Permission;
import com.foresight.project.domain.ProjectStatus;
import com.foresight.risk.application.ProjectSnapshotLoader.LoadedSnapshot;
import com.foresight.risk.application.RiskEvents.RiskDeliveryRequestedEvent;
import com.foresight.risk.application.RiskReconciler.Outcome;
import com.foresight.risk.domain.RiskAssessment;
import com.foresight.risk.domain.RiskAssessmentEventRepository;
import com.foresight.risk.domain.RiskAssessmentRepository;
import com.foresight.risk.engine.RiskEngine;
import com.foresight.risk.engine.model.RiskSignal;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Orchestrates one analysis: consistent snapshot → pure engine (no transaction) → reconciliation under the
 * project row lock with a stale-snapshot check (retried). Safe to run repeatedly and concurrently.
 */
@Service
public class RiskAnalysisService {

    private static final Logger log = LoggerFactory.getLogger(RiskAnalysisService.class);
    private static final int MAX_STALE_RETRIES = 3;

    private final ProjectSnapshotLoader snapshotLoader;
    private final RiskReconciler reconciler;
    private final RiskAssessmentRepository assessments;
    private final RiskAssessmentEventRepository events;
    private final ProjectQueryApi projects;
    private final ProjectAccessService access;
    private final RiskProperties properties;
    private final RiskEngine engine;
    private final TimeProvider time;
    private final ApplicationEventPublisher publisher;
    private final TransactionTemplate writeTx;
    private final MeterRegistry meters;

    public RiskAnalysisService(ProjectSnapshotLoader snapshotLoader, RiskReconciler reconciler,
                               RiskAssessmentRepository assessments, RiskAssessmentEventRepository events,
                               ProjectQueryApi projects, ProjectAccessService access, RiskProperties properties,
                               TimeProvider time, ApplicationEventPublisher publisher,
                               PlatformTransactionManager txManager, MeterRegistry meters) {
        this.snapshotLoader = snapshotLoader;
        this.reconciler = reconciler;
        this.assessments = assessments;
        this.events = events;
        this.projects = projects;
        this.access = access;
        this.properties = properties;
        this.engine = RiskEngine.withDefaultRules(properties.toSettings());
        this.time = time;
        this.publisher = publisher;
        this.writeTx = new TransactionTemplate(txManager);
        this.meters = meters;
    }

    public record AnalysisResult(UUID projectId, Instant analyzedAt, long dataVersion, int activeRisks,
                                 Map<Outcome, Integer> counts) {
        public int count(Outcome outcome) {
            return counts.getOrDefault(outcome, 0);
        }
    }

    /** Manual trigger from the API: requires CONTRIBUTE permission, an ACTIVE project and respects a cooldown. */
    public AnalysisResult analyzeOnRequest(UUID actorId, UUID projectId) {
        ProjectAccess pa = access.require(projectId, actorId, Permission.CONTRIBUTE);
        if (pa.status() != ProjectStatus.ACTIVE) {
            throw ApiException.conflict("PROJECT_READ_ONLY", "Only ACTIVE projects are analysed");
        }
        Instant last = projects.get(projectId).lastAnalyzedAt();
        Duration cooldown = properties.manualCooldown();
        if (last != null && last.plus(cooldown).isAfter(time.now())) {
            Duration wait = Duration.between(time.now(), last.plus(cooldown));
            throw new TooManyRequestsException("ANALYSIS_COOLDOWN",
                    "Analysis ran moments ago; retry in " + Math.max(1, wait.toSeconds()) + " s", wait);
        }
        return analyze(projectId);
    }

    /** Analyses one project (no authorization – used by schedulers and listeners). */
    public AnalysisResult analyze(UUID projectId) {
        for (int attempt = 1; attempt <= MAX_STALE_RETRIES; attempt++) {
            LoadedSnapshot loaded = snapshotLoader.load(projectId);
            boolean active = loaded.status() == ProjectStatus.ACTIVE;
            Instant now = time.now();
            List<RiskSignal> signals = active ? engine.analyze(loaded.snapshot(), now, time.zone()) : List.of();
            AnalysisResult result = writeTx.execute(status -> reconcile(projectId, loaded, signals, active, now));
            if (result != null) {
                meters.counter("foresight.risk.analyses", "outcome", "ok").increment();
                log.debug("Analysed project {} at data version {}: {}", projectId, result.dataVersion(), result.counts());
                return result;
            }
            meters.counter("foresight.risk.analyses", "outcome", "stale").increment();
            log.debug("Snapshot of project {} became stale (attempt {}), retrying", projectId, attempt);
        }
        throw ApiException.conflict("CONFLICT", "Project data kept changing during analysis; try again");
    }

    /** Returns null if the snapshot is stale (data changed after it was taken). */
    private AnalysisResult reconcile(UUID projectId, LoadedSnapshot loaded, List<RiskSignal> signals, boolean active,
                                     Instant now) {
        long current = projects.lockAndReadDataVersion(projectId);
        if (current != loaded.snapshot().dataVersion()) {
            return null;
        }
        List<RiskAssessment> existing = assessments.findByProjectId(projectId);
        RiskReconciler.Result result = reconciler.reconcile(projectId, existing, signals, loaded.snapshot(), active,
                properties.notifyMinSeverity(), now);
        assessments.saveAll(result.created());
        assessments.flush();
        events.saveAll(result.events());
        projects.markAnalyzed(projectId, now, current);
        if (!result.deliveryRequested().isEmpty()) {
            publisher.publishEvent(new RiskDeliveryRequestedEvent(projectId, result.deliveryRequested()));
        }
        return new AnalysisResult(projectId, now, current, result.active(), result.counts());
    }
}
