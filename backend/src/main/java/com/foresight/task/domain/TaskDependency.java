package com.foresight.task.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Finish-to-start dependency: {@code successor} cannot proceed until {@code predecessor} is finished.
 */
@Entity
@Table(name = "task_dependencies")
public class TaskDependency {

    public static final String FINISH_TO_START = "FINISH_TO_START";

    @Id
    private UUID id;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(name = "predecessor_task_id", nullable = false, updatable = false)
    private UUID predecessorTaskId;

    @Column(name = "successor_task_id", nullable = false, updatable = false)
    private UUID successorTaskId;

    @Column(nullable = false, length = 24, updatable = false)
    private String type;

    @Column(name = "created_by", updatable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected TaskDependency() {
    }

    public TaskDependency(UUID projectId, UUID predecessorTaskId, UUID successorTaskId, UUID createdBy, Instant now) {
        this.id = UUID.randomUUID();
        this.projectId = projectId;
        this.predecessorTaskId = predecessorTaskId;
        this.successorTaskId = successorTaskId;
        this.type = FINISH_TO_START;
        this.createdBy = createdBy;
        this.createdAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public UUID getPredecessorTaskId() {
        return predecessorTaskId;
    }

    public UUID getSuccessorTaskId() {
        return successorTaskId;
    }

    public String getType() {
        return type;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
