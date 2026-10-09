package com.foresight.risk.application;

import com.foresight.common.json.JsonCodec;
import com.foresight.risk.application.RiskReconciler.Outcome;
import com.foresight.risk.application.RiskReconciler.Result;
import com.foresight.risk.domain.RiskAssessment;
import com.foresight.risk.domain.RiskEnums.AssessmentStatus;
import com.foresight.risk.domain.RiskEnums.DeliveryStatus;
import com.foresight.risk.domain.RiskEnums.ResolutionReason;
import com.foresight.risk.domain.RiskEnums.RiskEventType;
import com.foresight.risk.engine.model.Confidence;
import com.foresight.risk.engine.model.Evidence;
import com.foresight.risk.engine.model.Factor;
import com.foresight.risk.engine.model.Priority;
import com.foresight.risk.engine.model.ProjectSnapshot;
import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.RiskSignal;
import com.foresight.risk.engine.model.RiskSignal.SubjectType;
import com.foresight.risk.engine.model.Severity;
import com.foresight.risk.engine.model.TaskSnapshot;
import com.foresight.risk.engine.model.TaskState;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class RiskReconcilerTest {

    private static final Instant NOW = Instant.parse("2026-10-14T10:00:00Z");
    private static final UUID PROJECT = UUID.randomUUID();
    private static final UUID TASK = UUID.randomUUID();

    private final RiskReconciler reconciler = new RiskReconciler(new JsonCodec(JsonMapper.builder().build()));
    private final List<RiskAssessment> stored = new ArrayList<>();

    private static RiskSignal signal(int score, Severity severity) {
        return new RiskSignal(RiskCategory.OVERDUE_TASK, SubjectType.TASK, TASK, TASK, null, "'Auth' is overdue",
                List.of(new Factor("OVERDUE", "Overdue", score)), List.of(Evidence.fact("Due yesterday")),
                List.of(TASK), List.of(), Confidence.HIGH, score, severity);
    }

    private static ProjectSnapshot snapshot(TaskState state, boolean taskPresent) {
        List<TaskSnapshot> tasks = taskPresent
                ? List.of(new TaskSnapshot(TASK, "Auth", state, Priority.HIGH, null, null, null, null, 0, NOW, null, false))
                : List.of();
        return new ProjectSnapshot(PROJECT, "P", null, null, 5, tasks, List.of(), List.of());
    }

    private Result run(List<RiskSignal> signals, ProjectSnapshot snapshot, boolean active) {
        Result result = reconciler.reconcile(PROJECT, stored, signals, snapshot, active, Severity.MEDIUM, NOW);
        stored.addAll(result.created());
        return result;
    }

    @Test
    void newSignalIsDetectedAndQueuedForDelivery() {
        Result r = run(List.of(signal(55, Severity.HIGH)), snapshot(TaskState.TODO, true), true);
        assertThat(r.counts()).containsEntry(Outcome.DETECTED, 1);
        RiskAssessment a = r.created().getFirst();
        assertThat(a.getRevision()).isEqualTo(1);
        assertThat(a.getDeliveryStatus()).isEqualTo(DeliveryStatus.PENDING);
        assertThat(r.deliveryRequested()).containsExactly(a.getId());
        assertThat(r.events()).extracting(e -> e.getEventType()).containsExactly(RiskEventType.DETECTED);
    }

    @Test
    void lowSeveritySignalIsStoredButNotDelivered() {
        Result r = run(List.of(signal(22, Severity.LOW)), snapshot(TaskState.TODO, true), true);
        assertThat(r.created().getFirst().getDeliveryStatus()).isEqualTo(DeliveryStatus.NOT_REQUIRED);
        assertThat(r.deliveryRequested()).isEmpty();
    }

    @Test
    void unchangedSignalProducesNoEventAndNoDelivery() {
        run(List.of(signal(55, Severity.HIGH)), snapshot(TaskState.TODO, true), true);
        stored.getFirst().markDelivered("{}", "FALLBACK", 1);
        Result r = run(List.of(signal(55, Severity.HIGH)), snapshot(TaskState.TODO, true), true);
        assertThat(r.counts()).containsEntry(Outcome.UNCHANGED, 1);
        assertThat(r.events()).isEmpty();
        assertThat(r.deliveryRequested()).isEmpty();
        assertThat(stored.getFirst().getRevision()).isEqualTo(1);
    }

    @Test
    void escalationBumpsRevisionAndRequestsDeliveryWhileMitigationDoesNot() {
        run(List.of(signal(40, Severity.MEDIUM)), snapshot(TaskState.TODO, true), true);
        Result up = run(List.of(signal(60, Severity.HIGH)), snapshot(TaskState.TODO, true), true);
        assertThat(up.counts()).containsEntry(Outcome.ESCALATED, 1);
        assertThat(stored.getFirst().getRevision()).isEqualTo(2);
        assertThat(up.deliveryRequested()).hasSize(1);

        Result down = run(List.of(signal(45, Severity.MEDIUM)), snapshot(TaskState.TODO, true), true);
        assertThat(down.counts()).containsEntry(Outcome.MITIGATED, 1);
        assertThat(down.deliveryRequested()).isEmpty();
        assertThat(stored.getFirst().getRevision()).isEqualTo(2);
    }

    @Test
    void sameSeverityWithDifferentFactorsIsAnUpdate() {
        run(List.of(signal(55, Severity.HIGH)), snapshot(TaskState.TODO, true), true);
        Result r = run(List.of(signal(60, Severity.HIGH)), snapshot(TaskState.TODO, true), true);
        assertThat(r.counts()).containsEntry(Outcome.UPDATED, 1);
        assertThat(r.deliveryRequested()).isEmpty();
    }

    @Test
    void missingSignalResolvesWithReasonAndReappearanceReopens() {
        run(List.of(signal(55, Severity.HIGH)), snapshot(TaskState.TODO, true), true);
        Result resolved = run(List.of(), snapshot(TaskState.DONE, true), true);
        RiskAssessment a = stored.getFirst();
        assertThat(resolved.counts()).containsEntry(Outcome.RESOLVED, 1);
        assertThat(a.getStatus()).isEqualTo(AssessmentStatus.RESOLVED);
        assertThat(a.getResolutionReason()).isEqualTo(ResolutionReason.TASK_CLOSED);

        Result reopened = run(List.of(signal(55, Severity.HIGH)), snapshot(TaskState.IN_PROGRESS, true), true);
        assertThat(reopened.counts()).containsEntry(Outcome.REOPENED, 1);
        assertThat(reopened.created()).isEmpty();
        assertThat(a.getStatus()).isEqualTo(AssessmentStatus.ACTIVE);
        assertThat(a.getRevision()).isEqualTo(2);
        assertThat(a.getReopenCount()).isEqualTo(1);
        assertThat(a.getResolvedAt()).isNull();
        assertThat(reopened.deliveryRequested()).containsExactly(a.getId());
    }

    @Test
    void resolutionReasonsReflectWhy() {
        run(List.of(signal(55, Severity.HIGH)), snapshot(TaskState.TODO, true), true);
        run(List.of(), snapshot(TaskState.TODO, false), true);
        assertThat(stored.getFirst().getResolutionReason()).isEqualTo(ResolutionReason.TASK_ARCHIVED);

        stored.clear();
        run(List.of(signal(55, Severity.HIGH)), snapshot(TaskState.TODO, true), true);
        run(List.of(), snapshot(TaskState.TODO, true), false);
        assertThat(stored.getFirst().getResolutionReason()).isEqualTo(ResolutionReason.PROJECT_INACTIVE);
    }
}
