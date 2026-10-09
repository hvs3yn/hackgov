package com.foresight.inbox.application;

import com.foresight.risk.application.RiskEvents.RiskDeliveryRequestedEvent;
import com.foresight.risk.application.RiskProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.UUID;

/**
 * Delivers right after an analysis commits (async) and sweeps periodically for pending, failed-with-backoff or
 * abandoned (lease expired) deliveries.
 */
@Component
public class DeliveryTriggers {

    private static final Logger log = LoggerFactory.getLogger(DeliveryTriggers.class);
    private static final int SWEEP_BATCH = 50;

    private final RiskAlertDeliveryService delivery;
    private final RiskProperties properties;

    public DeliveryTriggers(RiskAlertDeliveryService delivery, RiskProperties properties) {
        this.delivery = delivery;
        this.properties = properties;
    }

    @Async
    @TransactionalEventListener
    public void onDeliveryRequested(RiskDeliveryRequestedEvent event) {
        if (!properties.onChangeEnabled()) {
            return;
        }
        for (UUID id : event.assessmentIds()) {
            delivery.deliver(id);
        }
    }

    @Scheduled(fixedDelayString = "${app.risk.delivery-sweep-interval:PT1M}", initialDelayString = "PT30S")
    public void sweep() {
        if (!properties.schedulingEnabled()) {
            return;
        }
        int processed = delivery.deliverPending(SWEEP_BATCH);
        if (processed > 0) {
            log.info("Delivery sweep processed {} assessment(s)", processed);
        }
    }
}
