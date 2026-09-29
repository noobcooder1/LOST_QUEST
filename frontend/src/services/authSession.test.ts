import { describe, expect, it } from 'vitest';
import { AUTH_SESSION_KEY, clearAuthSession, loadAuthSession, saveAuthSession } from './authSession';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';

function memoryStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  };
}

describe('access token session storage', () => {
  it('stores the token with an absolute expiry and reads it back until it expires', () => {
    const store = memoryStore();
    const saved = saveAuthSession(TOKEN, 3600, store, 1_000);
    expect(saved).toEqual({ accessToken: TOKEN, expiresAt: 3_601_000 });
    expect(loadAuthSession(store, 2_000)).toEqual(saved);
    expect(loadAuthSession(store, 3_601_000)).toBeNull();
    expect(store.map.has(AUTH_SESSION_KEY)).toBe(false);
  });

  it.each([
    'not json',
    JSON.stringify({ accessToken: 'not-a-jwt', expiresAt: 9e15 }),
    JSON.stringify({ accessToken: TOKEN }),
    JSON.stringify({ accessToken: TOKEN, expiresAt: 'later' }),
  ])('discards malformed stored data: %s', (raw) => {
    const store = memoryStore({ [AUTH_SESSION_KEY]: raw });
    expect(loadAuthSession(store, 0)).toBeNull();
    expect(store.map.has(AUTH_SESSION_KEY)).toBe(false);
  });

  it('clears the session and tolerates blocked storage', () => {
    const store = memoryStore();
    saveAuthSession(TOKEN, 60, store);
    clearAuthSession(store);
    expect(store.map.size).toBe(0);
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    expect(() => saveAuthSession(TOKEN, 60, blocked)).not.toThrow();
    expect(loadAuthSession(blocked)).toBeNull();
    expect(() => clearAuthSession(blocked)).not.toThrow();
    expect(loadAuthSession(null)).toBeNull();
  });
});
