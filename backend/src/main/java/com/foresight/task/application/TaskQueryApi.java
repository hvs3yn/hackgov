package com.foresight.task.application;

import com.foresight.task.domain.Task;
import com.foresight.task.domain.TaskDependency;
import com.foresight.task.domain.TaskDependencyRepository;
import com.foresight.task.domain.TaskPriority;
import com.foresight.task.domain.TaskRepository;
import com.foresight.task.domain.TaskStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Read API of the task module for risk analysis and inbox rendering. Returns immutable data only.
 */
@Service
@Transactional(readOnly = true)
public class TaskQueryApi {

    private final TaskRepository tasks;
    private final TaskDependencyRepository dependencies;

    public TaskQueryApi(TaskRepository tasks, TaskDependencyRepository dependencies) {
        this.tasks = tasks;
        this.dependencies = dependencies;
    }

    public record TaskData(UUID id, String title, TaskStatus status, TaskPriority priority, UUID assigneeId,
                           LocalDate startDate, LocalDate dueDate, BigDecimal estimatedHours, int progressPercentage,
                           Instant createdAt, Instant lastProgressAt, boolean progressReported) {
    }

    public record EdgeData(UUID predecessorId, UUID successorId) {
    }

    /** All non-archived tasks of a project (bounded by project size). */
    public List<TaskData> activeTasks(UUID projectId) {
        Set<UUID> reported = new HashSet<>(tasks.findTaskIdsWithProgressReports(projectId));
        return tasks.findByProjectIdAndArchivedAtIsNull(projectId).stream()
                .map(t -> new TaskData(t.getId(), t.getTitle(), t.getStatus(), t.getPriority(), t.getAssigneeId(),
                        t.getStartDate(), t.getDueDate(), t.getEstimatedHours(), t.getProgressPercentage(),
                        t.getCreatedAt(), t.getLastProgressAt(), reported.contains(t.getId())))
                .toList();
    }

    /** Tasks by id (archived ones included, so historical assessments can still be explained). */
    public List<TaskData> byIds(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return tasks.findAllById(ids.stream().distinct().toList()).stream()
                .map(t -> new TaskData(t.getId(), t.getTitle(), t.getStatus(), t.getPriority(), t.getAssigneeId(),
                        t.getStartDate(), t.getDueDate(), t.getEstimatedHours(), t.getProgressPercentage(),
                        t.getCreatedAt(), t.getLastProgressAt(), false))
                .toList();
    }

    public List<EdgeData> edges(UUID projectId) {
        return dependencies.findByProjectId(projectId).stream()
                .map(d -> new EdgeData(d.getPredecessorTaskId(), d.getSuccessorTaskId()))
                .toList();
    }

    public Map<UUID, String> titles(Collection<UUID> taskIds) {
        if (taskIds.isEmpty()) {
            return Map.of();
        }
        return tasks.findAllById(taskIds.stream().distinct().toList()).stream()
                .collect(Collectors.toMap(Task::getId, Task::getTitle));
    }

    /** Assignees of the direct dependents / prerequisites of a task (for notification fan-out). */
    public Set<UUID> assigneesOfDependents(UUID taskId) {
        return assigneesOf(dependencies.findByPredecessorTaskId(taskId).stream()
                .map(TaskDependency::getSuccessorTaskId).toList());
    }

    public Set<UUID> assigneesOf(Collection<UUID> taskIds) {
        if (taskIds.isEmpty()) {
            return Set.of();
        }
        return tasks.findByIdInAndArchivedAtIsNull(taskIds).stream()
                .filter(t -> !t.getStatus().isClosed())
                .map(Task::getAssigneeId)
                .filter(id -> id != null)
                .collect(Collectors.toSet());
    }

    public java.util.Optional<UUID> projectIdOfActiveTask(UUID taskId) {
        return tasks.findProjectIdOfActiveTask(taskId);
    }

    public UUID assigneeOf(UUID taskId) {
        return tasks.findById(taskId).map(Task::getAssigneeId).orElse(null);
    }
}
