package com.foresight.task.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TaskRepository extends JpaRepository<Task, UUID>, JpaSpecificationExecutor<Task> {

    @Query("select t.projectId from Task t where t.id = :id and t.archivedAt is null")
    Optional<UUID> findProjectIdOfActiveTask(@Param("id") UUID id);

    Optional<Task> findByIdAndArchivedAtIsNull(UUID id);

    List<Task> findByProjectIdAndArchivedAtIsNull(UUID projectId);

    List<Task> findByIdInAndArchivedAtIsNull(Collection<UUID> ids);

    @Query("""
            select t from Task t
            where t.projectId = :projectId and t.assigneeId = :userId and t.archivedAt is null
              and t.status not in (com.foresight.task.domain.TaskStatus.DONE, com.foresight.task.domain.TaskStatus.CANCELLED)""")
    List<Task> findOpenAssigned(@Param("projectId") UUID projectId, @Param("userId") UUID userId);

    @Query("""
            select distinct a.taskId from TaskActivity a
            where a.projectId = :projectId and a.type = com.foresight.task.domain.TaskActivityType.PROGRESS_UPDATED""")
    List<UUID> findTaskIdsWithProgressReports(@Param("projectId") UUID projectId);
}
