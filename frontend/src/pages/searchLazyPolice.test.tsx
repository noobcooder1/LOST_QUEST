// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import SearchPage from './SearchPage';
import HomePage from './HomePage';
import { MatchNotificationProvider, useMatchNotifications } from '../context/MatchNotificationContext';
import { listServerItems } from '../services/itemApi';
import { getPoliceFilters, listPoliceItems, type PolicePage } from '../services/publicItemApi';
import { getUnreadCount, refreshMatchNotifications } from '../services/notificationApi';
import { ApiClientError } from '../services/apiClient';
import type { Item } from '../types';

const account = vi.hoisted(() => ({ user: null as null | { id: number } }));
vi.mock('../context/AppContext', () => ({ useApp: () => ({ authUser: account.user, profile: { name: '테스트', xp: 0 }, items: [] }) }));
vi.mock('../services/itemApi', async original => ({ ...await original<typeof import('../services/itemApi')>(), listServerItems: vi.fn() }));
vi.mock('../services/publicItemApi', async original => ({ ...await original<typeof import('../services/publicItemApi')>(), getPoliceFilters: vi.fn(), listPoliceItems: vi.fn() }));
vi.mock('../services/notificationApi', async original => ({ ...await original<typeof import('../services/notificationApi')>(), getUnreadCount: vi.fn(), refreshMatchNotifications: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const own: Item = { id: 'api-lost-1', title: '회원 지갑', type: 'lost', category: '지갑', color: '검정', date: '2026-10-12', region: '서울', location: '서울역', description: '', image: '/images/wallet.svg', source: 'community', createdBy: 'server', status: 'open' };
const police: Item = { ...own, id: 'police-lost-L2026101500000001', title: '경찰청 지갑', source: 'public', createdBy: 'police', region: '', date: '2026-10-01' };
const policeFound: Item = { ...police, id: 'police-found-F2026101500000001-1', type: 'found', title: '경찰청 습득 가방', category: '가방' };
const page = (type: 'lost' | 'found', title?: string): PolicePage => ({ items: [{ ...(type === 'lost' ? police : policeFound), ...(title ? { title } : {}) }], page: 1, size: 50, totalCount: 300, totalPages: 6, searchMode: 'DATE_RANGE' });
let root: Root, container: HTMLDivElement;
function Controls() {
  const location = useLocation(), { runRefresh } = useMatchNotifications();
  // Drive URL source changes independently of the global navigation, which is tested with Layout.
  const policeParams = new URLSearchParams(location.search);
  policeParams.set('source', 'public'); policeParams.set('type', 'lost');
  return <><output>{location.pathname}{location.search}</output><Link to="/search">기본 검색 이동</Link><Link data-testid="police-source-navigation" to={`/search?${policeParams}`}>경찰청 조회 이동</Link><Link to="/">홈 이동</Link><Link to="/mypage?tab=notifications">알림 화면 이동</Link><button onClick={() => void runRefresh()}>명시적 매칭 갱신</button></>;
}
beforeEach(() => {
  vi.resetAllMocks(); account.user = null;
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('crypto', webcrypto); vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080');
  vi.mocked(listServerItems).mockImplementation(async type => type === 'lost' ? [own] : []);
  vi.mocked(listPoliceItems).mockImplementation(async type => page(type));
  vi.mocked(getPoliceFilters).mockResolvedValue({ regions: [{ value: 'LCA000', name: '서울특별시' }], categories: [], colors: [{ value: 'CL1002', name: '검정' }] });
  vi.mocked(getUnreadCount).mockResolvedValue(2);
  vi.mocked(refreshMatchNotifications).mockResolvedValue({ checkedLostItems: 1, throttledLostItems: 0, created: 0, unreadCount: 2, sources: [] });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function flush() { for (let i = 0; i < 8; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); }
async function mount(path = '/search', strict = false) {
  const app = <MemoryRouter initialEntries={[path]}><MatchNotificationProvider><Routes><Route path="/" element={<HomePage />} /><Route path="/search" element={<SearchPage />} /><Route path="/mypage" element={<p>알림 화면</p>} /></Routes><Controls /></MatchNotificationProvider></MemoryRouter>;
  await act(async () => root.render(strict ? <StrictMode>{app}</StrictMode> : app)); await flush();
}
const sourceTabs = () => [...container.querySelectorAll<HTMLButtonElement>('.source-tabs > button')];
const policeNavigation = () => container.querySelector<HTMLAnchorElement>('[data-testid="police-source-navigation"]');
const backToCommunity = () => container.querySelector<HTMLButtonElement>('.search-back-community');
// Community mode: [내 물건 찾기, 주인 찾기]. Police mode: [분실물, 습득물].
const communityLostTab = () => sourceTabs().find(tab => tab.textContent?.startsWith('주인 찾기'))!;
const policeLostTab = () => sourceTabs().find(tab => tab.textContent?.startsWith('분실물'))!;
const policeFoundTab = () => sourceTabs().find(tab => tab.textContent?.startsWith('습득물'))!;
const cards = () => [...container.querySelectorAll('a.item-card')].map(card => card.textContent);
const statusRows = () => [...container.querySelectorAll('.public-list-status-grid > li')];
const moreButtons = () => [...container.querySelectorAll<HTMLButtonElement>('.catalog-load-more > button')];
async function click(element: HTMLElement) { expect(element).toBeTruthy(); await act(async () => element.click()); await flush(); }
async function openPolice() { await click(policeNavigation()!); }
async function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => { const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value); element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); }); await flush();
}
async function search(value: string) {
  await change(container.querySelector<HTMLInputElement>('input[aria-label="물품 이름 또는 특징 검색"]')!, value);
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await flush();
}
function expectNoPolice() { expect(listPoliceItems).not.toHaveBeenCalled(); expect(getPoliceFilters).not.toHaveBeenCalled(); expect(refreshMatchNotifications).not.toHaveBeenCalled(); }

describe('explicit police source loading', () => {
  it.each(['/search', '/search?source=all', '/search?source=community', '/search?source=unknown'])('defaults %s safely to LOST QUEST without police requests', async path => {
    await mount(path);
    expect(sourceTabs().map(tab => tab.textContent?.replace(/\d+$/, ''))).toEqual(['내 물건 찾기', '주인 찾기']);
    expect(sourceTabs().map(tab => tab.getAttribute('aria-pressed'))).toEqual(['true', 'true']);
    expect(container.querySelector('.search-police-entry')).toBeNull();
    expect(policeLostTab()).toBeUndefined(); expect(container.textContent).not.toContain('전체 물품');
    expect(cards()).toEqual([expect.stringContaining(own.title)]); expectNoPolice();
    expect(container.querySelector('select[aria-label="경찰청 지역"]')).toBeNull();
    expect(container.querySelector('select[aria-label="물품 유형"]')).not.toBeNull();
    expect(listServerItems).toHaveBeenCalledWith('lost'); expect(listServerItems).toHaveBeenCalledWith('found');
  });

  it('keeps searches, own filters and reset free of police requests', async () => {
    await mount('/search?pRegion=LCA000&pColor=CL1002'); await search('지갑');
    await change(container.querySelector<HTMLSelectElement>('select[aria-label="LOST QUEST 지역"]')!, '서울');
    await change(container.querySelector<HTMLSelectElement>('select[aria-label="LOST QUEST 카테고리"]')!, '지갑');
    await change(container.querySelector<HTMLInputElement>('input[aria-label="시작 날짜"]')!, '2026-10-01');
    expect(cards()).toHaveLength(1); expectNoPolice();
    await click([...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '초기화')!);
    expectNoPolice(); expect(communityLostTab().getAttribute('aria-pressed')).toBe('true');
  });

  it('starts list and code requests only when the police source URL is opened, with truthful loaded counts and source-specific controls', async () => {
    await mount(); expectNoPolice(); await openPolice();
    expect(getPoliceFilters).toHaveBeenCalledOnce(); expect(listPoliceItems).toHaveBeenCalledOnce();
    expect(listPoliceItems).toHaveBeenCalledWith('lost', expect.objectContaining({ page: 1, size: 50 }));
    expect(vi.mocked(listPoliceItems).mock.calls.some(([type]) => type === 'found')).toBe(false);
    expect(cards()).toEqual([expect.stringContaining(police.title)]); expect(policeLostTab().textContent).toContain('불러온 1건');
    expect(policeLostTab().textContent).not.toContain('300');
    expect(backToCommunity()?.textContent).toContain('LOST QUEST 검색');
    expect(container.querySelector('select[aria-label="LOST QUEST 지역"]')).toBeNull();
    expect(container.querySelector('select[aria-label="물품 유형"]')).toBeNull();
    expect(statusRows()).toHaveLength(1); expect(statusRows()[0].textContent).toContain('경찰청 분실물');
    expect(moreButtons()).toHaveLength(1); expect(moreButtons()[0].textContent).toBe('경찰청 분실물 더 보기');
    expect(moreButtons()[0].querySelector('svg.lucide-chevron-down')).not.toBeNull();
    await change(container.querySelector<HTMLSelectElement>('select[aria-label="경찰청 지역"]')!, 'LCA000');
    expect(listPoliceItems).toHaveBeenLastCalledWith('lost', expect.objectContaining({ region: 'LCA000' }));
    expect(getPoliceFilters).toHaveBeenCalledOnce();
  });

  it.each([
    ['/search?source=public', 'lost'],
    ['/search?source=public&type=lost', 'lost'],
    ['/search?source=public&type=unknown', 'lost'],
    ['/search?source=public&type=found', 'found'],
  ] as const)('shares only the selected StrictMode request for %s', async (path, type) => {
    await mount(path, true);
    expect(listPoliceItems).toHaveBeenCalledOnce(); expect(listPoliceItems).toHaveBeenCalledWith(type, { page: 1, size: 50 });
    expect(getPoliceFilters).toHaveBeenCalledOnce(); expect(cards()).toHaveLength(1);
    expect((type === 'lost' ? policeLostTab() : policeFoundTab()).getAttribute('aria-pressed')).toBe('true');
    expect(statusRows()).toHaveLength(1);
    expect(cards()[0]).toContain(type === 'lost' ? police.title : policeFound.title);
  });

  it('does not make police requests under StrictMode for the default source', async () => {
    await mount('/search', true); expectNoPolice(); expect(cards()).toHaveLength(1);
  });

  it('fetches the first 50 of both 경찰청 tabs in the background and opens them without a new request', async () => {
    await mount('/search'); expectNoPolice();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1300)); }); await flush();
    expect(listPoliceItems).toHaveBeenCalledTimes(2);
    expect(listPoliceItems).toHaveBeenCalledWith('lost', expect.objectContaining({ page: 1, size: 50 }));
    expect(listPoliceItems).toHaveBeenCalledWith('found', expect.objectContaining({ page: 1, size: 50 }));
    expect(getPoliceFilters).not.toHaveBeenCalled(); expect(refreshMatchNotifications).not.toHaveBeenCalled();
    expect(cards()).toEqual([expect.stringContaining(own.title)]);
    await openPolice(); expect(cards()).toEqual([expect.stringContaining(police.title)]);
    await click(policeFoundTab()); expect(cards()).toEqual([expect.stringContaining(policeFound.title)]);
    expect(listPoliceItems).toHaveBeenCalledTimes(2);
  });

  it('asks again when the background fetch failed', async () => {
    vi.mocked(listPoliceItems).mockRejectedValueOnce(new ApiClientError('HTTP_ERROR', '잠시 후 다시 시도해 주세요.', 500));
    await mount('/search');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1300)); }); await flush();
    expect(listPoliceItems).toHaveBeenCalledTimes(2);
    await openPolice();
    expect(listPoliceItems).toHaveBeenCalledTimes(3);
    expect(cards()).toEqual([expect.stringContaining(police.title)]);
  });

  it('applies only supported keyword filters after switching from own search', async () => {
    await mount('/search?q=지갑&region=부산&category=휴대폰&from=2026-10-14&to=2026-10-15&pRegion=LCA000&pColor=CL1002');
    expectNoPolice(); await openPolice();
    expect(listPoliceItems).toHaveBeenCalledWith('lost', { q: '지갑', page: 1, size: 50 });
    expect(vi.mocked(listPoliceItems).mock.calls.some(([type]) => type === 'found')).toBe(false);
    expect(cards()).toHaveLength(1); expect(container.querySelector<HTMLInputElement>('input[aria-label="시작 날짜"]')?.disabled).toBe(true);
    await search('가방'); expect(listPoliceItems).toHaveBeenLastCalledWith('lost', { q: '가방', page: 1, size: 50 });
    await click(policeFoundTab()); expect(listPoliceItems).toHaveBeenLastCalledWith('found', { q: '가방', page: 1, size: 50 });
    expect(cards()).toEqual([expect.stringContaining(policeFound.title)]);
    expect(getPoliceFilters).toHaveBeenCalledOnce();
  });

  it.each(['lost', 'found'] as const)('paginates only the selected %s type with its active filters', async type => {
    const next: Item = { ...(type === 'lost' ? police : policeFound), id: type === 'lost' ? 'police-lost-L2026101500000002' : 'police-found-F2026101500000002-1', title: '다음 페이지 물품' };
    vi.mocked(listPoliceItems).mockImplementation(async (requestedType, query) => ({ ...page(requestedType), items: query?.page === 2 ? [next] : page(requestedType).items, page: query?.page ?? 1 }));
    await mount(`/search?source=public&type=${type}&from=2026-10-01&to=2026-10-15&pRegion=LCA000`);
    expect(statusRows()).toHaveLength(1); expect(moreButtons()).toHaveLength(1);
    await click(moreButtons()[0]);
    expect(listPoliceItems).toHaveBeenLastCalledWith(type, { from: '2026-10-01', to: '2026-10-15', region: 'LCA000', page: 2, size: 50 });
    expect(vi.mocked(listPoliceItems).mock.calls.map(([requestedType]) => requestedType)).toEqual([type, type]);
    expect(cards()).toHaveLength(2); expect(cards()).toEqual(expect.arrayContaining([expect.stringContaining(next.title)]));
  });

  it('switches police types without mixing rows, status or pagination and preserves common filters', async () => {
    await mount('/search?source=public&from=2026-10-01&to=2026-10-15&pRegion=LCA000');
    await click(policeFoundTab());
    expect(listPoliceItems).toHaveBeenLastCalledWith('found', { from: '2026-10-01', to: '2026-10-15', region: 'LCA000', page: 1, size: 50 });
    expect(cards()).toEqual([expect.stringContaining(policeFound.title)]);
    expect(statusRows()).toHaveLength(1); expect(statusRows()[0].textContent).toContain('경찰청 습득물');
    expect(statusRows()[0].textContent).not.toContain('경찰청 분실물');
    expect(policeFoundTab().textContent).toContain('불러온 1건'); expect(policeLostTab().textContent).not.toContain('불러온');
    expect(moreButtons()).toHaveLength(1); expect(moreButtons()[0].textContent).toBe('경찰청 습득물 더 보기');
    expect(getPoliceFilters).toHaveBeenCalledOnce();
  });

  it('uses color only for found items and returns to LOST QUEST when leaving police mode', async () => {
    await mount('/search?source=public&type=found&pRegion=LCA000&pColor=CL1002');
    expect(listPoliceItems).toHaveBeenLastCalledWith('found', { region: 'LCA000', color: 'CL1002', page: 1, size: 50 });
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="경찰청 습득물 색상"]')?.value).toBe('CL1002');
    await click(policeLostTab());
    expect(listPoliceItems).toHaveBeenLastCalledWith('lost', { region: 'LCA000', page: 1, size: 50 });
    expect(container.querySelector('select[aria-label="경찰청 습득물 색상"]')).toBeNull();
    await click(policeFoundTab());
    expect(listPoliceItems).toHaveBeenLastCalledWith('found', { region: 'LCA000', color: 'CL1002', page: 1, size: 50 });
    await click(backToCommunity()!);
    expect(container.querySelector('output')?.textContent).toContain('source=community');
    expect(container.querySelector('output')?.textContent).not.toContain('type=');
    expect(container.querySelector('.search-police-entry')).toBeNull();
    expect(cards()).toEqual([expect.stringContaining(own.title)]);
  });
  it('names the LOST QUEST tabs from the visitor\'s side without a duplicate police entry', async () => {
    await mount('/search');
    expect(sourceTabs().map(tab => tab.textContent)).toEqual(['내 물건 찾기', '주인 찾기1']);
    expect(sourceTabs().map(tab => tab.getAttribute('aria-pressed'))).toEqual(['true', 'true']);
    expect(container.querySelector('.search-police-entry')).toBeNull();
    await click(sourceTabs()[0]);
    expect(container.querySelector('output')?.textContent).toBe('/search?source=community&type=found');
    expect(sourceTabs().map(tab => tab.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(cards()).toEqual([]);
    await click(sourceTabs()[1]);
    expect(container.querySelector('output')?.textContent).toBe('/search?source=community&type=lost');
    expect(cards()).toEqual([expect.stringContaining(own.title)]);
    expectNoPolice();
  });

  it('ignores a late first page after switching to the other police type', async () => {
    let finish!: (value: PolicePage) => void;
    vi.mocked(listPoliceItems).mockImplementation(async type => type === 'lost' ? new Promise(resolve => { finish = resolve; }) : page(type));
    await mount('/search?source=public');
    await click(policeFoundTab());
    expect(cards()).toEqual([expect.stringContaining(policeFound.title)]);
    await act(async () => finish(page('lost', '이전 잃어버린 물건 응답'))); await flush();
    expect(cards()).toEqual([expect.stringContaining(policeFound.title)]);
    expect(container.textContent).not.toContain('이전 잃어버린 물건 응답');
    expect(statusRows()).toHaveLength(1); expect(statusRows()[0].textContent).toContain('경찰청 습득물');
    expect(moreButtons()).toHaveLength(1); expect(moreButtons()[0].textContent).toBe('경찰청 습득물 더 보기');
  });

  it('shows loading and drops a late police response after returning to own search', async () => {
    let finish!: (value: PolicePage) => void;
    vi.mocked(listPoliceItems).mockImplementation(async type => type === 'lost' ? new Promise(resolve => { finish = resolve; }) : page(type));
    await mount(); await openPolice(); expect(container.textContent).toContain('공개 목록을 불러오고 있어요.');
    await click(backToCommunity()!); await search('회원'); expect(cards()).toHaveLength(1);
    await act(async () => finish(page('lost', '늦은 경찰청 결과'))); await flush();
    expect(cards()).toEqual([expect.stringContaining(own.title)]); expect(container.textContent).not.toContain('늦은 경찰청 결과');
    expect(container.querySelector('.public-list-status-grid')?.textContent).not.toContain('경찰청');
    expect(listPoliceItems).toHaveBeenCalledOnce();
  });

  it('joins the same pending request across fast police/own/police switches', async () => {
    let finish!: (value: PolicePage) => void;
    vi.mocked(listPoliceItems).mockImplementation(async type => type === 'lost' ? new Promise(resolve => { finish = resolve; }) : page(type));
    await mount(); await openPolice(); await click(backToCommunity()!); await openPolice();
    expect(vi.mocked(listPoliceItems).mock.calls.filter(([type]) => type === 'lost')).toHaveLength(1);
    expect(vi.mocked(listPoliceItems).mock.calls.some(([type]) => type === 'found')).toBe(false);
    await act(async () => finish(page('lost'))); await flush();
    expect(cards()).toEqual([expect.stringContaining(police.title)]); expect(getPoliceFilters).toHaveBeenCalledOnce();
  });

  it.each(['lost', 'found'] as const)('keeps the selected %s tab when clearing a police filter', async type => {
    await mount(`/search?source=public&type=${type}&pRegion=LCA000`);
    await click([...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '초기화')!);
    expect((type === 'lost' ? policeLostTab() : policeFoundTab()).getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('output')?.textContent).toContain('source=public');
    expect(listPoliceItems).toHaveBeenLastCalledWith(type, { page: 1, size: 50 });
    expect(vi.mocked(listPoliceItems).mock.calls.every(([requestedType]) => requestedType === type)).toBe(true);
  });

  it('keeps a police error inside the selected source', async () => {
    vi.mocked(listPoliceItems).mockRejectedValue(new ApiClientError('HTTP_ERROR', '경찰청 장애', 503));
    await mount(); expectNoPolice(); await openPolice();
    expect(container.textContent).toContain('서버 연결 불가'); await click(backToCommunity()!);
    expect(container.textContent).not.toContain('서버 연결 불가'); expect(cards()).toHaveLength(1);
  });
  it('explains a failed 경찰청 분실물 keyword search and clears the keyword back to the date listing', async () => {
    const outage = new ApiClientError('HTTP_ERROR', '경찰청 공공데이터 서버가 요청을 처리하지 못했습니다.', 502, { serverCode: 'EXTERNAL_API_ERROR' });
    let listingDown = true;  // the newest-listing fallback fails too, so the search-only notice shows
    vi.mocked(listPoliceItems).mockImplementation(async (type, query) => { if (type === 'lost' && (query?.q || listingDown)) throw outage; return page(type); });
    await mount('/search?source=public&type=lost&q=%EC%A7%80%EA%B0%91');
    expect(listPoliceItems).toHaveBeenCalledWith('lost', expect.objectContaining({ q: '지갑' }));
    listingDown = false;
    expect(container.textContent).toContain('검색 요청 실패');
    expect(container.textContent).toContain('경찰청 분실물 검색 요청을 처리하지 못했어요. 검색어를 지우고 날짜·지역·분류 조건으로 조회하거나 잠시 후 다시 시도해 주세요.');
    expect(container.textContent).not.toContain('서버 연결 불가');
    const clear = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '검색어 지우기')!;
    await click(clear);
    expect(container.querySelector('output')?.textContent).toBe('/search?source=public&type=lost');
    expect(container.querySelector<HTMLInputElement>('input[aria-label="물품 이름 또는 특징 검색"]')!.value).toBe('');
    expect(vi.mocked(listPoliceItems).mock.calls.at(-1)?.[1]).not.toHaveProperty('q');
    expect(cards()).toEqual([expect.stringContaining('경찰청 지갑')]);
    expect(container.textContent).not.toContain('검색 요청 실패');
  });
  it('keeps the general notices for other failures: network, 경찰청 습득물 keyword and a lost listing without a keyword', async () => {
    const outage = new ApiClientError('HTTP_ERROR', '경찰청 공공데이터 서버가 요청을 처리하지 못했습니다.', 502, { serverCode: 'EXTERNAL_API_ERROR' });
    const health = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', health);
    vi.mocked(listPoliceItems).mockRejectedValue(new ApiClientError('NETWORK_ERROR', '서버에 연결하지 못했어요.'));
    await mount('/search?source=public&type=lost&q=%EC%A7%80%EA%B0%91');
    expect(container.textContent).toContain('서버 연결 불가'); expect(container.textContent).not.toContain('검색어 지우기');
    expect(health).toHaveBeenCalledTimes(1);
    act(() => root.unmount()); root = createRoot(container);
    vi.mocked(listPoliceItems).mockRejectedValue(outage);
    await mount('/search?source=public&type=found&q=%EC%A7%80%EA%B0%91');
    expect(container.textContent).toContain('서버 연결 불가'); expect(container.textContent).not.toContain('검색어 지우기');
    act(() => root.unmount()); root = createRoot(container);
    await mount('/search?source=public&type=lost');
    expect(container.textContent).toContain('서버 연결 불가'); expect(container.textContent).not.toContain('검색어 지우기');
  });

  it('shows the search notice when the 경찰청 분실물 keyword request fails like a tunnel error but /api/health answers', async () => {
    const health = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'OK', service: 'LOST QUEST API' }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', health);
    let listingDown = true;
    vi.mocked(listPoliceItems).mockImplementation(async (type, query) => { if (type === 'lost' && (query?.q || listingDown)) throw new ApiClientError('NETWORK_ERROR', '서버에 연결하지 못했어요.'); return page(type); });
    await mount('/search?source=public&type=lost&q=%EC%A7%80%EA%B0%91');
    expect(health).toHaveBeenCalledTimes(1);
    expect(String(health.mock.calls[0][0])).toBe('http://localhost:8080/api/health');
    expect(container.textContent).toContain('검색 요청 실패');
    expect(container.textContent).toContain('경찰청 분실물 검색 요청을 처리하지 못했어요. 검색어를 지우고 날짜·지역·분류 조건으로 조회하거나 잠시 후 다시 시도해 주세요.');
    expect(container.textContent).not.toContain('서버 연결 불가');
    await flush();
    expect(health).toHaveBeenCalledTimes(1);
    listingDown = false;
    await click([...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '검색어 지우기')!);
    expect(container.querySelector('output')?.textContent).toBe('/search?source=public&type=lost');
    expect(cards()).toEqual([expect.stringContaining('경찰청 지갑')]);
    expect(health).toHaveBeenCalledTimes(1);
  });
  it('shows matches from the newest 경찰청 분실물 listing when the keyword search is down', async () => {
    const outage = new ApiClientError('HTTP_ERROR', '경찰청 공공데이터 서버가 요청을 처리하지 못했습니다.', 502, { serverCode: 'EXTERNAL_API_ERROR' });
    const listing: PolicePage = { ...page('lost'), items: [
      { ...police, id: 'police-lost-L1', title: '검정 반지갑' }, { ...police, id: 'police-lost-L2', title: '갤럭시 S23', category: '휴대폰' },
      { ...police, id: 'police-lost-L3', title: '카드', category: '지갑', description: '검정 가죽 지갑 안 카드' } ] };
    vi.mocked(listPoliceItems).mockImplementation(async (type, query) => { if (type === 'lost' && query?.q) throw outage; return type === 'lost' ? listing : page(type); });
    await mount('/search?source=public&type=lost&q=%EA%B2%80%EC%A0%95%20%EC%A7%80%EA%B0%91');
    expect(vi.mocked(listPoliceItems).mock.calls.filter(([type, query]) => type === 'lost' && !query?.q).map(([, query]) => query?.page)).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(cards()).toEqual([expect.stringContaining('검정 반지갑'), expect.stringContaining('카드')]);
    expect(container.textContent).toContain('최근 목록에서 찾음');
    expect(container.textContent).toContain('최근 접수된 분실물 3건 중 검색어 ‘검정 지갑’에 맞는 2건을 보여 드려요.');
    expect(container.textContent).not.toContain('검색어 지우기');
  });
  it('says so when the newest listing has no match for the keyword', async () => {
    vi.mocked(listPoliceItems).mockImplementation(async (type, query) => {
      if (type === 'lost' && query?.q) throw new ApiClientError('HTTP_ERROR', '경찰청 오류', 502, { serverCode: 'EXTERNAL_API_ERROR' });
      return page(type);
    });
    await mount('/search?source=public&type=lost&q=%EC%95%85%EA%B8%B0');
    expect(cards()).toEqual([]);
    expect(container.textContent).toContain('검색어 ‘악기’에 맞는 0건을 보여 드려요.');
  });
  it('keeps 서버 연결 불가 when /api/health also fails, and never checks health for 습득물 or a lost listing without a keyword', async () => {
    const health = vi.fn().mockResolvedValue(new Response('<html>502 Bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }));
    vi.stubGlobal('fetch', health);
    vi.mocked(listPoliceItems).mockRejectedValue(new ApiClientError('NETWORK_ERROR', '서버에 연결하지 못했어요.'));
    await mount('/search?source=public&type=lost&q=%EC%A7%80%EA%B0%91');
    expect(health).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('서버 연결 불가'); expect(container.textContent).not.toContain('검색어 지우기');
    act(() => root.unmount()); root = createRoot(container); health.mockClear();
    await mount('/search?source=public&type=found&q=%EC%A7%80%EA%B0%91');
    expect(container.textContent).toContain('서버 연결 불가'); expect(container.textContent).not.toContain('검색어 지우기');
    act(() => root.unmount()); root = createRoot(container);
    await mount('/search?source=public&type=lost');
    expect(container.textContent).toContain('서버 연결 불가'); expect(container.textContent).not.toContain('검색어 지우기');
    expect(health).not.toHaveBeenCalled();
  });

  it('does not run matching implicitly when a signed-in user opens home or LOST QUEST search', async () => {
    account.user = { id: 3 }; await mount('/', true); expectNoPolice();
    await click([...container.querySelectorAll<HTMLAnchorElement>('a')].find(link => link.textContent === '기본 검색 이동')!);
    expectNoPolice(); expect(getUnreadCount).toHaveBeenCalled();
    await search('지갑'); expectNoPolice();
    await click([...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '명시적 매칭 갱신')!);
    expect(refreshMatchNotifications).toHaveBeenCalledOnce();
  });

  it('preserves matching refresh when the user opens the notification view', async () => {
    account.user = { id: 3 }; await mount('/search'); expectNoPolice();
    await click([...container.querySelectorAll<HTMLAnchorElement>('a')].find(link => link.textContent === '알림 화면 이동')!);
    expect(refreshMatchNotifications).toHaveBeenCalledOnce();
  });
});
