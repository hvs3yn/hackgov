# Implementation Backlog

Legend: **P0** must-have, **P1** should-have, **P2** nice-to-have · Complexity **S/M/L** · `deps` = task IDs that must be done first.
Source of truth for progress. A box is ticked only when the code, its tests and a green build exist.

**Status (2026-10-09):** `./mvnw clean verify` green – 92 unit + 51 integration tests; live end-to-end run 23/23 checks; Docker image builds and runs healthy as a non-root user.

---

## Phase 0 – Repository assessment and project setup

- [x] **SETUP-001 Assess repository** (P0, S) – Inspect structure, versions, code, tests; record findings. *Result*: `docs/initial-assessment.md`. *Acceptance*: lists versions, reusable code, problems, decisions. deps: –. Tests: n/a.
- [x] **SETUP-002 Verify baseline build** (P0, S) – Run `./mvnw clean install` on the original code. *Acceptance*: build result recorded (17 tests passed). deps: SETUP-001.

## Phase 1 – Architecture, documentation, plan

- [x] **DOC-001 Requirements** (P0, M) – `docs/requirements.md` with roles, FR/NFR, journeys, MVP and out-of-scope. deps: SETUP-001.
- [x] **DOC-002 Architecture** (P0, M) – `docs/architecture.md` with modules, dependency rules, transactions, diagrams. deps: DOC-001.
- [x] **DOC-003 Domain model & DB design** (P0, M) – `docs/domain-model.md`, `docs/database-design.md`. deps: DOC-002.
- [x] **DOC-004 API specification** (P0, M) – `docs/api-specification.md`. deps: DOC-003.
- [x] **DOC-005 Risk engine & AI spec** (P0, M) – `docs/ai-risk-engine.md`. deps: DOC-003.
- [x] **DOC-006 Security & testing strategy** (P0, S) – `docs/security.md`, `docs/testing-strategy.md`. deps: DOC-002.
- [x] **DOC-007 Backlog** (P0, S) – this file. deps: DOC-001..006.
- [x] **DOC-008 Consistency review** (P0, S) – cross-check docs; fix contradictions before coding. deps: DOC-007.

## Phase 2 – Application foundation and database migrations

- [x] **FND-001 Build upgrade** (P0, M) – Spring Boot 4.1.1, Java 25, starters (webmvc, data-jpa, security, oauth2-resource-server, validation, actuator, flyway), PostgreSQL driver, springdoc 3.1.1, anthropic-java, Testcontainers, ArchUnit; Surefire/Failsafe split. *Acceptance*: `./mvnw -DskipTests package` succeeds. Files: `pom.xml`. deps: DOC-008. Tests: build.
- [x] **FND-002 Remove stubs & re-root package** (P0, S) – Delete stub controllers, in-memory repo, sample loader, `com.hackgov`; add `com.foresight.ForesightApplication`. *Acceptance*: no hard-coded business data in main code. deps: FND-001.
- [x] **FND-003 Configuration** (P0, M) – `application.yml` with env overrides, `application-local.yml`, `application-demo.yml`, typed `@ConfigurationProperties` (`AppProperties`, `RiskProperties`, `AiProperties`, `JwtProperties`). *Acceptance*: app fails fast on missing JWT secret outside `local`. deps: FND-001.
- [x] **FND-004 Common infrastructure** (P0, M) – `Clock` bean, error model (`ApiExceptionHandler`, domain exceptions with codes), `PageResponse` + sort whitelist helper, `RequestIdFilter`, Jackson strictness. *Acceptance*: unknown errors → generic 500 problem JSON with requestId. Tests: `ApiExceptionHandler` covered via API ITs. deps: FND-001.
- [x] **FND-005 Flyway migrations V1–V5** (P0, L) – Schema from `docs/database-design.md`. *Acceptance*: `FlywayMigrationIT` green; Hibernate validate passes. deps: FND-001.
- [x] **FND-006 Test infrastructure** (P0, M) – Testcontainers base class with shared PostgreSQL, table truncation, `MutableClock`, API test helper (register/login, JSON). deps: FND-005.

## Phase 3 – Authentication, users, workspaces, project membership

- [x] **AUTH-001 User entity & repository** (P0, S) – normalized email, BCrypt. deps: FND-005.
- [x] **AUTH-002 JWT issuing/validation** (P0, M) – `TokenService` (Nimbus encoder/decoder, HS256), `SecurityConfig` (stateless, CORS, CSRF off, public endpoints, 401/403 problem JSON). deps: AUTH-001, FND-003.
- [x] **AUTH-003 Register/login/refresh/logout/me** (P0, M) – rotating hashed refresh tokens with reuse detection. *Acceptance*: `AuthApiIT` green incl. duplicate email (DB constraint) and reuse revocation. deps: AUTH-002.
- [x] **WS-001 Workspaces & memberships** (P0, M) – CRUD + member management, role rules, last-owner invariant under row lock. *Acceptance*: `WorkspaceApiIT`. deps: AUTH-003.
- [x] **PRJ-001 Projects** (P0, M) – create/list/get/patch/archive/restore with optimistic lock and status transitions. deps: WS-001.
- [x] **PRJ-002 Project memberships & effective permissions** (P0, M) – `ProjectAccessService` (404 vs 403), members API, last-lead invariant, unassign tasks & purge inbox on removal (event). *Acceptance*: `ProjectApiIT` isolation tests. deps: PRJ-001.

## Phase 4 – Projects, tasks, dependencies, collaboration

- [x] **TASK-001 Task entity & lifecycle** (P0, M) – statuses, transitions, invariants, `lastProgressAt`. Tests: `TaskTest`. deps: PRJ-002.
- [x] **TASK-002 Task API** (P0, L) – create, filtered/paged list, get detail, replace details, status, progress, assignee, archive; permission rules; `data_version` bump; optimistic lock. *Acceptance*: `TaskApiIT`. deps: TASK-001.
- [x] **TASK-003 Activity history** (P0, S) – record events, paged endpoint. deps: TASK-002.
- [x] **TASK-004 Dependencies** (P0, M) – add/remove/list, same-project, self/cycle rejection under project lock, dependency gating of status transitions. *Acceptance*: `DependencyApiIT`, concurrency test. deps: TASK-002.
- [x] **TASK-005 Task read API for analysis** (P0, S) – `TaskQueryApi` returning immutable snapshots. deps: TASK-004.

## Phase 5 – Deterministic risk detection and scoring

- [x] **RISK-001 Engine model & graph** (P0, M) – `ProjectSnapshot`, `TaskSnapshot`, `RiskSignal`, `Factor`, `Evidence`, `TaskGraph` (ported). Tests: `TaskGraphTest`. deps: TASK-005.
- [x] **RISK-002 Scoring policy** (P0, S) – sum/clamp, severity mapping, thresholds from `RiskProperties`. Tests: `ScoringPolicyTest`. deps: RISK-001.
- [x] **RISK-003 Overdue rule** (P0, S) – Tests: `OverdueTaskRuleTest`. deps: RISK-002.
- [x] **RISK-004 Approaching deadline rule** (P0, M) – Tests. deps: RISK-002.
- [x] **RISK-005 Stalled rule** (P0, S) – Tests. deps: RISK-002.
- [x] **RISK-006 Blocked dependency rule** (P0, M) – Tests. deps: RISK-002.
- [x] **RISK-007 Project deadline rule + forward projection** (P0, M) – Tests. deps: RISK-002.
- [x] **RISK-008 Workload imbalance rule** (P1, M) – Tests. deps: RISK-002.
- [x] **RISK-009 RiskEngine** (P0, S) – runs registered rules, applies min score, deterministic ordering. Tests: `RiskEngineTest` (Ulvi scenario). deps: RISK-003..008.
- [x] **RISK-010 Assessment persistence & reconciliation** (P0, L) – entity, events, `RiskReconciler` lifecycle, content hash, delivery flags; snapshot loader; stale-version retry. Tests: `RiskReconcilerTest`, `RiskAnalysisIT`. deps: RISK-009.
- [x] **RISK-011 Risk API** (P0, M) – list/detail/history/task risks/summary/manual analysis with cooldown. deps: RISK-010.

## Phase 6 – AI explanations and recommendations

- [x] **AI-001 Provider abstraction & request model** (P0, S) – `AiProvider`, `ExplanationRequest`, `AiExplanationPayload`, `Explanation`. deps: RISK-010.
- [x] **AI-002 Deterministic generator** (P0, M) – per-category facts/actions from evidence. Tests: `DeterministicExplanationGeneratorTest`. deps: AI-001.
- [x] **AI-003 Validator** (P0, S) – schema/length/genericity checks, sanitization. Tests: `ExplanationValidatorTest`. deps: AI-001.
- [x] **AI-004 Anthropic provider** (P1, M) – official SDK, structured output, timeouts/retries, refusal handling, env config. Tests: unit test with mocked client boundary. deps: AI-001.
- [x] **AI-005 ExplanationService with fallback** (P0, S) – Tests: `ExplanationServiceTest` (error, timeout, invalid, disabled). deps: AI-002, AI-003.

## Phase 7 – AI Inbox, notifications, alert lifecycle

- [x] **INBOX-001 Inbox entity & repository** (P0, S) – unique (assessment, recipient). deps: RISK-010.
- [x] **INBOX-002 Recipient resolution** (P0, S) – rules from `ai-risk-engine.md` §10. Tests via `RiskAnalysisIT`. deps: INBOX-001.
- [x] **INBOX-003 Delivery pipeline** (P0, L) – claim/lease, explain outside tx, revision check, upsert/resurface, retries/backoff, FAILED. Tests: `RiskAnalysisIT`, `AiFallbackIT`. deps: INBOX-002, AI-005.
- [x] **INBOX-004 Inbox API** (P0, M) – list/filter/sort/page, get, read/unread, acknowledge, dismiss, unread count; live `riskStatus`. Tests: `InboxApiIT`. deps: INBOX-003.
- [x] **INBOX-005 Membership-removal purge** (P1, S) – event listener deletes items. deps: INBOX-001, PRJ-002.

## Phase 8 – Background processing and reassessment

- [x] **JOB-001 Periodic analysis scheduler** (P0, S) – paged ACTIVE projects, per-project error isolation, toggle property. deps: RISK-010.
- [x] **JOB-002 Change-triggered analysis** (P1, M) – after-commit async listener with per-project debounce. deps: RISK-010.
- [x] **JOB-003 Delivery sweeper** (P0, S) – PENDING / expired leases. deps: INBOX-003.

## Phase 9 – Security hardening, observability, API docs

- [x] **SEC-001 Authorization audit** (P0, S) – every endpoint mapped to a permission check; IDOR tests. deps: INBOX-004.
- [x] **SEC-002 Safe errors & logging** (P0, S) – no secrets/stack traces; request IDs. deps: FND-004.
- [x] **OBS-001 Actuator & metrics** (P1, S) – health (db), info, counters. deps: JOB-003.
- [x] **DOC-009 OpenAPI** (P0, S) – springdoc, bearer scheme, tags; verify `/v3/api-docs`. deps: INBOX-004.
- [x] **ARCH-001 Architecture tests** (P1, S) – ArchUnit rules. deps: INBOX-004.

## Phase 9b – MongoDB (added on product-owner request, 2026-10-09)

- [x] **MONGO-001 AI generation log in MongoDB** (P1, M) – `spring-boot-starter-data-mongodb`; collection `ai_generations` with compound and 90-day TTL indexes; asynchronous best-effort writes from `ExplanationService`; `GET /api/v1/risks/{id}/ai-generations` (project VIEW). *Acceptance*: PostgreSQL stays the system of record; a MongoDB outage never blocks analysis/delivery. Tests: `ExplanationServiceTest`, `AiFallbackIT`. deps: AI-005.
- [x] **MONGO-002 MongoDB in Compose and tests** (P1, S) – `mongo:8` service with healthcheck; Testcontainers MongoDB with `@ServiceConnection`; Boot 4 `spring.mongodb.*` settings with standard UUID representation. deps: MONGO-001, OPS-001.

## Phase 9c – Login fixes (reported 2026-10-09)

- [x] **SEC-003 Stale tokens must not block login** (P0, S) – public auth/docs/health endpoints ignore the `Authorization` header (previously an expired token sent with `/auth/login` returned 401). Tests: `AuthApiIT.staleBearerHeaderDoesNotBlockPublicAuthEndpoints`.
- [x] **SEC-004 CORS for real frontends** (P0, S) – origin patterns (`http://localhost:[*]`, `http://127.0.0.1:[*]` by default), credentialed requests allowed. Tests: `AuthApiIT.corsAllowsLocalFrontendsOnAnyPortWithCredentials`.
- [x] **CFG-001 Local `.env` support** (P1, S) – optional `.env` import, `DB_PASSWORD`/`db_password` alias, failed logins logged with a reason (no PII).

## Phase 10 – Integration tests, end-to-end verification, Docker

- [x] **IT-001 Concurrency tests** (P0, M) – `ConcurrencyIT` scenarios a–d. deps: TASK-004, RISK-010.
- [x] **OPS-001 Dockerfile & Compose** (P0, M) – multi-stage build, non-root user, compose with PostgreSQL (5433) and healthchecks, `.env.example`. deps: FND-003.
- [x] **OPS-002 Demo seed** (P2, S) – `db/demo` script with the Aydan/Huseyn/Ulvi scenario (relative dates). deps: FND-005.
- [x] **E2E-001 Full verification** (P0, M) – `./mvnw verify`, start app against Compose PostgreSQL without AI key, smoke-test main flows, review `/v3/api-docs`; reconcile docs with code; final report. deps: all.
- [x] **DOC-010 README** (P0, S) – setup, run, test, config, troubleshooting. deps: OPS-001.
