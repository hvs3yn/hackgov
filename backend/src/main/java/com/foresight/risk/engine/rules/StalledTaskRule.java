package com.foresight.risk.engine.rules;

import com.foresight.risk.engine.AnalysisContext;
import com.foresight.risk.engine.RiskRule;
import com.foresight.risk.engine.SignalBuilder;
import com.foresight.risk.engine.model.Confidence;
import com.foresight.risk.engine.model.Evidence;
import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.RiskSignal;
import com.foresight.risk.engine.model.TaskSnapshot;

import java.util.ArrayList;
import java.util.List;

import static com.foresight.risk.engine.AnalysisContext.plural;
import static com.foresight.risk.engine.AnalysisContext.priorityPoints;

/**
 * Rule 3: started task with no recorded progress for {@code stallDays}. Tasks that are overdue or inside the
 * approaching-deadline window are covered (with a stall factor) by those rules instead, to avoid double counting.
 * Requires recorded idle time: the evidence is the last recorded progress event, not merely an unchanged status.
 */
public final class StalledTaskRule implements RiskRule {

    @Override
    public List<RiskSignal> evaluate(AnalysisContext ctx) {
        List<RiskSignal> signals = new ArrayList<>();
        int stallDays = ctx.settings().stallDays();
        for (TaskSnapshot t : ctx.openTasks()) {
            if (!t.state().isStarted() || ctx.isOverdue(t) || ctx.isInApproachingWindow(t)) {
                continue;
            }
            long idle = ctx.idleDays(t);
            if (idle < stallDays) {
                continue;
            }
            SignalBuilder b = SignalBuilder.forTask(RiskCategory.STALLED_TASK, t.id())
                    .title("'" + t.title() + "' has shown no recorded progress for " + plural(idle, "day"))
                    .affected(t.id())
                    .capConfidence(Confidence.MEDIUM);
            b.factor("STALLED", "No recorded progress for " + plural(idle, "day"), 20);
            b.factor("EXTRA_IDLE", "Idle beyond the " + stallDays + "-day threshold",
                    (int) Math.min(20, 2 * (idle - stallDays)));
            TaskFacts.addIdle(b, ctx, t, idle);
            TaskFacts.addStatusAndProgress(b, t);
            TaskFacts.addAssignee(b, ctx, t);
            if (t.dueDate() != null && ctx.daysUntil(t.dueDate()) <= 7) {
                b.factor("DUE_WITHIN_WEEK", "Due on " + t.dueDate(), 10);
                b.evidence(Evidence.fact("Due on " + t.dueDate()));
            } else if (t.dueDate() == null) {
                b.missing("'" + t.title() + "' has no due date");
            }
            b.factor("PRIORITY", t.priority() + " priority", priorityPoints(t.priority(), 10, 7, 3));
            int downstream = TaskFacts.addDownstream(b, ctx, t);
            b.factor("DOWNSTREAM", plural(downstream, "dependent task") + " waiting", Math.min(15, 5 * downstream));
            b.evidence(Evidence.inference(
                    "Work may be happening without being recorded; the stall is based only on recorded updates"));
            signals.add(b.build(ctx.scoring()));
        }
        return signals;
    }
}
