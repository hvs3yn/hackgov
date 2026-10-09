package com.foresight.risk.domain;

import com.foresight.risk.domain.RiskEnums.RiskEventType;
import com.foresight.risk.engine.model.Severity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** Append-only lifecycle history of an assessment. */
@Entity
@Table(name = "risk_assessment_events")
public class RiskAssessmentEvent {

    @Id
    private UUID id;

    @Column(name = "assessment_id", nullable = false, updatable = false)
    private UUID assessmentId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 16, updatable = false)
    private RiskEventType eventType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16, updatable = false)
    private Severity severity;

    @Column(nullable = false, updatable = false)
    private int score;

    @Column(nullable = false, updatable = false)
    private int revision;

    @Column(length = 500, updatable = false)
    private String details;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    protected RiskAssessmentEvent() {
    }

    public RiskAssessmentEvent(RiskAssessment assessment, RiskEventType type, String details, Instant now) {
        this.id = UUID.randomUUID();
        this.assessmentId = assessment.getId();
        this.projectId = assessment.getProjectId();
        this.eventType = type;
        this.severity = assessment.getSeverity();
        this.score = assessment.getScore();
        this.revision = assessment.getRevision();
        this.details = details == null || details.length() <= 500 ? details : details.substring(0, 500);
        this.occurredAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getAssessmentId() {
        return assessmentId;
    }

    public RiskEventType getEventType() {
        return eventType;
    }

    public Severity getSeverity() {
        return severity;
    }

    public int getScore() {
        return score;
    }

    public int getRevision() {
        return revision;
    }

    public String getDetails() {
        return details;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }
}
