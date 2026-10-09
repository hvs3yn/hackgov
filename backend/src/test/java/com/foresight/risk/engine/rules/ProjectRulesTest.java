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
import com.foresight.risk.engine.model.TaskSnapshot;
import com.foresight.risk.engine.model.TaskState;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import static com.foresight.risk.engine.rules.TaskRulesTest.AYDAN;
import static com.foresight.risk.engine.rules.TaskRulesTest.NOW;
import static com.foresight.risk.engine.rules.TaskRulesTest.TODAY;
import static com.foresight.risk.engine.rules.TaskRulesTest.ULVI;
import static com.foresight.risk.engine.rules.TaskRulesTest.dependsOn;
import static com.foresight.risk.engine.rules.TaskRulesTest.hasFactor;
import static com.foresight.risk.engine.rules.TaskRulesTest.id;
import static com.foresight.risk.engine.rules.TaskRulesTest.task;
import static org.assertj.core.api.Assertions.assertThat;

class ProjectRulesTest {

    static final java.util.UUID HUSEYN = id("huseyn");

    static AnalysisContext ctx(LocalDate deadline, List<TaskSnapshot> tasks, List<Edge> edges) {
        ProjectSnapshot snapshot = new ProjectSnapshot(id("p"), "Hackathon MVP", TODAY.minusDays(20), deadline, 1,
                tasks, edges, List.of(new MemberSnapshot(ULVI, "Ulvi", true), new MemberSnapshot(AYDAN, "Aydan", true),
                new MemberSnapshot(HUSEYN, "Huseyn", true)));
        return new AnalysisContext(snapshot, NOW, ZoneOffset.UTC, RiskSettings.defaults());
    }

    @Nested
    class ProjectDeadline {
        private final ProjectDeadlineRule rule = new ProjectDeadlineRule();

        @Test
        void projectedSlipBeyondDeadlineIsDetectedWithDrivingChain() {
            // Wed 14th: Auth (12h = 2 days) -> API (18h = 3 days) -> UI (6h = 1 day) => finishes Wed 21st (6 working days)
            List<TaskSnapshot> tasks = List.of(
                    task("Auth", TaskState.IN_PROGRESS, Priority.HIGH, ULVI, TODAY.plusDays(1), 12.0, 0, 0),
                    task("API", TaskState.TODO, Priority.HIGH, AYDAN, TODAY.plusDays(4), 18.0, null, null),
                    task("UI", TaskState.TODO, Priority.MEDIUM, HUSEYN, TODAY.plusDays(5), 6.0, null, null));
            List<Edge> edges = List.of(dependsOn("API", "Auth"), dependsOn("UI", "API"));

            List<RiskSignal> signals = rule.evaluate(ctx(TODAY.plusDays(5), tasks, edges));

            assertThat(signals).hasSize(1);
            RiskSignal s = signals.getFirst();
            assertThat(s.category()).isEqualTo(RiskCategory.PROJECT_DEADLINE);
            assertThat(hasFactor(s, "PROJECTED_SLIP")).isTrue();
            assertThat(s.affectedTaskIds()).containsExactly(id("Auth"), id("API"), id("UI"));
            assertThat(s.evidence()).anyMatch(e -> e.kind() == Evidence.Kind.INFERENCE
                    && e.statement().contains("finishes on 2026-10-21"));
            assertThat(s.confidence()).isEqualTo(Confidence.HIGH);
        }

        @Test
        void onTrackProjectProducesNoSignal() {
            List<TaskSnapshot> tasks = List.of(
                    task("Auth", TaskState.IN_PROGRESS, Priority.HIGH, ULVI, TODAY.plusDays(2), 6.0, 50, 0));
            assertThat(rule.evaluate(ctx(TODAY.plusDays(10), tasks, List.of()))).isEmpty();
        }

        @Test
        void passedDeadlineWithOpenWorkIsHighSeverity() {
            List<TaskSnapshot> tasks = List.of(
                    task("Auth", TaskState.IN_PROGRESS, Priority.HIGH, ULVI, TODAY.minusDays(3), null, 50, 0));
            RiskSignal s = rule.evaluate(ctx(TODAY.minusDays(1), tasks, List.of())).getFirst();
            assertThat(hasFactor(s, "DEADLINE_PASSED")).isTrue();
            // 45 deadline passed + 15 projected 1-day slip (finishes today) + 5 one overdue task
            assertThat(s.score()).isEqualTo(65);
            assertThat(s.severity()).isEqualTo(com.foresight.risk.engine.model.Severity.HIGH);
        }

        @Test
        void missingEstimatesReduceConfidenceAndAreDisclosed() {
            List<TaskSnapshot> tasks = new ArrayList<>();
            for (int i = 0; i < 8; i++) {
                tasks.add(task("T" + i, TaskState.TODO, Priority.MEDIUM, ULVI, TODAY.plusDays(2), null, null, null));
            }
            RiskSignal s = rule.evaluate(ctx(TODAY.plusDays(3), tasks, List.of())).getFirst();
            assertThat(s.confidence()).isEqualTo(Confidence.LOW);
            assertThat(s.missingData()).anyMatch(m -> m.contains("8 of 8 unfinished tasks have no estimate"));
        }

        @Test
        void projectWithoutDeadlineIsNotAssessed() {
            List<TaskSnapshot> tasks = List.of(
                    task("Auth", TaskState.IN_PROGRESS, Priority.HIGH, ULVI, TODAY.minusDays(3), null, 50, 0));
            assertThat(rule.evaluate(ctx(null, tasks, List.of()))).isEmpty();
        }
    }

    @Nested
    class Workload {
        private final WorkloadImbalanceRule rule = new WorkloadImbalanceRule();

        @Test
        void overloadedMemberIsFlaggedAndLessLoadedTeammatesAreNamed() {
            List<TaskSnapshot> tasks = List.of(
                    task("A", TaskState.TODO, Priority.HIGH, ULVI, TODAY.plusDays(1), 10.0, null, null),
                    task("B", TaskState.TODO, Priority.HIGH, ULVI, TODAY.plusDays(2), 12.0, null, null),
                    task("C", TaskState.TODO, Priority.MEDIUM, AYDAN, TODAY.plusDays(6), 4.0, null, null));

            List<RiskSignal> signals = rule.evaluate(ctx(null, tasks, List.of()));

            assertThat(signals).hasSize(1);
            RiskSignal s = signals.getFirst();
            assertThat(s.subjectUserId()).isEqualTo(ULVI);
            assertThat(s.confidence()).isEqualTo(Confidence.MEDIUM);
            assertThat(hasFactor(s, "OVERLOAD_RATIO")).isTrue();
            assertThat(s.evidence()).anyMatch(e -> e.statement().startsWith("Huseyn has 0 tasks"));
            assertThat(s.missingData()).anyMatch(m -> m.contains("calendars"));
        }

        @Test
        void singleTaskShortfallIsLeftToTheDeadlineRules() {
            List<TaskSnapshot> tasks = List.of(
                    task("Big", TaskState.IN_PROGRESS, Priority.HIGH, ULVI, TODAY.plusDays(1), 30.0, 10, 0));
            assertThat(rule.evaluate(ctx(null, tasks, List.of()))).isEmpty();
        }

        @Test
        void balancedWorkloadIsNotFlagged() {
            List<TaskSnapshot> tasks = List.of(
                    task("A", TaskState.TODO, Priority.HIGH, ULVI, TODAY.plusDays(3), 8.0, null, null),
                    task("B", TaskState.TODO, Priority.HIGH, AYDAN, TODAY.plusDays(3), 8.0, null, null));
            assertThat(rule.evaluate(ctx(null, tasks, List.of()))).isEmpty();
        }

        @Test
        void manyUnestimatedTasksUseCountFallbackWithLowConfidence() {
            List<TaskSnapshot> tasks = new ArrayList<>();
            for (int i = 0; i < 6; i++) {
                tasks.add(task("T" + i, TaskState.TODO, Priority.MEDIUM, ULVI, TODAY.plusDays(4), null, null, null));
            }
            RiskSignal s = rule.evaluate(ctx(null, tasks, List.of())).getFirst();
            assertThat(s.confidence()).isEqualTo(Confidence.LOW);
            assertThat(hasFactor(s, "TASK_COUNT")).isTrue();
            assertThat(s.score()).isEqualTo(30);
        }
    }
}
