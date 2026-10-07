// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchNotificationProvider } from '../context/MatchNotificationContext';
import { clearAuthSession, saveAuthSession } from '../services/authSession';
import { LIST, LQ_NOTIFICATION, REFRESH_POLICE_DOWN } from '../services/notificationApi.fixtures';
import Layout from './Layout';
import MatchNotificationList from './MatchNotificationList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BASE = 'http://localhost:8080';
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIzIn0.c2lnbmF0dXJl';
const app = vi.hoisted(() => ({
  value: { authUser: { id: 3 } as null | { id: number }, isLoggedIn: true, profile: { name: '주인' }, storageError: null },
}));
vi.mock('../context/AppContext', () => ({ useApp: () => app.value }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
type Handler = (url: string, init: RequestInit) => Response;
let handler: Handler;
let fetchMock: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: Root;

const defaultHandler: Handler = (url) => {
  if (url === `${BASE}/api/notifications/refresh`) return json(REFRESH_POLICE_DOWN);
  if (url === `${BASE}/api/notifications/unread-count`) return json({ unreadCount: 2 });
  if (url.startsWith(`${BASE}/api/notifications?`)) return json(LIST);
  if (url === `${BASE}/api/notifications/5/read`) return json({ ...LQ_NOTIFICATION, read: true, readAt: '2026-10-07T04:00:00Z' });
  if (url === `${BASE}/api/notifications/read-all`) return json({ unreadCount: 0 });
  if (url === `${BASE}/api/health`) return json({ status: 'OK', service: 'LOST QUEST API' });
  return json({ message: 'unexpected' }, 500);
};

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', BASE);
  saveAuthSession(TOKEN, 3600);
  app.value = { authUser: { id: 3 }, isLoggedIn: true, profile: { name: '주인' }, storageError: null };
  handler = defaultHandler;
  fetchMock = vi.fn().mockImplementation((url: string, init: RequestInit) => Promise.resolve(handler(url, init)));
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  clearAuthSession();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}{location.search}</p>;
}

async function settle() {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function renderList() {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/mypage?tab=notifications']}><MatchNotificationProvider><Routes>
      <Route path="/mypage" element={<MatchNotificationList />} />
      <Route path="*" element={<Where />} />
    </Routes></MatchNotificationProvider></MemoryRouter>);
  });
  await settle();
}

const items = () => [...container.querySelectorAll('ul.match-notifications > li')];
const text = () => container.textContent ?? '';
const calls = (fragment: string) => fetchMock.mock.calls.filter(([url]) => String(url).includes(fragment));

describe('MatchNotificationList', () => {
  it('shows server notifications with unread/read distinction, message, score and source', async () => {
    await renderList();
    expect(items()).toHaveLength(3);
    const [first, second, third] = items();
    expect(first.className).toContain('unread');
    expect(first.textContent).toContain('새 알림');
    expect(first.textContent).toContain('등록한 ‘검정 지갑’과 유사한 습득물이 발견되었습니다.');
    expect(first.textContent).toContain('매칭도 98점 · LOST QUEST');
    expect(second.textContent).toContain('매칭도 92점 · 경찰청');
    expect(third.className).not.toContain('unread');
    expect(third.textContent).not.toContain('새 알림');
    expect(third.textContent).toContain('읽음');
    expect(container.querySelector('#match-notification-title')?.textContent).toContain('2');
    expect(container.querySelector('ul.match-notifications')?.getAttribute('aria-label')).toBe('매칭 알림 목록');
    // The sign-in refresh ran; its 경찰청 failure is explained while LOST QUEST results stay.
    expect(calls('/api/notifications/refresh')).toHaveLength(1);
    expect(container.querySelector('.match-notification-status')?.textContent).toContain('경찰청 공공데이터는 확인하지 못했어요');
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    }
  });

  it('marks a notification read and opens the matched item when clicked', async () => {
    await renderList();
    const link = [...items()[0].querySelectorAll('a')].find((a) => a.textContent?.includes('습득물 자세히 보기'))!;
    expect(link.getAttribute('href')).toBe('/items/api-found-7');
    await act(async () => { link.click(); });
    await settle();
    expect(calls('/api/notifications/5/read')).toHaveLength(1);
    expect((calls('/api/notifications/5/read')[0][1] as RequestInit).method).toBe('POST');
    expect(container.querySelector('[data-testid="where"]')?.textContent).toBe('/items/api-found-7');
  });

  it('links a 경찰청 notification to the police detail and the matching page', async () => {
    await renderList();
    const links = [...items()[1].querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/items/police-found-F2026100600004521-1', '/matches?item=api-lost-12']);
  });

  it('marks everything read', async () => {
    await renderList();
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('모두 읽음'))!;
    await act(async () => { button.click(); });
    await settle();
    expect(calls('/api/notifications/read-all')).toHaveLength(1);
    expect(items().every((li) => !li.className.includes('unread'))).toBe(true);
    expect(container.querySelector('#match-notification-title')?.textContent).toContain('0');
  });

  it('shows an empty state', async () => {
    handler = (url, init) => (url.startsWith(`${BASE}/api/notifications?`) ? json({ notifications: [], unreadCount: 0 }) : defaultHandler(url, init));
    await renderList();
    expect(text()).toContain('아직 도착한 매칭 알림이 없어요');
  });

  it('shows an error with retry and never falls back to demo notifications', async () => {
    handler = (url, init) => (url.startsWith(`${BASE}/api/notifications?`) ? json({ status: 500, code: 'X', message: '서버 오류가 발생했습니다.' }, 500) : defaultHandler(url, init));
    await renderList();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('알림을 불러오지 못했어요');
    expect(items()).toHaveLength(0);
    expect(text()).not.toContain('LOST QUEST에 오신 것을 환영해요');
    handler = defaultHandler;
    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('다시 시도'))!;
    await act(async () => { retry.click(); });
    await settle();
    expect(items()).toHaveLength(3);
  });
});

describe('account switch on the same mounted list (A → B)', () => {
  const TOKEN_B = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0In0.c2lnbmF0dXJl';
  const B_NOTIFICATION = { ...LQ_NOTIFICATION, id: 40, lostItemId: 30, lostItemTitle: '파란 우산', foundItemId: 31, foundTitle: 'B의 습득물', score: 80 };
  const B_LIST = { notifications: [B_NOTIFICATION], unreadCount: 1 };
  const pendingA: Record<'list' | 'read' | 'readAll', ((response: Response) => void)[]> = { list: [], read: [], readAll: [] };
  const hold = (bucket: keyof typeof pendingA) => new Promise<Response>((resolve) => { pendingA[bucket].push(resolve); }) as unknown as Response;

  /** User A's chosen requests stay pending; User B is answered immediately. */
  function serve(holdA: { list?: boolean; read?: boolean; readAll?: boolean }) {
    pendingA.list = []; pendingA.read = []; pendingA.readAll = [];
    handler = (url, init) => {
      const isB = (init.headers as Record<string, string>).Authorization === `Bearer ${TOKEN_B}`;
      if (url.startsWith(`${BASE}/api/notifications?`)) return isB ? json(B_LIST) : holdA.list ? hold('list') : json(LIST);
      if (url.endsWith('/read-all')) return isB ? json({ unreadCount: 0 }) : holdA.readAll ? hold('readAll') : json({ unreadCount: 0 });
      if (url.endsWith('/read')) return isB ? json({ ...B_NOTIFICATION, read: true }) : holdA.read ? hold('read') : json({ ...LQ_NOTIFICATION, read: true });
      if (url.endsWith('/unread-count')) return json({ unreadCount: isB ? 1 : 2 });
      if (url.endsWith('/refresh')) return json({ ...REFRESH_POLICE_DOWN, created: 0, unreadCount: isB ? 1 : 2 });
      return defaultHandler(url, init);
    };
  }

  const section = () => container.querySelector('section.match-notification-section');
  const heading = () => container.querySelector('#match-notification-title')?.textContent;

  /** Same root, same tree: React updates the mounted Provider/List (like RTL rerender); only the user changes. */
  async function switchToB() {
    saveAuthSession(TOKEN_B, 3600);
    app.value = { ...app.value, authUser: { id: 4 } };
    await renderList();
  }

  function expectOnlyB() {
    expect(items()).toHaveLength(1);
    expect(items()[0].className).toContain('unread');
    expect(text()).toContain('B의 습득물');
    expect(text()).not.toContain('검정 지갑');
    expect(text()).not.toContain('검은 지갑 주웠어요');
    expect(heading()).toBe('매칭 알림 1');
    expect(container.querySelector('[data-testid="where"]')).toBeNull();
  }

  it("drops User A's late list response after switching to User B", async () => {
    serve({ list: true });
    await renderList();
    expect(pendingA.list.length).toBeGreaterThan(0); // the sign-in refresh triggers a second load, both pending
    expect(items()).toHaveLength(0);
    const mounted = section();

    await switchToB();
    expect(section()).toBe(mounted); // not remounted
    expectOnlyB();

    await act(async () => { pendingA.list.forEach((release) => release(json(LIST))); });
    await settle();
    expect(section()).toBe(mounted);
    expectOnlyB();
  });

  it("ignores User A's late mark-as-read response (no unread change, no navigation) after switching to User B", async () => {
    serve({ read: true });
    await renderList();
    expect(heading()).toBe('매칭 알림 2');
    const mounted = section();
    const link = [...items()[0].querySelectorAll('a')].find((a) => a.textContent?.includes('습득물 자세히 보기'))!;
    await act(async () => { link.click(); });
    expect(pendingA.read).toHaveLength(1);

    await switchToB();
    expect(section()).toBe(mounted);
    expectOnlyB();

    await act(async () => { pendingA.read[0](json({ ...LQ_NOTIFICATION, read: true, readAt: '2026-10-07T04:00:00Z' })); });
    await settle();
    expectOnlyB(); // still 1 unread, still on the list (A's item was not opened for B)
  });

  it("ignores User A's late read-all response after switching to User B", async () => {
    serve({ readAll: true });
    await renderList();
    const mounted = section();
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('모두 읽음'))!;
    await act(async () => { button.click(); });
    expect(pendingA.readAll).toHaveLength(1);

    await switchToB();
    expect(section()).toBe(mounted);
    expectOnlyB();

    await act(async () => { pendingA.readAll[0](json({ unreadCount: 0 })); });
    await settle();
    expectOnlyB(); // B's unread count stays 1 and B's notification stays unread
  });

  it('still opens the item when mark-as-read fails for the same user', async () => {
    serve({});
    handler = ((base) => (url: string, init: RequestInit) => (url.endsWith('/5/read') ? json({ status: 500, code: 'X', message: '오류' }, 500) : base(url, init)))(handler);
    await renderList();
    const link = [...items()[0].querySelectorAll('a')].find((a) => a.textContent?.includes('습득물 자세히 보기'))!;
    await act(async () => { link.click(); });
    await settle();
    expect(container.querySelector('[data-testid="where"]')?.textContent).toBe('/items/api-found-7');
  });
});

describe('header badge', () => {
  async function renderLayout() {
    await act(async () => {
      root.render(<MemoryRouter><MatchNotificationProvider><Layout><p>본문</p></Layout></MatchNotificationProvider></MemoryRouter>);
    });
    await settle();
  }

  it('shows the server unread count with an accessible label', async () => {
    await renderLayout();
    const bell = container.querySelector('a.notification-button')!;
    expect(bell.querySelector('.notification-badge')?.textContent).toBe('2');
    expect(bell.getAttribute('aria-label')).toBe('알림, 읽지 않은 매칭 알림 2개');
  });

  it('caps the badge at 99+', async () => {
    handler = (url, init) => (url.endsWith('/unread-count') ? json({ unreadCount: 150 })
      : url.endsWith('/refresh') ? json({ ...REFRESH_POLICE_DOWN, unreadCount: 150 }) : defaultHandler(url, init));
    await renderLayout();
    expect(container.querySelector('.notification-badge')?.textContent).toBe('99+');
  });

  it('shows no badge and calls nothing when signed out', async () => {
    app.value = { authUser: null, isLoggedIn: false, profile: { name: '손님' }, storageError: null };
    await renderLayout();
    expect(container.querySelector('.notification-badge')).toBeNull();
    expect(container.querySelector('a.notification-button')?.getAttribute('aria-label')).toBe('알림');
    expect(calls('/api/notifications')).toHaveLength(0);
  });
});
