package com.foresight.workspace.application;

import com.foresight.common.error.ApiException;
import com.foresight.workspace.domain.WorkspaceMembershipRepository;
import com.foresight.workspace.domain.WorkspaceRole;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Workspace-level authorization. Non-members get 404 so workspace ids cannot be probed.
 */
@Service
@Transactional(readOnly = true)
public class WorkspaceAccess {

    private final WorkspaceMembershipRepository memberships;

    public WorkspaceAccess(WorkspaceMembershipRepository memberships) {
        this.memberships = memberships;
    }

    public Optional<WorkspaceRole> roleOf(UUID workspaceId, UUID userId) {
        return memberships.findByWorkspaceIdAndUserId(workspaceId, userId).map(m -> m.getRole());
    }

    public WorkspaceRole requireMember(UUID workspaceId, UUID userId) {
        return roleOf(workspaceId, userId).orElseThrow(() -> ApiException.notFound("Workspace"));
    }

    public WorkspaceRole requireAdmin(UUID workspaceId, UUID userId) {
        WorkspaceRole role = requireMember(workspaceId, userId);
        if (!role.isAdmin()) {
            throw ApiException.forbidden("Workspace owner or admin role required");
        }
        return role;
    }

    public List<UUID> adminUserIds(UUID workspaceId) {
        return memberships.findByWorkspaceIdAndRoleIn(workspaceId, List.of(WorkspaceRole.OWNER, WorkspaceRole.ADMIN))
                .stream().map(m -> m.getUserId()).toList();
    }
}
