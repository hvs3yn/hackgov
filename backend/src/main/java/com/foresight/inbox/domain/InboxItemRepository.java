package com.foresight.inbox.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InboxItemRepository extends JpaRepository<InboxItem, UUID>, JpaSpecificationExecutor<InboxItem> {

    Optional<InboxItem> findByIdAndRecipientId(UUID id, UUID recipientId);

    Optional<InboxItem> findByAssessmentIdAndRecipientId(UUID assessmentId, UUID recipientId);

    List<InboxItem> findByAssessmentId(UUID assessmentId);

    long countByRecipientIdAndReadAtIsNullAndDispositionNot(UUID recipientId, InboxItem.Disposition disposition);

    @Modifying(flushAutomatically = true)
    @Query("delete from InboxItem i where i.projectId = :projectId and i.recipientId = :recipientId")
    int deleteForRecipientInProject(@Param("projectId") UUID projectId, @Param("recipientId") UUID recipientId);
}
