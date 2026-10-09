package com.foresight.risk.engine;

/**
 * Tunable thresholds of the deterministic engine. Defaults are documented in docs/ai-risk-engine.md.
 */
public record RiskSettings(int minScore, double hoursPerDay, boolean excludeWeekends, int approachingDays,
                           int urgentStallDays, int stallDays, int workloadHorizonDays,
                           double workloadOverloadRatio, int workloadTaskCountThreshold) {

    public static RiskSettings defaults() {
        return new RiskSettings(20, 6.0, true, 3, 2, 5, 10, 1.2, 6);
    }
}
