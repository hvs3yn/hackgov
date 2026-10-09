package com.foresight.recommendation.application;

import com.foresight.common.time.TimeProvider;
import com.foresight.recommendation.application.AiGenerationLog.Entry;
import com.foresight.recommendation.application.AiGenerationLog.GenerationContext;
import com.foresight.recommendation.application.AiProvider.AiProviderException;
import com.foresight.recommendation.application.ExplanationValidator.ValidatedPayload;
import com.foresight.risk.application.explanation.ExplanationPort;
import com.foresight.risk.application.explanation.ExplanationView;
import com.foresight.risk.domain.RiskAssessment;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * Produces explanations: the configured AI provider when enabled, validated; otherwise – or on any provider
 * failure – the deterministic generator. Must be called outside database transactions (it may perform a slow
 * network call). Every generation is recorded in the {@link AiGenerationLog}.
 */
@Service
public class ExplanationService implements ExplanationPort {

    private static final Logger log = LoggerFactory.getLogger(ExplanationService.class);

    private final AiProvider provider;
    private final ExplanationValidator validator;
    private final DeterministicExplanationGenerator fallback;
    private final ExplanationRequestFactory requests;
    private final AiGenerationLog generationLog;
    private final AiProperties aiProperties;
    private final TimeProvider time;
    private final MeterRegistry meters;

    public ExplanationService(AiProvider provider, ExplanationValidator validator,
                              DeterministicExplanationGenerator fallback, ExplanationRequestFactory requests,
                              AiGenerationLog generationLog, AiProperties aiProperties, TimeProvider time,
                              MeterRegistry meters) {
        this.provider = provider;
        this.validator = validator;
        this.fallback = fallback;
        this.requests = requests;
        this.generationLog = generationLog;
        this.aiProperties = aiProperties;
        this.time = time;
        this.meters = meters;
    }

    public ExplanationRequest requestFor(RiskAssessment assessment) {
        return requests.build(assessment);
    }

    public ExplanationView explain(ExplanationRequest request, GenerationContext context) {
        Instant now = time.now();
        long started = System.nanoTime();
        String reason = "provider_disabled";
        String error = null;
        if (provider.isEnabled()) {
            try {
                ValidatedPayload payload = validator.validate(provider.generate(request));
                meters.counter("foresight.ai.explanations", "source", provider.name()).increment();
                ExplanationView view = new ExplanationView(provider.name(), payload.summary(), request.facts(),
                        payload.inferences(), payload.potentialConsequences(), payload.actions(), payload.assumptions(),
                        merge(payload.unknowns(), request), DeterministicExplanationGenerator.confidenceNote(request), now);
                record(context, request, view, true, null, null, started, now);
                return view;
            } catch (AiProviderException e) {
                reason = e.reason();
                error = e.getMessage();
                meters.counter("foresight.ai.fallbacks", "reason", e.reason()).increment();
                log.warn("AI provider {} failed ({}): {}; using deterministic explanation", provider.name(),
                        e.reason(), e.getMessage());
            } catch (RuntimeException e) {
                reason = "unexpected";
                error = e.getClass().getSimpleName();
                meters.counter("foresight.ai.fallbacks", "reason", "unexpected").increment();
                log.warn("AI provider {} failed unexpectedly; using deterministic explanation", provider.name(), e);
            }
        }
        meters.counter("foresight.ai.explanations", "source", DeterministicExplanationGenerator.SOURCE).increment();
        ExplanationView view = fallback.generate(request, now);
        record(context, request, view, false, reason, error, started, now);
        return view;
    }

    @Override
    public ExplanationView deterministic(RiskAssessment assessment) {
        return fallback.generate(requests.build(assessment), time.now());
    }

    private void record(GenerationContext context, ExplanationRequest request, ExplanationView view,
                        boolean providerUsed, String reason, String error, long startedNanos, Instant now) {
        long latencyMs = (System.nanoTime() - startedNanos) / 1_000_000;
        generationLog.record(new Entry(context, request.category().name(), request.severity().name(),
                aiProperties.provider(), provider.isEnabled() ? aiProperties.model() : null, view.source(),
                providerUsed, reason, error, latencyMs, view.recommendedActions().size(), now));
    }

    /** Recorded missing data is always disclosed, even if the model omitted it. */
    private static List<String> merge(List<String> unknowns, ExplanationRequest request) {
        LinkedHashSet<String> all = new LinkedHashSet<>(request.missingData());
        all.addAll(unknowns);
        return List.copyOf(all);
    }
}
