package com.foresight.task;

import com.foresight.support.IntegrationTest;
import com.foresight.support.Scenario;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static com.foresight.support.Api.body;
import static org.assertj.core.api.Assertions.assertThat;

class TaskApiIT extends IntegrationTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 14);

    @Test
    void createListFilterSortAndPaginate() {
        Scenario s = new Scenario(api, TODAY.plusDays(20));
        s.task(s.aydan, "Authentication module", s.ulvi, TODAY.plusDays(1), 16.0, "HIGH");
        s.task(s.aydan, "API integration", s.huseyn, TODAY.plusDays(4), 8.0, "HIGH");
        s.task(s.aydan, "Old bug", s.huseyn, TODAY.minusDays(2), null, "LOW");
        s.task(s.ulvi, "Write docs", null, null, null, "MEDIUM");

        var all = api.get(s.huseyn, "/api/v1/projects/" + s.projectId + "/tasks?sort=dueDate,asc&size=2");
        assertThat(all.json().path("totalElements").asInt()).isEqualTo(4);
        assertThat(all.json().path("content").size()).isEqualTo(2);
        assertThat(all.json().path("content").get(0).path("title").asString()).isEqualTo("Old bug");

        var high = api.get(s.huseyn, "/api/v1/projects/" + s.projectId + "/tasks?priority=HIGH");
        assertThat(high.json().path("totalElements").asInt()).isEqualTo(2);
        var huseyns = api.get(s.huseyn, "/api/v1/projects/" + s.projectId + "/tasks?assigneeId=" + s.huseyn.id());
        assertThat(huseyns.json().path("totalElements").asInt()).isEqualTo(2);
        var overdue = api.get(s.huseyn, "/api/v1/projects/" + s.projectId + "/tasks?overdue=true");
        assertThat(titles(overdue.json())).containsExactly("Old bug");
        assertThat(overdue.json().path("content").get(0).path("overdue").asBoolean()).isTrue();
        var search = api.get(s.huseyn, "/api/v1/projects/" + s.projectId + "/tasks?q=INTEGR");
        assertThat(titles(search.json())).containsExactly("API integration");
        var unassigned = api.get(s.huseyn, "/api/v1/projects/" + s.projectId + "/tasks?unassigned=true");
        assertThat(titles(unassigned.json())).containsExactly("Write docs");
        var range = api.get(s.huseyn, "/api/v1/projects/" + s.projectId + "/tasks?dueFrom=" + TODAY + "&dueTo=" + TODAY.plusDays(2));
        assertThat(titles(range.json())).containsExactly("Authentication module");
    }

    @Test
    void lifecycleTransitionsAreValidatedAndRecorded() {
        Scenario s = new Scenario(api, TODAY.plusDays(20));
        String auth = s.task(s.aydan, "Auth", s.ulvi, TODAY.plusDays(3), 8.0, "HIGH");

        assertThat(s.status(s.ulvi, auth, "IN_REVIEW").code()).isEqualTo("INVALID_STATUS_TRANSITION");
        assertThat(s.status(s.ulvi, auth, "IN_PROGRESS").status()).isEqualTo(200);
        assertThat(s.progress(s.ulvi, auth, 40).json().path("progressPercentage").asInt()).isEqualTo(40);
        assertThat(s.progress(s.ulvi, auth, 140).status()).isEqualTo(400);
        var done = s.status(s.ulvi, auth, "DONE");
        assertThat(done.json().path("completedAt").isNull()).isFalse();
        assertThat(done.json().path("progressPercentage").asInt()).isEqualTo(100);
        assertThat(s.progress(s.ulvi, auth, 50).code()).isEqualTo("INVALID_STATUS_TRANSITION");
        var reopened = s.status(s.ulvi, auth, "IN_PROGRESS");
        assertThat(reopened.json().path("completedAt").isNull()).isTrue();

        var activity = api.get(s.aydan, "/api/v1/tasks/" + auth + "/activity").json().path("content");
        List<String> types = new ArrayList<>();
        activity.forEach(a -> types.add(a.path("type").asString()));
        assertThat(types).contains("CREATED", "ASSIGNEE_CHANGED", "STATUS_CHANGED", "PROGRESS_UPDATED");
        boolean reopenRecorded = false;
        for (JsonNode a : activity) {
            reopenRecorded |= "DONE".equals(a.path("oldValue").asString()) && "IN_PROGRESS".equals(a.path("newValue").asString());
        }
        assertThat(reopenRecorded).isTrue();
    }

    @Test
    void optimisticLockingRejectsStaleUpdates() {
        Scenario s = new Scenario(api, TODAY.plusDays(20));
        String auth = s.task(s.aydan, "Auth", s.ulvi, TODAY.plusDays(3), 8.0, "HIGH");
        long v = s.version(auth);
        var first = api.put(s.aydan, "/api/v1/tasks/" + auth, body("version", v, "title", "Auth v2", "priority", "CRITICAL",
                "dueDate", TODAY.plusDays(5).toString(), "estimatedHours", 10));
        assertThat(first.status()).isEqualTo(200);
        assertThat(first.json().path("version").asLong()).isGreaterThan(v);
        var stale = api.put(s.aydan, "/api/v1/tasks/" + auth, body("version", v, "title", "Auth v3"));
        assertThat(stale.status()).isEqualTo(409);
        assertThat(stale.code()).isEqualTo("VERSION_CONFLICT");
    }

    @Test
    void permissionRulesForContributors() {
        Scenario s = new Scenario(api, TODAY.plusDays(20));
        String huseynsTask = s.task(s.aydan, "Huseyn's", s.huseyn, null, null, "MEDIUM");
        String open = s.task(s.aydan, "Unassigned", null, null, null, "MEDIUM");

        // Ulvi may not edit or reassign someone else's task, nor assign others when creating.
        assertThat(s.status(s.ulvi, huseynsTask, "IN_PROGRESS").status()).isEqualTo(403);
        assertThat(api.put(s.ulvi, "/api/v1/tasks/" + huseynsTask + "/assignee",
                body("version", s.version(huseynsTask), "assigneeId", s.ulvi.id())).status()).isEqualTo(403);
        assertThat(s.createTask(s.ulvi, body("title", "X", "assigneeId", s.huseyn.id())).status()).isEqualTo(403);
        // ...but may take an unassigned task, and the lead may assign anyone.
        assertThat(api.put(s.ulvi, "/api/v1/tasks/" + open + "/assignee",
                body("version", s.version(open), "assigneeId", s.ulvi.id())).status()).isEqualTo(200);
        assertThat(api.put(s.aydan, "/api/v1/tasks/" + huseynsTask + "/assignee",
                body("version", s.version(huseynsTask), "assigneeId", s.ulvi.id())).status()).isEqualTo(200);
        // Viewers cannot be assignees.
        api.patch(s.aydan, "/api/v1/projects/" + s.projectId + "/members/" + s.huseyn.id(), body("role", "VIEWER"));
        var toViewer = api.put(s.aydan, "/api/v1/tasks/" + open + "/assignee",
                body("version", s.version(open), "assigneeId", s.huseyn.id()));
        assertThat(toViewer.code()).isEqualTo("INVALID_ASSIGNEE");
    }

    @Test
    void archivingHidesTaskAndRemovesItsDependencies() {
        Scenario s = new Scenario(api, TODAY.plusDays(20));
        String a = s.task(s.aydan, "A", s.ulvi, null, null, "MEDIUM");
        String b = s.task(s.aydan, "B", s.ulvi, null, null, "MEDIUM");
        assertThat(s.depend(s.aydan, b, a).status()).isEqualTo(201);
        assertThat(api.delete(s.aydan, "/api/v1/tasks/" + a + "?version=" + s.version(a)).status()).isEqualTo(204);
        assertThat(api.get(s.aydan, "/api/v1/tasks/" + a).status()).isEqualTo(404);
        assertThat(api.get(s.aydan, "/api/v1/tasks/" + b + "/dependencies").json().path("prerequisites").size()).isZero();
        assertThat(api.get(s.aydan, "/api/v1/projects/" + s.projectId + "/tasks").json().path("totalElements").asInt()).isEqualTo(1);
    }

    @Test
    void dependenciesAreValidatedAndGateProgress() {
        Scenario s = new Scenario(api, TODAY.plusDays(20));
        String auth = s.task(s.aydan, "Auth", s.ulvi, null, null, "HIGH");
        String apiTask = s.task(s.aydan, "API", s.huseyn, null, null, "HIGH");
        String ui = s.task(s.aydan, "UI", s.huseyn, null, null, "MEDIUM");

        assertThat(s.depend(s.aydan, apiTask, auth).status()).isEqualTo(201);
        assertThat(s.depend(s.aydan, ui, apiTask).status()).isEqualTo(201);
        assertThat(s.depend(s.aydan, apiTask, auth).code()).isEqualTo("DEPENDENCY_EXISTS");
        assertThat(s.depend(s.aydan, auth, auth).status()).isEqualTo(400);
        var cycle = s.depend(s.aydan, auth, ui);
        assertThat(cycle.status()).isEqualTo(409);
        assertThat(cycle.code()).isEqualTo("DEPENDENCY_CYCLE");
        assertThat(cycle.json().path("detail").asString()).contains("'Auth'", "'API'", "'UI'");

        // Cross-project prerequisite
        String other = api.post(s.aydan, "/api/v1/workspaces/" + s.workspaceId + "/projects", body("name", "Other")).text("id");
        String foreign = api.post(s.aydan, "/api/v1/projects/" + other + "/tasks", body("title", "Foreign")).text("id");
        assertThat(s.depend(s.aydan, apiTask, foreign).status()).isEqualTo(400);

        // API cannot start while Auth is unfinished
        var blocked = s.status(s.huseyn, apiTask, "IN_PROGRESS");
        assertThat(blocked.status()).isEqualTo(409);
        assertThat(blocked.code()).isEqualTo("DEPENDENCY_NOT_SATISFIED");
        s.status(s.ulvi, auth, "IN_PROGRESS");
        s.status(s.ulvi, auth, "DONE");
        assertThat(s.status(s.huseyn, apiTask, "IN_PROGRESS").status()).isEqualTo(200);

        var detail = api.get(s.huseyn, "/api/v1/tasks/" + apiTask).json();
        assertThat(detail.path("prerequisites").get(0).path("title").asString()).isEqualTo("Auth");
        assertThat(detail.path("dependents").get(0).path("title").asString()).isEqualTo("UI");
        assertThat(api.get(s.huseyn, "/api/v1/projects/" + s.projectId + "/dependencies").json()
                .path("totalElements").asInt()).isEqualTo(2);

        assertThat(api.delete(s.aydan, "/api/v1/tasks/" + ui + "/dependencies/" + apiTask).status()).isEqualTo(204);
        assertThat(api.delete(s.aydan, "/api/v1/tasks/" + ui + "/dependencies/" + apiTask).status()).isEqualTo(404);
    }

    @Test
    void inputIsNeverSilentlyChanged() {
        Scenario s = new Scenario(api, TODAY.plusDays(20));
        // numeric(7,2): more decimals are rejected instead of rounded by the database
        var precise = s.createTask(s.aydan, body("title", "Precise", "estimatedHours", 1.234));
        assertThat(precise.status()).isEqualTo(400);
        var ok = s.createTask(s.aydan, body("title", "Two decimals", "estimatedHours", 1.25));
        assertThat(ok.status()).isEqualTo(201);
        assertThat(api.get(s.aydan, "/api/v1/tasks/" + ok.text("id")).json().path("task").path("estimatedHours").asDouble())
                .isEqualTo(1.25);

        String t = ok.text("id");
        // integers must be JSON integers: no truncation of 50.9 and no "70" strings
        var fractional = api.post(s.aydan, "/api/v1/tasks/" + t + "/progress", body("version", s.version(t), "progressPercentage", 50.9));
        assertThat(fractional.status()).isEqualTo(400);
        assertThat(fractional.code()).isEqualTo("MALFORMED_REQUEST");
        var text = api.post(s.aydan, "/api/v1/tasks/" + t + "/progress", body("version", s.version(t), "progressPercentage", "70"));
        assertThat(text.status()).isEqualTo(400);
        assertThat(api.get(s.aydan, "/api/v1/tasks/" + t).json().path("task").path("progressPercentage").asInt()).isZero();
    }

    @Test
    void unstorableCharactersAreRejectedAsBadRequest() {
        Scenario s = new Scenario(api, TODAY.plusDays(20));
        var nulTitle = s.createTask(s.aydan, body("title", "bad\u0000title"));
        assertThat(nulTitle.status()).isEqualTo(400);
        assertThat(nulTitle.code()).isEqualTo("INVALID_ARGUMENT");
        var nulSearch = api.raw(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .get("/api/v1/projects/" + s.projectId + "/tasks").param("q", "a\u0000b")
                .header("Authorization", "Bearer " + s.aydan.token()));
        assertThat(nulSearch.status()).isEqualTo(400);
        assertThat(nulSearch.code()).isEqualTo("INVALID_ARGUMENT");
    }

    private static List<String> titles(JsonNode page) {
        List<String> titles = new ArrayList<>();
        page.path("content").forEach(t -> titles.add(t.path("title").asString()));
        return titles;
    }
}
