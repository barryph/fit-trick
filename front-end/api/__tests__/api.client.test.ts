import { apiClient } from '../api.client';
import { ErrorCode } from '../api.types';
import { onSessionExpired } from '@/lib/auth/session-expiry';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('apiClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns data on successful GET', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ data: { user: { id: '1', email: 'test@example.com' } } }),
    );

    const result = await apiClient.get<{ user: { id: string; email: string } }>(
      '/users/current',
    );

    expect(result.data?.user.email).toBe('test@example.com');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/users/current',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
      }),
    );
  });

  it('reports missing server configuration instead of a network error', async () => {
    // EXPO_PUBLIC_* values are inlined at bundle time, so a build created
    // without them can never connect. It must not tell the user to check their
    // connection.
    const original = process.env.EXPO_PUBLIC_SERVER_URL;
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_SERVER_URL;

    try {
      const { apiClient: unconfiguredClient } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../api.client') as typeof import('../api.client');
      const result = await unconfiguredClient.get('/activities');

      expect(result.error?.message).toMatch(/missing its server configuration/i);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.error?.code).toBe(ErrorCode.GENERIC_ERROR);
    } finally {
      process.env.EXPO_PUBLIC_SERVER_URL = original;
      jest.resetModules();
    }
  });

  it('notifies the auth layer when the session is gone', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ error: { statusCode: 401, message: 'Not authenticated' } }, 401),
    );

    const onExpired = jest.fn();
    const unsubscribe = onSessionExpired(onExpired);
    try {
      const result = await apiClient.get('/activities');
      expect(result.error?.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(onExpired).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it('does not end the session when a sign-in is rejected', async () => {
    mockFetch.mockReturnValue(
      jsonResponse(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Bad credentials' } },
        401,
      ),
    );

    const onExpired = jest.fn();
    const unsubscribe = onSessionExpired(onExpired);
    try {
      const result = await apiClient.post('/auth/login', {});
      expect(result.error?.code).toBe(ErrorCode.INVALID_CREDENTIALS);
      expect(onExpired).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it('surfaces a mapped error instead of rejecting on a non-JSON body', async () => {
    mockFetch.mockReturnValue(
      Promise.resolve({
        ok: false,
        status: 502,
        json: () => Promise.reject(new SyntaxError('Unexpected token <')),
      }),
    );

    const result = await apiClient.post('/auth/login', {});
    expect(result.error?.code).toBe(ErrorCode.GENERIC_ERROR);
  });

  it('returns mapped error when server returns error payload', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({
        error: { code: 'INVALID_CREDENTIALS', message: 'Bad credentials' },
      }),
    );

    const result = await apiClient.post('/auth/login', {
      email: 'bad@example.com',
      password: 'wrong',
    });

    expect(result.error?.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect(result.error?.message).toBe(
      'Invalid email or password, please try again.',
    );
  });

  it('reports a session the server ended and maps its message', async () => {
    const listener = jest.fn();
    const unsubscribe = onSessionExpired(listener);
    mockFetch.mockReturnValue(
      jsonResponse(
        {
          error: {
            code: 'SESSION_EXPIRED',
            message: 'Your session has ended. Please sign in again.',
          },
        },
        401,
      ),
    );

    try {
      const result = await apiClient.get('/activities');

      expect(result.error?.code).toBe(ErrorCode.SESSION_EXPIRED);
      expect(result.error?.message).toBe(
        'Your session has ended. Please sign in again.',
      );
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it('reports an ended session on a DELETE too', async () => {
    const listener = jest.fn();
    const unsubscribe = onSessionExpired(listener);
    mockFetch.mockReturnValue(
      jsonResponse({ error: { code: 'SESSION_EXPIRED', message: 'ended' } }, 401),
    );

    try {
      const result = await apiClient.delete('/activities/1');

      expect(result.error?.code).toBe(ErrorCode.SESSION_EXPIRED);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it('returns generic error on non-OK response without error payload', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ data: null }, 500),
    );

    const result = await apiClient.get('/activities');

    expect(result.error?.code).toBe(ErrorCode.GENERIC_ERROR);
  });

  it('returns undefined data on successful DELETE', async () => {
    mockFetch.mockReturnValue(
      Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve({}) }),
    );

    const result = await apiClient.delete('/auth/logout');

    expect(result.data).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('returns error on failed DELETE', async () => {
    mockFetch.mockReturnValue(
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }),
    );

    const result = await apiClient.delete('/auth/logout');

    expect(result.error?.code).toBe(ErrorCode.GENERIC_ERROR);
  });

  it('returns network error on fetch TypeError', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));

    const result = await apiClient.get('/activities');

    expect(result.error?.code).toBe(ErrorCode.NETWORK_ERROR);
    expect(result.error?.message).toBe(
      'Network error. Please check your connection.',
    );
    consoleSpy.mockRestore();
  });

  it('sends POST body as JSON', async () => {
    mockFetch.mockReturnValue(jsonResponse({ data: { activity: { id: 1 } } }));

    await apiClient.post('/activities', { name: 'Run', interval: 7 });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/activities',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Run', interval: 7 }),
      }),
    );
  });
});
