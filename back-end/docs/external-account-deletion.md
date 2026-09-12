# External account deletion (account-deletion site)

Kadence must let someone who has **uninstalled the app** delete their account from
a web page — Google Play requires a deletion route outside the app. This document
covers the two public endpoints that make that possible, the token lifecycle
behind them, and the deliberate trade-offs.

The in-app path is unchanged and stays: `DELETE /account` (authenticated) is
still the deletion route for a signed-in user, and Google Play requires it to
remain.

---

## Endpoints

| Method & path | Auth | Purpose |
| --- | --- | --- |
| `DELETE /account` | session (`IsAuthedGuard`) | In-app deletion. Account derived from the session; no request body is accepted. |
| `POST /account/deletion-requests` | none | Body `{ email }`. Emails a single-use link **only if the account exists**, and always answers the same way. |
| `POST /account/deletion-requests/confirm` | none | Body `{ token }`. Redeems the link and permanently deletes the account. |

Both public endpoints live in `AccountDeletionController`
(`src/modules/account-management/presentation/account.controller.ts`) and delegate
to `DeletionRequestService`. No session is created, read, or required.

### `POST /account/deletion-requests`

Always `200` with:

```json
{ "data": { "message": "If an account with that email exists, a deletion link has been sent." } }
```

for a registered address, an unknown address, and a syntactically valid but
unused address alike. The endpoint must never become an account-existence
oracle, so the response is byte-for-byte identical and email-send failures are
logged and swallowed rather than surfaced.

Requesting a new link **replaces** any link already outstanding for that account:
only the newest email works.

### `POST /account/deletion-requests/confirm`

Redeems the token and deletes the account, answering `200` with a permanent-
deletion message. A token that is missing, malformed, expired, or already used
deletes nothing and answers `400 INVALID_DELETION_TOKEN` — one generic code for
every failure, so the endpoint cannot be probed for which tokens were real.

If the token is genuinely valid but the account disappeared in the meantime
(deleted in the app, or by support), the endpoint answers `404
ACCOUNT_NOT_FOUND` and the token is restored — a token cannot be used to target
an account that no longer exists. That state is hard to reach on purpose: the
FK from `account_deletion_tokens` to `users` cascades, so deleting the account
removes its tokens in the same statement. It remains as a guard against a race
(e.g. an in-app deletion landing between the redeem and the delete).

---

## Token lifecycle

| Property | Value | Where |
| --- | --- | --- |
| Entropy | 32 random bytes (256-bit hex) | `infrastructure/deletion-token.ts` |
| At rest | SHA-256 hash only; the plaintext exists in the email alone | `repos/deletionToken.repository.ts` |
| Lifetime | 30 minutes | `infrastructure/deletion.constants.ts` |
| Storage | `account_deletion_tokens`, keyed by `token_hash`, FK `ON DELETE CASCADE` to `users` | migration `20260912000000_account_deletion_tokens.ts` |
| Reuse | Impossible: the row is deleted atomically when redeemed | `consumeIfValid()` |

A token is deliberately **not** a column on `users` (the shape the password-reset
token uses). It is a different credential class from session and password-reset
tokens and must never be interchangeable with them; a row per request also gives
it its own expiry index and keeps an unauthenticated request from writing to the
credential store at all.

### Order of operations on confirm

1. `consumeIfValid(hashedToken)` — a single `DELETE … WHERE token_hash = :h AND
   expires_at > :now RETURNING …`. Atomic, so two concurrent confirmations cannot
   both win, and the token is burned **before** anything is deleted.
2. `AccountDeletionService.deleteAccount(userId, { notifyByEmail: true })` — the
   same code the in-app path uses: Apple authorization revoked first, then the
   whole account deleted in one transaction.
3. On failure, the token is **restored** with a fresh window so a transient
   provider or database failure is retryable without a new email.

Consume-then-delete, never the reverse: the other order can destroy an account
and then fail to burn the link.

---

## Emails

| Email | When | Failure handling |
| --- | --- | --- |
| Deletion link | Only for an address with a real account | Logged, swallowed; the response stays neutral |
| Deletion confirmed | After a successful external deletion | Logged, swallowed; the deletion already happened and cannot be undone |

Both go through `IEmailSender` (`src/shared/email/email-sender.port.ts`), whose
default binding captures messages in memory instead of sending them. When
`ACCOUNT_DELETION_SITE_URL` is unset the link falls back to a `mailto:` to the
support address, so the flow still completes on any environment.

> The deletion URL is the credential. It is never logged — not by the app, not
> by the no-op sender.

### What the verification email must say

The payload handed to `IEmailSender` carries only `recipientEmail`,
`deletionUrl`, and `expiresInMinutes`; the wording is the sender
implementation's job. Whatever template is used must state:

* the link **permanently deletes** the account and all of its data, with no undo;
* how long the link stays valid (`expiresInMinutes`);
* that it works **once**, and that a new link can be requested if it expires;
* that the recipient can ignore it if they did not ask for it.

The current binding is the in-memory `NoopEmailSender`, so no real message is
composed yet; a production sender must cover the points above.

---

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `ACCOUNT_DELETION_SITE_URL` | recommended | Absolute `http(s)` origin of the static deletion site. The emailed link is `${ACCOUNT_DELETION_SITE_URL}/delete?token=…`. Unset ⇒ `mailto:` fallback. A **malformed** value throws at startup rather than emailing a dead link. |
| `ACCOUNT_DELETION_SUPPORT_EMAIL` | no | Support address used by the `mailto:` fallback. Defaults to `support@kadence.app`. |
| `CORS_ORIGINS` | yes, in production | Must include the deletion site's origin or the browser will refuse both endpoints. It is a separate origin from the app; mobile clients send no `Origin` and are unaffected. |

### Site contract

The deletion site is a static page (not served by this API). It must:

* read `token` from the link's query string;
* `POST` `{ "token": "<token>" }` as JSON to `${API_BASE_URL}/account/deletion-requests/confirm`;
* render the same "link invalid or expired" message for any `INVALID_DELETION_TOKEN`;
* state clearly that deletion is permanent and cannot be undone;
* offer the "request a link" form that `POST`s `{ "email": "…" }` to
  `${API_BASE_URL}/account/deletion-requests` and shows the neutral message.

---

## Rate limiting

`ThrottlerGuard` is registered globally, so every endpoint has a per-client (IP)
limit. That alone is not enough here: one client can aim many requests at a
single victim's address, which is the spam vector that matters.

The request endpoint therefore carries **two** limits:

| Limit | Default | Key |
| --- | --- | --- |
| Per client | 5 / minute | client IP |
| Per address, per client | 3 / 15 minutes | `${clientIp}:${sha256(normalisedEmail)}` |

`DeletionRequestThrottlerGuard`
(`infrastructure/deletion-request-throttler.guard.ts`) derives the address-
scoped key and hashes the address: the throttle store is not a place to
accumulate a list of real email addresses. The confirm endpoint has a modest
per-client cap as hygiene only — a 256-bit token is not guessable.

Known limit of the design: the address budget is scoped **per client**, so a
distributed attacker rotating source IPs could still send more than three mails
to one address. Bounding that properly needs a shared (e.g. Redis) store keyed
on the address alone, which this deployment does not have; the per-client limit
plus the 30-minute token window keeps the practical abuse window small.

Rate limits are disabled when `NODE_ENV=test`, so the numeric limits are covered
by unit tests of the tracker rather than by end-to-end assertions.

---

## Security notes and known limitations

* **No enumeration.** Identical response, and send failures are hidden. A
  residual timing difference between the hit and miss paths is inherited from
  `forgot-password` and accepted for now.
* **Single use, short life.** A forwarded, shoulder-surfed, or replayed link is
  near-worthless; two concurrent confirmations produce exactly one deletion.
* **Provider revocation.** Apple authorizations are revoked server-side from the
  stored refresh token. **Google grants cannot be revoked server-side** in this
  flow: the app today relies on `GoogleSignin.revokeAccess()` client-side, and the
  backend never receives a Google refresh token (only an ID token). A user who
  deletes their account from the web is therefore told to remove Kadence's access
  from their Google account manually, and the app is expected to keep doing the
  client-side revoke on the in-app path.
* **Account lookup is by email.** The address typed into the site must be one the
  account can sign in with; nested/differently-cased aliases are normalised by
  `UserEmail` exactly as sign-in normalises them.
* **Tokens are not audit-retained.** A redeemed token row is deleted, so a second
  click reads as "invalid or expired" even though the first succeeded. Retaining
  consumed tokens to distinguish the two was judged not worth the extra state.

---

## Tests

| Layer | File | Covers |
| --- | --- | --- |
| Unit | `services/deletionRequest.service.spec.ts` | Neutral behaviour, hashed storage, site vs `mailto:` link, send-failure swallowing, consume/restore/failure propagation |
| Unit | `services/accountDeletion.service.spec.ts` | The shared deletion path and when the confirmation email is sent |
| Integration | `repos/deletionToken.repository.int-spec.ts` | Expiry, one-shot redemption, concurrent redemption, replacement, restore |
| Integration | `repos/accountDeletion.repository.int-spec.ts` | Full account wipe including outstanding tokens |
| E2E | `test/e2e/external-account-deletion.e2e-spec.ts` | Both public endpoints, identical responses, hashed storage, replay/expiry/forgery, concurrent confirm, CORS preflight |
| E2E | `test/e2e/account-deletion.e2e-spec.ts` | The in-app path, including Apple revocation ordering |
