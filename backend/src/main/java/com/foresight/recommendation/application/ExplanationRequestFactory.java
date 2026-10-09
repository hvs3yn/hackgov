package com.foresight.recommendation.application;

import com.foresight.common.time.TimeProvider;
import com.foresight.project.application.ProjectQueryApi;
import com.foresight.project.application.ProjectQueryApi.MemberInfo;
import com.foresight.project.application.ProjectQueryApi.ProjectInfo;
import com.foresight.recommendation.application.ExplanationRequest.FactorLine;
import com.foresight.recommendation.application.ExplanationRequest.TaskContext;
import com.foresight.risk.application.AssessmentJson;
import com.foresight.risk.domain.RiskAssessment;
import com.foresight.risk.engine.model.Evidence;
import com.foresight.task.application.TaskQueryApi;
import com.foresight.task.application.TaskQueryApi.TaskData;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Builds the minimal {@link ExplanationRequest} for one assessment from its stored evidence plus the titles,
 * statuses and owner names of the tasks it references. Nothing else is included.
 */
@Component
public class ExplanationRequestFactory {

    private final AssessmentJson json;
    private final TaskQueryApi tasks;
    private final ProjectQueryApi projects;
    private final TimeProvider time;

    public ExplanationRequestFactory(AssessmentJson json, TaskQueryApi tasks, ProjectQueryApi projects,
                                     TimeProvider time) {
        this.json = json;
        this.tasks = tasks;
        this.projects = projects;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public ExplanationRequest build(RiskAssessment a) {
        ProjectInfo project = projects.get(a.getProjectId());
        Map<UUID, String> names = projects.members(a.getProjectId()).stream()
                .collect(Collectors.toMap(MemberInfo::userId, MemberInfo::fullName, (x, y) -> x));
        List<Evidence> evidence = json.evidence(a);
        List<UUID> affected = json.affectedTaskIds(a);

        Set<UUID> prerequisiteIds = new LinkedHashSet<>();
        List<String> helpers = new ArrayList<>();
        for (Evidence e : evidence) {
            Object prereq = e.data().get("prerequisiteId");
            if (prereq != null) {
                prerequisiteIds.add(UUID.fromString(prereq.toString()));
            }
            Object helper = e.data().get("helperUserId");
            if (helper != null) {
                String name = names.get(UUID.fromString(helper.toString()));
                if (name != null) {
                    helpers.add(name);
                }
            }
        }
        Set<UUID> needed = new LinkedHashSet<>(affected);
        needed.addAll(prerequisiteIds);
        if (a.getTaskId() != null) {
            needed.add(a.getTaskId());
        }
        Map<UUID, TaskData> taskData = tasks.byIds(needed).stream()
                .collect(Collectors.toMap(TaskData::id, Function.identity()));

        TaskContext subject = a.getTaskId() == null ? null : context(taskData.get(a.getTaskId()), names);
        List<TaskContext> prerequisites = prerequisiteIds.stream()
                .map(taskData::get).filter(t -> t != null).map(t -> context(t, names)).toList();
        List<TaskContext> others = affected.stream()
                .filter(id -> !id.equals(a.getTaskId()) && !prerequisiteIds.contains(id))
                .map(taskData::get).filter(t -> t != null).map(t -> context(t, names)).toList();

        return new ExplanationRequest(project.name(), project.deadline(), time.today(), a.getCategory(),
                a.getSeverity(), a.getScore(), a.getConfidence(), a.getTitle(),
                json.factors(a).stream().map(f -> new FactorLine(f.description(), f.points())).toList(),
                evidence.stream().filter(e -> e.kind() == Evidence.Kind.FACT).map(Evidence::statement).toList(),
                evidence.stream().filter(e -> e.kind() == Evidence.Kind.INFERENCE).map(Evidence::statement).toList(),
                json.missingData(a), subject,
                a.getSubjectUserId() == null ? null : names.get(a.getSubjectUserId()),
                others, prerequisites, helpers);
    }

    private static TaskContext context(TaskData t, Map<UUID, String> names) {
        if (t == null) {
            return null;
        }
        String assignee = t.assigneeId() == null ? null : names.getOrDefault(t.assigneeId(), "a former member");
        return new TaskContext(t.title(), t.status().name(), t.dueDate(), assignee, t.progressPercentage());
    }
}
