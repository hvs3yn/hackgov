package com.foresight.recommendation;

import com.foresight.recommendation.application.DeterministicExplanationGenerator;
import com.foresight.recommendation.application.ExplanationRequest;
import com.foresight.recommendation.application.ExplanationValidator;
import com.foresight.risk.application.explanation.ExplanationView;
import com.foresight.risk.application.explanation.ExplanationView.RecommendedAction;
import com.foresight.risk.engine.model.RiskCategory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class DeterministicExplanationGeneratorTest {

    private final DeterministicExplanationGenerator generator = new DeterministicExplanationGenerator();

    @ParameterizedTest
    @EnumSource(RiskCategory.class)
    void everyCategoryProducesGroundedConcreteActions(RiskCategory category) {
        ExplanationRequest request = RecommendationFixtures.request(category);
        ExplanationView view = generator.generate(request, Instant.EPOCH);

        assertThat(view.source()).isEqualTo("FALLBACK");
        assertThat(view.summary()).isNotBlank();
        assertThat(view.observedFacts()).isEqualTo(request.facts());
        assertThat(view.inferences()).isEqualTo(request.inferences());
        assertThat(view.unknowns()).isEqualTo(request.missingData());
        assertThat(view.recommendedActions()).hasSizeBetween(2, 6);
        assertThat(view.recommendedActions()).extracting(RecommendedAction::priority)
                .containsExactlyElementsOf(java.util.stream.IntStream.rangeClosed(1, view.recommendedActions().size()).boxed().toList());
        assertThat(view.recommendedActions()).allSatisfy(a -> {
            assertThat(a.action()).doesNotContainIgnoringCase("improve communication").hasSizeGreaterThan(12);
            assertThat(a.rationale()).isNotBlank();
        });
        assertThat(view.confidenceNote()).contains("72/100").contains("not a probability");
    }

    @Test
    void approachingDeadlineMatchesTheProductExample() {
        ExplanationView view = generator.generate(RecommendationFixtures.request(RiskCategory.APPROACHING_DEADLINE), Instant.EPOCH);
        assertThat(view.summary()).contains("'Authentication module'", "Ulvi", "2026-10-15");
        assertThat(view.recommendedActions()).extracting(RecommendedAction::action).anySatisfy(a -> assertThat(a).startsWith("Split the remaining work"))
                .anySatisfy(a -> assertThat(a).contains("Aydan").contains("review"))
                .anySatisfy(a -> assertThat(a).startsWith("Move independent tasks forward"))
                .anySatisfy(a -> assertThat(a).startsWith("Reassess the due date of 'API integration'"));
        assertThat(view.potentialConsequences()).anySatisfy(c -> assertThat(c).contains("'API integration'"));
    }

    @Test
    void blockedDependencyAsksForAnOwnerOfUnassignedPrerequisite() {
        ExplanationView view = generator.generate(RecommendationFixtures.request(RiskCategory.BLOCKED_DEPENDENCY), Instant.EPOCH);
        assertThat(view.recommendedActions().getFirst().action()).isEqualTo("Assign an owner to prerequisite 'Design'");
    }

    @Test
    void fallbackOutputWouldPassTheAiValidator() throws Exception {
        ExplanationValidator validator = new ExplanationValidator();
        for (RiskCategory category : RiskCategory.values()) {
            ExplanationView v = generator.generate(RecommendationFixtures.request(category), Instant.EPOCH);
            var payload = new com.foresight.recommendation.application.AiExplanationPayload(v.summary(), v.inferences(),
                    v.potentialConsequences(), v.recommendedActions().stream()
                    .map(a -> new com.foresight.recommendation.application.AiExplanationPayload.Action(a.priority(), a.action(), a.rationale()))
                    .toList(), v.assumptions(), v.unknowns());
            assertThat(validator.validate(payload).actions()).hasSameSizeAs(v.recommendedActions());
        }
    }
}
