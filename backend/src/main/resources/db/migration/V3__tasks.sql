CREATE TABLE tasks (
    id                  uuid          PRIMARY KEY,
    project_id          uuid          NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    title               varchar(200)  NOT NULL,
    description         text,
    status              varchar(16)   NOT NULL,
    priority            varchar(16)   NOT NULL,
    assignee_id         uuid          REFERENCES users (id) ON DELETE SET NULL,
    reporter_id         uuid          NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    start_date          date,
    due_date            date,
    estimated_hours     numeric(7, 2),
    actual_hours        numeric(7, 2),
    progress_percentage integer       NOT NULL DEFAULT 0,
    created_at          timestamptz   NOT NULL,
    updated_at          timestamptz   NOT NULL,
    completed_at        timestamptz,
    last_progress_at    timestamptz,
    archived_at         timestamptz,
    version             bigint        NOT NULL DEFAULT 0,
    CONSTRAINT uk_tasks_id_project UNIQUE (id, project_id),
    CONSTRAINT ck_tasks_status CHECK (status IN ('TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED')),
    CONSTRAINT ck_tasks_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT ck_tasks_dates CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
    CONSTRAINT ck_tasks_estimated_hours CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
    CONSTRAINT ck_tasks_actual_hours CHECK (actual_hours IS NULL OR actual_hours >= 0),
    CONSTRAINT ck_tasks_progress CHECK (progress_percentage BETWEEN 0 AND 100),
    CONSTRAINT ck_tasks_completed_at CHECK ((status = 'DONE') = (completed_at IS NOT NULL))
);

CREATE INDEX ix_tasks_project_status ON tasks (project_id, status) WHERE archived_at IS NULL;
CREATE INDEX ix_tasks_project_due ON tasks (project_id, due_date);
CREATE INDEX ix_tasks_assignee ON tasks (assignee_id) WHERE archived_at IS NULL;

CREATE TABLE task_dependencies (
    id                  uuid        PRIMARY KEY,
    project_id          uuid        NOT NULL,
    predecessor_task_id uuid        NOT NULL,
    successor_task_id   uuid        NOT NULL,
    type                varchar(24) NOT NULL DEFAULT 'FINISH_TO_START',
    created_by          uuid        REFERENCES users (id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL,
    CONSTRAINT uk_task_dependency UNIQUE (predecessor_task_id, successor_task_id),
    CONSTRAINT ck_task_dependency_not_self CHECK (predecessor_task_id <> successor_task_id),
    CONSTRAINT ck_task_dependency_type CHECK (type = 'FINISH_TO_START'),
    CONSTRAINT fk_task_dependency_predecessor FOREIGN KEY (predecessor_task_id, project_id)
        REFERENCES tasks (id, project_id) ON DELETE CASCADE,
    CONSTRAINT fk_task_dependency_successor FOREIGN KEY (successor_task_id, project_id)
        REFERENCES tasks (id, project_id) ON DELETE CASCADE
);

CREATE INDEX ix_task_dependency_project ON task_dependencies (project_id);
CREATE INDEX ix_task_dependency_successor ON task_dependencies (successor_task_id);

CREATE TABLE task_activities (
    id          uuid         PRIMARY KEY,
    task_id     uuid         NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    project_id  uuid         NOT NULL,
    actor_id    uuid         REFERENCES users (id) ON DELETE SET NULL,
    type        varchar(40)  NOT NULL,
    old_value   varchar(500),
    new_value   varchar(500),
    occurred_at timestamptz  NOT NULL
);

CREATE INDEX ix_task_activity_task ON task_activities (task_id, occurred_at DESC);
CREATE INDEX ix_task_activity_project ON task_activities (project_id, occurred_at DESC);
