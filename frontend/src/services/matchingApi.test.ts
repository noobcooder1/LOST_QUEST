import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './apiClient';
import { describeMatchError, getItemMatches, parseItemMatches, parseMatch } from './matchingApi';
import { LQ_MATCH, POLICE_IMAGE, POLICE_MATCH, RESPONSE } from './matchingApi.fixtures';

const BASE = 'http://localhost:8080';
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('match response parsing', () => {
  it('maps both sources to their own detail routes, images and places without inventing values', () => {
    const result = parseItemMatches(RESPONSE, BASE);
    expect(result.lostItemId).toBe(12);
    expect(result.minScore).toBe(40);
    const [lq, police] = result.matches;
    expect(lq).toMatchObject({
      id: 'LOST_QUEST:7', source: 'LOST_QUEST', routeId: 'api-found-7', score: 98, maxScore: 100, region: '서울', place: '서울숲역 2번 출구',
      image: `${BASE}/api/images/3f2b8c1e-9a4d-4b6f-8e2a-1c3d5e7f9a0b.jpg`, fallbackImage: '/images/wallet.svg',
    });
    expect(police).toMatchObject({
      source: 'POLICE', routeId: 'police-found-F2026100500001930-1', region: '', place: '성동경찰서', image: POLICE_IMAGE, color: '블랙(검정)',
    });
    expect(police.breakdown[1]).toEqual({ key: 'region', points: 0, maxPoints: 25, result: 'UNKNOWN', note: '경찰청 습득물 목록은 지역 정보를 제공하지 않습니다.' });
    expect(police.reasons).toEqual(['같은 분류(지갑)', '같은 색상(블랙(검정))', '분실 2일 후 습득']);
  });

  it('drops images outside the allow-lists (category image is used instead)', () => {
    expect(parseMatch({ ...LQ_MATCH, imageUrl: 'https://evil.example/x.jpg' }, BASE).image).toBe('');
    expect(parseMatch({ ...LQ_MATCH, imageUrl: 'data:image/png;base64,AAAA' }, BASE).image).toBe('');
    expect(parseMatch({ ...POLICE_MATCH, imageUrl: 'http://minwon24.police.go.kr/images/sub/img02_no_img.gif' }, BASE).image).toBe('');
    expect(parseMatch({ ...POLICE_MATCH, imageUrl: null }, BASE).fallbackImage).toBe('/images/wallet.svg');
  });

  it('rejects a score that does not equal its breakdown, or ids that cannot form a detail link', () => {
    expect(() => parseMatch({ ...LQ_MATCH, score: 99 }, BASE)).toThrow(ApiClientError);
    expect(() => parseMatch({ ...LQ_MATCH, score: 120, maxScore: 100 }, BASE)).toThrow(ApiClientError);
    expect(() => parseMatch({ ...LQ_MATCH, foundItemId: null }, BASE)).toThrow(ApiClientError);
    expect(() => parseMatch({ ...POLICE_MATCH, atcId: '../../etc' }, BASE)).toThrow(ApiClientError);
    expect(() => parseMatch({ ...POLICE_MATCH, source: 'AI' }, BASE)).toThrow(ApiClientError);
    expect(() => parseItemMatches({ ...RESPONSE, sources: [{ source: 'POLICE', status: 'MAYBE', candidateCount: 0 }] }, BASE)).toThrow(ApiClientError);
    expect(() => parseItemMatches({ matches: [] }, BASE)).toThrow(ApiClientError);
  });

  it('keeps source statuses and messages for partial results', () => {
    const result = parseItemMatches({
      ...RESPONSE, matches: [LQ_MATCH],
      sources: [RESPONSE.sources[0], { source: 'POLICE', status: 'UNAVAILABLE', candidateCount: 0, message: '경찰청 공공데이터 서버에 연결할 수 없습니다.' }],
    }, BASE);
    expect(result.matches).toHaveLength(1);
    expect(result.sources[1]).toEqual({ source: 'POLICE', status: 'UNAVAILABLE', candidateCount: 0, message: '경찰청 공공데이터 서버에 연결할 수 없습니다.' });
  });
});

describe('GET /api/lost-items/{id}/matches', () => {
  it('sends the bearer token and a bounded limit, never a user id', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(RESPONSE)));
    vi.stubGlobal('fetch', fetchMock);

    await getItemMatches(12, { baseUrl: BASE, accessToken: TOKEN, limit: 50 });
    await getItemMatches(12, { baseUrl: BASE, accessToken: TOKEN });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/lost-items/12/matches?limit=20`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.method).toBe('GET');
    expect(url).not.toContain('userId');
    expect(url).not.toContain(TOKEN);
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/api/lost-items/12/matches?limit=10`);
    expect(fetchMock.mock.calls.every(([calledUrl]) => String(calledUrl).startsWith(BASE))).toBe(true);
  });

  it('turns 401/403/404 into clear messages', async () => {
    for (const [status, text] of [[401, '로그인이 만료'], [403, '본인이 등록한 분실물'], [404, '분실물을 찾을 수 없어요']] as const) {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ status, code: 'X', message: 'server' }, status))));
      const error = await getItemMatches(12, { baseUrl: BASE, accessToken: TOKEN }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ApiClientError);
      expect(describeMatchError(error)).toContain(text);
    }
  });

  it('rejects invalid ids before calling the server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(getItemMatches(0, { baseUrl: BASE, accessToken: TOKEN })).rejects.toBeInstanceOf(ApiClientError);
    await expect(getItemMatches(Number.NaN, { baseUrl: BASE, accessToken: TOKEN })).rejects.toBeInstanceOf(ApiClientError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
