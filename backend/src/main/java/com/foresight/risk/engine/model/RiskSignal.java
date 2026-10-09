package com.foresight.risk.engine.model;

import java.util.List;
import java.util.UUID;

/**
 * Output of a rule: a scored, explained potential risk. {@link #fingerprint()} identifies the risk across
 * analyses (one persisted assessment per fingerprint and project).
 */
public record RiskSignal(RiskCategory category, SubjectType subjectType, UUID subjectId, UUID taskId,
                         UUID subjectUserId, String title, List<Factor> factors, List<Evidence> evidence,
                         List<UUID> affectedTaskIds, List<String> missingData, Confidence confidence,
                         int score, Severity severity) {

    public enum SubjectType {TASK, PROJECT, USER}

    public RiskSignal {
        factors = List.copyOf(factors);
        evidence = List.copyOf(evidence);
        affectedTaskIds = List.copyOf(affectedTaskIds);
        missingData = List.copyOf(missingData);
    }

    public String fingerprint() {
        return category + ":" + subjectType + ":" + subjectId;
    }
}
