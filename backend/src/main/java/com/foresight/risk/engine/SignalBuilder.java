package com.foresight.risk.engine;

import com.foresight.risk.engine.model.Confidence;
import com.foresight.risk.engine.model.Evidence;
import com.foresight.risk.engine.model.Factor;
import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.RiskSignal;
import com.foresight.risk.engine.model.RiskSignal.SubjectType;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Mutable helper used by rules to assemble a {@link RiskSignal}. */
public final class SignalBuilder {

    private final RiskCategory category;
    private final SubjectType subjectType;
    private final UUID subjectId;
    private UUID taskId;
    private UUID subjectUserId;
    private String title;
    private final List<Factor> factors = new ArrayList<>();
    private final List<Evidence> evidence = new ArrayList<>();
    private final Set<UUID> affected = new LinkedHashSet<>();
    private final List<String> missing = new ArrayList<>();
    private Confidence confidence = Confidence.HIGH;

    private SignalBuilder(RiskCategory category, SubjectType subjectType, UUID subjectId) {
        this.category = category;
        this.subjectType = subjectType;
        this.subjectId = subjectId;
    }

    public static SignalBuilder forTask(RiskCategory category, UUID taskId) {
        SignalBuilder b = new SignalBuilder(category, SubjectType.TASK, taskId);
        b.taskId = taskId;
        return b;
    }

    public static SignalBuilder forProject(RiskCategory category, UUID projectId) {
        return new SignalBuilder(category, SubjectType.PROJECT, projectId);
    }

    public static SignalBuilder forUser(RiskCategory category, UUID userId) {
        SignalBuilder b = new SignalBuilder(category, SubjectType.USER, userId);
        b.subjectUserId = userId;
        return b;
    }

    public SignalBuilder title(String title) {
        this.title = title;
        return this;
    }

    public SignalBuilder factor(String code, String description, int points) {
        if (points != 0) {
            factors.add(new Factor(code, description, points));
        }
        return this;
    }

    public SignalBuilder evidence(Evidence item) {
        evidence.add(item);
        return this;
    }

    public SignalBuilder affected(UUID taskId) {
        affected.add(taskId);
        return this;
    }

    public SignalBuilder affected(List<UUID> taskIds) {
        affected.addAll(taskIds);
        return this;
    }

    public SignalBuilder missing(String description) {
        missing.add(description);
        return this;
    }

    public SignalBuilder capConfidence(Confidence cap) {
        confidence = confidence.atMost(cap);
        return this;
    }

    public boolean hasFactor(String code) {
        return factors.stream().anyMatch(f -> f.code().equals(code));
    }

    public RiskSignal build(ScoringPolicy scoring) {
        int score = scoring.score(factors);
        return new RiskSignal(category, subjectType, subjectId, taskId, subjectUserId, title, factors, evidence,
                List.copyOf(affected), missing, confidence, score, scoring.severity(score));
    }
}
