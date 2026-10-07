// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './apiClient';
import { clearAuthSession, saveAuthSession } from './authSession';
import { describeMyItemsError, listMyItems, parseServerRouteId } from './itemApi';

const BASE = { baseUrl: 'http://localhost:8080' };
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIzIn0.c2lnbmF0dXJl';
const IMAGE = '/api/images/3f2c1c9e-8a5b-4f43-9d0a-5a1c3b7e9f10.png';
const lost = (id: number, title: string, extra: Record<string, unknown> = {}) => ({
  id, userId: 3, title, category: '지갑', color: '검정', description: '겉면에 작은 스크래치가 있어요.',
  lostDate: '2026-09-16', region: '서울', location: '서울 성동구 서울숲역', imageUrl: null, status: 'LOST', createdAt: '2026-10-01T00:00:00Z', ...extra,
});
const found = (id: number, title: string, extra: Record<string, unknown> = {}) => ({
  id, userId: 3, title, category: '전자기기', color: '흰색', description: '충전 케이스와 함께 보관 중이에요.',
  foundDate: '2026-09-21', region: '경기', location: '경기 수원시 광교중앙역', imageUrl: null, status: 'STORED', createdAt: '2026-10-01T00:00:00Z', ...extra,
});
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => { clearAuthSession(); });
afterEach(() => {
  vi.unstubAllGlobals();
  clearAuthSession();
});

describe('listMyItems', () => {
  it('converts lostItems and foundItems into Items with the existing server route ids, keeping the server order', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      lostItems: [lost(15, '가장 최근 분실물'), lost(12, '오래된 분실물', { imageUrl: IMAGE })],
      foundItems: [found(7, '화이트 무선 이어폰')],
    })));
    const result = await listMyItems({ ...BASE, accessToken: TOKEN });

    expect(result.lostItems.map((item) => item.id)).toEqual(['api-lost-15', 'api-lost-12']);
    expect(result.foundItems.map((item) => item.id)).toEqual(['api-found-7']);
    expect(result.lostItems[0]).toMatchObject({ type: 'lost', createdBy: 'server', source: 'community', serverId: 15, ownerId: 3, status: 'open', date: '2026-09-16', region: '서울' });
    expect(result.foundItems[0]).toMatchObject({ type: 'found', createdBy: 'server', serverId: 7, date: '2026-09-21', image: '/images/earbuds.svg' });
    // The same conversion as the public lists: a stored server image is resolved against the API base URL.
    expect(result.lostItems[1].image).toBe(`http://localhost:8080${IMAGE}`);
    // The ids are accepted by the existing detail-route parser, so /items/:id keeps working.
    expect(parseServerRouteId(result.lostItems[0].id)).toEqual({ type: 'lost', serverId: 15 });
    expect(parseServerRouteId(result.foundItems[0].id)).toEqual({ type: 'found', serverId: 7 });
  });

  it('maps a returned/closed server status to a returned item', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ lostItems: [lost(1, '찾은 물건', { status: 'RETURNED' })], foundItems: [] })));
    expect((await listMyItems({ ...BASE, accessToken: TOKEN })).lostItems[0].status).toBe('returned');
  });

  it('returns empty lists for a user without registrations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ lostItems: [], foundItems: [] })));
    await expect(listMyItems({ ...BASE, accessToken: TOKEN })).resolves.toEqual({ lostItems: [], foundItems: [] });
  });

  it('sends a plain GET to /api/me/items with only the Bearer token (no user id anywhere)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ lostItems: [], foundItems: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await listMyItems({ ...BASE, accessToken: TOKEN });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8080/api/me/items');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe('omit');
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
  });

  it('uses the stored sign-in token by default, and sends none when signed out', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ lostItems: [], foundItems: [] })));
    vi.stubGlobal('fetch', fetchMock);

    saveAuthSession(TOKEN, 3600);
    await listMyItems(BASE);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });

    clearAuthSession();
    await listMyItems(BASE);
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).not.toHaveProperty('Authorization');
  });

  it('surfaces a 401 as an error instead of returning anything', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 401, code: 'UNAUTHORIZED', message: '인증이 필요한 요청입니다.' }, 401)));
    await expect(listMyItems(BASE)).rejects.toMatchObject({ status: 401, serverCode: 'UNAUTHORIZED' });
  });

  it('surfaces network failures as errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(listMyItems({ ...BASE, accessToken: TOKEN })).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['missing foundItems', { lostItems: [] }],
    ['missing lostItems', { foundItems: [] }],
    ['non-array lostItems', { lostItems: {}, foundItems: [] }],
    ['a malformed lost item', { lostItems: [{ ...lost(1, '물건'), id: '1' }], foundItems: [] }],
    ['a malformed found item', { lostItems: [], foundItems: [found(2, '물건', { foundDate: undefined })] }],
  ])('rejects a malformed response: %s', async (_name, body) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(body))));
    const failure = await listMyItems({ ...BASE, accessToken: TOKEN }).then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiClientError);
    expect(failure).toMatchObject({ code: 'INVALID_RESPONSE', message: '예상한 물품 응답이 아니에요. 서버 주소를 확인해 주세요.' });
  });
});

describe('describeMyItemsError', () => {
  it('explains expired sign-in, passes server messages through and hides unknown errors', () => {
    expect(describeMyItemsError(new ApiClientError('HTTP_ERROR', '인증이 필요한 요청입니다.', 401))).toContain('로그인이 만료');
    expect(describeMyItemsError(new ApiClientError('HTTP_ERROR', '서버 오류가 발생했습니다.', 500))).toBe('서버 오류가 발생했습니다.');
    expect(describeMyItemsError(new Error('boom'))).toBe('등록 내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
  });
});
