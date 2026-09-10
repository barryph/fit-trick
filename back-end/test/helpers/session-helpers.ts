import type { Response } from 'supertest';
import type { SessionAnchor } from '../../src/modules/authentication/session/session-policy';
import { getTestKnex } from './test-database';

export const SESSION_COOKIE_NAME = 'connect.sid';

export interface StoredSession {
  sid: string;
  expired: Date;
  sess: {
    cookie: {
      expires?: string;
      originalMaxAge?: number;
      httpOnly?: boolean;
      sameSite?: string | boolean;
      secure?: boolean;
      path?: string;
    };
    passport?: { user?: string };
    auth?: SessionAnchor;
    [key: string]: unknown;
  };
}

interface StoredSessionRow {
  sid: string;
  expired: Date;
  sess: unknown;
}

/** All rows in `user_sessions`. */
export async function getStoredSessions(): Promise<StoredSession[]> {
  const db = getTestKnex();
  const rows: unknown = await db('user_sessions').select(
    'sid',
    'expired',
    'sess',
  );
  if (!Array.isArray(rows)) {
    return [];
  }

  return (rows as StoredSessionRow[]).map((row): StoredSession => ({
    sid: row.sid,
    expired: row.expired,
    sess: toStoredSess(row.sess),
  }));
}

/**
 * Normalises a stored session record. `sess` is a json column, but drivers and
 * knex versions disagree on whether it arrives parsed or as text.
 */
function toStoredSess(value: unknown): StoredSession['sess'] {
  if (typeof value === 'string') {
    return toStoredSess(JSON.parse(value));
  }
  if (typeof value === 'object' && value !== null) {
    return value as StoredSession['sess'];
  }
  throw new Error('Unexpected session record shape');
}

/** The single session row of a test, failing loudly if there is not exactly one. */
export async function getOnlyStoredSession(): Promise<StoredSession> {
  const sessions = await getStoredSessions();
  expect(sessions).toHaveLength(1);
  return sessions[0];
}

/**
 * Applies a mutation to a stored session record. Used to simulate the passage
 * of time (or a revocation) without sleeping, by moving the stored anchor or
 * the granted window.
 */
export async function mutateStoredSession(
  sid: string,
  mutate: (session: StoredSession['sess']) => void,
): Promise<void> {
  const session = (await getStoredSessions()).find((row) => row.sid === sid);
  if (!session) {
    throw new Error(`No stored session for sid ${sid}`);
  }
  mutate(session.sess);
  const db = getTestKnex();
  await db('user_sessions')
    .where({ sid })
    .update({ sess: JSON.stringify(session.sess) });
}

/** Moves a stored session's rolling-renewal anchor into the past. */
export async function setStoredAnchor(
  sid: string,
  anchor: SessionAnchor,
): Promise<void> {
  await mutateStoredSession(sid, (session) => {
    session.auth = anchor;
  });
}

/** Moves a stored session's granted idle window into the past. */
export async function setStoredWindowExpiry(
  sid: string,
  expires: Date,
): Promise<void> {
  await mutateStoredSession(sid, (session) => {
    session.cookie.expires = expires.toISOString();
  });
}

/**
 * Asserts the standard shape of a session that ended: 401 with the
 * `SESSION_EXPIRED` code, so clients can tell "signed out / expired" apart
 * from "never signed in".
 */
export function expectSessionExpired(body: unknown): void {
  expect(body).toMatchObject({ error: { code: 'SESSION_EXPIRED' } });
}

/** The raw `connect.sid` cookie (name=value) issued by a response, if any. */
export function readSessionCookie(response: Response): string | undefined {
  const raw = sessionSetCookie(response);
  return raw?.split(';')[0];
}

/** The session id inside a `connect.sid` cookie value (`s:<sid>.<signature>`). */
export function readSessionId(cookie: string): string {
  const value = decodeURIComponent(
    cookie.slice(SESSION_COOKIE_NAME.length + 1),
  );
  return value.replace(/^s:/, '').split('.')[0];
}

/** Cookie attributes of the `Set-Cookie` header, keyed by lower-case name. */
export function parseSessionCookieAttributes(
  response: Response,
): Record<string, string | true> | undefined {
  const raw = sessionSetCookie(response);
  if (!raw) {
    return undefined;
  }

  const attributes: Record<string, string | true> = {};
  for (const part of raw.split(';').slice(1)) {
    const [name, ...rest] = part.trim().split('=');
    attributes[name.toLowerCase()] = rest.length ? rest.join('=') : true;
  }
  return attributes;
}

function sessionSetCookie(response: Response): string | undefined {
  const header = response.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(header)
    ? (header as string[])
    : typeof header === 'string'
      ? [header]
      : [];
  return cookies.find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`));
}
