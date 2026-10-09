package com.foresight.recommendation;

import com.foresight.inbox.application.RiskAlertDeliveryService;
import com.foresight.recommendation.application.AiExplanationPayload;
import com.foresight.recommendation.application.AiProvider;
import com.foresight.recommendation.application.AiProvider.AiProviderException;
import com.foresight.support.IntegrationTest;
import com.foresight.support.Scenario;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/** Delivery uses the AI provider when it works and falls back to deterministic text when it does not. */
class AiFallbackIT extends IntegrationTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 14);

    @MockitoBean
    AiProvider provider;

    @Autowired
    RiskAlertDeliveryService delivery;

    private Scenario scenario() {
        Scenario s = new Scenario(api, TODAY.plusDays(30));
        s.task(s.aydan, "Late report", s.ulvi, TODAY.minusDays(3), 4.0, "HIGH");
        clock.advance(Duration.ofSeconds(11));
        api.post(s.aydan, "/api/v1/projects/" + s.projectId + "/risk-analysis", null);
        return s;
    }

    private JsonNode firstExplanation(Scenario s) {
        return api.get(s.ulvi, "/api/v1/inbox").json().path("content").get(0).path("explanation");
    }

    @Test
    void validProviderOutputIsUsedButFactsStayGrounded() throws Exception {
        when(provider.isEnabled()).thenReturn(true);
        when(provider.name()).thenReturn("ANTHROPIC");
        when(provider.generate(any())).thenReturn(new AiExplanationPayload(
                "The report is three days late and blocks nothing else yet.",
                List.of("The owner may be overloaded"),
                List.of("The report could slip further"),
                List.of(new AiExplanationPayload.Action(2, "Ask Aydan to review the late report today", "Lead review"),
                        new AiExplanationPayload.Action(1, "Agree a new due date for 'Late report' with Ulvi", "Reset plan")),
                List.of(), List.of("Actual remaining effort")));
        Scenario s = scenario();
        delivery.deliverPending(50);

        JsonNode explanation = firstExplanation(s);
        assertThat(explanation.path("source").asString()).isEqualTo("ANTHROPIC");
        assertThat(explanation.path("recommendedActions").get(0).path("action").asString())
                .as("priorities are normalized").startsWith("Agree a new due date");
        assertThat(explanation.path("observedFacts").toString())
                .as("facts come from the engine, not the model").contains("was due on 2026-10-11");
        assertGenerationLogged(s, "PROVIDER", null);
    }

    @Test
    void providerFailureFallsBackToDeterministicExplanation() throws Exception {
        when(provider.isEnabled()).thenReturn(true);
        when(provider.name()).thenReturn("ANTHROPIC");
        when(provider.generate(any())).thenThrow(new AiProviderException("io_error", "timeout"));
        Scenario s = scenario();
        delivery.deliverPending(50);

        JsonNode explanation = firstExplanation(s);
        assertThat(explanation.path("source").asString()).isEqualTo("FALLBACK");
        assertThat(explanation.path("recommendedActions").size()).isGreaterThanOrEqualTo(2);
        assertGenerationLogged(s, "FALLBACK", "io_error");
    }

    @Test
    void generationLogIsOnlyVisibleToProjectMembers() throws Exception {
        when(provider.isEnabled()).thenReturn(false);
        Scenario s = scenario();
        delivery.deliverPending(50);
        String riskId = api.get(s.ulvi, "/api/v1/inbox").json().path("content").get(0).path("riskId").asString();
        var outsider = api.register("Outsider", "outsider@example.com");
        assertThat(api.get(outsider, "/api/v1/risks/" + riskId + "/ai-generations").status()).isEqualTo(404);
        assertGenerationLogged(s, "FALLBACK", "provider_disabled");
    }

    /** The log is written asynchronously (best effort), so poll briefly. */
    private void assertGenerationLogged(Scenario s, String outcome, String reason) {
        String riskId = api.get(s.ulvi, "/api/v1/inbox").json().path("content").get(0).path("riskId").asString();
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            JsonNode page = api.get(s.ulvi, "/api/v1/risks/" + riskId + "/ai-generations").json();
            assertThat(page.path("totalElements").asInt()).isEqualTo(1);
            JsonNode entry = page.path("content").get(0);
            assertThat(entry.path("outcome").asString()).isEqualTo(outcome);
            if (reason != null) {
                assertThat(entry.path("fallbackReason").asString()).isEqualTo(reason);
            }
            assertThat(entry.path("recommendedActions").asInt()).isPositive();
        });
    }

    @Test
    void invalidProviderOutputFallsBack() throws Exception {
        when(provider.isEnabled()).thenReturn(true);
        when(provider.name()).thenReturn("ANTHROPIC");
        when(provider.generate(any())).thenReturn(new AiExplanationPayload("", null, null, null, null, null));
        Scenario s = scenario();
        delivery.deliverPending(50);
        assertThat(firstExplanation(s).path("source").asString()).isEqualTo("FALLBACK");
    }

    @Test
    void unexpectedProviderCrashDoesNotLoseTheAlert() throws Exception {
        when(provider.isEnabled()).thenReturn(true);
        when(provider.name()).thenReturn("ANTHROPIC");
        when(provider.generate(any())).thenThrow(new IllegalStateException("boom"));
        Scenario s = scenario();
        delivery.deliverPending(50);
        assertThat(firstExplanation(s).path("source").asString()).isEqualTo("FALLBACK");
    }
}
