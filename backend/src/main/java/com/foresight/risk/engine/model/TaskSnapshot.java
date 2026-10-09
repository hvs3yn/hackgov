package com.foresight.risk.engine.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Immutable task data used by the engine.
 *
 * @param estimatedHours   null when no estimate was recorded
 * @param lastProgressAt   last recorded progress (status advance or progress increase); null if none
 * @param progressReported whether any explicit progress update was ever recorded
 */
public record TaskSnapshot(UUID id, String title, TaskState state, Priority priority, UUID assigneeId,
                           LocalDate startDate, LocalDate dueDate, Double estimatedHours, int progressPercentage,
                           Instant createdAt, Instant lastProgressAt, boolean progressReported) {

    public boolean isOpen() {
        return state.isOpen();
    }

    public boolean hasEstimate() {
        return estimatedHours != null;
    }

    /** Remaining estimated hours, or null when unknown. */
    public Double remainingHours() {
        if (estimatedHours == null) {
            return null;
        }
        return estimatedHours * (100 - progressPercentage) / 100.0;
    }
}
