package com.foresight.risk.domain;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface RiskAssessmentEventRepository extends JpaRepository<RiskAssessmentEvent, UUID> {

    Page<RiskAssessmentEvent> findByAssessmentId(UUID assessmentId, Pageable pageable);
}
