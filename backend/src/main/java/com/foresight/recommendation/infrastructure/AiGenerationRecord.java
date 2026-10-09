package com.foresight.recommendation.infrastructure;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.UUID;

/**
 * One explanation-generation attempt (MongoDB, collection {@code ai_generations}). Telemetry only: it never
 * contains prompts, credentials or model output text, and documents expire after 90 days (TTL index).
 *
 * @param outcome {@code PROVIDER} (validated AI output used) or {@code FALLBACK}
 */
@Document("ai_generations")
@CompoundIndex(name = "assessment_created", def = "{'assessmentId': 1, 'createdAt': -1}")
public record AiGenerationRecord(
        @Id String id,
        UUID assessmentId,
        UUID projectId,
        int revision,
        String category,
        String severity,
        String configuredProvider,
        String model,
        String source,
        String outcome,
        String fallbackReason,
        String errorMessage,
        long latencyMs,
        int recommendedActions,
        @Indexed(name = "ttl_created", expireAfter = "90d") Instant createdAt) {
}
