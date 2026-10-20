// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import App from '../App';
import { listServerItems, getServerItem } from '../services/itemApi';
import { listDiscussionPosts, type DiscussionPost } from '../services/communityApi';
import { getPoliceFilters, listPoliceItems } from '../services/publicItemApi';
import { ApiClientError } from '../services/apiClient';
import { todayInKorea } from '../services/dateTime';
import type { Item } from '../types';

const auth = vi.hoisted(() => ({ loggedIn: false }));
vi.mock('../context/AppContext', () => ({ useApp: () => ({ isLoggedIn: auth.loggedIn, authUser: auth.loggedIn ? { id: 7, role: 'USER' } : null,
  profile: { name: '검증 회원', xp: 0, returnedCount: 0, registeredCount: 0 }, storageError: null, requests: [], items: [], notifications: [] }) }));
vi.mock('../context/MatchNotificationContext', () => ({ useMatchNotifications: () => ({ unreadCount: 0, refresh: vi.fn() }) }));
vi.mock('../components/ApiHealthStatus', () => ({ default: () => null }));
vi.mock('../services/itemApi', async original => ({ ...await original<typeof import('../services/itemApi')>(), listServerItems: vi.fn(), getServerItem: vi.fn() }));
vi.mock('../services/publicItemApi', async original => ({ ...await original<typeof import('../services/publicItemApi')>(), getPoliceFilters: vi.fn(), listPoliceItems: vi.fn() }));
vi.mock('../services/communityApi', async original => ({ ...await original<typeof import('../services/communityApi')>(), listDiscussionPosts: vi.fn(), listCommunityQuestions: vi.fn(async () => ({ items: [], page: 0, hasNext: false })) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const post: DiscussionPost = { id: 1, category: 'info', title: '분실물 센터 이용 팁', content: '서울역 센터 방문 전에 준비할 것들을 공유해요.', authorNickname: '이웃', createdAt: '2026-10-20T01:00:00Z', imageUrl: null, linkedItem: null, commentCount: 0 };
const story: DiscussionPost = { ...post, id: 2, category: 'story', title: '도와주신 분께 감사드려요', linkedItem: { type: 'lost', id: 1, title: '검정 분실 지갑' } };
const lost: Item = { id: 'api-lost-1', title: '검정 분실 지갑', type: 'lost', category: '지갑', color: '검정', date: '2026-10-14', createdAt: '2026-10-12T01:00:00Z', region: '서울', location: '서울역', description: '안쪽에 작은 스티커', image: '/images/wallet.svg', source: 'community', status: 'open', createdBy: 'server', ownerId: 1, serverId: 1 };
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
async function mount(path = '/community') { await act(async () => root.render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>)); await settle(); }
const text = () => container.textContent ?? '';
const cards = () => [...container.querySelectorAll<HTMLAnchorElement>('a.community-post, a.item-card')];
const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(entry => entry.textContent === label)!;
async function click(element: HTMLElement) { expect(element).toBeTruthy(); await act(async () => element.click()); await settle(); }
async function fill(label: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); });
}
async function submit() { await act(async () => container.querySelector('form[role="search"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await settle(); }
beforeEach(() => {
  vi.clearAllMocks(); auth.loggedIn = false;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); vi.stubGlobal('indexedDB', undefined);
  vi.mocked(listDiscussionPosts).mockImplementation(async filters => ({ items: [story, post].filter(row => (!filters?.category || filters.category === row.category) && (!filters?.q || `${row.title} ${row.content}`.includes(filters.q))), page: filters?.page ?? 0, hasNext: false }));
  vi.mocked(listServerItems).mockImplementation(async type => type === 'lost' ? [lost] : []);
  vi.mocked(getServerItem).mockResolvedValue(lost);
  vi.mocked(getPoliceFilters).mockResolvedValue({ regions: [], categories: [], colors: [] });
  vi.mocked(listPoliceItems).mockResolvedValue({ items: [police], page: 1, size: 20, totalPages: 1, totalCount: 1, searchMode: 'DATE_RANGE' });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('separate community discussion board', () => {
  it('lists discussions without fetching item registrations or police data', async () => {
    await mount(); expect(container.querySelector('h1')?.textContent).toBe('일상의 이야기, 함께 나눠요.');
    expect(cards().map(card => card.querySelector('h3')?.textContent)).toEqual([story.title, post.title]);
    expect(listServerItems).not.toHaveBeenCalled(); expect(getPoliceFilters).not.toHaveBeenCalled(); expect(listPoliceItems).not.toHaveBeenCalled();
    expect(container.querySelector('a[href="/community/write"]')?.textContent).toContain('게시글 작성');
    expect(text()).toContain('글 작성은 로그인 후');
  });
  it('links discussions and related items separately without nested links', async () => {
    await mount(); expect(cards()[0].getAttribute('href')).toBe('/community/posts/2');
    const link = container.querySelector<HTMLAnchorElement>('.community-post-related a')!;
    expect(link.getAttribute('href')).toBe('/items/api-lost-1'); expect(link.textContent).toContain('물품글 보기');
    expect(container.querySelector('a a')).toBeNull(); expect(cards()[1].querySelector('img')).toBeNull();
    await click(link); expect(getServerItem).toHaveBeenCalledWith('lost', 1);
    expect(container.querySelector('a.detail-back')?.getAttribute('href')).toBe('/community/posts/2');
  });
  it('filters categories through URL state and resets pagination', async () => {
    await mount('/community?page=3'); await click(button('정보공유'));
    expect(button('정보공유').getAttribute('aria-pressed')).toBe('true'); expect(cards()).toHaveLength(1);
    expect(listDiscussionPosts).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'info', page: 0 }));
    expect(container.querySelector('output')?.textContent).toBe('/community?category=info');
    await click(button('전체')); expect(cards()).toHaveLength(2);
  });
  it('searches title and content with category preserved', async () => {
    await mount('/community?category=info'); await fill('게시글 검색어', '준비할'); await submit();
    expect(listDiscussionPosts).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'info', q: '준비할' }));
    expect(cards()).toHaveLength(1); expect(cards()[0].textContent).toContain(post.title);
  });
  it('applies custom dates and restores them from a deep link', async () => {
    await mount('/community?category=info&from=2026-10-01&to=2026-10-20');
    expect(container.querySelector<HTMLInputElement>('input[aria-label="작성 시작일"]')?.value).toBe('2026-10-01');
    await fill('작성 종료일', '2026-10-15'); await submit();
    expect(listDiscussionPosts).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-10-01', to: '2026-10-15', category: 'info' }));
  });
  it('rejects reversed dates without issuing another list request', async () => {
    await mount(); const calls = vi.mocked(listDiscussionPosts).mock.calls.length;
    await fill('작성 시작일', '2026-10-20'); await fill('작성 종료일', '2026-10-01'); await submit();
    expect(text()).toContain('시작일은 종료일보다 늦을 수 없어요.'); expect(listDiscussionPosts).toHaveBeenCalledTimes(calls);
  });
  it('offers Korean-calendar recent periods and resets all filters', async () => {
    await mount('/community?category=info&q=센터'); await click(button('최근 7일'));
    expect(listDiscussionPosts).toHaveBeenLastCalledWith(expect.objectContaining({ q: '센터', category: 'info', to: todayInKorea() }));
    const range = vi.mocked(listDiscussionPosts).mock.lastCall![0]!;
    expect((Date.parse(range.to!) - Date.parse(range.from!)) / 86400000).toBe(6);
    await click(button('초기화')); expect(container.querySelector('output')?.textContent).toBe('/community'); expect(cards()).toHaveLength(2);
  });
  it('paginates on the server while retaining filters', async () => {
    vi.mocked(listDiscussionPosts).mockImplementation(async filters => ({ items: [post], page: filters?.page ?? 0, hasNext: !filters?.page }));
    await mount('/community?category=info'); await click(button('다음'));
    expect(listDiscussionPosts).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, category: 'info' }));
    expect(button('다음').disabled).toBe(true); await click(button('이전'));
    expect(listDiscussionPosts).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0 }));
  });
  it('discards a response from the previous filter request', async () => {
    let resolveOld!: (value: Awaited<ReturnType<typeof listDiscussionPosts>>) => void;
    vi.mocked(listDiscussionPosts).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    await mount(); await click(button('정보공유')); expect(cards()).toHaveLength(1);
    await act(async () => resolveOld({ items: [story], page: 0, hasNext: false }));
    expect(cards()[0].textContent).toContain(post.title); expect(cards()[0].textContent).not.toContain(story.title);
  });
  it('shows an empty result and clears conditions', async () => {
    await mount('/community?category=chat&q=없는글'); expect(cards()).toHaveLength(0); expect(text()).toContain('조건에 맞는 게시글이 없어요.');
    await click(button('전체 게시글 보기')); expect(cards()).toHaveLength(2);
  });
  it('shows a discussion prompt when the new board has no posts', async () => {
    vi.mocked(listDiscussionPosts).mockResolvedValue({ items: [], page: 0, hasNext: false }); await mount();
    expect(text()).toContain('첫 번째 이야기를 기다리고 있어요.'); expect(text()).not.toContain('분실했거나 습득한 물건을 이웃에게');
  });
  it('handles loading and errors without an empty-board message, with retry', async () => {
    vi.mocked(listDiscussionPosts).mockImplementationOnce(() => new Promise(() => {})); await mount();
    expect(text()).toContain('게시글을 불러오고 있어요'); expect(text()).not.toContain('첫 번째 이야기를 기다리고');
    vi.mocked(listDiscussionPosts).mockRejectedValueOnce(new ApiClientError('NETWORK_ERROR', '연결 실패'));
    await click(button('정보공유')); expect(text()).toContain('연결 실패'); expect(text()).not.toContain('첫 번째 이야기를 기다리고');
    await click(button('다시 시도')); expect(cards()).toHaveLength(1);
  });
  it('opens the community writing gate and retains the dedicated login return path', async () => {
    await mount(); await click(container.querySelector<HTMLAnchorElement>('a[href="/community/write"]')!);
    // A lazy route can keep the previous board visible until its module has loaded.
    for (let i = 0; i < 200 && !container.querySelector('a[href="/login?returnTo=%2Fcommunity%2Fwrite"]'); i++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    }
    expect(container.querySelector('a[href="/login?returnTo=%2Fcommunity%2Fwrite"]')).not.toBeNull();
    expect(text()).not.toContain('어떤 물건을 잃어버리셨나요?');
  });
  it('titles the community screen in the app bar, reaches it from the full menu and keeps the register tab', async () => {
    auth.loggedIn = true; await mount();
    expect(container.querySelector('.app-bar-title')?.textContent).toBe('커뮤니티');
    expect(container.querySelector('.app-tabbar a[href="/register"]')).not.toBeNull();
    expect(text()).not.toContain('글 작성은 로그인 후');
    await click(container.querySelector<HTMLAnchorElement>('.app-tabbar a[href="/search"]')!);
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="전체 메뉴"]')!);
    const menuLink = container.querySelector<HTMLAnchorElement>('.app-sheet-grid a[href="/community"]')!;
    expect(menuLink.textContent).toContain('커뮤니티');
    await click(menuLink);
    expect(container.querySelector('.app-bar-title')?.textContent).toBe('커뮤니티');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
  it('keeps /search item results separate and police requests lazy', async () => {
    await mount('/search'); expect(listDiscussionPosts).not.toHaveBeenCalled(); expect(getPoliceFilters).not.toHaveBeenCalled();
    expect(container.querySelector('h1')?.textContent).toBe('당신의 소중한 물건, 함께 찾아볼까요?');
    await click(container.querySelectorAll<HTMLButtonElement>('.source-tabs > button')[1]);
    expect(getPoliceFilters).toHaveBeenCalledOnce(); expect(listPoliceItems).toHaveBeenCalledOnce(); expect(text()).toContain(police.title);
  });
  it('preserves legacy item-source links in search without mixing discussion posts', async () => {
    await mount('/search?source=community&type=lost&q=검정&category=지갑&region=서울&from=2026-10-01&to=2026-10-15');
    expect(cards()).toHaveLength(1); expect(cards()[0].textContent).toContain(lost.title); expect(listDiscussionPosts).not.toHaveBeenCalled();
  });
});
