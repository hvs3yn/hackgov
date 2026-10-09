package com.foresight.task.domain;

import com.foresight.common.error.ApiException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "tasks")
public class Task {

    public static final BigDecimal MAX_HOURS = new BigDecimal("10000");

    @Id
    private UUID id;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(columnDefinition = "text")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private TaskStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private TaskPriority priority;

    @Column(name = "assignee_id")
    private UUID assigneeId;

    @Column(name = "reporter_id", nullable = false, updatable = false)
    private UUID reporterId;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "estimated_hours", precision = 7, scale = 2)
    private BigDecimal estimatedHours;

    @Column(name = "actual_hours", precision = 7, scale = 2)
    private BigDecimal actualHours;

    @Column(name = "progress_percentage", nullable = false)
    private int progressPercentage;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "last_progress_at")
    private Instant lastProgressAt;

    @Column(name = "archived_at")
    private Instant archivedAt;

    @Version
    private Long version;

    protected Task() {
    }

    public Task(UUID projectId, String title, String description, TaskPriority priority, UUID assigneeId,
                UUID reporterId, LocalDate startDate, LocalDate dueDate, BigDecimal estimatedHours, Instant now) {
        this.id = UUID.randomUUID();
        this.projectId = projectId;
        this.status = TaskStatus.TODO;
        this.priority = priority == null ? TaskPriority.MEDIUM : priority;
        this.assigneeId = assigneeId;
        this.reporterId = reporterId;
        this.progressPercentage = 0;
        this.createdAt = now;
        this.updatedAt = now;
        applyDetails(title, description, this.priority, startDate, dueDate, estimatedHours, null);
    }

    public void updateDetails(String title, String description, TaskPriority priority, LocalDate startDate,
                              LocalDate dueDate, BigDecimal estimatedHours, BigDecimal actualHours, Instant now) {
        applyDetails(title, description, priority == null ? TaskPriority.MEDIUM : priority, startDate, dueDate,
                estimatedHours, actualHours);
        this.updatedAt = now;
    }

    private void applyDetails(String title, String description, TaskPriority priority, LocalDate startDate,
                              LocalDate dueDate, BigDecimal estimatedHours, BigDecimal actualHours) {
        if (title == null || title.isBlank()) {
            throw ApiException.badRequest("INVALID_ARGUMENT", "title must not be blank");
        }
        if (startDate != null && dueDate != null && dueDate.isBefore(startDate)) {
            throw ApiException.badRequest("INVALID_ARGUMENT", "dueDate must not be before startDate");
        }
        validateHours("estimatedHours", estimatedHours);
        validateHours("actualHours", actualHours);
        this.title = title.trim();
        this.description = description;
        this.priority = priority;
        this.startDate = startDate;
        this.dueDate = dueDate;
        this.estimatedHours = estimatedHours;
        this.actualHours = actualHours;
    }

    private static void validateHours(String field, BigDecimal hours) {
        if (hours != null && (hours.signum() < 0 || hours.compareTo(MAX_HOURS) > 0)) {
            throw ApiException.badRequest("INVALID_ARGUMENT", field + " must be between 0 and " + MAX_HOURS);
        }
        // The column is numeric(7,2): reject extra precision instead of letting the database round silently.
        if (hours != null && hours.stripTrailingZeros().scale() > 2) {
            throw ApiException.badRequest("INVALID_ARGUMENT", field + " must have at most 2 decimal places");
        }
    }

    /**
     * Applies a lifecycle transition. Prerequisite checks are done by the service, which has the graph.
     */
    public void changeStatus(TaskStatus target, Instant now) {
        if (target == status) {
            return;
        }
        if (!status.canTransitionTo(target)) {
            throw ApiException.conflict("INVALID_STATUS_TRANSITION",
                    "Task cannot change from " + status + " to " + target);
        }
        this.status = target;
        if (target == TaskStatus.DONE) {
            this.completedAt = now;
            this.progressPercentage = 100;
        } else {
            this.completedAt = null;
        }
        if (target.countsAsProgress()) {
            this.lastProgressAt = now;
        }
        this.updatedAt = now;
    }

    public void updateProgress(int percentage, Instant now) {
        if (status.isClosed()) {
            throw ApiException.conflict("INVALID_STATUS_TRANSITION", "Progress cannot change on a " + status + " task");
        }
        if (percentage < 0 || percentage > 100) {
            throw ApiException.badRequest("INVALID_ARGUMENT", "progressPercentage must be between 0 and 100");
        }
        if (percentage > progressPercentage) {
            this.lastProgressAt = now;
        }
        this.progressPercentage = percentage;
        this.updatedAt = now;
    }

    public void assign(UUID newAssignee, Instant now) {
        this.assigneeId = newAssignee;
        this.updatedAt = now;
    }

    public void archive(Instant now) {
        this.archivedAt = now;
        this.updatedAt = now;
    }

    public void requireVersion(long expected) {
        if (version == null || version != expected) {
            throw ApiException.versionConflict("Task");
        }
    }

    public boolean isArchived() {
        return archivedAt != null;
    }

    public boolean isOverdue(LocalDate today) {
        return !status.isClosed() && dueDate != null && dueDate.isBefore(today);
    }

    public UUID getId() {
        return id;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public TaskStatus getStatus() {
        return status;
    }

    public TaskPriority getPriority() {
        return priority;
    }

    public UUID getAssigneeId() {
        return assigneeId;
    }

    public UUID getReporterId() {
        return reporterId;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public BigDecimal getEstimatedHours() {
        return estimatedHours;
    }

    public BigDecimal getActualHours() {
        return actualHours;
    }

    public int getProgressPercentage() {
        return progressPercentage;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public Instant getLastProgressAt() {
        return lastProgressAt;
    }

    public Instant getArchivedAt() {
        return archivedAt;
    }

    public Long getVersion() {
        return version;
    }
}
