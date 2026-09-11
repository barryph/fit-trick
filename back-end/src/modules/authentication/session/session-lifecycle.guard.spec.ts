import { ExecutionContext } from '@nestjs/common';
import { SessionLifecycleGuard } from './session-lifecycle.guard';
import type { SessionPolicy } from './session-policy';
import type SessionRevocationRepo from '../repos/session-revocation.repository';
import { SessionRevocationError } from '../authentication.errors';

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 0, 15, 12, 0, 0);

const policy: SessionPolicy = {
  idleTtlMs: 14 * ONE_DAY_IN_MS,
  absoluteTtlMs: 60 * ONE_DAY_IN_MS,
};

interface FakeSession {
  passport?: { user?: string | number };
  auth?: { createdAt: number; renewedAt: number };
  cookie: { expires: Date | null; maxAge: number | null };
}

interface FakeRequest {
  session?: FakeSession;
  sessionID: string;
  headers: Record<string, string | undefined>;
  sessionStore: { destroy: jest.Mock };
  user?: unknown;
  sessionEnded?: string;
}

function createRequest(overrides: Partial<FakeRequest> = {}): FakeRequest {
  return {
    session: {
      passport: { user: 'user-1' },
      auth: { createdAt: now, renewedAt: now },
      cookie: {
        expires: new Date(now + 7 * ONE_DAY_IN_MS),
        maxAge: 14 * ONE_DAY_IN_MS,
      },
    },
    sessionID: 'sid-1',
    headers: { cookie: 'connect.sid=s%3Asid-1.signature' },
    sessionStore: { destroy: jest.fn((_sid: string, cb: () => void) => cb()) },
    ...overrides,
  };
}

function createContext(request: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function createRevocations() {
  const revoked = new Set<string>();
  return {
    revoked,
    isRevoked: jest.fn(async (sid: string) => revoked.has(sid)),
    revoke: jest.fn(async (sid: string) => {
      revoked.add(sid);
    }),
    revokeAllForUser: jest.fn(async () => undefined),
  };
}

describe('SessionLifecycleGuard', () => {
  let revocations: ReturnType<typeof createRevocations>;
  let guard: SessionLifecycleGuard;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
    revocations = createRevocations();
    guard = new SessionLifecycleGuard(
      policy,
      revocations as unknown as SessionRevocationRepo,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renews a session whose idle window is more than halfway through', async () => {
    const request = createRequest();
    request.session!.auth = {
      createdAt: now - 30 * ONE_DAY_IN_MS,
      renewedAt: now - 8 * ONE_DAY_IN_MS,
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(request.session!.auth).toEqual({
      createdAt: now - 30 * ONE_DAY_IN_MS,
      renewedAt: now,
    });
    expect(request.session!.cookie.maxAge).toBe(policy.idleTtlMs);
    expect(request.sessionStore.destroy).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
    expect(request.sessionEnded).toBeUndefined();
  });

  it('writes nothing before the halfway point (no cookie churn)', async () => {
    const request = createRequest();
    const before = {
      auth: { ...request.session!.auth! },
      maxAge: request.session!.cookie.maxAge,
    };

    await guard.canActivate(createContext(request));

    expect(request.session!.auth).toEqual(before.auth);
    expect(request.session!.cookie.maxAge).toBe(before.maxAge);
    expect(request.sessionStore.destroy).not.toHaveBeenCalled();
  });

  it('migrates a legacy session that still has a valid window', async () => {
    const request = createRequest();
    request.session!.auth = undefined;
    request.session!.cookie.expires = new Date(now + 4 * ONE_DAY_IN_MS);

    await guard.canActivate(createContext(request));

    // Signed in ten days ago, so the absolute cap keeps its original start.
    expect(request.session!.auth).toEqual({
      createdAt: now - 10 * ONE_DAY_IN_MS,
      renewedAt: now,
    });
    expect(request.sessionStore.destroy).not.toHaveBeenCalled();
  });

  it('revokes a legacy session whose window already lapsed', async () => {
    const request = createRequest();
    request.session!.auth = undefined;
    request.session!.cookie.expires = new Date(now - ONE_DAY_IN_MS);

    await guard.canActivate(createContext(request));

    expect(request.sessionStore.destroy).toHaveBeenCalledWith(
      'sid-1',
      expect.any(Function),
    );
    expect(request.sessionEnded).toBe('idle-expired');
  });

  it('fails closed on a malformed anchor instead of re-anchoring it', async () => {
    const request = createRequest();
    request.session!.auth = {
      createdAt: 'yesterday',
      renewedAt: now,
    } as unknown as { createdAt: number; renewedAt: number };

    await guard.canActivate(createContext(request));

    expect(request.sessionStore.destroy).toHaveBeenCalledWith(
      'sid-1',
      expect.any(Function),
    );
    expect(request.sessionEnded).toBe('invalid-anchor');
  });

  it('revokes a session past the absolute cap even while it is active', async () => {
    const request = createRequest();
    request.session!.auth = {
      createdAt: now - 61 * ONE_DAY_IN_MS,
      renewedAt: now - 60_000,
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(request.sessionStore.destroy).toHaveBeenCalledWith(
      'sid-1',
      expect.any(Function),
    );
    expect(request.user).toBeUndefined();
    expect(request.sessionEnded).toBe('absolute-expired');
  });

  it('revokes a session whose granted idle window has passed', async () => {
    const request = createRequest();
    request.session!.auth = {
      createdAt: now - 20 * ONE_DAY_IN_MS,
      renewedAt: now - 20 * ONE_DAY_IN_MS,
    };
    request.session!.cookie.expires = new Date(now - ONE_DAY_IN_MS);

    await guard.canActivate(createContext(request));

    expect(request.sessionStore.destroy).toHaveBeenCalledWith(
      'sid-1',
      expect.any(Function),
    );
    expect(request.sessionEnded).toBe('idle-expired');
  });

  it('leaves the session object intact so express-session cannot rewrite the row', async () => {
    const request = createRequest();
    request.session!.auth = {
      createdAt: now - 61 * ONE_DAY_IN_MS,
      renewedAt: now - 61 * ONE_DAY_IN_MS,
    };

    await guard.canActivate(createContext(request));

    // Destroying `req.session` would break Passport's session support and
    // deleting data would make express-session re-save the row.
    expect(request.session).toBeDefined();
    expect(request.session!.passport).toEqual({ user: 'user-1' });
  });

  it('flags a request whose session cookie no longer resolves', async () => {
    const request = createRequest();
    request.session = {
      cookie: { expires: null, maxAge: null },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(request.sessionEnded).toBe('not-found');
    expect(request.sessionStore.destroy).not.toHaveBeenCalled();
  });

  it('does not flag an unauthenticated request that presented no cookie', async () => {
    const request = createRequest({ headers: {} });
    request.session = { cookie: { expires: null, maxAge: null } };

    await guard.canActivate(createContext(request));

    expect(request.sessionEnded).toBeUndefined();
  });

  it('ignores a cookie whose session was resolved but never authenticated', async () => {
    const request = createRequest();
    request.session = {
      passport: {},
      cookie: { expires: null, maxAge: null },
    };

    await guard.canActivate(createContext(request));

    expect(request.sessionEnded).toBe('not-found');
    expect(request.sessionStore.destroy).not.toHaveBeenCalled();
  });

  it.each([[undefined], [null]])(
    'passes through when there is no session middleware (%s)',
    async (session) => {
      const request = createRequest({ session: session as undefined });
      await expect(guard.canActivate(createContext(request))).resolves.toBe(
        true,
      );
      expect(request.sessionStore.destroy).not.toHaveBeenCalled();
    },
  );

  it('does not treat other cookies as a session', async () => {
    const request = createRequest({
      headers: { cookie: 'theme=dark; locale=en' },
    });
    request.session = { cookie: { expires: null, maxAge: null } };

    await guard.canActivate(createContext(request));

    expect(request.sessionEnded).toBeUndefined();
  });

  describe('durable revocation', () => {
    it('refuses a session whose id has a revocation tombstone', async () => {
      revocations.revoked.add('sid-1');
      const request = createRequest();

      await expect(guard.canActivate(createContext(request))).resolves.toBe(
        true,
      );

      expect(request.user).toBeUndefined();
      expect(request.sessionEnded).toBe('not-found');
      // The resurrected row is deleted again, and the tombstone is refreshed.
      expect(request.sessionStore.destroy).toHaveBeenCalledWith(
        'sid-1',
        expect.any(Function),
      );
      expect(revocations.revoke).toHaveBeenCalledWith('sid-1');
    });

    it('does not treat a revoked session as renewable', async () => {
      revocations.revoked.add('sid-1');
      const request = createRequest();
      // Past halfway, which would normally renew rather than revoke.
      request.session!.auth = {
        createdAt: now - 30 * ONE_DAY_IN_MS,
        renewedAt: now - 8 * ONE_DAY_IN_MS,
      };

      await guard.canActivate(createContext(request));

      expect(request.session!.auth.renewedAt).toBe(now - 8 * ONE_DAY_IN_MS);
      expect(request.sessionEnded).toBe('not-found');
    });

    it('records a tombstone when it revokes for the absolute cap', async () => {
      const request = createRequest();
      request.session!.auth = {
        createdAt: now - 61 * ONE_DAY_IN_MS,
        renewedAt: now - 60_000,
      };

      await guard.canActivate(createContext(request));

      expect(revocations.revoke).toHaveBeenCalledWith('sid-1');
      expect(request.sessionEnded).toBe('absolute-expired');
    });

    it('does not consult tombstones for an unauthenticated request', async () => {
      const request = createRequest();
      request.session = { cookie: { expires: null, maxAge: null } };

      await guard.canActivate(createContext(request));

      expect(revocations.isRevoked).not.toHaveBeenCalled();
    });
  });

  describe('revocation failures fail closed', () => {
    function expiredRequest(): FakeRequest {
      const request = createRequest();
      request.session!.auth = {
        createdAt: now - 61 * ONE_DAY_IN_MS,
        renewedAt: now - 60_000,
      };
      return request;
    }

    it('rejects the request when the stored session cannot be deleted', async () => {
      const request = expiredRequest();
      request.sessionStore.destroy = jest.fn(
        (_sid: string, cb: (err?: unknown) => void) => {
          cb(new Error('database unavailable'));
        },
      );

      await expect(
        guard.canActivate(createContext(request)),
      ).rejects.toBeInstanceOf(SessionRevocationError);
    });

    it('rejects the request when the tombstone cannot be written', async () => {
      const request = expiredRequest();
      revocations.revoke.mockRejectedValueOnce(
        new Error('database unavailable'),
      );

      await expect(
        guard.canActivate(createContext(request)),
      ).rejects.toBeInstanceOf(SessionRevocationError);
    });

    it('rejects the request when the tombstone cannot be read', async () => {
      const request = createRequest();
      revocations.isRevoked.mockRejectedValueOnce(
        new Error('database unavailable'),
      );

      await expect(
        guard.canActivate(createContext(request)),
      ).rejects.toBeInstanceOf(SessionRevocationError);
    });

    it('exposes a 503 so the client retries instead of assuming success', () => {
      const error = new SessionRevocationError();
      expect(error.code).toBe('SESSION_REVOCATION_FAILED');
      expect(error.httpStatus).toBe(503);
    });
  });
});
