import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiRequest } from './apiClient';
import { isPublicConnectionFailure, loadCommunityPublicList, loadPolicePublicList, loadPublicList } from './publicListLoader';
import { createServerItem, deleteServerItem, getServerItem, listMyItems, updateServerItem } from './itemApi';
import { CACHE_POLICY, readPublicList, savePublicList, type PublicListRequest } from './publicListCache';
import type { Item } from '../types';

const request: PublicListRequest = { kind: 'communityFound', page: 1, size: 0 };
const item: Item = { id: 'api-found-1', title: '검은 지갑', type: 'found', category: '지갑', color: '검정', date: '2026-10-12', region: '서울', location: '서울역', description: '', image: '/images/wallet.svg', source: 'community', status: 'open', createdBy: 'server' };
const data = (items = [item]) => ({ items, page: 1, totalCount: items.length, totalPages: 1 });
beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('crypto', webcrypto); vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const fail = (error: unknown) => () => Promise.reject(error);

describe('public GET connectivity and fallback', () => {
  it('always requests the API even if navigator reports offline, then saves a successful response', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const load = vi.fn(async () => data());
    expect(await loadPublicList(request, load)).toMatchObject({ dataStatus: 'live', cacheSaved: true });
    expect(load).toHaveBeenCalledOnce();
    expect((await readPublicList(request))?.items).toHaveLength(1);
  });

  it.each(['NETWORK_ERROR', 'TIMEOUT'] as const)('falls back to the successful snapshot for %s and replaces it on reconnection', async code => {
    await loadPublicList(request, async () => data());
    const offline = await loadPublicList(request, fail(new ApiClientError(code, '연결 실패')));
    expect(offline).toMatchObject({ dataStatus: 'cached', status: 'ready', items: [{ id: item.id }] });
    expect(offline.lastSyncedAt).toBeTypeOf('number');
    expect(await loadPublicList(request, async () => data([]))).toMatchObject({ dataStatus: 'live', items: [] });
    expect((await loadPublicList(request, fail(new ApiClientError(code, '연결 실패')))).items).toEqual([]);
  });

  it('shows unavailable for a first visitor or different list kind', async () => {
    await loadPublicList(request, async () => data());
    expect(await loadPublicList({ ...request, kind: 'communityLost' }, fail(new ApiClientError('NETWORK_ERROR', '연결 실패'))))
      .toMatchObject({ dataStatus: 'unavailable', status: 'error', items: [] });
  });

  it.each([400, 401, 403, 404, 409, 422, 429])('does not replace HTTP %s with cache', async status => {
    await loadPublicList(request, async () => data());
    expect(await loadPublicList(request, fail(new ApiClientError('HTTP_ERROR', '요청 오류', status))))
      .toMatchObject({ dataStatus: 'request-error', status: 'error', items: [] });
  });

  it('keeps live data usable when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    expect(await loadPublicList(request, async () => data())).toMatchObject({ status: 'ready', dataStatus: 'live', cacheSaved: false, items: [{ id: item.id }] });
    expect(await loadPublicList(request, fail(new ApiClientError('NETWORK_ERROR', '연결 실패')))).toMatchObject({ dataStatus: 'unavailable' });
  });

  it('keeps online data usable when Web Crypto is unavailable', async () => {
    vi.stubGlobal('crypto', undefined);
    expect(await loadPublicList(request, async () => data())).toMatchObject({ dataStatus: 'live', cacheSaved: false, items: [{ id: item.id }] });
    expect(await loadPublicList(request, fail(new ApiClientError('TIMEOUT', '응답 지연')))).toMatchObject({ dataStatus: 'unavailable' });
  });

  it('rejects malformed responses without caching them and detects actual tunnel HTML as a gateway failure', async () => {
    expect(isPublicConnectionFailure(new ApiClientError('INVALID_RESPONSE', 'Invalid JSON'))).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>ERR_NGROK_3200</html>', { headers: { 'Content-Type': 'text/html' } })));
    let failure: unknown;
    try { await apiRequest('/api/found-items', { baseUrl: 'https://example.ngrok-free.dev' }); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: 'INVALID_RESPONSE', gatewayError: true });
    expect(isPublicConnectionFailure(failure)).toBe(true);
    expect(await loadPublicList(request, fail(failure))).toMatchObject({ dataStatus: 'unavailable', items: [] });
    expect(await readPublicList(request)).toBeNull();
  });

  it('does not misclassify HTML auth errors or an unrelated site as a tunnel outage', async () => {
    expect(isPublicConnectionFailure(new ApiClientError('INVALID_RESPONSE', 'HTML', 403, { gatewayError: true }))).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>ERR_NGROK_3200</html>', { headers: { 'Content-Type': 'text/html' } })));
    await expect(apiRequest('/api/found-items', { baseUrl: 'https://ordinary.example' })).rejects.toMatchObject({ gatewayError: false });
  });

  it('isolates a police-only 502 from a working community source', async () => {
    expect(await loadPublicList({ ...request, kind: 'policeFound', size: 20 }, fail(new ApiClientError('HTTP_ERROR', '경찰청 장애', 502))))
      .toMatchObject({ dataStatus: 'unavailable' });
    expect(await loadPublicList(request, async () => data())).toMatchObject({ dataStatus: 'live' });
  });

  it('uses only public GETs without Authorization for all four list adapters', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const found = url.includes('found');
      const police = url.includes('public-items');
      const value = police ? {
        items: [{ source: 'POLICE', type: found ? 'FOUND' : 'LOST', atcId: found ? 'F2026100500000001' : 'L2026100500000001', ...(found ? { fdSn: 1 } : {}), title: '지갑' }],
        page: 1, size: 20, totalCount: 1, totalPages: 1,
      } : [{ id: 1, userId: 8, title: '지갑', category: '지갑', location: '서울역', status: found ? 'STORED' : 'LOST', [found ? 'foundDate' : 'lostDate']: '2026-10-12' }];
      return Promise.resolve(new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }));
    });
    vi.stubGlobal('fetch', fetchMock);
    for (const type of ['lost', 'found'] as const) {
      expect(await loadCommunityPublicList(type)).toMatchObject({ dataStatus: 'live', cacheSaved: true });
      expect(await loadPolicePublicList(type, { page: 1, size: 20 })).toMatchObject({ dataStatus: 'live', cacheSaved: true });
    }
    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [, options] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(options.method).toBe('GET');
      expect(options.headers).not.toHaveProperty('Authorization');
    }
  });

  it('does not store authenticated records, detail responses or mutations in the public database', async () => {
    const raw = { id: 1, userId: 8, title: '지갑', category: '지갑', location: '서울역', status: 'STORED', foundDate: '2026-10-12', description: 'private-details', ownershipQuestion: 'private-clue' };
    const fetchMock = vi.fn().mockImplementation((url: string, options: RequestInit) => Promise.resolve(
      options.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response(JSON.stringify(url.includes('/api/me/') ? { lostItems: [], foundItems: [raw] } : raw)),
    ));
    vi.stubGlobal('fetch', fetchMock);
    const config = { accessToken: 'test-private-token' };
    const input = { title: '지갑', category: '지갑', color: '', date: '2026-10-12', region: '서울', location: '서울역', description: 'private-details' };
    await listMyItems(config);
    await getServerItem('found', 1);
    await createServerItem('found', input, config);
    await updateServerItem('found', 1, input, config);
    await deleteServerItem('found', 1, config);
    expect(await indexedDB.databases()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('never retries or supplies cached success for a failed write', async () => {
    await loadPublicList(request, async () => data());
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Network down'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest('/api/found-items', { method: 'POST', body: { title: '지갑' }, accessToken: 'private-token' })).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(['policeLost', 'policeFound'] as const)('does not restore any cache for an additional %s page failure', async kind => {
    const type = kind === 'policeLost' ? 'lost' : 'found';
    const policeItem: Item = { ...item, type, id: type === 'lost' ? 'police-lost-L2026100500000001' : 'police-found-F2026100500000001-1', source: 'public', createdBy: 'police' };
    const policeRequest = { kind, page: 1, size: 20 };
    await savePublicList(policeRequest, { ...data([policeItem]), totalPages: 2 });
    await savePublicList({ ...policeRequest, page: 2 }, { ...data([policeItem]), page: 2, totalPages: 2 });
    expect(await loadPublicList({ ...policeRequest, page: 2 }, fail(new ApiClientError('NETWORK_ERROR', '추가 요청 실패')))).toMatchObject({ status: 'error', dataStatus: 'unavailable', items: [] });
    expect(await readPublicList({ ...policeRequest, page: 2 })).not.toBeNull();
  });

  it('does not restore a later page after the first page expires during cleanup', async () => {
    const now = Date.now();
    const policeItem: Item = { ...item, id: 'police-found-F2026100500000001-1', source: 'public', createdBy: 'police' };
    const policeRequest: PublicListRequest = { kind: 'policeFound', page: 1, size: 20 };
    await savePublicList(policeRequest, { ...data([policeItem]), totalPages: 2 }, now - CACHE_POLICY.maxAgeMs - 1);
    await savePublicList({ ...policeRequest, page: 2 }, { ...data([policeItem]), page: 2, totalPages: 2 }, now);
    expect(await readPublicList(policeRequest)).toBeNull();
    expect(await readPublicList({ ...policeRequest, page: 2 })).not.toBeNull();
    expect(await loadPublicList(policeRequest, fail(new ApiClientError('NETWORK_ERROR', '연결 실패')))).toMatchObject({ status: 'error', dataStatus: 'unavailable', items: [] });
  });

  it('restores only the contiguous prefix and never joins a later page across a gap', async () => {
    const first: Item = { ...item, id: 'police-found-F2026100500000001-1', source: 'public', createdBy: 'police' };
    const third: Item = { ...first, id: 'police-found-F2026100500000003-1' };
    const policeRequest: PublicListRequest = { kind: 'policeFound', page: 1, size: 20 };
    await savePublicList(policeRequest, { ...data([first]), totalPages: 3, totalCount: 3 });
    await savePublicList({ ...policeRequest, page: 3 }, { ...data([third]), page: 3, totalPages: 3, totalCount: 3 });
    const restored = await loadPublicList(policeRequest, fail(new ApiClientError('TIMEOUT', '응답 지연')));
    expect(restored).toMatchObject({ dataStatus: 'cached', page: 1, totalCount: 3 });
    expect(restored.items.map(entry => entry.id)).toEqual([first.id]);
  });
});
