package com.foresight.risk.engine.rules;

import com.foresight.risk.engine.AnalysisContext;
import com.foresight.risk.engine.RiskSettings;
import com.foresight.risk.engine.model.Confidence;
import com.foresight.risk.engine.model.Evidence;
import com.foresight.risk.engine.model.Priority;
import com.foresight.risk.engine.model.ProjectSnapshot;
import com.foresight.risk.engine.model.ProjectSnapshot.Edge;
import com.foresight.risk.engine.model.ProjectSnapshot.MemberSnapshot;
import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.RiskSignal;
import com.foresight.risk.engine.model.Severity;
import com.foresight.risk.engine.model.TaskSnapshot;
import com.foresight.risk.engine.model.TaskState;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for the task-level rules. "Today" is Wednesday 2026-10-14.
 */
class TaskRulesTest {

    static final Instant NOW = Instant.parse("2026-10-14T10:00:00Z");
    static final LocalDate TODAY = LocalDate.of(2026, 10, 14);
    static final UUID ULVI = id("ulvi");
    static final UUID AYDAN = id("aydan");

    static UUID id(String s) {
        return UUID.nameUUIDFromBytes(s.getBytes(StandardCharsets.UTF_8));
    }

    static TaskSnapshot task(String title, TaskState state, Priority priority, UUID assignee, LocalDate due,
                             Double estimate, Integer progress, Integer idleDays) {
        return new TaskSnapshot(id(title), title, state, priority, assignee, null, due, estimate,
                progress == null ? 0 : progress, NOW.minus(Duration.ofDays(20)),
                idleDays == null ? null : NOW.minus(Duration.ofDays(idleDays)), progress != null);
    }

    static AnalysisContext ctx(List<TaskSnapshot> tasks, List<Edge> edges) {
        ProjectSnapshot snapshot = new ProjectSnapshot(id("p"), "Hackathon MVP", TODAY.minusDays(20), null, 1,
                tasks, edges, List.of(new MemberSnapshot(ULVI, "Ulvi", true), new MemberSnapshot(AYDAN, "Aydan", true)));
        return new AnalysisContext(snapshot, NOW, ZoneOffset.UTC, RiskSettings.defaults());
    }

    static Edge dependsOn(String dependent, String prerequisite) {
        return new Edge(id(prerequisite), id(dependent));
    }

    static boolean hasFactor(RiskSignal s, String code) {
        return s.factors().stream().anyMatch(f -> f.code().equals(code));
    }

    @Nested
    class Overdue {
        private final OverdueTaskRule rule = new OverdueTaskRule();

        @Test
        void overdueIncompleteTaskProducesRiskWithDocumentedScore() {
            TaskSnapshot auth = task("Auth", TaskState.IN_PROGRESS, Priority.HIGH, ULVI, TODAY.minusDays(2),
                    16.0, 40, 1);
            List<RiskSignal> signals = rule.evaluate(ctx(List.of(auth), List.of()));

            assertThat(signals).hasSize(1);
            RiskSignal s = signals.getFirst();
            assertThat(s.category()).isEqualTo(RiskCategory.OVERDUE_TASK);
            assertThat(s.taskId()).isEqualTo(auth.id());
            // 35 base + 10 days late + 10 HIGH priority
            assertThat(s.score()).isEqualTo(55);
            assertThat(s.severity()).isEqualTo(Severity.HIGH);
            assertThat(s.confidence()).isEqualTo(Confidence.HIGH);
            assertThat(s.evidence()).anyMatch(e -> e.kind() == Evidence.Kind.FACT && e.statement().contains("2026-10-12"));
        }

        @Test
        void completedAndCancelledTasksAreNeverOverdue() {
            List<TaskSnapshot> tasks = List.of(
                    task("Done", TaskState.DONE, Priority.HIGH, ULVI, TODAY.minusDays(5), null, 100, 6),
                    task("Cancelled", TaskState.CANCELLED, Priority.HIGH, ULVI, TODAY.minusDays(5), null, null, null));
            assertThat(rule.evaluate(ctx(tasks, List.of()))).isEmpty();
        }

        @Test
        void taskDueTodayIsNotOverdue() {
            TaskSnapshot t = task("Today", TaskState.IN_PROGRESS, Priority.HIGH, ULVI, TODAY, null, 10, 0);
            assertThat(rule.evaluate(ctx(List.of(t), List.of()))).isEmpty();
        }

        @Test
        void downstreamTasksAreAffectedAndIncreaseScore() {
            List<TaskSnapshot> tasks = List.of(
                    task("Auth", TaskState.IN_PROGRESS, Priority.MEDIUM, ULVI, TODAY.minusDays(1), null, 50, 0),
                    task("API", TaskState.TODO, Priority.MEDIUM, AYDAN, TODAY.plusDays(5), null, null, null),
                    task("Tests", TaskState.TODO, Priority.MEDIUM, AYDAN, TODAY.plusDays(8), null, null, null),
                    task("Docs", TaskState.DONE, Priority.MEDIUM, AYDAN, TODAY.plusDays(8), null, 100, 0));
            List<Edge> edges = List.of(dependsOn("API", "Auth"), dependsOn("Tests", "API"), dependsOn("Docs", "Auth"));

            RiskSignal s = rule.evaluate(ctx(tasks, edges)).getFirst();

            assertThat(s.affectedTaskIds()).containsExactlyInAnyOrder(id("Auth"), id("API"), id("Tests"));
            assertThat(hasFactor(s, "DOWNSTREAM")).isTrue();
            // 35 + 5 (1 day) + 5 (MEDIUM) + 10 (2 open downstream)
            assertThat(s.score()).isEqualTo(55);
        }

        @Test
        void missingProgressIsReportedAsUnknownNotZero() {
            TaskSnapshot t = task("Auth", TaskState.TODO, Priority.LOW, null, TODAY.minusDays(1), null, null, null);
            RiskSignal s = rule.evaluate(ctx(List.of(t), List.of())).getFirst();
            assertThat(s.missingData()).anyMatch(m -> m.contains("never been reported"));
            assertThat(s.missingData()).anyMatch(m -> m.contains("No owner"));
            assertThat(s.evidence()).noneMatch(e -> e.statement().contains("0%"));
        }
    }

    @Nested
    class Approaching {
        private final ApproachingDeadlineRule rule = new ApproachingDeadlineRule();

        @Test
        void ulviAuthenticationScenarioIsHighSeverity() {
            List<TaskSnapshot> tasks = List.of(
                    task("Authentication module", TaskState.IN_PROGRESS, Priority.HIGH, ULVI, TODAY.plusDays(1),
                            16.0, 20, 2),
                    task("API integration", TaskState.TODO, Priority.HIGH, AYDAN, TODAY.plusDays(4), 8.0, null, null),
                    task("Frontend integration", TaskState.TODO, Priority.MEDIUM, AYDAN, TODAY.plusDays(6), 8.0, null, null));
            List<Edge> edges = List.of(dependsOn("API integration", "Authentication module"),
                    dependsOn("Frontend integration", "API integration"));

            List<RiskSignal> signals = rule.evaluate(ctx(tasks, edges));
            RiskSignal s = signals.stream().filter(x -> x.taskId().equals(id("Authentication module"))).findFirst().orElseThrow();

            // 15 base + 15 due tomorrow + 15 (<25%) + 15 capacity (12.8h left vs 12h in 2 days) + 10 stalled + 7 HIGH + 10 downstream
            assertThat(s.score()).isEqualTo(87);
            assertThat(s.severity()).isEqualTo(Severity.CRITICAL);
            assertThat(s.confidence()).isEqualTo(Confidence.HIGH);
            assertThat(hasFactor(s, "STALLED")).isTrue();
            assertThat(s.affectedTaskIds()).contains(id("API integration"), id("Frontend integration"));
            assertThat(s.evidence()).anyMatch(e -> e.kind() == Evidence.Kind.INFERENCE
                    && e.statement().contains("estimated hours remain"));
            // Aydan (2 open tasks) is busier than nobody else: the least-loaded teammate other than Ulvi is named.
            assertThat(s.evidence()).anyMatch(e -> e.kind() == Evidence.Kind.FACT
                    && e.statement().equals("Aydan has the fewest unfinished tasks in the project (2)")
                    && e.data().get("helperUserId").equals(AYDAN.toString()));
        }

        @Test
        void nearlyCompleteOrOnTrackTasksDoNotFire() {
            List<TaskSnapshot> tasks = List.of(
                    task("Almost", TaskState.IN_REVIEW, Priority.HIGH, ULVI, TODAY.plusDays(1), 10.0, 95, 0),
                    task("OnTrack", TaskState.IN_PROGRESS, Priority.MEDIUM, ULVI, TODAY.plusDays(3), 4.0, 80, 0));
            assertThat(rule.evaluate(ctx(tasks, List.of()))).isEmpty();
        }

        @Test
        void tasksOutsideWindowDoNotFire() {
            TaskSnapshot t = task("Later", TaskState.TODO, Priority.HIGH, ULVI, TODAY.plusDays(4), null, null, null);
            assertThat(rule.evaluate(ctx(List.of(t), List.of()))).isEmpty();
        }

        @Test
        void missingEstimateAndProgressLowersConfidence() {
            TaskSnapshot t = task("Unknown", TaskState.TODO, Priority.MEDIUM, ULVI, TODAY.plusDays(2), null, null, null);
            RiskSignal s = rule.evaluate(ctx(List.of(t), List.of())).getFirst();
            assertThat(s.confidence()).isEqualTo(Confidence.LOW);
            assertThat(s.missingData()).anyMatch(m -> m.contains("no time estimate"));
            assertThat(hasFactor(s, "PROGRESS_UNKNOWN")).isTrue();
            assertThat(hasFactor(s, "LOW_PROGRESS")).isFalse();
        }
    }

    @Nested
    class Stalled {
        private final StalledTaskRule rule = new StalledTaskRule();

        @Test
        void startedTaskWithoutRecordedProgressForStallDaysFires() {
            TaskSnapshot t = task("Search", TaskState.IN_PROGRESS, Priority.MEDIUM, ULVI, TODAY.plusDays(20), 20.0, 30, 7);
            RiskSignal s = rule.evaluate(ctx(List.of(t), List.of())).getFirst();
            assertThat(s.category()).isEqualTo(RiskCategory.STALLED_TASK);
            // 20 base + 4 extra idle (2 days over threshold) + 3 MEDIUM
            assertThat(s.score()).isEqualTo(27);
            assertThat(s.confidence()).isEqualTo(Confidence.MEDIUM);
            assertThat(s.evidence()).anyMatch(e -> e.statement().contains("Last recorded progress was on 2026-10-07"));
        }

        @Test
        void requiresSufficientIdleEvidence() {
            TaskSnapshot recent = task("Recent", TaskState.IN_PROGRESS, Priority.HIGH, ULVI, TODAY.plusDays(20), null, 30, 3);
            TaskSnapshot notStarted = task("NotStarted", TaskState.TODO, Priority.HIGH, ULVI, TODAY.plusDays(20), null, null, null);
            assertThat(rule.evaluate(ctx(List.of(recent, notStarted), List.of()))).isEmpty();
        }

        @Test
        void overdueOrApproachingTasksAreLeftToHigherPrecedenceRules() {
            TaskSnapshot overdue = task("Overdue", TaskState.IN_PROGRESS, Priority.HIGH, ULVI, TODAY.minusDays(1), null, 10, 9);
            TaskSnapshot soon = task("Soon", TaskState.IN_PROGRESS, Priority.HIGH, ULVI, TODAY.plusDays(2), null, 10, 9);
            assertThat(rule.evaluate(ctx(List.of(overdue, soon), List.of()))).isEmpty();
        }
    }

    @Nested
    class Blocked {
        private final BlockedDependencyRule rule = new BlockedDependencyRule();

        @Test
        void overduePrerequisiteBlocksTheCorrectDownstreamTasks() {
            List<TaskSnapshot> tasks = new ArrayList<>(List.of(
                    task("Auth", TaskState.IN_PROGRESS, Priority.HIGH, ULVI, TODAY.minusDays(2), null, 50, 0),
                    task("API", TaskState.TODO, Priority.HIGH, AYDAN, TODAY.plusDays(3), null, null, null),
                    task("Frontend", TaskState.TODO, Priority.MEDIUM, AYDAN, TODAY.plusDays(6), null, null, null),
                    task("Unrelated", TaskState.TODO, Priority.MEDIUM, AYDAN, TODAY.plusDays(6), null, null, null)));
            List<Edge> edges = List.of(dependsOn("API", "Auth"), dependsOn("Frontend", "API"));

            List<RiskSignal> signals = rule.evaluate(ctx(tasks, edges));

            // Only API is directly blocked by a threatening prerequisite; Frontend waits on API which is on schedule.
            assertThat(signals).hasSize(1);
            RiskSignal s = signals.getFirst();
            assertThat(s.taskId()).isEqualTo(id("API"));
            assertThat(s.affectedTaskIds()).containsExactlyInAnyOrder(id("API"), id("Auth"), id("Frontend"));
            assertThat(s.affectedTaskIds()).doesNotContain(id("Unrelated"));
            assertThat(hasFactor(s, "PREREQ_OVERDUE")).isTrue();
            // 25 overdue prereq + 15 base + 10 due within week + 7 HIGH + 5 downstream
            assertThat(s.score()).isEqualTo(62);
        }

        @Test
        void waitingOnOnSchedulePrerequisiteIsNormal() {
            List<TaskSnapshot> tasks = List.of(
                    task("Auth", TaskState.IN_PROGRESS, Priority.HIGH, ULVI, TODAY.plusDays(5), null, 50, 0),
                    task("API", TaskState.TODO, Priority.HIGH, AYDAN, TODAY.plusDays(8), null, null, null));
            assertThat(rule.evaluate(ctx(tasks, List.of(dependsOn("API", "Auth"))))).isEmpty();
        }

        @Test
        void finishedPrerequisitesDoNotBlock() {
            List<TaskSnapshot> tasks = List.of(
                    task("Auth", TaskState.DONE, Priority.HIGH, ULVI, TODAY.minusDays(5), null, 100, 5),
                    task("API", TaskState.TODO, Priority.HIGH, AYDAN, TODAY.plusDays(2), null, null, null));
            assertThat(rule.evaluate(ctx(tasks, List.of(dependsOn("API", "Auth"))))).isEmpty();
        }

        @Test
        void prerequisiteWithoutDueDateLowersConfidence() {
            List<TaskSnapshot> tasks = List.of(
                    task("Design", TaskState.BLOCKED, Priority.MEDIUM, null, null, null, null, null),
                    task("Build", TaskState.TODO, Priority.MEDIUM, AYDAN, TODAY.plusDays(10), null, null, null));
            RiskSignal s = rule.evaluate(ctx(tasks, List.of(dependsOn("Build", "Design")))).getFirst();
            assertThat(s.confidence()).isEqualTo(Confidence.MEDIUM);
            assertThat(s.missingData()).anyMatch(m -> m.contains("no due date"));
        }
    }
}
