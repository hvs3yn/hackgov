package com.foresight.inbox.application;

import com.foresight.inbox.domain.InboxItemRepository;
import com.foresight.project.application.ProjectEvents.ProjectAccessRevokedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** Users who lose access to a project also lose its inbox items (same transaction). */
@Component
class InboxAccessRevocationListener {

    private final InboxItemRepository items;

    InboxAccessRevocationListener(InboxItemRepository items) {
        this.items = items;
    }

    @EventListener
    void onAccessRevoked(ProjectAccessRevokedEvent event) {
        if (event.fullyRemoved()) {
            items.deleteForRecipientInProject(event.projectId(), event.userId());
        }
    }
}
