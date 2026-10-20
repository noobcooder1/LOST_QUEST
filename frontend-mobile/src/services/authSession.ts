/**
 * Access-token storage. sessionStorage keeps the token across reloads of the same tab but drops it
 * when the browser session ends. Never log the token or place it in a URL.
 */
export const AUTH_SESSION_KEY = 'lost-quest-auth-v1';
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export interface StoredAuthSession {
  accessToken: string;
  /** Epoch milliseconds, derived from the server's `expiresIn`. */
  expiresAt: number;
}

type SessionStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStore(): SessionStore | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function clearAuthSession(store: SessionStore | null = defaultStore()): void {
  try {
    store?.removeItem(AUTH_SESSION_KEY);
  } catch {
    // Storage may be blocked; there is nothing left to clear in that case.
  }
}

export function saveAuthSession(accessToken: string, expiresInSeconds: number, store: SessionStore | null = defaultStore(), now = Date.now()): StoredAuthSession {
  const session = { accessToken, expiresAt: now + expiresInSeconds * 1000 };
  try {
    store?.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Blocked storage: the login still works for this page view, it just will not survive a reload.
  }
  return session;
}

/** Returns a well-formed, unexpired session; anything else is removed. */
export function loadAuthSession(store: SessionStore | null = defaultStore(), now = Date.now()): StoredAuthSession | null {
  let raw: string | null;
  try {
    raw = store?.getItem(AUTH_SESSION_KEY) ?? null;
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object' && 'accessToken' in value && 'expiresAt' in value &&
        typeof value.accessToken === 'string' && value.accessToken.length <= 4096 && JWT_SHAPE.test(value.accessToken) &&
        typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt) && value.expiresAt > now) {
      return { accessToken: value.accessToken, expiresAt: value.expiresAt };
    }
  } catch {
    // Fall through: malformed data is discarded.
  }
  clearAuthSession(store);
  return null;
}
