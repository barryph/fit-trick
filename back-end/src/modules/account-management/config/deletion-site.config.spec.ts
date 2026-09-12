import {
  buildDeleteAccountLink,
  getAccountDeletionSupportEmail,
  resolveAccountDeletionSiteUrl,
} from './deletion-site.config';

describe('deletion-site.config', () => {
  const originalSiteUrl = process.env.ACCOUNT_DELETION_SITE_URL;
  const originalSupport = process.env.ACCOUNT_DELETION_SUPPORT_EMAIL;

  afterEach(() => {
    if (originalSiteUrl === undefined) {
      delete process.env.ACCOUNT_DELETION_SITE_URL;
    } else {
      process.env.ACCOUNT_DELETION_SITE_URL = originalSiteUrl;
    }
    if (originalSupport === undefined) {
      delete process.env.ACCOUNT_DELETION_SUPPORT_EMAIL;
    } else {
      process.env.ACCOUNT_DELETION_SUPPORT_EMAIL = originalSupport;
    }
  });

  describe('resolveAccountDeletionSiteUrl', () => {
    it('treats an unset or blank value as no site', () => {
      expect(resolveAccountDeletionSiteUrl({})).toBeNull();
      expect(
        resolveAccountDeletionSiteUrl({ ACCOUNT_DELETION_SITE_URL: '   ' }),
      ).toBeNull();
    });

    it('accepts an absolute http(s) URL and trims trailing slashes', () => {
      expect(
        resolveAccountDeletionSiteUrl({
          ACCOUNT_DELETION_SITE_URL: 'https://delete.kadence.app///',
        }),
      ).toBe('https://delete.kadence.app');
      expect(
        resolveAccountDeletionSiteUrl({
          ACCOUNT_DELETION_SITE_URL: 'http://localhost:4321',
        }),
      ).toBe('http://localhost:4321');
    });

    it('rejects a malformed or non-http value rather than emailing a dead link', () => {
      for (const value of [
        'kadence.app/delete',
        'not a url',
        'ftp://kadence.app',
        'mailto:support@kadence.app',
      ]) {
        expect(() =>
          resolveAccountDeletionSiteUrl({ ACCOUNT_DELETION_SITE_URL: value }),
        ).toThrow(/ACCOUNT_DELETION_SITE_URL/);
      }
    });
  });

  describe('buildDeleteAccountLink', () => {
    it('points at the site with the token as a query parameter', () => {
      process.env.ACCOUNT_DELETION_SITE_URL = 'https://delete.kadence.app';
      const link = buildDeleteAccountLink('a@example.com', 'tok en/with+chars');

      expect(link.kind).toBe('web');
      expect(
        link.url.startsWith('https://delete.kadence.app/delete?token='),
      ).toBe(true);
      // The token is URL-encoded, so it round-trips through the link intact.
      expect(new URL(link.url).searchParams.get('token')).toBe(
        'tok en/with+chars',
      );
    });

    it('falls back to a support mailto when no site is configured', () => {
      delete process.env.ACCOUNT_DELETION_SITE_URL;
      process.env.ACCOUNT_DELETION_SUPPORT_EMAIL = 'help@kadence.app';

      const link = buildDeleteAccountLink('a@example.com', 'abc123');

      expect(link.kind).toBe('mailto');
      const decoded = decodeURIComponent(link.url);
      expect(decoded.startsWith('mailto:help@kadence.app')).toBe(true);
      expect(decoded).toContain('permanently');
      expect(decoded).toContain('abc123');
    });

    it('uses a default support address when none is configured', () => {
      delete process.env.ACCOUNT_DELETION_SITE_URL;
      delete process.env.ACCOUNT_DELETION_SUPPORT_EMAIL;

      expect(getAccountDeletionSupportEmail()).toBe('support@kadence.app');
    });
  });
});
