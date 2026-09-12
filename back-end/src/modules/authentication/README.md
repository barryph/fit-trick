# Authentication

Here we separate authentication into it's own module. This was the recommended approach by gipity and others online. Conceptually it makes sense, separating the authentications application and infrastructural concerns separate from the users, but may not be the most practical.
Stemmler in his ddd-form repo instead includes authentication in his users module (DDD module).
Stemmlers repo: https://github.com/stemmlerjs/ddd-forum/tree/master/src/modules/users/services

This module owns **proving who a caller is and holding the resulting session**:
credentials, OAuth provider verification, and session lifetime. It deliberately
does not own account *lifecycle* — deleting an account (and the emailed tokens
that authorize deletion from outside the app) lives in
`src/modules/account-management/`, which consumes the repos and providers
exported here. See `docs/external-account-deletion.md`.

## Social authentication (Google & Apple)

The `infrastructure/providers/` directory contains the provider verification
logic (`GoogleProvider`, `AppleProvider`), which derive identity exclusively
from cryptographically verified provider credentials. `ExternalIdentityService`
resolves/creates the application user. See `docs/oauth-sign-in.md` for full
configuration, flow, account-linking behaviour, and security assumptions.

## Sessions

Authentication is cookie-based and server-side (`express-session` +
`connect-session-knex`); session lifetime is a 14-day idle window that
authenticated activity re-grants, bounded by a 60-day absolute cap anchored at
sign-in. Because the window is re-granted at the halfway point rather than on
every request, a session ends after **between 7 and 14 days without activity**
(never more than 14). Renewal, expiry and revocation are enforced by
`session/session-lifecycle.guard.ts` under the policy in
`session/session-policy.ts`.

See `back-end/docs/session-management.md` for the lifetime rules, threat model,
mobile constraints, and the tests that cover them.
