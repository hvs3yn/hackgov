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
import java.util.Map;

import static com.foresight.risk.engine.AnalysisContext.plural;
import static com.foresight.risk.engine.AnalysisContext.priorityPoints;

/**
 * Rule 4: an unfinished task whose unfinished prerequisites threaten its schedule. Waiting on an on-schedule
 * prerequisite is normal and does not fire. Each threat type counts once, however many prerequisites share it.
 */
public final class BlockedDependencyRule implements RiskRule {

    @Override
    public List<RiskSignal> evaluate(AnalysisContext ctx) {
        List<RiskSignal> signals = new ArrayList<>();
        for (TaskSnapshot t : ctx.openTasks()) {
            List<TaskSnapshot> prerequisites = ctx.openPrerequisites(t.id());
            if (prerequisites.isEmpty()) {
                continue;
            }
            SignalBuilder b = SignalBuilder.forTask(RiskCategory.BLOCKED_DEPENDENCY, t.id())
                    .title("'" + t.title() + "' is blocked by " + plural(prerequisites.size(), "unfinished prerequisite"))
                    .affected(t.id());
            boolean overdue = false;
            boolean dueAfter = false;
            boolean blocked = false;
            boolean unassigned = false;
            for (TaskSnapshot p : prerequisites) {
                b.affected(p.id());
                b.evidence(Evidence.fact("'" + t.title() + "' depends on '" + p.title() + "' (" + p.state()
                                + (p.progressReported() ? ", " + p.progressPercentage() + "%" : "") + ", assigned to "
                                + ctx.assigneeName(p) + (p.dueDate() != null ? ", due " + p.dueDate() : "") + ")",
                        Map.of("prerequisiteId", p.id().toString())));
                if (ctx.isOverdue(p)) {
                    overdue = true;
                    b.evidence(Evidence.fact("Prerequisite '" + p.title() + "' was due on " + p.dueDate()
                            + " and is " + plural(-ctx.daysUntil(p.dueDate()), "day") + " overdue"));
                }
                if (p.dueDate() != null && t.dueDate() != null && p.dueDate().isAfter(t.dueDate())) {
                    dueAfter = true;
                    b.evidence(Evidence.fact("Prerequisite '" + p.title() + "' is due " + p.dueDate()
                            + ", after '" + t.title() + "' is due (" + t.dueDate() + ")"));
                }
                if (p.state() == TaskState.BLOCKED) {
                    blocked = true;
                }
                if (p.assigneeId() == null) {
                    unassigned = true;
                }
                if (p.dueDate() == null) {
                    b.missing("Prerequisite '" + p.title() + "' has no due date");
                    b.capConfidence(Confidence.MEDIUM);
                }
            }
            b.factor("PREREQ_OVERDUE", "A prerequisite is overdue", overdue ? 25 : 0);
            b.factor("PREREQ_DUE_AFTER", "A prerequisite is due after this task", dueAfter ? 20 : 0);
            b.factor("PREREQ_BLOCKED", "A prerequisite is itself blocked", blocked ? 10 : 0);
            b.factor("PREREQ_UNASSIGNED", "A prerequisite has no owner", unassigned ? 5 : 0);
            if (t.startDate() != null && !t.startDate().isAfter(ctx.today()) && !t.state().isStarted()) {
                b.factor("START_REACHED", "Planned start " + t.startDate() + " has been reached", 15);
                b.evidence(Evidence.fact("'" + t.title() + "' was planned to start on " + t.startDate()
                        + " but cannot start until its prerequisites are finished"));
            }
            boolean threatened = b.hasFactor("PREREQ_OVERDUE") || b.hasFactor("PREREQ_DUE_AFTER")
                    || b.hasFactor("PREREQ_BLOCKED") || b.hasFactor("PREREQ_UNASSIGNED") || b.hasFactor("START_REACHED");
            if (!threatened) {
                continue;
            }
            b.factor("BLOCKED_BY_PREREQUISITE", "Cannot proceed until prerequisites finish", 15);
            if (t.dueDate() != null && ctx.daysUntil(t.dueDate()) <= 7) {
                b.factor("DUE_WITHIN_WEEK", "'" + t.title() + "' is due " + t.dueDate(), 10);
            }
            b.factor("PRIORITY", t.priority() + " priority", priorityPoints(t.priority(), 10, 7, 3));
            int downstream = TaskFacts.addDownstream(b, ctx, t);
            b.factor("DOWNSTREAM", plural(downstream, "further dependent task") + " affected", Math.min(15, 5 * downstream));
            signals.add(b.build(ctx.scoring()));
        }
        return signals;
    }
}
