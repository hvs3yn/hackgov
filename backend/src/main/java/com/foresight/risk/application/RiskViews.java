package com.foresight.risk.application;

import com.foresight.risk.application.explanation.ExplanationView;
import com.foresight.risk.domain.RiskAssessment;
import com.foresight.risk.domain.RiskAssessmentEvent;
import com.foresight.risk.domain.RiskEnums.AssessmentStatus;
import com.foresight.risk.domain.RiskEnums.ResolutionReason;
import com.foresight.risk.domain.RiskEnums.RiskEventType;
import com.foresight.risk.engine.model.Confidence;
import com.foresight.risk.engine.model.Evidence;
import com.foresight.risk.engine.model.Factor;
import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.Severity;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class RiskViews {

    private RiskViews() {
    }

    public record RiskView(UUID id, UUID projectId, UUID taskId, UUID subjectUserId, RiskCategory category,
                           AssessmentStatus status, Severity severity, int score, Confidence confidence, String title,
                           String summary, List<UUID> affectedTaskIds, Instant firstDetectedAt,
                           Instant lastEvaluatedAt, Instant lastChangedAt, Instant resolvedAt,
                           ResolutionReason resolutionReason, int revision) {
        static RiskView of(RiskAssessment a, AssessmentJson json) {
            return new RiskView(a.getId(), a.getProjectId(), a.getTaskId(), a.getSubjectUserId(), a.getCategory(),
                    a.getStatus(), a.getSeverity(), a.getScore(), a.getConfidence(), a.getTitle(), a.getSummary(),
                    json.affectedTaskIds(a), a.getFirstDetectedAt(), a.getLastEvaluatedAt(), a.getLastChangedAt(),
                    a.getResolvedAt(), a.getResolutionReason(), a.getRevision());
        }
    }

    public record RiskDetailView(RiskView risk, List<Factor> factors, List<Evidence> evidence,
                                 List<String> missingData, ExplanationView explanation) {
    }

    public record RiskEventView(UUID id, RiskEventType type, Severity severity, int score, int revision,
                                String details, Instant occurredAt) {
        static RiskEventView of(RiskAssessmentEvent e) {
            return new RiskEventView(e.getId(), e.getEventType(), e.getSeverity(), e.getScore(), e.getRevision(),
                    e.getDetails(), e.getOccurredAt());
        }
    }

    public record RiskSummaryView(UUID projectId, Severity overallSeverity, int maxScore, int activeRisks,
                                  Map<Severity, Long> bySeverity, Map<RiskCategory, Long> byCategory,
                                  List<RiskView> topRisks, Instant lastAnalyzedAt) {
    }
}
