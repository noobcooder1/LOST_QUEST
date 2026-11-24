// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetGoogleIdentityLoader, type GoogleCredentialResponse } from '../services/googleIdentity';
import GoogleSignInButton from './GoogleSignInButton';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  resetGoogleIdentityLoader();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount()); container.remove();
  document.head.querySelectorAll('script').forEach(script => script.remove());
  delete window.google; vi.unstubAllEnvs();
});
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

it('renders nothing when no Google client id is configured', async () => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
  await act(async () => root.render(<GoogleSignInButton mode="signin" onCredential={vi.fn()} />));
  expect(container.innerHTML).toBe('');
  expect(document.head.querySelector('script')).toBeNull();
});

it('draws Google\'s button for the configured client and passes the returned credential on', async () => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', ' lost-quest.apps.googleusercontent.com ');
  let callback: ((response: GoogleCredentialResponse) => void) | undefined;
  const initialize = vi.fn((config: { callback: (response: GoogleCredentialResponse) => void }) => { callback = config.callback; });
  const renderButton = vi.fn();
  window.google = { accounts: { id: { initialize, renderButton } } };
  const onCredential = vi.fn();

  await act(async () => root.render(<GoogleSignInButton mode="signup" onCredential={onCredential} />));
  await settle();

  expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ client_id: 'lost-quest.apps.googleusercontent.com', ux_mode: 'popup', auto_select: false, context: 'signup' }));
  expect(renderButton).toHaveBeenCalledWith(container.querySelector('.google-signin-slot'), expect.objectContaining({ text: 'signup_with', locale: 'ko' }));
  callback?.({});
  expect(onCredential).not.toHaveBeenCalled();
  callback?.({ credential: 'google-id-token' });
  expect(onCredential).toHaveBeenCalledWith('google-id-token');
});

it('loads the Google script once and explains when it cannot be loaded', async () => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'lost-quest.apps.googleusercontent.com');
  await act(async () => root.render(<GoogleSignInButton mode="signin" onCredential={vi.fn()} />));
  const scripts = document.head.querySelectorAll<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
  expect(scripts).toHaveLength(1);

  await act(async () => { scripts[0].dispatchEvent(new Event('error')); });
  await settle();

  expect(container.querySelector('[role="status"]')?.textContent).toContain('구글 로그인 버튼을 불러오지 못했어요');
  expect(document.head.querySelector('script')).toBeNull();
});

it('shows a disabled entry stub when Google is not configured', async () => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
  await act(async () => root.render(<GoogleSignInButton variant="entry" mode="signin" onCredential={vi.fn()} />));
  const button = container.querySelector<HTMLButtonElement>('.auth-entry-google');
  expect(button?.disabled).toBe(true);
  expect(button?.textContent).toContain('Google로 시작하기');
});

it('draws an entry-stack Google path with a rectangular GIS button', async () => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'lost-quest.apps.googleusercontent.com');
  const initialize = vi.fn();
  const renderButton = vi.fn();
  window.google = { accounts: { id: { initialize, renderButton } } };

  await act(async () => root.render(<GoogleSignInButton variant="entry" mode="signin" onCredential={vi.fn()} />));
  await settle();

  expect(container.querySelector('.auth-entry-google')?.textContent).toContain('Google로 시작하기');
  expect(renderButton).toHaveBeenCalledWith(
    container.querySelector('.google-signin-overlay'),
    expect.objectContaining({ shape: 'rectangular', text: 'signin_with' }),
  );
});
