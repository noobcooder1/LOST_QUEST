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
vi.mock('../context/AppContext', () => ({ useApp: () => ({ authUser: account.user, profile: { name: '테스트', xp: 0 } }) }));
vi.mock('../services/itemApi', async original => ({ ...await original<typeof import('../services/itemApi')>(), listServerItems: vi.fn() }));
vi.mock('../services/publicItemApi', async original => ({ ...await original<typeof import('../services/publicItemApi')>(), getPoliceFilters: vi.fn(), listPoliceItems: vi.fn() }));
vi.mock('../services/notificationApi', async original => ({ ...await original<typeof import('../services/notificationApi')>(), getUnreadCount: vi.fn(), refreshMatchNotifications: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const own: Item = { id: 'api-lost-1', title: '회원 지갑', type: 'lost', category: '지갑', color: '검정', date: '2026-10-12', region: '서울', location: '서울역', description: '', image: '/images/wallet.svg', source: 'community', createdBy: 'server', status: 'open' };
const police: Item = { ...own, id: 'police-lost-L2026101500000001', title: '경찰청 지갑', source: 'public', createdBy: 'police', region: '', date: '2026-10-01' };
const page = (type: 'lost' | 'found', title = police.title): PolicePage => ({ items: type === 'lost' ? [{ ...police, title }] : [], page: 1, size: 50, totalCount: type === 'lost' ? 300 : 0, totalPages: type === 'lost' ? 6 : 0, searchMode: 'DATE_RANGE' });
let root: Root, container: HTMLDivElement;
function Controls() {
  const location = useLocation(), { runRefresh } = useMatchNotifications();
  return <><output>{location.pathname}{location.search}</output><Link to="/search">기본 검색 이동</Link><Link to="/">홈 이동</Link><Link to="/mypage?tab=notifications">알림 화면 이동</Link><button onClick={() => void runRefresh()}>명시적 매칭 갱신</button></>;
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
const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('.source-tabs > button')];
const cards = () => [...container.querySelectorAll('a.item-card')].map(card => card.textContent);
async function click(element: HTMLElement) { expect(element).toBeTruthy(); await act(async () => element.click()); await flush(); }
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
    await mount(path); expect(tabs()).toHaveLength(2); expect(tabs()[0].getAttribute('aria-pressed')).toBe('true');
    expect(tabs()[1].textContent).toBe('경찰청 공공데이터'); expect(container.textContent).not.toContain('전체 물품');
    expect(cards()).toEqual([expect.stringContaining(own.title)]); expectNoPolice();
    expect(container.querySelector('select[aria-label="경찰청 지역"]')).toBeNull();
    expect(listServerItems).toHaveBeenCalledWith('lost'); expect(listServerItems).toHaveBeenCalledWith('found');
  });

  it('keeps searches, own filters and reset free of police requests', async () => {
    await mount('/search?pRegion=LCA000&pColor=CL1002'); await search('지갑');
    await change(container.querySelector<HTMLSelectElement>('select[aria-label="LOST QUEST 지역"]')!, '서울');
    await change(container.querySelector<HTMLSelectElement>('select[aria-label="LOST QUEST 카테고리"]')!, '지갑');
    await change(container.querySelector<HTMLInputElement>('input[aria-label="시작 날짜"]')!, '2026-10-01');
    expect(cards()).toHaveLength(1); expectNoPolice();
    await click([...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '초기화')!);
    expectNoPolice(); expect(tabs()[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('starts list and code requests only when clicked, with truthful loaded counts and source-specific controls', async () => {
    await mount(); expectNoPolice(); await click(tabs()[1]);
    expect(getPoliceFilters).toHaveBeenCalledOnce(); expect(listPoliceItems).toHaveBeenCalledTimes(2);
    expect(listPoliceItems).toHaveBeenCalledWith('lost', expect.objectContaining({ page: 1, size: 50 }));
    expect(cards()).toEqual([expect.stringContaining(police.title)]); expect(tabs()[1].textContent).toContain('불러온 1건');
    expect(tabs()[1].textContent).not.toContain('300');
    expect(container.querySelector('select[aria-label="LOST QUEST 지역"]')).toBeNull();
    await change(container.querySelector<HTMLSelectElement>('select[aria-label="경찰청 지역"]')!, 'LCA000');
    expect(listPoliceItems).toHaveBeenLastCalledWith('found', expect.objectContaining({ region: 'LCA000' }));
    expect(getPoliceFilters).toHaveBeenCalledOnce();
  });

  it('shares StrictMode initial requests for a direct police URL', async () => {
    await mount('/search?source=public', true);
    expect(listPoliceItems).toHaveBeenCalledTimes(2); expect(getPoliceFilters).toHaveBeenCalledOnce(); expect(cards()).toHaveLength(1);
  });

  it('does not make police requests under StrictMode for the default source', async () => {
    await mount('/search', true); expectNoPolice(); expect(cards()).toHaveLength(1);
  });

  it('applies only supported keyword filters after switching from own search', async () => {
    await mount('/search?q=지갑&region=부산&category=휴대폰&from=2026-10-14&to=2026-10-15&pRegion=LCA000&pColor=CL1002');
    expectNoPolice(); await click(tabs()[1]);
    expect(listPoliceItems).toHaveBeenCalledWith('lost', { q: '지갑', page: 1, size: 50 });
    expect(listPoliceItems).toHaveBeenCalledWith('found', { q: '지갑', page: 1, size: 50 });
    expect(cards()).toHaveLength(1); expect(container.querySelector<HTMLInputElement>('input[aria-label="시작 날짜"]')?.disabled).toBe(true);
    await search('가방'); expect(listPoliceItems).toHaveBeenLastCalledWith('found', { q: '가방', page: 1, size: 50 });
    expect(getPoliceFilters).toHaveBeenCalledOnce();
  });

  it('shows loading and drops a late police response after returning to own search', async () => {
    let finish!: (value: PolicePage) => void;
    vi.mocked(listPoliceItems).mockImplementation(async type => type === 'lost' ? new Promise(resolve => { finish = resolve; }) : page(type));
    await mount(); await click(tabs()[1]); expect(container.textContent).toContain('공개 목록을 불러오고 있어요.');
    await click(tabs()[0]); await search('회원'); expect(cards()).toHaveLength(1);
    await act(async () => finish(page('lost', '늦은 경찰청 결과'))); await flush();
    expect(cards()).toEqual([expect.stringContaining(own.title)]); expect(container.textContent).not.toContain('늦은 경찰청 결과');
    expect(container.querySelector('.public-list-status-grid')?.textContent).not.toContain('경찰청');
    expect(listPoliceItems).toHaveBeenCalledTimes(2);
  });

  it('joins the same pending request across fast police/own/police switches', async () => {
    let finish!: (value: PolicePage) => void;
    vi.mocked(listPoliceItems).mockImplementation(async type => type === 'lost' ? new Promise(resolve => { finish = resolve; }) : page(type));
    await mount(); await click(tabs()[1]); await click(tabs()[0]); await click(tabs()[1]);
    // Found already completed and may be read again from the existing backend cache. The pending lost GET is shared.
    expect(vi.mocked(listPoliceItems).mock.calls.filter(([type]) => type === 'lost')).toHaveLength(1);
    await act(async () => finish(page('lost'))); await flush();
    expect(cards()).toEqual([expect.stringContaining(police.title)]); expect(getPoliceFilters).toHaveBeenCalledOnce();
  });

  it('keeps the current source when clearing a police filter', async () => {
    await mount('/search?source=public&pRegion=LCA000');
    await click([...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '초기화')!);
    expect(tabs()[1].getAttribute('aria-pressed')).toBe('true'); expect(container.querySelector('output')?.textContent).toContain('source=public');
    expect(listPoliceItems).toHaveBeenLastCalledWith('found', { page: 1, size: 50 });
  });

  it('keeps a police error inside the selected source', async () => {
    vi.mocked(listPoliceItems).mockRejectedValue(new ApiClientError('HTTP_ERROR', '경찰청 장애', 503));
    await mount(); expectNoPolice(); await click(tabs()[1]);
    expect(container.textContent).toContain('서버 연결 불가'); await click(tabs()[0]);
    expect(container.textContent).not.toContain('서버 연결 불가'); expect(cards()).toHaveLength(1);
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
