package com.foresight.risk.domain;

public final class RiskEnums {

    private RiskEnums() {
    }

    public enum AssessmentStatus {ACTIVE, RESOLVED}

    public enum ResolutionReason {CONDITION_CLEARED, TASK_CLOSED, TASK_ARCHIVED, PROJECT_INACTIVE}

    public enum RiskEventType {DETECTED, ESCALATED, MITIGATED, UPDATED, RESOLVED, REOPENED}

    /** Delivery of the current revision to the AI Inbox. */
    public enum DeliveryStatus {NOT_REQUIRED, PENDING, IN_PROGRESS, DELIVERED, FAILED}
}
