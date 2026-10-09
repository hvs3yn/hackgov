package com.foresight.inbox.domain;

import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.Severity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * One AI Inbox entry per (assessment, recipient). Notification state (read, disposition) is independent of the
 * risk's own status, which is read live from the assessment.
 */
@Entity
@Table(name = "inbox_items")
public class InboxItem {

    public enum Disposition {OPEN, ACKNOWLEDGED, DISMISSED}

    @Id
    private UUID id;

    @Column(name = "recipient_id", nullable = false, updatable = false)
    private UUID recipientId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(name = "task_id", updatable = false)
    private UUID taskId;

    @Column(name = "assessment_id", nullable = false, updatable = false)
    private UUID assessmentId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private RiskCategory category;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Severity severity;

    @Column(nullable = false, length = 300)
    private String title;

    @Column(name = "explanation_json", nullable = false, columnDefinition = "text")
    private String explanationJson;

    @Column(name = "actions_json", nullable = false, columnDefinition = "text")
    private String actionsJson;

    @Column(name = "assessment_revision", nullable = false)
    private int assessmentRevision;

    @Column(name = "read_at")
    private Instant readAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Disposition disposition;

    @Column(name = "disposition_at")
    private Instant dispositionAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "last_delivered_at", nullable = false)
    private Instant lastDeliveredAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private Long version;

    protected InboxItem() {
    }

    public InboxItem(UUID recipientId, UUID projectId, UUID taskId, UUID assessmentId, Instant now) {
        this.id = UUID.randomUUID();
        this.recipientId = recipientId;
        this.projectId = projectId;
        this.taskId = taskId;
        this.assessmentId = assessmentId;
        this.createdAt = now;
        this.disposition = Disposition.OPEN;
    }

    /**
     * Delivers (or re-delivers) a revision: refreshes content and resurfaces the item as unread and open.
     * Returns false if this revision (or a newer one) was already delivered – idempotent.
     */
    public boolean deliver(RiskCategory category, Severity severity, String title, String explanationJson,
                           String actionsJson, int revision, Instant now) {
        if (lastDeliveredAt != null && revision <= assessmentRevision) {
            return false;
        }
        this.category = category;
        this.severity = severity;
        this.title = title.length() > 300 ? title.substring(0, 300) : title;
        this.explanationJson = explanationJson;
        this.actionsJson = actionsJson;
        this.assessmentRevision = revision;
        this.readAt = null;
        this.disposition = Disposition.OPEN;
        this.dispositionAt = null;
        this.lastDeliveredAt = now;
        this.updatedAt = now;
        return true;
    }

    public void markRead(Instant now) {
        if (readAt == null) {
            readAt = now;
            updatedAt = now;
        }
    }

    public void markUnread(Instant now) {
        readAt = null;
        updatedAt = now;
    }

    public void dispose(Disposition target, Instant now) {
        this.disposition = target;
        this.dispositionAt = now;
        if (readAt == null) {
            readAt = now;
        }
        this.updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getRecipientId() {
        return recipientId;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public UUID getTaskId() {
        return taskId;
    }

    public UUID getAssessmentId() {
        return assessmentId;
    }

    public RiskCategory getCategory() {
        return category;
    }

    public Severity getSeverity() {
        return severity;
    }

    public String getTitle() {
        return title;
    }

    public String getExplanationJson() {
        return explanationJson;
    }

    public String getActionsJson() {
        return actionsJson;
    }

    public int getAssessmentRevision() {
        return assessmentRevision;
    }

    public Instant getReadAt() {
        return readAt;
    }

    public Disposition getDisposition() {
        return disposition;
    }

    public Instant getDispositionAt() {
        return dispositionAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getLastDeliveredAt() {
        return lastDeliveredAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
