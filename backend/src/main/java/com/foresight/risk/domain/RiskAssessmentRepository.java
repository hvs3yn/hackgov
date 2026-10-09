package com.foresight.risk.domain;

import com.foresight.risk.domain.RiskEnums.AssessmentStatus;
import com.foresight.risk.domain.RiskEnums.DeliveryStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RiskAssessmentRepository extends JpaRepository<RiskAssessment, UUID>,
        JpaSpecificationExecutor<RiskAssessment> {

    List<RiskAssessment> findByProjectId(UUID projectId);

    List<RiskAssessment> findByProjectIdAndStatus(UUID projectId, AssessmentStatus status);

    List<RiskAssessment> findByTaskIdAndStatus(UUID taskId, AssessmentStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from RiskAssessment a where a.id = :id")
    Optional<RiskAssessment> findByIdForUpdate(@Param("id") UUID id);

    /**
     * Claims a pending delivery (or one whose lease expired) for the given revision. Returns 1 if this caller
     * won the claim. Being a single conditional UPDATE it is safe across threads and instances.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update RiskAssessment a
               set a.deliveryStatus = com.foresight.risk.domain.RiskEnums.DeliveryStatus.IN_PROGRESS,
                   a.deliveryClaimedAt = :now
             where a.id = :id and a.revision = :revision
               and (a.deliveryStatus = com.foresight.risk.domain.RiskEnums.DeliveryStatus.PENDING
                    or (a.deliveryStatus = com.foresight.risk.domain.RiskEnums.DeliveryStatus.IN_PROGRESS
                        and a.deliveryClaimedAt < :leaseExpiredBefore))""")
    int claimDelivery(@Param("id") UUID id, @Param("revision") int revision, @Param("now") Instant now,
                      @Param("leaseExpiredBefore") Instant leaseExpiredBefore);

    @Query("""
            select a.id from RiskAssessment a
             where (a.deliveryStatus = :pending and a.nextDeliveryAttemptAt <= :now)
                or (a.deliveryStatus = :inProgress and a.deliveryClaimedAt < :leaseExpiredBefore)
             order by a.nextDeliveryAttemptAt""")
    List<UUID> findDeliverable(@Param("pending") DeliveryStatus pending, @Param("inProgress") DeliveryStatus inProgress,
                               @Param("now") Instant now, @Param("leaseExpiredBefore") Instant leaseExpiredBefore,
                               Pageable pageable);
}
