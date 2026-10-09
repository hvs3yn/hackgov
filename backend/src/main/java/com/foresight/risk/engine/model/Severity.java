package com.foresight.risk.engine.model;

/** Severity bands derived from the heuristic 0-100 score (see {@code ScoringPolicy}). */
public enum Severity {
    LOW, MEDIUM, HIGH, CRITICAL;

    public boolean isAtLeast(Severity other) {
        return compareTo(other) >= 0;
    }
}
