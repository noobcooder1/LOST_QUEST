// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
function Where() { return <output data-testid="where">{useLocation().pathname}</output>; }
async function render(path = '/') {
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}><Layout><p>본문</p></Layout><Where /></MemoryRouter>));
}
const where = () => container.querySelector('[data-testid="where"]')?.textContent;
const appBarTitle = () => container.querySelector('.app-bar-title')?.textContent;
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
    await act(async () => container.querySelector<HTMLAnchorElement>('.app-tabbar a[href="/search"]')!.click());
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

describe('app shell navigation', () => {
  beforeEach(() => { state.storageError = null; });
  const click = async (element: Element | null) => { expect(element).not.toBeNull(); await act(async () => (element as HTMLElement).click()); };

  it('shows the logo on home and the screen title with a menu button on other tab roots', async () => {
    await render('/');
    expect(container.querySelector('.app-bar a[aria-label="LOST QUEST 홈"]')).not.toBeNull();
    await click(container.querySelector('.app-tabbar a[href="/matches"]'));
    expect(appBarTitle()).toBe('매칭 추천');
    expect(container.querySelector('button[aria-label="뒤로 가기"]')).toBeNull();
    expect(container.querySelector('.app-tabbar a[href="/matches"]')?.classList.contains('active')).toBe(true);
  });

  it('goes back to the previous screen, or home when the screen was opened directly', async () => {
    await act(async () => root.render(<MemoryRouter initialEntries={['/search', '/items/api-found-1']} initialIndex={1}><Layout><p>본문</p></Layout><Where /></MemoryRouter>));
    expect(appBarTitle()).toBe('물품 상세');
    await click(container.querySelector('button[aria-label="뒤로 가기"]'));
    expect(where()).toBe('/search');
  });

  it('returns home from a directly opened detail screen', async () => {
    await render('/items/api-found-1');
    await click(container.querySelector('button[aria-label="뒤로 가기"]'));
    expect(where()).toBe('/');
  });

  it.each([
    ['/mypage/settings', '내 정보 수정'],
    ['/mypage/badges', '획득 업적'],
  ])('returns to MyPage when %s is opened directly', async (path, title) => {
    await render(path);
    expect(appBarTitle()).toBe(title);
    await click(container.querySelector('button[aria-label="뒤로 가기"]'));
    expect(where()).toBe('/mypage');
  });

  it('hides the tab bar on focused flows and keeps it elsewhere', async () => {
    await render('/login');
    expect(container.querySelector('.app-tabbar')).toBeNull();
    expect(appBarTitle()).toBe('로그인');
  });

  it('opens the full menu sheet, closes it with Escape, and closes it on navigation', async () => {
    await render('/');
    await click(container.querySelector('button[aria-label="전체 메뉴"]'));
    expect(container.querySelector('[role="dialog"][aria-label="전체 메뉴"]')).not.toBeNull();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await click(container.querySelector('button[aria-label="전체 메뉴"]'));
    await click(container.querySelector('.app-sheet-grid a[href="/guide"]'));
    expect(where()).toBe('/guide');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(appBarTitle()).toBe('이용 안내');
  });
});
