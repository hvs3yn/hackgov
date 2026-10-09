package com.foresight.workspace.domain;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkspaceMembershipRepository extends JpaRepository<WorkspaceMembership, UUID> {

    Optional<WorkspaceMembership> findByWorkspaceIdAndUserId(UUID workspaceId, UUID userId);

    Page<WorkspaceMembership> findByWorkspaceId(UUID workspaceId, Pageable pageable);

    List<WorkspaceMembership> findByWorkspaceIdAndRoleIn(UUID workspaceId, List<WorkspaceRole> roles);

    long countByWorkspaceIdAndRole(UUID workspaceId, WorkspaceRole role);
}
