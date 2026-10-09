package com.foresight.recommendation.application;

import com.foresight.recommendation.infrastructure.AiGenerationRecord;
import com.foresight.recommendation.infrastructure.AiGenerationRecordRepository;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

/**
 * Best-effort, asynchronous log of explanation generations in MongoDB. A MongoDB outage only loses log entries;
 * it never blocks or fails risk analysis or inbox delivery.
 */
@Service
public class AiGenerationLog {

    private static final Logger log = LoggerFactory.getLogger(AiGenerationLog.class);

    private final AiGenerationRecordRepository records;
    private final MeterRegistry meters;

    public AiGenerationLog(AiGenerationRecordRepository records, MeterRegistry meters) {
        this.records = records;
        this.meters = meters;
    }

    /** Context identifying what an explanation was generated for. */
    public record GenerationContext(UUID assessmentId, UUID projectId, int revision) {
    }

    public record Entry(GenerationContext context, String category, String severity, String configuredProvider,
                        String model, String source, boolean providerUsed, String fallbackReason,
                        String errorMessage, long latencyMs, int recommendedActions, Instant at) {
    }

    public record AiGenerationView(String id, int revision, String configuredProvider, String model, String source,
                                   String outcome, String fallbackReason, String errorMessage, long latencyMs,
                                   int recommendedActions, Instant createdAt) {
        static AiGenerationView of(AiGenerationRecord r) {
            return new AiGenerationView(r.id(), r.revision(), r.configuredProvider(), r.model(), r.source(),
                    r.outcome(), r.fallbackReason(), r.errorMessage(), r.latencyMs(), r.recommendedActions(),
                    r.createdAt());
        }
    }

    @Async
    public void record(Entry e) {
        try {
            records.save(new AiGenerationRecord(null, e.context().assessmentId(), e.context().projectId(),
                    e.context().revision(), e.category(), e.severity(), e.configuredProvider(), e.model(), e.source(),
                    e.providerUsed() ? "PROVIDER" : "FALLBACK", e.fallbackReason(), truncate(e.errorMessage()),
                    e.latencyMs(), e.recommendedActions(), e.at()));
        } catch (RuntimeException ex) {
            meters.counter("foresight.ai.generation_log.failures").increment();
            log.warn("Could not write AI generation log entry for assessment {}: {}", e.context().assessmentId(),
                    ex.getClass().getSimpleName());
        }
    }

    public Page<AiGenerationView> forAssessment(UUID assessmentId, Pageable pageable) {
        return records.findByAssessmentId(assessmentId, pageable).map(AiGenerationView::of);
    }

    private static String truncate(String s) {
        return s == null || s.length() <= 300 ? s : s.substring(0, 300);
    }
}
