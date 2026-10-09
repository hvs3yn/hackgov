package com.foresight.recommendation.infrastructure;

import com.anthropic.client.AnthropicClient;
import com.anthropic.errors.AnthropicIoException;
import com.anthropic.models.messages.StopReason;
import com.anthropic.models.messages.StructuredMessage;
import com.anthropic.models.messages.StructuredMessageCreateParams;
import com.anthropic.services.blocking.MessageService;
import com.foresight.recommendation.application.AiExplanationPayload;
import com.foresight.recommendation.application.AiProperties;
import com.foresight.recommendation.application.AiProvider.AiProviderException;
import com.foresight.recommendation.application.ExplanationRequest;
import com.foresight.recommendation.application.ExplanationRequest.FactorLine;
import com.foresight.risk.engine.model.Confidence;
import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.Severity;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Provider error mapping without network calls (SDK client mocked). */
class AnthropicAiProviderTest {

    private final AiProperties properties = new AiProperties("anthropic", "claude-opus-5-5", "test-key",
            Duration.ofSeconds(5), 0, 4000, "medium");
    private final ExplanationPrompt prompt = new ExplanationPrompt(JsonMapper.builder().build());
    private final AnthropicClient client = mock(AnthropicClient.class);
    private final MessageService messages = mock(MessageService.class);

    private static ExplanationRequest request() {
        return new ExplanationRequest("P", LocalDate.of(2026, 10, 30), LocalDate.of(2026, 10, 14),
                RiskCategory.OVERDUE_TASK, Severity.HIGH, 60, Confidence.HIGH, "'Auth' is 2 days overdue",
                List.of(new FactorLine("Overdue", 35)), List.of("'Auth' was due on 2026-10-12"), List.of(), List.of(),
                null, null, List.of(), List.of(), List.of());
    }

    private AnthropicAiProvider provider() {
        when(client.messages()).thenReturn(messages);
        return new AnthropicAiProvider(properties, prompt, client);
    }

    @Test
    @SuppressWarnings("unchecked")
    void ioErrorsAreMappedForFallback() {
        AnthropicAiProvider provider = provider();
        when(messages.create(any(StructuredMessageCreateParams.class))).thenThrow(new AnthropicIoException("timeout"));
        assertThatThrownBy(() -> provider.generate(request()))
                .isInstanceOf(AiProviderException.class)
                .satisfies(e -> assertThat(((AiProviderException) e).reason()).isEqualTo("io_error"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void refusalAndTruncationAreRejected() {
        AnthropicAiProvider provider = provider();
        StructuredMessage<AiExplanationPayload> refusal = mock(StructuredMessage.class);
        when(refusal.stopReason()).thenReturn(Optional.of(StopReason.REFUSAL));
        StructuredMessage<AiExplanationPayload> truncated = mock(StructuredMessage.class);
        when(truncated.stopReason()).thenReturn(Optional.of(StopReason.MAX_TOKENS));
        when(messages.create(any(StructuredMessageCreateParams.class))).thenReturn(refusal, truncated);

        assertThatThrownBy(() -> provider.generate(request()))
                .satisfies(e -> assertThat(((AiProviderException) e).reason()).isEqualTo("refusal"));
        assertThatThrownBy(() -> provider.generate(request()))
                .satisfies(e -> assertThat(((AiProviderException) e).reason()).isEqualTo("truncated"));
    }

    @Test
    void providerWithoutKeyIsDisabled() {
        AnthropicAiProvider provider = new AnthropicAiProvider(
                new AiProperties("anthropic", "claude-opus-5-5", "", Duration.ofSeconds(5), 0, 4000, "medium"), prompt);
        assertThat(provider.isEnabled()).isFalse();
        assertThatThrownBy(() -> provider.generate(request())).isInstanceOf(AiProviderException.class);
    }

    @Test
    void promptContainsOnlyTheRequestData() {
        String user = prompt.user(request());
        assertThat(user).contains("'Auth' was due on 2026-10-12").doesNotContain("test-key");
        assertThat(prompt.system()).contains("not a probability").contains("Use only the data provided");
    }
}
