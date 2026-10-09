package com.foresight.recommendation;

import com.foresight.recommendation.application.AiExplanationPayload;
import com.foresight.recommendation.application.AiExplanationPayload.Action;
import com.foresight.recommendation.application.AiProvider.AiProviderException;
import com.foresight.recommendation.application.ExplanationValidator;
import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ExplanationValidatorTest {

    private final ExplanationValidator validator = new ExplanationValidator();

    private static AiExplanationPayload payload(String summary, List<Action> actions) {
        return new AiExplanationPayload(summary, List.of("inference"), List.of("The integration may slip"), actions,
                List.of(), null);
    }

    private static Action action(int priority, String text) {
        return new Action(priority, text, "Because the task is late");
    }

    @Test
    void validPayloadIsSanitizedAndPrioritiesNormalized() throws Exception {
        var result = validator.validate(payload("  Summary with control\u0007 char  ", List.of(
                action(5, "Ask Aydan to review 'Auth' today"),
                action(2, "Split the remaining work on 'Auth'"))));
        assertThat(result.summary()).isEqualTo("Summary with control char");
        assertThat(result.actions()).extracting(a -> a.priority() + ":" + a.action())
                .containsExactly("1:Split the remaining work on 'Auth'", "2:Ask Aydan to review 'Auth' today");
        assertThat(result.unknowns()).isEmpty();
    }

    @Test
    void rejectsMissingOrOversizedFields() {
        assertThatThrownBy(() -> validator.validate(null)).isInstanceOf(AiProviderException.class);
        assertThatThrownBy(() -> validator.validate(payload("", List.of(action(1, "Split the remaining work")))))
                .isInstanceOf(AiProviderException.class).hasMessageContaining("summary");
        assertThatThrownBy(() -> validator.validate(payload("x".repeat(601), List.of(action(1, "Split the remaining work")))))
                .isInstanceOf(AiProviderException.class);
        assertThatThrownBy(() -> validator.validate(payload("ok", List.of())))
                .isInstanceOf(AiProviderException.class);
        assertThatThrownBy(() -> validator.validate(payload("ok", Collections.nCopies(7, action(1, "Split the remaining work")))))
                .isInstanceOf(AiProviderException.class);
        assertThatThrownBy(() -> validator.validate(new AiExplanationPayload("ok", null, List.of(),
                List.of(action(1, "Split the remaining work")), null, null)))
                .isInstanceOf(AiProviderException.class).hasMessageContaining("potentialConsequences");
    }

    @Test
    void rejectsGenericAdvice() {
        assertThatThrownBy(() -> validator.validate(payload("ok", List.of(action(1, "Improve communication.")))))
                .isInstanceOf(AiProviderException.class)
                .satisfies(e -> assertThat(((AiProviderException) e).reason()).isEqualTo("invalid_output"));
        assertThatThrownBy(() -> validator.validate(payload("ok", List.of(action(1, "Do it")))))
                .isInstanceOf(AiProviderException.class);
    }
}
