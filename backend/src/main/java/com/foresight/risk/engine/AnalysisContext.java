package com.foresight.risk.engine;

import com.foresight.risk.engine.graph.TaskGraph;
import com.foresight.risk.engine.model.Priority;
import com.foresight.risk.engine.model.ProjectSnapshot;
import com.foresight.risk.engine.model.ProjectSnapshot.MemberSnapshot;
import com.foresight.risk.engine.model.TaskSnapshot;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Everything a rule needs: the snapshot, "today", settings and derived lookups.
 */
public final class AnalysisContext {

    private final ProjectSnapshot snapshot;
    private final LocalDate today;
    private final ZoneId zone;
    private final RiskSettings settings;
    private final ScoringPolicy scoring;
    private final WorkCalendar calendar;
    private final TaskGraph graph;
    private final Map<UUID, TaskSnapshot> tasksById;
    private final Map<UUID, MemberSnapshot> membersById;

    public AnalysisContext(ProjectSnapshot snapshot, Instant now, ZoneId zone, RiskSettings settings) {
        this.snapshot = snapshot;
        this.zone = zone;
        this.today = LocalDate.ofInstant(now, zone);
        this.settings = settings;
        this.scoring = new ScoringPolicy();
        this.calendar = new WorkCalendar(settings.excludeWeekends());
        this.tasksById = snapshot.tasks().stream()
                .collect(Collectors.toMap(TaskSnapshot::id, Function.identity(), (a, b) -> a, LinkedHashMap::new));
        this.membersById = snapshot.members().stream()
                .collect(Collectors.toMap(MemberSnapshot::userId, Function.identity(), (a, b) -> a, LinkedHashMap::new));
        this.graph = new TaskGraph(tasksById.keySet(), snapshot.edges());
    }

    public ProjectSnapshot snapshot() {
        return snapshot;
    }

    public LocalDate today() {
        return today;
    }

    public RiskSettings settings() {
        return settings;
    }

    public ScoringPolicy scoring() {
        return scoring;
    }

    public WorkCalendar calendar() {
        return calendar;
    }

    public TaskGraph graph() {
        return graph;
    }

    public List<TaskSnapshot> openTasks() {
        return snapshot.tasks().stream().filter(TaskSnapshot::isOpen).toList();
    }

    public TaskSnapshot task(UUID id) {
        return tasksById.get(id);
    }

    public MemberSnapshot member(UUID userId) {
        return userId == null ? null : membersById.get(userId);
    }

    /** Assignee name, or a neutral phrase when unknown. */
    public String assigneeName(TaskSnapshot task) {
        MemberSnapshot member = member(task.assigneeId());
        if (task.assigneeId() == null) {
            return "nobody";
        }
        return member == null ? "a former member" : member.name();
    }

    /** Open tasks transitively depending on {@code taskId}. */
    public List<TaskSnapshot> openDownstream(UUID taskId) {
        return graph.downstreamOf(taskId).stream().map(tasksById::get).filter(t -> t != null && t.isOpen()).toList();
    }

    /** Open direct prerequisites of {@code taskId}. */
    public List<TaskSnapshot> openPrerequisites(UUID taskId) {
        return graph.predecessorsOf(taskId).stream().map(tasksById::get)
                .filter(t -> t != null && t.isOpen())
                .sorted(java.util.Comparator.comparing(TaskSnapshot::title))
                .toList();
    }

    public long daysUntil(LocalDate date) {
        return ChronoUnit.DAYS.between(today, date);
    }

    /** Whole days since the last recorded progress, falling back to creation. */
    public long idleDays(TaskSnapshot task) {
        Instant reference = task.lastProgressAt() != null ? task.lastProgressAt() : task.createdAt();
        return Math.max(0, ChronoUnit.DAYS.between(LocalDate.ofInstant(reference, zone), today));
    }

    public LocalDate lastProgressDate(TaskSnapshot task) {
        Instant reference = task.lastProgressAt() != null ? task.lastProgressAt() : task.createdAt();
        return LocalDate.ofInstant(reference, zone);
    }

    public boolean isOverdue(TaskSnapshot task) {
        return task.isOpen() && task.dueDate() != null && task.dueDate().isBefore(today);
    }

    public boolean isInApproachingWindow(TaskSnapshot task) {
        if (!task.isOpen() || task.dueDate() == null) {
            return false;
        }
        long days = daysUntil(task.dueDate());
        return days >= 0 && days <= settings.approachingDays();
    }

    public static int priorityPoints(Priority priority, int critical, int high, int medium) {
        return switch (priority) {
            case CRITICAL -> critical;
            case HIGH -> high;
            case MEDIUM -> medium;
            case LOW -> 0;
        };
    }

    public static String plural(long n, String singular) {
        return n + " " + (n == 1 ? singular : singular + "s");
    }

    public static String titles(List<TaskSnapshot> tasks, int max) {
        List<String> names = tasks.stream().limit(max).map(t -> "'" + t.title() + "'").toList();
        String joined = String.join(", ", names);
        return tasks.size() > max ? joined + " and " + (tasks.size() - max) + " more" : joined;
    }
}
