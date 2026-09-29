import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './apiClient';
import { describeAuthError, fetchCurrentUser, login, restoreAuthSession, signup } from './authApi';

const BASE = { baseUrl: 'http://localhost:8080' };
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';
const USER = { id: 1, email: 'hunter@lostquest.test', nickname: '로스트헌터', role: 'USER', createdAt: '2026-09-29T00:00:00Z' };
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('auth API', () => {
  it('signs up with trimmed email/nickname, never sends a role, and whitelists the returned user', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ...USER, password: '$2a$10$hash' }, 201));
    vi.stubGlobal('fetch', fetchMock);
    const user = await signup({ email: ' hunter@lostquest.test ', password: ' pass word ', nickname: ' 로스트헌터 ' }, BASE);
    expect(user).toEqual({ id: 1, email: 'hunter@lostquest.test', nickname: '로스트헌터', role: 'USER' });
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toEqual({ email: 'hunter@lostquest.test', password: ' pass word ', nickname: '로스트헌터' });
  });

  it('logs in and returns the Bearer token with the user', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ accessToken: TOKEN, tokenType: 'Bearer', expiresIn: 3600, user: USER })));
    await expect(login('hunter@lostquest.test', 'Quest1234!', BASE)).resolves.toEqual({
      accessToken: TOKEN, expiresIn: 3600, user: { id: 1, email: USER.email, nickname: USER.nickname, role: 'USER' },
    });
  });

  it.each([
    { accessToken: TOKEN, tokenType: 'Basic', expiresIn: 3600, user: USER },
    { accessToken: '', tokenType: 'Bearer', expiresIn: 3600, user: USER },
    { accessToken: TOKEN, tokenType: 'Bearer', expiresIn: 0, user: USER },
    { accessToken: TOKEN, tokenType: 'Bearer', expiresIn: 3600, user: { ...USER, role: 'ROOT' } },
  ])('rejects an unexpected login response %#', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)));
    await expect(login('a@b.test', 'x', BASE)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('surfaces a 401 login failure without exposing which part was wrong', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 401, code: 'INVALID_CREDENTIALS', message: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)));
    const error = await login('a@b.test', 'wrong', BASE).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 401, serverCode: 'INVALID_CREDENTIALS' });
    expect(describeAuthError(error)).toBe('이메일 또는 비밀번호가 올바르지 않습니다.');
  });

  it('fetches the current user with the Bearer header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(USER));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchCurrentUser(TOKEN, BASE)).resolves.toMatchObject({ id: 1, role: 'USER' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8080/api/auth/me');
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
  });

  it('formats validation field errors for the form', () => {
    const error = new ApiClientError('HTTP_ERROR', '입력값을 확인해 주세요.', 400, {
      serverCode: 'VALIDATION_ERROR', fieldErrors: [{ field: 'email', message: '형식 오류' }, { field: 'passwordWithinBcryptLimit', message: '너무 길어요' }],
    });
    expect(describeAuthError(error)).toBe('이메일: 형식 오류\n비밀번호: 너무 길어요');
    expect(describeAuthError(new Error('boom'))).toBe('요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
  });
});

describe('restoring the session on app start', () => {
  const session = { accessToken: TOKEN, expiresAt: Date.now() + 60_000 };

  it('returns nothing and makes no request when no token is stored', async () => {
    const fetchUser = vi.fn();
    await expect(restoreAuthSession(() => null, fetchUser, vi.fn())).resolves.toBeNull();
    expect(fetchUser).not.toHaveBeenCalled();
  });

  it('confirms a stored token with /api/auth/me', async () => {
    const fetchUser = vi.fn().mockResolvedValue({ id: 1, email: USER.email, nickname: USER.nickname, role: 'USER' });
    const clear = vi.fn();
    await expect(restoreAuthSession(() => session, fetchUser, clear)).resolves.toEqual({ user: expect.objectContaining({ id: 1 }), expiresAt: session.expiresAt });
    expect(fetchUser).toHaveBeenCalledWith(TOKEN);
    expect(clear).not.toHaveBeenCalled();
  });

  it('removes a token the server rejects (invalid, tampered, or expired)', async () => {
    const clear = vi.fn();
    const rejected = vi.fn().mockRejectedValue(new ApiClientError('HTTP_ERROR', '인증 토큰이 유효하지 않거나 만료되었습니다.', 401, { serverCode: 'INVALID_TOKEN' }));
    await expect(restoreAuthSession(() => session, rejected, clear)).resolves.toBeNull();
    expect(clear).toHaveBeenCalledOnce();
  });

  it('keeps the token but stays signed out when the server is unreachable', async () => {
    const clear = vi.fn();
    const offline = vi.fn().mockRejectedValue(new ApiClientError('NETWORK_ERROR', 'offline'));
    await expect(restoreAuthSession(() => session, offline, clear)).resolves.toBeNull();
    expect(clear).not.toHaveBeenCalled();
  });
});
