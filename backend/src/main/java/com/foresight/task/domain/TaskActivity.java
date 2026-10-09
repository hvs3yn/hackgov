package com.foresight.task.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** Append-only audit entry for a task. */
@Entity
@Table(name = "task_activities")
public class TaskActivity {

    private static final int MAX_VALUE = 500;

    @Id
    private UUID id;

    @Column(name = "task_id", nullable = false, updatable = false)
    private UUID taskId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(name = "actor_id", updatable = false)
    private UUID actorId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40, updatable = false)
    private TaskActivityType type;

    @Column(name = "old_value", length = 500, updatable = false)
    private String oldValue;

    @Column(name = "new_value", length = 500, updatable = false)
    private String newValue;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    protected TaskActivity() {
    }

    public TaskActivity(UUID taskId, UUID projectId, UUID actorId, TaskActivityType type, Object oldValue,
                        Object newValue, Instant occurredAt) {
        this.id = UUID.randomUUID();
        this.taskId = taskId;
        this.projectId = projectId;
        this.actorId = actorId;
        this.type = type;
        this.oldValue = truncate(oldValue);
        this.newValue = truncate(newValue);
        this.occurredAt = occurredAt;
    }

    private static String truncate(Object value) {
        if (value == null) {
            return null;
        }
        String s = value.toString();
        return s.length() <= MAX_VALUE ? s : s.substring(0, MAX_VALUE);
    }

    public UUID getId() {
        return id;
    }

    public UUID getTaskId() {
        return taskId;
    }

    public UUID getActorId() {
        return actorId;
    }

    public TaskActivityType getType() {
        return type;
    }

    public String getOldValue() {
        return oldValue;
    }

    public String getNewValue() {
        return newValue;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }
}
