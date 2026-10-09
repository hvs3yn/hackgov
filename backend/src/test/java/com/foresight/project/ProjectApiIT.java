package com.foresight.project;

import com.foresight.support.Api.User;
import com.foresight.support.IntegrationTest;
import com.foresight.support.Scenario;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static com.foresight.support.Api.body;
import static org.assertj.core.api.Assertions.assertThat;

class ProjectApiIT extends IntegrationTest {

    private static final LocalDate DEADLINE = LocalDate.of(2026, 10, 30);

    @Test
    void creatorIsLeadAndMembersSeeOnlyTheirProjects() {
        Scenario s = new Scenario(api, DEADLINE);
        var project = api.get(s.ulvi, "/api/v1/projects/" + s.projectId);
        assertThat(project.status()).isEqualTo(200);
        assertThat(project.text("myRole")).isEqualTo("CONTRIBUTOR");

        // A project Ulvi is not a member of is invisible to him (but visible to the workspace owner).
        String secret = api.post(s.aydan, "/api/v1/workspaces/" + s.workspaceId + "/projects", body("name", "Secret")).text("id");
        assertThat(api.get(s.ulvi, "/api/v1/projects/" + secret).status()).isEqualTo(404);
        var ulviList = api.get(s.ulvi, "/api/v1/workspaces/" + s.workspaceId + "/projects");
        assertThat(ulviList.json().path("totalElements").asInt()).isEqualTo(1);
        var ownerList = api.get(s.aydan, "/api/v1/workspaces/" + s.workspaceId + "/projects");
        assertThat(ownerList.json().path("totalElements").asInt()).isEqualTo(2);
    }

    @Test
    void crossWorkspaceAccessByIdSwappingIsImpossible() {
        Scenario s = new Scenario(api, DEADLINE);
        User mallory = api.register("Mallory", "mallory@example.com");
        String otherWs = api.post(mallory, "/api/v1/workspaces", body("name", "Evil")).text("id");
        String taskId = s.task(s.aydan, "Authentication module", s.ulvi, DEADLINE, 8.0, "HIGH");

        assertThat(api.get(mallory, "/api/v1/projects/" + s.projectId).status()).isEqualTo(404);
        assertThat(api.get(mallory, "/api/v1/projects/" + s.projectId + "/tasks").status()).isEqualTo(404);
        assertThat(api.get(mallory, "/api/v1/tasks/" + taskId).status()).isEqualTo(404);
        assertThat(api.get(mallory, "/api/v1/projects/" + s.projectId + "/risks").status()).isEqualTo(404);
        assertThat(api.post(mallory, "/api/v1/projects/" + s.projectId + "/tasks", body("title", "x")).status()).isEqualTo(404);
        // Adding a non-workspace member to a project is rejected; DB composite FK guarantees it as well.
        var add = api.post(s.aydan, "/api/v1/projects/" + s.projectId + "/members", body("userId", mallory.id(), "role", "VIEWER"));
        assertThat(add.status()).isEqualTo(400);
        assertThat(api.get(s.aydan, "/api/v1/workspaces/" + otherWs).status()).isEqualTo(404);
    }

    @Test
    void onlyLeadsCanEditAndVersionConflictsAreDetected() {
        Scenario s = new Scenario(api, DEADLINE);
        var current = api.get(s.aydan, "/api/v1/projects/" + s.projectId);
        long version = current.json().path("version").asLong();

        assertThat(api.patch(s.ulvi, "/api/v1/projects/" + s.projectId, body("version", version, "name", "X")).status())
                .isEqualTo(403);
        var updated = api.patch(s.aydan, "/api/v1/projects/" + s.projectId,
                body("version", version, "name", "Renamed", "clearDeadline", true));
        assertThat(updated.status()).isEqualTo(200);
        assertThat(updated.text("name")).isEqualTo("Renamed");
        assertThat(updated.json().path("deadline").isNull()).isTrue();

        var stale = api.patch(s.aydan, "/api/v1/projects/" + s.projectId, body("version", version, "name", "Again"));
        assertThat(stale.status()).isEqualTo(409);
        assertThat(stale.code()).isEqualTo("VERSION_CONFLICT");
    }

    @Test
    void archivedProjectsAreReadOnlyUntilRestored() {
        Scenario s = new Scenario(api, DEADLINE);
        assertThat(api.post(s.aydan, "/api/v1/projects/" + s.projectId + "/archive", null).text("status")).isEqualTo("ARCHIVED");
        var create = s.createTask(s.aydan, body("title", "Late task"));
        assertThat(create.status()).isEqualTo(409);
        assertThat(create.code()).isEqualTo("PROJECT_READ_ONLY");
        assertThat(api.post(s.aydan, "/api/v1/projects/" + s.projectId + "/restore", null).text("status")).isEqualTo("ACTIVE");
        assertThat(s.createTask(s.aydan, body("title", "Late task")).status()).isEqualTo(201);
    }

    @Test
    void removingAMemberUnassignsTheirOpenTasksAndKeepsALead() {
        Scenario s = new Scenario(api, DEADLINE);
        String taskId = s.task(s.aydan, "Auth", s.ulvi, DEADLINE, null, "HIGH");
        assertThat(api.delete(s.aydan, "/api/v1/projects/" + s.projectId + "/members/" + s.ulvi.id()).status()).isEqualTo(204);

        var task = api.get(s.aydan, "/api/v1/tasks/" + taskId).json().path("task");
        assertThat(task.path("assignee").isNull()).isTrue();
        var activity = api.get(s.aydan, "/api/v1/tasks/" + taskId + "/activity").json().path("content");
        java.util.List<String> types = new java.util.ArrayList<>();
        activity.forEach(a -> types.add(a.path("type").asString()));
        assertThat(types).contains("UNASSIGNED_BY_MEMBERSHIP_CHANGE");
        assertThat(api.get(s.ulvi, "/api/v1/projects/" + s.projectId).status()).isEqualTo(404);

        // Aydan is the only explicit lead.
        var lastLead = api.patch(s.aydan, "/api/v1/projects/" + s.projectId + "/members/" + s.aydan.id(), body("role", "VIEWER"));
        assertThat(lastLead.code()).isEqualTo("LAST_LEAD");
    }

    @Test
    void viewersCanReadButNotWrite() {
        Scenario s = new Scenario(api, DEADLINE);
        api.patch(s.aydan, "/api/v1/projects/" + s.projectId + "/members/" + s.huseyn.id(), body("role", "VIEWER"));
        assertThat(api.get(s.huseyn, "/api/v1/projects/" + s.projectId + "/tasks").status()).isEqualTo(200);
        assertThat(s.createTask(s.huseyn, body("title", "Nope")).status()).isEqualTo(403);
        assertThat(api.post(s.huseyn, "/api/v1/projects/" + s.projectId + "/risk-analysis", null).status()).isEqualTo(403);
    }
}
