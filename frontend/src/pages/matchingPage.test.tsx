// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthSession, saveAuthSession } from '../services/authSession';
import { LQ_MATCH, POLICE_MATCH, RESPONSE } from '../services/matchingApi.fixtures';
import MatchingPage from './MatchingPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BASE = 'http://localhost:8080';
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIzIn0.c2lnbmF0dXJl';
const app = vi.hoisted(() => ({ value: { authUser: null as null | { id: number }, authChecking: false } }));
vi.mock('../context/AppContext', () => ({ useApp: () => app.value }));

const lost = (id: number, userId: number, title: string, status = 'LOST') => ({
  id, userId, title, category: '지갑', color: '검정', description: '카드가 들어 있는 검은색 지갑입니다.', lostDate: '2026-09-10',
  region: '서울', location: '서울숲역', imageUrl: null, status, createdAt: '2026-09-10T00:00:00Z',
});
const LOST_LIST = [lost(12, 3, '내 검은색 지갑'), lost(13, 4, '다른 사람 지갑'), lost(14, 3, '이미 찾은 지갑', 'RETURNED'), lost(15, 3, '내 가방')];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let matchesResponse: () => Response;

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', BASE);
  saveAuthSession(TOKEN, 3600);
  app.value = { authUser: { id: 3 }, authChecking: false };
  matchesResponse = () => json(RESPONSE);
  fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(
    url === `${BASE}/api/lost-items` ? json(LOST_LIST) : url.includes('/matches') ? matchesResponse() : json({ message: 'unexpected' }, 500)));
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  clearAuthSession();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function render(path = '/matches') {
  await act(async () => { root.render(<MemoryRouter initialEntries={[path]}><MatchingPage /></MemoryRouter>); });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
const text = () => container.textContent ?? '';
const matchCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/matches'));
const cards = () => [...container.querySelectorAll('article.match-card')];

describe('MatchingPage', () => {
  it('asks signed-out users to log in and calls nothing', async () => {
    app.value = { authUser: null, authChecking: false };
    await render();
    expect(text()).toContain('로그인하고 매칭 추천을 받아 보세요');
    expect(container.querySelector('a[href^="/login?returnTo="]')).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows ranked matches from both sources with 매칭도, reasons, region/date and detail links', async () => {
    await render();
    expect(matchCalls()).toHaveLength(1);
    const [url, init] = matchCalls()[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/lost-items/12/matches?limit=10`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);

    // Only the caller's own open lost items can be selected.
    expect([...container.querySelectorAll('#matching-item option')].map((option) => option.textContent)).toEqual(['내 검은색 지갑', '내 가방']);

    expect(cards()).toHaveLength(2);
    const [first, second] = cards();
    expect(first.textContent).toContain('LOST QUEST 등록');
    expect(first.textContent).toContain('매칭도 98점');
    expect(first.textContent).toContain('같은 지역(서울)');
    expect(first.textContent).toContain('2026-09-11 습득');
    expect(first.textContent).toContain('서울 · 서울숲역 2번 출구');
    expect(first.querySelector('a.match-details')?.getAttribute('href')).toBe('/items/api-found-7');
    expect(first.querySelector('img')?.getAttribute('src')).toBe(`${BASE}${LQ_MATCH.imageUrl}`);

    expect(second.textContent).toContain('경찰청 공공데이터');
    expect(second.textContent).toContain('매칭도 73점');
    expect(second.textContent).toContain('보관: 성동경찰서');
    expect(second.textContent).toContain('정보 없음'); // region could not be compared
    expect(second.textContent).not.toContain('같은 지역');
    expect(second.querySelector('a.match-details')?.getAttribute('href')).toBe(`/items/police-found-${POLICE_MATCH.atcId}-1`);

    for (const forbidden of ['정확도', '확률', 'AI', '유사도']) expect(text()).not.toContain(forbidden);
  });

  it('keeps LOST QUEST results and explains when the 경찰청 source failed', async () => {
    matchesResponse = () => json({ ...RESPONSE, matches: [LQ_MATCH], sources: [RESPONSE.sources[0], { source: 'POLICE', status: 'UNAVAILABLE', candidateCount: 0, message: '경찰청 공공데이터 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' }] });
    await render();
    expect(cards()).toHaveLength(1);
    expect(container.querySelector('.matching-source-notices')?.textContent).toContain('경찰청 공공데이터: 경찰청 공공데이터 서버에 연결할 수 없습니다.');
  });

  it('shows a failure state when every source failed (no demo data)', async () => {
    matchesResponse = () => json({ ...RESPONSE, matches: [], sources: [
      { source: 'LOST_QUEST', status: 'UNAVAILABLE', candidateCount: 0, message: 'LOST QUEST 습득물을 불러오지 못했습니다.' },
      { source: 'POLICE', status: 'UNAVAILABLE', candidateCount: 0, message: '경찰청 공공데이터 연동이 설정되지 않았습니다.' }] });
    await render();
    expect(text()).toContain('지금은 습득물을 비교할 수 없어요');
    expect(cards()).toHaveLength(0);
  });

  it('shows an empty state when nothing scored high enough', async () => {
    matchesResponse = () => json({ ...RESPONSE, matches: [] });
    await render();
    expect(text()).toContain('아직 비슷한 습득물을 찾지 못했어요');
    expect(cards()).toHaveLength(0);
  });

  it('shows the server answer for someone else\'s lost item (403) and a missing one (404)', async () => {
    matchesResponse = () => json({ status: 403, code: 'FORBIDDEN', message: '허용되지 않은 요청입니다.' }, 403);
    await render('/matches?item=api-lost-13');
    expect(matchCalls()[0][0]).toBe(`${BASE}/api/lost-items/13/matches?limit=10`);
    expect(text()).toContain('본인이 등록한 분실물의 추천만 볼 수 있어요.');
    expect(cards()).toHaveLength(0);

    act(() => root.unmount());
    root = createRoot(container);
    matchesResponse = () => json({ status: 404, code: 'NOT_FOUND', message: '분실물을 찾을 수 없습니다.' }, 404);
    await render('/matches?item=api-lost-999');
    expect(text()).toContain('분실물을 찾을 수 없어요');
  });

  it('shows a retryable error when the request fails', async () => {
    matchesResponse = () => json({ status: 500, code: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다.' }, 500);
    await render();
    expect(text()).toContain('매칭 추천을 불러오지 못했어요');
    matchesResponse = () => json(RESPONSE);
    const retry = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('다시 시도'))!;
    await act(async () => { retry.click(); });
    for (let i = 0; i < 5; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(cards()).toHaveLength(2);
  });

  it('falls back to the category image when a match image fails to load', async () => {
    await render();
    const image = cards()[1].querySelector('img')!;
    expect(image.getAttribute('src')).toBe(POLICE_MATCH.imageUrl);
    act(() => { image.dispatchEvent(new Event('error')); });
    expect(cards()[1].querySelector('img')?.getAttribute('src')).toBe('/images/wallet.svg');
  });

  it('asks users without open lost items to register one', async () => {
    app.value = { authUser: { id: 99 }, authChecking: false };
    await render();
    expect(text()).toContain('먼저, 찾고 있는 물건을 알려 주세요');
    expect(matchCalls()).toHaveLength(0);
  });
});
