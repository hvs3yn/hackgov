package com.foresight.inbox.application;

import com.foresight.project.application.ProjectAccessService;
import com.foresight.project.application.ProjectQueryApi;
import com.foresight.risk.application.AssessmentJson;
import com.foresight.risk.domain.RiskAssessment;
import com.foresight.risk.engine.model.Evidence;
import com.foresight.risk.engine.model.Severity;
import com.foresight.task.application.TaskQueryApi;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Decides who must hear about a risk (docs/ai-risk-engine.md §10). Only users with current project access are
 * returned; the whole workspace is never notified by default.
 */
@Component
public class RecipientResolver {

    private final TaskQueryApi tasks;
    private final ProjectQueryApi projects;
    private final ProjectAccessService access;
    private final AssessmentJson json;

    public RecipientResolver(TaskQueryApi tasks, ProjectQueryApi projects, ProjectAccessService access,
                             AssessmentJson json) {
        this.tasks = tasks;
        this.projects = projects;
        this.access = access;
        this.json = json;
    }

    public List<UUID> resolve(RiskAssessment a) {
        Set<UUID> recipients = new LinkedHashSet<>();
        boolean high = a.getSeverity().isAtLeast(Severity.HIGH);
        switch (a.getCategory()) {
            case OVERDUE_TASK, APPROACHING_DEADLINE, STALLED_TASK -> {
                addIfPresent(recipients, tasks.assigneeOf(a.getTaskId()));
                if (high) {
                    recipients.addAll(tasks.assigneesOfDependents(a.getTaskId()));
                }
            }
            case BLOCKED_DEPENDENCY -> {
                addIfPresent(recipients, tasks.assigneeOf(a.getTaskId()));
                if (high) {
                    Set<UUID> prerequisites = new LinkedHashSet<>();
                    for (Evidence e : json.evidence(a)) {
                        Object id = e.data().get("prerequisiteId");
                        if (id != null) {
                            prerequisites.add(UUID.fromString(id.toString()));
                        }
                    }
                    recipients.addAll(tasks.assigneesOf(prerequisites));
                }
            }
            case WORKLOAD_IMBALANCE -> addIfPresent(recipients, a.getSubjectUserId());
            case PROJECT_DEADLINE -> {
                // project leads only (added below)
            }
        }
        recipients.addAll(projects.leadUserIds(a.getProjectId()));
        return recipients.stream()
                .filter(userId -> access.effectiveRole(a.getProjectId(), userId).isPresent())
                .toList();
    }

    private static void addIfPresent(Set<UUID> set, UUID id) {
        if (id != null) {
            set.add(id);
        }
    }
}
