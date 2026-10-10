-- AI explanation generation log (telemetry only: never prompts, credentials or model output text).
-- Previously a MongoDB collection; rows are purged after 90 days by AiGenerationLog.purgeExpired().
CREATE TABLE ai_generations (
    id                  uuid         PRIMARY KEY,
    assessment_id       uuid         NOT NULL REFERENCES risk_assessments (id) ON DELETE CASCADE,
    project_id          uuid         NOT NULL,
    revision            integer      NOT NULL,
    category            varchar(32),
    severity            varchar(16),
    configured_provider varchar(32),
    model               varchar(100),
    source              varchar(32),
    outcome             varchar(16)  NOT NULL,
    fallback_reason     varchar(100),
    error_message       varchar(300),
    latency_ms          bigint       NOT NULL,
    recommended_actions integer      NOT NULL,
    created_at          timestamptz  NOT NULL,
    CONSTRAINT ck_ai_generations_outcome CHECK (outcome IN ('PROVIDER', 'FALLBACK'))
);

CREATE INDEX ix_ai_generations_assessment_created ON ai_generations (assessment_id, created_at DESC);
CREATE INDEX ix_ai_generations_created ON ai_generations (created_at);
