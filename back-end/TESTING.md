# Testing Guide

This document describes the testing system for the NestJS backend and explains how to set up and run each test suite.

## Philosophy

Tests are organized to maximize **confidence**, not code coverage percentage. Before adding a test, ask:

> If this code breaks in production, would I want a test to catch it?

Each layer protects against different failure modes:

| Layer | What it catches | Infrastructure |
|-------|-----------------|----------------|
| **Unit** | Business rules, validation, error paths, ownership logic | Mocks only — no database |
| **Integration** | SQL correctness, constraints, transactions, migrations | Real PostgreSQL via Testcontainers |
| **E2E** | App wiring: guards, sessions, Passport, pipes, HTTP responses | Full Nest app + Testcontainers |

```
        ┌─────────────┐
        │    E2E      │  few, high-value user journeys
        ├─────────────┤
        │ Integration │  repository & query tests against real Postgres
        ├─────────────┤
        │    Unit     │  many fast tests for domain logic & services
        └─────────────┘
```

## Prerequisites

### All suites

- Node.js (see `.nvmrc` or project requirements)
- Dependencies installed:

```bash
pnpm install
```

### Integration and E2E suites

These require **Docker** with access to the Docker socket. Testcontainers starts a disposable PostgreSQL 16 container automatically — you do not need a local Postgres installation or `.env` database credentials for tests.

Verify Docker is running:

```bash
docker info
docker ps
```

Your user must be able to access `/var/run/docker.sock` (typically by being in the `docker` group on Linux).

## Running tests

All commands are run from the `back-end/` directory.

### Unit tests (fast, no Docker)

Unit tests cover domain entities, value objects, application services, guards, and the exception filter. Repositories and external services are mocked.

```bash
pnpm run test:unit
```

Other useful commands:

```bash
pnpm run test          # alias for test:unit
pnpm run test:watch    # re-run on file changes
pnpm run test:cov      # unit tests with coverage report
pnpm run test:debug    # run with Node inspector attached
```

**Expected runtime:** a few seconds.

### Integration tests (requires Docker)

Integration tests exercise Knex repositories and read queries against a real PostgreSQL instance. The database is never mocked.

```bash
pnpm run test:integration
```

On the first run, Testcontainers pulls the `postgres:16-alpine` image and starts a container. Subsequent runs reuse cached images and are faster.

**Expected runtime:** 30–90 seconds (includes container startup).

### E2E tests (requires Docker)

E2E tests boot the full Nest application (including sessions, Passport, validation pipes, and exception filters) and exercise HTTP endpoints via Supertest.

```bash
pnpm run test:e2e
```

**Expected runtime:** 30–90 seconds.

### Run everything

```bash
pnpm run test:all
```

Runs unit → integration → e2e in sequence. This is the order recommended for CI.

### Type checking

Type checking is separate from tests but should run in CI before test suites:

```bash
pnpm run typecheck
```

## What each suite covers

### Unit tests (`*.spec.ts` in `src/`)

| Area | Examples |
|------|----------|
| Domain | `UserPassword`, `ActivityTicker`, `ActivityEvent` date validation |
| Entities | `User`, `Activity`, `Category` create/reconstitute invariants |
| Services | `UsersService`, `AuthenticationService`, `ActivitiesService`, `CategoriesService` |
| Guards | `IsAuthedGuard`, `ForgotPasswordRateLimitGuard` |
| Shared | `Guard`, `AllExceptionsFilter`, password-reset token utils |

### Integration tests (`*.int-spec.ts` in `src/`)

| Target | What it verifies |
|--------|------------------|
| `UsersRepo` | Create/find by email, password reset tokens, session clearing |
| `CategoriesRepo` | CRUD, delete nulls `activities.category_id` |
| `ActivitiesRepo` | Persist and retrieve with computed fields |
| `ActivityEventRepo` | Unique `(activity_id, date)` constraint |
| Activity queries | Ownership checks, timeline month filtering |

### E2E tests (`*.e2e-spec.ts` in `test/e2e/`)

| File | Journeys |
|------|----------|
| `auth.e2e-spec.ts` | Register, login, current user, logout, invalid credentials, forgot/reset password |
| `categories.e2e-spec.ts` | Auth required, create/list/edit/delete category |
| `activities.e2e-spec.ts` | Full habit loop (category → activity → complete → undo → timeline → edit → delete), cross-user authorization, validation errors |

## Project structure

```
back-end/
├── jest.unit.config.ts              # Unit test configuration
├── test/
│   ├── jest-integration.json        # Integration test configuration
│   ├── jest-e2e.json                # E2E test configuration
│   ├── global-setup.ts              # Starts Postgres container, runs migrations
│   ├── global-teardown.ts           # Stops container
│   ├── setup-after-env.ts           # Loads env, truncates tables before each test
│   ├── helpers/
│   │   ├── create-test-app.ts       # Boots Nest app with production wiring
│   │   ├── test-database.ts         # Knex connection + table truncation
│   │   ├── auth-helpers.ts          # Register/login with cookie jar
│   │   └── assertions.ts            # Shared error body assertions
│   ├── factories/
│   │   ├── user.factory.ts
│   │   ├── category.factory.ts
│   │   ├── activity.factory.ts
│   │   └── activity-event.factory.ts
│   └── e2e/
│       ├── auth.e2e-spec.ts
│       ├── categories.e2e-spec.ts
│       └── activities.e2e-spec.ts
└── src/
    └── modules/
        └── <feature>/
            ├── services/*.spec.ts           # unit
            ├── repos/*.int-spec.ts          # integration
            ├── domain/*.spec.ts             # unit
            └── queries/*.int-spec.ts        # integration
```

### Naming conventions

| Pattern | Location | Purpose |
|---------|----------|---------|
| `*.spec.ts` | Colocated under `src/` | Unit tests |
| `*.int-spec.ts` | Colocated under `src/` | Integration tests |
| `*.e2e-spec.ts` | `test/e2e/` | End-to-end HTTP tests |

## How the database works in tests

Integration and E2E tests share the same database lifecycle:

1. **`global-setup.ts`** starts a PostgreSQL 16 container via Testcontainers, writes connection details to `test/.test-env.json`, sets `NODE_ENV=test`, and runs Knex migrations.
2. **`setup-after-env.ts`** loads the connection env into each test worker and **truncates all tables** before every test (`users`, `activities`, `activity_events`, `categories`, `user_sessions`).
3. **`global-teardown.ts`** stops and removes the container when the suite finishes.

Tests use the `test` environment defined in `knexfile.ts`. Production seeds are not used — each test creates only the data it needs via factories.

There is no in-memory database substitute. If production uses PostgreSQL, tests use PostgreSQL.

## Writing new tests

### Unit test example

Colocate the spec next to the source file. Mock repository dependencies:

```typescript
// src/modules/users/services/users.service.spec.ts
const usersRepo = { create: jest.fn(), exists: jest.fn() /* ... */ };

const module = await Test.createTestingModule({
  providers: [
    UsersService,
    { provide: UsersRepo, useValue: usersRepo },
  ],
}).compile();
```

### Integration test example

Use the real `DatabaseModule` and factories from `test/factories/`:

```typescript
import { Test } from '@nestjs/testing';
import { DatabaseModule } from '../../../shared/knex/database.module';
import { insertUserWithKnex } from '../../../../test/factories/user.factory';

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule],
    providers: [UsersRepo],
  }).compile();
});
```

Tables are automatically truncated between tests — no manual cleanup needed.

### E2E test example

Use `createTestApp()` and auth helpers to get a session-aware Supertest agent:

```typescript
import { createTestApp } from '../helpers/create-test-app';
import { registerAndLogin } from '../helpers/auth-helpers';

const app = await createTestApp();
const { agent, user } = await registerAndLogin(app);

await agent.get('/activities').expect(200);
await app.close();
```

`createTestApp()` applies the same middleware as `main.ts` via `configureApp()` — sessions, Passport, validation, and exception filters are all wired identically to production.

### Factories

| Factory | Functions |
|---------|-----------|
| `user.factory.ts` | `buildUser()`, `insertUserWithKnex()` |
| `category.factory.ts` | `buildCategory()`, `insertCategory()` |
| `activity.factory.ts` | `buildActivity()`, `insertActivity()` |
| `activity-event.factory.ts` | `buildActivityEvent()`, `insertActivityEvent()` |

Factories produce valid defaults. Override only the fields relevant to your test case.

## Testability refactors

These application changes support reliable testing:

- **`configureApp()`** (`src/configure-app.ts`) — single place for session, Passport, CORS, validation, and filter setup. Used by both `main.ts` and E2E tests.
- **`DatabaseModule`** (`src/shared/knex/database.module.ts`) — global `@Global()` module providing one shared `KnexService` instance.
- **`IEmailSender`** — email port with `NoopEmailSender` default; password reset tests don't depend on Mailgun.
- **`SESSION_SECRET`** — read from env (set to `test-session-secret` in test global setup).

## CI pipeline

Recommended job order:

```bash
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run test:integration   # requires Docker
pnpm run test:e2e           # requires Docker
```

Integration and E2E jobs need a Docker-in-Docker or Docker socket service (e.g. `docker:dind` in GitLab CI, or the standard Docker setup in GitHub Actions).

## Troubleshooting

### `Could not find a working container runtime strategy`

Docker is not running or not accessible. Ensure the Docker daemon is started and your user has permission to use the socket:

```bash
# Linux: add yourself to the docker group, then re-login
sudo usermod -aG docker $USER
```

### `permission denied while trying to connect to the docker API`

Same as above — the test runner process cannot access `/var/run/docker.sock`.

### Integration/E2E tests hang on first run

Testcontainers is pulling the `postgres:16-alpine` image. This is normal and only happens once. The suite timeout is set to 60 seconds per test.

### Unit tests pass but integration tests fail with connection errors

Check that `test/.test-env.json` was created during global setup. If a previous run was interrupted, remove the stale file and re-run:

```bash
rm -f test/.test-env.json
pnpm run test:integration
```

### Tests interfere with each other

Each integration/E2E test should be independent. If you see cross-test pollution, verify `setup-after-env.ts` is loaded (it is configured in both `jest-integration.json` and `jest-e2e.json`) and that new tables are included in the `TRUNCATE` list in `test/helpers/test-database.ts`.

## What not to test

- DTO class definitions (covered implicitly by validation E2E tests)
- Simple getters/setters and Nest decorators
- Trivial controller methods that only delegate to a service
- Boilerplate configuration

Focus effort on business logic, authentication, authorization, data integrity, and critical user flows.
