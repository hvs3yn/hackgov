package com.foresight.risk.application;

import java.util.List;
import java.util.UUID;

public final class RiskEvents {

    private RiskEvents() {
    }

    /** Assessments whose current revision must be delivered to the AI Inbox (published in the reconcile tx). */
    public record RiskDeliveryRequestedEvent(UUID projectId, List<UUID> assessmentIds) {
    }
}
