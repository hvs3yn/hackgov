package com.foresight.recommendation;

import com.foresight.recommendation.application.ExplanationRequest;
import com.foresight.recommendation.application.ExplanationRequest.FactorLine;
import com.foresight.recommendation.application.ExplanationRequest.TaskContext;
import com.foresight.risk.engine.model.Confidence;
import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.Severity;

import java.time.LocalDate;
import java.util.List;

final class RecommendationFixtures {

    static final LocalDate TODAY = LocalDate.of(2026, 10, 14);

    private RecommendationFixtures() {
    }

    static ExplanationRequest request(RiskCategory category) {
        TaskContext auth = new TaskContext("Authentication module", "IN_PROGRESS", TODAY.plusDays(1), "Ulvi", 20);
        TaskContext api = new TaskContext("API integration", "TODO", TODAY.plusDays(4), "Huseyn", 0);
        TaskContext design = new TaskContext("Design", "BLOCKED", null, null, 0);
        return new ExplanationRequest("Hackathon MVP", TODAY.plusDays(8), TODAY, category, Severity.HIGH, 72,
                Confidence.HIGH, "'Authentication module' is due tomorrow at 20% progress",
                List.of(new FactorLine("Due tomorrow", 15), new FactorLine("Only 20% complete", 15)),
                List.of("'Authentication module' is due on 2026-10-15 (tomorrow)", "Reported progress is 20%"),
                List.of("About 12.8 estimated hours remain but only 2 working days are left"),
                List.of("'Authentication module' has no time estimate"),
                category == RiskCategory.WORKLOAD_IMBALANCE || category == RiskCategory.PROJECT_DEADLINE ? null : auth,
                category == RiskCategory.WORKLOAD_IMBALANCE ? "Ulvi" : null,
                List.of(api),
                category == RiskCategory.BLOCKED_DEPENDENCY ? List.of(design) : List.of(),
                List.of("Aydan"));
    }
}
