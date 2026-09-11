import {
  DEFAULT_SESSION_ABSOLUTE_TTL_MS,
  DEFAULT_SESSION_IDLE_TTL_MS,
  createSessionAnchor,
  evaluateSession,
  resolveSessionPolicy,
  type SessionPolicy,
} from './session-policy';

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

const policy: SessionPolicy = {
  idleTtlMs: 14 * ONE_DAY_IN_MS,
  absoluteTtlMs: 60 * ONE_DAY_IN_MS,
};

const now = Date.UTC(2026, 0, 15, 12, 0, 0);

function anchorAged(daysAgo: number, renewedDaysAgo: number = daysAgo) {
  return {
    createdAt: now - daysAgo * ONE_DAY_IN_MS,
    renewedAt: now - renewedDaysAgo * ONE_DAY_IN_MS,
  };
}

describe('resolveSessionPolicy', () => {
  it('defaults to a 14 day idle window and a 60 day absolute cap', () => {
    expect(resolveSessionPolicy({})).toEqual({
      idleTtlMs: 14 * ONE_DAY_IN_MS,
      absoluteTtlMs: 60 * ONE_DAY_IN_MS,
    });
    expect(DEFAULT_SESSION_IDLE_TTL_MS).toBe(14 * ONE_DAY_IN_MS);
    expect(DEFAULT_SESSION_ABSOLUTE_TTL_MS).toBe(60 * ONE_DAY_IN_MS);
  });

  it('reads overrides from the environment', () => {
    expect(
      resolveSessionPolicy({
        SESSION_IDLE_TTL_MS: '120000',
        SESSION_ABSOLUTE_TTL_MS: '600000',
      }),
    ).toEqual({ idleTtlMs: 120000, absoluteTtlMs: 600000 });
  });

  it.each([['nonsense'], ['0'], ['-1'], ['']])(
    'falls back to the default for an unusable idle window (%s)',
    (value) => {
      expect(
        resolveSessionPolicy({ SESSION_IDLE_TTL_MS: value }).idleTtlMs,
      ).toBe(DEFAULT_SESSION_IDLE_TTL_MS);
    },
  );

  it('never lets the absolute cap be tighter than the idle window', () => {
    expect(
      resolveSessionPolicy({
        SESSION_IDLE_TTL_MS: String(10 * ONE_DAY_IN_MS),
        SESSION_ABSOLUTE_TTL_MS: String(ONE_DAY_IN_MS),
      }),
    ).toEqual({
      idleTtlMs: 10 * ONE_DAY_IN_MS,
      absoluteTtlMs: 10 * ONE_DAY_IN_MS,
    });
  });
});

describe('evaluateSession', () => {
  const evaluate = (
    anchor: unknown,
    windowExpiresAt: number | null = now + ONE_DAY_IN_MS,
  ) => evaluateSession({ anchor, windowExpiresAt, now, policy });

  it('keeps a freshly anchored session as-is', () => {
    const anchor = anchorAged(0);
    expect(evaluate(anchor)).toEqual({ kind: 'continue', anchor });
  });

  it('renews once the idle window is more than halfway through', () => {
    expect(evaluate(anchorAged(7))).toEqual({
      kind: 'renew',
      anchor: { createdAt: now - 7 * ONE_DAY_IN_MS, renewedAt: now },
      reason: 'halfway',
    });
  });

  it('does not renew before the halfway point', () => {
    const anchor = anchorAged(6, 6);
    expect(evaluate(anchor)).toEqual({ kind: 'continue', anchor });
  });

  it('renews exactly at the halfway point', () => {
    expect(evaluate(anchorAged(14, 7))).toMatchObject({
      kind: 'renew',
      reason: 'halfway',
    });
  });

  it('keeps the original sign-in time when renewing, so the cap cannot slide', () => {
    const decision = evaluate(anchorAged(30, 8));
    expect(decision).toMatchObject({ kind: 'renew', reason: 'halfway' });
    if (decision.kind === 'renew') {
      expect(decision.anchor.createdAt).toBe(now - 30 * ONE_DAY_IN_MS);
    }
  });

  it('revokes an active session past the absolute cap', () => {
    expect(evaluate(anchorAged(60, 0))).toEqual({
      kind: 'revoke',
      reason: 'absolute-expired',
    });
  });

  it('revokes a session whose granted idle window has passed', () => {
    expect(evaluate(anchorAged(20, 10), now - 1000)).toEqual({
      kind: 'revoke',
      reason: 'idle-expired',
    });
  });

  it('prefers the absolute cap when both caps have passed', () => {
    expect(evaluate(anchorAged(70, 20), now - 1000)).toEqual({
      kind: 'revoke',
      reason: 'absolute-expired',
    });
  });

  it('revokes a legacy session whose granted window has already passed', () => {
    expect(evaluate(undefined, now - 10 * ONE_DAY_IN_MS)).toEqual({
      kind: 'revoke',
      reason: 'idle-expired',
    });
  });

  it('migrates a legacy session without restarting its absolute cap', () => {
    // Signed in 10 days ago under the old 14-day cookie, so four days of its
    // original window remain: the absolute cap must start 10 days ago, not
    // today.
    const windowExpiresAt = now + 4 * ONE_DAY_IN_MS;
    expect(evaluate(undefined, windowExpiresAt)).toEqual({
      kind: 'renew',
      anchor: { createdAt: now - 10 * ONE_DAY_IN_MS, renewedAt: now },
      reason: 'missing-anchor',
    });
  });

  it('does not move a legacy session’s cap into the future', () => {
    // A window longer than the configured idle TTL cannot be attributed to a
    // sign-in in the future; the cap starts now at the latest.
    const decision = evaluate(undefined, now + 30 * ONE_DAY_IN_MS);
    expect(decision).toMatchObject({ kind: 'renew' });
    if (decision.kind === 'renew') {
      expect(decision.anchor.createdAt).toBeLessThanOrEqual(now);
    }
  });

  it.each([
    ['not an object', 'nope'],
    ['null', null],
    ['empty object', {}],
    ['only createdAt', { createdAt: now }],
    ['non-numeric timestamps', { createdAt: 'yesterday', renewedAt: now }],
    ['NaN timestamps', { createdAt: Number.NaN, renewedAt: Number.NaN }],
  ])('fails closed on a malformed anchor (%s)', (_label, anchor) => {
    expect(evaluate(anchor)).toEqual({
      kind: 'revoke',
      reason: 'invalid-anchor',
    });
  });

  it('revokes a malformed anchor even when the window is still valid', () => {
    expect(
      evaluate({ createdAt: now - ONE_DAY_IN_MS, renewedAt: 'yesterday' }),
    ).toEqual({ kind: 'revoke', reason: 'invalid-anchor' });
  });

  it('lets a legacy session with no window at all keep rolling', () => {
    // Nothing to derive a sign-in time from and nothing to prove it lapsed.
    expect(evaluate(undefined, null)).toEqual({
      kind: 'renew',
      anchor: { createdAt: now, renewedAt: now },
      reason: 'missing-anchor',
    });
  });

  it('does not renew-loop when the last renewal is in the future (clock skew)', () => {
    const anchor = { createdAt: now - ONE_DAY_IN_MS, renewedAt: now + 1000 };
    expect(evaluate(anchor)).toEqual({ kind: 'continue', anchor });
  });

  it('still applies the absolute cap to a session with a skewed renewal', () => {
    const anchor = {
      createdAt: now - 90 * ONE_DAY_IN_MS,
      renewedAt: now + 1000,
    };
    expect(evaluate(anchor)).toEqual({
      kind: 'revoke',
      reason: 'absolute-expired',
    });
  });

  it('ignores a missing stored window rather than revoking', () => {
    const anchor = anchorAged(1);
    expect(evaluate(anchor, null)).toEqual({ kind: 'continue', anchor });
  });
});

describe('createSessionAnchor', () => {
  it('starts the absolute cap and the first idle window at the same moment', () => {
    expect(createSessionAnchor(now)).toEqual({
      createdAt: now,
      renewedAt: now,
    });
  });
});
