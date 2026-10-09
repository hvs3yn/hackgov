package com.foresight.task.domain;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

public enum TaskStatus {
    TODO, IN_PROGRESS, BLOCKED, IN_REVIEW, DONE, CANCELLED;

    private static final Map<TaskStatus, Set<TaskStatus>> ALLOWED = Map.of(
            TODO, EnumSet.of(IN_PROGRESS, BLOCKED, DONE, CANCELLED),
            IN_PROGRESS, EnumSet.of(TODO, BLOCKED, IN_REVIEW, DONE, CANCELLED),
            BLOCKED, EnumSet.of(TODO, IN_PROGRESS, CANCELLED),
            IN_REVIEW, EnumSet.of(IN_PROGRESS, DONE, CANCELLED),
            DONE, EnumSet.of(IN_PROGRESS),
            CANCELLED, EnumSet.of(TODO));

    public boolean canTransitionTo(TaskStatus target) {
        return ALLOWED.get(this).contains(target);
    }

    /** DONE or CANCELLED: no longer outstanding work. */
    public boolean isClosed() {
        return this == DONE || this == CANCELLED;
    }

    /** A finish-to-start prerequisite in this status no longer blocks its dependents. */
    public boolean satisfiesDependents() {
        return isClosed();
    }

    /** Entering this status means work proceeds, which requires all prerequisites to be satisfied. */
    public boolean requiresSatisfiedPrerequisites() {
        return this == IN_PROGRESS || this == IN_REVIEW || this == DONE;
    }

    /** Entering this status counts as recorded progress (used by the stall rule). */
    public boolean countsAsProgress() {
        return this == IN_PROGRESS || this == IN_REVIEW || this == DONE;
    }

    public boolean isStarted() {
        return this == IN_PROGRESS || this == IN_REVIEW || this == BLOCKED;
    }
}
