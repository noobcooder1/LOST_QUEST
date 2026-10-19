// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Layout from './Layout';

const state = vi.hoisted(() => ({ storageError: null as string | null }));
vi.mock('../context/AppContext', () => ({ useApp: () => ({ isLoggedIn: false, profile: {}, storageError: state.storageError }) }));
vi.mock('../context/MatchNotificationContext', () => ({ useMatchNotifications: () => ({ unreadCount: 0 }) }));
vi.mock('./ApiHealthStatus', () => ({ default: () => null }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const connectionError = '서버에 연결하지 못했어요.';

beforeEach(() => {
  state.storageError = connectionError;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
async function render() {
  await act(async () => root.render(<MemoryRouter><Layout><p>본문</p></Layout></MemoryRouter>));
}
async function dismiss() {
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="오류 안내 닫기"]');
  expect(button).not.toBeNull();
  await act(async () => button!.click());
}

describe('dismissible layout error notice', () => {
  it('closes the notice and keeps it closed across page navigation without clearing the actual error', async () => {
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(connectionError);
    await dismiss();
    await act(async () => container.querySelector<HTMLAnchorElement>('.desktop-nav a[href="/search"]')!.click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(state.storageError).toBe(connectionError);
    expect(container.querySelector('main')?.textContent).toBe('본문');
  });

  it('shows a new error after dismissing the previous one', async () => {
    await render();
    await dismiss();
    state.storageError = '서버 응답 시간이 초과되었어요.';
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(state.storageError);
  });

  it('shows the same error again after connection recovery', async () => {
    await render();
    await dismiss();
    state.storageError = null;
    await render();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    state.storageError = connectionError;
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(connectionError);
  });
});
