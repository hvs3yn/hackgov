package com.foresight.project.domain;

import com.foresight.common.error.ApiException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "projects")
public class Project {

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false, updatable = false)
    private UUID workspaceId;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(columnDefinition = "text")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ProjectStatus status;

    @Column(name = "start_date")
    private LocalDate startDate;

    private LocalDate deadline;

    @Column(name = "created_by", nullable = false, updatable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "archived_at")
    private Instant archivedAt;

    @Version
    private Long version;

    /** Maintained exclusively by bulk updates ({@link ProjectRepository#incrementDataVersion}). */
    @Column(name = "data_version", nullable = false, updatable = false)
    private long dataVersion;

    @Column(name = "last_analyzed_at", insertable = false, updatable = false)
    private Instant lastAnalyzedAt;

    @Column(name = "last_analyzed_data_version", insertable = false, updatable = false)
    private Long lastAnalyzedDataVersion;

    protected Project() {
    }

    public Project(UUID workspaceId, String name, String description, LocalDate startDate, LocalDate deadline,
                   UUID createdBy, Instant now) {
        validateDates(startDate, deadline);
        this.id = UUID.randomUUID();
        this.workspaceId = workspaceId;
        this.name = name.trim();
        this.description = description;
        this.status = ProjectStatus.ACTIVE;
        this.startDate = startDate;
        this.deadline = deadline;
        this.createdBy = createdBy;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void updateDetails(String name, String description, LocalDate startDate, LocalDate deadline, Instant now) {
        validateDates(startDate, deadline);
        this.name = name.trim();
        this.description = description;
        this.startDate = startDate;
        this.deadline = deadline;
        this.updatedAt = now;
    }

    public void changeStatus(ProjectStatus target, Instant now) {
        if (target == status) {
            return;
        }
        if (!status.canTransitionTo(target)) {
            throw ApiException.conflict("INVALID_STATUS_TRANSITION",
                    "Project cannot change from " + status + " to " + target);
        }
        this.status = target;
        this.archivedAt = target == ProjectStatus.ARCHIVED ? now : null;
        this.updatedAt = now;
    }

    public void requireVersion(long expected) {
        if (version == null || version != expected) {
            throw ApiException.versionConflict("Project");
        }
    }

    private static void validateDates(LocalDate startDate, LocalDate deadline) {
        if (startDate != null && deadline != null && deadline.isBefore(startDate)) {
            throw ApiException.badRequest("INVALID_ARGUMENT", "deadline must not be before startDate");
        }
    }

    public UUID getId() {
        return id;
    }

    public UUID getWorkspaceId() {
        return workspaceId;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public ProjectStatus getStatus() {
        return status;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public LocalDate getDeadline() {
        return deadline;
    }

    public UUID getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Instant getArchivedAt() {
        return archivedAt;
    }

    public Long getVersion() {
        return version;
    }

    public long getDataVersion() {
        return dataVersion;
    }

    public Instant getLastAnalyzedAt() {
        return lastAnalyzedAt;
    }

    public Long getLastAnalyzedDataVersion() {
        return lastAnalyzedDataVersion;
    }
}
