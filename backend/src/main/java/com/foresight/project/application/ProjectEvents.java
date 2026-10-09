package com.foresight.project.application;

import java.util.UUID;

public final class ProjectEvents {

    private ProjectEvents() {
    }

    /**
     * Risk-relevant data of a project changed (tasks, dependencies, dates, members, status).
     * Consumed after commit to schedule re-analysis.
     */
    public record ProjectDataChangedEvent(UUID projectId) {
    }

    /**
     * A user lost the ability to work on a project: removed from it, downgraded to VIEWER
     * ({@code fullyRemoved = false}), or removed from its workspace. Published synchronously within the
     * changing transaction so listeners can unassign tasks / purge inbox items atomically.
     */
    public record ProjectAccessRevokedEvent(UUID projectId, UUID userId, UUID actorId, boolean fullyRemoved) {
    }
}
