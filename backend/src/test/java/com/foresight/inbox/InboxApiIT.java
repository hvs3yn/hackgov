package com.foresight.inbox;

import com.foresight.inbox.application.RiskAlertDeliveryService;
import com.foresight.support.IntegrationTest;
import com.foresight.support.Scenario;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;

import java.time.Duration;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

class InboxApiIT extends IntegrationTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 14);

    @Autowired
    RiskAlertDeliveryService delivery;

    private Scenario s;

    @BeforeEach
    void deliverTwoRisksToUlvi() {
        s = new Scenario(api, TODAY.plusDays(30));
        s.task(s.aydan, "Late report", s.ulvi, TODAY.minusDays(3), 4.0, "HIGH");
        s.task(s.aydan, "Slides", s.ulvi, TODAY.plusDays(1), null, "LOW");
        clock.advance(Duration.ofSeconds(11));
        api.post(s.aydan, "/api/v1/projects/" + s.projectId + "/risk-analysis", null);
        delivery.deliverPending(50);
    }

    @Test
    void listFilterAndPaginateOwnItems() {
        JsonNode all = api.get(s.ulvi, "/api/v1/inbox").json();
        assertThat(all.path("totalElements").asInt()).isEqualTo(2);
        assertThat(api.get(s.ulvi, "/api/v1/inbox/unread-count").json().path("unread").asInt()).isEqualTo(2);

        JsonNode overdue = api.get(s.ulvi, "/api/v1/inbox?category=OVERDUE_TASK").json();
        assertThat(overdue.path("totalElements").asInt()).isEqualTo(1);
        JsonNode high = api.get(s.ulvi, "/api/v1/inbox?severity=HIGH,CRITICAL").json();
        assertThat(high.path("totalElements").asInt()).isEqualTo(1);
        JsonNode project = api.get(s.ulvi, "/api/v1/inbox?projectId=" + s.projectId + "&size=1&sort=createdAt,asc").json();
        assertThat(project.path("content").size()).isEqualTo(1);
        assertThat(project.path("totalPages").asInt()).isEqualTo(2);
        JsonNode future = api.get(s.ulvi, "/api/v1/inbox?from=2030-01-01T00:00:00Z").json();
        assertThat(future.path("totalElements").asInt()).isZero();
    }

    @Test
    void readUnreadAcknowledgeAndDismiss() {
        String id = firstItemId();
        assertThat(api.post(s.ulvi, "/api/v1/inbox/" + id + "/read", null).json().path("read").asBoolean()).isTrue();
        assertThat(api.get(s.ulvi, "/api/v1/inbox?read=false").json().path("totalElements").asInt()).isEqualTo(1);
        assertThat(api.post(s.ulvi, "/api/v1/inbox/" + id + "/unread", null).json().path("read").asBoolean()).isFalse();

        var ack = api.post(s.ulvi, "/api/v1/inbox/" + id + "/acknowledge", null).json();
        assertThat(ack.path("disposition").asString()).isEqualTo("ACKNOWLEDGED");
        assertThat(ack.path("riskStatus").asString()).as("acknowledging does not resolve the risk").isEqualTo("ACTIVE");

        api.post(s.ulvi, "/api/v1/inbox/" + id + "/dismiss", null);
        assertThat(api.get(s.ulvi, "/api/v1/inbox").json().path("totalElements").asInt())
                .as("dismissed items are hidden by default").isEqualTo(1);
        assertThat(api.get(s.ulvi, "/api/v1/inbox?disposition=DISMISSED").json().path("totalElements").asInt()).isEqualTo(1);
    }

    @Test
    void otherUsersCannotSeeOrChangeMyItems() {
        String id = firstItemId();
        assertThat(api.get(s.huseyn, "/api/v1/inbox/" + id).status()).isEqualTo(404);
        assertThat(api.post(s.huseyn, "/api/v1/inbox/" + id + "/read", null).status()).isEqualTo(404);
        assertThat(api.get(s.huseyn, "/api/v1/inbox").json().path("totalElements").asInt())
                .as("Huseyn is not assignee or lead for these risks").isZero();
        assertThat(api.get(null, "/api/v1/inbox").status()).isEqualTo(401);
    }

    @Test
    void lowSeverityRisksAreNotPushedAndRemovedMembersLoseTheirItems() {
        // The LOW-priority "Slides" task due tomorrow without estimate scores below the MEDIUM notify threshold?
        JsonNode risks = api.get(s.aydan, "/api/v1/projects/" + s.projectId + "/risks?severity=LOW").json();
        for (JsonNode r : risks.path("content")) {
            int delivered = jdbc.queryForObject("select count(*) from inbox_items where assessment_id = ?::uuid",
                    Integer.class, r.path("id").asString());
            assertThat(delivered).isZero();
        }
        api.delete(s.aydan, "/api/v1/projects/" + s.projectId + "/members/" + s.ulvi.id());
        assertThat(api.get(s.ulvi, "/api/v1/inbox").json().path("totalElements").asInt()).isZero();
    }

    private String firstItemId() {
        return api.get(s.ulvi, "/api/v1/inbox?sort=createdAt,asc").json().path("content").get(0).path("id").asString();
    }
}
