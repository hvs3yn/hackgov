package com.foresight.task.application;

import com.foresight.common.error.ApiException;
import com.foresight.common.time.TimeProvider;
import com.foresight.identity.application.UserDirectory;
import com.foresight.identity.application.UserSummary;
import com.foresight.project.application.ProjectAccessService;
import com.foresight.project.application.ProjectAccessService.ProjectAccess;
import com.foresight.project.application.ProjectWriteGuard;
import com.foresight.project.domain.ProjectRole;
import com.foresight.project.domain.ProjectRole.Permission;
import com.foresight.task.application.TaskViews.ActivityView;
import com.foresight.task.application.TaskViews.TaskDetailView;
import com.foresight.task.application.TaskViews.TaskRef;
import com.foresight.task.application.TaskViews.TaskView;
import com.foresight.task.domain.Task;
import com.foresight.task.domain.TaskActivity;
import com.foresight.task.domain.TaskActivityRepository;
import com.foresight.task.domain.TaskActivityType;
import com.foresight.task.domain.TaskDependency;
import com.foresight.task.domain.TaskDependencyRepository;
import com.foresight.task.domain.TaskPriority;
import com.foresight.task.domain.TaskRepository;
import com.foresight.task.domain.TaskStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
public class TaskService {

    private final TaskRepository tasks;
    private final TaskDependencyRepository dependencies;
    private final TaskActivityRepository activities;
    private final ProjectAccessService access;
    private final ProjectWriteGuard writeGuard;
    private final UserDirectory userDirectory;
    private final TimeProvider time;

    public TaskService(TaskRepository tasks, TaskDependencyRepository dependencies, TaskActivityRepository activities,
                       ProjectAccessService access, ProjectWriteGuard writeGuard, UserDirectory userDirectory,
                       TimeProvider time) {
        this.tasks = tasks;
        this.dependencies = dependencies;
        this.activities = activities;
        this.access = access;
        this.writeGuard = writeGuard;
        this.userDirectory = userDirectory;
        this.time = time;
    }

    public record CreateCommand(String title, String description, TaskPriority priority, UUID assigneeId,
                                LocalDate startDate, LocalDate dueDate, BigDecimal estimatedHours) {
    }

    public record DetailsCommand(long version, String title, String description, TaskPriority priority,
                                 LocalDate startDate, LocalDate dueDate, BigDecimal estimatedHours,
                                 BigDecimal actualHours) {
    }

    // ---------------------------------------------------------------- queries

    @Transactional(readOnly = true)
    public Page<TaskView> list(UUID actorId, UUID projectId, TaskFilter filter, Pageable pageable) {
        access.require(projectId, actorId, Permission.VIEW);
        LocalDate today = time.today();
        Page<Task> page = tasks.findAll(filter.toSpecification(projectId, today), pageable);
        Map<UUID, UserSummary> users = usersOf(page.getContent());
        return page.map(t -> TaskView.of(t, users, today));
    }

    @Transactional(readOnly = true)
    public TaskDetailView get(UUID actorId, UUID taskId) {
        UUID projectId = projectIdOf(taskId);
        access.require(projectId, actorId, Permission.VIEW);
        Task task = requireTask(taskId);
        List<TaskRef> prerequisites = refs(dependencies.findBySuccessorTaskId(taskId).stream()
                .map(TaskDependency::getPredecessorTaskId).toList());
        List<TaskRef> dependents = refs(dependencies.findByPredecessorTaskId(taskId).stream()
                .map(TaskDependency::getSuccessorTaskId).toList());
        return new TaskDetailView(view(task), prerequisites, dependents);
    }

    @Transactional(readOnly = true)
    public Page<ActivityView> activity(UUID actorId, UUID taskId, Pageable pageable) {
        UUID projectId = projectIdOf(taskId);
        access.require(projectId, actorId, Permission.VIEW);
        Page<TaskActivity> page = activities.findByTaskId(taskId, pageable);
        Map<UUID, UserSummary> users = userDirectory.findAll(page.getContent().stream()
                .map(TaskActivity::getActorId).filter(Objects::nonNull).toList());
        return page.map(a -> ActivityView.of(a, users));
    }

    // ---------------------------------------------------------------- commands

    @Transactional
    public TaskView create(UUID actorId, UUID projectId, CreateCommand cmd) {
        ProjectAccess pa = access.require(projectId, actorId, Permission.CONTRIBUTE);
        pa.requireWritable();
        if (cmd.assigneeId() != null) {
            if (!pa.can(Permission.MANAGE) && !cmd.assigneeId().equals(actorId)) {
                throw ApiException.forbidden("Contributors can only assign tasks to themselves");
            }
            requireAssignable(projectId, cmd.assigneeId());
        }
        writeGuard.lockForWrite(projectId);
        Instant now = time.now();
        Task task = new Task(projectId, cmd.title(), cmd.description(), cmd.priority(), cmd.assigneeId(), actorId,
                cmd.startDate(), cmd.dueDate(), cmd.estimatedHours(), now);
        tasks.saveAndFlush(task);
        record(task, actorId, TaskActivityType.CREATED, null, task.getTitle(), now);
        if (task.getAssigneeId() != null) {
            record(task, actorId, TaskActivityType.ASSIGNEE_CHANGED, null, task.getAssigneeId(), now);
        }
        return view(task);
    }

    @Transactional
    public TaskView replaceDetails(UUID actorId, UUID taskId, DetailsCommand cmd) {
        Task task = loadForEdit(actorId, taskId);
        task.requireVersion(cmd.version());
        Instant now = time.now();
        TaskPriority oldPriority = task.getPriority();
        LocalDate oldDue = task.getDueDate();
        BigDecimal oldEstimate = task.getEstimatedHours();
        task.updateDetails(cmd.title(), cmd.description(), cmd.priority(), cmd.startDate(), cmd.dueDate(),
                cmd.estimatedHours(), cmd.actualHours(), now);
        record(task, actorId, TaskActivityType.DETAILS_UPDATED, null, null, now);
        if (oldPriority != task.getPriority()) {
            record(task, actorId, TaskActivityType.PRIORITY_CHANGED, oldPriority, task.getPriority(), now);
        }
        if (!Objects.equals(oldDue, task.getDueDate())) {
            record(task, actorId, TaskActivityType.DUE_DATE_CHANGED, oldDue, task.getDueDate(), now);
        }
        if (!sameAmount(oldEstimate, task.getEstimatedHours())) {
            record(task, actorId, TaskActivityType.ESTIMATE_CHANGED, oldEstimate, task.getEstimatedHours(), now);
        }
        tasks.flush();
        return view(task);
    }

    @Transactional
    public TaskView changeStatus(UUID actorId, UUID taskId, long version, TaskStatus target) {
        Task task = loadForEdit(actorId, taskId);
        task.requireVersion(version);
        if (target.requiresSatisfiedPrerequisites() && task.getStatus() != target) {
            List<String> unfinished = unfinishedPrerequisiteTitles(taskId);
            if (!unfinished.isEmpty()) {
                throw ApiException.conflict("DEPENDENCY_NOT_SATISFIED",
                        "Unfinished prerequisites: " + String.join(", ", unfinished));
            }
        }
        TaskStatus old = task.getStatus();
        Instant now = time.now();
        task.changeStatus(target, now);
        if (old != target) {
            record(task, actorId, TaskActivityType.STATUS_CHANGED, old, target, now);
        }
        tasks.flush();
        return view(task);
    }

    @Transactional
    public TaskView updateProgress(UUID actorId, UUID taskId, long version, int progress) {
        Task task = loadForEdit(actorId, taskId);
        task.requireVersion(version);
        int old = task.getProgressPercentage();
        Instant now = time.now();
        task.updateProgress(progress, now);
        record(task, actorId, TaskActivityType.PROGRESS_UPDATED, old, progress, now);
        tasks.flush();
        return view(task);
    }

    @Transactional
    public TaskView assign(UUID actorId, UUID taskId, long version, UUID assigneeId) {
        UUID projectId = projectIdOf(taskId);
        ProjectAccess pa = access.require(projectId, actorId, Permission.CONTRIBUTE);
        pa.requireWritable();
        writeGuard.lockForWrite(projectId);
        Task task = requireTask(taskId);
        task.requireVersion(version);
        if (!pa.can(Permission.MANAGE)) {
            boolean selfAssignUnassigned = task.getAssigneeId() == null && actorId.equals(assigneeId);
            boolean unassignSelf = actorId.equals(task.getAssigneeId()) && assigneeId == null;
            if (!selfAssignUnassigned && !unassignSelf) {
                throw ApiException.forbidden("Contributors may only take unassigned tasks or release their own");
            }
        }
        if (assigneeId != null) {
            requireAssignable(projectId, assigneeId);
        }
        UUID old = task.getAssigneeId();
        if (!Objects.equals(old, assigneeId)) {
            Instant now = time.now();
            task.assign(assigneeId, now);
            record(task, actorId, TaskActivityType.ASSIGNEE_CHANGED, old, assigneeId, now);
            tasks.flush();
        }
        return view(task);
    }

    @Transactional
    public void archive(UUID actorId, UUID taskId, long version) {
        UUID projectId = projectIdOf(taskId);
        ProjectAccess pa = access.require(projectId, actorId, Permission.CONTRIBUTE);
        pa.requireWritable();
        writeGuard.lockForWrite(projectId);
        Task task = requireTask(taskId);
        task.requireVersion(version);
        if (!pa.can(Permission.MANAGE) && !actorId.equals(task.getReporterId())) {
            throw ApiException.forbidden("Only a project lead or the task's reporter can archive it");
        }
        Instant now = time.now();
        dependencies.deleteAllTouching(taskId);
        task.archive(now);
        record(task, actorId, TaskActivityType.ARCHIVED, null, null, now);
        tasks.flush();
    }

    // ---------------------------------------------------------------- helpers

    /**
     * Loads a task for modification: authorizes (lead, or contributor who is assignee/reporter), checks the
     * project is writable and takes the project write lock.
     */
    Task loadForEdit(UUID actorId, UUID taskId) {
        UUID projectId = projectIdOf(taskId);
        ProjectAccess pa = access.require(projectId, actorId, Permission.CONTRIBUTE);
        pa.requireWritable();
        writeGuard.lockForWrite(projectId);
        Task task = requireTask(taskId);
        requireCanEdit(pa, task, actorId);
        return task;
    }

    static void requireCanEdit(ProjectAccess pa, Task task, UUID actorId) {
        if (pa.can(Permission.MANAGE)) {
            return;
        }
        if (!actorId.equals(task.getAssigneeId()) && !actorId.equals(task.getReporterId())) {
            throw ApiException.forbidden("Contributors can only modify tasks they are assigned to or reported");
        }
    }

    UUID projectIdOf(UUID taskId) {
        return tasks.findProjectIdOfActiveTask(taskId).orElseThrow(() -> ApiException.notFound("Task"));
    }

    Task requireTask(UUID taskId) {
        return tasks.findByIdAndArchivedAtIsNull(taskId).orElseThrow(() -> ApiException.notFound("Task"));
    }

    private void requireAssignable(UUID projectId, UUID assigneeId) {
        ProjectRole role = access.effectiveRole(projectId, assigneeId)
                .orElseThrow(() -> ApiException.badRequest("INVALID_ASSIGNEE", "Assignee is not a member of this project"));
        if (!role.allows(Permission.CONTRIBUTE)) {
            throw ApiException.badRequest("INVALID_ASSIGNEE", "Viewers cannot be assigned to tasks");
        }
    }

    private List<String> unfinishedPrerequisiteTitles(UUID taskId) {
        List<UUID> prerequisiteIds = dependencies.findBySuccessorTaskId(taskId).stream()
                .map(TaskDependency::getPredecessorTaskId).toList();
        if (prerequisiteIds.isEmpty()) {
            return List.of();
        }
        return tasks.findByIdInAndArchivedAtIsNull(prerequisiteIds).stream()
                .filter(t -> !t.getStatus().satisfiesDependents())
                .map(Task::getTitle)
                .sorted()
                .toList();
    }

    void record(Task task, UUID actorId, TaskActivityType type, Object oldValue, Object newValue, Instant now) {
        activities.save(new TaskActivity(task.getId(), task.getProjectId(), actorId, type, oldValue, newValue, now));
    }

    TaskView view(Task task) {
        return TaskView.of(task, usersOf(List.of(task)), time.today());
    }

    private List<TaskRef> refs(List<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        List<TaskRef> refs = new ArrayList<>(tasks.findByIdInAndArchivedAtIsNull(ids).stream().map(TaskRef::of).toList());
        refs.sort(Comparator.comparing(TaskRef::title));
        return refs;
    }

    private Map<UUID, UserSummary> usersOf(List<Task> list) {
        Set<UUID> ids = new HashSet<>();
        for (Task t : list) {
            if (t.getAssigneeId() != null) {
                ids.add(t.getAssigneeId());
            }
            ids.add(t.getReporterId());
        }
        return userDirectory.findAll(ids);
    }

    private static boolean sameAmount(BigDecimal a, BigDecimal b) {
        return a == null ? b == null : b != null && a.compareTo(b) == 0;
    }
}
