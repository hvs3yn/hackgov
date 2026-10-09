package com.foresight.project.api;

import com.foresight.common.api.PageRequests;
import com.foresight.common.api.PageResponse;
import com.foresight.common.security.CurrentUser;
import com.foresight.project.application.ProjectService;
import com.foresight.project.application.ProjectService.CreateCommand;
import com.foresight.project.application.ProjectService.MemberView;
import com.foresight.project.application.ProjectService.ProjectView;
import com.foresight.project.application.ProjectService.UpdateCommand;
import com.foresight.project.domain.ProjectRole;
import com.foresight.project.domain.ProjectStatus;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Projects")
public class ProjectController {

    private static final Map<String, String> PROJECT_SORTS =
            Map.of("name", "name", "createdAt", "createdAt", "deadline", "deadline");
    private static final Map<String, String> MEMBER_SORTS = Map.of("createdAt", "createdAt", "role", "role");

    private final ProjectService service;

    public ProjectController(ProjectService service) {
        this.service = service;
    }

    public record CreateProjectRequest(@NotBlank @Size(max = 160) String name,
                                       @Size(max = 5000) String description,
                                       LocalDate startDate, LocalDate deadline) {
    }

    public record UpdateProjectRequest(@NotNull Long version,
                                       @Size(min = 1, max = 160) String name,
                                       @Size(max = 5000) String description,
                                       LocalDate startDate, LocalDate deadline,
                                       Boolean clearStartDate, Boolean clearDeadline,
                                       ProjectStatus status) {
    }

    public record AddProjectMemberRequest(@NotNull UUID userId, @NotNull ProjectRole role) {
    }

    public record ChangeProjectRoleRequest(@NotNull ProjectRole role) {
    }

    @PostMapping("/workspaces/{workspaceId}/projects")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a project in a workspace (caller becomes LEAD)")
    public ProjectView create(@PathVariable UUID workspaceId, @Valid @RequestBody CreateProjectRequest request) {
        return service.create(CurrentUser.id(), workspaceId,
                new CreateCommand(request.name(), request.description(), request.startDate(), request.deadline()));
    }

    @GetMapping("/workspaces/{workspaceId}/projects")
    @Operation(summary = "List projects of a workspace visible to the caller")
    public PageResponse<ProjectView> list(@PathVariable UUID workspaceId,
                                          @RequestParam(required = false) ProjectStatus status,
                                          @RequestParam(required = false) Integer page,
                                          @RequestParam(required = false) Integer size,
                                          @RequestParam(required = false) List<String> sort) {
        var pageable = PageRequests.of(page, size, sort, PROJECT_SORTS, Sort.by("createdAt").descending());
        return PageResponse.of(service.list(CurrentUser.id(), workspaceId, status, pageable), v -> v);
    }

    @GetMapping("/projects/{projectId}")
    public ProjectView get(@PathVariable UUID projectId) {
        return service.get(CurrentUser.id(), projectId);
    }

    @PatchMapping("/projects/{projectId}")
    @Operation(summary = "Update project details/status (LEAD). Absent fields stay unchanged.")
    public ProjectView update(@PathVariable UUID projectId, @Valid @RequestBody UpdateProjectRequest request) {
        return service.update(CurrentUser.id(), projectId, new UpdateCommand(request.version(), request.name(),
                request.description(), request.startDate(), request.deadline(),
                Boolean.TRUE.equals(request.clearStartDate()), Boolean.TRUE.equals(request.clearDeadline()),
                request.status()));
    }

    @PostMapping("/projects/{projectId}/archive")
    @Operation(summary = "Archive a project (LEAD); its tasks become read-only")
    public ProjectView archive(@PathVariable UUID projectId) {
        return service.archive(CurrentUser.id(), projectId);
    }

    @PostMapping("/projects/{projectId}/restore")
    @Operation(summary = "Restore an archived project to ACTIVE (LEAD)")
    public ProjectView restore(@PathVariable UUID projectId) {
        return service.restore(CurrentUser.id(), projectId);
    }

    @GetMapping("/projects/{projectId}/members")
    public PageResponse<MemberView> members(@PathVariable UUID projectId,
                                            @RequestParam(required = false) Integer page,
                                            @RequestParam(required = false) Integer size,
                                            @RequestParam(required = false) List<String> sort) {
        var pageable = PageRequests.of(page, size, sort, MEMBER_SORTS, Sort.by("createdAt"));
        return PageResponse.of(service.listMembers(CurrentUser.id(), projectId, pageable), v -> v);
    }

    @PostMapping("/projects/{projectId}/members")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add a workspace member to the project (LEAD)")
    public MemberView addMember(@PathVariable UUID projectId, @Valid @RequestBody AddProjectMemberRequest request) {
        return service.addMember(CurrentUser.id(), projectId, request.userId(), request.role());
    }

    @PatchMapping("/projects/{projectId}/members/{userId}")
    public MemberView changeRole(@PathVariable UUID projectId, @PathVariable UUID userId,
                                 @Valid @RequestBody ChangeProjectRoleRequest request) {
        return service.changeRole(CurrentUser.id(), projectId, userId, request.role());
    }

    @DeleteMapping("/projects/{projectId}/members/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Remove a project member (LEAD) or leave the project (self)")
    public void removeMember(@PathVariable UUID projectId, @PathVariable UUID userId) {
        service.removeMember(CurrentUser.id(), projectId, userId);
    }
}
