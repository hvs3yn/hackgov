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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;

/**
 * Builds a consistent {@link ProjectSnapshot} in one REPEATABLE READ read-only transaction, so tasks, edges and
 * the data version all describe the same committed state.
 * <p>
 * The isolation level is set with {@code SET TRANSACTION} inside the transaction rather than through
 * {@code Connection.setTransactionIsolation}: the JDBC driver implements the latter as a session-level
 * {@code SET SESSION CHARACTERISTICS}, which leaks to unrelated transactions behind a transaction-mode
 * connection pooler (e.g. Neon's {@code -pooler} endpoint / PgBouncer) and makes ordinary writes fail with
 * serialization errors.
 */
@Component
public class ProjectSnapshotLoader {

    public record LoadedSnapshot(ProjectSnapshot snapshot, ProjectStatus status) {
    }

    private final ProjectQueryApi projects;
    private final TaskQueryApi tasks;
    private final TransactionTemplate readTx;
    private final JdbcTemplate jdbc;

    public ProjectSnapshotLoader(ProjectQueryApi projects, TaskQueryApi tasks, PlatformTransactionManager txManager,
                                 JdbcTemplate jdbc) {
        this.projects = projects;
        this.tasks = tasks;
        this.jdbc = jdbc;
        this.readTx = new TransactionTemplate(txManager);
        this.readTx.setReadOnly(true);
    }

    public LoadedSnapshot load(UUID projectId) {
        return readTx.execute(status -> {
            // Must be the first statement of the transaction; scoped to this transaction only.
            jdbc.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
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
