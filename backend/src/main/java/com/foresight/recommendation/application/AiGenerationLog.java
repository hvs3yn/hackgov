package com.foresight.recommendation.application;

import com.foresight.common.time.TimeProvider;
import com.foresight.recommendation.infrastructure.AiGenerationRecord;
import com.foresight.recommendation.infrastructure.AiGenerationRecordRepository;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * Best-effort, asynchronous log of explanation generations (PostgreSQL table {@code ai_generations}). A failed
 * write only loses the log entry; it never blocks or fails risk analysis or inbox delivery. Entries are kept for
 * {@link #RETENTION}.
 */
@Service
public class AiGenerationLog {

    private static final Logger log = LoggerFactory.getLogger(AiGenerationLog.class);

    /** How long generation log entries are kept. */
    public static final Duration RETENTION = Duration.ofDays(90);

    private final AiGenerationRecordRepository records;
    private final MeterRegistry meters;
    private final TimeProvider time;

    public AiGenerationLog(AiGenerationRecordRepository records, MeterRegistry meters, TimeProvider time) {
        this.records = records;
        this.meters = meters;
        this.time = time;
    }

    /** Context identifying what an explanation was generated for. */
    public record GenerationContext(UUID assessmentId, UUID projectId, int revision) {
    }

    public record Entry(GenerationContext context, String category, String severity, String configuredProvider,
                        String model, String source, boolean providerUsed, String fallbackReason,
                        String errorMessage, long latencyMs, int recommendedActions, Instant at) {
    }

    public record AiGenerationView(UUID id, int revision, String configuredProvider, String model, String source,
                                   String outcome, String fallbackReason, String errorMessage, long latencyMs,
                                   int recommendedActions, Instant createdAt) {
        static AiGenerationView of(AiGenerationRecord r) {
            return new AiGenerationView(r.getId(), r.getRevision(), r.getConfiguredProvider(), r.getModel(),
                    r.getSource(), r.getOutcome(), r.getFallbackReason(), r.getErrorMessage(), r.getLatencyMs(),
                    r.getRecommendedActions(), r.getCreatedAt());
        }
    }

    @Async
    public void record(Entry e) {
        try {
            records.save(new AiGenerationRecord(e.context().assessmentId(), e.context().projectId(),
                    e.context().revision(), e.category(), e.severity(), e.configuredProvider(), e.model(), e.source(),
                    e.providerUsed() ? "PROVIDER" : "FALLBACK", e.fallbackReason(), truncate(e.errorMessage()),
                    e.latencyMs(), e.recommendedActions(), e.at()));
        } catch (RuntimeException ex) {
            meters.counter("foresight.ai.generation_log.failures").increment();
            log.warn("Could not write AI generation log entry for assessment {}: {}", e.context().assessmentId(),
                    ex.getClass().getSimpleName());
        }
    }

    @Transactional(readOnly = true)
    public Page<AiGenerationView> forAssessment(UUID assessmentId, Pageable pageable) {
        return records.findByAssessmentId(assessmentId, pageable).map(AiGenerationView::of);
    }

    /** Deletes entries older than {@link #RETENTION}. */
    @Scheduled(cron = "0 17 3 * * *", zone = "UTC")
    @Transactional
    public void purgeExpired() {
        int deleted = records.deleteCreatedBefore(time.now().minus(RETENTION));
        if (deleted > 0) {
            log.info("Purged {} AI generation log entries older than {} days", deleted, RETENTION.toDays());
        }
    }

    private static String truncate(String s) {
        return s == null || s.length() <= 300 ? s : s.substring(0, 300);
    }
}
