import { apiClient } from '../api.client';
import { ErrorCode } from '../api.types';
import { setSessionExpiredHandler } from '@/lib/auth/session-expiry';

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

  it('notifies the auth layer when the session is gone', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ error: { statusCode: 401, message: 'Not authenticated' } }, 401),
    );

    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    try {
      const result = await apiClient.get('/activities');
      expect(result.error?.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(onExpired).toHaveBeenCalledTimes(1);
    } finally {
      setSessionExpiredHandler(null);
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
    setSessionExpiredHandler(onExpired);
    try {
      const result = await apiClient.post('/auth/login', {});
      expect(result.error?.code).toBe(ErrorCode.INVALID_CREDENTIALS);
      expect(onExpired).not.toHaveBeenCalled();
    } finally {
      setSessionExpiredHandler(null);
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
