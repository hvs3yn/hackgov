package com.foresight.risk.engine;

import com.foresight.risk.engine.model.Priority;
import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.RiskSignal;
import com.foresight.risk.engine.model.Severity;
import com.foresight.risk.engine.model.TaskState;
import org.junit.jupiter.api.Test;

import java.time.ZoneOffset;
import java.util.List;

import static com.foresight.risk.engine.EngineFixtures.AYDAN;
import static com.foresight.risk.engine.EngineFixtures.HUSEYN;
import static com.foresight.risk.engine.EngineFixtures.NOW;
import static com.foresight.risk.engine.EngineFixtures.TODAY;
import static com.foresight.risk.engine.EngineFixtures.ULVI;
import static com.foresight.risk.engine.EngineFixtures.id;
import static com.foresight.risk.engine.EngineFixtures.only;
import static com.foresight.risk.engine.EngineFixtures.project;
import static com.foresight.risk.engine.EngineFixtures.task;
import static org.assertj.core.api.Assertions.assertThat;

class RiskEngineTest {

    private final RiskEngine engine = RiskEngine.withDefaultRules(RiskSettings.defaults());

    @Test
    void ulviScenarioProducesGroundedWarningsWithoutDoubleCounting() {
        var snapshot = project()
                .deadline(TODAY.plusDays(8))
                .task(task("Authentication module").state(TaskState.IN_PROGRESS).priority(Priority.HIGH)
                        .assignee(ULVI).dueInDays(1).estimate(16).progress(20).idleDays(2))
                .task(task("API integration").priority(Priority.HIGH).assignee(AYDAN).dueInDays(4).estimate(8))
                .task(task("Frontend integration").assignee(HUSEYN).dueInDays(6).estimate(8))
                .task(task("Testing").assignee(AYDAN).dueInDays(7).estimate(6))
                .dependsOn("API integration", "Authentication module")
                .dependsOn("Frontend integration", "API integration")
                .dependsOn("Testing", "Frontend integration")
                .build();

        List<RiskSignal> signals = engine.analyze(snapshot, NOW, ZoneOffset.UTC);

        List<RiskSignal> approaching = only(signals, RiskCategory.APPROACHING_DEADLINE);
        assertThat(approaching).hasSize(1);
        assertThat(approaching.getFirst().taskId()).isEqualTo(id("Authentication module"));
        assertThat(approaching.getFirst().severity()).isIn(Severity.HIGH, Severity.CRITICAL);
        assertThat(approaching.getFirst().affectedTaskIds())
                .contains(id("API integration"), id("Frontend integration"), id("Testing"));
        // The same task is not also reported as stalled (precedence rule).
        assertThat(only(signals, RiskCategory.STALLED_TASK)).isEmpty();
        // Highest score first, deterministic order.
        assertThat(signals).isSortedAccordingTo((a, b) -> Integer.compare(b.score(), a.score()));
        assertThat(engine.analyze(snapshot, NOW, ZoneOffset.UTC)).isEqualTo(signals);
    }

    @Test
    void signalsBelowMinimumScoreAreDiscarded() {
        var snapshot = project()
                .task(task("Small").state(TaskState.IN_PROGRESS).priority(Priority.LOW).assignee(ULVI)
                        .dueInDays(30).progress(10).idleDays(5))
                .build();
        // Stalled: 20 base only -> exactly at threshold 20 is kept; raise threshold to drop it.
        RiskEngine strict = RiskEngine.withDefaultRules(new RiskSettings(25, 6.0, true, 3, 2, 5, 10, 1.2, 6));
        assertThat(engine.analyze(snapshot, NOW, ZoneOffset.UTC)).hasSize(1);
        assertThat(strict.analyze(snapshot, NOW, ZoneOffset.UTC)).isEmpty();
    }

    @Test
    void healthyProjectHasNoRisks() {
        var snapshot = project()
                .deadline(TODAY.plusDays(30))
                .task(task("Auth").state(TaskState.IN_PROGRESS).assignee(ULVI).dueInDays(10).estimate(8)
                        .progress(60).idleDays(0))
                .task(task("Done thing").state(TaskState.DONE).assignee(AYDAN).due(TODAY.minusDays(3)).progress(100))
                .build();
        assertThat(engine.analyze(snapshot, NOW, ZoneOffset.UTC)).isEmpty();
    }
}
