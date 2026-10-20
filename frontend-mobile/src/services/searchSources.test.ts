import { describe, expect, it } from 'vitest';
import { ApiClientError } from './apiClient';
import type { Item } from '../types';
import { applyPolicePage, buildPoliceQuery, idleSource, loadCommunity, loadPolicePage, mergeSearchItems } from './searchSources';

const item = (id: string, createdBy: string): Item => ({
  id, title: id, type: 'lost', category: '지갑', color: '', date: '2026-10-05', region: '', location: '', description: '',
  image: '/images/wallet.svg', source: createdBy === 'police' ? 'public' : 'community', status: 'open', createdBy,
});
const policePage = (items: Item[], page = 1) => ({ items, page, size: 20, totalCount: 33100, totalPages: 1655, searchMode: 'DATE_RANGE' as const });
const externalError = new ApiClientError('HTTP_ERROR', '경찰청 공공데이터 서버에 연결할 수 없습니다.', 502, { serverCode: 'EXTERNAL_API_UNAVAILABLE' });

describe('independent search sources', () => {
  it('keeps the oldest actual fetch time when appended server pages use different timestamp precision', () => {
    const cache = { fetchedAt: '2026-10-15T00:00:00Z', expiresAt: '2026-10-15T12:00:00Z', refreshAllowedAt: '2026-10-15T00:01:00Z', hit: true, stale: false, refreshError: null };
    const previous = { ...idleSource, status: 'ready' as const, cache, page: 1 };
    const result = applyPolicePage(previous, { ...previous, page: 2, cache: { ...cache, fetchedAt: '2026-10-15T00:00:00.100Z', expiresAt: '2026-10-15T12:00:00.100Z' } }, 2);
    expect(result.cache?.fetchedAt).toBe(cache.fetchedAt);
    expect(result.cache?.expiresAt).toBe(cache.expiresAt);
    expect(result.lastSyncedAt).toBe(Date.parse(cache.fetchedAt));
  });
  it('keeps LOST QUEST items when 경찰청 sources fail', async () => {
    const community = await loadCommunity(async () => [item('api-lost-1', 'server')]);
    const policeLost = await loadPolicePage(() => Promise.reject(externalError));
    const policeFound = await loadPolicePage(async () => policePage([item('police-found-F2026100500001930-1', 'police')]));
    expect(policeLost).toMatchObject({ status: 'error', error: '경찰청 공공데이터 서버에 연결할 수 없습니다.', items: [] });
    expect(mergeSearchItems({ communityLost: community, communityFound: idleSource, policeLost, policeFound }).map((entry) => entry.id))
      .toEqual(['api-lost-1', 'police-found-F2026100500001930-1']);
  });

  it('keeps 경찰청 items when the LOST QUEST API fails', async () => {
    const community = await loadCommunity(() => Promise.reject(new ApiClientError('NETWORK_ERROR', '서버에 연결하지 못했어요.')));
    const policeLost = await loadPolicePage(async () => policePage([item('police-lost-L2026100500001176', 'police')]));
    expect(community).toMatchObject({ status: 'error', error: '서버에 연결하지 못했어요.', items: [] });
    expect(mergeSearchItems({ communityLost: community, communityFound: idleSource, policeLost, policeFound: idleSource }).map((entry) => entry.id)).toEqual(['police-lost-L2026100500001176']);
  });

  it('reports an empty 경찰청 result as ready with zero items (not an error, no seed fallback)', async () => {
    const empty = await loadPolicePage(async () => ({ ...policePage([]), totalCount: 0, totalPages: 0 }));
    expect(empty).toMatchObject({ status: 'ready', items: [], totalCount: 0 });
  });

  it('appends the next 경찰청 page and keeps earlier items when a later page fails', async () => {
    const first = await loadPolicePage(async () => policePage([item('police-lost-L2026100500000001', 'police')]));
    const second = await loadPolicePage(async () => policePage([item('police-lost-L2026100500000001', 'police'), item('police-lost-L2026100500000002', 'police')], 2), first.items);
    expect(second.items.map((entry) => entry.id)).toEqual(['police-lost-L2026100500000001', 'police-lost-L2026100500000002']);
    expect(second.page).toBe(2);
    const failed = await loadPolicePage(() => Promise.reject(externalError), second.items);
    expect(failed).toMatchObject({ status: 'error' });
    expect(failed.items).toHaveLength(2);
  });

  it('builds 경찰청 queries: keyword wins over dates, invalid ranges fall back to the backend default', () => {
    expect(buildPoliceQuery({ q: ' 지갑 ', from: '2026-10-01' })).toEqual({ q: '지갑' });
    expect(buildPoliceQuery({ from: '2026-10-01', to: '2026-10-05' })).toEqual({ from: '2026-10-01', to: '2026-10-05' });
    expect(buildPoliceQuery({ from: '2026-10-05', to: '2026-10-01' })).toEqual({});
    expect(buildPoliceQuery({ from: '2026/10/01' })).toEqual({});
    expect(buildPoliceQuery({})).toEqual({});
  });

  it.each(['live', 'cached'] as const)('preserves the %s result set and paging metadata when an additional request fails', dataStatus => {
    const previous = { ...idleSource, status: 'ready' as const, dataStatus, items: [item('police-lost-L2026100500000001', 'police')], page: 1, totalPages: 3, totalCount: 60, lastSyncedAt: 1234, cacheSaved: true, pageLoading: true };
    const result = applyPolicePage(previous, { ...idleSource, status: 'error', dataStatus: 'unavailable', error: '실패' }, 2);
    expect(result.items).toBe(previous.items);
    expect(result).toMatchObject({ status: 'ready', dataStatus, page: 1, totalPages: 3, totalCount: 60, lastSyncedAt: 1234, cacheSaved: true, pageLoading: false, pageError: { page: 2, message: '실패' } });
  });

  it('appends a successfully retried page only once and removes its page error', () => {
    const first = item('police-lost-L2026100500000001', 'police');
    const second = item('police-lost-L2026100500000002', 'police');
    const previous = { ...idleSource, status: 'ready' as const, dataStatus: 'live' as const, items: [first], page: 1, pageError: { page: 2, message: '실패' } };
    const result = applyPolicePage(previous, { ...idleSource, status: 'ready', dataStatus: 'live', items: [first, second, second], page: 2 }, 2);
    expect(result.items.map(entry => entry.id)).toEqual([first.id, second.id]);
    expect(result.page).toBe(2);
    expect(result.pageError).toBeUndefined();
  });
});
