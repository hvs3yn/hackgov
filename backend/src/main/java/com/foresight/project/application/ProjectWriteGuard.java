package com.foresight.project.application;

import com.foresight.common.error.ApiException;
import com.foresight.project.application.ProjectEvents.ProjectDataChangedEvent;
import com.foresight.project.domain.ProjectRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Entry point for every write that changes risk-relevant project data.
 * <p>
 * Incrementing {@code projects.data_version} takes the project's row lock until the transaction ends, which
 * (a) serializes graph mutations such as dependency inserts so cycle checks cannot race, and
 * (b) lets risk analysis detect that its snapshot became stale.
 */
@Component
public class ProjectWriteGuard {

    private final ProjectRepository projects;
    private final ApplicationEventPublisher events;

    public ProjectWriteGuard(ProjectRepository projects, ApplicationEventPublisher events) {
        this.projects = projects;
        this.events = events;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void lockForWrite(UUID projectId) {
        if (projects.incrementDataVersion(projectId) == 0) {
            throw ApiException.notFound("Project");
        }
        events.publishEvent(new ProjectDataChangedEvent(projectId));
    }
}
