package com.foresight.risk.application.explanation;

import java.time.Instant;
import java.util.List;

/**
 * Human-readable explanation of an assessment. {@code observedFacts} always come from recorded system data;
 * the remaining text comes from the configured provider (or the deterministic generator) and is labeled by
 * {@code source}.
 */
public record ExplanationView(String source, String summary, List<String> observedFacts, List<String> inferences,
                              List<String> potentialConsequences, List<RecommendedAction> recommendedActions,
                              List<String> assumptions, List<String> unknowns, String confidenceNote,
                              Instant generatedAt) {

    public record RecommendedAction(int priority, String action, String rationale) {
    }
}
