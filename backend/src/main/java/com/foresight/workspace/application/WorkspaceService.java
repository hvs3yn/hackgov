package com.foresight.workspace.application;

import com.foresight.common.error.ApiException;
import com.foresight.common.error.ConstraintViolations;
import com.foresight.common.time.TimeProvider;
import com.foresight.identity.application.UserDirectory;
import com.foresight.identity.application.UserSummary;
import com.foresight.workspace.domain.Workspace;
import com.foresight.workspace.domain.WorkspaceMembership;
import com.foresight.workspace.domain.WorkspaceMembershipRepository;
import com.foresight.workspace.domain.WorkspaceRepository;
import com.foresight.workspace.domain.WorkspaceRole;
import com.foresight.workspace.domain.WorkspaceWithRole;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
public class WorkspaceService {

    private final WorkspaceRepository workspaces;
    private final WorkspaceMembershipRepository memberships;
    private final WorkspaceAccess access;
    private final UserDirectory userDirectory;
    private final TimeProvider time;
    private final ApplicationEventPublisher events;

    public WorkspaceService(WorkspaceRepository workspaces, WorkspaceMembershipRepository memberships,
                            WorkspaceAccess access, UserDirectory userDirectory, TimeProvider time,
                            ApplicationEventPublisher events) {
        this.workspaces = workspaces;
        this.memberships = memberships;
        this.access = access;
        this.userDirectory = userDirectory;
        this.time = time;
        this.events = events;
    }

    public record WorkspaceView(UUID id, String name, WorkspaceRole myRole, Instant createdAt, Instant updatedAt) {
        static WorkspaceView of(Workspace w, WorkspaceRole role) {
            return new WorkspaceView(w.getId(), w.getName(), role, w.getCreatedAt(), w.getUpdatedAt());
        }
    }

    public record MemberView(UUID userId, String fullName, String email, WorkspaceRole role, Instant joinedAt) {
    }

    @Transactional
    public WorkspaceView create(UUID actorId, String name) {
        Instant now = time.now();
        Workspace workspace = workspaces.save(new Workspace(name, now));
        memberships.save(new WorkspaceMembership(workspace.getId(), actorId, WorkspaceRole.OWNER, now));
        return WorkspaceView.of(workspace, WorkspaceRole.OWNER);
    }

    @Transactional(readOnly = true)
    public Page<WorkspaceView> listForUser(UUID userId, Pageable pageable) {
        return workspaces.findAllForUser(userId, pageable).map(wr -> WorkspaceView.of(wr.workspace(), wr.role()));
    }

    @Transactional(readOnly = true)
    public WorkspaceView get(UUID actorId, UUID workspaceId) {
        WorkspaceRole role = access.requireMember(workspaceId, actorId);
        return WorkspaceView.of(requireWorkspace(workspaceId), role);
    }

    @Transactional
    public WorkspaceView rename(UUID actorId, UUID workspaceId, String name) {
        WorkspaceRole role = access.requireAdmin(workspaceId, actorId);
        Workspace workspace = requireWorkspace(workspaceId);
        workspace.rename(name, time.now());
        return WorkspaceView.of(workspace, role);
    }

    @Transactional(readOnly = true)
    public Page<MemberView> listMembers(UUID actorId, UUID workspaceId, Pageable pageable) {
        access.requireMember(workspaceId, actorId);
        Page<WorkspaceMembership> page = memberships.findByWorkspaceId(workspaceId, pageable);
        Map<UUID, UserSummary> users = userDirectory.findAll(page.map(WorkspaceMembership::getUserId).getContent());
        return page.map(m -> toView(m, users.get(m.getUserId())));
    }

    @Transactional
    public MemberView addMember(UUID actorId, UUID workspaceId, String email, WorkspaceRole role) {
        lockWorkspace(workspaceId);
        WorkspaceRole actorRole = access.requireAdmin(workspaceId, actorId);
        if (role == WorkspaceRole.OWNER && actorRole != WorkspaceRole.OWNER) {
            throw ApiException.forbidden("Only an owner can grant the OWNER role");
        }
        UserSummary user = userDirectory.findByEmail(email)
                .orElseThrow(() -> ApiException.notFound("User with this email"));
        if (memberships.findByWorkspaceIdAndUserId(workspaceId, user.id()).isPresent()) {
            throw ApiException.conflict("ALREADY_MEMBER", "User is already a member of this workspace");
        }
        WorkspaceMembership membership = new WorkspaceMembership(workspaceId, user.id(), role, time.now());
        try {
            memberships.saveAndFlush(membership);
        } catch (DataIntegrityViolationException e) {
            if (!ConstraintViolations.isViolationOf(e, "uk_ws_member")) {
                throw e;
            }
            throw ApiException.conflict("ALREADY_MEMBER", "User is already a member of this workspace");
        }
        return toView(membership, user);
    }

    @Transactional
    public MemberView changeRole(UUID actorId, UUID workspaceId, UUID userId, WorkspaceRole newRole) {
        lockWorkspace(workspaceId);
        WorkspaceRole actorRole = access.requireAdmin(workspaceId, actorId);
        WorkspaceMembership target = requireMembership(workspaceId, userId);
        boolean touchesOwner = target.getRole() == WorkspaceRole.OWNER || newRole == WorkspaceRole.OWNER;
        if (touchesOwner && actorRole != WorkspaceRole.OWNER) {
            throw ApiException.forbidden("Only an owner can grant or revoke the OWNER role");
        }
        if (target.getRole() == WorkspaceRole.OWNER && newRole != WorkspaceRole.OWNER) {
            ensureNotLastOwner(workspaceId);
        }
        target.changeRole(newRole);
        return toView(target, userDirectory.require(userId));
    }

    @Transactional
    public void removeMember(UUID actorId, UUID workspaceId, UUID userId) {
        lockWorkspace(workspaceId);
        WorkspaceRole actorRole = access.requireMember(workspaceId, actorId);
        boolean self = actorId.equals(userId);
        if (!self && !actorRole.isAdmin()) {
            throw ApiException.forbidden("Workspace owner or admin role required");
        }
        WorkspaceMembership target = requireMembership(workspaceId, userId);
        if (target.getRole() == WorkspaceRole.OWNER) {
            if (!self && actorRole != WorkspaceRole.OWNER) {
                throw ApiException.forbidden("Only an owner can remove another owner");
            }
            ensureNotLastOwner(workspaceId);
        }
        // Downstream cleanup (task unassignment, inbox purge) runs in this transaction before the delete cascades.
        events.publishEvent(new WorkspaceMemberRemovedEvent(workspaceId, userId, actorId));
        memberships.delete(target);
        memberships.flush();
    }

    private void ensureNotLastOwner(UUID workspaceId) {
        if (memberships.countByWorkspaceIdAndRole(workspaceId, WorkspaceRole.OWNER) <= 1) {
            throw ApiException.conflict("LAST_OWNER", "A workspace must keep at least one owner");
        }
    }

    private Workspace requireWorkspace(UUID workspaceId) {
        return workspaces.findById(workspaceId).orElseThrow(() -> ApiException.notFound("Workspace"));
    }

    private void lockWorkspace(UUID workspaceId) {
        workspaces.findByIdForUpdate(workspaceId).orElseThrow(() -> ApiException.notFound("Workspace"));
    }

    private WorkspaceMembership requireMembership(UUID workspaceId, UUID userId) {
        return memberships.findByWorkspaceIdAndUserId(workspaceId, userId)
                .orElseThrow(() -> ApiException.notFound("Workspace member"));
    }

    private static MemberView toView(WorkspaceMembership m, UserSummary user) {
        return new MemberView(m.getUserId(), user == null ? null : user.fullName(), user == null ? null : user.email(),
                m.getRole(), m.getCreatedAt());
    }
}
