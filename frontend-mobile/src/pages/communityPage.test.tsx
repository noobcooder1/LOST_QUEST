// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import App from '../App';
import { listServerItems, getServerItem } from '../services/itemApi';
import { getPoliceFilters, listPoliceItems } from '../services/publicItemApi';
import { ApiClientError } from '../services/apiClient';
import type { Item } from '../types';

const auth = vi.hoisted(() => ({ loggedIn: false }));
vi.mock('../context/AppContext', () => ({ useApp: () => ({ isLoggedIn: auth.loggedIn, authUser: auth.loggedIn ? { id: 7, role: 'USER' } : null,
  profile: { name: '검증 회원', xp: 0, returnedCount: 0, registeredCount: 0 }, storageError: null, requests: [], items: [], notifications: [] }) }));
vi.mock('../context/MatchNotificationContext', () => ({ useMatchNotifications: () => ({ unreadCount: 0, refresh: vi.fn() }) }));
vi.mock('../components/ApiHealthStatus', () => ({ default: () => null }));
vi.mock('../services/itemApi', async importOriginal => ({ ...await importOriginal<typeof import('../services/itemApi')>(), listServerItems: vi.fn(), getServerItem: vi.fn() }));
vi.mock('../services/publicItemApi', async importOriginal => ({ ...await importOriginal<typeof import('../services/publicItemApi')>(), getPoliceFilters: vi.fn(), listPoliceItems: vi.fn() }));
vi.mock('../services/communityApi', async importOriginal => ({ ...await importOriginal<typeof import('../services/communityApi')>(), listCommunityQuestions: vi.fn(async () => ({ items: [], page: 0, hasNext: false })) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lost: Item = { id: 'api-lost-1', title: '검정 분실 지갑', type: 'lost', category: '지갑', color: '검정', date: '2026-10-14', createdAt: '2026-10-12T01:00:00Z',
  region: '서울', location: '서울역', description: '안쪽에 작은 스티커', image: '/images/wallet.svg', source: 'community', status: 'open', createdBy: 'server', ownerId: 1, serverId: 1 };
const found: Item = { ...lost, id: 'api-found-2', title: '파란 습득 가방', type: 'found', category: '가방', color: '파랑', location: '수원역', createdAt: '2026-10-14T01:00:00Z', date: '2026-10-10' };
const police: Item = { ...lost, id: 'police-lost-X', title: '경찰청 전용 게시물', source: 'public', createdBy: 'police' };
let root: Root; let container: HTMLDivElement;
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
async function settle() {
  for (let i = 0; i < 200; i++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    if (i >= 2 && !container.textContent?.includes('화면을 준비하고 있어요.')) return;
  }
  throw new Error('라우트 화면 로딩이 끝나지 않았습니다.');
}
async function mount(path = '/community') {
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>));
  await settle();
}
const text = () => container.textContent ?? '';
const cards = () => [...container.querySelectorAll<HTMLAnchorElement>('a.community-post, a.item-card')];
const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(entry => entry.textContent === label)!;
async function click(element: HTMLElement) {
  expect(element).toBeTruthy();
  const href = element instanceof HTMLAnchorElement ? new URL(element.href) : null;
  await act(async () => element.click()); await settle();
  // React Router can retain the old screen while a lazy route module loads.
  if (href) {
    for (let i = 0; i < 200 && container.querySelector('output')?.textContent !== href.pathname + href.search; i++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    }
    expect(container.querySelector('output')?.textContent).toBe(href.pathname + href.search);
  }
}
beforeEach(() => {
  vi.clearAllMocks(); auth.loggedIn = false;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('indexedDB', undefined);
  vi.mocked(listServerItems).mockImplementation(async type => type === 'lost' ? [lost] : [found]);
  vi.mocked(getServerItem).mockResolvedValue(lost);
  vi.mocked(getPoliceFilters).mockResolvedValue({ regions: [], categories: [], colors: [] });
  vi.mocked(listPoliceItems).mockResolvedValue({ items: [police], page: 1, size: 20, totalPages: 1, totalCount: 1, searchMode: 'DATE_RANGE' });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('independent community page', () => {
  it('opens /community directly with distinct sharing, writing and private-inbox structure', async () => {
    await mount();
    expect(container.querySelector('h1')?.textContent).toBe('우리의 물건, 함께 찾아요.');
    expect(container.querySelector('output')?.textContent).toBe('/community');
    expect(container.querySelector('form[role="search"]')).not.toBeNull();
    expect(container.querySelector('a[href="/register"]')?.textContent).toContain('게시글 작성');
    expect(container.querySelector('a[href="/community-inbox"]')).not.toBeNull();
    expect(text()).toContain('목록은 누구나 볼 수 있어요');
  });
  it('renders newest registrations first without inventing chronology from event dates', async () => {
    await mount(); expect(cards().map(card => card.querySelector('h3')?.textContent)).toEqual([found.title, lost.title]);
    expect(getPoliceFilters).not.toHaveBeenCalled(); expect(listPoliceItems).not.toHaveBeenCalled();
  });
  it('excludes police records, hidden posts and closed posts even if returned in the list', async () => {
    vi.mocked(listServerItems).mockResolvedValue([lost, police, { ...found, hidden: true }, { ...lost, id: 'api-lost-9', title: '종료된 글', status: 'closed' }]);
    await mount(); expect(text()).not.toContain(police.title); expect(text()).not.toContain(found.title); expect(text()).not.toContain('종료된 글');
    expect(cards().every(card => card.textContent?.includes(lost.title))).toBe(true);
  });
  it('filters all/lost/found using URL state and links the existing type-specific registration', async () => {
    await mount(); await click(button('내 물건 찾기')); expect(cards()).toHaveLength(1); expect(cards()[0].textContent).toContain(lost.title);
    expect(button('내 물건 찾기').getAttribute('aria-pressed')).toBe('true'); expect(container.querySelector('a[href="/register?type=lost"]')).not.toBeNull();
    await click(button('주인 찾기')); expect(cards()).toHaveLength(1); expect(cards()[0].textContent).toContain(found.title);
    await click(button('전체 게시글')); expect(cards()).toHaveLength(2);
  });
  it('submits keyword search with the current type and restores matching results on a deep link', async () => {
    await mount('/community?type=found');
    const input = container.querySelector<HTMLInputElement>('input[aria-label="게시글 검색어"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '파란'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await settle(); expect(container.querySelector('output')?.textContent).toContain('type=found&q='); expect(cards()).toHaveLength(1);
    expect(cards()[0].getAttribute('href')).toBe('/items/api-found-2');
  });
  it('shows an empty state for no matches and can clear the conditions', async () => {
    await mount('/community?type=lost&q=없는물건'); expect(cards()).toHaveLength(0); expect(text()).toContain('조건에 맞는 게시글이 없어요.');
    await click(button('전체 게시글 보기')); expect(cards()).toHaveLength(2);
  });
  it('shows a first-registration prompt for an empty live board', async () => {
    vi.mocked(listServerItems).mockResolvedValue([]); await mount(); expect(text()).toContain('아직 등록된 게시글이 없어요.');
    expect(container.querySelector('a[href="/register"]')).not.toBeNull();
  });
  it('shows loading without a misleading empty-board message', async () => {
    vi.mocked(listServerItems).mockImplementation(() => new Promise(() => {})); await mount();
    expect(text()).toContain('게시글을 불러오고 있어요'); expect(text()).not.toContain('아직 등록된 게시글이 없어요');
  });
  it('keeps a successful source usable and retries only the failing source', async () => {
    vi.mocked(listServerItems).mockImplementation(async type => { if (type === 'lost') throw new ApiClientError('NETWORK_ERROR', '연결 실패'); return [found]; });
    await mount(); expect(text()).toContain('내 물건 찾기 게시글을 불러오지 못했어요.'); expect(cards()).toHaveLength(1);
    expect(text()).not.toContain('아직 등록된 게시글이 없어요');
    const foundCalls = vi.mocked(listServerItems).mock.calls.filter(([type]) => type === 'found').length;
    vi.mocked(listServerItems).mockImplementation(async type => type === 'lost' ? [lost] : [found]);
    await click(button('다시 시도')); expect(cards()).toHaveLength(2);
    expect(vi.mocked(listServerItems).mock.calls.filter(([type]) => type === 'found')).toHaveLength(foundCalls);
  });
  it('works for signed-in members without exposing ownership answers in the board', async () => {
    vi.mocked(listServerItems).mockImplementation(async type => type === 'lost' ? [{ ...lost, ownershipQuestion: '소유자 전용 확인 질문', secretAnswer: '숨겨야할 비공개 정답' }] : [found]);
    auth.loggedIn = true; await mount(); expect(cards()).toHaveLength(2);
    expect(text()).not.toContain('목록은 누구나 볼 수 있어요');
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="전체 메뉴"]')!);
    expect(container.querySelector('.app-sheet-profile')?.textContent).toContain('검증 회원');
    expect(text()).not.toContain('소유자 전용 확인 질문'); expect(text()).not.toContain('숨겨야할 비공개 정답');
  });
  it('uses existing registration authentication and preserves its return URL', async () => {
    await mount('/community?type=lost'); await click(container.querySelector<HTMLAnchorElement>('a[href="/register?type=lost"]')!);
    expect(text()).toContain('소중한 물건을 위한 첫걸음');
    expect(container.querySelector('a[href="/login?returnTo=%2Fregister%3Ftype%3Dlost"]')).not.toBeNull();
  });
  it('uses the private inbox login gate for visitors', async () => {
    await mount(); await click(container.querySelector<HTMLAnchorElement>('a[href="/community-inbox"]')!);
    expect(text()).toContain('로그인하면 본인이 주고받은 질문만 확인할 수 있어요.');
    expect(container.querySelector('a[href="/login?returnTo=%2Fcommunity-inbox"]')).not.toBeNull();
  });
  it('keeps detail, private-question login and a return link with the community filters', async () => {
    await mount('/community?type=lost&q=검정'); await click(cards()[0]);
    expect(getServerItem).toHaveBeenCalledWith('lost', 1); expect(text()).toContain('로그인 후 질문하기');
    const back = container.querySelector<HTMLAnchorElement>('a.detail-back')!;
    expect(back.getAttribute('href')).toBe('/community?type=lost&q=%EA%B2%80%EC%A0%95');
    await click(back); expect(button('내 물건 찾기').getAttribute('aria-pressed')).toBe('true'); expect(cards()).toHaveLength(1);
  });
  it('keeps /search separate from community and loads police results only after choosing that source', async () => {
    await mount('/search'); expect(getPoliceFilters).not.toHaveBeenCalled(); expect(listPoliceItems).not.toHaveBeenCalled();
    expect(text()).not.toContain(police.title); expect(container.querySelector('h1')?.textContent).toBe('당신의 소중한 물건, 함께 찾아볼까요?');
    await click(container.querySelectorAll<HTMLButtonElement>('.source-tabs > button')[1]);
    expect(getPoliceFilters).toHaveBeenCalledOnce(); expect(listPoliceItems).toHaveBeenCalledOnce();
    expect(listPoliceItems).toHaveBeenCalledWith('lost', expect.objectContaining({ page: 1, size: 50 }));
    expect(text()).toContain(police.title); expect(text()).not.toContain(lost.title);
  });
  it('preserves legacy community search conditions and requests no police data', async () => {
    await mount('/search?source=community&type=lost&q=검정&category=지갑&region=서울&from=2026-10-01&to=2026-10-15');
    expect(cards()).toHaveLength(1); expect(cards()[0].textContent).toContain(lost.title);
    expect(listPoliceItems).not.toHaveBeenCalled(); expect(getPoliceFilters).not.toHaveBeenCalled();
    expect(container.querySelector('output')?.textContent).toContain('source=community&type=lost');
  });
  it('titles the community screen in the app bar, reaches it from the full menu and preserves existing actions', async () => {
    await mount();
    expect(container.querySelector('.app-bar-title')?.textContent).toBe('커뮤니티');
    expect(container.querySelector('.app-tabbar a[href="/search"]')?.hasAttribute('aria-current')).toBe(false);
    expect(container.querySelector('a.notification-button')).not.toBeNull();
    expect(container.querySelector('.app-tabbar a[href="/register"]')).not.toBeNull();
    expect(container.querySelector('.app-tabbar a[href="/mypage"]')).not.toBeNull();
    await click(container.querySelector<HTMLAnchorElement>('.app-tabbar a[href="/search"]')!);
    expect(container.querySelector('.app-tabbar a[href="/search"]')?.getAttribute('aria-current')).toBe('page');
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="전체 메뉴"]')!);
    const menuLink = container.querySelector<HTMLAnchorElement>('.app-sheet-grid a[href="/community"]')!;
    expect(menuLink.textContent).toContain('커뮤니티');
    await click(menuLink);
    expect(container.querySelector('.app-bar-title')?.textContent).toBe('커뮤니티');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
