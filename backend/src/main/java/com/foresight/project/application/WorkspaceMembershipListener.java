package com.foresight.project.application;

import com.foresight.project.application.ProjectEvents.ProjectAccessRevokedEvent;
import com.foresight.project.domain.ProjectRepository;
import com.foresight.workspace.application.WorkspaceMemberRemovedEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Translates "removed from workspace" into per-project access revocations (same transaction).
 */
@Component
class WorkspaceMembershipListener {

    private final ProjectRepository projects;
    private final ProjectWriteGuard writeGuard;
    private final ApplicationEventPublisher events;

    WorkspaceMembershipListener(ProjectRepository projects, ProjectWriteGuard writeGuard,
                                ApplicationEventPublisher events) {
        this.projects = projects;
        this.writeGuard = writeGuard;
        this.events = events;
    }

    @EventListener
    void onWorkspaceMemberRemoved(WorkspaceMemberRemovedEvent event) {
        for (UUID projectId : projects.findIdsByWorkspaceId(event.workspaceId())) {
            writeGuard.lockForWrite(projectId);
            events.publishEvent(new ProjectAccessRevokedEvent(projectId, event.userId(), event.actorId(), true));
        }
    }
}
