import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAuthSession } from './authSession';
import { changePassword, describeAuthError, updateNickname } from './authApi';
import { ApiClientError } from './apiClient';

vi.mock('./authSession', async original => ({ ...await original<typeof import('./authSession')>(), loadAuthSession: vi.fn() }));
const BASE = { baseUrl: 'http://localhost:8080' };
const USER = { id: 1, email: 'hunter@lostquest.test', nickname: '새이름', role: 'USER', createdAt: '2026-09-29T00:00:00Z' };
const jsonResponse = (body: unknown, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => { vi.mocked(loadAuthSession).mockReturnValue({ accessToken: 'test-only-token', expiresAt: Date.now() + 60_000 }); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('profile settings API', () => {
  it('sends a trimmed nickname with the session token and whitelists the returned user', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ...USER, password: '$2a$10$hash' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await updateNickname('  새이름  ', BASE)).toEqual({ id: 1, email: USER.email, nickname: '새이름', role: 'USER' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8080/api/auth/me/nickname');
    expect(init).toMatchObject({ method: 'PUT', body: JSON.stringify({ nickname: '새이름' }) });
    expect(init.headers.Authorization).toBe('Bearer test-only-token');
  });
  it('rejects blank or too long nicknames and missing sessions before any request', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(updateNickname('   ', BASE)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(updateNickname('가'.repeat(21), BASE)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    vi.mocked(loadAuthSession).mockReturnValue(null);
    await expect(updateNickname('이름', BASE)).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('changes the password with both values and reports a wrong current password as a form error', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ status: 400, code: 'VALIDATION_ERROR', message: '입력값을 확인해 주세요.', errors: [{ field: 'currentPassword', message: '현재 비밀번호가 올바르지 않습니다.' }] }, 400));
    vi.stubGlobal('fetch', fetchMock);
    await changePassword('Quest1234!', 'NewQuest5678!', BASE);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8080/api/auth/me/password');
    expect(init).toMatchObject({ method: 'PUT', body: JSON.stringify({ currentPassword: 'Quest1234!', newPassword: 'NewQuest5678!' }) });
    const error = await changePassword('Wrong1234!', 'NewQuest5678!', BASE).catch(cause => cause);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(describeAuthError(error)).toBe('현재 비밀번호: 현재 비밀번호가 올바르지 않습니다.');
    await expect(changePassword('', 'NewQuest5678!', BASE)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(changePassword('Quest1234!', 'short', BASE)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
