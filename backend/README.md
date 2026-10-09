# Foresight – proactive project risk management backend

Foresight is the backend of a collaborative project/task manager that **warns teams about delays before they happen**. A deterministic risk engine analyses tasks, deadlines, dependencies, progress history and workload. It scores and explains each risk with evidence from real project data, generates concrete recommendations (with an optional LLM; there is always a deterministic fallback) and delivers them to the right people's **AI Inbox**.

> Example inbox item: *"Potential delay: 'Authentication module' is due tomorrow at 20% progress"*, with facts ("Last recorded progress was 2 days ago", "3 unfinished tasks depend on it"), consequences and actions ("Split the remaining work…", "Ask Aydan to review…", "Move independent tasks forward…", "Reassess the due date of 'API integration'…").

The frontend (TypeScript) is a separate project; this repository is the REST API only.

## Stack

Java 25 · Spring Boot 4.1 (Web MVC, Data JPA/Hibernate 7, Security + OAuth2 resource server/JWT, Validation, Actuator) · **PostgreSQL 18** (system of record) + Flyway · **MongoDB 8** (AI generation log only) · springdoc-openapi · Anthropic Java SDK (optional) · JUnit 5, Mockito, Testcontainers, ArchUnit · Docker Compose.

## Architecture in one minute

A modular monolith (`com.foresight.*`):

```
identity → workspace → project → task → risk → recommendation → inbox      (+ common)
```

- `risk.engine` is a pure Java function `ProjectSnapshot → List<RiskSignal>` with six rules (overdue, approaching deadline, stalled, blocked dependency, project deadline, workload imbalance). Scores range 0–100 and are heuristics, **not probabilities**.
- Assessments are persisted with a lifecycle (detected → escalated/mitigated/updated → resolved → reopened) and deduplicated by `(project, fingerprint)`.
- Delivery to the inbox happens outside DB transactions (claim → explain → finalize). It is idempotent, with one item per (risk, recipient).
- Analysis runs every 15 min, about 5 s after relevant changes, and on demand.

Details: [`docs/architecture.md`](docs/architecture.md), [`docs/ai-risk-engine.md`](docs/ai-risk-engine.md).

## Documentation

| Document | Content |
|---|---|
| [docs/initial-assessment.md](docs/initial-assessment.md) | What existed before, decisions taken |
| [docs/requirements.md](docs/requirements.md) | Roles, functional/non-functional requirements, journeys, scope |
| [docs/architecture.md](docs/architecture.md) | Modules, layering, transactions, background jobs, trade-offs |
| [docs/domain-model.md](docs/domain-model.md) | Entities, invariants, lifecycles |
| [docs/database-design.md](docs/database-design.md) | PostgreSQL schema, MongoDB collection, migrations |
| [docs/api-specification.md](docs/api-specification.md) | REST contract with examples |
| [docs/ai-risk-engine.md](docs/ai-risk-engine.md) | Rules, scoring, lifecycle, AI provider and fallback |
| [docs/security.md](docs/security.md) | AuthN/AuthZ, tokens, secrets, isolation |
| [docs/testing-strategy.md](docs/testing-strategy.md) | Test suites and what they prove |
| [tasks.md](tasks.md) | Implementation backlog and status |

## Prerequisites

- JDK 25 (the Maven wrapper downloads Maven)
- Docker (for local databases and for integration tests)

## Configuration

All settings live in `src/main/resources/application.yml` and can be overridden with environment variables. Copy `.env.example` to `.env` (git-ignored): Docker Compose reads it, and the app itself imports it when started from the `backend` directory (IDE, `mvnw`, `java -jar`). Real environment variables win over `.env`.

| Variable | Default | Purpose |
|---|---|---|
| `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` | – (**required**) | your PostgreSQL, e.g. Neon: `jdbc:postgresql://<host>/<db>?sslmode=require` |
| `SPRING_MONGODB_URI` | `mongodb://localhost:27017/foresight?...` | MongoDB (AI generation log) |
| `APP_JWT_SECRET` | – (**required**, ≥ 32 bytes) | HS256 signing key; the `local` profile generates an ephemeral one |
| `APP_JWT_ACCESS_TTL` / `APP_JWT_REFRESH_TTL` | `PT15M` / `P14D` | token lifetimes |
| `APP_CORS_ALLOWED_ORIGINS` | `http://localhost:[*],http://127.0.0.1:[*]` | frontend origins or patterns (set explicit origins in production) |
| `APP_TIME_ZONE` | `UTC` | business time zone for due dates |
| `APP_AI_PROVIDER` | `none` | `none` or `anthropic` |
| `ANTHROPIC_API_KEY`, `APP_AI_MODEL`, `APP_AI_EFFORT` | –, `claude-opus-5-5`, `medium` | only when the provider is `anthropic` |
| `APP_RISK_ANALYSIS_INTERVAL` | `PT15M` | periodic analysis |
| `APP_RISK_SCHEDULING_ENABLED` / `APP_RISK_ON_CHANGE_ENABLED` | `true` / `true` | background jobs / change-triggered analysis and delivery |
| `APP_RISK_NOTIFY_MIN_SEVERITY` | `MEDIUM` | lowest severity pushed to inboxes |
| `SERVER_PORT` | `8080` | HTTP port |

Profiles: `local` (ephemeral JWT secret, debug logs), `demo` (adds sample data via the idempotent repeatable migration `db/demo/R__demo_seed.sql`).

## Run locally

```bash
cp .env.example .env            # set DB_URL, DB_USERNAME, DB_PASSWORD (your PostgreSQL) and APP_JWT_SECRET
docker compose up -d mongo      # optional throwaway PostgreSQL: docker compose --profile local-db up -d postgres mongo

# run the app from the backend folder – values are read from .env (PowerShell: .\mvnw.cmd)
SPRING_PROFILES_ACTIVE=demo ./mvnw spring-boot:run
```

Or run everything in containers: `docker compose up -d --build`.

Flyway migrates the schema automatically on startup. Then open:

- API docs: <http://localhost:8080/swagger-ui.html> (OpenAPI JSON at `/v3/api-docs`)
- Health: <http://localhost:8080/actuator/health>

With the `demo` profile, log in as `aydan@demo.foresight.local`, `huseyn@demo.foresight.local` or `ulvi@demo.foresight.local` (password `Password123`). Within about a minute the scheduled analysis fills the inboxes.

```bash
TOKEN=$(curl -s -X POST localhost:8080/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"ulvi@demo.foresight.local","password":"Password123"}' | jq -r .accessToken)
curl -s localhost:8080/api/v1/inbox -H "Authorization: Bearer $TOKEN" | jq '.content[].title'
```

### Enabling Claude

Set `APP_AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=...`. Explanations then come from Claude through structured output, are validated, and fall back to deterministic text on any error. Facts shown to users always come from the engine, never from the model. `GET /api/v1/risks/{id}/ai-generations` shows how each explanation was produced.

## Tests

```bash
./mvnw test      # unit tests (no Docker)
./mvnw verify    # unit + integration tests (Docker required) + jar
```

## Verification

Latest results (2026-10-09):

- `./mvnw clean verify` → **92 unit tests + 51 integration tests passed**, build success.
- Packaged jar started against Docker Compose PostgreSQL 18 + MongoDB 8 with the `demo` profile and **no AI key**: all migrations applied, health `UP`, and a scripted run against the live API passed **23/23 checks**. Those covered scheduled analysis, inbox delivery, recommendations naming real teammates, the MongoDB generation log, dependency cycles and gating, cross-tenant isolation, cooldown, and change-triggered resolution of a completed task's risk.
- `docker build` succeeds; the container starts healthy as non-root user `foresight`.
- Login re-verified live: normal, stale `Authorization` header, padded/upper-case e-mail, wrong password (uniform 401) and CORS preflights from `127.0.0.1:5173` and `localhost:4200`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `APP_JWT_SECRET must be set` on startup | Add `APP_JWT_SECRET` (≥ 32 bytes) to `.env`/the environment, or use `SPRING_PROFILES_ACTIVE=local` for development. |
| Login returns 401 `INVALID_CREDENTIALS` | Wrong e-mail/password, or demo users don't exist (the `demo` profile seeds them only on a fresh database). The server log says which (`Login failed …`). |
| Browser login blocked (CORS error) | Add your frontend origin to `APP_CORS_ALLOWED_ORIGINS`; local origins on any port are allowed by default. |
| `Could not resolve placeholder 'DB_URL'` | Set `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` in `.env` (in the `backend` folder) or the environment. |
| `failed to read .env` (Docker Compose) | `.env` may contain only `KEY=value` lines – no quotes or Markdown ``` fences. |
| `/actuator/health` is `DOWN` | MongoDB is unreachable; start `docker compose up -d mongo` (business endpoints keep working). |
| Integration tests fail to start | Docker must be running (Testcontainers). |
| No inbox items with the demo profile | Wait for the first scheduled analysis (≤ 1 min after start) or `POST /api/v1/projects/{id}/risk-analysis` as a lead. |
| `409 VERSION_CONFLICT` | Reload the resource and resend with its current `version`. |

## Known limitations

- No login rate limiting, e-mail verification, password reset or invitations of unregistered users.
- Workload and schedule projections assume 6 h per working day and know nothing about calendars or other projects; confidence is lowered accordingly.
- Real-time push (WebSocket/e-mail) is not implemented; the inbox is polled over REST.
- Multiple instances are safe (DB locks, unique constraints, conditional claims) but may duplicate scheduled CPU work.
