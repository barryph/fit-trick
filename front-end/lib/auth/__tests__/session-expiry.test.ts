import {
  notifySessionExpired,
  onSessionExpired,
} from '@/lib/auth/session-expiry';

describe('session expiry notifications', () => {
  it('notifies every subscriber', () => {
    const first = jest.fn();
    const second = jest.fn();
    const unsubscribeFirst = onSessionExpired(first);
    const unsubscribeSecond = onSessionExpired(second);

    try {
      notifySessionExpired();

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribeFirst();
      unsubscribeSecond();
    }
  });

  it('stops notifying after unsubscribing', () => {
    const listener = jest.fn();
    onSessionExpired(listener)();

    notifySessionExpired();

    expect(listener).not.toHaveBeenCalled();
  });

  it('tolerates a listener that unsubscribes while being notified', () => {
    const listener = jest.fn();
    const unsubscribe = onSessionExpired(() => {
      unsubscribe();
      listener();
    });

    notifySessionExpired();
    notifySessionExpired();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('is safe to notify with no subscribers', () => {
    expect(() => notifySessionExpired()).not.toThrow();
  });
});
