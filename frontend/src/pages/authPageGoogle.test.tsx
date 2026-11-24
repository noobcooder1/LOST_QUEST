// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiClientError } from '../services/apiClient';
import AuthPage from './AuthPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const app = vi.hoisted(() => ({ loginWithGoogle: vi.fn(), login: vi.fn(), signup: vi.fn() }));
vi.mock('../context/AppContext', () => ({ useApp: () => ({ ...app, isLoggedIn: false, profile: { name: '회원' }, authUser: null }) }));
// Stands in for Google's iframe button: clicking it is a completed Google popup.
vi.mock('../components/GoogleSignInButton', () => ({
  default: ({ onCredential, disabled }: { onCredential: (credential: string) => void; disabled?: boolean }) =>
    <button type="button" className="fake-google" disabled={disabled} onClick={() => onCredential('google-id-token')}>Google</button>,
}));

let container: HTMLDivElement; let root: Root;
beforeEach(async () => {
  app.loginWithGoogle.mockReset();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root.render(<MemoryRouter initialEntries={['/login?returnTo=%2Fmatches']}><Routes>
    <Route path="/login" element={<AuthPage />} />
    <Route path="/matches" element={<p className="landed">매칭 화면</p>} />
  </Routes></MemoryRouter>));
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

const click = (selector: string) => act(async () => { container.querySelector<HTMLButtonElement>(selector)!.click(); });
async function enter(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}
const submit = () => act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
const alertText = () => container.querySelector('[role="alert"]')?.textContent ?? '';

it('signs in with Google and returns to the requested page', async () => {
  app.loginWithGoogle.mockResolvedValue('SIGNED_IN');
  await click('.fake-google');
  expect(app.loginWithGoogle).toHaveBeenCalledWith('google-id-token', undefined);
  expect(container.querySelector('.landed')?.textContent).toBe('매칭 화면');
});

it('asks for an email when Google gave none, then finishes signup with the same credential', async () => {
  app.loginWithGoogle.mockResolvedValueOnce('EMAIL_REQUIRED').mockResolvedValueOnce('SIGNED_IN');
  await click('.fake-google');
  expect(container.querySelector('#auth-google-email')).not.toBeNull();
  expect(container.querySelector('#auth-password')).toBeNull();

  await submit();
  expect(alertText()).toContain('이메일을 입력해 주세요');
  await enter('#auth-google-email', 'da@ee'); await submit();
  expect(alertText()).toContain('도메인과 확장자');
  expect(app.loginWithGoogle).toHaveBeenCalledTimes(1);

  await enter('#auth-google-email', 'hunter@example.com'); await submit();
  expect(app.loginWithGoogle).toHaveBeenLastCalledWith('google-id-token', 'hunter@example.com');
  expect(container.querySelector('.landed')).not.toBeNull();
});

it('keeps the email step open when the entered email is already registered', async () => {
  app.loginWithGoogle.mockResolvedValueOnce('EMAIL_REQUIRED')
    .mockRejectedValueOnce(new ApiClientError('HTTP_ERROR', '이미 가입된 이메일이에요. 기존 계정은 이메일과 비밀번호로 로그인해 주세요.', 409, { serverCode: 'EMAIL_ALREADY_EXISTS' }));
  await click('.fake-google');
  await enter('#auth-google-email', 'hunter@example.com'); await submit();
  expect(alertText()).toContain('이미 가입된 이메일이에요');
  expect(container.querySelector('#auth-google-email')).not.toBeNull();
});

it('goes back to the login entry paths when the Google token is rejected or the user cancels', async () => {
  app.loginWithGoogle.mockResolvedValueOnce('EMAIL_REQUIRED')
    .mockRejectedValueOnce(new ApiClientError('HTTP_ERROR', '구글 로그인 정보를 확인하지 못했어요. 다시 시도해 주세요.', 401, { serverCode: 'INVALID_SOCIAL_TOKEN' }));
  await click('.fake-google');
  await enter('#auth-google-email', 'hunter@example.com'); await submit();
  expect(container.querySelector('#auth-google-email')).toBeNull();
  expect(container.querySelector('.fake-google')).not.toBeNull();
  expect(container.querySelector('.auth-entry-kakao')).not.toBeNull();
  expect(alertText()).toContain('구글 로그인 정보를 확인하지 못했어요');

  app.loginWithGoogle.mockResolvedValueOnce('EMAIL_REQUIRED');
  await click('.fake-google');
  await click('.auth-google-email button[type="button"]');
  expect(container.querySelector('#auth-google-email')).toBeNull();
  expect(container.querySelector('.fake-google')).not.toBeNull();
});

it('reveals the email and password form from 일반 로그인', async () => {
  expect(container.querySelector('#auth-password')).toBeNull();
  await click('.auth-entry-general');
  expect(container.querySelector('#auth-password')).not.toBeNull();
  expect(container.querySelector('.auth-entry-kakao')).toBeNull();
});
