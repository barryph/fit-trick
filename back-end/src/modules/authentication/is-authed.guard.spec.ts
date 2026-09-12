import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { IsAuthedGuard } from './is-authed.guard';
import { SessionExpiredError } from './authentication.errors';

describe('IsAuthedGuard', () => {
  const guard = new IsAuthedGuard();

  function createContext(
    isAuthenticated: boolean,
    sessionEnded?: string,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          isAuthenticated: () => isAuthenticated,
          sessionEnded,
        }),
      }),
    } as ExecutionContext;
  }

  it('allows authenticated requests', () => {
    expect(guard.canActivate(createContext(true))).toBe(true);
  });

  it('rejects unauthenticated requests', () => {
    expect(() => guard.canActivate(createContext(false))).toThrow(
      UnauthorizedException,
    );
  });

  it.each([['absolute-expired'], ['idle-expired'], ['not-found']])(
    'reports a session that ended (%s) as SESSION_EXPIRED',
    (reason) => {
      try {
        guard.canActivate(createContext(false, reason));
        throw new Error('expected the guard to reject the request');
      } catch (error) {
        expect(error).toBeInstanceOf(SessionExpiredError);
        expect((error as SessionExpiredError).code).toBe('SESSION_EXPIRED');
        expect((error as SessionExpiredError).httpStatus).toBe(401);
      }
    },
  );

  it('still allows a request that is authenticated despite a stale marker', () => {
    expect(guard.canActivate(createContext(true, 'idle-expired'))).toBe(true);
  });
});
