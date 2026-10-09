package com.foresight.workspace.domain;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface WorkspaceRepository extends JpaRepository<Workspace, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from Workspace w where w.id = :id")
    Optional<Workspace> findByIdForUpdate(@Param("id") UUID id);

    @Query(value = """
            select new com.foresight.workspace.domain.WorkspaceWithRole(w, m.role)
            from Workspace w join WorkspaceMembership m on m.workspaceId = w.id
            where m.userId = :userId""",
            countQuery = "select count(m) from WorkspaceMembership m where m.userId = :userId")
    Page<WorkspaceWithRole> findAllForUser(@Param("userId") UUID userId, Pageable pageable);
}
