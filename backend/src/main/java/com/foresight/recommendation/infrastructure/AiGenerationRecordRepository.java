package com.foresight.recommendation.infrastructure;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface AiGenerationRecordRepository extends JpaRepository<AiGenerationRecord, UUID> {

    Page<AiGenerationRecord> findByAssessmentId(UUID assessmentId, Pageable pageable);

    @Modifying
    @Query("delete from AiGenerationRecord r where r.createdAt < :cutoff")
    int deleteCreatedBefore(@Param("cutoff") Instant cutoff);
}
