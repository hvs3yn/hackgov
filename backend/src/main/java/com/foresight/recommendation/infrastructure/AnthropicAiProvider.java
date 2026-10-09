package com.foresight.recommendation.infrastructure;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.errors.AnthropicIoException;
import com.anthropic.errors.AnthropicServiceException;
import com.anthropic.errors.RateLimitException;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.OutputConfig;
import com.anthropic.models.messages.StopReason;
import com.anthropic.models.messages.StructuredMessage;
import com.anthropic.models.messages.StructuredMessageCreateParams;
import com.anthropic.models.messages.StructuredOutputConfig;
import com.anthropic.models.messages.StructuredTextBlock;
import com.foresight.recommendation.application.AiExplanationPayload;
import com.foresight.recommendation.application.AiProperties;
import com.foresight.recommendation.application.AiProvider;
import com.foresight.recommendation.application.ExplanationRequest;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Claude via the official Anthropic Java SDK with typed structured output. Enabled with
 * {@code APP_AI_PROVIDER=anthropic} and {@code ANTHROPIC_API_KEY}. The SDK retries 408/409/429/5xx and
 * connection errors ({@code maxRetries}); every remaining failure is mapped to {@link AiProviderException} so
 * the caller can fall back to the deterministic generator. Prompts and the API key are never logged.
 */
@Component
public class AnthropicAiProvider implements AiProvider {

    private static final Logger log = LoggerFactory.getLogger(AnthropicAiProvider.class);

    private final AiProperties properties;
    private final ExplanationPrompt prompt;
    private final AnthropicClient client;

    @Autowired
    public AnthropicAiProvider(AiProperties properties, ExplanationPrompt prompt) {
        this(properties, prompt, createClient(properties));
    }

    AnthropicAiProvider(AiProperties properties, ExplanationPrompt prompt, AnthropicClient client) {
        this.properties = properties;
        this.prompt = prompt;
        this.client = client;
        if (properties.anthropicEnabled() && client == null) {
            log.warn("APP_AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set; using deterministic explanations");
        }
    }

    private static AnthropicClient createClient(AiProperties properties) {
        if (!properties.anthropicEnabled() || properties.apiKey() == null || properties.apiKey().isBlank()) {
            return null;
        }
        return AnthropicOkHttpClient.builder()
                .apiKey(properties.apiKey())
                .timeout(properties.timeout())
                .maxRetries(properties.maxRetries())
                .build();
    }

    @Override
    public String name() {
        return "ANTHROPIC";
    }

    @Override
    public boolean isEnabled() {
        return client != null;
    }

    @Override
    public AiExplanationPayload generate(ExplanationRequest request) throws AiProviderException {
        if (client == null) {
            throw new AiProviderException("disabled", "Anthropic provider is not configured");
        }
        StructuredMessageCreateParams<AiExplanationPayload> params = MessageCreateParams.builder()
                .model(properties.model())
                .maxTokens(properties.maxTokens())
                .system(prompt.system())
                .outputConfig(StructuredOutputConfig.<AiExplanationPayload>builder()
                        .format(AiExplanationPayload.class)
                        .effort(OutputConfig.Effort.of(properties.effort()))
                        .build())
                .addUserMessage(prompt.user(request))
                .build();
        StructuredMessage<AiExplanationPayload> message;
        try {
            message = client.messages().create(params);
        } catch (RateLimitException e) {
            throw new AiProviderException("rate_limited", "Anthropic rate limit reached", e);
        } catch (AnthropicServiceException e) {
            throw new AiProviderException("api_error", "Anthropic API error " + e.statusCode(), e);
        } catch (AnthropicIoException e) {
            throw new AiProviderException("io_error", "Anthropic request failed or timed out", e);
        } catch (RuntimeException e) {
            throw new AiProviderException("invalid_output", "Could not obtain a structured response", e);
        }
        Optional<StopReason> stop = message.stopReason();
        if (stop.isPresent() && stop.get().equals(StopReason.REFUSAL)) {
            throw new AiProviderException("refusal", "Model declined the request");
        }
        if (stop.isPresent() && stop.get().equals(StopReason.MAX_TOKENS)) {
            throw new AiProviderException("truncated", "Response hit max_tokens");
        }
        try {
            return message.content().stream()
                    .flatMap(block -> block.text().stream())
                    .map(StructuredTextBlock::text)
                    .findFirst()
                    .orElseThrow(() -> new AiProviderException("invalid_output", "No structured text block"));
        } catch (AiProviderException e) {
            throw e;
        } catch (RuntimeException e) {
            throw new AiProviderException("invalid_output", "Structured output did not match the schema", e);
        }
    }

    @PreDestroy
    void close() {
        if (client != null) {
            client.close();
        }
    }
}
