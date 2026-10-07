// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchNotificationProvider } from '../context/MatchNotificationContext';
import MyPage from '../pages/MyPage';
import { clearAuthSession, saveAuthSession } from '../services/authSession';
import { REFRESH_POLICE_DOWN } from '../services/notificationApi.fixtures';
import type { Item } from '../types';
import MyItemList from './MyItemList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BASE = 'http://localhost:8080';
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIzIn0.c2lnbmF0dXJl';
const IMAGE = '/api/images/3f2c1c9e-8a5b-4f43-9d0a-5a1c3b7e9f10.png';

const DEMO_ITEM: Item = {
  id: 'lost-demo-mine', title: '브라우저 데모 지갑', type: 'lost', category: '지갑', color: '검정', date: '2026-09-01', region: '서울',
  location: '데모 장소', description: '브라우저에만 있는 체험용 물품입니다.', image: '/images/wallet.svg', source: 'community', status: 'open', createdBy: 'demo',
};
const baseApp = () => ({
  authUser: { id: 3 } as null | { id: number }, isLoggedIn: true, authChecking: false,
  items: [DEMO_ITEM] as Item[], requests: [], notifications: [],
  profile: { name: '나', xp: 320, returnedCount: 3, registeredCount: 1 },
  logout: vi.fn(), markNotificationsRead: vi.fn(), resetDemo: vi.fn(),
});
const app = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../context/AppContext', () => ({ useApp: () => app.value }));

const lost = (id: number, title: string, extra: Record<string, unknown> = {}) => ({
  id, userId: 3, title, category: '지갑', color: '검정', description: '겉면에 작은 스크래치가 있어요.',
  lostDate: '2026-09-16', region: '서울', location: '서울 성동구 서울숲역', imageUrl: null, status: 'LOST', createdAt: '2026-10-01T00:00:00Z', ...extra,
});
const found = (id: number, title: string, extra: Record<string, unknown> = {}) => ({
  id, userId: 3, title, category: '전자기기', color: '흰색', description: '충전 케이스와 함께 보관 중이에요.',
  foundDate: '2026-09-21', region: '경기', location: '경기 수원시 광교중앙역', imageUrl: null, status: 'STORED', createdAt: '2026-10-01T00:00:00Z', ...extra,
});
const MINE = { lostItems: [lost(15, '가장 최근 분실물'), lost(12, '오래된 분실물', { imageUrl: IMAGE })], foundItems: [found(7, '화이트 무선 이어폰')] };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
let handler: Handler;
let fetchMock: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: Root;

const defaultHandler: Handler = (url) => {
  if (url === `${BASE}/api/me/items`) return json(MINE);
  if (url === `${BASE}/api/notifications/refresh`) return json(REFRESH_POLICE_DOWN);
  if (url === `${BASE}/api/notifications/unread-count`) return json({ unreadCount: 0 });
  return json({ message: 'unexpected' }, 500);
};

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', BASE);
  saveAuthSession(TOKEN, 3600);
  app.value = baseApp();
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

async function settle() {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
async function renderList() {
  await act(async () => { root.render(<MemoryRouter><MyItemList /></MemoryRouter>); });
  await settle();
}
async function renderMyPage(path = '/mypage') {
  await act(async () => { root.render(<MemoryRouter initialEntries={[path]}><MatchNotificationProvider><MyPage /></MatchNotificationProvider></MemoryRouter>); });
  await settle();
}

const text = () => container.textContent ?? '';
const myItemCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/me/items'));
const cards = () => [...container.querySelectorAll('a.profile-item')];
const retryButton = () => [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('다시 시도'));

describe('MyItemList', () => {
  it('shows a loading state until the server answers', async () => {
    let release!: (response: Response) => void;
    handler = (url, init) => (url.endsWith('/api/me/items') ? new Promise<Response>((resolve) => { release = resolve; }) : defaultHandler(url, init));
    await renderList();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('등록 내역을 불러오고 있어요');
    expect(cards()).toHaveLength(0);
    expect(container.querySelector('#my-items-title span')).toBeNull();

    await act(async () => { release(json(MINE)); });
    await settle();
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(cards()).toHaveLength(3);
  });

  it('lists the server lost and found items in two groups with counts, badges and dates', async () => {
    await renderList();
    expect(container.querySelector('#my-items-title')?.textContent).toBe('내가 등록한 물품3');
    const groups = [...container.querySelectorAll('.my-item-group')];
    expect(groups.map((group) => group.querySelector('.my-item-group-title')?.textContent)).toEqual(['분실물 2', '습득물 1']);
    expect(groups[0].querySelector('ul')?.getAttribute('aria-label')).toBe('내 분실물 등록 내역');

    const [recent, old, earbuds] = cards();
    expect(recent.textContent).toContain('가장 최근 분실물');
    expect(recent.textContent).toContain('분실물');
    expect(recent.textContent).toContain('서울');
    expect(recent.textContent).toContain('분실 2026-09-16');
    expect(old.textContent).toContain('오래된 분실물');
    expect(earbuds.textContent).toContain('습득물');
    expect(earbuds.textContent).toContain('경기');
    expect(earbuds.textContent).toContain('습득 2026-09-21');
    // Server order is kept, and the server image / category illustration are used.
    expect(old.querySelector('img')?.getAttribute('src')).toBe(`${BASE}${IMAGE}`);
    expect(recent.querySelector('img')?.getAttribute('src')).toBe('/images/wallet.svg');
    expect(container.querySelector('a[href="/register?type=lost"]')).not.toBeNull();
  });

  it('links each card to the existing detail route with the server item id', async () => {
    await renderList();
    expect(cards().map((card) => card.getAttribute('href'))).toEqual(['/items/api-lost-15', '/items/api-lost-12', '/items/api-found-7']);
    expect(cards()[0].getAttribute('aria-label')).toBe('가장 최근 분실물 상세 보기');
  });

  it('requests only GET /api/me/items with the Bearer token and never a user id', async () => {
    await renderList();
    expect(myItemCalls()).toHaveLength(1);
    const [url, init] = myItemCalls()[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/me/items`);
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
  });

  it('hides a group that has no items', async () => {
    handler = (url, init) => (url.endsWith('/api/me/items') ? json({ lostItems: [lost(12, '내 분실물')], foundItems: [] }) : defaultHandler(url, init));
    await renderList();
    expect([...container.querySelectorAll('.my-item-group-title')].map((heading) => heading.textContent)).toEqual(['분실물 1']);
    expect(container.querySelector('#my-items-title')?.textContent).toBe('내가 등록한 물품1');
  });

  it('shows an empty state with the register buttons when nothing is registered', async () => {
    handler = (url, init) => (url.endsWith('/api/me/items') ? json({ lostItems: [], foundItems: [] }) : defaultHandler(url, init));
    await renderList();
    expect(text()).toContain('아직 등록한 물품이 없어요');
    expect(cards()).toHaveLength(0);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('.empty-state a[href="/register?type=lost"]')?.textContent).toContain('분실물 등록하기');
    expect(container.querySelector('.empty-state a[href="/register?type=found"]')?.textContent).toContain('습득물 등록하기');
    expect(container.querySelector('#my-items-title')?.textContent).toBe('내가 등록한 물품0');
  });

  it('shows an error with retry, never the demo items, and recovers on retry', async () => {
    handler = (url, init) => (url.endsWith('/api/me/items') ? json({ status: 500, code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' }, 500) : defaultHandler(url, init));
    await renderList();
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('등록 내역을 불러오지 못했어요');
    expect(alert?.textContent).toContain('서버 오류가 발생했습니다.');
    expect(cards()).toHaveLength(0);
    expect(text()).not.toContain('브라우저 데모 지갑');
    expect(text()).not.toContain('아직 등록한 물품이 없어요');

    handler = defaultHandler;
    await act(async () => { retryButton()!.click(); });
    await settle();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(cards()).toHaveLength(3);
    expect(myItemCalls()).toHaveLength(2);
  });

  it('explains an expired sign-in (401) and a connection failure as errors', async () => {
    handler = (url, init) => (url.endsWith('/api/me/items') ? json({ status: 401, code: 'INVALID_TOKEN', message: '인증 토큰이 유효하지 않거나 만료되었습니다.' }, 401) : defaultHandler(url, init));
    await renderList();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('로그인이 만료되었어요');

    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    await act(async () => { retryButton()!.click(); });
    await settle();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('서버에 연결하지 못했어요');
    expect(cards()).toHaveLength(0);
  });

  it('treats a malformed server answer as an error', async () => {
    handler = (url, init) => (url.endsWith('/api/me/items') ? json({ lostItems: 'nope' }) : defaultHandler(url, init));
    await renderList();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('예상한 물품 응답이 아니에요');
    expect(cards()).toHaveLength(0);
  });

  it('ignores an answer that arrives after the list was closed', async () => {
    let release!: (response: Response) => void;
    handler = (url, init) => (url.endsWith('/api/me/items') ? new Promise<Response>((resolve) => { release = resolve; }) : defaultHandler(url, init));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await renderList();
    await act(async () => { root.render(<MemoryRouter><p>다른 화면</p></MemoryRouter>); });
    await act(async () => { release(json(MINE)); });
    await settle();
    expect(text()).toBe('다른 화면');
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('MyPage 등록 내역 tab', () => {
  it('shows the server items and not the browser demo items', async () => {
    await renderMyPage('/mypage');
    expect(cards().map((card) => card.getAttribute('href'))).toEqual(['/items/api-lost-15', '/items/api-lost-12', '/items/api-found-7']);
    expect(text()).toContain('가장 최근 분실물');
    expect(text()).not.toContain('브라우저 데모 지갑');
    expect(myItemCalls()).toHaveLength(1);
  });

  it('does not fall back to the demo items when the server fails', async () => {
    handler = (url, init) => (url.endsWith('/api/me/items') ? json({ status: 503, code: 'SERVICE_UNAVAILABLE', message: '데이터베이스에 접근할 수 없습니다.' }, 503) : defaultHandler(url, init));
    await renderMyPage('/mypage');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('등록 내역을 불러오지 못했어요');
    expect(text()).not.toContain('브라우저 데모 지갑');
    expect(cards()).toHaveLength(0);
  });

  it('shows the empty state instead of the demo items when the server has none', async () => {
    handler = (url, init) => (url.endsWith('/api/me/items') ? json({ lostItems: [], foundItems: [] }) : defaultHandler(url, init));
    await renderMyPage('/mypage');
    expect(text()).toContain('아직 등록한 물품이 없어요');
    expect(text()).not.toContain('브라우저 데모 지갑');
  });

  it.each([
    ['badges', '친절의 발자국'],
    ['returns', '내 반환 요청'],
  ])('does not load the list on the %s tab, which keeps its demo content', async (tab, heading) => {
    await renderMyPage(`/mypage?tab=${tab}`);
    expect(myItemCalls()).toHaveLength(0);
    expect(text()).toContain(heading);
  });
});
