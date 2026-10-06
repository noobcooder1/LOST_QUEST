import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPoliceFilters, listPoliceItems } from './publicItemApi';
import { buildPoliceQuery, policeLostSupport } from './searchSources';

const BASE = { baseUrl: 'http://localhost:8080' };
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const emptyPage = { items: [], page: 1, size: 20, totalCount: 0, totalPages: 0, searchMode: 'DATE_RANGE' };
// Shape of GET /api/public-items/filters, with values seen in the real 경찰청 common codes.
const FILTERS = {
  regions: [{ value: 'LCA000', name: '서울특별시' }, { value: 'LCG000', name: '전남광주통합특별시' }],
  categories: [{ value: 'PRH000', name: '지갑', children: [{ value: 'PRH200', name: '남성용 지갑' }] }],
  colors: [{ value: 'CL1002', name: '블랙(검정)' }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('경찰청 filter options', () => {
  it('loads region, item-class and color options from the LOST QUEST backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(FILTERS));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getPoliceFilters(BASE)).resolves.toEqual(FILTERS);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/api/public-items/filters');
  });

  it('drops malformed options and rejects malformed responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ...FILTERS, regions: [...FILTERS.regions, { value: 1 }, null] })));
    await expect(getPoliceFilters(BASE)).resolves.toMatchObject({ regions: FILTERS.regions });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ regions: [] })));
    await expect(getPoliceFilters(BASE)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('reports a common-code outage as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 503, code: 'EXTERNAL_API_NOT_CONFIGURED', message: '경찰청 공공데이터 연동이 설정되지 않았습니다.' }, 503)));
    await expect(getPoliceFilters(BASE)).rejects.toMatchObject({ status: 503, serverCode: 'EXTERNAL_API_NOT_CONFIGURED' });
  });
});

describe('경찰청 filter requests', () => {
  it('sends region, item class, sub class and color with the date range for found items', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(emptyPage));
    vi.stubGlobal('fetch', fetchMock);
    await listPoliceItems('found', { from: '2026-10-01', to: '2026-10-05', region: 'LCA000', category: 'PRH000', subCategory: 'PRH200', color: 'CL1002' }, BASE);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/api/public-items/found?page=1&size=20&from=2026-10-01&to=2026-10-05&region=LCA000&category=PRH000&subCategory=PRH200&color=CL1002');
  });

  it('never sends color for lost items, and no code filters in keyword mode', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(emptyPage)));
    vi.stubGlobal('fetch', fetchMock);
    await listPoliceItems('lost', { region: 'LCA000', color: 'CL1002' }, BASE);
    await listPoliceItems('found', { q: '지갑', region: 'LCA000', color: 'CL1002' }, BASE);
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('http://localhost:8080/api/public-items/lost?page=1&size=20&region=LCA000');
    expect((fetchMock.mock.calls[1] as unknown[])[0]).toBe('http://localhost:8080/api/public-items/found?page=1&size=20&q=%EC%A7%80%EA%B0%91');
  });
});

describe('search page 경찰청 query', () => {
  it('combines dates with code filters, ignores blanks, and lets a keyword replace both', () => {
    expect(buildPoliceQuery({ from: '2026-10-01', region: 'LCA000', category: '', subCategory: ' PRH200 ', color: 'CL1002' }))
      .toEqual({ from: '2026-10-01', region: 'LCA000', subCategory: 'PRH200', color: 'CL1002' });
    expect(buildPoliceQuery({ q: '지갑', from: '2026-10-01', region: 'LCA000', color: 'CL1002' })).toEqual({ q: '지갑' });
  });

  it('marks 경찰청 lost items unsupported when a color is chosen instead of showing them unfiltered', () => {
    expect(policeLostSupport({ color: 'CL1002' })).toEqual({ supported: false, reason: '경찰청 분실물은 색상 조건을 지원하지 않아요.' });
    expect(policeLostSupport({ region: 'LCA000' })).toEqual({ supported: true });
  });
});
