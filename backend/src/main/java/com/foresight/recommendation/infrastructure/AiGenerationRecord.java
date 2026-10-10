package com.foresight.recommendation.infrastructure;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * One explanation-generation attempt (table {@code ai_generations}). Telemetry only: it never contains prompts,
 * credentials or model output text, and rows are purged after 90 days. Immutable once written.
 * <p>
 * {@code outcome} is {@code PROVIDER} (validated AI output used) or {@code FALLBACK}.
 */
@Entity
@Table(name = "ai_generations")
public class AiGenerationRecord {

    @Id
    private UUID id;

    @Column(name = "assessment_id", nullable = false, updatable = false)
    private UUID assessmentId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(nullable = false, updatable = false)
    private int revision;

    @Column(length = 32, updatable = false)
    private String category;

    @Column(length = 16, updatable = false)
    private String severity;

    @Column(name = "configured_provider", length = 32, updatable = false)
    private String configuredProvider;

    @Column(length = 100, updatable = false)
    private String model;

    @Column(length = 32, updatable = false)
    private String source;

    @Column(nullable = false, length = 16, updatable = false)
    private String outcome;

    @Column(name = "fallback_reason", length = 100, updatable = false)
    private String fallbackReason;

    @Column(name = "error_message", length = 300, updatable = false)
    private String errorMessage;

    @Column(name = "latency_ms", nullable = false, updatable = false)
    private long latencyMs;

    @Column(name = "recommended_actions", nullable = false, updatable = false)
    private int recommendedActions;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected AiGenerationRecord() {
    }

    public AiGenerationRecord(UUID assessmentId, UUID projectId, int revision, String category, String severity,
                              String configuredProvider, String model, String source, String outcome,
                              String fallbackReason, String errorMessage, long latencyMs, int recommendedActions,
                              Instant createdAt) {
        this.id = UUID.randomUUID();
        this.assessmentId = assessmentId;
        this.projectId = projectId;
        this.revision = revision;
        this.category = category;
        this.severity = severity;
        this.configuredProvider = configuredProvider;
        this.model = model;
        this.source = source;
        this.outcome = outcome;
        this.fallbackReason = fallbackReason;
        this.errorMessage = errorMessage;
        this.latencyMs = latencyMs;
        this.recommendedActions = recommendedActions;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getAssessmentId() {
        return assessmentId;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public int getRevision() {
        return revision;
    }

    public String getCategory() {
        return category;
    }

    public String getSeverity() {
        return severity;
    }

    public String getConfiguredProvider() {
        return configuredProvider;
    }

    public String getModel() {
        return model;
    }

    public String getSource() {
        return source;
    }

    public String getOutcome() {
        return outcome;
    }

    public String getFallbackReason() {
        return fallbackReason;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public long getLatencyMs() {
        return latencyMs;
    }

    public int getRecommendedActions() {
        return recommendedActions;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
