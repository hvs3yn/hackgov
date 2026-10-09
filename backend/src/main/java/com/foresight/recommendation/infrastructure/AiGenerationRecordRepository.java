package com.foresight.recommendation.infrastructure;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.UUID;

public interface AiGenerationRecordRepository extends MongoRepository<AiGenerationRecord, String> {

    Page<AiGenerationRecord> findByAssessmentId(UUID assessmentId, Pageable pageable);
}
