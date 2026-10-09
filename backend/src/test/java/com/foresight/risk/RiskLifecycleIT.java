package com.foresight.risk;

import com.foresight.inbox.application.RiskAlertDeliveryService;
import com.foresight.support.Api;
import com.foresight.support.Api.User;
import com.foresight.support.IntegrationTest;
import com.foresight.support.Scenario;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;

import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * End-to-end risk lifecycle through the public API: detection → inbox delivery → dedupe → resolution →
 * reappearance → escalation. Time is controlled with the test clock; delivery is invoked synchronously.
 */
class RiskLifecycleIT extends IntegrationTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 14);

    @Autowired
    RiskAlertDeliveryService delivery;

    private Scenario s;
    private String auth;
    private String apiIntegration;

    /** Ulvi's authentication task: due tomorrow, 20% done, no progress for two days; API integration depends on it. */
    private void ulviScenario() {
        clock.set(START.minus(Duration.ofDays(2)));
        s = new Scenario(api, TODAY.plusDays(16));
        auth = s.task(s.aydan, "Authentication module", s.ulvi, TODAY.plusDays(1), 16.0, "HIGH");
        apiIntegration = s.task(s.aydan, "API integration", s.huseyn, TODAY.plusDays(5), 8.0, "HIGH");
        s.depend(s.aydan, apiIntegration, auth);
        s.status(s.ulvi, auth, "IN_PROGRESS");
        s.progress(s.ulvi, auth, 20);
        clock.set(START);
    }

    private Api.Response analyze(User actor) {
        clock.advance(Duration.ofSeconds(11)); // stay clear of the manual-analysis cooldown
        return api.post(actor, "/api/v1/projects/" + s.projectId + "/risk-analysis", null);
    }

    private JsonNode inbox(User user) {
        return api.get(user, "/api/v1/inbox?disposition=OPEN,ACKNOWLEDGED,DISMISSED").json();
    }

    private JsonNode risks(String query) {
        return api.get(s.aydan, "/api/v1/projects/" + s.projectId + "/risks" + query).json();
    }

    private static JsonNode byCategory(JsonNode page, String category) {
        for (JsonNode n : page.path("content")) {
            if (category.equals(n.path("category").asString())) {
                return n;
            }
        }
        return null;
    }

    @Test
    void approachingDeadlineIsDetectedExplainedAndDeliveredToTheRightPeople() {
        ulviScenario();
        var result = analyze(s.ulvi);
        assertThat(result.status()).isEqualTo(200);
        assertThat(result.json().path("detected").asInt()).isGreaterThanOrEqualTo(1);

        JsonNode risk = byCategory(risks(""), "APPROACHING_DEADLINE");
        assertThat(risk).isNotNull();
        assertThat(risk.path("taskId").asString()).isEqualTo(auth);
        assertThat(risk.path("severity").asString()).isIn("HIGH", "CRITICAL");
        assertThat(risk.path("affectedTaskIds").toString()).contains(apiIntegration);

        var detail = api.get(s.ulvi, "/api/v1/risks/" + risk.path("id").asString()).json();
        assertThat(detail.path("factors").size()).isGreaterThan(3);
        assertThat(detail.path("evidence").toString()).contains("Reported progress is 20%", "2026-10-15");
        JsonNode explanation = detail.path("explanation");
        assertThat(explanation.path("source").asString()).isEqualTo("FALLBACK");
        assertThat(explanation.path("observedFacts").size()).isPositive();
        assertThat(explanation.path("recommendedActions").size()).isGreaterThanOrEqualTo(3);
        assertThat(explanation.path("confidenceNote").asString()).contains("not a probability");

        assertThat(delivery.deliverPending(50)).isPositive();

        // Ulvi (assignee), Aydan (lead) and Huseyn (owner of the dependent task, severity >= HIGH) are notified.
        for (User u : List.of(s.ulvi, s.aydan, s.huseyn)) {
            JsonNode item = byCategory(inbox(u), "APPROACHING_DEADLINE");
            assertThat(item).as("inbox of " + u.email()).isNotNull();
            assertThat(item.path("title").asString()).startsWith("Potential delay: 'Authentication module'");
            assertThat(item.path("read").asBoolean()).isFalse();
            assertThat(item.path("riskStatus").asString()).isEqualTo("ACTIVE");
            assertThat(item.path("taskTitle").asString()).isEqualTo("Authentication module");
            assertThat(item.path("links").path("task").asString()).isEqualTo("/api/v1/tasks/" + auth);
            assertThat(item.path("explanation").path("recommendedActions").get(0).path("action").asString()).isNotBlank();
        }
    }

    @Test
    void repeatedAnalysisDoesNotDuplicateRisksOrInboxItems() {
        ulviScenario();
        analyze(s.aydan);
        delivery.deliverPending(50);
        int itemsBefore = inbox(s.ulvi).path("totalElements").asInt();
        int risksBefore = risks("").path("totalElements").asInt();

        var again = analyze(s.aydan);
        assertThat(again.json().path("detected").asInt()).isZero();
        assertThat(again.json().path("unchanged").asInt()).isEqualTo(risksBefore);
        assertThat(delivery.deliverPending(50)).isZero();
        assertThat(inbox(s.ulvi).path("totalElements").asInt()).isEqualTo(itemsBefore);
        assertThat(risks("").path("totalElements").asInt()).isEqualTo(risksBefore);
        assertThat(jdbc.queryForObject("select count(*) from risk_assessments", Integer.class)).isEqualTo(risksBefore);
    }

    @Test
    void resolvedRiskStaysVisibleInInboxAndReappearsAsReopened() {
        ulviScenario();
        analyze(s.aydan);
        delivery.deliverPending(50);
        JsonNode item = byCategory(inbox(s.ulvi), "APPROACHING_DEADLINE");
        String itemId = item.path("id").asString();
        String riskId = item.path("riskId").asString();
        assertThat(api.post(s.ulvi, "/api/v1/inbox/" + itemId + "/dismiss", null).text("disposition")).isEqualTo("DISMISSED");

        // Completing the task resolves the risk; reading/dismissing alone never did.
        s.status(s.ulvi, auth, "DONE");
        var resolved = analyze(s.aydan);
        assertThat(resolved.json().path("resolved").asInt()).isPositive();
        var riskAfterDone = api.get(s.aydan, "/api/v1/risks/" + riskId).json().path("risk");
        assertThat(riskAfterDone.path("status").asString()).isEqualTo("RESOLVED");
        assertThat(riskAfterDone.path("resolutionReason").asString()).isEqualTo("TASK_CLOSED");
        assertThat(api.get(s.ulvi, "/api/v1/inbox/" + itemId).text("riskStatus")).isEqualTo("RESOLVED");
        assertThat(risks("").path("totalElements").asInt()).isZero();
        assertThat(risks("?status=RESOLVED").path("totalElements").asInt()).isPositive();

        // The task is reopened with little progress: same risk identity comes back as REOPENED.
        s.status(s.ulvi, auth, "IN_PROGRESS");
        s.progress(s.ulvi, auth, 10);
        var reopened = analyze(s.aydan);
        assertThat(reopened.json().path("reopened").asInt()).isEqualTo(1);
        delivery.deliverPending(50);

        JsonNode again = api.get(s.ulvi, "/api/v1/inbox/" + itemId).json();
        assertThat(again.path("riskStatus").asString()).isEqualTo("ACTIVE");
        assertThat(again.path("read").asBoolean()).isFalse();
        assertThat(again.path("disposition").asString()).isEqualTo("OPEN");
        assertThat(again.path("deliveredRevision").asInt()).isEqualTo(2);
        assertThat(inbox(s.ulvi).path("totalElements").asInt())
                .as("still one item per risk and recipient").isEqualTo(countItems(s.ulvi));

        List<String> events = new ArrayList<>();
        api.get(s.aydan, "/api/v1/risks/" + riskId + "/history?sort=occurredAt,asc").json().path("content")
                .forEach(e -> events.add(e.path("type").asString()));
        assertThat(events).containsSubsequence("DETECTED", "RESOLVED", "REOPENED");
    }

    @Test
    void overdueTaskIsReportedAndCompletedTaskIsNot() {
        s = new Scenario(api, TODAY.plusDays(20));
        String late = s.task(s.aydan, "Late report", s.ulvi, TODAY.minusDays(2), 4.0, "HIGH");
        String finished = s.task(s.aydan, "Finished report", s.ulvi, TODAY.minusDays(2), 4.0, "HIGH");
        s.status(s.ulvi, finished, "IN_PROGRESS");
        s.status(s.ulvi, finished, "DONE");
        analyze(s.aydan);
        JsonNode overdue = risks("?category=OVERDUE_TASK").path("content");
        assertThat(overdue.size()).isEqualTo(1);
        assertThat(overdue.get(0).path("taskId").asString()).isEqualTo(late);

        var taskRisks = api.get(s.ulvi, "/api/v1/tasks/" + late + "/risks").json();
        assertThat(taskRisks.size()).isPositive();
        assertThat(api.get(s.ulvi, "/api/v1/tasks/" + finished + "/risks").json().size()).isZero();

        var summary = api.get(s.ulvi, "/api/v1/projects/" + s.projectId + "/risk-summary").json();
        assertThat(summary.path("activeRisks").asInt()).isPositive();
        assertThat(summary.path("byCategory").path("OVERDUE_TASK").asInt()).isEqualTo(1);
        assertThat(summary.path("lastAnalyzedAt").isNull()).isFalse();
    }

    @Test
    void escalationResurfacesADismissedItem() {
        s = new Scenario(api, TODAY.plusDays(30));
        String t = s.task(s.aydan, "Landing page", s.ulvi, TODAY.plusDays(3), null, "MEDIUM");
        s.status(s.ulvi, t, "IN_PROGRESS");
        s.progress(s.ulvi, t, 50);
        analyze(s.aydan);
        JsonNode risk = byCategory(risks(""), "APPROACHING_DEADLINE");
        assertThat(risk.path("severity").asString()).isEqualTo("MEDIUM");
        delivery.deliverPending(50);
        JsonNode item = byCategory(inbox(s.ulvi), "APPROACHING_DEADLINE");
        api.post(s.ulvi, "/api/v1/inbox/" + item.path("id").asString() + "/dismiss", null);

        clock.advance(Duration.ofDays(3)); // due today, idle for 3 days
        var result = analyze(s.aydan);
        assertThat(result.json().path("escalated").asInt()).isEqualTo(1);
        delivery.deliverPending(50);
        JsonNode resurfaced = api.get(s.ulvi, "/api/v1/inbox/" + item.path("id").asString()).json();
        assertThat(resurfaced.path("disposition").asString()).isEqualTo("OPEN");
        assertThat(resurfaced.path("severity").asString()).isIn("HIGH", "CRITICAL");
    }

    @Test
    void manualAnalysisHasCooldownAndRequiresContributorRole() {
        s = new Scenario(api, TODAY.plusDays(30));
        clock.advance(Duration.ofSeconds(11));
        assertThat(api.post(s.aydan, "/api/v1/projects/" + s.projectId + "/risk-analysis", null).status()).isEqualTo(200);
        var tooSoon = api.post(s.aydan, "/api/v1/projects/" + s.projectId + "/risk-analysis", null);
        assertThat(tooSoon.status()).isEqualTo(429);
        assertThat(tooSoon.code()).isEqualTo("ANALYSIS_COOLDOWN");
        assertThat(tooSoon.raw().getResponse().getHeader("Retry-After")).isNotBlank();
    }

    private int countItems(User u) {
        return jdbc.queryForObject("select count(*) from inbox_items where recipient_id = ?::uuid", Integer.class, u.id());
    }
}
