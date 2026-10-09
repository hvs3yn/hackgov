CREATE TABLE inbox_items (
    id                  uuid         PRIMARY KEY,
    recipient_id        uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    project_id          uuid         NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    task_id             uuid         REFERENCES tasks (id) ON DELETE CASCADE,
    assessment_id       uuid         NOT NULL REFERENCES risk_assessments (id) ON DELETE CASCADE,
    category            varchar(32)  NOT NULL,
    severity            varchar(16)  NOT NULL,
    title               varchar(300) NOT NULL,
    explanation_json    text         NOT NULL,
    actions_json        text         NOT NULL,
    assessment_revision integer      NOT NULL,
    read_at             timestamptz,
    disposition         varchar(16)  NOT NULL,
    disposition_at      timestamptz,
    created_at          timestamptz  NOT NULL,
    last_delivered_at   timestamptz  NOT NULL,
    updated_at          timestamptz  NOT NULL,
    version             bigint       NOT NULL DEFAULT 0,
    CONSTRAINT uk_inbox_assessment_recipient UNIQUE (assessment_id, recipient_id),
    CONSTRAINT ck_inbox_disposition CHECK (disposition IN ('OPEN', 'ACKNOWLEDGED', 'DISMISSED')),
    CONSTRAINT ck_inbox_severity CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

CREATE INDEX ix_inbox_recipient_delivered ON inbox_items (recipient_id, last_delivered_at DESC);
CREATE INDEX ix_inbox_recipient_read ON inbox_items (recipient_id, read_at);
CREATE INDEX ix_inbox_project ON inbox_items (project_id);
