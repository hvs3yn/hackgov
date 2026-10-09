package com.foresight.risk.engine;

import com.foresight.risk.engine.model.RiskSignal;

import java.util.List;

/**
 * A deterministic, independently testable detection rule.
 */
public interface RiskRule {

    List<RiskSignal> evaluate(AnalysisContext context);
}
