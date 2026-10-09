package com.foresight.risk.engine.rules;

import com.foresight.risk.engine.AnalysisContext;
import com.foresight.risk.engine.RiskRule;
import com.foresight.risk.engine.SchedulePlanner;
import com.foresight.risk.engine.SchedulePlanner.Projection;
import com.foresight.risk.engine.SignalBuilder;
import com.foresight.risk.engine.model.Confidence;
import com.foresight.risk.engine.model.Evidence;
import com.foresight.risk.engine.model.Priority;
import com.foresight.risk.engine.model.ProjectSnapshot;
import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.RiskSignal;
import com.foresight.risk.engine.model.TaskSnapshot;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

import static com.foresight.risk.engine.AnalysisContext.plural;
import static com.foresight.risk.engine.AnalysisContext.titles;

/**
 * Rule 5: project-level deadline risk from a passed deadline, a projected slip, tasks scheduled past the
 * deadline, overdue work, or a cluster of high-priority work right before the deadline. Aggregates counts with
 * caps instead of summing task-level scores (no double counting).
 */
public final class ProjectDeadlineRule implements RiskRule {

    private final SchedulePlanner planner = new SchedulePlanner();

    @Override
    public List<RiskSignal> evaluate(AnalysisContext ctx) {
        ProjectSnapshot project = ctx.snapshot();
        LocalDate deadline = project.deadline();
        List<TaskSnapshot> open = ctx.openTasks();
        if (deadline == null || open.isEmpty()) {
            return List.of();
        }
        SignalBuilder b = SignalBuilder.forProject(RiskCategory.PROJECT_DEADLINE, project.projectId());
        long daysToDeadline = ctx.daysUntil(deadline);
        b.evidence(Evidence.fact("Project deadline is " + deadline + " with " + plural(open.size(), "unfinished task"),
                Map.of("deadline", deadline.toString(), "openTasks", open.size())));

        if (daysToDeadline < 0) {
            b.factor("DEADLINE_PASSED", "Project deadline passed " + plural(-daysToDeadline, "day") + " ago", 45);
            b.affected(open.stream().map(TaskSnapshot::id).toList());
        }

        Projection projection = planner.project(ctx);
        if (projection.projectedFinish() != null && projection.projectedFinish().isAfter(deadline)) {
            long daysLate = ChronoUnit.DAYS.between(deadline, projection.projectedFinish());
            b.factor("PROJECTED_SLIP", "Projected to finish " + plural(daysLate, "day") + " after the deadline",
                    (int) Math.min(40, 10 + 5 * daysLate));
            List<TaskSnapshot> chain = projection.criticalChain().stream().map(ctx::task).toList();
            b.evidence(Evidence.inference("A forward projection of the remaining work (estimates, dependencies and "
                            + "one task at a time per person) finishes on " + projection.projectedFinish()
                            + ", " + plural(daysLate, "day") + " after the deadline. Driving chain: " + titles(chain, 5),
                    Map.of("projectedFinish", projection.projectedFinish().toString(), "daysLate", daysLate)));
            b.affected(projection.criticalChain());
        }

        List<TaskSnapshot> dueAfter = open.stream()
                .filter(t -> t.dueDate() != null && t.dueDate().isAfter(deadline)).toList();
        if (!dueAfter.isEmpty()) {
            b.factor("TASKS_DUE_AFTER_DEADLINE", plural(dueAfter.size(), "task") + " due after the deadline",
                    Math.min(15, 5 * dueAfter.size()));
            b.evidence(Evidence.fact(plural(dueAfter.size(), "unfinished task") + " are due after the project deadline: "
                    + titles(dueAfter, 4)));
            b.affected(dueAfter.stream().map(TaskSnapshot::id).toList());
        }

        List<TaskSnapshot> overdue = open.stream().filter(ctx::isOverdue).toList();
        if (!overdue.isEmpty()) {
            b.factor("OVERDUE_TASKS", plural(overdue.size(), "overdue task"), Math.min(20, 5 * overdue.size()));
            b.evidence(Evidence.fact(plural(overdue.size(), "task") + " are overdue: " + titles(overdue, 4)));
            b.affected(overdue.stream().map(TaskSnapshot::id).toList());
        }

        if (daysToDeadline >= 0 && daysToDeadline <= 7) {
            List<TaskSnapshot> important = open.stream()
                    .filter(t -> t.priority() == Priority.HIGH || t.priority() == Priority.CRITICAL).toList();
            if (important.size() >= 3) {
                b.factor("HIGH_PRIORITY_CLUSTER", plural(important.size(), "high-priority task")
                        + " still open within a week of the deadline", 10);
                b.evidence(Evidence.fact(plural(important.size(), "HIGH/CRITICAL task") + " are unfinished "
                        + plural(daysToDeadline, "day") + " before the deadline: " + titles(important, 4)));
            }
        }

        if (!(b.hasFactor("DEADLINE_PASSED") || b.hasFactor("PROJECTED_SLIP") || b.hasFactor("TASKS_DUE_AFTER_DEADLINE")
                || b.hasFactor("OVERDUE_TASKS") || b.hasFactor("HIGH_PRIORITY_CLUSTER"))) {
            return List.of();
        }

        int coverage = projection.openTasks() == 0 ? 100
                : 100 * (projection.openTasks() - projection.tasksWithoutEstimate()) / projection.openTasks();
        if (projection.tasksWithoutEstimate() > 0) {
            b.missing(projection.tasksWithoutEstimate() + " of " + projection.openTasks()
                    + " unfinished tasks have no estimate (assumed one working day each in the projection)");
        }
        b.capConfidence(coverage >= 80 ? Confidence.HIGH : coverage >= 40 ? Confidence.MEDIUM : Confidence.LOW);
        b.title(daysToDeadline < 0
                ? "Project '" + project.name() + "' is past its deadline with unfinished work"
                : "Project '" + project.name() + "' may miss its deadline of " + deadline);
        return List.of(b.build(ctx.scoring()));
    }
}
