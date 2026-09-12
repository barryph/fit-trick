/**
 * Address the deletion-link email is sent from, and the display name shown in
 * the mailbox. Both are envelope-only concerns; no secrets are involved.
 */
export const ACCOUNT_DELETION_EMAIL_FROM = 'no-reply@kadence.app';
export const ACCOUNT_DELETION_EMAIL_FROM_NAME = 'Kadence';

/**
 * The account-deletion site: a static page, outside the app, that satisfies
 * Google Play's requirement that an account can be deleted from the web. This
 * backend does not serve it; it only links to it.
 *
 * When it is not configured the verification email carries a `mailto:` link to
 * the support address instead, so the flow still completes on every
 * environment (including local development and CI).
 */
export function getAccountDeletionSupportEmail(): string {
  return (
    process.env.ACCOUNT_DELETION_SUPPORT_EMAIL?.trim() || 'support@kadence.app'
  );
}

export interface DeleteAccountLink {
  /** `web` when the static site is configured, `mailto` otherwise. */
  kind: 'web' | 'mailto';
  url: string;
}

/**
 * Builds the single-use link that finishes the flow. The token is the only
 * credential in it, so the URL must never be logged.
 */
export function buildDeleteAccountLink(
  recipientEmail: string,
  token: string,
): DeleteAccountLink {
  const siteUrl = resolveAccountDeletionSiteUrl();
  if (siteUrl) {
    return {
      kind: 'web',
      url: `${siteUrl}/delete?token=${encodeURIComponent(token)}`,
    };
  }

  const subject = 'Delete my Kadence account';
  const body = [
    'I want to permanently delete my Kadence account.',
    '',
    `Verification token: ${token}`,
  ].join('\n');
  return {
    kind: 'mailto',
    url: `mailto:${getAccountDeletionSupportEmail()}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`,
  };
}

/**
 * Configuration check run at startup. The site URL is optional, but a
 * *malformed* one must fail loudly rather than be emailed to users: it would
 * produce a link that goes nowhere and a deletion request nobody can complete.
 *
 * @returns the configured site URL, or `null` when the mailto fallback is in use.
 */
export function resolveAccountDeletionSiteUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = env.ACCOUNT_DELETION_SITE_URL?.trim();
  if (!raw || raw === '') {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      'env.ACCOUNT_DELETION_SITE_URL must be an absolute http(s) URL',
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      'env.ACCOUNT_DELETION_SITE_URL must be an absolute http(s) URL',
    );
  }

  return raw.replace(/\/+$/, '');
}
