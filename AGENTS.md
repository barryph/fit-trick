# Kadence

Personal habit tracker: `back-end/` (NestJS 11 API + PostgreSQL) and `front-end/` (Expo SDK 54 React Native app). These are two independent npm packages — there is **no root package.json / workspace**. Install (`npm i`) and run scripts from inside the package directory; CI (`.github/workflows/backend-test.yml`, `frontend-test.yml`) runs per side.

## Worktrees (required)

* Always develop in a git worktree; never modify the primary working tree directly.
* Base the worktree on the latest local `main` and use a dedicated feature branch (style: `feat/*`).
* The repo root gitignores `./worktrees` — it is a supported location for worktrees, or use a sibling directory.
* Worktree checkouts have no `node_modules`: run `npm i` in each package you touch after creating one.
* Run tests, lint, typecheck, and builds from the worktree.

## back-end/ — NestJS API

* DDD + Clean Architecture: features under `src/modules/<feature>/` split into `domain/`, `repos/`, `services/`, `queries/`, `mappers/`, `dtos/`. Shared infra in `src/shared/` (Knex module, `configure-app.ts` wires sessions/Passport/CORS/validation for both `main.ts` and E2E tests).
* Dev server: `npm run start:dev` on port 3000.
* DB via knex + knex-migrate: `npm run db:up` / `db:down` / `db:seed`. Migrations live in **`src/shared/knex/migrations/`** (not a root `migrations/` dir); seeds in `src/shared/knex/seeds/`. Requires a local Postgres server and `.env`.
* Full check: `npm run typecheck && npm run lint:check && npm run test:unit` (runs in seconds, no DB).
* `npm run test:integration` and `npm run test:e2e` **require Docker** — Testcontainers boots a disposable Postgres 16 container, runs migrations, and truncates tables before every test. If an interrupted run leaves `test/.test-env.json`, delete it and re-run.
* Test naming convention matters — configs match on suffixes: unit `*.spec.ts`, integration `*.int-spec.ts` (both colocated under `src/`), E2E `*.e2e-spec.ts` under `test/e2e/`. Details and factories: `back-end/TESTING.md`.
* `npm run lint` auto-fixes; CI uses the non-fixing `npm run lint:check`. OAuth (Google/Apple) architecture and local testing overrides: `back-end/docs/oauth-sign-in.md`.

## front-end/ — Expo app

* expo-router v6 file routes in `app/` (`(tabs)/`, auth screens); UI in `components/`; `@/*` path alias = package root.
* Data layer: per-feature API modules in `api/` consumed through TanStack Query hooks (`hooks/queries/`, `hooks/mutations/`); auth state in `context/auth-context.tsx`.
* Dev server: `npm run start` (expo start). There is no `npm run dev` — the root README is wrong. Backend base URL comes from `EXPO_PUBLIC_SERVER_URL` in `front-end/.env`.
* Tests: `npm test` (jest, `--runInBand`). Unit tests colocated in `__tests__/`; screen flows in `test/screens/`. RNTL v14 APIs are async (`await render`, `await fireEvent.*`). Mock auth via `@/test/setup/mock-auth`; do not mock AuthProvider globally. See `front-end/TESTING.md`.
* `ios/` and `android/` are **gitignored `expo prebuild` artifacts** — configure via `app.config.ts` / `app.json`, never hand-edit natives. `app.config.ts` selects per-variant Firebase files (env `APP_VARIANT` = development|preview|production, set by EAS) from the committed `firebase/{ios,android}/` configs.
* Maestro E2E (`npm run test:maestro`) needs a running backend plus an app installed on an emulator, and logs in as `test@kadence.dev`. The current backend seed (`src/shared/knex/seeds/users.ts`) only creates `test@mail.com` — register the Maestro user manually first.

## Gotchas

* Subpackage READMEs are stock starter boilerplate and have drifted (see `npm run dev`, Maestro test user above). Prefer `package.json` scripts, the TESTING.md files, and CI workflows as source of truth.
* Frontend OAuth IDs are public (`EXPO_PUBLIC_GOOGLE_*`); they must match `GOOGLE_SERVER_CLIENT_IDS` / `APPLE_CLIENT_IDS` in the backend `.env`. Apple signing keys and other secrets belong only in the backend env.
* Feature work is merged to `main` via PRs; commit messages use conventional prefixes (`feat:` / `fix:`).
