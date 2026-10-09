package com.foresight.project.domain;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface ProjectRepository extends JpaRepository<Project, UUID> {

    /**
     * Increments the data version and thereby takes the project row lock until commit. All writes that
     * influence risk analysis call this first, which serializes them per project.
     */
    @Modifying(flushAutomatically = true)
    @Query(value = "update projects set data_version = data_version + 1 where id = :id", nativeQuery = true)
    int incrementDataVersion(@Param("id") UUID id);

    @Query(value = "select data_version from projects where id = :id for update", nativeQuery = true)
    Long lockAndReadDataVersion(@Param("id") UUID id);

    @Query(value = "select data_version from projects where id = :id", nativeQuery = true)
    Long readDataVersion(@Param("id") UUID id);

    @Modifying
    @Query(value = """
            update projects set last_analyzed_at = :at, last_analyzed_data_version = :dataVersion
            where id = :id""", nativeQuery = true)
    int markAnalyzed(@Param("id") UUID id, @Param("at") Instant at, @Param("dataVersion") long dataVersion);

    @Query("""
            select p from Project p
            where p.workspaceId = :workspaceId
              and (:status is null or p.status = :status)
              and (:allProjects = true or exists (
                    select 1 from ProjectMembership m where m.projectId = p.id and m.userId = :userId))""")
    Page<Project> findVisible(@Param("workspaceId") UUID workspaceId, @Param("userId") UUID userId,
                              @Param("allProjects") boolean allProjects, @Param("status") ProjectStatus status,
                              Pageable pageable);

    @Query("select p.id from Project p where p.status = :status order by p.id")
    Page<UUID> findIdsByStatus(@Param("status") ProjectStatus status, Pageable pageable);

    @Query("select p.id from Project p where p.workspaceId = :workspaceId")
    List<UUID> findIdsByWorkspaceId(@Param("workspaceId") UUID workspaceId);
}
