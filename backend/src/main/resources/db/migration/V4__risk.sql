CREATE TABLE risk_assessments (
    id                       uuid         PRIMARY KEY,
    project_id               uuid         NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    task_id                  uuid         REFERENCES tasks (id) ON DELETE CASCADE,
    subject_user_id          uuid         REFERENCES users (id) ON DELETE SET NULL,
    category                 varchar(32)  NOT NULL,
    fingerprint              varchar(200) NOT NULL,
    status                   varchar(16)  NOT NULL,
    severity                 varchar(16)  NOT NULL,
    score                    integer      NOT NULL,
    confidence               varchar(16)  NOT NULL,
    title                    varchar(300) NOT NULL,
    summary                  text         NOT NULL,
    factors_json             text         NOT NULL,
    evidence_json            text         NOT NULL,
    affected_task_ids_json   text         NOT NULL,
    missing_data_json        text         NOT NULL,
    content_hash             varchar(64)  NOT NULL,
    revision                 integer      NOT NULL,
    first_detected_at        timestamptz  NOT NULL,
    last_evaluated_at        timestamptz  NOT NULL,
    last_changed_at          timestamptz  NOT NULL,
    resolved_at              timestamptz,
    resolution_reason        varchar(32),
    reopen_count             integer      NOT NULL DEFAULT 0,
    analyzed_data_version    bigint       NOT NULL,
    explanation_json         text,
    explanation_source       varchar(32),
    explanation_revision     integer,
    delivery_status          varchar(16)  NOT NULL,
    delivery_attempts        integer      NOT NULL DEFAULT 0,
    delivery_claimed_at      timestamptz,
    next_delivery_attempt_at timestamptz,
    version                  bigint       NOT NULL DEFAULT 0,
    CONSTRAINT uk_risk_identity UNIQUE (project_id, fingerprint),
    CONSTRAINT ck_risk_category CHECK (category IN ('OVERDUE_TASK', 'APPROACHING_DEADLINE', 'STALLED_TASK',
                                                    'BLOCKED_DEPENDENCY', 'PROJECT_DEADLINE', 'WORKLOAD_IMBALANCE')),
    CONSTRAINT ck_risk_status CHECK (status IN ('ACTIVE', 'RESOLVED')),
    CONSTRAINT ck_risk_severity CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT ck_risk_confidence CHECK (confidence IN ('LOW', 'MEDIUM', 'HIGH')),
    CONSTRAINT ck_risk_score CHECK (score BETWEEN 0 AND 100),
    CONSTRAINT ck_risk_resolution CHECK ((status = 'RESOLVED') = (resolved_at IS NOT NULL)),
    CONSTRAINT ck_risk_delivery_status CHECK (delivery_status IN ('NOT_REQUIRED', 'PENDING', 'IN_PROGRESS', 'DELIVERED', 'FAILED'))
);

CREATE INDEX ix_risk_project_status ON risk_assessments (project_id, status);
CREATE INDEX ix_risk_task ON risk_assessments (task_id);
CREATE INDEX ix_risk_delivery ON risk_assessments (delivery_status, next_delivery_attempt_at);

CREATE TABLE risk_assessment_events (
    id            uuid         PRIMARY KEY,
    assessment_id uuid         NOT NULL REFERENCES risk_assessments (id) ON DELETE CASCADE,
    project_id    uuid         NOT NULL,
    event_type    varchar(16)  NOT NULL,
    severity      varchar(16)  NOT NULL,
    score         integer      NOT NULL,
    revision      integer      NOT NULL,
    details       varchar(500),
    occurred_at   timestamptz  NOT NULL,
    CONSTRAINT ck_risk_event_type CHECK (event_type IN ('DETECTED', 'ESCALATED', 'MITIGATED', 'UPDATED', 'RESOLVED', 'REOPENED'))
);

CREATE INDEX ix_risk_event_assessment ON risk_assessment_events (assessment_id, occurred_at DESC);
