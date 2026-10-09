package com.foresight.recommendation;

import com.foresight.common.config.AppProperties;
import com.foresight.common.time.TimeProvider;
import com.foresight.recommendation.application.AiExplanationPayload;
import com.foresight.recommendation.application.AiGenerationLog;
import com.foresight.recommendation.application.AiGenerationLog.Entry;
import com.foresight.recommendation.application.AiGenerationLog.GenerationContext;
import com.foresight.recommendation.application.AiProperties;
import com.foresight.recommendation.application.AiProvider;
import com.foresight.recommendation.application.AiProvider.AiProviderException;
import com.foresight.recommendation.application.DeterministicExplanationGenerator;
import com.foresight.recommendation.application.ExplanationRequestFactory;
import com.foresight.recommendation.application.ExplanationService;
import com.foresight.recommendation.application.ExplanationValidator;
import com.foresight.risk.application.explanation.ExplanationView;
import com.foresight.risk.engine.model.RiskCategory;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ExplanationServiceTest {

    private final AiProvider provider = mock(AiProvider.class);
    private final AiGenerationLog log = mock(AiGenerationLog.class);
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final GenerationContext ctx = new GenerationContext(UUID.randomUUID(), UUID.randomUUID(), 1);
    private ExplanationService service;

    @BeforeEach
    void setUp() {
        when(provider.name()).thenReturn("ANTHROPIC");
        TimeProvider time = new TimeProvider(Clock.fixed(Instant.parse("2026-10-14T10:00:00Z"), ZoneOffset.UTC),
                new AppProperties(ZoneOffset.UTC, new AppProperties.Cors(List.of())));
        AiProperties ai = new AiProperties("anthropic", "claude-opus-5-5", "key", Duration.ofSeconds(30), 2, 4000, "medium");
        service = new ExplanationService(provider, new ExplanationValidator(), new DeterministicExplanationGenerator(),
                mock(ExplanationRequestFactory.class), log, ai, time, meters);
    }

    @Test
    void disabledProviderIsNeverCalled() throws Exception {
        when(provider.isEnabled()).thenReturn(false);
        ExplanationView view = service.explain(RecommendationFixtures.request(RiskCategory.OVERDUE_TASK), ctx);
        assertThat(view.source()).isEqualTo("FALLBACK");
        verify(provider, never()).generate(any());
        assertThat(loggedEntry().fallbackReason()).isEqualTo("provider_disabled");
    }

    @Test
    void validOutputIsUsedWithEngineFacts() throws Exception {
        when(provider.isEnabled()).thenReturn(true);
        when(provider.generate(any())).thenReturn(new AiExplanationPayload("Auth is late.", List.of(),
                List.of("Integration may slip"), List.of(new AiExplanationPayload.Action(1,
                "Split the remaining work on 'Authentication module'", "Time is short")), List.of(), List.of("Owner availability")));
        var request = RecommendationFixtures.request(RiskCategory.APPROACHING_DEADLINE);
        ExplanationView view = service.explain(request, ctx);
        assertThat(view.source()).isEqualTo("ANTHROPIC");
        assertThat(view.observedFacts()).isEqualTo(request.facts());
        assertThat(view.unknowns()).as("recorded missing data is always disclosed")
                .containsExactly("'Authentication module' has no time estimate", "Owner availability");
        Entry entry = loggedEntry();
        assertThat(entry.providerUsed()).isTrue();
        assertThat(entry.model()).isEqualTo("claude-opus-5-5");
    }

    @Test
    void providerErrorsTimeoutsAndInvalidOutputFallBack() throws Exception {
        when(provider.isEnabled()).thenReturn(true);
        when(provider.generate(any()))
                .thenThrow(new AiProviderException("rate_limited", "429"))
                .thenThrow(new AiProviderException("io_error", "timed out"))
                .thenReturn(new AiExplanationPayload(null, null, null, null, null, null))
                .thenThrow(new IllegalStateException("bug"));
        for (int i = 0; i < 4; i++) {
            assertThat(service.explain(RecommendationFixtures.request(RiskCategory.OVERDUE_TASK), ctx).source())
                    .isEqualTo("FALLBACK");
        }
        assertThat(meters.counter("foresight.ai.fallbacks", "reason", "rate_limited").count()).isEqualTo(1);
        assertThat(meters.counter("foresight.ai.fallbacks", "reason", "io_error").count()).isEqualTo(1);
        assertThat(meters.counter("foresight.ai.fallbacks", "reason", "invalid_output").count()).isEqualTo(1);
        assertThat(meters.counter("foresight.ai.fallbacks", "reason", "unexpected").count()).isEqualTo(1);
    }

    private Entry loggedEntry() {
        ArgumentCaptor<Entry> captor = ArgumentCaptor.forClass(Entry.class);
        verify(log).record(captor.capture());
        return captor.getValue();
    }
}
