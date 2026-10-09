package com.foresight.task.domain;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TaskDependencyRepository extends JpaRepository<TaskDependency, UUID> {

    List<TaskDependency> findByProjectId(UUID projectId);

    Page<TaskDependency> findByProjectId(UUID projectId, Pageable pageable);

    List<TaskDependency> findBySuccessorTaskId(UUID successorTaskId);

    List<TaskDependency> findByPredecessorTaskId(UUID predecessorTaskId);

    Optional<TaskDependency> findByPredecessorTaskIdAndSuccessorTaskId(UUID predecessorTaskId, UUID successorTaskId);

    @Modifying(flushAutomatically = true)
    @Query("delete from TaskDependency d where d.predecessorTaskId = :taskId or d.successorTaskId = :taskId")
    int deleteAllTouching(@Param("taskId") UUID taskId);
}
