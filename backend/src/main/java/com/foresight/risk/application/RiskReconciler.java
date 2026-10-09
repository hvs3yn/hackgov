package com.foresight.risk.application;

import com.foresight.common.json.JsonCodec;
import com.foresight.risk.domain.RiskAssessment;
import com.foresight.risk.domain.RiskAssessmentEvent;
import com.foresight.risk.domain.RiskEnums.ResolutionReason;
import com.foresight.risk.domain.RiskEnums.RiskEventType;
import com.foresight.risk.engine.model.Evidence;
import com.foresight.risk.engine.model.ProjectSnapshot;
import com.foresight.risk.engine.model.RiskSignal;
import com.foresight.risk.engine.model.Severity;
import com.foresight.risk.engine.model.TaskSnapshot;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Applies the documented lifecycle (docs/ai-risk-engine.md §6) by matching current signals against stored
 * assessments by fingerprint. Pure with respect to persistence: it mutates/creates entities and returns them;
 * the caller saves them inside the reconciliation transaction.
 */
@Component
public class RiskReconciler {

    public enum Outcome {DETECTED, ESCALATED, MITIGATED, UPDATED, RESOLVED, REOPENED, UNCHANGED}

    public record Result(List<RiskAssessment> created, List<RiskAssessmentEvent> events,
                         List<UUID> deliveryRequested, Map<Outcome, Integer> counts, int active) {
    }

    private final JsonCodec json;

    public RiskReconciler(JsonCodec json) {
        this.json = json;
    }

    public Result reconcile(UUID projectId, List<RiskAssessment> existing, List<RiskSignal> signals,
                            ProjectSnapshot snapshot, boolean projectActive, Severity notifyMinSeverity, Instant now) {
        Map<String, RiskAssessment> byFingerprint = existing.stream()
                .collect(Collectors.toMap(RiskAssessment::getFingerprint, a -> a));
        Map<UUID, TaskSnapshot> tasks = new HashMap<>();
        for (TaskSnapshot t : snapshot.tasks()) {
            tasks.put(t.id(), t);
        }
        long dataVersion = snapshot.dataVersion();
        List<RiskAssessment> created = new ArrayList<>();
        List<RiskAssessmentEvent> events = new ArrayList<>();
        List<UUID> delivery = new ArrayList<>();
        Map<Outcome, Integer> counts = new EnumMap<>(Outcome.class);
        Map<String, Boolean> seen = new HashMap<>();

        for (RiskSignal signal : signals) {
            String fingerprint = signal.fingerprint();
            seen.put(fingerprint, true);
            RiskAssessment assessment = byFingerprint.get(fingerprint);
            Outcome outcome;
            if (assessment == null) {
                assessment = new RiskAssessment(projectId, signal.taskId(), signal.subjectUserId(), signal.category(),
                        fingerprint, now);
                apply(assessment, signal, dataVersion, now);
                created.add(assessment);
                outcome = Outcome.DETECTED;
                events.add(new RiskAssessmentEvent(assessment, RiskEventType.DETECTED, signal.title(), now));
                if (signal.severity().isAtLeast(notifyMinSeverity)) {
                    assessment.requestDelivery(now);
                    delivery.add(assessment.getId());
                }
            } else if (!assessment.isActive()) {
                apply(assessment, signal, dataVersion, now);
                assessment.reopen(now);
                outcome = Outcome.REOPENED;
                events.add(new RiskAssessmentEvent(assessment, RiskEventType.REOPENED, signal.title(), now));
                if (signal.severity().isAtLeast(notifyMinSeverity)) {
                    assessment.requestDelivery(now);
                    delivery.add(assessment.getId());
                }
            } else {
                Severity previous = assessment.getSeverity();
                String previousHash = assessment.getContentHash();
                apply(assessment, signal, dataVersion, now);
                int cmp = signal.severity().compareTo(previous);
                if (cmp > 0) {
                    assessment.bumpRevision();
                    assessment.markChanged(now);
                    outcome = Outcome.ESCALATED;
                    events.add(new RiskAssessmentEvent(assessment, RiskEventType.ESCALATED,
                            previous + " -> " + signal.severity(), now));
                    if (signal.severity().isAtLeast(notifyMinSeverity)) {
                        assessment.requestDelivery(now);
                        delivery.add(assessment.getId());
                    }
                } else if (cmp < 0) {
                    assessment.markChanged(now);
                    outcome = Outcome.MITIGATED;
                    events.add(new RiskAssessmentEvent(assessment, RiskEventType.MITIGATED,
                            previous + " -> " + signal.severity(), now));
                } else if (!assessment.getContentHash().equals(previousHash)) {
                    assessment.markChanged(now);
                    outcome = Outcome.UPDATED;
                    events.add(new RiskAssessmentEvent(assessment, RiskEventType.UPDATED, null, now));
                } else {
                    outcome = Outcome.UNCHANGED;
                }
            }
            counts.merge(outcome, 1, Integer::sum);
        }

        for (RiskAssessment assessment : existing) {
            if (assessment.isActive() && !seen.containsKey(assessment.getFingerprint())) {
                ResolutionReason reason = resolutionReason(assessment, tasks, projectActive);
                assessment.resolve(reason, dataVersion, now);
                events.add(new RiskAssessmentEvent(assessment, RiskEventType.RESOLVED, reason.name(), now));
                counts.merge(Outcome.RESOLVED, 1, Integer::sum);
            }
        }
        return new Result(created, events, delivery, counts, signals.size());
    }

    private static ResolutionReason resolutionReason(RiskAssessment assessment, Map<UUID, TaskSnapshot> tasks,
                                                     boolean projectActive) {
        if (!projectActive) {
            return ResolutionReason.PROJECT_INACTIVE;
        }
        if (assessment.getTaskId() != null) {
            TaskSnapshot task = tasks.get(assessment.getTaskId());
            if (task == null) {
                return ResolutionReason.TASK_ARCHIVED;
            }
            if (!task.isOpen()) {
                return ResolutionReason.TASK_CLOSED;
            }
        }
        return ResolutionReason.CONDITION_CLEARED;
    }

    private void apply(RiskAssessment assessment, RiskSignal signal, long dataVersion, Instant now) {
        String factors = json.write(signal.factors());
        String evidence = json.write(signal.evidence());
        String affected = json.write(signal.affectedTaskIds());
        String missing = json.write(signal.missingData());
        String hash = sha256(signal.severity() + "|" + signal.confidence() + "|" + factors + "|" + affected + "|" + missing);
        assessment.applyContent(signal.severity(), signal.score(), signal.confidence(), signal.title(),
                summary(signal), factors, evidence, affected, missing, hash, dataVersion, now);
    }

    static String summary(RiskSignal signal) {
        String facts = signal.evidence().stream()
                .filter(e -> e.kind() == Evidence.Kind.FACT)
                .limit(3)
                .map(Evidence::statement)
                .collect(Collectors.joining(". "));
        return signal.title() + ". " + facts + (facts.isEmpty() ? "" : ".");
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
