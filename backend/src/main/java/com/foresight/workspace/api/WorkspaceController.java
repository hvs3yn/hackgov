package com.foresight.workspace.api;

import com.foresight.common.api.PageRequests;
import com.foresight.common.api.PageResponse;
import com.foresight.common.security.CurrentUser;
import com.foresight.workspace.application.WorkspaceService;
import com.foresight.workspace.application.WorkspaceService.MemberView;
import com.foresight.workspace.application.WorkspaceService.WorkspaceView;
import com.foresight.workspace.domain.WorkspaceRole;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
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

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces")
@Tag(name = "Workspaces")
public class WorkspaceController {

    private static final Map<String, String> WORKSPACE_SORTS = Map.of("name", "name", "createdAt", "createdAt");
    private static final Map<String, String> MEMBER_SORTS = Map.of("createdAt", "createdAt", "role", "role");

    private final WorkspaceService service;

    public WorkspaceController(WorkspaceService service) {
        this.service = service;
    }

    public record WorkspaceRequest(@NotBlank @Size(max = 120) String name) {
    }

    public record AddMemberRequest(@NotBlank @Email @Size(max = 254) String email, @NotNull WorkspaceRole role) {
    }

    public record ChangeRoleRequest(@NotNull WorkspaceRole role) {
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a workspace (caller becomes OWNER)")
    public WorkspaceView create(@Valid @RequestBody WorkspaceRequest request) {
        return service.create(CurrentUser.id(), request.name());
    }

    @GetMapping
    @Operation(summary = "List workspaces the caller belongs to")
    public PageResponse<WorkspaceView> list(@RequestParam(required = false) Integer page,
                                            @RequestParam(required = false) Integer size,
                                            @RequestParam(required = false) List<String> sort) {
        var pageable = PageRequests.of(page, size, sort, WORKSPACE_SORTS, Sort.by("name"));
        return PageResponse.of(service.listForUser(CurrentUser.id(), pageable), v -> v);
    }

    @GetMapping("/{workspaceId}")
    public WorkspaceView get(@PathVariable UUID workspaceId) {
        return service.get(CurrentUser.id(), workspaceId);
    }

    @PatchMapping("/{workspaceId}")
    @Operation(summary = "Rename a workspace (OWNER/ADMIN)")
    public WorkspaceView rename(@PathVariable UUID workspaceId, @Valid @RequestBody WorkspaceRequest request) {
        return service.rename(CurrentUser.id(), workspaceId, request.name());
    }

    @GetMapping("/{workspaceId}/members")
    public PageResponse<MemberView> members(@PathVariable UUID workspaceId,
                                            @RequestParam(required = false) Integer page,
                                            @RequestParam(required = false) Integer size,
                                            @RequestParam(required = false) List<String> sort) {
        var pageable = PageRequests.of(page, size, sort, MEMBER_SORTS, Sort.by("createdAt"));
        return PageResponse.of(service.listMembers(CurrentUser.id(), workspaceId, pageable), v -> v);
    }

    @PostMapping("/{workspaceId}/members")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add an existing user by email (OWNER/ADMIN)")
    public MemberView addMember(@PathVariable UUID workspaceId, @Valid @RequestBody AddMemberRequest request) {
        return service.addMember(CurrentUser.id(), workspaceId, request.email(), request.role());
    }

    @PatchMapping("/{workspaceId}/members/{userId}")
    public MemberView changeRole(@PathVariable UUID workspaceId, @PathVariable UUID userId,
                                 @Valid @RequestBody ChangeRoleRequest request) {
        return service.changeRole(CurrentUser.id(), workspaceId, userId, request.role());
    }

    @DeleteMapping("/{workspaceId}/members/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Remove a member (OWNER/ADMIN) or leave the workspace (self)")
    public void removeMember(@PathVariable UUID workspaceId, @PathVariable UUID userId) {
        service.removeMember(CurrentUser.id(), workspaceId, userId);
    }
}
