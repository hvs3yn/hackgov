package com.foresight.risk.engine.rules;

import com.foresight.risk.engine.AnalysisContext;
import com.foresight.risk.engine.SignalBuilder;
import com.foresight.risk.engine.model.Evidence;
import com.foresight.risk.engine.model.ProjectSnapshot.MemberSnapshot;
import com.foresight.risk.engine.model.TaskSnapshot;

import java.util.Comparator;
import java.util.List;
import java.util.Map;

import static com.foresight.risk.engine.AnalysisContext.plural;
import static com.foresight.risk.engine.AnalysisContext.titles;

/** Shared evidence helpers so that every rule phrases recorded facts identically. */
final class TaskFacts {

    private TaskFacts() {
    }

    static void addStatusAndProgress(SignalBuilder b, TaskSnapshot t) {
        b.evidence(Evidence.fact("'" + t.title() + "' is " + t.state() + " with priority " + t.priority(),
                Map.of("status", t.state().name(), "priority", t.priority().name())));
        if (t.progressReported()) {
            b.evidence(Evidence.fact("Reported progress is " + t.progressPercentage() + "%",
                    Map.of("progressPercentage", t.progressPercentage())));
        } else {
            b.evidence(Evidence.fact("No progress percentage has ever been reported for this task"));
            b.missing("Progress of '" + t.title() + "' has never been reported");
        }
    }

    static void addAssignee(SignalBuilder b, AnalysisContext ctx, TaskSnapshot t) {
        if (t.assigneeId() == null) {
            b.evidence(Evidence.fact("'" + t.title() + "' has no assignee"));
            b.missing("No owner is assigned to '" + t.title() + "'");
        } else {
            b.evidence(Evidence.fact("Assigned to " + ctx.assigneeName(t),
                    Map.of("assigneeId", t.assigneeId().toString())));
        }
    }

    static void addIdle(SignalBuilder b, AnalysisContext ctx, TaskSnapshot t, long idleDays) {
        String since = t.lastProgressAt() != null ? "Last recorded progress was on " : "No progress recorded since creation on ";
        b.evidence(Evidence.fact(since + ctx.lastProgressDate(t) + " (" + plural(idleDays, "day") + " ago)",
                Map.of("idleDays", idleDays, "lastProgressDate", ctx.lastProgressDate(t).toString())));
    }

    /**
     * Names the contributing teammate (other than the assignee) with the fewest unfinished tasks, as a concrete
     * candidate for review or help. Recorded as a fact so recommendations stay grounded.
     */
    static void addPossibleHelper(SignalBuilder b, AnalysisContext ctx, TaskSnapshot t) {
        ctx.snapshot().members().stream()
                .filter(m -> m.canContribute() && !m.userId().equals(t.assigneeId()))
                .min(Comparator.comparingLong((MemberSnapshot m) -> openTasksOf(ctx, m))
                        .thenComparing(MemberSnapshot::name))
                .ifPresent(m -> {
                    b.evidence(Evidence.fact(m.name() + " has the fewest unfinished tasks in the project ("
                            + openTasksOf(ctx, m) + ")", Map.of("helperUserId", m.userId().toString())));
                });
    }

    private static long openTasksOf(AnalysisContext ctx, MemberSnapshot m) {
        return ctx.openTasks().stream().filter(o -> m.userId().equals(o.assigneeId())).count();
    }

    /** Adds downstream impact evidence and affected ids; returns the number of open downstream tasks. */
    static int addDownstream(SignalBuilder b, AnalysisContext ctx, TaskSnapshot t) {
        List<TaskSnapshot> downstream = ctx.openDownstream(t.id());
        if (!downstream.isEmpty()) {
            b.evidence(Evidence.fact(plural(downstream.size(), "unfinished task") + " depend on '" + t.title()
                            + "' directly or indirectly: " + titles(downstream, 4),
                    Map.of("downstreamCount", downstream.size())));
            b.affected(downstream.stream().map(TaskSnapshot::id).toList());
        }
        return downstream.size();
    }
}
