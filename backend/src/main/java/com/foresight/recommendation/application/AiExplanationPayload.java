package com.foresight.recommendation.application;

import com.fasterxml.jackson.annotation.JsonPropertyDescription;

import java.util.List;

/**
 * Structured output schema requested from the AI provider. Untrusted until validated by
 * {@link ExplanationValidator}.
 */
public record AiExplanationPayload(
        @JsonPropertyDescription("2-4 sentences explaining the risk using only the provided facts")
        String summary,
        @JsonPropertyDescription("Reasonable inferences drawn from the facts, phrased as inferences")
        List<String> inferences,
        @JsonPropertyDescription("Likely consequences if nothing changes, phrased as possibilities")
        List<String> potentialConsequences,
        @JsonPropertyDescription("Prioritized, concrete mitigation actions (priority 1 = most important)")
        List<Action> recommendedActions,
        @JsonPropertyDescription("Assumptions behind the analysis")
        List<String> assumptions,
        @JsonPropertyDescription("Information that is missing or unknown")
        List<String> unknowns) {

    public record Action(
            @JsonPropertyDescription("1-based priority, 1 is most important") int priority,
            @JsonPropertyDescription("Specific action naming the task/person involved") String action,
            @JsonPropertyDescription("Why this action reduces the risk, grounded in the facts") String rationale) {
    }
}
