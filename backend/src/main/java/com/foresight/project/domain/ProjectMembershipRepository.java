package com.foresight.project.domain;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProjectMembershipRepository extends JpaRepository<ProjectMembership, UUID> {

    Optional<ProjectMembership> findByProjectIdAndUserId(UUID projectId, UUID userId);

    Page<ProjectMembership> findByProjectId(UUID projectId, Pageable pageable);

    List<ProjectMembership> findByProjectId(UUID projectId);

    List<ProjectMembership> findByProjectIdAndRole(UUID projectId, ProjectRole role);

    List<ProjectMembership> findByUserIdAndProjectIdIn(UUID userId, Collection<UUID> projectIds);

    long countByProjectIdAndRole(UUID projectId, ProjectRole role);
}
