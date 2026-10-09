package com.foresight.risk.engine;

import com.foresight.risk.engine.graph.CycleException;
import com.foresight.risk.engine.model.TaskSnapshot;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Forward-pass projection of open work (evolved from the original Foresight {@code Scheduler}): tasks are
 * scheduled in dependency order; each starts at the latest of today, its start date, its prerequisites'
 * finish and its assignee becoming free; duration = remaining estimate / hours per day (≥ 1 day), or one
 * working day when no estimate exists.
 */
public final class SchedulePlanner {

    public record Projection(LocalDate projectedFinish, List<UUID> criticalChain, int tasksWithoutEstimate,
                             int openTasks) {
    }

    public Projection project(AnalysisContext ctx) {
        List<TaskSnapshot> open = ctx.openTasks();
        if (open.isEmpty()) {
            return new Projection(null, List.of(), 0, 0);
        }
        WorkCalendar calendar = ctx.calendar();
        LocalDate today = ctx.today();
        Comparator<UUID> tieBreaker = Comparator
                .comparing((UUID id) -> {
                    LocalDate due = ctx.task(id).dueDate();
                    return due == null ? LocalDate.MAX : due;
                })
                .thenComparing(id -> ctx.task(id).title())
                .thenComparing(Comparator.naturalOrder());
        List<UUID> order;
        try {
            order = ctx.graph().topologicalOrder(tieBreaker);
        } catch (CycleException e) {
            // Cycles are prevented at write time; fall back to due-date order if data is inconsistent.
            order = open.stream().map(TaskSnapshot::id).sorted(tieBreaker).toList();
        }

        Map<UUID, Integer> finish = new HashMap<>();
        Map<UUID, UUID> drivenBy = new HashMap<>();
        Map<UUID, Integer> assigneeFreeAt = new HashMap<>();
        Map<UUID, UUID> assigneeLastTask = new HashMap<>();
        int withoutEstimate = 0;

        for (UUID id : order) {
            TaskSnapshot t = ctx.task(id);
            if (t == null || !t.isOpen()) {
                continue;
            }
            int start = 0;
            UUID driver = null;
            if (t.startDate() != null) {
                start = calendar.workingDayIndex(today, t.startDate());
            }
            for (UUID pred : ctx.graph().predecessorsOf(id)) {
                Integer predFinish = finish.get(pred);
                if (predFinish != null && predFinish > start) {
                    start = predFinish;
                    driver = pred;
                }
            }
            if (t.assigneeId() != null) {
                int free = assigneeFreeAt.getOrDefault(t.assigneeId(), 0);
                if (free > start) {
                    start = free;
                    driver = assigneeLastTask.get(t.assigneeId());
                }
            }
            int duration;
            Double remaining = t.remainingHours();
            if (remaining == null) {
                withoutEstimate++;
                duration = 1;
            } else {
                duration = Math.max(1, (int) Math.ceil(remaining / ctx.settings().hoursPerDay()));
            }
            int end = start + duration;
            finish.put(id, end);
            if (driver != null) {
                drivenBy.put(id, driver);
            }
            if (t.assigneeId() != null) {
                assigneeFreeAt.put(t.assigneeId(), end);
                assigneeLastTask.put(t.assigneeId(), id);
            }
        }

        UUID last = finish.entrySet().stream()
                .max(Map.Entry.<UUID, Integer>comparingByValue().thenComparing(Map.Entry.comparingByKey()))
                .map(Map.Entry::getKey).orElseThrow();
        int maxFinish = finish.get(last);
        LocalDate projectedFinish = calendar.nthWorkingDay(today, maxFinish - 1);

        List<UUID> chain = new ArrayList<>();
        for (UUID node = last; node != null && !chain.contains(node); node = drivenBy.get(node)) {
            chain.add(node);
        }
        Collections.reverse(chain);
        return new Projection(projectedFinish, chain, withoutEstimate, open.size());
    }
}
