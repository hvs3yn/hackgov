package com.foresight.risk.engine.model;

/** Engine-local mirror of the task lifecycle (keeps the engine free of persistence types). */
public enum TaskState {
    TODO, IN_PROGRESS, BLOCKED, IN_REVIEW, DONE, CANCELLED;

    public boolean isOpen() {
        return this != DONE && this != CANCELLED;
    }

    public boolean isStarted() {
        return this == IN_PROGRESS || this == IN_REVIEW || this == BLOCKED;
    }
}
