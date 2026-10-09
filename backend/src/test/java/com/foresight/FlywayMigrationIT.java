package com.foresight;

import com.foresight.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Migrations apply on an empty PostgreSQL (the context only starts if Flyway and Hibernate validation succeed)
 * and the key integrity constraints are enforced by the database itself.
 */
class FlywayMigrationIT extends IntegrationTest {

    @Test
    void allMigrationsAppliedSuccessfully() {
        List<String> versions = jdbc.queryForList(
                "select version from flyway_schema_history where success order by installed_rank", String.class);
        assertThat(versions).containsExactly("1", "2", "3", "4", "5");
    }

    @Test
    void emailUniquenessAndNormalizationAreEnforced() {
        insertUser(UUID.randomUUID(), "a@example.com");
        assertThatThrownBy(() -> insertUser(UUID.randomUUID(), "a@example.com"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertUser(UUID.randomUUID(), "Upper@Example.com"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void taskConstraintsAreEnforced() {
        UUID user = UUID.randomUUID();
        insertUser(user, "u@example.com");
        UUID ws = UUID.randomUUID();
        jdbc.update("insert into workspaces (id, name, created_at, updated_at) values (?, 'W', now(), now())", ws);
        UUID project = UUID.randomUUID();
        jdbc.update("""
                insert into projects (id, workspace_id, name, status, created_by, created_at, updated_at)
                values (?, ?, 'P', 'ACTIVE', ?, now(), now())""", project, ws, user);
        UUID a = insertTask(project, user, "TODO", null);
        UUID b = insertTask(project, user, "TODO", null);

        // DONE requires completed_at and vice versa
        assertThatThrownBy(() -> insertTask(project, user, "DONE", null))
                .isInstanceOf(DataIntegrityViolationException.class);
        // no self dependency
        assertThatThrownBy(() -> insertDependency(project, a, a)).isInstanceOf(DataIntegrityViolationException.class);
        // duplicate dependency
        insertDependency(project, a, b);
        assertThatThrownBy(() -> insertDependency(project, a, b)).isInstanceOf(DataIntegrityViolationException.class);
        // cross-project dependency is impossible thanks to composite foreign keys
        UUID otherProject = UUID.randomUUID();
        jdbc.update("""
                insert into projects (id, workspace_id, name, status, created_by, created_at, updated_at)
                values (?, ?, 'Other', 'ACTIVE', ?, now(), now())""", otherProject, ws, user);
        UUID c = insertTask(otherProject, user, "TODO", null);
        assertThatThrownBy(() -> insertDependency(project, a, c)).isInstanceOf(DataIntegrityViolationException.class);
        // progress range
        assertThatThrownBy(() -> jdbc.update("update tasks set progress_percentage = 101 where id = ?", a))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void projectMembershipRequiresWorkspaceMembership() {
        UUID user = UUID.randomUUID();
        insertUser(user, "m@example.com");
        UUID ws = UUID.randomUUID();
        jdbc.update("insert into workspaces (id, name, created_at, updated_at) values (?, 'W', now(), now())", ws);
        UUID project = UUID.randomUUID();
        jdbc.update("""
                insert into projects (id, workspace_id, name, status, created_by, created_at, updated_at)
                values (?, ?, 'P', 'ACTIVE', ?, now(), now())""", project, ws, user);
        assertThatThrownBy(() -> jdbc.update("""
                insert into project_memberships (id, project_id, workspace_id, user_id, role, created_at)
                values (?, ?, ?, ?, 'LEAD', now())""", UUID.randomUUID(), project, ws, user))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private void insertUser(UUID id, String email) {
        jdbc.update("""
                insert into users (id, full_name, email, password_hash, enabled, created_at, updated_at)
                values (?, 'X', ?, 'hash', true, now(), now())""", id, email);
    }

    private UUID insertTask(UUID project, UUID reporter, String status, Object completedAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into tasks (id, project_id, title, status, priority, reporter_id, created_at, updated_at, completed_at)
                values (?, ?, 'T', ?, 'MEDIUM', ?, now(), now(), ?)""", id, project, status, reporter, completedAt);
        return id;
    }

    private void insertDependency(UUID project, UUID predecessor, UUID successor) {
        jdbc.update("""
                insert into task_dependencies (id, project_id, predecessor_task_id, successor_task_id, created_at)
                values (?, ?, ?, ?, now())""", UUID.randomUUID(), project, predecessor, successor);
    }
}
