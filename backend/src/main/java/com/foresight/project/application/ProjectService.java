package com.foresight.project.application;

import com.foresight.common.error.ApiException;
import com.foresight.common.error.ConstraintViolations;
import com.foresight.common.time.TimeProvider;
import com.foresight.identity.application.UserDirectory;
import com.foresight.identity.application.UserSummary;
import com.foresight.project.application.ProjectAccessService.ProjectAccess;
import com.foresight.project.application.ProjectEvents.ProjectAccessRevokedEvent;
import com.foresight.project.domain.Project;
import com.foresight.project.domain.ProjectMembership;
import com.foresight.project.domain.ProjectMembershipRepository;
import com.foresight.project.domain.ProjectRepository;
import com.foresight.project.domain.ProjectRole;
import com.foresight.project.domain.ProjectRole.Permission;
import com.foresight.project.domain.ProjectStatus;
import com.foresight.workspace.application.WorkspaceAccess;
import com.foresight.workspace.domain.WorkspaceRole;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ProjectService {

    private final ProjectRepository projects;
    private final ProjectMembershipRepository memberships;
    private final ProjectAccessService access;
    private final ProjectWriteGuard writeGuard;
    private final WorkspaceAccess workspaceAccess;
    private final UserDirectory userDirectory;
    private final TimeProvider time;
    private final ApplicationEventPublisher events;

    public ProjectService(ProjectRepository projects, ProjectMembershipRepository memberships,
                          ProjectAccessService access, ProjectWriteGuard writeGuard, WorkspaceAccess workspaceAccess,
                          UserDirectory userDirectory, TimeProvider time, ApplicationEventPublisher events) {
        this.projects = projects;
        this.memberships = memberships;
        this.access = access;
        this.writeGuard = writeGuard;
        this.workspaceAccess = workspaceAccess;
        this.userDirectory = userDirectory;
        this.time = time;
        this.events = events;
    }

    public record ProjectView(UUID id, UUID workspaceId, String name, String description, ProjectStatus status,
                              LocalDate startDate, LocalDate deadline, ProjectRole myRole, long version,
                              Instant createdAt, Instant updatedAt, Instant lastAnalyzedAt) {
        static ProjectView of(Project p, ProjectRole role) {
            return new ProjectView(p.getId(), p.getWorkspaceId(), p.getName(), p.getDescription(), p.getStatus(),
                    p.getStartDate(), p.getDeadline(), role, p.getVersion() == null ? 0 : p.getVersion(),
                    p.getCreatedAt(), p.getUpdatedAt(), p.getLastAnalyzedAt());
        }
    }

    public record MemberView(UUID userId, String fullName, String email, ProjectRole role, Instant joinedAt) {
    }

    public record CreateCommand(String name, String description, LocalDate startDate, LocalDate deadline) {
    }

    public record UpdateCommand(long version, String name, String description, LocalDate startDate,
                                LocalDate deadline, boolean clearStartDate, boolean clearDeadline,
                                ProjectStatus status) {
    }

    @Transactional
    public ProjectView create(UUID actorId, UUID workspaceId, CreateCommand cmd) {
        workspaceAccess.requireMember(workspaceId, actorId);
        Instant now = time.now();
        Project project = new Project(workspaceId, cmd.name(), cmd.description(), cmd.startDate(), cmd.deadline(),
                actorId, now);
        projects.saveAndFlush(project);
        memberships.save(new ProjectMembership(project.getId(), workspaceId, actorId, ProjectRole.LEAD, now));
        return ProjectView.of(project, ProjectRole.LEAD);
    }

    @Transactional(readOnly = true)
    public Page<ProjectView> list(UUID actorId, UUID workspaceId, ProjectStatus status, Pageable pageable) {
        WorkspaceRole wsRole = workspaceAccess.requireMember(workspaceId, actorId);
        Page<Project> page = projects.findVisible(workspaceId, actorId, wsRole.isAdmin(), status, pageable);
        Map<UUID, ProjectRole> roles = wsRole.isAdmin() ? Map.of()
                : memberships.findByUserIdAndProjectIdIn(actorId, page.map(Project::getId).getContent()).stream()
                .collect(Collectors.toMap(ProjectMembership::getProjectId, ProjectMembership::getRole));
        return page.map(p -> ProjectView.of(p, wsRole.isAdmin() ? ProjectRole.LEAD : roles.get(p.getId())));
    }

    @Transactional(readOnly = true)
    public ProjectView get(UUID actorId, UUID projectId) {
        ProjectAccess pa = access.require(projectId, actorId, Permission.VIEW);
        return ProjectView.of(requireProject(projectId), pa.role());
    }

    @Transactional
    public ProjectView update(UUID actorId, UUID projectId, UpdateCommand cmd) {
        ProjectAccess pa = access.require(projectId, actorId, Permission.MANAGE);
        writeGuard.lockForWrite(projectId);
        Project project = requireProject(projectId);
        project.requireVersion(cmd.version());
        if (project.getStatus() == ProjectStatus.ARCHIVED) {
            throw ApiException.conflict("PROJECT_READ_ONLY", "Restore the project before editing it");
        }
        Instant now = time.now();
        LocalDate startDate = cmd.clearStartDate() ? null : cmd.startDate() != null ? cmd.startDate() : project.getStartDate();
        LocalDate deadline = cmd.clearDeadline() ? null : cmd.deadline() != null ? cmd.deadline() : project.getDeadline();
        project.updateDetails(
                cmd.name() != null ? cmd.name() : project.getName(),
                cmd.description() != null ? cmd.description() : project.getDescription(),
                startDate, deadline, now);
        if (cmd.status() != null) {
            if (cmd.status() == ProjectStatus.ARCHIVED) {
                throw ApiException.badRequest("INVALID_ARGUMENT", "Use the archive endpoint to archive a project");
            }
            project.changeStatus(cmd.status(), now);
        }
        projects.flush();
        return ProjectView.of(project, pa.role());
    }

    @Transactional
    public ProjectView archive(UUID actorId, UUID projectId) {
        return changeStatus(actorId, projectId, ProjectStatus.ARCHIVED);
    }

    @Transactional
    public ProjectView restore(UUID actorId, UUID projectId) {
        return changeStatus(actorId, projectId, ProjectStatus.ACTIVE);
    }

    private ProjectView changeStatus(UUID actorId, UUID projectId, ProjectStatus target) {
        ProjectAccess pa = access.require(projectId, actorId, Permission.MANAGE);
        writeGuard.lockForWrite(projectId);
        Project project = requireProject(projectId);
        if (target == ProjectStatus.ACTIVE && project.getStatus() != ProjectStatus.ARCHIVED) {
            throw ApiException.conflict("INVALID_STATUS_TRANSITION", "Only archived projects can be restored");
        }
        project.changeStatus(target, time.now());
        projects.flush();
        return ProjectView.of(project, pa.role());
    }

    @Transactional(readOnly = true)
    public Page<MemberView> listMembers(UUID actorId, UUID projectId, Pageable pageable) {
        access.require(projectId, actorId, Permission.VIEW);
        Page<ProjectMembership> page = memberships.findByProjectId(projectId, pageable);
        Map<UUID, UserSummary> users = userDirectory.findAll(page.map(ProjectMembership::getUserId).getContent());
        return page.map(m -> toView(m, users.get(m.getUserId())));
    }

    @Transactional
    public MemberView addMember(UUID actorId, UUID projectId, UUID userId, ProjectRole role) {
        ProjectAccess pa = access.require(projectId, actorId, Permission.MANAGE);
        writeGuard.lockForWrite(projectId);
        if (workspaceAccess.roleOf(pa.workspaceId(), userId).isEmpty()) {
            throw ApiException.badRequest("NOT_WORKSPACE_MEMBER", "User must be a member of the project's workspace");
        }
        if (memberships.findByProjectIdAndUserId(projectId, userId).isPresent()) {
            throw ApiException.conflict("ALREADY_MEMBER", "User is already a member of this project");
        }
        ProjectMembership membership = new ProjectMembership(projectId, pa.workspaceId(), userId, role, time.now());
        try {
            memberships.saveAndFlush(membership);
        } catch (DataIntegrityViolationException e) {
            if (!ConstraintViolations.isViolationOf(e, "uk_project_member")) {
                throw e;
            }
            throw ApiException.conflict("ALREADY_MEMBER", "User is already a member of this project");
        }
        return toView(membership, userDirectory.require(userId));
    }

    @Transactional
    public MemberView changeRole(UUID actorId, UUID projectId, UUID userId, ProjectRole role) {
        access.require(projectId, actorId, Permission.MANAGE);
        writeGuard.lockForWrite(projectId);
        ProjectMembership membership = requireMembership(projectId, userId);
        if (membership.getRole() == ProjectRole.LEAD && role != ProjectRole.LEAD) {
            ensureNotLastLead(projectId);
        }
        ProjectRole previous = membership.getRole();
        membership.changeRole(role);
        if (role == ProjectRole.VIEWER && previous != ProjectRole.VIEWER && !hasImplicitLead(projectId, userId)) {
            events.publishEvent(new ProjectAccessRevokedEvent(projectId, userId, actorId, false));
        }
        return toView(membership, userDirectory.require(userId));
    }

    @Transactional
    public void removeMember(UUID actorId, UUID projectId, UUID userId) {
        boolean self = actorId.equals(userId);
        access.require(projectId, actorId, self ? Permission.VIEW : Permission.MANAGE);
        writeGuard.lockForWrite(projectId);
        ProjectMembership membership = requireMembership(projectId, userId);
        if (membership.getRole() == ProjectRole.LEAD) {
            ensureNotLastLead(projectId);
        }
        if (!hasImplicitLead(projectId, userId)) {
            events.publishEvent(new ProjectAccessRevokedEvent(projectId, userId, actorId, true));
        }
        memberships.delete(membership);
    }

    private boolean hasImplicitLead(UUID projectId, UUID userId) {
        UUID workspaceId = requireProject(projectId).getWorkspaceId();
        return workspaceAccess.roleOf(workspaceId, userId).map(WorkspaceRole::isAdmin).orElse(false);
    }

    private void ensureNotLastLead(UUID projectId) {
        if (memberships.countByProjectIdAndRole(projectId, ProjectRole.LEAD) <= 1) {
            throw ApiException.conflict("LAST_LEAD", "A project must keep at least one lead");
        }
    }

    private Project requireProject(UUID projectId) {
        return projects.findById(projectId).orElseThrow(() -> ApiException.notFound("Project"));
    }

    private ProjectMembership requireMembership(UUID projectId, UUID userId) {
        return memberships.findByProjectIdAndUserId(projectId, userId)
                .orElseThrow(() -> ApiException.notFound("Project member"));
    }

    private static MemberView toView(ProjectMembership m, UserSummary user) {
        return new MemberView(m.getUserId(), user == null ? null : user.fullName(), user == null ? null : user.email(),
                m.getRole(), m.getCreatedAt());
    }
}
