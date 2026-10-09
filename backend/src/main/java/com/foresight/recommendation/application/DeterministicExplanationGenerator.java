package com.foresight.recommendation.application;

import com.foresight.recommendation.application.ExplanationRequest.TaskContext;
import com.foresight.risk.application.explanation.ExplanationView;
import com.foresight.risk.application.explanation.ExplanationView.RecommendedAction;
import com.foresight.risk.engine.model.RiskCategory;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Template-based explanation and recommendations built only from the request's evidence. Used when no AI
 * provider is configured and whenever the provider fails. Never invents data: names, dates and counts all come
 * from the request.
 */
@Component
public class DeterministicExplanationGenerator {

    public static final String SOURCE = "FALLBACK";

    public ExplanationView generate(ExplanationRequest r, Instant now) {
        List<String> consequences = new ArrayList<>();
        List<Action> actions = new ArrayList<>();
        List<String> assumptions = new ArrayList<>();
        String summary;
        TaskContext task = r.subjectTask();
        String taskName = task == null ? null : quote(task.title());
        String owner = task == null || task.unassigned() ? null : task.assigneeName();
        List<TaskContext> dependents = r.affectedTasks();
        String dependentNames = names(dependents, 3);

        switch (r.category()) {
            case OVERDUE_TASK -> {
                summary = taskName + (owner != null ? " (assigned to " + owner + ")" : " (unassigned)")
                        + " is past its due date of " + task.dueDate() + " and is not finished."
                        + (dependents.isEmpty() ? "" : " " + count(dependents.size(), "task") + " depend on it.");
                if (owner == null) {
                    actions.add(new Action("Assign an owner to " + taskName + " so someone is accountable for finishing it",
                            "The task is overdue and nobody is assigned to it."));
                }
                actions.add(new Action("Agree a realistic new due date for " + taskName
                        + (owner != null ? " with " + owner : "") + " and record it in the task",
                        "The recorded due date has passed, so plans that depend on it are no longer reliable."));
                actions.add(new Action("Split the remaining work on " + taskName
                        + " into smaller tasks that can be finished and tracked separately",
                        "Smaller pieces make progress visible and let others help."));
                if (!dependents.isEmpty()) {
                    actions.add(new Action("Inform the owners of " + dependentNames + " about the delay and move "
                            + "forward work that does not depend on " + taskName,
                            "Dependent tasks cannot finish until " + taskName + " is done."));
                }
                actions.add(new Action("Ask a project lead to review what is blocking " + taskName,
                        "An outside review can unblock work that has slipped past its deadline."));
                if (!dependents.isEmpty()) {
                    consequences.add("Dependent tasks " + dependentNames + " may start or finish late");
                }
                consequences.add("The task will continue to slip unless its remaining work is re-planned");
            }
            case APPROACHING_DEADLINE -> {
                summary = taskName + (owner != null ? " (assigned to " + owner + ")" : "") + " is due on "
                        + task.dueDate() + " and the recorded data does not show that it is close to completion."
                        + (dependents.isEmpty() ? "" : " " + count(dependents.size(), "task") + " depend on it.");
                actions.add(new Action("Split the remaining work on " + taskName + " into smaller tasks and "
                        + "finish the most critical part first",
                        "Little time is left before the due date."));
                actions.add(new Action("Ask " + helperOrTeammate(r) + " to review or pair on " + taskName,
                        "A second person can speed up completion and catch problems early."));
                if (!dependents.isEmpty()) {
                    actions.add(new Action("Move independent tasks forward while " + taskName + " is completed, "
                            + "and prepare " + names(dependents, 2) + " so they can start immediately",
                            "Dependent work is waiting on this task."));
                    actions.add(new Action("Reassess the due date of " + quote(dependents.getFirst().title())
                            + " with the project lead if " + taskName + " is not finished on time",
                            "A delay here propagates to dependent tasks."));
                }
                if (r.missingData().stream().anyMatch(m -> m.contains("never been reported"))) {
                    actions.add(new Action("Ask " + (owner != null ? owner : "the owner") + " to record the current "
                            + "progress of " + taskName, "Without reported progress the risk cannot be assessed precisely."));
                }
                consequences.add(taskName + " may miss its due date of " + task.dueDate());
                if (!dependents.isEmpty()) {
                    consequences.add("Dependent tasks " + dependentNames + " may be delayed");
                }
            }
            case STALLED_TASK -> {
                summary = "No progress has been recorded on " + taskName + " recently"
                        + (owner != null ? " (assigned to " + owner + ")" : "") + ".";
                actions.add(new Action("Check in with " + (owner != null ? owner : "the team") + " about "
                        + taskName + " and record its current progress",
                        "The stall is based only on recorded updates; the work may be progressing unrecorded."));
                actions.add(new Action("If " + taskName + " is blocked, mark it BLOCKED and describe the blocker",
                        "Making blockers explicit lets the team help resolve them."));
                actions.add(new Action("Consider splitting " + taskName + " or, with a project lead, reassigning part of it",
                        "Long-idle tasks often hide unclear scope or overloaded owners."));
                consequences.add(taskName + " may not be finished by its due date if it stays idle");
                if (!dependents.isEmpty()) {
                    consequences.add("Dependent tasks " + dependentNames + " could be delayed");
                }
            }
            case BLOCKED_DEPENDENCY -> {
                String prereqs = names(r.prerequisites(), 3);
                summary = taskName + " cannot proceed until " + prereqs + " " + (r.prerequisites().size() == 1 ? "is" : "are")
                        + " finished, and the prerequisite schedule threatens its own due date"
                        + (task.dueDate() != null ? " of " + task.dueDate() : "") + ".";
                for (TaskContext p : r.prerequisites()) {
                    if (p.unassigned()) {
                        actions.add(new Action("Assign an owner to prerequisite " + quote(p.title()),
                                "Unowned prerequisites are unlikely to finish on time."));
                    } else {
                        actions.add(new Action("Agree with " + p.assigneeName() + " when " + quote(p.title())
                                + " will be finished and prioritize it", taskName + " depends on it."));
                    }
                    if (actions.size() >= 3) {
                        break;
                    }
                }
                actions.add(new Action("Start the parts of " + taskName + " that do not need " + prereqs,
                        "Doing independent work now reduces the delay once the prerequisites are done."));
                actions.add(new Action("Reassess the due date of " + taskName + " with the project lead",
                        "Its prerequisites are not on track to finish in time."));
                consequences.add(taskName + " may start late and miss its due date");
                if (!dependents.isEmpty()) {
                    consequences.add("Further dependent tasks may be delayed as well");
                }
            }
            case PROJECT_DEADLINE -> {
                summary = "Project " + quote(r.projectName()) + " is at risk of missing its deadline"
                        + (r.projectDeadline() != null ? " of " + r.projectDeadline() : "") + ".";
                if (!dependents.isEmpty()) {
                    actions.add(new Action("Review the work driving the schedule (" + names(dependents, 4)
                            + ") with the team and decide what scope can be cut or deferred",
                            "These tasks determine when the project can finish."));
                }
                actions.add(new Action("Resolve overdue and blocked tasks first and track them daily until done",
                        "Overdue work directly pushes the finish date."));
                actions.add(new Action("Discuss a deadline adjustment with stakeholders if scope cannot be reduced",
                        "An early, explicit decision is better than a missed deadline."));
                if (!r.missingData().isEmpty()) {
                    actions.add(new Action("Add estimates to unestimated open tasks to make the projection more reliable",
                            "The projection assumes one working day for every task without an estimate."));
                }
                consequences.add("The project may finish after its deadline");
                assumptions.add("The projection schedules each person's tasks one after another and respects dependencies");
            }
            case WORKLOAD_IMBALANCE -> {
                String user = r.subjectUserName() == null ? "This member" : r.subjectUserName();
                summary = user + " has more estimated work due soon than the available working time suggests.";
                if (!r.possibleHelpers().isEmpty() && !dependents.isEmpty()) {
                    actions.add(new Action("With a project lead, reassign " + quote(dependents.getLast().title())
                            + " from " + user + " to " + r.possibleHelpers().getFirst(),
                            r.possibleHelpers().getFirst() + " has less work due in the same period."));
                }
                actions.add(new Action("Agree with " + user + " which of " + names(dependents, 3)
                        + " must be finished first and which can move",
                        "Explicit priorities prevent everything from slipping at once."));
                actions.add(new Action("Split large tasks assigned to " + user + " so parts can be shared",
                        "Smaller tasks are easier to redistribute."));
                consequences.add("Several of " + user + "'s tasks may miss their due dates at the same time");
                assumptions.add("Capacity assumes a fixed number of working hours per day; calendars and other projects are unknown");
            }
            default -> throw new IllegalStateException("Unsupported category " + r.category());
        }
        if (r.missingData().stream().anyMatch(m -> m.contains("no time estimate")) && r.category() != RiskCategory.PROJECT_DEADLINE) {
            actions.add(new Action("Add a time estimate to " + taskName, "Estimates make the risk assessment more precise."));
        }
        assumptions.add("Only progress recorded in Foresight is known; work done outside the system is not visible");

        List<RecommendedAction> numbered = new ArrayList<>();
        for (Action a : actions.stream().limit(6).toList()) {
            numbered.add(new RecommendedAction(numbered.size() + 1, a.text(), a.rationale()));
        }
        return new ExplanationView(SOURCE, summary, r.facts(), r.inferences(), consequences, numbered, assumptions,
                r.missingData(), confidenceNote(r), now);
    }

    public static String confidenceNote(ExplanationRequest r) {
        return "Heuristic risk score " + r.score() + "/100 (" + r.severity() + "). This is a prioritization score, "
                + "not a probability. Confidence " + r.confidence() + " reflects how complete the underlying data is.";
    }

    private record Action(String text, String rationale) {
    }

    private static String helperOrTeammate(ExplanationRequest r) {
        return r.possibleHelpers().isEmpty() ? "another team member" : r.possibleHelpers().getFirst();
    }

    private static String quote(String s) {
        return "'" + s + "'";
    }

    private static String count(int n, String noun) {
        return n + " " + (n == 1 ? noun : noun + "s");
    }

    private static String names(List<TaskContext> tasks, int max) {
        String joined = tasks.stream().limit(max).map(t -> quote(t.title())).collect(Collectors.joining(", "));
        return tasks.size() > max ? joined + " and " + (tasks.size() - max) + " more" : joined;
    }
}
