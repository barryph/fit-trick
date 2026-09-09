# Kadence

Personal habit tracker: `back-end/` (NestJS 11 API + PostgreSQL) and `front-end/` (Expo SDK 54 React Native app). These are two independent packages — there is **no root package.json / workspace**. **pnpm** is the package manager for both. Install (`pnpm install`) and run scripts (`pnpm run <script>`) from inside the package directory; each package pins pnpm via its `packageManager` field and has its own `pnpm-lock.yaml`. CI (`.github/workflows/backend-test.yml`, `frontend-test.yml`) runs per side.

* `front-end/pnpm-workspace.yaml` sets `nodeLinker: hoisted` (Expo SDK 54 supports pnpm's isolated layout, but RN native modules and Jest can break under isolation; hoisted keeps `node_modules` flat like npm did). Since pnpm 11 non-auth settings are read from `pnpm-workspace.yaml`, not `.npmrc`.
* pnpm blocks dependency build scripts by default (reported as "Ignored build scripts"); only approve the ones you actually need (`allowBuilds` in each package's `pnpm-workspace.yaml`). Keep CI installs consistent via `pnpm install --frozen-lockfile`.

## Worktrees (required)

* Always develop in a git worktree; never modify the primary working tree directly, unless specifically specified.
* Base the worktree on the latest local `main` and use a dedicated feature branch (style: `feat/*`).
* Worktrees have no `node_modules`: run `pnpm install` in each package you touch after creating one.
* Worktrees lack the gitignored `front-end/.env` and `back-end/.env`: after creating a worktree, create a symlink to the primary tree's copy, e.g. `ln -s <repo-root>/front-end/.env <worktree>/back-end/.env` and `ln -s <repo-root>/back-end/`.
* Run tests, lint, typecheck, and builds from the worktree.

## back-end/ — NestJS API

* DDD + Clean Architecture: features under `src/modules/<feature>/` split into `domain/`, `repos/`, `services/`, `queries/`, `mappers/`, `dtos/`. Shared infra in `src/shared/` (Knex module, `configure-app.ts` wires sessions/Passport/CORS/validation for both `main.ts` and E2E tests).
* Dev server: `pnpm run start:dev` on port 3000.
* DB via knex + knex-migrate: `pnpm run db:up` / `db:down` / `db:seed`. Migrations live in **`src/shared/knex/migrations/`** (not a root `migrations/` dir); seeds in `src/shared/knex/seeds/`. Requires a local Postgres server and `.env`.
* Full check: `pnpm run typecheck && pnpm run lint:check && pnpm run test:unit` (runs in seconds, no DB).
* `pnpm run test:integration` and `pnpm run test:e2e` **require Docker** — Testcontainers boots a disposable Postgres 16 container, runs migrations, and truncates tables before every test. If an interrupted run leaves `test/.test-env.json`, delete it and re-run.
* Test naming convention matters — configs match on suffixes: unit `*.spec.ts`, integration `*.int-spec.ts` (both colocated under `src/`), E2E `*.e2e-spec.ts` under `test/e2e/`. Details and factories: `back-end/TESTING.md`.
* `pnpm run lint` auto-fixes; CI uses the non-fixing `pnpm run lint:check`. OAuth (Google/Apple) architecture and local testing overrides: `back-end/docs/oauth-sign-in.md`.

## front-end/ — Expo app

* expo-router v6 file routes in `app/` (`(tabs)/`, auth screens); UI in `components/`; `@/*` path alias = package root.
* Data layer: per-feature API modules in `api/` consumed through TanStack Query hooks (`hooks/queries/`, `hooks/mutations/`); auth state in `context/auth-context.tsx`.
* Dev server: `pnpm run start` (expo start). There is no `pnpm run dev` — the root README is wrong. Backend base URL comes from `EXPO_PUBLIC_SERVER_URL` in `front-end/.env`.
* Tests: `pnpm test` (jest, `--runInBand`). Unit tests colocated in `__tests__/`; screen flows in `test/screens/`. RNTL v14 APIs are async (`await render`, `await fireEvent.*`). Mock auth via `@/test/setup/mock-auth`; do not mock AuthProvider globally. See `front-end/TESTING.md`.
* `ios/` and `android/` are **gitignored `expo prebuild` artifacts** — configure via `app.config.ts` / `app.json`, never hand-edit natives. `app.config.ts` selects per-variant Firebase files (env `APP_VARIANT` = development|preview|production, set by EAS) from the committed `firebase/{ios,android}/` configs.
* Maestro E2E (`pnpm run test:maestro`) needs a running backend plus an app installed on an emulator, and logs in as `test@kadence.dev`. The current backend seed (`src/shared/knex/seeds/users.ts`) only creates `test@mail.com` — register the Maestro user manually first.

## Gotchas

* Subpackage READMEs are stock starter boilerplate and have drifted (see `pnpm run dev`, Maestro test user above). Prefer `package.json` scripts, the TESTING.md files, and CI workflows as source of truth.
* Use `pnpm` for everything (install/add/run/exec/dlx); avoid reaching for `npm`/`npx` so scripts stay consistent across local dev and CI.
* Frontend OAuth IDs are public (`EXPO_PUBLIC_GOOGLE_*`); they must match `GOOGLE_SERVER_CLIENT_IDS` / `APPLE_CLIENT_IDS` in the backend `.env`. Apple signing keys and other secrets belong only in the backend env.
* Feature work is merged to `main` via PRs; commit messages use conventional prefixes (`feat:` / `fix:`).
