package com.foresight.risk.application;

import com.foresight.project.application.ProjectQueryApi;
import com.foresight.project.application.ProjectQueryApi.ProjectInfo;
import com.foresight.project.domain.ProjectRole;
import com.foresight.project.domain.ProjectStatus;
import com.foresight.risk.engine.model.Priority;
import com.foresight.risk.engine.model.ProjectSnapshot;
import com.foresight.risk.engine.model.ProjectSnapshot.Edge;
import com.foresight.risk.engine.model.ProjectSnapshot.MemberSnapshot;
import com.foresight.risk.engine.model.TaskSnapshot;
import com.foresight.risk.engine.model.TaskState;
import com.foresight.task.application.TaskQueryApi;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;

/**
 * Builds a consistent {@link ProjectSnapshot} in one REPEATABLE READ read-only transaction, so tasks, edges and
 * the data version all describe the same committed state.
 */
@Component
public class ProjectSnapshotLoader {

    public record LoadedSnapshot(ProjectSnapshot snapshot, ProjectStatus status) {
    }

    private final ProjectQueryApi projects;
    private final TaskQueryApi tasks;
    private final TransactionTemplate readTx;

    public ProjectSnapshotLoader(ProjectQueryApi projects, TaskQueryApi tasks, PlatformTransactionManager txManager) {
        this.projects = projects;
        this.tasks = tasks;
        this.readTx = new TransactionTemplate(txManager);
        this.readTx.setReadOnly(true);
        this.readTx.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }

    public LoadedSnapshot load(UUID projectId) {
        return readTx.execute(status -> {
            ProjectInfo info = projects.get(projectId);
            List<TaskSnapshot> taskSnapshots = tasks.activeTasks(projectId).stream()
                    .map(t -> new TaskSnapshot(t.id(), t.title(), TaskState.valueOf(t.status().name()),
                            Priority.valueOf(t.priority().name()), t.assigneeId(), t.startDate(), t.dueDate(),
                            t.estimatedHours() == null ? null : t.estimatedHours().doubleValue(),
                            t.progressPercentage(), t.createdAt(), t.lastProgressAt(), t.progressReported()))
                    .toList();
            List<Edge> edges = tasks.edges(projectId).stream()
                    .map(e -> new Edge(e.predecessorId(), e.successorId())).toList();
            List<MemberSnapshot> members = projects.members(projectId).stream()
                    .map(m -> new MemberSnapshot(m.userId(), m.fullName(), m.role() != ProjectRole.VIEWER))
                    .toList();
            ProjectSnapshot snapshot = new ProjectSnapshot(info.id(), info.name(), info.startDate(), info.deadline(),
                    info.dataVersion(), taskSnapshots, edges, members);
            return new LoadedSnapshot(snapshot, info.status());
        });
    }
}
