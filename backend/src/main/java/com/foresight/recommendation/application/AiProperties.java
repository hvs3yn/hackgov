package com.foresight.recommendation.application;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

/**
 * @param provider {@code none} (deterministic only) or {@code anthropic}
 * @param effort   Claude effort level (low|medium|high|xhigh|max)
 */
@ConfigurationProperties(prefix = "app.ai")
public record AiProperties(
        @DefaultValue("none") String provider,
        @DefaultValue("claude-opus-5-5") String model,
        String apiKey,
        @DefaultValue("PT30S") Duration timeout,
        @DefaultValue("2") int maxRetries,
        @DefaultValue("4000") long maxTokens,
        @DefaultValue("medium") String effort) {

    public boolean anthropicEnabled() {
        return "anthropic".equalsIgnoreCase(provider);
    }
}
