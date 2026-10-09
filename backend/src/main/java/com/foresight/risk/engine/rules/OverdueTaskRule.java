package com.foresight.risk.engine.rules;

import com.foresight.risk.engine.AnalysisContext;
import com.foresight.risk.engine.RiskRule;
import com.foresight.risk.engine.SignalBuilder;
import com.foresight.risk.engine.model.Evidence;
import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.RiskSignal;
import com.foresight.risk.engine.model.TaskSnapshot;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static com.foresight.risk.engine.AnalysisContext.plural;
import static com.foresight.risk.engine.AnalysisContext.priorityPoints;

/**
 * Rule 1: unfinished task whose due date has passed. Closed (DONE/CANCELLED) tasks never qualify.
 */
public final class OverdueTaskRule implements RiskRule {

    @Override
    public List<RiskSignal> evaluate(AnalysisContext ctx) {
        List<RiskSignal> signals = new ArrayList<>();
        for (TaskSnapshot t : ctx.openTasks()) {
            if (!ctx.isOverdue(t)) {
                continue;
            }
            long daysLate = -ctx.daysUntil(t.dueDate());
            SignalBuilder b = SignalBuilder.forTask(RiskCategory.OVERDUE_TASK, t.id())
                    .title("'" + t.title() + "' is " + plural(daysLate, "day") + " overdue")
                    .affected(t.id());
            b.factor("OVERDUE", "Task is past its due date", 35);
            b.factor("DAYS_LATE", plural(daysLate, "day") + " late", (int) Math.min(25, 5 * daysLate));
            b.factor("PRIORITY", t.priority() + " priority", priorityPoints(t.priority(), 15, 10, 5));
            b.evidence(Evidence.fact("'" + t.title() + "' was due on " + t.dueDate() + " and is not finished",
                    Map.of("dueDate", t.dueDate().toString(), "daysLate", daysLate)));
            TaskFacts.addStatusAndProgress(b, t);
            TaskFacts.addAssignee(b, ctx, t);
            int downstream = TaskFacts.addDownstream(b, ctx, t);
            b.factor("DOWNSTREAM", plural(downstream, "dependent task") + " waiting", Math.min(20, 5 * downstream));

            long idle = ctx.idleDays(t);
            if (idle >= ctx.settings().urgentStallDays()) {
                b.factor("STALLED", "No recorded progress for " + plural(idle, "day"), 10);
                TaskFacts.addIdle(b, ctx, t, idle);
            }
            if (t.progressReported() && t.progressPercentage() >= 80) {
                b.factor("NEARLY_DONE", "Reported " + t.progressPercentage() + "% complete", -10);
            }
            TaskFacts.addPossibleHelper(b, ctx, t);
            signals.add(b.build(ctx.scoring()));
        }
        return signals;
    }
}
