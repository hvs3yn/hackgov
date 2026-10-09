CREATE TABLE users (
    id            uuid         PRIMARY KEY,
    full_name     varchar(120) NOT NULL,
    email         varchar(254) NOT NULL,
    password_hash varchar(100) NOT NULL,
    enabled       boolean      NOT NULL DEFAULT true,
    created_at    timestamptz  NOT NULL,
    updated_at    timestamptz  NOT NULL,
    version       bigint       NOT NULL DEFAULT 0,
    CONSTRAINT uk_users_email UNIQUE (email),
    CONSTRAINT ck_users_email_lower CHECK (email = lower(email)),
    CONSTRAINT ck_users_full_name_not_blank CHECK (length(trim(full_name)) > 0)
);

CREATE TABLE refresh_tokens (
    id             uuid        PRIMARY KEY,
    user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash     varchar(64) NOT NULL,
    expires_at     timestamptz NOT NULL,
    created_at     timestamptz NOT NULL,
    revoked_at     timestamptz,
    replaced_by_id uuid,
    CONSTRAINT uk_refresh_tokens_hash UNIQUE (token_hash)
);

CREATE INDEX ix_refresh_tokens_user ON refresh_tokens (user_id);
