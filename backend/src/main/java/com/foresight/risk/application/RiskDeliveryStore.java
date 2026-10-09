package com.foresight.risk.application;

import com.foresight.common.time.TimeProvider;
import com.foresight.risk.domain.RiskAssessment;
import com.foresight.risk.domain.RiskAssessmentRepository;
import com.foresight.risk.domain.RiskEnums.DeliveryStatus;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Delivery-state API of the risk module used by the inbox's delivery pipeline.
 * All state changes are conditional/locked so concurrent workers cannot deliver the same revision twice.
 */
@Service
public class RiskDeliveryStore {

    private final RiskAssessmentRepository assessments;
    private final RiskProperties properties;
    private final TimeProvider time;

    public RiskDeliveryStore(RiskAssessmentRepository assessments, RiskProperties properties, TimeProvider time) {
        this.assessments = assessments;
        this.properties = properties;
        this.time = time;
    }

    /** Ids of assessments that are due for (re)delivery, including expired claims. */
    @Transactional(readOnly = true)
    public List<UUID> findDeliverable(int limit) {
        Instant now = time.now();
        return assessments.findDeliverable(DeliveryStatus.PENDING, DeliveryStatus.IN_PROGRESS, now,
                now.minus(properties.deliveryLease()), PageRequest.of(0, limit));
    }

    @Transactional(readOnly = true)
    public Optional<RiskAssessment> find(UUID assessmentId) {
        return assessments.findById(assessmentId);
    }

    /** Attempts to claim the given revision; true if this caller owns the delivery now. */
    @Transactional
    public boolean claim(UUID assessmentId, int revision) {
        Instant now = time.now();
        return assessments.claimDelivery(assessmentId, revision, now, now.minus(properties.deliveryLease())) == 1;
    }

    /**
     * Locks the assessment for finalization inside the caller's transaction. Returns empty when the assessment
     * changed since the claim (newer revision, resolved, or claim lost) – the caller must then not deliver.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<RiskAssessment> lockIfStillClaimed(UUID assessmentId, int revision) {
        return assessments.findByIdForUpdate(assessmentId)
                .filter(a -> a.getRevision() == revision && a.getDeliveryStatus() == DeliveryStatus.IN_PROGRESS);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void markDelivered(RiskAssessment assessment, String explanationJson, String source) {
        assessment.markDelivered(explanationJson, source, assessment.getRevision());
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void markNotRequired(RiskAssessment assessment) {
        assessment.markDeliveryNotRequired();
    }

    @Transactional
    public void markFailed(UUID assessmentId, int revision) {
        assessments.findByIdForUpdate(assessmentId)
                .filter(a -> a.getRevision() == revision && a.getDeliveryStatus() == DeliveryStatus.IN_PROGRESS)
                .ifPresent(a -> a.markDeliveryFailed(properties.deliveryMaxAttempts(), time.now()));
    }
}
