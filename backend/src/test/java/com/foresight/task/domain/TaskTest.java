package com.foresight.task.domain;

import com.foresight.common.error.ApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskTest {

    private static final Instant T0 = Instant.parse("2026-10-14T10:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 14);

    private static Task task() {
        return new Task(UUID.randomUUID(), "Auth", null, null, null, UUID.randomUUID(), null, TODAY.plusDays(2),
                new BigDecimal("8"), T0);
    }

    @ParameterizedTest
    @CsvSource({
            "TODO,IN_PROGRESS,true", "TODO,IN_REVIEW,false", "IN_PROGRESS,IN_REVIEW,true", "BLOCKED,DONE,false",
            "IN_REVIEW,DONE,true", "DONE,IN_PROGRESS,true", "DONE,TODO,false", "CANCELLED,TODO,true",
            "CANCELLED,IN_PROGRESS,false"})
    void transitionTable(TaskStatus from, TaskStatus to, boolean allowed) {
        assertThat(from.canTransitionTo(to)).isEqualTo(allowed);
    }

    @Test
    void doneSetsCompletionAndReopeningClearsIt() {
        Task t = task();
        t.changeStatus(TaskStatus.IN_PROGRESS, T0);
        t.changeStatus(TaskStatus.DONE, T0.plusSeconds(60));
        assertThat(t.getCompletedAt()).isEqualTo(T0.plusSeconds(60));
        assertThat(t.getProgressPercentage()).isEqualTo(100);
        assertThat(t.getLastProgressAt()).isEqualTo(T0.plusSeconds(60));
        t.changeStatus(TaskStatus.IN_PROGRESS, T0.plusSeconds(120));
        assertThat(t.getCompletedAt()).isNull();
    }

    @Test
    void invalidTransitionIsRejected() {
        Task t = task();
        assertThatThrownBy(() -> t.changeStatus(TaskStatus.IN_REVIEW, T0))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).code()).isEqualTo("INVALID_STATUS_TRANSITION");
    }

    @Test
    void progressOnlyCountsAsActivityWhenItIncreases() {
        Task t = task();
        t.changeStatus(TaskStatus.IN_PROGRESS, T0);
        t.updateProgress(40, T0.plusSeconds(10));
        assertThat(t.getLastProgressAt()).isEqualTo(T0.plusSeconds(10));
        t.updateProgress(30, T0.plusSeconds(20));
        assertThat(t.getLastProgressAt()).isEqualTo(T0.plusSeconds(10));
        assertThatThrownBy(() -> t.updateProgress(101, T0)).isInstanceOf(ApiException.class);
    }

    @Test
    void closedTasksCannotReportProgressAndAreNeverOverdue() {
        Task t = task();
        t.changeStatus(TaskStatus.CANCELLED, T0);
        assertThatThrownBy(() -> t.updateProgress(10, T0)).isInstanceOf(ApiException.class);
        assertThat(t.isOverdue(TODAY.plusDays(30))).isFalse();
    }

    @Test
    void passedDueDateNeverChangesStatus() {
        Task t = task();
        assertThat(t.isOverdue(TODAY.plusDays(3))).isTrue();
        assertThat(t.getStatus()).isEqualTo(TaskStatus.TODO);
    }

    @Test
    void detailsAreValidated() {
        Task t = task();
        assertThatThrownBy(() -> t.updateDetails(" ", null, null, null, null, null, null, T0))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> t.updateDetails("X", null, null, TODAY, TODAY.minusDays(1), null, null, T0))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> t.updateDetails("X", null, null, null, null, new BigDecimal("-1"), null, T0))
                .isInstanceOf(ApiException.class);
        t.updateDetails("  Trimmed ", null, null, null, null, null, null, T0);
        assertThat(t.getTitle()).isEqualTo("Trimmed");
        assertThat(t.getPriority()).isEqualTo(TaskPriority.MEDIUM);
    }
}
