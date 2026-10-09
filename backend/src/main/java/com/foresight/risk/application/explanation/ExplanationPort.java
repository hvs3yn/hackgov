package com.foresight.risk.application.explanation;

import com.foresight.risk.domain.RiskAssessment;

/**
 * Implemented by the recommendation module (dependency inversion keeps risk free of AI concerns).
 */
public interface ExplanationPort {

    /** Cheap, deterministic explanation built only from the assessment's evidence (never calls an LLM). */
    ExplanationView deterministic(RiskAssessment assessment);
}
