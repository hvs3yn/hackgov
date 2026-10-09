package com.foresight.recommendation.application;

import com.foresight.recommendation.application.AiProvider.AiProviderException;
import com.foresight.risk.application.explanation.ExplanationView.RecommendedAction;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Validates and sanitizes AI output before it is persisted or shown. Rejects structurally invalid,
 * oversized or generic content; normalizes action priorities to 1..n.
 */
@Component
public class ExplanationValidator {

    static final int MAX_SUMMARY = 600;
    static final int MAX_ITEM = 300;
    static final int MAX_ACTION = 200;
    static final int MAX_LIST = 5;
    static final int MAX_ACTIONS = 6;
    private static final Pattern CONTROL = Pattern.compile("[\\p{Cntrl}&&[^\n]]");
    private static final Pattern GENERIC = Pattern.compile(
            "^(improve|better|enhance|increase|focus on)\\s+(the\\s+)?(team\\s+)?"
                    + "(communication|collaboration|teamwork|coordination|productivity|planning)\\.?$");

    public record ValidatedPayload(String summary, List<String> inferences, List<String> potentialConsequences,
                                   List<RecommendedAction> actions, List<String> assumptions, List<String> unknowns) {
    }

    public ValidatedPayload validate(AiExplanationPayload payload) throws AiProviderException {
        if (payload == null) {
            throw invalid("empty payload");
        }
        String summary = clean(payload.summary());
        if (summary.isEmpty()) {
            throw invalid("summary is missing");
        }
        if (summary.length() > MAX_SUMMARY) {
            throw invalid("summary too long");
        }
        List<String> consequences = list("potentialConsequences", payload.potentialConsequences());
        if (consequences.isEmpty()) {
            throw invalid("potentialConsequences is empty");
        }
        List<AiExplanationPayload.Action> rawActions = payload.recommendedActions() == null ? List.of()
                : payload.recommendedActions();
        if (rawActions.isEmpty() || rawActions.size() > MAX_ACTIONS) {
            throw invalid("recommendedActions must contain 1-" + MAX_ACTIONS + " items");
        }
        List<AiExplanationPayload.Action> sorted = new ArrayList<>(rawActions);
        sorted.removeIf(a -> a == null);
        sorted.sort(Comparator.comparingInt(AiExplanationPayload.Action::priority));
        List<RecommendedAction> actions = new ArrayList<>();
        for (AiExplanationPayload.Action a : sorted) {
            String action = clean(a.action());
            String rationale = clean(a.rationale());
            if (action.length() < 12 || action.length() > MAX_ACTION) {
                throw invalid("action text length out of range");
            }
            if (GENERIC.matcher(action.toLowerCase(Locale.ROOT)).matches()) {
                throw invalid("generic action: " + action);
            }
            if (rationale.length() > MAX_ITEM) {
                throw invalid("rationale too long");
            }
            actions.add(new RecommendedAction(actions.size() + 1, action, rationale));
        }
        return new ValidatedPayload(summary, list("inferences", payload.inferences()), consequences, actions,
                list("assumptions", payload.assumptions()), list("unknowns", payload.unknowns()));
    }

    private List<String> list(String field, List<String> values) throws AiProviderException {
        if (values == null) {
            return List.of();
        }
        if (values.size() > MAX_LIST) {
            throw invalid(field + " has too many items");
        }
        List<String> result = new ArrayList<>();
        for (String v : values) {
            String c = clean(v);
            if (c.length() > MAX_ITEM) {
                throw invalid(field + " item too long");
            }
            if (!c.isEmpty()) {
                result.add(c);
            }
        }
        return result;
    }

    static String clean(String value) {
        return value == null ? "" : CONTROL.matcher(value).replaceAll("").strip();
    }

    private static AiProviderException invalid(String message) {
        return new AiProviderException("invalid_output", message);
    }
}
