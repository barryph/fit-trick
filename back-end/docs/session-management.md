# Session Management (rolling renewal & expiry)

Kadence authenticates with a **server-side session** (`express-session` +
`connect-session-knex`, table `user_sessions`) referenced by an opaque,
`HttpOnly` cookie. There are no bearer tokens and no refresh tokens: the cookie
carries a random session id, the session data lives on the server, and the
server decides on every request whether that session is still valid.

This document describes the lifetime rules, the threat model, and the
deliberate trade-offs — including the mobile-specific ones.

---

## Lifetime rules

| Rule | Default | Env override | Enforced by |
| --- | --- | --- | --- |
| **Idle window** — how long a session may go unused | 14 days | `SESSION_IDLE_TTL_MS` | cookie `Expires` / store row `expired`, plus the lifecycle guard |
| **Absolute cap** — total lifetime from sign-in, however active | 60 days | `SESSION_ABSOLUTE_TTL_MS` | `SessionLifecycleGuard` |
| **Renewal point** — halfway through the idle window | 7 days | derived (`idle / 2`) | `SessionLifecycleGuard` |

Both windows are milliseconds and are validated at startup: an unusable value is
logged and ignored, and the absolute cap is never allowed to be shorter than the
idle window.

A session that carries no anchor at all (created before rolling renewal existed)
is migrated once, and only while its granted window is still valid: the absolute
cap is derived from that window rather than restarted, so its remaining life does
not change. A session whose stored anchor is present but unusable is treated as
lapsed and revoked — a corrupt or unexpected anchor must never buy a new
lifetime.

```text
sign-in          halfway                       idle window ends
   |----------------|---------------------------------|
   |  no writes     |  renew: new window, same sid     |
   |                |                                  |
   |<-------------- absolute cap (60d) --------------->|  revoked even if active
```

### What "renewal" means here

On an authenticated request, once the current window is **more than halfway
through**, `SessionLifecycleGuard`:

1. rewrites `auth.renewedAt` in the session data,
2. re-grants the idle window (`cookie.maxAge = idle`), which also drives the
   store row's `expired`,
3. which makes `express-session` re-save the record **and re-issue the cookie**
   — same session id, fresh `Expires`.

Before halfway nothing is written and **no `Set-Cookie` is sent**. A phone that
makes many parallel requests is not charged a cookie and a database write per
request, and the session id never changes underneath those requests.

### The absolute cap is the point

Renewal **never** moves `auth.createdAt`. Past the cap the session is revoked
even if it was used a minute ago. Without that, "renew on activity" would mean
"a session never dies", so a stolen session id would be usable forever by
whoever stole it — the flaw described under "Why this replaced the old
behaviour" below.

### Session ids

The session id is rotated **only** where it must be:

* at sign-in / registration / social sign-in (`req.session.regenerate`), which
  defeats session fixation,
* implicitly when a password reset or account deletion revokes every session of
  the user.

It is deliberately **not** rotated on renewal. A mobile app runs concurrent
requests: rotating mid-flight would invalidate the siblings of the request that
rotated, and a response lost on a flaky mobile network would sign the user out.
Rotation on every renewal also buys little here, because the cap already bounds
how long any stolen id lives.

---

## Revocation

| Event | Effect |
| --- | --- |
| `DELETE /auth/logout` | Session row deleted, cookie cleared (same name/attributes the session middleware used) |
| Password reset | `clearUserSessions(userId)` deletes **every** row for the user |
| Account deletion | Rows deleted with the account, cookie cleared |
| Idle window passed | Row expires; the next request is unauthenticated |
| Absolute cap passed | Guard deletes the row on the next request |

Revocation deletes the row **on the server**, so it does not depend on the
client receiving a response, clearing its cookie, or being online at the time.

---

## How clients learn a session ended

Protected routes answer **`401` with `error.code = "SESSION_EXPIRED"`** once the
request presented a session that no longer exists — expired, signed out
elsewhere, or revoked. A request that never presented a session still gets the
plain `401 ("Not authenticated")`.

That distinction is what lets the app clear local state and say *"your session
has ended, please sign in again"* instead of a generic error. On the frontend,
`api.client.ts` broadcasts the code through `lib/auth/session-expiry.ts`, and
`AuthProvider` resets its state, so the navigation guard returns the user to
sign-in. `GET /users/current` remains an unauthenticated-safe probe and still
answers `200` with no user, preserving the app's boot behaviour.

Since expiry is reported on guarded routes only, the guard **never fails a
request itself**: it mutates session state and lets the route's own guards
decide. In particular, a client whose session expired can always sign in again
even though it is still carrying the dead cookie.

---

## Threat model

| Threat | Mitigation |
| --- | --- |
| **Session fixation** | Session id regenerated on every sign-in (password, registration, Google, Apple); a pre-sign-in id cannot be reused |
| **Session theft / replay** | Idle + absolute caps bound the usable life of a stolen id; revocation deletes the row server-side; the id is opaque, `HttpOnly`, and never exposed to client JavaScript |
| **Indefinite renewal** | The absolute cap is anchored at sign-in and cannot be moved by renewal |
| **Tampered / forged cookie** | Cookie is signed with `SESSION_SECRET`; an unsigned value is rejected and reported as an ended session |
| **Idle credential left behind** | Rows expire on their own and are cleaned up by the store (every 60s) |
| **Sign-out not taking effect** | Logout, password reset and account deletion all delete rows; a client that kept the old cookie is rejected |
| **Enumeration / brute force** | `@Throttle` on the auth endpoints (global `ThrottlerGuard` in non-test environments) |

### Explicitly not done (and why)

* **User-Agent or IP binding.** Mobile IPs change constantly (carrier NAT,
  roaming) and the User-Agent string changes when the app updates, so binding a
  session to either would sign real users out and not stop a determined
  attacker. Neither is used for enforcement.
* **Session-id rotation on every renewal.** See above: it breaks concurrent
  mobile requests for little gain.
* **Refresh tokens / long-lived API tokens.** They would add a second, longer
  lived credential to steal and revoke, which is exactly what the session model
  avoids.
* **`SameSite=Strict` as a CSRF control.** It is set (correct for browsers and
  harmless elsewhere) but React Native sends no site context, so it must not be
  relied on. Cross-site abuse on browsers is limited by the CORS allow-list and
  the JSON-only body parser.
* **A per-user session cap or "sign out everywhere" endpoint.** Useful future
  hardening; the underlying per-user revocation (`clearUserSessions`) already
  exists.

---

## Mobile-specific considerations

* **Server clocks only.** Expiry is computed exclusively from server time.
  Device clocks can be wrong and are never trusted; nothing in the protocol
  lets a client state when a session should end.
* **Concurrency.** Renewal carries the same session id and re-writes the same
  record, so parallel requests are idempotent and never invalidate each other.
* **Backgrounded apps.** A phone that sleeps for weeks relies on the idle
  window, not on a client-side timer: the server keeps the record, and the cookie
  `Expires` it hands back on renewal is what keeps the native cookie jar
  holding the credential.
* **Lost responses.** Renewal extends the record server-side first; the
  `Set-Cookie` is best-effort. If it is lost, the client keeps working until the
  stored window lapses, then re-authenticates normally.
* **No browser-only assumptions.** `HttpOnly` and the native cookie jar are the
  storage model — nothing depends on `localStorage`, JS-readable tokens, or
  service workers.
* **Persistent cookie.** The cookie carries `Expires`, so it survives the app
  being killed (a session cookie would not), while remaining `HttpOnly`.

---

## Where this lives in the code

| Concern | File |
| --- | --- |
| Windows, renewal/revocation decision (pure) | `src/modules/authentication/session/session-policy.ts` |
| Renewal, absolute/idle revocation, `sessionEnded` marker | `src/modules/authentication/session/session-lifecycle.guard.ts` |
| Cookie name/attributes (one source of truth) | `src/modules/authentication/session/session-cookie.ts` |
| Session middleware, cookie window, passport wiring | `src/configure-app.ts` |
| Sign-in anchoring (`auth.createdAt` / `auth.renewedAt`) | `src/modules/authentication/authentication.controller.ts` (`establishSession`) |
| `SESSION_EXPIRED` response for protected routes | `src/modules/authentication/is-authed.guard.ts`, `authentication.errors.ts` |
| Client-side handling | `front-end/api/api.client.ts`, `front-end/lib/auth/session-expiry.ts`, `front-end/context/auth-context.tsx` |

The session record stores its bookkeeping under `sess.auth`:

```json
{
  "cookie": { "...": "..." },
  "passport": { "user": "42" },
  "auth": { "createdAt": 1770000000000, "renewedAt": 1770500000000 }
}
```

---

## Tests

| File | Covers |
| --- | --- |
| `src/modules/authentication/session/session-policy.spec.ts` | Windows, validation, halfway renewal, caps, unanchored sessions, clock skew |
| `src/modules/authentication/session/session-lifecycle.guard.spec.ts` | Renewal writes, no-churn, revocation, session-object handling, cookie detection |
| `test/e2e/session-renewal.e2e-spec.ts` | Anchoring, renewal response/`Expires`, unanchored sessions, idle and absolute expiry, sign-out, password-reset revocation, id rotation, concurrency, public-route tolerance |
| `test/e2e/session-window.e2e-spec.ts` | The same rules against real elapsed time with short configured windows |

Run them with `pnpm run test:unit` and `pnpm run test:e2e` (the e2e suite needs
Docker, or a local Postgres — see `TESTING.md`).

---

## Why this replaced the old behaviour (historical note)

Before rolling renewal, the cookie carried a 14-day `Max-Age` and the server
relied on `connect-session-knex`'s `touch`, which `express-session` calls on
**every** request that presents a valid session id. That meant:

* the stored row's `expired` was pushed forward indefinitely, so the *server*
  never stopped accepting a session id, and
* the only 14-day bound was the cookie's `Max-Age` — enforced by the honest
  client, meaningless to anyone who copies the id out of the cookie jar.

In other words, sessions were effectively non-expiring server-side, and adding
`rolling: true` alone would have formalised that. The current design keeps
sliding behaviour but bounds it: the idle window is re-granted only on
authenticated activity, and never past the absolute cap anchored at sign-in.
