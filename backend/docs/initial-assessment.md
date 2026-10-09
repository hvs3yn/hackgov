# Initial Repository Assessment

Date: 2026-10-09
Scope: `backend/` (the only module in the repository).

## 1. What was found

| Area | Finding |
|---|---|
| Build | Maven with wrapper (`mvnw`, Maven 3.9.16). Builds and the existing 17 tests pass (`./mvnw clean install`). |
| Committed baseline (`6d641ce`) | Spring Boot **4.1.0**, Java **25**, artifact `hackgov:hackgov`, only `spring-boot-starter`. |
| Uncommitted working tree | `pom.xml` downgraded to Spring Boot **3.3.5** / Java 21, Lombok added, artifact renamed to `com.foresight:foresight`. `HackgovApplication` (package `com.hackgov`) component-scans `com.foresight`. |
| Installed tooling | JDK 25.0.2, Docker Desktop 29.8 (Compose v5), a local PostgreSQL 18 Windows service on port 5432 (credentials unknown; not used). |
| Persistence | None. `ProjectRepository` is an in-memory `ConcurrentHashMap`. No database, no migrations. |
| Security | None. All endpoints anonymous. CORS hard-coded to `http://localhost:5173`. |
| REST API | `GET /api/projects/{id}` (lazily loads a hard-coded "sample" project), and `StubDataController` returning **hard-coded JSON** for `/graph`, `/risks`, `/simulate`. |
| Domain | Mutable POJOs `Project`, `Member`, `Task` with string IDs and string statuses (`"todo"`, `"delayed"`, `"done"`). `Member` mixes Lombok `@Data` with hand-written getters. |
| Engine | `TaskGraph` (Kahn topological sort with deterministic tie-breaking, cycle detection, downstream traversal) – **sound and reusable**. `Scheduler` (forward pass with owner serialization, sensitivity-based critical tasks) – sound idea, reusable for project-deadline projection. `RiskAnalyzer` implements one rule (`DEADLINE_MISS`) with a fragile critical-chain walk. `Engine.detectProblems` produces free-text strings mixing validation and risk. |
| AI | `LlmClient` interface + `StubLlmClient` that concatenates strings. No real provider, no structured output. |
| Tests | 17 JUnit tests. Graph/scheduler tests are meaningful; domain getter/setter tests and `EngineTest` add little value. |
| Docs | Only the generated `HELP.md`. |

## 2. Problems identified

1. **Version drift**: committed Boot 4.1.0/Java 25 vs. working-tree Boot 3.3.5/Java 21. Boot 3.3.x is out of OSS support.
2. **Stub business logic presented as API**: `StubDataController` returns fabricated risks/simulations regardless of input – violates "no fake AI analysis".
3. **Hard-coded sample data inside a controller path** (`SampleProjectLoader` used by `ProjectController`).
4. **No persistence, no auth, no authorization, no validation** – any client can read any project.
5. **Controllers construct their own dependencies** (`new ProjectRepository()`), bypassing Spring DI.
6. **Global exception handler leaks raw exception messages** and maps every `Exception` to 500/400 ad hoc.
7. **Split identity**: main class in `com.hackgov` scanning `com.foresight`.
8. String-typed statuses; no lifecycle rules; "delayed" is not a real workflow state.
9. No dependency-cycle prevention at write time (only detected at analysis time).

## 3. Decisions and assumptions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Spring Boot 4.1.1 + Java 25 (LTS)** | Matches the committed baseline (4.1.0/25) at the latest stable patch; JDK 25 is installed; Boot 3.3 is unsupported. |
| D2 | Root package **`com.foresight`**, main class `com.foresight.ForesightApplication`; `com.hackgov` removed | Product name already used by the existing code; removes the cross-package scan. |
| D3 | Keep Maven + wrapper | Working setup exists. |
| D4 | **Reuse** the `TaskGraph` algorithm (adapted to UUIDs and immutable snapshots) and the forward-pass idea of `Scheduler` inside the new risk engine. | Valid, tested logic. |
| D5 | **Remove** `StubDataController`, `Controller`, `Service`, `Engine`, in-memory `ProjectRepository`, `SampleProjectLoader`, `StubLlmClient`, string-based domain POJOs and their trivial tests. | They are stubs or are superseded by persistent, validated modules. Sample data moves to a dedicated demo seed script. |
| D6 | No Lombok | Records + explicit JPA accessors keep the code transparent; avoids annotation-processor issues on new JDKs. |
| D7 | Integration tests use **Testcontainers PostgreSQL** (Docker is available). Local runs use Docker Compose PostgreSQL on port **5433** to avoid clashing with the existing local PostgreSQL 18 service on 5432. | |
| D8 | AI provider: **Anthropic Claude via the official `anthropic-java` SDK**, disabled by default. A deterministic generator is the default and the fallback. | Must run without a paid API key. |
| D9 | JWT via Spring Security's OAuth2 Resource Server support (Nimbus JOSE+JWT, HS256). | Well-maintained, first-class Spring integration, no extra Jackson-2 dependency like jjwt-jackson. |

## 4. Plan

See `tasks.md` for the dependency-ordered backlog and the documents in `docs/` for the target design.
