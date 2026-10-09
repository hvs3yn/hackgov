CREATE TABLE workspaces (
    id         uuid         PRIMARY KEY,
    name       varchar(120) NOT NULL,
    created_at timestamptz  NOT NULL,
    updated_at timestamptz  NOT NULL,
    version    bigint       NOT NULL DEFAULT 0
);

CREATE TABLE workspace_memberships (
    id           uuid        PRIMARY KEY,
    workspace_id uuid        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role         varchar(16) NOT NULL,
    created_at   timestamptz NOT NULL,
    CONSTRAINT uk_ws_member UNIQUE (workspace_id, user_id),
    CONSTRAINT ck_ws_member_role CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER'))
);

CREATE INDEX ix_ws_member_user ON workspace_memberships (user_id);

CREATE TABLE projects (
    id                         uuid         PRIMARY KEY,
    workspace_id               uuid         NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    name                       varchar(160) NOT NULL,
    description                text,
    status                     varchar(16)  NOT NULL,
    start_date                 date,
    deadline                   date,
    created_by                 uuid         NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    created_at                 timestamptz  NOT NULL,
    updated_at                 timestamptz  NOT NULL,
    archived_at                timestamptz,
    version                    bigint       NOT NULL DEFAULT 0,
    data_version               bigint       NOT NULL DEFAULT 0,
    last_analyzed_at           timestamptz,
    last_analyzed_data_version bigint,
    CONSTRAINT uk_projects_id_workspace UNIQUE (id, workspace_id),
    CONSTRAINT ck_projects_status CHECK (status IN ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED')),
    CONSTRAINT ck_projects_dates CHECK (deadline IS NULL OR start_date IS NULL OR deadline >= start_date)
);

CREATE INDEX ix_projects_workspace_status ON projects (workspace_id, status);
CREATE INDEX ix_projects_status ON projects (status);

CREATE TABLE project_memberships (
    id           uuid        PRIMARY KEY,
    project_id   uuid        NOT NULL,
    workspace_id uuid        NOT NULL,
    user_id      uuid        NOT NULL,
    role         varchar(16) NOT NULL,
    created_at   timestamptz NOT NULL,
    CONSTRAINT uk_project_member UNIQUE (project_id, user_id),
    CONSTRAINT ck_project_member_role CHECK (role IN ('LEAD', 'CONTRIBUTOR', 'VIEWER')),
    CONSTRAINT fk_project_member_project FOREIGN KEY (project_id, workspace_id)
        REFERENCES projects (id, workspace_id) ON DELETE CASCADE,
    CONSTRAINT fk_project_member_ws_member FOREIGN KEY (workspace_id, user_id)
        REFERENCES workspace_memberships (workspace_id, user_id) ON DELETE CASCADE
);

CREATE INDEX ix_project_member_user ON project_memberships (user_id);
