package com.foresight.risk.engine.rules;

import com.foresight.risk.engine.AnalysisContext;
import com.foresight.risk.engine.RiskRule;
import com.foresight.risk.engine.SignalBuilder;
import com.foresight.risk.engine.model.Confidence;
import com.foresight.risk.engine.model.Evidence;
import com.foresight.risk.engine.model.ProjectSnapshot.MemberSnapshot;
import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.RiskSignal;
import com.foresight.risk.engine.model.TaskSnapshot;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import static com.foresight.risk.engine.AnalysisContext.plural;
import static com.foresight.risk.engine.AnalysisContext.titles;

/**
 * Rule 6: a member's estimated remaining work due within the horizon exceeds their available working time.
 * Calendars, working hours and other projects are unknown, so confidence never exceeds MEDIUM.
 */
public final class WorkloadImbalanceRule implements RiskRule {

    private record Load(UUID userId, List<TaskSnapshot> tasks, double estimatedHours, double maxRatio,
                        int withoutEstimate, int overdue) {
    }

    @Override
    public List<RiskSignal> evaluate(AnalysisContext ctx) {
        LocalDate horizonEnd = ctx.today().plusDays(ctx.settings().workloadHorizonDays());
        Map<UUID, List<TaskSnapshot>> byAssignee = new LinkedHashMap<>();
        for (TaskSnapshot t : ctx.openTasks()) {
            if (t.assigneeId() != null && t.dueDate() != null && !t.dueDate().isAfter(horizonEnd)) {
                byAssignee.computeIfAbsent(t.assigneeId(), k -> new ArrayList<>()).add(t);
            }
        }
        Map<UUID, Load> loads = new LinkedHashMap<>();
        for (MemberSnapshot member : ctx.snapshot().members()) {
            if (member.canContribute()) {
                loads.put(member.userId(), load(ctx, member.userId(), byAssignee.getOrDefault(member.userId(), List.of())));
            }
        }

        List<RiskSignal> signals = new ArrayList<>();
        for (Load load : loads.values()) {
            if (load.tasks().isEmpty()) {
                continue;
            }
            MemberSnapshot member = ctx.member(load.userId());
            // A single task's shortfall is reported by the deadline rules (CAPACITY_SHORTFALL); overload means
            // several tasks competing for the same person's time, so at least two are required.
            boolean overloaded = load.tasks().size() >= 2
                    && load.maxRatio() > ctx.settings().workloadOverloadRatio();
            boolean mostlyUnestimated = load.withoutEstimate() * 2 > load.tasks().size();
            boolean countFallback = !overloaded && mostlyUnestimated
                    && load.tasks().size() >= ctx.settings().workloadTaskCountThreshold();
            if (!overloaded && !countFallback) {
                continue;
            }
            SignalBuilder b = SignalBuilder.forUser(RiskCategory.WORKLOAD_IMBALANCE, load.userId())
                    .title(member.name() + " may be overloaded: " + plural(load.tasks().size(), "task")
                            + " due by " + horizonEnd)
                    .capConfidence(mostlyUnestimated ? Confidence.LOW : Confidence.MEDIUM)
                    .affected(load.tasks().stream().map(TaskSnapshot::id).toList());
            b.factor("WORKLOAD", "Concentrated workload", 20);
            if (overloaded) {
                b.factor("OVERLOAD_RATIO", String.format(Locale.ROOT, "Estimated work is %.1fx the available time",
                        load.maxRatio()), (int) Math.min(35, Math.round((load.maxRatio() - 1) * 50)));
                b.evidence(Evidence.inference(String.format(Locale.ROOT,
                        "%s has %.1f estimated hours of unfinished work due by %s; at the busiest due date this is "
                                + "%.1fx the working time available (%.0f h per working day assumed)",
                        member.name(), load.estimatedHours(), horizonEnd, load.maxRatio(), ctx.settings().hoursPerDay()),
                        Map.of("estimatedHours", load.estimatedHours(), "ratio", load.maxRatio())));
            } else {
                b.factor("TASK_COUNT", plural(load.tasks().size(), "task") + " due within "
                        + ctx.settings().workloadHorizonDays() + " days", 10);
            }
            b.evidence(Evidence.fact(member.name() + " is assigned " + plural(load.tasks().size(), "unfinished task")
                    + " due by " + horizonEnd + ": " + titles(load.tasks(), 5),
                    Map.of("taskCount", load.tasks().size())));
            if (load.overdue() > 0) {
                b.factor("OVERDUE_ASSIGNED", plural(load.overdue(), "overdue task") + " assigned",
                        Math.min(15, 5 * load.overdue()));
            }
            if (load.withoutEstimate() > 0) {
                b.missing(load.withoutEstimate() + " of " + member.name() + "'s tasks have no estimate");
            }
            b.missing("Working hours, calendars and work in other projects are unknown; capacity assumes "
                    + String.format(Locale.ROOT, "%.0f", ctx.settings().hoursPerDay()) + " h per working day");

            List<Load> helpers = loads.values().stream()
                    .filter(l -> !l.userId().equals(load.userId()))
                    .sorted(Comparator.comparingDouble(Load::estimatedHours).thenComparingInt(l -> l.tasks().size()))
                    .limit(2).toList();
            for (Load helper : helpers) {
                b.evidence(Evidence.fact(String.format(Locale.ROOT,
                        "%s has %s (%.1f estimated hours) due in the same period",
                        ctx.member(helper.userId()).name(), plural(helper.tasks().size(), "task"),
                        helper.estimatedHours()), Map.of("helperUserId", helper.userId().toString())));
            }
            signals.add(b.build(ctx.scoring()));
        }
        return signals;
    }

    private Load load(AnalysisContext ctx, UUID userId, List<TaskSnapshot> tasks) {
        List<TaskSnapshot> sorted = tasks.stream().sorted(Comparator.comparing(TaskSnapshot::dueDate)).toList();
        double cumulative = 0;
        double maxRatio = 0;
        int withoutEstimate = 0;
        int overdue = 0;
        for (TaskSnapshot t : sorted) {
            if (ctx.isOverdue(t)) {
                overdue++;
            }
            Double remaining = t.remainingHours();
            if (remaining == null) {
                withoutEstimate++;
                continue;
            }
            cumulative += remaining;
            LocalDate checkpoint = t.dueDate().isBefore(ctx.today()) ? ctx.today() : t.dueDate();
            int days = Math.max(1, ctx.calendar().workingDaysInclusive(ctx.today(), checkpoint));
            maxRatio = Math.max(maxRatio, cumulative / (days * ctx.settings().hoursPerDay()));
        }
        return new Load(userId, sorted, cumulative, maxRatio, withoutEstimate, overdue);
    }
}
