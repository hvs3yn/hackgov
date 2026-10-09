package com.foresight.risk.engine;

import com.foresight.risk.engine.model.Factor;
import com.foresight.risk.engine.model.Severity;

import java.util.List;

/**
 * Transparent scoring: the score is the clamped sum of factor points. Scores are heuristic priorities,
 * not calibrated probabilities.
 */
public final class ScoringPolicy {

    public static final int MAX_SCORE = 100;

    public int score(List<Factor> factors) {
        int sum = factors.stream().mapToInt(Factor::points).sum();
        return Math.max(0, Math.min(MAX_SCORE, sum));
    }

    /** 0-24 LOW, 25-49 MEDIUM, 50-74 HIGH, 75-100 CRITICAL. */
    public Severity severity(int score) {
        if (score >= 75) {
            return Severity.CRITICAL;
        }
        if (score >= 50) {
            return Severity.HIGH;
        }
        if (score >= 25) {
            return Severity.MEDIUM;
        }
        return Severity.LOW;
    }
}
