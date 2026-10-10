# Testing Strategy

| Command | Runs | Needs |
|---|---|---|
| `./mvnw test` | unit tests (`*Test`, Surefire) | JDK 25 |
| `./mvnw verify` | unit + integration tests (`*IT`, Failsafe) + packaging | JDK 25, Docker (Testcontainers PostgreSQL 18) |

No test calls a paid API: the AI provider is mocked or disabled, and the deterministic generator is used.

## 1. Unit tests (no Spring context)

| Class | Verifies |
|---|---|
| `task.domain.TaskTest` | transition table; `DONE` sets `completedAt`/100 %, reopen clears it; progress range & "only increases count as activity"; closed tasks reject progress and are never overdue; a passed due date never changes status; detail validation |
| `task.domain.DependencyGraphTest` | cycle detection with path; diamonds allowed; self-dependency |
| `risk.engine.ScoringPolicyTest` | factor sum, clamping, severity boundaries 24/25, 49/50, 74/75 |
| `risk.engine.graph.TaskGraphTest` | topological order, cycle report, downstream traversal, unknown/self edges ignored |
| `risk.engine.rules.TaskRulesTest` | **Overdue**: fires with documented score, closed tasks never overdue, due today is not overdue, downstream affected, missing progress reported as unknown. **Approaching**: Ulvi scenario (score, CRITICAL, stall factor, capacity inference, named helper), on-track/nearly-done tasks silent, outside window silent, missing data lowers confidence. **Stalled**: requires recorded idle time, precedence over overdue/approaching. **Blocked**: overdue prerequisite affects exactly the right downstream tasks, on-schedule prerequisite is normal, finished prerequisites don't block, missing due date lowers confidence |
| `risk.engine.rules.ProjectRulesTest` | **Project deadline**: projected slip with driving chain, on-track silent, passed deadline, missing estimates → LOW confidence, no deadline → not assessed. **Workload**: overload with named helpers, single-task shortfall not double counted, balanced silent, count fallback with LOW confidence |
| `risk.engine.RiskEngineTest` | end-to-end Ulvi scenario without double counting, deterministic ordering, min-score filter, healthy project → no risks |
| `risk.application.RiskReconcilerTest` | DETECTED / UNCHANGED / ESCALATED / MITIGATED / UPDATED / RESOLVED (+reasons) / REOPENED, revisions and delivery flags; LOW severity not delivered |
| `recommendation.DeterministicExplanationGeneratorTest` | every category: grounded facts, 2–6 numbered concrete actions, honest confidence note; product example wording; fallback output passes the validator |
| `recommendation.ExplanationValidatorTest` | sanitization, priority normalization, missing/oversized/generic content rejected |
| `recommendation.ExplanationServiceTest` | disabled provider never called; valid output used with engine facts and disclosed unknowns; rate limit / timeout / invalid / unexpected → fallback with metrics; generation logged |
| `recommendation.infrastructure.AnthropicAiProviderTest` | SDK client mocked: I/O error, refusal, truncation mapped to fallback reasons; no key → disabled; prompt contains only request data |
| `ArchitectureTest` (ArchUnit) | no module cycles, controllers don't touch repositories, pure engine, dependency direction, repositories stay inside their module |

## 2. Integration tests (Spring Boot + Testcontainers)

Shared PostgreSQL 18 container; each test starts from truncated tables (including `ai_generations` collection; a `MutableClock` controls "now"; scheduling and on-change async processing are disabled (`application-test.yml`) so analysis and delivery are invoked deterministically.

| Class | Verifies |
|---|---|
| `FlywayMigrationIT` | all migrations applied; DB-level unique email + lower-case check, `completed_at` check, no self/duplicate/cross-project dependency (composite FKs), progress range, project membership requires workspace membership |
| `identity.AuthApiIT` | register/login/me, e-mail normalization, duplicate e-mail 409, validation 400, unknown JSON fields rejected, uniform login errors, missing/forged/expired token 401 (with clock-skew allowance), stale bearer header ignored on public auth endpoints, CORS for local origins on any port with credentials (foreign origin rejected), refresh rotation + reuse revocation, logout, public health, request id header |
| `workspace.WorkspaceApiIT` | owner on create, member management, role rules, last-owner protection, non-member 404, pagination bounds and sort whitelist |
| `project.ProjectApiIT` | visibility per role, **cross-workspace ID swapping → 404**, lead-only edits, optimistic locking, archive → read-only → restore, member removal unassigns tasks, last-lead protection, viewer read-only |
| `task.TaskApiIT` | create/list with every filter, sort and pagination; lifecycle with activity history; optimistic locking; contributor permission rules; archive; dependency validation (duplicate, self, cycle, cross-project) and dependency gating of status changes |
| `risk.RiskLifecycleIT` | Ulvi scenario through the API: detection, explanation, delivery to assignee + lead + dependent owner; repeated analysis creates no duplicates; resolution → inbox shows RESOLVED; reappearance → REOPENED and item resurfaces; overdue vs completed tasks; escalation resurfaces dismissed item; cooldown 429 |
| `inbox.InboxApiIT` | filters, pagination, read/unread/acknowledge/dismiss, other users' items 404, LOW severity not pushed, removed members lose items |
| `recommendation.AiFallbackIT` | valid provider output used (facts still grounded, priorities normalized); provider exception / invalid output / crash → FALLBACK; generation log visible only to project members |
| `ConcurrencyIT` | opposite dependencies concurrently → exactly one succeeds; concurrent updates with one version → one 200, rest 409; 6 concurrent analyses + 6 concurrent delivery sweeps → no duplicate assessments, events or inbox items; concurrent duplicate registrations → one user |

## 3. Manual end-to-end check

[README › Verification](../README.md#verification) describes running the packaged jar against Docker Compose databases with the `demo` profile and no AI key, then exercising the API (a scripted run checks 23 behaviours: health, OpenAPI, scheduled analysis, inbox delivery, change-triggered resolution, authorization).
