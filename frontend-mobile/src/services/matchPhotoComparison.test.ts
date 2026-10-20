// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromServerItem } from './itemApi';
import { parseMatch } from './matchingApi';
import { LQ_MATCH, POLICE_MATCH } from './matchingApi.fixtures';
import { compareMatchPhotos, uploadedPhotoUrl, policePhotoUrl } from './matchPhotoComparison';
import { saveAuthSession, clearAuthSession } from './authSession';
import type { PhotoSimilarity } from './photoSimilarity';

const engine = vi.hoisted(() => ({ analyze: vi.fn(), release: vi.fn() }));
vi.mock('../features/imageAnalysis/appearance', () => ({ analyzeAppearance: engine.analyze, releaseAppearanceResources: engine.release }));
const BASE = 'http://localhost:8081';
const imagePath = '/api/images/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png';
const lost = { id: 12, userId: 3, title: '지갑', category: '지갑', lostDate: '2026-10-10', location: '서울', status: 'LOST', imageUrl: imagePath };
const found = { id: 7, userId: 4, title: '습득 지갑', category: '지갑', foundDate: '2026-10-11', location: '서울', status: 'STORED', imageUrl: LQ_MATCH.imageUrl };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
let fetchMock: ReturnType<typeof vi.fn>;
let results: Record<string, PhotoSimilarity>;
const onResult = (id: string, result: PhotoSimilarity) => { results[id] = result; };
const candidates = () => [parseMatch(LQ_MATCH, BASE), parseMatch(POLICE_MATCH, BASE)];
const target = (changes = {}) => fromServerItem('lost', { ...lost, ...changes }, BASE);
const run = (changes = {}, signal = new AbortController().signal) => compareMatchPhotos(target(changes), candidates(), 3, onResult, signal);

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', BASE);
  saveAuthSession('test.header.signature', 3600);
  results = {};
  engine.analyze.mockReset().mockResolvedValue({ visualPercent: 87.4, colorPercent: 65.2 });
  engine.release.mockReset();
  fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith('/api/lost-items/12')) return json(lost);
    if (url.endsWith('/api/found-items/7')) return json(found);
    if (url.startsWith(`${BASE}/api/images/`)) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/png' } });
    if (url.startsWith(`${BASE}/api/public-items/image?`)) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/png' } });
    throw new Error('Unexpected request');
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { clearAuthSession(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('read-only registered photo comparisons', () => {
  it('compares registered and police photos sequentially through the backend and releases the worker', async () => {
    await run();
    expect(results).toEqual({ 'LOST_QUEST:7': { status: 'READY', appearancePercent: 87.4, colorPercent: 65.2 }, [POLICE_MATCH.id]: { status: 'READY', appearancePercent: 87.4, colorPercent: 65.2 } });
    expect(engine.analyze).toHaveBeenCalledTimes(2); expect(engine.release).toHaveBeenCalledTimes(1);
    expect(engine.analyze.mock.calls[0][3]).toEqual(['other', 'other']);
    expect(fetchMock.mock.calls.every(([url]) => url.startsWith(BASE))).toBe(true);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(init?.method ?? 'GET').toBe('GET');
      expect(init?.headers?.Authorization).toBe(url.includes('/api/public-items/image?') ? 'Bearer test.header.signature' : undefined);
      if (url.includes('/api/images/')) expect(init.redirect).toBe('error');
    }
  });

  it('does not compare category illustrations when the lost photo is absent', async () => {
    fetchMock.mockResolvedValue(json({ ...lost, imageUrl: null }));
    await run({ imageUrl: null });
    expect(results['LOST_QUEST:7']).toEqual({ status: 'NO_IMAGE' });
    expect(engine.analyze).not.toHaveBeenCalled(); expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([{ hidden: true }, { status: 'RETURNED' }, { status: 'CLOSED' }, { userId: 9 }])('rejects unavailable or foreign target %j', async changes => {
    fetchMock.mockResolvedValue(json({ ...lost, ...changes }));
    await expect(run()).rejects.toThrow('내 물건이 아니에요'); expect(engine.analyze).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([{ hidden: true }, { status: 'RETURNED' }, { status: 'CLOSED' }])('excludes a candidate hidden/closed after text matching %j', async changes => {
    fetchMock.mockImplementation(async (url: string) => url.endsWith('/12') ? json(lost) : url.endsWith('/7') ? json({ ...found, ...changes }) : new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'image/png' } }));
    await run(); expect(results['LOST_QUEST:7']).toEqual({ status: 'UNAVAILABLE' });
    expect(engine.analyze).toHaveBeenCalledTimes(1); expect(results[POLICE_MATCH.id]?.status).toBe('READY'); expect(engine.release).toHaveBeenCalledTimes(1);
  });

  it('excludes a candidate whose public detail became a 404', async () => {
    fetchMock.mockImplementation(async (url: string) => url.endsWith('/12') ? json(lost) : url.endsWith('/7') ? json({}, 404) : new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'image/png' } }));
    await run(); expect(results['LOST_QUEST:7']).toEqual({ status: 'UNAVAILABLE' }); expect(engine.analyze).toHaveBeenCalledTimes(1); expect(results[POLICE_MATCH.id]?.status).toBe('READY');
  });

  it('rejects changed target photos rather than comparing an old preview', async () => {
    fetchMock.mockResolvedValue(json({ ...lost, imageUrl: LQ_MATCH.imageUrl }));
    await expect(run()).rejects.toThrow('사진이 변경'); expect(engine.analyze).not.toHaveBeenCalled();
  });

  it('isolates model failures from the first-stage data and always releases resources', async () => {
    engine.analyze.mockRejectedValue(new Error('Model unavailable'));
    const before = JSON.stringify(candidates()); await run();
    expect(results['LOST_QUEST:7']).toEqual({ status: 'UNAVAILABLE' });
    expect(JSON.stringify(candidates())).toBe(before); expect(engine.release).toHaveBeenCalledTimes(1);
  });

  it('stops without publishing a late inference result when cancelled', async () => {
    const controller = new AbortController();
    engine.analyze.mockImplementation(async () => { controller.abort(); return { visualPercent: 99, colorPercent: 99 }; });
    await expect(run({}, controller.signal)).rejects.toThrow();
    expect(results['LOST_QUEST:7']).toBeUndefined(); expect(engine.release).toHaveBeenCalledTimes(1);
  });

  it('rejects non-image responses before inference', async () => {
    fetchMock.mockImplementation(async (url: string) => url.endsWith('/12') ? json(lost) : json({ error: 'not a photo' }));
    await expect(run()).rejects.toThrow('사진을 불러오지'); expect(engine.analyze).not.toHaveBeenCalled();
  });

  it('stops an oversized image stream before inference', async () => {
    fetchMock.mockImplementation(async (url: string) => url.endsWith('/12') ? json(lost) : new Response(new Uint8Array(10 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'image/png' } }));
    await expect(run()).rejects.toThrow('10MB'); expect(engine.analyze).not.toHaveBeenCalled();
  });

  it('does not infer from a missing candidate photo or a replaced preview', async () => {
    for (const imageUrl of [null, imagePath]) {
      results = {}; engine.analyze.mockClear();
      fetchMock.mockImplementation(async (url: string) => url.endsWith('/12') ? json(lost) : url.endsWith('/7') ? json({ ...found, imageUrl }) : new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'image/png' } }));
      await run(); expect(results['LOST_QUEST:7']).toEqual({ status: 'UNAVAILABLE' }); expect(engine.analyze).toHaveBeenCalledTimes(1); expect(results[POLICE_MATCH.id]?.status).toBe('READY');
    }
  });

  it('makes no request for an already cancelled operation', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(run({}, controller.signal)).rejects.toThrow(); expect(fetchMock).not.toHaveBeenCalled();
    expect(engine.analyze).not.toHaveBeenCalled();
  });

  it('supports police-only results without calling the police metadata API', async () => {
    await compareMatchPhotos(target(), [parseMatch(POLICE_MATCH, BASE)], 3, onResult, new AbortController().signal);
    expect(results[POLICE_MATCH.id]?.status).toBe('READY'); expect(engine.analyze).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.some(([url]) => url === policePhotoUrl(POLICE_MATCH.imageUrl))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/api/public-items/found'))).toBe(false);
  });

  it('rejects unsafe police image URLs without a proxy or outside request', async () => {
    const match = { ...parseMatch(POLICE_MATCH, BASE), image: 'https://evil.example/private' };
    await compareMatchPhotos(target(), [match], 3, onResult, new AbortController().signal);
    expect(results[match.id]).toEqual({ status: 'NO_IMAGE' }); expect(engine.analyze).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.every(([url]) => url.startsWith(BASE))).toBe(true);
    expect(policePhotoUrl('https://evil.example/private')).toBeNull();
  });

  it('sends no proxy request after login expires and keeps the local comparison', async () => {
    clearAuthSession(); await run();
    expect(results['LOST_QUEST:7']?.status).toBe('READY'); expect(results[POLICE_MATCH.id]?.status).toBe('UNAVAILABLE');
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/api/public-items/image'))).toBe(false);
  });

  it('allows only uploaded photo paths at the configured backend', () => {
    expect(uploadedPhotoUrl(`${BASE}${imagePath}`)).toBe(`${BASE}${imagePath}`);
    for (const url of ['/images/wallet.svg', `${BASE}/images/wallet.svg`, 'https://evil.example'+imagePath, `${BASE}${imagePath}?x=1`, `${BASE}${imagePath}#x`]) expect(uploadedPhotoUrl(url)).toBeNull();
  });
});
