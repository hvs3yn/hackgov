package com.foresight.task.application;

import com.foresight.common.error.ApiException;
import com.foresight.common.error.ConstraintViolations;
import com.foresight.common.time.TimeProvider;
import com.foresight.project.application.ProjectAccessService;
import com.foresight.project.application.ProjectAccessService.ProjectAccess;
import com.foresight.project.application.ProjectWriteGuard;
import com.foresight.project.domain.ProjectRole.Permission;
import com.foresight.task.application.TaskViews.DependencyListView;
import com.foresight.task.application.TaskViews.DependencyView;
import com.foresight.task.application.TaskViews.TaskRef;
import com.foresight.task.domain.DependencyGraph;
import com.foresight.task.domain.Task;
import com.foresight.task.domain.TaskActivityType;
import com.foresight.task.domain.TaskDependency;
import com.foresight.task.domain.TaskDependencyRepository;
import com.foresight.task.domain.TaskRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Finish-to-start dependency management. Cycle checks run under the project write lock taken by
 * {@link ProjectWriteGuard}, so two concurrent inserts (A→B, B→A) cannot both succeed.
 */
@Service
public class DependencyService {

    private final TaskRepository tasks;
    private final TaskDependencyRepository dependencies;
    private final ProjectAccessService access;
    private final ProjectWriteGuard writeGuard;
    private final TaskService taskService;
    private final TimeProvider time;

    public DependencyService(TaskRepository tasks, TaskDependencyRepository dependencies, ProjectAccessService access,
                             ProjectWriteGuard writeGuard, TaskService taskService, TimeProvider time) {
        this.tasks = tasks;
        this.dependencies = dependencies;
        this.access = access;
        this.writeGuard = writeGuard;
        this.taskService = taskService;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public DependencyListView forTask(UUID actorId, UUID taskId) {
        UUID projectId = taskService.projectIdOf(taskId);
        access.require(projectId, actorId, Permission.VIEW);
        List<UUID> prereqIds = dependencies.findBySuccessorTaskId(taskId).stream()
                .map(TaskDependency::getPredecessorTaskId).toList();
        List<UUID> dependentIds = dependencies.findByPredecessorTaskId(taskId).stream()
                .map(TaskDependency::getSuccessorTaskId).toList();
        return new DependencyListView(refs(prereqIds), refs(dependentIds));
    }

    @Transactional(readOnly = true)
    public Page<DependencyView> forProject(UUID actorId, UUID projectId, Pageable pageable) {
        access.require(projectId, actorId, Permission.VIEW);
        return dependencies.findByProjectId(projectId, pageable).map(DependencyView::of);
    }

    @Transactional
    public DependencyView add(UUID actorId, UUID dependentTaskId, UUID prerequisiteTaskId) {
        if (dependentTaskId.equals(prerequisiteTaskId)) {
            throw ApiException.badRequest("INVALID_DEPENDENCY", "A task cannot depend on itself");
        }
        Task dependent = taskService.loadForEdit(actorId, dependentTaskId);
        Task prerequisite = tasks.findByIdAndArchivedAtIsNull(prerequisiteTaskId)
                .filter(t -> t.getProjectId().equals(dependent.getProjectId()))
                .orElseThrow(() -> ApiException.badRequest("INVALID_DEPENDENCY",
                        "Prerequisite task must exist in the same project"));
        if (dependencies.findByPredecessorTaskIdAndSuccessorTaskId(prerequisiteTaskId, dependentTaskId).isPresent()) {
            throw ApiException.conflict("DEPENDENCY_EXISTS", "This dependency already exists");
        }
        // Graph is read after the project lock was taken, so it reflects all committed edges.
        DependencyGraph graph = new DependencyGraph(dependencies.findByProjectId(dependent.getProjectId()));
        graph.cycleIfAdded(prerequisiteTaskId, dependentTaskId).ifPresent(cycle -> {
            throw ApiException.conflict("DEPENDENCY_CYCLE", "Dependency would create a cycle: " + describe(cycle));
        });
        Instant now = time.now();
        TaskDependency dependency = new TaskDependency(dependent.getProjectId(), prerequisiteTaskId, dependentTaskId,
                actorId, now);
        try {
            dependencies.saveAndFlush(dependency);
        } catch (DataIntegrityViolationException e) {
            if (!ConstraintViolations.isViolationOf(e, "uk_task_dependency")) {
                throw e;
            }
            throw ApiException.conflict("DEPENDENCY_EXISTS", "This dependency already exists");
        }
        taskService.record(dependent, actorId, TaskActivityType.DEPENDENCY_ADDED, null, prerequisite.getTitle(), now);
        return DependencyView.of(dependency);
    }

    @Transactional
    public void remove(UUID actorId, UUID dependentTaskId, UUID prerequisiteTaskId) {
        Task dependent = taskService.loadForEdit(actorId, dependentTaskId);
        TaskDependency dependency = dependencies
                .findByPredecessorTaskIdAndSuccessorTaskId(prerequisiteTaskId, dependentTaskId)
                .orElseThrow(() -> ApiException.notFound("Dependency"));
        dependencies.delete(dependency);
        String prerequisiteTitle = tasks.findById(prerequisiteTaskId).map(Task::getTitle).orElse(null);
        taskService.record(dependent, actorId, TaskActivityType.DEPENDENCY_REMOVED, prerequisiteTitle, null, time.now());
    }

    private String describe(List<UUID> cycle) {
        Map<UUID, String> titles = tasks.findAllById(cycle.stream().distinct().toList()).stream()
                .collect(Collectors.toMap(Task::getId, Task::getTitle));
        return cycle.stream().map(id -> "'" + titles.getOrDefault(id, id.toString()) + "'")
                .collect(Collectors.joining(" -> "));
    }

    private List<TaskRef> refs(List<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return tasks.findByIdInAndArchivedAtIsNull(ids).stream()
                .map(TaskRef::of)
                .sorted(Comparator.comparing(TaskRef::title))
                .toList();
    }
}
