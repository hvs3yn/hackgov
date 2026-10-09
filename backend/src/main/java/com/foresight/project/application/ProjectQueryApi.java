package com.foresight.project.application;

import com.foresight.common.error.ApiException;
import com.foresight.identity.application.UserDirectory;
import com.foresight.identity.application.UserSummary;
import com.foresight.project.domain.Project;
import com.foresight.project.domain.ProjectMembership;
import com.foresight.project.domain.ProjectMembershipRepository;
import com.foresight.project.domain.ProjectRepository;
import com.foresight.project.domain.ProjectRole;
import com.foresight.project.domain.ProjectStatus;
import com.foresight.workspace.application.WorkspaceAccess;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Read/coordination API of the project module for the risk and inbox modules.
 */
@Service
@Transactional(readOnly = true)
public class ProjectQueryApi {

    private final ProjectRepository projects;
    private final ProjectMembershipRepository memberships;
    private final WorkspaceAccess workspaceAccess;
    private final UserDirectory userDirectory;

    public ProjectQueryApi(ProjectRepository projects, ProjectMembershipRepository memberships,
                           WorkspaceAccess workspaceAccess, UserDirectory userDirectory) {
        this.projects = projects;
        this.memberships = memberships;
        this.workspaceAccess = workspaceAccess;
        this.userDirectory = userDirectory;
    }

    public record ProjectInfo(UUID id, UUID workspaceId, String name, ProjectStatus status, LocalDate startDate,
                              LocalDate deadline, long dataVersion, Instant lastAnalyzedAt) {
    }

    public record MemberInfo(UUID userId, String fullName, ProjectRole role) {
    }

    public ProjectInfo get(UUID projectId) {
        Project p = projects.findById(projectId).orElseThrow(() -> ApiException.notFound("Project"));
        return new ProjectInfo(p.getId(), p.getWorkspaceId(), p.getName(), p.getStatus(), p.getStartDate(),
                p.getDeadline(), p.getDataVersion(), p.getLastAnalyzedAt());
    }

    /** Effective members: explicit memberships plus workspace owners/admins (implicit LEADs). */
    public List<MemberInfo> members(UUID projectId) {
        Project project = projects.findById(projectId).orElseThrow(() -> ApiException.notFound("Project"));
        Map<UUID, ProjectRole> roles = new LinkedHashMap<>();
        for (ProjectMembership m : memberships.findByProjectId(projectId)) {
            roles.put(m.getUserId(), m.getRole());
        }
        for (UUID adminId : workspaceAccess.adminUserIds(project.getWorkspaceId())) {
            roles.put(adminId, ProjectRole.LEAD);
        }
        Map<UUID, UserSummary> users = userDirectory.findAll(roles.keySet());
        List<MemberInfo> result = new ArrayList<>();
        roles.forEach((userId, role) -> {
            UserSummary user = users.get(userId);
            result.add(new MemberInfo(userId, user == null ? "Unknown user" : user.fullName(), role));
        });
        return result;
    }

    /** Explicit project LEADs; falls back to workspace owners/admins when the project has none. */
    public List<UUID> leadUserIds(UUID projectId) {
        List<UUID> leads = memberships.findByProjectIdAndRole(projectId, ProjectRole.LEAD).stream()
                .map(ProjectMembership::getUserId).toList();
        if (!leads.isEmpty()) {
            return leads;
        }
        Project project = projects.findById(projectId).orElseThrow(() -> ApiException.notFound("Project"));
        return workspaceAccess.adminUserIds(project.getWorkspaceId());
    }

    public Page<UUID> activeProjectIds(Pageable pageable) {
        return projects.findIdsByStatus(ProjectStatus.ACTIVE, pageable);
    }

    public Map<UUID, String> names(Collection<UUID> projectIds) {
        if (projectIds.isEmpty()) {
            return Map.of();
        }
        return projects.findAllById(projectIds.stream().distinct().toList()).stream()
                .collect(Collectors.toMap(Project::getId, Project::getName));
    }

    /** Locks the project row and returns the current data version; must run inside the caller's transaction. */
    @Transactional(propagation = Propagation.MANDATORY)
    public long lockAndReadDataVersion(UUID projectId) {
        Long version = projects.lockAndReadDataVersion(projectId);
        if (version == null) {
            throw ApiException.notFound("Project");
        }
        return version;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void markAnalyzed(UUID projectId, Instant at, long dataVersion) {
        projects.markAnalyzed(projectId, at, dataVersion);
    }
}
