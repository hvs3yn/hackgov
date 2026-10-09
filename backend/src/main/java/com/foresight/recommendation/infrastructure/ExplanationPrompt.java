package com.foresight.recommendation.infrastructure;

import com.foresight.recommendation.application.ExplanationRequest;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Prompt construction for LLM providers. The user message is the JSON-serialized request only.
 */
@Component
public class ExplanationPrompt {

    static final String SYSTEM = """
            You are the risk analyst of a project-management tool. You receive ONE risk that a deterministic \
            rule engine detected, with the facts and evidence it is based on.

            Write a short explanation and practical recommendations for the team.

            Rules:
            - Use only the data provided. Never invent task progress, dates, people, commitments or history.
            - Keep facts, inferences, possible consequences and unknowns separate; phrase inferences and \
            consequences as possibilities ("may", "could").
            - The score is a heuristic priority from 0 to 100, not a probability. Never express it as a percentage \
            chance or likelihood.
            - Recommendations must be concrete and actionable, naming the task or person involved (for example \
            splitting remaining work, asking a named teammate to review, re-sequencing independent tasks, \
            reassigning with a lead's approval, discussing a deadline adjustment). Avoid generic advice such as \
            "improve communication".
            - Mention missing information in "unknowns" instead of guessing.
            - Reply in English. Keep the summary to 2-4 sentences.
            """;

    private final JsonMapper mapper;

    public ExplanationPrompt(JsonMapper mapper) {
        this.mapper = mapper;
    }

    public String system() {
        return SYSTEM;
    }

    public String user(ExplanationRequest request) {
        return "Risk to explain (JSON):\n" + mapper.writeValueAsString(request);
    }
}
