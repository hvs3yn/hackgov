package com.foresight.task.api;

import com.foresight.common.api.PageRequests;
import com.foresight.common.api.PageResponse;
import com.foresight.common.security.CurrentUser;
import com.foresight.task.application.DependencyService;
import com.foresight.task.application.TaskFilter;
import com.foresight.task.application.TaskService;
import com.foresight.task.application.TaskService.CreateCommand;
import com.foresight.task.application.TaskService.DetailsCommand;
import com.foresight.task.application.TaskViews.ActivityView;
import com.foresight.task.application.TaskViews.DependencyListView;
import com.foresight.task.application.TaskViews.DependencyView;
import com.foresight.task.application.TaskViews.TaskDetailView;
import com.foresight.task.application.TaskViews.TaskView;
import com.foresight.task.domain.TaskPriority;
import com.foresight.task.domain.TaskStatus;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Tasks")
public class TaskController {

    private static final Map<String, String> TASK_SORTS = Map.of(
            "dueDate", "dueDate", "priority", "priority", "createdAt", "createdAt",
            "updatedAt", "updatedAt", "title", "title", "status", "status");
    private static final Map<String, String> ACTIVITY_SORTS = Map.of("occurredAt", "occurredAt");
    private static final Map<String, String> DEPENDENCY_SORTS = Map.of("createdAt", "createdAt");

    private final TaskService tasks;
    private final DependencyService dependencies;

    public TaskController(TaskService tasks, DependencyService dependencies) {
        this.tasks = tasks;
        this.dependencies = dependencies;
    }

    public record CreateTaskRequest(@NotBlank @Size(max = 200) String title,
                                    @Size(max = 10000) String description,
                                    TaskPriority priority,
                                    UUID assigneeId,
                                    LocalDate startDate,
                                    LocalDate dueDate,
                                    @DecimalMin("0") @DecimalMax("10000") @Digits(integer = 5, fraction = 2) BigDecimal estimatedHours) {
    }

    public record ReplaceTaskRequest(@NotNull Long version,
                                     @NotBlank @Size(max = 200) String title,
                                     @Size(max = 10000) String description,
                                     TaskPriority priority,
                                     LocalDate startDate,
                                     LocalDate dueDate,
                                     @DecimalMin("0") @DecimalMax("10000") @Digits(integer = 5, fraction = 2) BigDecimal estimatedHours,
                                     @DecimalMin("0") @DecimalMax("10000") @Digits(integer = 5, fraction = 2) BigDecimal actualHours) {
    }

    public record StatusRequest(@NotNull Long version, @NotNull TaskStatus status) {
    }

    public record ProgressRequest(@NotNull Long version, @NotNull @Min(0) @Max(100) Integer progressPercentage) {
    }

    public record AssigneeRequest(@NotNull Long version, UUID assigneeId) {
    }

    public record AddDependencyRequest(@NotNull UUID prerequisiteTaskId) {
    }

    @PostMapping("/projects/{projectId}/tasks")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a task (LEAD, CONTRIBUTOR)")
    public TaskView create(@PathVariable UUID projectId, @Valid @RequestBody CreateTaskRequest r) {
        return tasks.create(CurrentUser.id(), projectId, new CreateCommand(r.title(), r.description(), r.priority(),
                r.assigneeId(), r.startDate(), r.dueDate(), r.estimatedHours()));
    }

    @GetMapping("/projects/{projectId}/tasks")
    @Operation(summary = "List tasks with filters, sorting and pagination")
    public PageResponse<TaskView> list(
            @PathVariable UUID projectId,
            @RequestParam(required = false) List<TaskStatus> status,
            @RequestParam(required = false) List<TaskPriority> priority,
            @RequestParam(required = false) UUID assigneeId,
            @RequestParam(required = false) Boolean unassigned,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dueFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dueTo,
            @RequestParam(required = false) Boolean overdue,
            @RequestParam(required = false) @Size(max = 200) String q,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) List<String> sort) {
        var pageable = PageRequests.of(page, size, sort, TASK_SORTS, Sort.by("createdAt").descending());
        var filter = new TaskFilter(status, priority, assigneeId, unassigned, dueFrom, dueTo, overdue, q);
        return PageResponse.of(tasks.list(CurrentUser.id(), projectId, filter, pageable), v -> v);
    }

    @GetMapping("/tasks/{taskId}")
    @Operation(summary = "Task with its prerequisites and dependents")
    public TaskDetailView get(@PathVariable UUID taskId) {
        return tasks.get(CurrentUser.id(), taskId);
    }

    @PutMapping("/tasks/{taskId}")
    @Operation(summary = "Replace editable task details (null clears optional fields)")
    public TaskView replace(@PathVariable UUID taskId, @Valid @RequestBody ReplaceTaskRequest r) {
        return tasks.replaceDetails(CurrentUser.id(), taskId, new DetailsCommand(r.version(), r.title(),
                r.description(), r.priority(), r.startDate(), r.dueDate(), r.estimatedHours(), r.actualHours()));
    }

    @PostMapping("/tasks/{taskId}/status")
    @Operation(summary = "Change status following the task lifecycle and dependency rules")
    public TaskView changeStatus(@PathVariable UUID taskId, @Valid @RequestBody StatusRequest r) {
        return tasks.changeStatus(CurrentUser.id(), taskId, r.version(), r.status());
    }

    @PostMapping("/tasks/{taskId}/progress")
    @Operation(summary = "Report progress (0-100)")
    public TaskView progress(@PathVariable UUID taskId, @Valid @RequestBody ProgressRequest r) {
        return tasks.updateProgress(CurrentUser.id(), taskId, r.version(), r.progressPercentage());
    }

    @PutMapping("/tasks/{taskId}/assignee")
    @Operation(summary = "Assign, reassign or unassign (assigneeId null)")
    public TaskView assign(@PathVariable UUID taskId, @Valid @RequestBody AssigneeRequest r) {
        return tasks.assign(CurrentUser.id(), taskId, r.version(), r.assigneeId());
    }

    @DeleteMapping("/tasks/{taskId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Archive a task (removes its dependencies)")
    public void archive(@PathVariable UUID taskId, @RequestParam long version) {
        tasks.archive(CurrentUser.id(), taskId, version);
    }

    @GetMapping("/tasks/{taskId}/activity")
    @Operation(summary = "Task history, newest first")
    public PageResponse<ActivityView> activity(@PathVariable UUID taskId,
                                               @RequestParam(required = false) Integer page,
                                               @RequestParam(required = false) Integer size,
                                               @RequestParam(required = false) List<String> sort) {
        var pageable = PageRequests.of(page, size, sort, ACTIVITY_SORTS, Sort.by("occurredAt").descending());
        return PageResponse.of(tasks.activity(CurrentUser.id(), taskId, pageable), v -> v);
    }

    @GetMapping("/tasks/{taskId}/dependencies")
    public DependencyListView dependencies(@PathVariable UUID taskId) {
        return dependencies.forTask(CurrentUser.id(), taskId);
    }

    @PostMapping("/tasks/{taskId}/dependencies")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Make this task depend on a prerequisite (finish-to-start)")
    public DependencyView addDependency(@PathVariable UUID taskId, @Valid @RequestBody AddDependencyRequest r) {
        return dependencies.add(CurrentUser.id(), taskId, r.prerequisiteTaskId());
    }

    @DeleteMapping("/tasks/{taskId}/dependencies/{prerequisiteTaskId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeDependency(@PathVariable UUID taskId, @PathVariable UUID prerequisiteTaskId) {
        dependencies.remove(CurrentUser.id(), taskId, prerequisiteTaskId);
    }

    @GetMapping("/projects/{projectId}/dependencies")
    @Operation(summary = "All dependency edges of a project")
    public PageResponse<DependencyView> projectDependencies(@PathVariable UUID projectId,
                                                            @RequestParam(required = false) Integer page,
                                                            @RequestParam(required = false) Integer size,
                                                            @RequestParam(required = false) List<String> sort) {
        var pageable = PageRequests.of(page, size, sort, DEPENDENCY_SORTS, Sort.by("createdAt"));
        return PageResponse.of(dependencies.forProject(CurrentUser.id(), projectId, pageable), v -> v);
    }
}
