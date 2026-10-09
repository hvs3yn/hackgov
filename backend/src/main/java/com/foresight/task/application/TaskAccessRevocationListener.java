package com.foresight.task.application;

import com.foresight.common.time.TimeProvider;
import com.foresight.project.application.ProjectEvents.ProjectAccessRevokedEvent;
import com.foresight.task.domain.Task;
import com.foresight.task.domain.TaskActivity;
import com.foresight.task.domain.TaskActivityRepository;
import com.foresight.task.domain.TaskActivityType;
import com.foresight.task.domain.TaskRepository;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Unassigns a user's unfinished tasks when they can no longer work on the project (same transaction).
 */
@Component
class TaskAccessRevocationListener {

    private final TaskRepository tasks;
    private final TaskActivityRepository activities;
    private final TimeProvider time;

    TaskAccessRevocationListener(TaskRepository tasks, TaskActivityRepository activities, TimeProvider time) {
        this.tasks = tasks;
        this.activities = activities;
        this.time = time;
    }

    @EventListener
    void onAccessRevoked(ProjectAccessRevokedEvent event) {
        Instant now = time.now();
        for (Task task : tasks.findOpenAssigned(event.projectId(), event.userId())) {
            task.assign(null, now);
            activities.save(new TaskActivity(task.getId(), task.getProjectId(), event.actorId(),
                    TaskActivityType.UNASSIGNED_BY_MEMBERSHIP_CHANGE, event.userId(), null, now));
        }
    }
}
