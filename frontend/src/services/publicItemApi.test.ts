import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromPublicItem, getPoliceItem, listPoliceItems, parsePoliceRouteId, safePoliceImageUrl, toPoliceRouteId } from './publicItemApi';

const BASE = { baseUrl: 'http://localhost:8080' };
const IMAGE = 'https://minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/F2026100500001930/1/C2026100500419868/1.do';
// Shapes copied from real normalized backend responses (no keys involved).
const LOST = {
  source: 'POLICE', type: 'LOST', sourceId: 'L2026100500001176', atcId: 'L2026100500001176', fdSn: null,
  title: '오토바이 차키', subject: '오토바이 차키 분실', category: '자동차', categoryPath: '자동차 > 자동차열쇠',
  color: null, date: '2026-09-30', location: '이동 중 떨굼 추정', placeType: null, region: null, storagePlace: null,
  imageUrl: null, agencyName: null, agencyTel: null, status: null, hour: null, note: null, detail: false,
};
const FOUND = {
  source: 'POLICE', type: 'FOUND', sourceId: 'F2026100500001930-1', atcId: 'F2026100500001930', fdSn: 1,
  title: '여성용 크로스백', subject: '여성용 크로스백(블랙(검정)색)을 습득하여 보관하고 있습니다.', category: '가방', categoryPath: '가방 > 여성용가방',
  color: '블랙(검정)', date: '2026-10-05', location: null, placeType: null, region: null, storagePlace: '화산지구대',
  imageUrl: IMAGE, agencyName: null, agencyTel: null, status: null, hour: null, note: null, detail: false,
};
const page = (items: unknown[], extra: Record<string, unknown> = {}) => ({ items, page: 1, size: 20, totalCount: 33100, totalPages: 1655, searchMode: 'DATE_RANGE', from: '2026-09-07', to: '2026-10-06', ...extra });
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('경찰청 route ids', () => {
  it('encodes lost by atcId and found by atcId + fdSn without colliding with other ids', () => {
    expect(toPoliceRouteId('lost', 'L2026100500001176')).toBe('police-lost-L2026100500001176');
    expect(toPoliceRouteId('found', 'F2026100500001930', 1)).toBe('police-found-F2026100500001930-1');
    expect(parsePoliceRouteId('police-lost-L2026100500001176')).toEqual({ type: 'lost', atcId: 'L2026100500001176' });
    expect(parsePoliceRouteId('police-found-F2026100500001930-1')).toEqual({ type: 'found', atcId: 'F2026100500001930', fdSn: 1 });
    for (const id of ['police-lost-F2026100500001930', 'police-found-F2026100500001930', 'police-found-F2026100500001930-0', 'api-lost-1',
      'public-phone-1', 'found-wallet-1', 'police-lost-L1', 'police-lost-../x', undefined]) {
      expect(parsePoliceRouteId(id)).toBeNull();
    }
  });
});

describe('경찰청 image URLs', () => {
  it('accepts only verified 경찰청 attachment images', () => {
    expect(safePoliceImageUrl(IMAGE)).toBe(IMAGE);
    for (const bad of [null, '', 'https://minwon24.police.go.kr/images/sub/img02_no_img.gif', IMAGE.replace('https:', 'http:'),
      IMAGE.replace('minwon24.police.go.kr', 'evil.example'), `${IMAGE}?x=1`, IMAGE.replace('//', '//user@'), 'javascript:alert(1)',
      'data:image/png;base64,AAAA', IMAGE.replace('https:', ''), '/api/images/3f2b8c1e-9a4d-4b6f-8e2a-1c3d5e7f9a0b.jpg']) {
      expect(safePoliceImageUrl(bad)).toBeNull();
    }
  });
});

describe('normalized DTO → Item', () => {
  it('maps a lost list item without inventing missing color, region or image', () => {
    expect(fromPublicItem(LOST)).toEqual({
      id: 'police-lost-L2026100500001176', title: '오토바이 차키', type: 'lost', category: '자동차', color: '', date: '2026-09-30',
      region: '', location: '이동 중 떨굼 추정', description: '오토바이 차키 분실', image: '/images/keys.svg',
      source: 'public', status: 'open', createdBy: 'police', facts: [{ label: '물품 분류', value: '자동차 > 자동차열쇠' }],
    });
  });

  it('maps a found item with its storage place and real 경찰청 image', () => {
    const item = fromPublicItem(FOUND);
    expect(item).toMatchObject({ id: 'police-found-F2026100500001930-1', type: 'found', image: IMAGE, color: '블랙(검정)', location: '화산지구대', agency: '화산지구대', createdBy: 'police' });
    expect(item.facts).toContainEqual({ label: '보관 장소', value: '화산지구대' });
  });

  it('falls back to the category image when the image is missing or unsafe', () => {
    expect(fromPublicItem({ ...FOUND, imageUrl: null }).image).toBe('/images/backpack.svg');
    expect(fromPublicItem({ ...FOUND, imageUrl: 'javascript:alert(1)' }).image).toBe('/images/backpack.svg');
    expect(fromPublicItem({ ...FOUND, imageUrl: 'https://evil.example/x.jpg' }).image).toBe('/images/backpack.svg');
  });

  it('keeps detail-only values as labelled facts', () => {
    const item = fromPublicItem({ ...LOST, detail: true, color: '핑크(분홍)', region: '서울특별시', placeType: '택시', status: '온라인 접수', hour: '23',
      agencyName: '서울영등포경찰서', agencyTel: '02-2118-9451', note: '개인정보보호정책에 의해 정보가 제공되지 않습니다.' });
    expect(item).toMatchObject({ color: '핑크(분홍)', region: '서울특별시', agency: '서울영등포경찰서', phone: '02-2118-9451' });
    expect(item.facts?.map((fact) => fact.label)).toEqual(['물품 분류', '지역', '분실 장소 유형', '처리 상태', '시간대', '특이사항']);
  });

  it('labels a missing item name instead of inventing one', () => {
    expect(fromPublicItem({ ...FOUND, title: null, subject: null }).title).toBe('물품명 정보 없음');
  });

  it.each([null, { ...LOST, source: 'LOST_QUEST' }, { ...LOST, type: 'OTHER' }, { ...LOST, atcId: 'X1' }, { ...FOUND, fdSn: null }])(
    'rejects malformed DTOs %#', (value) => {
      expect(() => fromPublicItem(value)).toThrow();
    });
});

describe('public item API requests', () => {
  it('requests a date-range page through the LOST QUEST backend, never the police API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(page([LOST])));
    vi.stubGlobal('fetch', fetchMock);
    const result = await listPoliceItems('lost', { page: 2, size: 20, from: '2026-10-01', to: '2026-10-05' }, BASE);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8080/api/public-items/lost?page=2&size=20&from=2026-10-01&to=2026-10-05');
    expect(url).not.toContain('apis.data.go.kr');
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(result).toMatchObject({ totalCount: 33100, totalPages: 1655, searchMode: 'DATE_RANGE' });
    expect(result.items[0].id).toBe('police-lost-L2026100500001176');
  });

  it('sends a keyword without dates (the police keyword API has no date filter)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(page([], { totalCount: 0, totalPages: 0, searchMode: 'KEYWORD' })));
    vi.stubGlobal('fetch', fetchMock);
    const result = await listPoliceItems('found', { q: ' 검정 지갑 ', from: '2026-10-01' }, BASE);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/api/public-items/found?page=1&size=20&q=%EA%B2%80%EC%A0%95+%EC%A7%80%EA%B0%91');
    expect(result).toMatchObject({ items: [], totalCount: 0, searchMode: 'KEYWORD' });
  });

  it('surfaces external API errors as errors, never as fallback data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 502, code: 'EXTERNAL_API_ERROR', message: '경찰청 공공데이터 서버가 요청을 처리하지 못했습니다.' }, 502)));
    await expect(listPoliceItems('lost', {}, BASE)).rejects.toMatchObject({ status: 502, serverCode: 'EXTERNAL_API_ERROR' });
  });

  it('loads lost and found details from their own endpoints', async () => {
    const fetchMock = vi.fn((url: string) => Promise.resolve(jsonResponse(url.includes('/found/') ? { ...FOUND, detail: true } : { ...LOST, detail: true })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getPoliceItem('police-lost-L2026100500001176', BASE)).resolves.toMatchObject({ type: 'lost' });
    await expect(getPoliceItem('police-found-F2026100500001930-1', BASE)).resolves.toMatchObject({ type: 'found', image: IMAGE });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:8080/api/public-items/lost/L2026100500001176',
      'http://localhost:8080/api/public-items/found/F2026100500001930/1',
    ]);
    await expect(getPoliceItem('police-lost-bad', BASE)).rejects.toBeTruthy();
  });
});
