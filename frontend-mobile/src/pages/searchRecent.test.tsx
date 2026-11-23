// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SearchPage from './SearchPage';
import type { Item } from '../types';
import { listServerItems } from '../services/itemApi';
import { getPoliceFilters, listPoliceItems } from '../services/publicItemApi';
import { RECENT_SEARCHES_KEY } from '../services/recentSearches';

vi.mock('../services/itemApi', async importOriginal => ({ ...await importOriginal<typeof import('../services/itemApi')>(), listServerItems: vi.fn() }));
vi.mock('../services/publicItemApi', async importOriginal => ({ ...await importOriginal<typeof import('../services/publicItemApi')>(), listPoliceItems: vi.fn(), getPoliceFilters: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lost: Item = { id: 'api-lost-1', title: '검은 지갑', type: 'lost', category: '지갑', color: '검정', date: '2026-10-12', region: '서울', location: '서울역', description: '', image: '/images/wallet.svg', source: 'community', status: 'open', createdBy: 'server' };
const found: Item = { ...lost, id: 'api-found-1', type: 'found', title: '파란 가방', category: '가방' };

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('crypto', webcrypto);
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080');
  vi.mocked(listServerItems).mockImplementation(async type => type === 'lost' ? [lost] : [found]);
  vi.mocked(getPoliceFilters).mockResolvedValue({ regions: [], categories: [], colors: [] });
  vi.mocked(listPoliceItems).mockResolvedValue({ items: [], page: 1, size: 20, totalCount: 0, totalPages: 0, searchMode: 'DATE_RANGE' });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function waitFor(ready: () => boolean, message: string) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    let complete = false;
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      complete = ready();
    });
    if (complete) return;
  }
  throw new Error(message);
}

async function settle() {
  await waitFor(() => !container.textContent?.includes('공개 목록을 불러오고 있어요.'), 'Public-list requests did not settle');
}

async function mount(path = '/search?source=community') {
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}><SearchPage /></MemoryRouter>));
  await settle();
}

async function typeSearch(value: string) {
  await act(async () => {
    const input = searchInput();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const searchInput = () => container.querySelector<HTMLInputElement>('input[aria-label="물품 이름 또는 특징 검색"]')!;
const recentPanel = () => container.querySelector('.recent-searches');

describe('SearchPage recent searches', () => {
  it('shows stored recent terms on empty focus and re-runs a tapped term', async () => {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(['지갑', '가방']));
    await mount();
    expect(recentPanel()).toBeNull();

    await act(async () => {
      searchInput().focus();
      searchInput().dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    });
    expect(recentPanel()?.textContent).toContain('최근 검색');
    expect([...container.querySelectorAll('.recent-search-term')].map(button => button.textContent)).toEqual(['지갑', '가방']);

    await act(async () => { container.querySelectorAll<HTMLButtonElement>('.recent-search-term')[0].click(); });
    await settle();
    expect(searchInput().value).toBe('지갑');
    expect(container.textContent).toContain('‘지갑’');
    expect(JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY)!)).toEqual(['지갑', '가방']);
  });

  it('saves a submitted query and can remove or clear recent terms', async () => {
    await mount();
    await typeSearch('우산');
    await act(async () => { container.querySelector<HTMLFormElement>('form.catalog-search')!.requestSubmit(); });
    await settle();
    expect(JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY)!)).toEqual(['우산']);

    await typeSearch('');
    await act(async () => {
      searchInput().focus();
      searchInput().dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    });
    expect(recentPanel()).not.toBeNull();

    await act(async () => { container.querySelector<HTMLButtonElement>('.recent-search-remove')!.click(); });
    expect(JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY)!)).toEqual([]);
    expect(recentPanel()).toBeNull();

    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(['지갑', '가방']));
    await act(async () => {
      searchInput().blur();
      searchInput().dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 150)); });
    await act(async () => {
      searchInput().focus();
      searchInput().dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    });
    expect(recentPanel()).not.toBeNull();
    await act(async () => { container.querySelector<HTMLButtonElement>('.recent-searches-clear')!.click(); });
    expect(JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY)!)).toEqual([]);
  });
});
