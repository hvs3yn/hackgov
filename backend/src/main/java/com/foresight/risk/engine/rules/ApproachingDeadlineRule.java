package com.foresight.risk.engine.rules;

import com.foresight.risk.engine.AnalysisContext;
import com.foresight.risk.engine.RiskRule;
import com.foresight.risk.engine.SignalBuilder;
import com.foresight.risk.engine.model.Confidence;
import com.foresight.risk.engine.model.Evidence;
import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.RiskSignal;
import com.foresight.risk.engine.model.TaskSnapshot;
import com.foresight.risk.engine.model.TaskState;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static com.foresight.risk.engine.AnalysisContext.plural;
import static com.foresight.risk.engine.AnalysisContext.priorityPoints;

/**
 * Rule 2: task due within {@code approachingDays} without sufficient evidence that it will be finished.
 * Fires only if at least one "pressure" factor exists (progress gap/unknown, capacity shortfall, not started,
 * blocked, stalled).
 */
public final class ApproachingDeadlineRule implements RiskRule {

    private static final List<String> PRESSURE = List.of(
            "LOW_PROGRESS", "PROGRESS_UNKNOWN", "CAPACITY_SHORTFALL", "NOT_STARTED", "BLOCKED", "STALLED");

    @Override
    public List<RiskSignal> evaluate(AnalysisContext ctx) {
        List<RiskSignal> signals = new ArrayList<>();
        for (TaskSnapshot t : ctx.openTasks()) {
            if (!ctx.isInApproachingWindow(t) || t.progressPercentage() >= 90) {
                continue;
            }
            long daysLeft = ctx.daysUntil(t.dueDate());
            String when = daysLeft == 0 ? "today" : daysLeft == 1 ? "tomorrow" : "in " + daysLeft + " days";
            SignalBuilder b = SignalBuilder.forTask(RiskCategory.APPROACHING_DEADLINE, t.id())
                    .title("'" + t.title() + "' is due " + when + (t.progressReported()
                            ? " at " + t.progressPercentage() + "% progress" : " with no reported progress"))
                    .affected(t.id());
            b.factor("DEADLINE_NEAR", "Due date is close", 15);
            b.factor("DUE_SOON", "Due " + when, daysLeft == 0 ? 20 : daysLeft == 1 ? 15 : daysLeft == 2 ? 10 : 5);
            b.evidence(Evidence.fact("'" + t.title() + "' is due on " + t.dueDate() + " (" + when + ")",
                    Map.of("dueDate", t.dueDate().toString(), "daysLeft", daysLeft)));
            TaskFacts.addStatusAndProgress(b, t);
            TaskFacts.addAssignee(b, ctx, t);

            if (t.progressReported()) {
                int p = t.progressPercentage();
                b.factor("LOW_PROGRESS", "Only " + p + "% complete", p < 25 ? 15 : p < 50 ? 10 : p < 75 ? 5 : 0);
            } else {
                b.factor("PROGRESS_UNKNOWN", "No progress has been reported", 5);
                b.capConfidence(Confidence.MEDIUM);
            }

            Double remaining = t.remainingHours();
            if (remaining != null) {
                int workingDays = ctx.calendar().workingDaysInclusive(ctx.today(), t.dueDate());
                double available = workingDays * ctx.settings().hoursPerDay();
                if (remaining > available) {
                    b.factor("CAPACITY_SHORTFALL", "Remaining estimate exceeds the working time left", 15);
                    b.evidence(Evidence.inference(String.format(Locale.ROOT,
                            "About %.1f estimated hours remain, with only %s (~%.0f h at %.0f h/day) left before the due date",
                            remaining, plural(workingDays, "working day"), available, ctx.settings().hoursPerDay()),
                            Map.of("remainingHours", remaining, "availableHours", available)));
                }
            } else {
                b.missing("'" + t.title() + "' has no time estimate");
                b.capConfidence(t.progressReported() ? Confidence.MEDIUM : Confidence.LOW);
            }

            if (t.state() == TaskState.TODO) {
                b.factor("NOT_STARTED", "Work has not started", 10);
            } else if (t.state() == TaskState.BLOCKED) {
                b.factor("BLOCKED", "Task is marked BLOCKED", 10);
            }
            long idle = ctx.idleDays(t);
            if (t.state().isStarted() && idle >= ctx.settings().urgentStallDays()) {
                b.factor("STALLED", "No recorded progress for " + plural(idle, "day"), 10);
                TaskFacts.addIdle(b, ctx, t, idle);
            }
            b.factor("PRIORITY", t.priority() + " priority", priorityPoints(t.priority(), 10, 7, 3));
            int downstream = TaskFacts.addDownstream(b, ctx, t);
            b.factor("DOWNSTREAM", plural(downstream, "dependent task") + " waiting", Math.min(15, 5 * downstream));

            if (PRESSURE.stream().anyMatch(b::hasFactor)) {
                TaskFacts.addPossibleHelper(b, ctx, t);
                signals.add(b.build(ctx.scoring()));
            }
        }
        return signals;
    }
}
