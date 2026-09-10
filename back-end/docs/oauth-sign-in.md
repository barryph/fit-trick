# OAuth Sign-In (Google & Apple)

This document describes the social authentication implementation for Kadence:
Google Sign-In (Android + iOS) and Sign in with Apple (iOS only).

The backend is the security boundary. **The backend never trusts identity
information supplied by the mobile client.** All identity is derived from
cryptographically verified provider credentials (Google ID token / Apple
identity token).

---

## Architecture

```text
React Native
    |  provider sign-in (native)
    v
Google / Apple
    |  ID token / identity token
    v
React Native
    |  HTTPS POST /auth/google or /auth/apple  (idToken only; Apple also sends raw nonce)
    v
Backend
    |  Verify provider credential (signature, issuer, audience, expiry, nonce)
    |  Extract verified provider `sub`
    v
External identity lookup or creation
    |
    v
Existing cookie-based session (regenerate + login)  -- identical to email/password
```

### Code layout (backend)

| Concern | File |
| --- | --- |
| Google token verification | `src/modules/authentication/infrastructure/providers/google.provider.ts` |
| Apple token verification | `src/modules/authentication/infrastructure/providers/apple.provider.ts` |
| Identity → user resolution | `src/modules/authentication/services/external-identity.service.ts` |
| Provider orchestration | `src/modules/authentication/services/social-auth.service.ts` |
| External identities repo | `src/modules/authentication/repos/external-identities.repository.ts` |
| HTTP endpoints | `src/modules/authentication/authentication.controller.ts` (`POST /auth/google`, `POST /auth/apple`) |

### Code layout (frontend)

| Concern | File |
| --- | --- |
| Nonce generation / hashing | `front-end/lib/auth/nonce.ts` |
| Google SDK wrapper | `front-end/lib/auth/google.ts` |
| Apple SDK wrapper | `front-end/lib/auth/apple.ts` |
| Error normalisation | `front-end/lib/auth/errors.ts` |
| Auth state + API exchange | `front-end/context/auth-context.tsx` |
| Buttons | `front-end/components/auth/social-sign-in-buttons.tsx` |

---

## Required environment variables

### Backend (`back-end/.env` / production env)

| Variable | Description |
| --- | --- |
| `GOOGLE_SERVER_CLIENT_IDS` | Comma-separated Google **web/server client IDs**. The audience the backend accepts in a Google ID token. Backend-only. |
| `APPLE_CLIENT_IDS` | Comma-separated Sign in with Apple client IDs. For a native iOS app these are the bundle identifiers, e.g. `com.barryph.kadence.dev,com.barryph.kadence.preview,com.barryph.kadence`. |
| `APPLE_JWKS_URL` | Apple's JWKS endpoint. Default `https://appleid.apple.com/auth/keys`. Overridable only for tests. |
| `GOOGLE_JWKS_URL` | Google's signing-certificates endpoint. Default `https://www.googleapis.com/oauth2/v1/certs`. Overridable only for tests. |
| `SESSION_SECRET` | Already required. Must be a long, random, unguessable value. |
| `CORS_ORIGINS` | Comma-separated allowed browser origins for web development. Mobile clients send no `Origin`. Defaults to localhost dev servers outside production, none in production. |

These are backend secrets/configuration. **Never expose them via
`EXPO_PUBLIC_*`.** Values bundled into the React Native app are public.

### Frontend (`front-end/.env`)

Public values (embedded in the app bundle — treat as public):

| Variable | Description |
| --- | --- |
| `EXPO_PUBLIC_SERVER_URL` | Backend base URL (already used). |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google **web/server client ID** used to request an ID token intended for the backend. |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google **iOS client ID** (native client). |

### Build-time (EAS / app.config.ts)

| Variable | Description |
| --- | --- |
| `GOOGLE_IOS_URL_SCHEME` | The reversed iOS client ID (`com.googleusercontent.apps.<client-id>`), used by the config plugin to register the iOS URL scheme. Build-time only. |

---

## Google Cloud configuration

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com).
2. **OAuth consent screen**: configure as "External"; add the scopes `openid`,
   `email`, `profile` (default OIDC scopes — no additional Google API access).
   Add your email as a test user while in testing mode.
3. **Credentials → Create credentials → OAuth client ID**:
   - **Android**: type Android. Add the app package name (`com.barryph.kadence`
     for production, plus `.dev` / `.preview` variants) and the **SHA-1**
     signing-certificate fingerprint for each build variant.
     To find your SHA-1 certificate fingerprint run `eas credentials`.
   - **iOS**: type iOS. Add the bundle identifier (`com.barryph.kadence` etc.).
     Take note of the **iOS client ID** and the **reversed client ID**
     (`com.googleusercontent.apps.<client-id>`) — the reversed ID becomes
     `GOOGLE_IOS_URL_SCHEME`.
   - **Web**: type Web application. This is the **server/web client ID** for the
     backend — it goes in `GOOGLE_SERVER_CLIENT_IDS` and
     `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. No redirect URI is needed for native
     sign-in; you may add one for local web development.

### Android notes
- Android requires Google Play services. The app is matched by package name +
  SHA-1 registered above. No `google-services.json` is required (Firebase is not
  used).
- The runtime configuration only needs the web client ID
  (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`).

### iOS notes
- The Google config plugin (in `front-end/app.config.ts`) appends the reversed
  client ID as a URL scheme to `Info.plist` during prebuild.
- Rebuild with `pnpm exec expo prebuild` / EAS after changing config.

---

## Apple Developer configuration

1. In [developer.apple.com](https://developer.apple.com) → Certificates,
   Identifiers & Profiles → **Identifiers**, select your app ID and enable
   **Sign in with Apple** (enable as a primary App ID capability).
2. In **Key IDs** create a service identifier key only if you later implement
   server-side token refresh (not currently used — no Apple private key is
   required by the current implementation).
3. The backend audience (`APPLE_CLIENT_IDS`) is the app's bundle identifier
   (`com.barryph.kadence`, plus dev/preview variants if you want sign-in to work
   across build variants).
4. Add `expo-apple-authentication` (already in `app.json` via `app.config.ts`);
   its config plugin adds the `com.apple.developer.applesignin` entitlement
   automatically. Apple Sign-In is rendered only on iOS; it is never offered on
   Android.

---

## Authentication flow

### Client (Google)
1. `signInWithGoogle()` calls `GoogleSignin.configure({ webClientId, iosClientId })`
   (default OIDC `email`/`profile` scopes only) and `GoogleSignin.signIn()`.
2. The library returns the Google **ID token**. The client sends it to
   `POST /auth/google` as `{ "idToken": "..." }`.
3. Cancellation, unavailable Play services, and other failures are normalised in
   `lib/auth/errors.ts`; the UI shows a friendly message (or nothing on cancel).

### Client (Apple)
1. `signInWithApple()` generates a **cryptographically secure random nonce**,
   passes it to `AppleAuthentication.signInAsync({ nonce, requestedScopes })`.
   The native SDK sends the SHA-256 of the raw nonce to Apple.
2. The client sends the identity token **and the raw nonce** to
   `POST /auth/apple` as `{ "idToken": "...", "nonce": "..." }`.
3. Apple's private-relay email is treated as opaque; the stable identity is the
   verified `sub`.

### Backend verification
Both endpoints verify before touching any account data:

- **Google** (`google-auth-library`): signature against Google's published
  signing certs (fetched and cached, refreshed on unknown `kid` so rotation is
  handled), issuer (`accounts.google.com`), audience (one of
  `GOOGLE_SERVER_CLIENT_IDS`), `iat`/`exp` including clock skew and a 2-hour max
  token age. The verified `sub` is the only identity used.
- **Apple** (`jsonwebtoken` + Apple's published JWKS, cached with rotation):
  signature (RS256 only), issuer (`https://appleid.apple.com`), audience (one of
  `APPLE_CLIENT_IDS`), `exp`, and the `nonce` claim compared against
  `sha256(rawNonce)`.

### Session
On success the controller reuses the existing email/password session flow:
`session.regenerate()` (session-fixation protection) then `req.logIn(user)`.
Provider tokens are **never** stored in the session. The authenticated state is
indistinguishable from a password login.

---

## Account linking behaviour

| Case | Behaviour |
| --- | --- |
| New Google/Apple user | A user is created (no password) and an `external_identities` row is attached. |
| Existing Google/Apple user | Resolved by `(provider, provider_subject)`; the same user is logged in. |
| Email/password user signs in with a provider | **No auto-merge.** A separate account is created. If the provider email is already taken, the new account gets a deterministic synthetic email (`google-<sub>@local.kadence` / `apple-<sub>@local.kadence`) so the email unique constraint is never used to link accounts. |
| Identity already linked to another user | Impossible in the login flow: `UNIQUE (provider, provider_subject)` is enforced at the database level and identities are never reassigned. |
| Private Apple relay email | Identity is the Apple `sub`, never the email. The relay email is stored at creation only. |
| Provider email differs from stored email | Ignored for resolution (lookup is by `sub`). |
| Deleted account | FK `ON DELETE CASCADE` removes the identity row. If an identity row exists without a user, sign-in fails closed with a generic error. |
| Replayed credential | Rejected by expiry checks; Apple additionally binds the token to the raw nonce (SHA-256). Google's stable library offers no nonce, so replay is bounded by the ~1h ID-token lifetime (see Security assumptions). |
| Expired / invalid signature / bad issuer / bad audience / bad nonce | Generic `401 OAUTH_AUTH_FAILED`. No session, no account change. |

Explicit account linking (authenticating to an existing account and attaching a
provider identity through an authenticated flow) is not implemented yet; the
identity model supports it, and it must always require an authenticated session.

---

## Security assumptions

- The backend is the security boundary. Client-supplied `email`, `userId`,
  `name`, etc. are never trusted — the DTOs reject unknown fields and identity
  is derived solely from verified tokens.
- **Google nonce:** the current stable `@react-native-google-signin/google-signin`
  API does not expose a nonce parameter (verified against v16.x). Google ID
  tokens are short-lived (~1 hour); a replayed token is bounded by that window
  and can only ever authenticate the same Google account. This is an accepted,
  documented residual risk.
- Provider signing keys are fetched from the providers' published endpoints and
  cached briefly; a token whose `kid` is unknown forces a refresh, so key
  rotation is handled.
- `users.password` is nullable to represent OAuth-only accounts. Password login
  is rejected for such accounts.
- OAuth endpoints are rate limited with the same `@Throttle` policy as password
  login, so they cannot be used as unlimited token-validation or enumeration
  oracles.
- Failed verification never logs the token or the underlying error message
  (provider libraries embed the JWT in some error strings); only a generic
  error is surfaced.
- Sessions remain server-side (`user_sessions`) with `HttpOnly`,
  `SameSite=strict`, `Secure` in production, and regeneration after
  authentication.
- The session a provider sign-in establishes is identical to the
  email/password one, including its rolling-renewal bookkeeping (idle window
  refreshed on activity, absolute cap anchored at sign-in). See
  `docs/session-management.md`.

---

## Local development

```bash
# backend
cd back-end
# set GOOGLE_SERVER_CLIENT_IDS and APPLE_CLIENT_IDS in .env (see .env.example)
pnpm run db:up
pnpm run start:dev

# frontend
cd front-end
# set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
pnpm run start
```

Note: native sign-in requires a development build (native modules are not
available in Expo Go). Use `pnpm exec expo run:ios` / `pnpm exec expo run:android`
or an EAS development build.

## Production configuration

- Set `NODE_ENV=production`, strong `SESSION_SECRET`, `GOOGLE_SERVER_CLIENT_IDS`,
  `APPLE_CLIENT_IDS`, and a restrictive `CORS_ORIGINS` (or none).
- Run behind HTTPS (a reverse proxy sets `trust proxy`, and cookies become
  `Secure`).
- Apple's private key (if a future feature needs server-side refresh) must live
  only on the backend.

## Testing

- Provider verification unit tests run against locally generated RSA keys and a
  local JWKS/certs server: valid/invalid signature, expired, bad issuer, bad
  audience, missing `sub`, bad nonce, `alg=none` / `alg=HS256` confusion, key
  rotation, and no-token-leakage.
- e2e tests cover the full HTTP + session flow, account resolution, email-match
  no-merge, identity-transfer prevention, session regeneration, token-free
  sessions, and CORS.
- Frontend tests cover provider wrappers (success/cancel/fail), auth context
  (state updates, duplicate prevention), and the login/register screens.
