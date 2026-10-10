# Security

## Authentication

- **Registration/login** via `/api/v1/auth/*`. E-mail normalized (trim + lower case) before lookup and storage; uniqueness enforced by `uk_users_email` (concurrent duplicate registrations → `409 EMAIL_TAKEN`, the DB is the authority).
- **Password storage**: BCrypt (`BCryptPasswordEncoder`, strength 12 by default, `APP_SECURITY_BCRYPT_STRENGTH`). Passwords are never logged or returned.
- **Login errors** are uniform (`401 INVALID_CREDENTIALS`) for unknown e-mail, wrong password or disabled account; a dummy hash comparison is executed for unknown e-mails to reduce timing differences. Failed attempts are logged server-side with a reason and user id only (never the e-mail or password).
- **Access tokens**: JWT HS256 signed with `APP_JWT_SECRET` (≥ 32 bytes, required; the app refuses to start otherwise, except the `local` profile which generates an ephemeral random secret and logs a warning). Claims: `iss` (`APP_JWT_ISSUER`, default `foresight`), `sub` (user id), `iat`, `exp` (15 min, `APP_JWT_ACCESS_TTL`), `email`. Validated by Spring Security's resource server (`NimbusJwtDecoder`) with signature, `exp`/`nbf` (60 s clock skew) and issuer validators; the user must still exist and be enabled (checked when resolving the current user).
- **Refresh tokens**: 256-bit random, base64url; only the SHA-256 hash is stored. Single use with rotation; TTL 14 days (`APP_JWT_REFRESH_TTL`). Presenting an already-rotated token is treated as theft: all of that user's refresh tokens are revoked. Logout revokes the presented token.

## Authorization

- Every non-public endpoint requires an authenticated JWT (`anyRequest().authenticated()`).
- **Resource-based checks in application services** (never only in controllers):
  - Workspace: `WorkspaceAccess.require(workspaceId, userId, minRole)`.
  - Project/task/dependency/risk: `ProjectAccessService.require(projectId, userId, Permission)` with `VIEW`, `CONTRIBUTE`, `MANAGE`; task-level edit rules (assignee/reporter) on top.
  - Inbox: queries always include `recipient_id = currentUser`.
- **Cross-tenant protection**: entities are always loaded by ID *and then* authorized against the caller; a caller without visibility receives `404`, so IDs cannot be probed. DB composite FKs prevent a dependency or membership from referencing another project/workspace even if application code had a bug.
- **AI-triggered operations**: the AI layer has no write access to domain data; it only returns text that is validated and stored. Manual analysis requires `CONTRIBUTE` permission.

## Transport, CORS and CSRF

- CORS: origins or origin patterns from `APP_CORS_ALLOWED_ORIGINS` (comma-separated; default `http://localhost:[*],http://127.0.0.1:[*]` for local frontends on any port – **set explicit origins in production**), methods GET/POST/PUT/PATCH/DELETE/OPTIONS, headers `Authorization, Content-Type, Accept, X-Request-Id`, exposed `X-Request-Id, Retry-After`. Credentialed requests are allowed so clients using `withCredentials` work; authentication never uses cookies.
- Public endpoints (`/api/v1/auth/*`, health, API docs) ignore any `Authorization` header, so a stale token stored by a client can never block login, registration or refresh.
- CSRF protection is **disabled** because authentication uses bearer tokens in the `Authorization` header only (no cookies, no ambient credentials). If cookie-based auth is ever added, CSRF must be re-enabled.
- Sessions: `STATELESS`. Security headers: Spring Security defaults (X-Content-Type-Options, X-Frame-Options DENY, HSTS when served over HTTPS, cache control).

## Input validation

- Jakarta Bean Validation on all request DTOs (`@NotBlank`, `@Size`, `@Email`, ranges, enum binding).
- Domain invariants re-checked in entities/services (status transitions, date ordering, progress range, same-project dependencies).
- Pagination size capped at 100; sort fields whitelisted (unknown fields → `400`).
- Unknown JSON properties are rejected (`FAIL_ON_UNKNOWN_PROPERTIES`) to surface client bugs early.

## Secrets management

- For local runs the app also imports an optional `.env` file from the working directory (`spring.config.import: optional:file:.env[.properties]`); real environment variables take precedence. `.env` is git-ignored and excluded from the Docker build context.
- All secrets from environment variables: `APP_JWT_SECRET`, `DB_PASSWORD` (and `DB_URL`/`DB_USERNAME`), `ANTHROPIC_API_KEY`. `.env.example` contains placeholders only; `.env` is git-ignored.
- The AI generation log (`ai_generations`) stores metadata only (no prompts, model output text or keys) and is readable only by members of the risk's project.
- No secrets in logs: request logging does not log headers/bodies; the AI provider never logs prompts with keys; exceptions are logged without request payloads.

## Error responses

`problem+json` with a stable `code`; 500 responses contain a generic message and the request ID only. Stack traces, SQL and constraint names are never returned.

## Known limitations

- No login rate limiting / account lockout (recommended next step: bucket per IP+email).
- No e-mail verification or password reset.
- HS256 shared secret (single service); move to asymmetric keys if tokens must be verified by other services.
