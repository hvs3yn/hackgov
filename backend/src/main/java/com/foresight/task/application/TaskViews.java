package com.foresight.task.application;

import com.foresight.identity.application.UserSummary;
import com.foresight.task.domain.Task;
import com.foresight.task.domain.TaskActivity;
import com.foresight.task.domain.TaskActivityType;
import com.foresight.task.domain.TaskDependency;
import com.foresight.task.domain.TaskPriority;
import com.foresight.task.domain.TaskStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class TaskViews {

    private TaskViews() {
    }

    public record UserRef(UUID id, String fullName) {
        static UserRef of(UUID id, Map<UUID, UserSummary> users) {
            if (id == null) {
                return null;
            }
            UserSummary user = users.get(id);
            return new UserRef(id, user == null ? null : user.fullName());
        }
    }

    public record TaskView(UUID id, UUID projectId, String title, String description, TaskStatus status,
                           TaskPriority priority, UserRef assignee, UserRef reporter, LocalDate startDate,
                           LocalDate dueDate, BigDecimal estimatedHours, BigDecimal actualHours,
                           int progressPercentage, boolean overdue, Instant lastProgressAt, Instant completedAt,
                           Instant createdAt, Instant updatedAt, long version) {
        static TaskView of(Task t, Map<UUID, UserSummary> users, LocalDate today) {
            return new TaskView(t.getId(), t.getProjectId(), t.getTitle(), t.getDescription(), t.getStatus(),
                    t.getPriority(), UserRef.of(t.getAssigneeId(), users), UserRef.of(t.getReporterId(), users),
                    t.getStartDate(), t.getDueDate(), t.getEstimatedHours(), t.getActualHours(),
                    t.getProgressPercentage(), t.isOverdue(today), t.getLastProgressAt(), t.getCompletedAt(),
                    t.getCreatedAt(), t.getUpdatedAt(), t.getVersion() == null ? 0 : t.getVersion());
        }
    }

    public record TaskRef(UUID id, String title, TaskStatus status, LocalDate dueDate, UUID assigneeId) {
        static TaskRef of(Task t) {
            return new TaskRef(t.getId(), t.getTitle(), t.getStatus(), t.getDueDate(), t.getAssigneeId());
        }
    }

    public record TaskDetailView(TaskView task, List<TaskRef> prerequisites, List<TaskRef> dependents) {
    }

    public record DependencyListView(List<TaskRef> prerequisites, List<TaskRef> dependents) {
    }

    public record DependencyView(UUID id, UUID prerequisiteTaskId, UUID dependentTaskId, String type,
                                 Instant createdAt) {
        static DependencyView of(TaskDependency d) {
            return new DependencyView(d.getId(), d.getPredecessorTaskId(), d.getSuccessorTaskId(), d.getType(),
                    d.getCreatedAt());
        }
    }

    public record ActivityView(UUID id, TaskActivityType type, UserRef actor, String oldValue, String newValue,
                               Instant occurredAt) {
        static ActivityView of(TaskActivity a, Map<UUID, UserSummary> users) {
            return new ActivityView(a.getId(), a.getType(), UserRef.of(a.getActorId(), users), a.getOldValue(),
                    a.getNewValue(), a.getOccurredAt());
        }
    }
}
