import { createHash } from 'node:crypto';
import { deletionThrottleTracker } from './deletion-request-throttler.guard';

describe('deletionThrottleTracker', () => {
  const clientKey = 'ip:203.0.113.7';
  const addressKey = (email: string) =>
    createHash('sha256').update(email).digest('hex').slice(0, 32);

  it('shards the key by client and normalised address', () => {
    expect(deletionThrottleTracker(clientKey, { email: 'a@example.com' })).toBe(
      `${clientKey}:${addressKey('a@example.com')}`,
    );
  });

  it('treats differently-cased and padded addresses as the same address', () => {
    const canonical = deletionThrottleTracker(clientKey, {
      email: 'a@example.com',
    });
    expect(
      deletionThrottleTracker(clientKey, { email: '  A@Example.COM ' }),
    ).toBe(canonical);
  });

  it('gives different clients different keys for the same address', () => {
    const first = deletionThrottleTracker('ip:1.1.1.1', {
      email: 'a@example.com',
    });
    const second = deletionThrottleTracker('ip:2.2.2.2', {
      email: 'a@example.com',
    });

    expect(first).not.toBe(second);
    // Each still carries the same address shard: a single client cannot exceed
    // its address budget by varying anything else in the request.
    expect(first.endsWith(addressKey('a@example.com'))).toBe(true);
    expect(second.endsWith(addressKey('a@example.com'))).toBe(true);
  });

  it('never puts the raw address in the key', () => {
    const key = deletionThrottleTracker(clientKey, {
      email: 'victim@example.com',
    });
    expect(key).not.toContain('victim');
    expect(key).not.toContain('example.com');
  });

  it('falls back to the client key for every unusable body', () => {
    const unusableBodies: unknown[] = [
      undefined,
      null,
      'email=a@example.com',
      { something: 'else' },
      { email: 42 },
      { email: '   ' },
    ];

    for (const body of unusableBodies) {
      expect(deletionThrottleTracker(clientKey, body)).toBe(clientKey);
    }
  });
});
