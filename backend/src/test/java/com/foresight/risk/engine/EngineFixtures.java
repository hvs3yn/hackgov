package com.foresight.risk.engine;

import com.foresight.risk.engine.model.Priority;
import com.foresight.risk.engine.model.ProjectSnapshot;
import com.foresight.risk.engine.model.ProjectSnapshot.Edge;
import com.foresight.risk.engine.model.ProjectSnapshot.MemberSnapshot;
import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.RiskSignal;
import com.foresight.risk.engine.model.TaskSnapshot;
import com.foresight.risk.engine.model.TaskState;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Test data builders. "Today" is Wednesday 2026-10-14. */
final class EngineFixtures {

    static final Instant NOW = Instant.parse("2026-10-14T10:00:00Z");
    static final LocalDate TODAY = LocalDate.of(2026, 10, 14);
    static final UUID PROJECT_ID = id("project");
    static final UUID ULVI = id("ulvi");
    static final UUID AYDAN = id("aydan");
    static final UUID HUSEYN = id("huseyn");

    private EngineFixtures() {
    }

    static UUID id(String name) {
        return UUID.nameUUIDFromBytes(name.getBytes(StandardCharsets.UTF_8));
    }

    static TaskBuilder task(String title) {
        return new TaskBuilder(title);
    }

    static ProjectBuilder project() {
        return new ProjectBuilder();
    }

    static AnalysisContext context(ProjectSnapshot snapshot) {
        return new AnalysisContext(snapshot, NOW, ZoneOffset.UTC, RiskSettings.defaults());
    }

    static List<RiskSignal> only(List<RiskSignal> signals, RiskCategory category) {
        return signals.stream().filter(s -> s.category() == category).toList();
    }

    static boolean hasFactor(RiskSignal signal, String code) {
        return signal.factors().stream().anyMatch(f -> f.code().equals(code));
    }

    static final class TaskBuilder {
        private final String title;
        private TaskState state = TaskState.TODO;
        private Priority priority = Priority.MEDIUM;
        private UUID assignee;
        private LocalDate start;
        private LocalDate due;
        private Double estimate;
        private int progress;
        private Instant createdAt = NOW.minus(Duration.ofDays(10));
        private Instant lastProgressAt;
        private boolean progressReported;

        TaskBuilder(String title) {
            this.title = title;
        }

        TaskBuilder state(TaskState s) {
            this.state = s;
            return this;
        }

        TaskBuilder priority(Priority p) {
            this.priority = p;
            return this;
        }

        TaskBuilder assignee(UUID a) {
            this.assignee = a;
            return this;
        }

        TaskBuilder start(LocalDate d) {
            this.start = d;
            return this;
        }

        TaskBuilder due(LocalDate d) {
            this.due = d;
            return this;
        }

        TaskBuilder dueInDays(int days) {
            this.due = TODAY.plusDays(days);
            return this;
        }

        TaskBuilder estimate(double hours) {
            this.estimate = hours;
            return this;
        }

        TaskBuilder progress(int p) {
            this.progress = p;
            this.progressReported = true;
            return this;
        }

        TaskBuilder idleDays(int days) {
            this.lastProgressAt = NOW.minus(Duration.ofDays(days));
            return this;
        }

        TaskBuilder createdDaysAgo(int days) {
            this.createdAt = NOW.minus(Duration.ofDays(days));
            return this;
        }

        TaskSnapshot build() {
            return new TaskSnapshot(id(title), title, state, priority, assignee, start, due, estimate, progress,
                    createdAt, lastProgressAt, progressReported);
        }
    }

    static final class ProjectBuilder {
        private LocalDate deadline;
        private final List<TaskSnapshot> tasks = new ArrayList<>();
        private final List<Edge> edges = new ArrayList<>();
        private final List<MemberSnapshot> members = new ArrayList<>(List.of(
                new MemberSnapshot(ULVI, "Ulvi", true),
                new MemberSnapshot(AYDAN, "Aydan", true),
                new MemberSnapshot(HUSEYN, "Huseyn", true)));

        ProjectBuilder deadline(LocalDate d) {
            this.deadline = d;
            return this;
        }

        ProjectBuilder task(TaskBuilder t) {
            tasks.add(t.build());
            return this;
        }

        /** {@code dependent} depends on {@code prerequisite}. */
        ProjectBuilder dependsOn(String dependent, String prerequisite) {
            edges.add(new Edge(id(prerequisite), id(dependent)));
            return this;
        }

        ProjectSnapshot build() {
            return new ProjectSnapshot(PROJECT_ID, "Hackathon MVP", TODAY.minusDays(20), deadline, 7, tasks, edges,
                    members);
        }
    }
}
