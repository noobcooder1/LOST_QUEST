// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SearchPage from './SearchPage';
import type { Item } from '../types';
import { ApiClientError } from '../services/apiClient';
import { listServerItems } from '../services/itemApi';
import { getPoliceFilters, listPoliceItems } from '../services/publicItemApi';
import { readPublicList } from '../services/publicListCache';

vi.mock('../services/itemApi', async importOriginal => ({ ...await importOriginal<typeof import('../services/itemApi')>(), listServerItems: vi.fn() }));
vi.mock('../services/publicItemApi', async importOriginal => ({ ...await importOriginal<typeof import('../services/publicItemApi')>(), listPoliceItems: vi.fn(), getPoliceFilters: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const lost: Item = { id: 'api-lost-1', title: '검은 지갑', type: 'lost', category: '지갑', color: '검정', date: '2026-10-12', region: '서울', location: '서울역', description: '', image: '/images/wallet.svg', source: 'community', status: 'open', createdBy: 'server' };
const found: Item = { ...lost, id: 'api-found-1', type: 'found', title: '파란 가방', category: '가방' };
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('crypto', webcrypto);
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080');
  vi.mocked(listServerItems).mockImplementation(async type => type === 'lost' ? [lost] : [found]);
  vi.mocked(getPoliceFilters).mockResolvedValue({ regions: [], categories: [], colors: [] });
  vi.mocked(listPoliceItems).mockResolvedValue({ items: [], page: 1, size: 20, totalCount: 0, totalPages: 0, searchMode: 'DATE_RANGE' });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function settle() {
  for (let n = 0; n < 40; n += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    if (!container.textContent?.includes('공개 목록을 불러오고 있어요.') && !container.textContent?.includes('추가 페이지를 불러오고 있어요.')) return;
  }
  throw new Error('Public-list requests did not settle');
}
async function mount(path = '/search?source=community') {
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}><SearchPage /></MemoryRouter>));
  await settle();
}
async function revisit(path = '/search?source=community') {
  await act(async () => root.unmount()); root = createRoot(container); await mount(path);
}
function statuses() { return container.querySelector('.public-list-status-grid')!; }
async function reconnect() {
  const buttons = [...statuses().querySelectorAll<HTMLButtonElement>('button')];
  await act(async () => buttons.forEach(button => button.click()));
  await settle();
}
const disconnect = () => vi.mocked(listServerItems).mockRejectedValue(new ApiClientError('NETWORK_ERROR', '연결 실패'));

describe('public-list offline user flow', () => {
  it('runs the community board without any police requests and sorts by actual registration time', async () => {
    vi.mocked(listServerItems).mockImplementation(async type => type === 'lost' ? [
      { ...lost, id: 'api-lost-1', title: '먼저 등록한 지갑', date: '2026-10-13', createdAt: '2026-10-12T00:00:00Z' },
      { ...lost, id: 'api-lost-2', title: '나중에 등록한 지갑', date: '2026-10-01', createdAt: '2026-10-13T00:00:00Z' },
    ] : []);
    await mount('/search?source=community');
    expect(getPoliceFilters).not.toHaveBeenCalled(); expect(listPoliceItems).not.toHaveBeenCalled();
    expect([...container.querySelectorAll('.item-card h3')].map(entry => entry.textContent)).toEqual(['나중에 등록한 지갑', '먼저 등록한 지갑']);
    expect(container.querySelector('a[href="/community-inbox"]')).not.toBeNull();
  });
  it('loads live rows, reopens using IndexedDB summaries after disconnection, and restores live rows on retry', async () => {
    await mount();
    expect(statuses().textContent?.match(/최신 데이터/g)).toHaveLength(2);
    expect(container.querySelector('a.item-card')).not.toBeNull();
    disconnect();
    await revisit();
    expect(statuses().textContent?.match(/저장된 데이터/g)).toHaveLength(2);
    expect(statuses().textContent).toContain('최신 정보가 아닐 수');
    expect(statuses().textContent).toContain('마지막 동기화');
    expect(container.querySelectorAll('article.item-card')).toHaveLength(2);
    expect(container.querySelector('a.item-card')).toBeNull();
    vi.mocked(listServerItems).mockImplementation(async type => type === 'lost' ? [{ ...lost, title: '새로 동기화한 지갑' }] : []);
    await reconnect();
    expect(statuses().textContent).not.toContain('저장된 데이터');
    expect(statuses().textContent?.match(/최신 데이터/g)).toHaveLength(2);
    expect(container.textContent).toContain('새로 동기화한 지갑');
    expect(container.querySelectorAll('a.item-card')).toHaveLength(1);
  });

  it('shows an honest first-visit outage message without a registration prompt', async () => {
    disconnect(); await mount();
    expect(statuses().textContent?.match(/서버 연결 불가/g)).toHaveLength(2);
    expect(container.textContent).toContain('사용할 수 있는 저장 목록이 없어요');
    expect(container.querySelector('a[href="/register?type=lost"]')).toBeNull();
    expect(container.querySelector('.items-grid')).toBeNull();
  });

  it('continues filtering community snapshots by the selected query, category and type', async () => {
    await mount(); disconnect();
    await revisit('/search?source=community&q=지갑&category=지갑&type=lost');
    expect(container.querySelectorAll('article.item-card')).toHaveLength(1);
    expect(container.querySelector('article.item-card')?.textContent).toContain('검은 지갑');
    expect(statuses().textContent).not.toContain('LOST QUEST 습득물');
  });

  it('does not report a police-only outage as a community outage', async () => {
    vi.mocked(listPoliceItems).mockRejectedValue(new ApiClientError('HTTP_ERROR', '경찰청 장애', 502));
    await mount('/search');
    const rows = [...statuses().querySelectorAll('li')].map(row => row.textContent);
    expect(rows.filter(text => text?.includes('LOST QUEST')).every(text => text?.includes('최신 데이터'))).toBe(true);
    expect(rows.filter(text => text?.includes('경찰청')).every(text => text?.includes('서버 연결 불가'))).toBe(true);
    expect(container.querySelectorAll('a.item-card')).toHaveLength(2);
  });

  it('does not substitute saved records for an authorization failure', async () => {
    await mount();
    vi.mocked(listServerItems).mockRejectedValue(new ApiClientError('HTTP_ERROR', '권한 없음', 403));
    await revisit();
    expect(statuses().textContent?.match(/조회 요청 오류/g)).toHaveLength(2);
    expect(statuses().textContent).not.toContain('저장된 데이터');
    expect(container.querySelector('.items-grid')).toBeNull();
  });

  it('displays an online result when storage is disabled', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await mount();
    expect(container.querySelectorAll('a.item-card')).toHaveLength(2);
    expect(statuses().textContent).toContain('온라인 조회는 정상');
  });

  it('restores the previously loaded police page sequence and keeps query-specific snapshots apart', async () => {
    const first: Item = { ...lost, id: 'police-lost-L2026100500000001', source: 'public', createdBy: 'police' };
    const second: Item = { ...first, id: 'police-lost-L2026100500000002', title: '두 번째 지갑' };
    vi.mocked(listPoliceItems).mockImplementation(async (type, query) => ({ items: type === 'lost' ? [query?.page === 2 ? second : first] : [], page: query?.page ?? 1, size: 20, totalCount: type === 'lost' ? 2 : 0, totalPages: type === 'lost' ? 2 : 0, searchMode: 'KEYWORD' }));
    await mount('/search?source=public&q=지갑');
    const more = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '경찰청 분실물 더 보기');
    expect(more).toBeDefined();
    await act(async () => more!.click()); await settle();
    expect(container.querySelectorAll('a.item-card')).toHaveLength(2);
    vi.mocked(listPoliceItems).mockRejectedValue(new ApiClientError('TIMEOUT', '경찰청 응답 지연'));
    await revisit('/search?source=public&q=지갑');
    expect(container.querySelectorAll('article.item-card')).toHaveLength(2);
    expect([...container.querySelectorAll('button')].some(button => button.textContent?.includes('더 보기'))).toBe(false);
    await revisit('/search?source=public&q=가방');
    expect(container.querySelector('.items-grid')).toBeNull();
    expect(statuses().textContent).toContain('저장 목록이 없어요');
  });

  describe.each(['lost', 'found'] as const)('additional %s pages', type => {
    it.each([
      ['HTTP 400', new ApiClientError('HTTP_ERROR', 'HTTP 400', 400)],
      ['network error', new ApiClientError('NETWORK_ERROR', '연결 실패')],
      ['timeout', new ApiClientError('TIMEOUT', '응답 지연')],
    ])('keeps the live first page after %s, then retries the same page without duplicates', async (_name, error) => {
      const first: Item = { ...lost, type, id: type === 'lost' ? 'police-lost-L2026100500000001' : 'police-found-F2026100500000001-1', source: 'public', createdBy: 'police' };
      const second: Item = { ...first, id: type === 'lost' ? 'police-lost-L2026100500000002' : 'police-found-F2026100500000002-1', title: '추가 지갑' };
      let failing = true;
      vi.mocked(listPoliceItems).mockImplementation(async (requestedType, query) => {
        const page = query?.page ?? 1;
        if (requestedType === type && page === 2 && failing) throw error;
        return { items: requestedType !== type ? [] : page === 1 ? [first] : [first, second, second], page, size: 20, totalCount: 3, totalPages: requestedType === type ? 3 : 0, searchMode: 'KEYWORD' };
      });
      await mount(`/search?source=public&type=${type}&q=지갑`);
      const syncedAt = statuses().querySelector('time')?.dateTime;
      const more = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.endsWith('더 보기'))!;
      await act(async () => more.click()); await settle();
      expect(container.querySelectorAll('a.item-card')).toHaveLength(1);
      expect(container.querySelector('article.item-card')).toBeNull();
      expect(statuses().textContent).toContain('최신 데이터');
      expect(statuses().textContent).not.toContain('저장된 데이터');
      expect(statuses().textContent).toContain('2페이지를 불러오지 못했어요');
      expect(statuses().querySelector('time')?.dateTime).toBe(syncedAt);
      expect(more.disabled).toBe(true);
      const retry = [...statuses().querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('2페이지 다시 시도'))!;
      failing = false;
      await act(async () => retry.click()); await settle();
      expect(vi.mocked(listPoliceItems).mock.calls.filter(([requestedType]) => requestedType === type).map(([, query]) => query?.page)).toEqual([1, 2, 2]);
      expect(container.querySelectorAll('a.item-card')).toHaveLength(2);
      expect(statuses().textContent).not.toContain('2페이지를 불러오지 못했어요');
      expect([...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.endsWith('더 보기'))?.disabled).toBe(false);
    });
  });

  it.each(['success', 'failure'] as const)('ignores a late additional-page %s after the search condition changes', async outcome => {
    const first: Item = { ...lost, id: 'police-lost-L2026100500000001', source: 'public', createdBy: 'police' };
    const late: Item = { ...first, id: 'police-lost-L2026100500000002', title: '이전 조건 결과' };
    const current: Item = { ...first, id: 'police-lost-L2026100500000003', title: '새 검색 가방' };
    let resolveLate!: (value: Awaited<ReturnType<typeof listPoliceItems>>) => void;
    let rejectLate!: (cause: unknown) => void;
    vi.mocked(listPoliceItems).mockImplementation(async (type, query) => {
      if (type === 'lost' && query?.q === '지갑' && query.page === 2) return new Promise((resolve, reject) => { resolveLate = resolve; rejectLate = reject; });
      return { items: type === 'lost' ? [query?.q === '가방' ? current : first] : [], page: 1, size: 20, totalCount: 2, totalPages: type === 'lost' ? 2 : 0, searchMode: 'KEYWORD' };
    });
    await mount('/search?source=public&type=lost&q=지갑');
    const more = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.endsWith('더 보기'))!;
    await act(async () => more.click());
    expect(statuses().textContent).toContain('추가 페이지를 불러오고 있어요.');
    const input = container.querySelector<HTMLInputElement>('input[aria-label="물품 이름 또는 특징 검색"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '가방');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await settle();
    expect(container.querySelector('a.item-card')?.textContent).toContain('새 검색 가방');
    await act(async () => {
      if (outcome === 'success') resolveLate({ items: [late], page: 2, size: 20, totalCount: 2, totalPages: 2, searchMode: 'KEYWORD' });
      else rejectLate(new ApiClientError('NETWORK_ERROR', '이전 요청 실패'));
    });
    if (outcome === 'success') {
      let stored = false;
      for (let n = 0; n < 40; n += 1) {
        await act(async () => { stored = !!await readPublicList({ kind: 'policeLost', query: { q: '지갑' }, page: 2, size: 20 }); });
        if (stored) break;
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
      }
      expect(stored).toBe(true); // Wait until the stale successful response has fully finished cache saving.
    }
    expect(container.querySelectorAll('a.item-card')).toHaveLength(1);
    expect(container.querySelector('a.item-card')?.textContent).toContain('새 검색 가방');
    expect(statuses().textContent).not.toContain('2페이지를 불러오지 못했어요');
  });
});
