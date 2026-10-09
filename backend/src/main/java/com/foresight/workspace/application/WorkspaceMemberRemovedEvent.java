package com.foresight.workspace.application;

import java.util.UUID;

/**
 * Published synchronously inside the removing transaction so downstream modules can clean up
 * (unassign tasks, purge inbox items). Project memberships are removed by a DB cascade.
 */
public record WorkspaceMemberRemovedEvent(UUID workspaceId, UUID userId, UUID actorId) {
}
