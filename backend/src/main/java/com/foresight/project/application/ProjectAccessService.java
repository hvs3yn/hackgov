package com.foresight.project.application;

import com.foresight.common.error.ApiException;
import com.foresight.project.domain.Project;
import com.foresight.project.domain.ProjectMembershipRepository;
import com.foresight.project.domain.ProjectRepository;
import com.foresight.project.domain.ProjectRole;
import com.foresight.project.domain.ProjectRole.Permission;
import com.foresight.project.domain.ProjectStatus;
import com.foresight.workspace.application.WorkspaceAccess;
import com.foresight.workspace.domain.WorkspaceRole;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

/**
 * Resolves a user's effective project role (workspace OWNER/ADMIN ⇒ LEAD) and enforces permissions.
 * Invisible projects yield 404 so ids cannot be probed; visible but insufficient yields 403.
 */
@Service
@Transactional(readOnly = true)
public class ProjectAccessService {

    private final ProjectRepository projects;
    private final ProjectMembershipRepository memberships;
    private final WorkspaceAccess workspaceAccess;

    public ProjectAccessService(ProjectRepository projects, ProjectMembershipRepository memberships,
                                WorkspaceAccess workspaceAccess) {
        this.projects = projects;
        this.memberships = memberships;
        this.workspaceAccess = workspaceAccess;
    }

    public record ProjectAccess(UUID projectId, UUID workspaceId, ProjectStatus status, ProjectRole role) {
        public boolean can(Permission permission) {
            return role.allows(permission);
        }

        public void requireWritable() {
            if (!status.allowsTaskChanges()) {
                throw ApiException.conflict("PROJECT_READ_ONLY", "Project is " + status + " and cannot be modified");
            }
        }
    }

    public ProjectAccess require(UUID projectId, UUID userId, Permission permission) {
        Project project = projects.findById(projectId).orElseThrow(() -> ApiException.notFound("Project"));
        ProjectRole role = effectiveRole(project, userId).orElseThrow(() -> ApiException.notFound("Project"));
        if (!role.allows(permission)) {
            throw ApiException.forbidden("Your project role " + role + " does not allow this action");
        }
        return new ProjectAccess(project.getId(), project.getWorkspaceId(), project.getStatus(), role);
    }

    public Optional<ProjectRole> effectiveRole(UUID projectId, UUID userId) {
        return projects.findById(projectId).flatMap(p -> effectiveRole(p, userId));
    }

    Optional<ProjectRole> effectiveRole(Project project, UUID userId) {
        Optional<WorkspaceRole> wsRole = workspaceAccess.roleOf(project.getWorkspaceId(), userId);
        if (wsRole.isEmpty()) {
            return Optional.empty();
        }
        if (wsRole.get().isAdmin()) {
            return Optional.of(ProjectRole.LEAD);
        }
        return memberships.findByProjectIdAndUserId(project.getId(), userId).map(m -> m.getRole());
    }
}
