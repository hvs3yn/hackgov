# REST API Specification (v1)

Base path `/api/v1`. JSON (UTF-8). Interactive docs: `/swagger-ui.html`, machine-readable: `/v3/api-docs`.

## Conventions

- **Auth**: every endpoint except `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/actuator/health`, and API docs requires `Authorization: Bearer <accessToken>`.
- **IDs**: UUID strings. **Dates**: `YYYY-MM-DD`. **Instants**: ISO-8601 UTC.
- **Optimistic locking**: mutations of projects and tasks carry the last seen `version`; a mismatch returns `409 VERSION_CONFLICT`.
- **Pagination**: `page` (0-based, default 0), `size` (default 20, max 100), `sort=field,asc|desc` (whitelisted per endpoint). Response:

```json
{ "content": [ ... ], "page": 0, "size": 20, "totalElements": 57, "totalPages": 3 }
```

- **Errors**: `application/problem+json`

```json
{
  "type": "about:blank",
  "title": "Validation failed",
  "status": 400,
  "detail": "Request contains invalid fields",
  "instance": "/api/v1/projects/3f1…/tasks",
  "code": "VALIDATION_FAILED",
  "timestamp": "2026-10-09T12:00:00Z",
  "requestId": "a1b2c3",
  "errors": [ { "field": "title", "message": "must not be blank" } ]
}
```

| Status | `code` examples |
|---|---|
| 400 | `VALIDATION_FAILED`, `MALFORMED_REQUEST`, `INVALID_ARGUMENT` |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `INVALID_REFRESH_TOKEN` |
| 403 | `FORBIDDEN` (resource visible, permission missing) |
| 404 | `NOT_FOUND` (missing **or not visible to the caller**) |
| 409 | `EMAIL_TAKEN`, `VERSION_CONFLICT`, `INVALID_STATUS_TRANSITION`, `DEPENDENCY_NOT_SATISFIED`, `DEPENDENCY_CYCLE`, `DEPENDENCY_EXISTS`, `LAST_OWNER`, `LAST_LEAD`, `PROJECT_READ_ONLY`, `ALREADY_MEMBER`, `CONFLICT` |
| 429 | `ANALYSIS_COOLDOWN` (with `Retry-After`) |
| 500 | `INTERNAL_ERROR` (no internals) |

## Authentication

| Method & path | Body | Response |
|---|---|---|
| `POST /auth/register` | `{fullName, email, password}` | `201` `AuthResponse` |
| `POST /auth/login` | `{email, password}` | `200` `AuthResponse` / `401 INVALID_CREDENTIALS` |
| `POST /auth/refresh` | `{refreshToken}` | `200` `AuthResponse` (rotated) / `401 INVALID_REFRESH_TOKEN` |
| `POST /auth/logout` | `{refreshToken}` | `204` (idempotent) |
| `GET /users/me` | – | `200` `UserResponse` |

```json
// AuthResponse
{
  "accessToken": "eyJ…",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "refreshToken": "q8W…",
  "refreshExpiresIn": 1209600,
  "user": { "id": "…", "fullName": "Ulvi Mammadov", "email": "ulvi@example.com", "createdAt": "…" }
}
```

Validation: `fullName` 1–120; `email` valid, ≤ 254; `password` 8–128 with a letter and a digit.

## Workspaces

| Method & path | Who | Notes |
|---|---|---|
| `POST /workspaces` `{name}` | any user | `201 WorkspaceResponse`; caller becomes OWNER |
| `GET /workspaces` | member | paged; sort `name`, `createdAt` |
| `GET /workspaces/{id}` | member | includes `myRole` |
| `PATCH /workspaces/{id}` `{name}` | OWNER/ADMIN | |
| `GET /workspaces/{id}/members` | member | paged; sort `createdAt`, `role` |
| `POST /workspaces/{id}/members` `{email, role}` | OWNER/ADMIN (OWNER role only by OWNER) | `201`; user must exist; `409 ALREADY_MEMBER` |
| `PATCH /workspaces/{id}/members/{userId}` `{role}` | OWNER/ADMIN | `409 LAST_OWNER` |
| `DELETE /workspaces/{id}/members/{userId}` | OWNER/ADMIN, or self | `204`; `409 LAST_OWNER` |

```json
// WorkspaceResponse
{ "id": "…", "name": "Team Phoenix", "myRole": "OWNER", "createdAt": "…", "updatedAt": "…" }
// WorkspaceMemberResponse
{ "userId": "…", "fullName": "Aydan", "email": "aydan@example.com", "role": "ADMIN", "joinedAt": "…" }
```

## Projects

| Method & path | Who | Notes |
|---|---|---|
| `POST /workspaces/{wsId}/projects` `{name, description?, startDate?, deadline?}` | workspace member | `201`; caller becomes LEAD |
| `GET /workspaces/{wsId}/projects?status=` | workspace member | paged; only accessible projects; sort `name`, `createdAt`, `deadline` |
| `GET /projects/{id}` | project access | `ProjectResponse` incl. `myRole` |
| `PATCH /projects/{id}` `{version, name?, description?, startDate?, deadline?, status?}` | LEAD | absent fields unchanged; `clearDeadline`/`clearStartDate` booleans clear dates; status cannot be set to `ARCHIVED` here |
| `POST /projects/{id}/archive` | LEAD | `200`; tasks become read-only |
| `POST /projects/{id}/restore` | LEAD | `200`; → ACTIVE |
| `GET /projects/{id}/members` | project access | paged |
| `POST /projects/{id}/members` `{userId, role}` | LEAD | user must be workspace member |
| `PATCH /projects/{id}/members/{userId}` `{role}` | LEAD | `409 LAST_LEAD` |
| `DELETE /projects/{id}/members/{userId}` | LEAD or self | unassigns their open tasks; `409 LAST_LEAD` |
| `GET /projects/{id}/risk-summary` | project access | see Risk |

```json
// ProjectResponse
{
  "id": "…", "workspaceId": "…", "name": "Hackathon MVP", "description": "…",
  "status": "ACTIVE", "startDate": "2026-10-01", "deadline": "2026-10-22",
  "myRole": "LEAD", "version": 3, "createdAt": "…", "updatedAt": "…", "lastAnalyzedAt": "…"
}
```

## Tasks

| Method & path | Who | Notes |
|---|---|---|
| `POST /projects/{pid}/tasks` | LEAD, CONTRIBUTOR | body `{title, description?, priority?, assigneeId?, startDate?, dueDate?, estimatedHours?}`; contributors may only assign themselves |
| `GET /projects/{pid}/tasks` | project access | filters: `status` (multi), `priority` (multi), `assigneeId`, `unassigned=true`, `dueFrom`, `dueTo`, `overdue=true`, `q` (title contains); sort `dueDate`, `priority`, `createdAt`, `updatedAt`, `title`, `status` |
| `GET /tasks/{id}` | project access | `TaskDetailResponse` (task + prerequisites + dependents) |
| `PUT /tasks/{id}` | LEAD; CONTRIBUTOR if assignee/reporter | replaces editable details `{version, title, description, priority, startDate, dueDate, estimatedHours, actualHours}` (null clears optional fields) |
| `POST /tasks/{id}/status` `{version, status}` | same | lifecycle + dependency checks |
| `POST /tasks/{id}/progress` `{version, progressPercentage}` | same | 0–100; closed tasks rejected |
| `PUT /tasks/{id}/assignee` `{version, assigneeId \| null}` | LEAD (any); CONTRIBUTOR self-assign unassigned task or unassign self | assignee needs CONTRIBUTOR+ access |
| `DELETE /tasks/{id}?version=` | LEAD; CONTRIBUTOR if reporter | archives (`204`), removes its dependencies |
| `GET /tasks/{id}/activity` | project access | paged, newest first |
| `GET /tasks/{id}/dependencies` | project access | `{prerequisites: [TaskRef], dependents: [TaskRef]}` |
| `POST /tasks/{id}/dependencies` `{prerequisiteTaskId}` | may edit the dependent task | `201`; `409 DEPENDENCY_CYCLE`/`DEPENDENCY_EXISTS`; `400` self/other-project |
| `DELETE /tasks/{id}/dependencies/{prerequisiteTaskId}` | may edit the dependent task | `204` |
| `GET /projects/{pid}/dependencies` | project access | paged list of edges |
| `GET /tasks/{id}/risks` | project access | active risks affecting the task |

```json
// TaskResponse
{
  "id": "…", "projectId": "…", "title": "Authentication module", "description": "JWT login…",
  "status": "IN_PROGRESS", "priority": "HIGH",
  "assignee": { "id": "…", "fullName": "Ulvi" }, "reporter": { "id": "…", "fullName": "Aydan" },
  "startDate": "2026-10-03", "dueDate": "2026-10-10",
  "estimatedHours": 16.0, "actualHours": 9.5, "progressPercentage": 20,
  "overdue": false, "lastProgressAt": "2026-10-07T09:12:00Z",
  "completedAt": null, "createdAt": "…", "updatedAt": "…", "version": 7
}
// TaskDetailResponse = TaskResponse + { "prerequisites": [TaskRef], "dependents": [TaskRef] }
// TaskRef
{ "id": "…", "title": "API integration", "status": "TODO", "dueDate": "2026-10-14", "assigneeId": "…" }
// TaskActivityResponse
{ "id": "…", "type": "STATUS_CHANGED", "actor": {"id": "…", "fullName": "Ulvi"}, "oldValue": "TODO", "newValue": "IN_PROGRESS", "occurredAt": "…" }
```

## Risk analysis

| Method & path | Who | Notes |
|---|---|---|
| `GET /projects/{pid}/risks` | project access | filters `status` (default `ACTIVE`), `severity` (multi), `category` (multi), `taskId`; sort `score` (default desc), `lastChangedAt`, `firstDetectedAt` |
| `GET /risks/{id}` | project access | `RiskDetailResponse` incl. explanation & recommendations |
| `GET /risks/{id}/history` | project access | paged lifecycle events |
| `POST /projects/{pid}/risk-analysis` | LEAD, CONTRIBUTOR | synchronous deterministic analysis → `200 AnalysisResultResponse`; `429 ANALYSIS_COOLDOWN` if run < cooldown ago (default 10 s); `409 PROJECT_READ_ONLY` when not ACTIVE |
| `GET /projects/{pid}/risk-summary` | project access | |
| `GET /risks/{id}/ai-generations` | project access | paged log of how explanations were produced: `revision`, `configuredProvider`, `model`, `source`, `outcome` (`PROVIDER`/`FALLBACK`), `fallbackReason`, `errorMessage`, `latencyMs`, `recommendedActions`, `createdAt`; sort `createdAt` (default desc) |

```json
// RiskResponse
{
  "id": "…", "projectId": "…", "taskId": "…", "subjectUserId": null,
  "category": "APPROACHING_DEADLINE", "status": "ACTIVE",
  "severity": "HIGH", "score": 68, "confidence": "HIGH",
  "title": "Authentication module is due tomorrow at 20% progress",
  "summary": "…",
  "affectedTaskIds": ["…"],
  "firstDetectedAt": "…", "lastEvaluatedAt": "…", "lastChangedAt": "…",
  "resolvedAt": null, "resolutionReason": null, "revision": 1
}
// RiskDetailResponse = RiskResponse + {
//   "factors":   [ {"code": "DUE_SOON", "description": "Due in 1 day", "points": 15} ],
//   "evidence":  [ {"kind": "FACT", "statement": "Progress is 20%", "data": {"progressPercentage": 20}} ],
//   "missingData": ["No estimated hours recorded"],
//   "explanation": ExplanationResponse
// }
// ExplanationResponse
{
  "source": "FALLBACK | ANTHROPIC",
  "summary": "…",
  "observedFacts": ["…"],          // always rendered from system evidence
  "inferences": ["…"],
  "potentialConsequences": ["…"],
  "recommendedActions": [ {"priority": 1, "action": "Split …", "rationale": "…"} ],
  "assumptions": ["…"], "unknowns": ["…"],
  "confidenceNote": "Score is a heuristic (0-100), not a probability. …",
  "generatedAt": "…"
}
// AnalysisResultResponse
{ "projectId": "…", "analyzedAt": "…", "dataVersion": 42, "activeRisks": 4,
  "detected": 1, "escalated": 0, "mitigated": 0, "updated": 1, "resolved": 2, "reopened": 0, "unchanged": 1 }
// RiskSummaryResponse
{ "projectId": "…", "overallSeverity": "HIGH", "maxScore": 68, "activeRisks": 4,
  "bySeverity": {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 1},
  "byCategory": {"APPROACHING_DEADLINE": 1, "BLOCKED_DEPENDENCY": 1, "WORKLOAD_IMBALANCE": 1, "PROJECT_DEADLINE": 1},
  "topRisks": [RiskResponse], "lastAnalyzedAt": "…" }
```

## AI Inbox

All endpoints are scoped to the caller (`recipient = me`); other users' items return `404`.

| Method & path | Notes |
|---|---|
| `GET /inbox` | filters `read` (true/false), `disposition` (multi; default `OPEN,ACKNOWLEDGED`), `severity` (multi), `category` (multi), `projectId`, `from`, `to` (instants on `lastDeliveredAt`); sort `lastDeliveredAt` (default desc), `createdAt` |
| `GET /inbox/unread-count` | `{ "unread": 3 }` |
| `GET /inbox/{id}` | `InboxItemResponse` |
| `POST /inbox/{id}/read` / `POST /inbox/{id}/unread` | `200` item |
| `POST /inbox/{id}/acknowledge` | `200` item; `disposition = ACKNOWLEDGED` |
| `POST /inbox/{id}/dismiss` | `200` item; `disposition = DISMISSED`; it resurfaces (unread, OPEN) only if the risk escalates or reopens |

```json
// InboxItemResponse
{
  "id": "…",
  "projectId": "…", "projectName": "Hackathon MVP",
  "taskId": "…", "taskTitle": "Authentication module",
  "riskId": "…", "riskStatus": "ACTIVE", "currentSeverity": "HIGH",
  "category": "APPROACHING_DEADLINE", "severity": "HIGH",
  "title": "Potential project delay: Authentication module",
  "explanation": ExplanationResponse,
  "read": false, "readAt": null,
  "disposition": "OPEN", "dispositionAt": null,
  "deliveredRevision": 1,
  "createdAt": "…", "lastDeliveredAt": "…", "updatedAt": "…",
  "links": { "project": "/api/v1/projects/…", "task": "/api/v1/tasks/…", "risk": "/api/v1/risks/…" }
}
```

## Operations

- `GET /actuator/health` – public (includes PostgreSQL); `GET /actuator/info` – public.
