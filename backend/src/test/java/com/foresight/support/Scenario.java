package com.foresight.support;

import com.foresight.support.Api.User;

import java.time.LocalDate;
import java.util.Map;

import static com.foresight.support.Api.body;

/**
 * Builds the reference team used across API tests: Aydan (owner + project lead), Huseyn and Ulvi (members,
 * project contributors) and one project with a deadline.
 */
public class Scenario {

    public final Api api;
    public final User aydan;
    public final User huseyn;
    public final User ulvi;
    public final String workspaceId;
    public final String projectId;

    public Scenario(Api api, LocalDate deadline) {
        this.api = api;
        this.aydan = api.register("Aydan", "aydan@example.com");
        this.huseyn = api.register("Huseyn", "huseyn@example.com");
        this.ulvi = api.register("Ulvi", "ulvi@example.com");
        this.workspaceId = api.post(aydan, "/api/v1/workspaces", body("name", "Team")).text("id");
        for (String email : new String[]{"huseyn@example.com", "ulvi@example.com"}) {
            api.post(aydan, "/api/v1/workspaces/" + workspaceId + "/members", body("email", email, "role", "MEMBER"));
        }
        Map<String, Object> project = body("name", "Hackathon MVP", "startDate", deadline.minusDays(20).toString(),
                "deadline", deadline.toString());
        this.projectId = api.post(aydan, "/api/v1/workspaces/" + workspaceId + "/projects", project).text("id");
        for (User u : new User[]{huseyn, ulvi}) {
            api.post(aydan, "/api/v1/projects/" + projectId + "/members", body("userId", u.id(), "role", "CONTRIBUTOR"));
        }
    }

    public Api.Response createTask(User actor, Map<String, Object> fields) {
        return api.post(actor, "/api/v1/projects/" + projectId + "/tasks", fields);
    }

    public String task(User actor, String title, User assignee, LocalDate due, Double estimate, String priority) {
        Map<String, Object> fields = body("title", title, "priority", priority);
        if (assignee != null) {
            fields.put("assigneeId", assignee.id());
        }
        if (due != null) {
            fields.put("dueDate", due.toString());
        }
        if (estimate != null) {
            fields.put("estimatedHours", estimate);
        }
        Api.Response r = createTask(actor, fields);
        if (r.status() != 201) {
            throw new IllegalStateException("Task creation failed: " + r.body());
        }
        return r.text("id");
    }

    public long version(String taskId) {
        return api.get(aydan, "/api/v1/tasks/" + taskId).json().path("task").path("version").asLong();
    }

    public Api.Response status(User actor, String taskId, String status) {
        return api.post(actor, "/api/v1/tasks/" + taskId + "/status", body("version", version(taskId), "status", status));
    }

    public Api.Response progress(User actor, String taskId, int progress) {
        return api.post(actor, "/api/v1/tasks/" + taskId + "/progress",
                body("version", version(taskId), "progressPercentage", progress));
    }

    public Api.Response depend(User actor, String dependentId, String prerequisiteId) {
        return api.post(actor, "/api/v1/tasks/" + dependentId + "/dependencies", body("prerequisiteTaskId", prerequisiteId));
    }
}
