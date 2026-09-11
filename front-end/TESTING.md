# Testing

Kadence uses a layered testing strategy: fast Jest/RNTL tests for logic and UI behavior, plus Maestro E2E flows against a real backend for critical user paths.

## Quick start

```bash
# Unit + component + integration (offline, mocked APIs)
pnpm test

# The same suite under three device timezones (UTC, UTC+14, UTC-8)
pnpm run test:timezones

# Watch mode
pnpm run test:watch
```

## Timezones

Every date the app works with is the **user's local calendar date**, carried as
an opaque `YYYY-MM-DD` string and sent to the API as `?today=` (the backend
rejects a missing one rather than guessing from its own clock).

- `utils/date.ts` does all calendar arithmetic on UTC day numbers, so a day is
  always exactly one day regardless of DST or the device offset. Only the
  explicit boundary converters (`YYYYMMDD`, `formatDateISO`)
  read the device clock, because turning the device's instant into its calendar
  date is exactly their job.
- `useToday()` supplies "today" to screens (and to the activities cache key). It
  re-renders at the device's local midnight and on every return to the
  foreground, so a phone left open overnight stops showing yesterday.
- `test/setup/local-time-guard.ts` — `withoutAmbientTime()` replaces `Date` with
  a UTC-only stand-in whose local-time and `now()` entry points throw. It is the
  in-process proof that the calendar helpers ignore the ambient timezone; use it
  when adding date logic.
- `pnpm run test:timezones` proves the same suite passes with the device on
  UTC+14 and UTC-8, i.e. on a different calendar date from a UTC server.

## Jest + React Native Testing Library

### What's covered

| Layer | Location | Examples |
|-------|----------|----------|
| Unit | `**/__tests__/*.test.ts` | Zod schemas, date utils, API client, error mapper |
| Integration | `test/screens/*.test.tsx` | Login, auth gate, Home, Timeline, Categories, Profile |
| Context | `context/__tests__/` | AuthProvider session bootstrap, login/logout/register |

### Test utilities

- `test/setup/render.tsx` — `renderWithProviders()` with SafeArea + mock auth
- `test/setup/fixtures/` — users, activities, categories, timeline data
- `test/setup/navigation-mocks.ts` — expo-router `replace` / `push` spies
- `test/setup/test-safe-area.tsx` — SafeAreaProvider with initial metrics
- `jest.setup.ts` — global mocks (haptics, fonts, reanimated, toast, linear-gradient)

### Auth mocking

Screen tests that need `useAuth` should opt into the shared mock:

```ts
jest.mock('@/context/auth-context', () =>
  require('@/test/setup/mock-auth').createAuthContextMock(),
);

import { setMockAuth, getMockAuth } from '@/test/setup/mock-auth';

setMockAuth({ isAuthenticated: false, user: null }); // override per test
```

`AuthProvider` itself is tested with the real module + mocked API layer (`context/__tests__/auth-context.test.tsx`). Do not globally mock auth in `jest.setup.ts`.

### Conventions

- Co-locate unit tests in `__tests__/` beside the module under test
- Put multi-screen integration tests in `test/screens/`
- Query by visible text, labels, and placeholders — not implementation details
- Mock at the API module boundary (`activitiesAPI`, `authAPI`, etc.)
- Use `await render(...)` and `await fireEvent.*` / `userEvent` — RNTL v14 APIs are async
- Tests run with `--runInBand` for stable async/act behavior

## Maestro E2E

Maestro flows live in `.maestro/flows/` and run against a **local or staging backend** with cookie-session auth.

### Prerequisites

1. **Backend running** (from repo root):
   ```bash
   cd ../back-end
   pnpm run start:dev
   ```
2. **Test user** seeded in the database (`test@kadence.dev` / `testpassword123`, or override via env vars)
3. **App built and installed** on emulator/device (dev client or release build)
4. **Maestro CLI** installed: https://maestro.mobile.dev/docs/getting-started
5. **`EXPO_PUBLIC_SERVER_URL`** pointing at the backend (see `.env.example`)

### Running flows

```bash
# All flows
pnpm run test:maestro

# Smoke only (launch → login → visit tabs)
pnpm run test:maestro:smoke

# Single flow
maestro test .maestro/flows/login-logout.yaml

# Override credentials
TEST_EMAIL=user@example.com TEST_PASSWORD=secret pnpm run test:maestro
```

### Flows

| Flow | File | Validates |
|------|------|-----------|
| Tab smoke | `smoke-tabs.yaml` | Launch, login, Home/Timeline/Categories render |
| Auth session | `login-logout.yaml` | Login → Home → account page logout → Login |
| Activity lifecycle | `create-complete-activity.yaml` | Create activity → appears on Home |
| Timeline toggle | `timeline-toggle.yaml` | Timeline grid loads, cell interaction |

### CI note

Jest runs on every PR via GitHub Actions. Maestro is documented for local/staging runs; wire into CI once an Android emulator job is available (see workflow comments in `.github/workflows/frontend-test.yml`).

## Adding tests for new features

1. **New pure logic** → unit test co-located with the module
2. **New form/validation** → schema unit test + one integration test for submit behavior
3. **New screen** → add a mount/render smoke test in `test/screens/`
4. **New P0 user flow** → consider one Maestro flow step (keep the E2E suite small)

## Troubleshooting

- **`getByText is not a function`** — use `screen.getByText` after `await render()`, not destructuring from render
- **Overlapping act() warnings** — ensure `await cleanup()` between tests; avoid multiple `changeText` tests in one file when possible
- **Reanimated/worklets errors** — global mock lives in `__mocks__/react-native-reanimated.ts`
- **Maestro can't find elements** — prefer visible text; update flows when copy changes
