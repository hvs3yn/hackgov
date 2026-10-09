package com.foresight.risk.domain;

import com.foresight.risk.domain.RiskEnums.AssessmentStatus;
import com.foresight.risk.domain.RiskEnums.DeliveryStatus;
import com.foresight.risk.domain.RiskEnums.ResolutionReason;
import com.foresight.risk.engine.model.Confidence;
import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.Severity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * Persistent state of one risk identity ({@code projectId + fingerprint}) across analyses.
 */
@Entity
@Table(name = "risk_assessments")
public class RiskAssessment {

    @Id
    private UUID id;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(name = "task_id", updatable = false)
    private UUID taskId;

    @Column(name = "subject_user_id", updatable = false)
    private UUID subjectUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32, updatable = false)
    private RiskCategory category;

    @Column(nullable = false, length = 200, updatable = false)
    private String fingerprint;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AssessmentStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Severity severity;

    @Column(nullable = false)
    private int score;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Confidence confidence;

    @Column(nullable = false, length = 300)
    private String title;

    @Column(nullable = false, columnDefinition = "text")
    private String summary;

    @Column(name = "factors_json", nullable = false, columnDefinition = "text")
    private String factorsJson;

    @Column(name = "evidence_json", nullable = false, columnDefinition = "text")
    private String evidenceJson;

    @Column(name = "affected_task_ids_json", nullable = false, columnDefinition = "text")
    private String affectedTaskIdsJson;

    @Column(name = "missing_data_json", nullable = false, columnDefinition = "text")
    private String missingDataJson;

    @Column(name = "content_hash", nullable = false, length = 64)
    private String contentHash;

    @Column(nullable = false)
    private int revision;

    @Column(name = "first_detected_at", nullable = false, updatable = false)
    private Instant firstDetectedAt;

    @Column(name = "last_evaluated_at", nullable = false)
    private Instant lastEvaluatedAt;

    @Column(name = "last_changed_at", nullable = false)
    private Instant lastChangedAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "resolution_reason", length = 32)
    private ResolutionReason resolutionReason;

    @Column(name = "reopen_count", nullable = false)
    private int reopenCount;

    @Column(name = "analyzed_data_version", nullable = false)
    private long analyzedDataVersion;

    @Column(name = "explanation_json", columnDefinition = "text")
    private String explanationJson;

    @Column(name = "explanation_source", length = 32)
    private String explanationSource;

    @Column(name = "explanation_revision")
    private Integer explanationRevision;

    @Enumerated(EnumType.STRING)
    @Column(name = "delivery_status", nullable = false, length = 16)
    private DeliveryStatus deliveryStatus;

    @Column(name = "delivery_attempts", nullable = false)
    private int deliveryAttempts;

    @Column(name = "delivery_claimed_at")
    private Instant deliveryClaimedAt;

    @Column(name = "next_delivery_attempt_at")
    private Instant nextDeliveryAttemptAt;

    @Version
    private Long version;

    protected RiskAssessment() {
    }

    public RiskAssessment(UUID projectId, UUID taskId, UUID subjectUserId, RiskCategory category, String fingerprint,
                          Instant now) {
        this.id = UUID.randomUUID();
        this.projectId = projectId;
        this.taskId = taskId;
        this.subjectUserId = subjectUserId;
        this.category = category;
        this.fingerprint = fingerprint;
        this.status = AssessmentStatus.ACTIVE;
        this.firstDetectedAt = now;
        this.lastEvaluatedAt = now;
        this.lastChangedAt = now;
        this.revision = 1;
        this.deliveryStatus = DeliveryStatus.NOT_REQUIRED;
    }

    /** Overwrites the evaluated content (does not touch lifecycle/revision). */
    public void applyContent(Severity severity, int score, Confidence confidence, String title, String summary,
                             String factorsJson, String evidenceJson, String affectedTaskIdsJson,
                             String missingDataJson, String contentHash, long dataVersion, Instant now) {
        this.severity = severity;
        this.score = score;
        this.confidence = confidence;
        this.title = title.length() > 300 ? title.substring(0, 300) : title;
        this.summary = summary;
        this.factorsJson = factorsJson;
        this.evidenceJson = evidenceJson;
        this.affectedTaskIdsJson = affectedTaskIdsJson;
        this.missingDataJson = missingDataJson;
        this.contentHash = contentHash;
        this.analyzedDataVersion = dataVersion;
        this.lastEvaluatedAt = now;
    }

    public void markChanged(Instant now) {
        this.lastChangedAt = now;
    }

    public void touchEvaluated(long dataVersion, Instant now) {
        this.lastEvaluatedAt = now;
        this.analyzedDataVersion = dataVersion;
    }

    public void bumpRevision() {
        this.revision++;
    }

    public void reopen(Instant now) {
        this.status = AssessmentStatus.ACTIVE;
        this.resolvedAt = null;
        this.resolutionReason = null;
        this.reopenCount++;
        this.revision++;
        this.lastChangedAt = now;
    }

    public void resolve(ResolutionReason reason, long dataVersion, Instant now) {
        this.status = AssessmentStatus.RESOLVED;
        this.resolvedAt = now;
        this.resolutionReason = reason;
        this.lastChangedAt = now;
        this.lastEvaluatedAt = now;
        this.analyzedDataVersion = dataVersion;
        if (deliveryStatus == DeliveryStatus.PENDING || deliveryStatus == DeliveryStatus.FAILED) {
            this.deliveryStatus = DeliveryStatus.NOT_REQUIRED;
        }
    }

    public void requestDelivery(Instant now) {
        this.deliveryStatus = DeliveryStatus.PENDING;
        this.deliveryAttempts = 0;
        this.nextDeliveryAttemptAt = now;
        this.deliveryClaimedAt = null;
    }

    public void markDelivered(String explanationJson, String explanationSource, int deliveredRevision) {
        this.explanationJson = explanationJson;
        this.explanationSource = explanationSource;
        this.explanationRevision = deliveredRevision;
        this.deliveryStatus = DeliveryStatus.DELIVERED;
        this.deliveryClaimedAt = null;
        this.nextDeliveryAttemptAt = null;
    }

    public void markDeliveryNotRequired() {
        this.deliveryStatus = DeliveryStatus.NOT_REQUIRED;
        this.deliveryClaimedAt = null;
        this.nextDeliveryAttemptAt = null;
    }

    /** Records a failed attempt with exponential backoff (1, 2, 4, 8 … minutes) or gives up. */
    public void markDeliveryFailed(int maxAttempts, Instant now) {
        this.deliveryAttempts++;
        this.deliveryClaimedAt = null;
        if (deliveryAttempts >= maxAttempts) {
            this.deliveryStatus = DeliveryStatus.FAILED;
            this.nextDeliveryAttemptAt = null;
        } else {
            this.deliveryStatus = DeliveryStatus.PENDING;
            this.nextDeliveryAttemptAt = now.plus(Duration.ofMinutes(1L << (deliveryAttempts - 1)));
        }
    }

    public boolean isActive() {
        return status == AssessmentStatus.ACTIVE;
    }

    public UUID getId() {
        return id;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public UUID getTaskId() {
        return taskId;
    }

    public UUID getSubjectUserId() {
        return subjectUserId;
    }

    public RiskCategory getCategory() {
        return category;
    }

    public String getFingerprint() {
        return fingerprint;
    }

    public AssessmentStatus getStatus() {
        return status;
    }

    public Severity getSeverity() {
        return severity;
    }

    public int getScore() {
        return score;
    }

    public Confidence getConfidence() {
        return confidence;
    }

    public String getTitle() {
        return title;
    }

    public String getSummary() {
        return summary;
    }

    public String getFactorsJson() {
        return factorsJson;
    }

    public String getEvidenceJson() {
        return evidenceJson;
    }

    public String getAffectedTaskIdsJson() {
        return affectedTaskIdsJson;
    }

    public String getMissingDataJson() {
        return missingDataJson;
    }

    public String getContentHash() {
        return contentHash;
    }

    public int getRevision() {
        return revision;
    }

    public Instant getFirstDetectedAt() {
        return firstDetectedAt;
    }

    public Instant getLastEvaluatedAt() {
        return lastEvaluatedAt;
    }

    public Instant getLastChangedAt() {
        return lastChangedAt;
    }

    public Instant getResolvedAt() {
        return resolvedAt;
    }

    public ResolutionReason getResolutionReason() {
        return resolutionReason;
    }

    public int getReopenCount() {
        return reopenCount;
    }

    public long getAnalyzedDataVersion() {
        return analyzedDataVersion;
    }

    public String getExplanationJson() {
        return explanationJson;
    }

    public String getExplanationSource() {
        return explanationSource;
    }

    public Integer getExplanationRevision() {
        return explanationRevision;
    }

    public DeliveryStatus getDeliveryStatus() {
        return deliveryStatus;
    }

    public int getDeliveryAttempts() {
        return deliveryAttempts;
    }

    public Instant getDeliveryClaimedAt() {
        return deliveryClaimedAt;
    }

    public Instant getNextDeliveryAttemptAt() {
        return nextDeliveryAttemptAt;
    }
}
