// @vitest-environment jsdom
import { act, StrictMode } from 'react';
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
const LOST_LIST = [lost(12, 3, '내 검은색 지갑'), lost(13, 4, '다른 사람 지갑'), lost(14, 3, '이미 찾은 지갑', 'RETURNED'), lost(15, 3, '내 가방'), { ...lost(16, 3, '숨김 지갑'), hidden: true }];
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

async function render(path = '/matches?item=api-lost-12', strict = false) {
  const screen = <MemoryRouter initialEntries={[path]}><MatchingPage /></MemoryRouter>;
  await act(async () => { root.render(strict ? <StrictMode>{screen}</StrictMode> : screen); });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
const text = () => container.textContent ?? '';
const matchCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/matches'));
const cards = () => [...container.querySelectorAll('article.match-card')];
async function click(element: HTMLElement) {
  expect(element).toBeTruthy(); await act(async () => element.click());
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}
const choice = (title: string) => [...container.querySelectorAll<HTMLButtonElement>('.matching-choice')].find(button => button.textContent?.includes(title))!;
const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent?.trim() === label)!;
const startMatching = () => click(button('매칭 시작'));
async function renderAndStart(path = '/matches?item=api-lost-12', strict = false) {
  await render(path, strict); await startMatching();
}

describe('MatchingPage', () => {
  it('shows owned open items to choose from and makes no matching request on ordinary entry', async () => {
    await render('/matches');
    expect(text()).toContain('어떤 물품을 찾아볼까요?');
    expect([...container.querySelectorAll('.matching-choice strong')].map(element => element.textContent)).toEqual(['내 검은색 지갑', '내 가방']);
    expect(text()).not.toContain('다른 사람 지갑'); expect(text()).not.toContain('이미 찾은 지갑'); expect(text()).not.toContain('숨김 지갑');
    expect(matchCalls()).toHaveLength(0); expect(cards()).toHaveLength(0);
  });

  it('compares the explicitly chosen item instead of the first list item', async () => {
    matchesResponse = () => json({ ...RESPONSE, lostItem: { ...RESPONSE.lostItem, id: 15, title: '내 가방' } });
    await render('/matches'); await click(choice('내 가방'));
    expect(matchCalls()).toHaveLength(0); await startMatching();
    expect(matchCalls()).toHaveLength(1); expect(matchCalls()[0][0]).toBe(`${BASE}/api/lost-items/15/matches?limit=10`);
    expect(container.querySelector('.matching-source h2')?.textContent).toBe('내 가방');
    expect(cards()[0].querySelector('.match-details')?.getAttribute('href')).toContain('lostItem=api-lost-15');
  });

  it('still requires a choice when only one eligible item exists', async () => {
    fetchMock.mockImplementation(async (url: string) => url.endsWith('/api/lost-items') ? json([lost(12, 3, '내 검은색 지갑')]) : json(RESPONSE));
    await render('/matches'); expect(matchCalls()).toHaveLength(0); expect(container.querySelectorAll('.matching-choice')).toHaveLength(1);
    await click(choice('내 검은색 지갑')); expect(matchCalls()).toHaveLength(0); await startMatching(); expect(matchCalls()).toHaveLength(1);
  });

  it('returns to the picker without comparing automatically and lets the user choose another item', async () => {
    await renderAndStart(); expect(cards()).toHaveLength(2);
    await click(container.querySelector<HTMLButtonElement>('.matching-reselect')!);
    expect(container.querySelector('.matching-picker')).not.toBeNull(); expect(cards()).toHaveLength(0); expect(matchCalls()).toHaveLength(1);
    await click(choice('내 가방')); expect(matchCalls()).toHaveLength(1); await startMatching(); expect(matchCalls()).toHaveLength(2); expect(matchCalls()[1][0]).toContain('/15/matches');
  });

  it.each(['api-found-12', 'invalid'])('shows the picker for invalid target %s without an endless loading state', async item => {
    await render(`/matches?item=${item}`); expect(container.querySelector('.matching-picker')).not.toBeNull();
    expect(text()).toContain('선택한 물품을 확인할 수 없어요'); expect(matchCalls()).toHaveLength(0);
    await click(choice('내 가방')); await startMatching(); expect(matchCalls()[0][0]).toContain('/15/matches');
  });

  it('waits for explicit start on deep links under StrictMode and runs once', async () => {
    await render('/matches?item=api-lost-12', true); expect(matchCalls()).toHaveLength(0);
    expect(button('AI 이미지 매칭').disabled).toBe(true);
    expect(container.querySelector('.matching-results')?.getAttribute('aria-busy')).toBe('false');
    await startMatching(); expect(matchCalls()).toHaveLength(1); expect(cards()).toHaveLength(2);
  });

  it('disables both actions while text matching is pending and prevents repeated requests', async () => {
    let finish!: (value: Response) => void;
    fetchMock.mockImplementation((url: string) => url.endsWith('/api/lost-items') ? Promise.resolve(json(LOST_LIST)) : new Promise<Response>(resolve => { finish = resolve; }));
    await renderAndStart();
    expect(button('매칭 중…').disabled).toBe(true); expect(button('AI 이미지 매칭').disabled).toBe(true);
    expect(container.querySelector('.matching-results')?.getAttribute('aria-busy')).toBe('true');
    await click(button('매칭 중…')); await click(button('AI 이미지 매칭'));
    expect(matchCalls()).toHaveLength(1); expect(container.querySelector('#matching-photo-status')).toBeNull();
    await act(async () => finish(json(RESPONSE)));
    expect(button('AI 이미지 매칭').disabled).toBe(false);
    expect(button('AI 이미지 매칭').getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('#matching-photo-status')).toBeNull();
  });

  it('opens the optional image availability notice only on click without extra requests or changing text results', async () => {
    await renderAndStart();
    const before = cards().map(card => card.innerHTML);
    const requests = fetchMock.mock.calls.length;
    await click(button('AI 이미지 매칭'));
    expect(button('AI 이미지 매칭').getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('#matching-photo-status')?.getAttribute('role')).toBe('status');
    expect(text()).toContain('AI 이미지 매칭을 아직 사용할 수 없어요');
    expect(text()).toContain('이미지 비교 요청은 실행되지 않았으며');
    expect(cards().map(card => card.innerHTML)).toEqual(before);
    expect(fetchMock).toHaveBeenCalledTimes(requests);
    await click(button('AI 이미지 매칭'));
    expect(container.querySelector('#matching-photo-status')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(requests);
  });

  it('clears the optional image stage on text retry and item changes, requiring explicit start again', async () => {
    await renderAndStart(); await click(button('AI 이미지 매칭'));
    await click(button('다시 매칭'));
    expect(matchCalls()).toHaveLength(2); expect(container.querySelector('#matching-photo-status')).toBeNull();
    await click(button('AI 이미지 매칭'));
    await act(async () => { const select = container.querySelector<HTMLSelectElement>('#matching-item')!; select.value = 'api-lost-15'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.querySelector('#matching-photo-status')).toBeNull(); expect(cards()).toHaveLength(0);
    expect(button('AI 이미지 매칭').disabled).toBe(true); expect(matchCalls()).toHaveLength(2);
    await startMatching(); expect(matchCalls()).toHaveLength(3); expect(matchCalls()[2][0]).toContain('/15/matches');
  });

  it('ignores the first comparison if it resolves after switching to another item', async () => {
    let finishFirst!: (value: Response) => void;
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/lost-items')) return Promise.resolve(json(LOST_LIST));
      if (url.includes('/12/matches')) return new Promise<Response>(resolve => { finishFirst = resolve; });
      return Promise.resolve(json({ ...RESPONSE, lostItem: { ...RESPONSE.lostItem, id: 15 }, matches: [{ ...LQ_MATCH, title: '가방 기준 추천 결과' }] }));
    });
    await renderAndStart();
    await act(async () => { const select = container.querySelector<HTMLSelectElement>('#matching-item')!; select.value = 'api-lost-15'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    for (let i = 0; i < 5; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(matchCalls()).toHaveLength(1); await startMatching();
    expect(text()).toContain('가방 기준 추천 결과');
    await act(async () => finishFirst(json(RESPONSE)));
    expect(text()).toContain('가방 기준 추천 결과'); expect(cards()).toHaveLength(1); expect(container.querySelector('.matching-source h2')?.textContent).toBe('내 가방');
  });

  it('does not restore old results if the user returns to the picker while comparison is pending', async () => {
    let finish!: (value: Response) => void;
    fetchMock.mockImplementation((url: string) => url.endsWith('/api/lost-items') ? Promise.resolve(json(LOST_LIST)) : new Promise<Response>(resolve => { finish = resolve; }));
    await renderAndStart(); await click(container.querySelector<HTMLButtonElement>('.matching-reselect')!);
    await act(async () => finish(json(RESPONSE)));
    expect(container.querySelector('.matching-picker')).not.toBeNull(); expect(cards()).toHaveLength(0); expect(matchCalls()).toHaveLength(1);
  });

  it('asks signed-out users to log in and calls nothing', async () => {
    app.value = { authUser: null, authChecking: false };
    await render();
    expect(text()).toContain('로그인하고 매칭 추천을 받아 보세요');
    expect(container.querySelector('a[href^="/login?returnTo="]')).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows ranked matches from both sources with 매칭도, reasons, region/date and detail links', async () => {
    await renderAndStart();
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
    expect(first.querySelector('a.match-details')?.getAttribute('href')).toBe('/items/api-found-7?lostItem=api-lost-12');
    expect(first.querySelector('img')?.getAttribute('src')).toBe(`${BASE}${LQ_MATCH.imageUrl}`);

    expect(second.textContent).toContain('경찰청 공공데이터');
    expect(second.textContent).toContain('매칭도 73점');
    expect(second.textContent).toContain('보관: 성동경찰서');
    expect(second.textContent).toContain('정보 없음'); // region could not be compared
    expect(second.textContent).not.toContain('같은 지역');
    expect(second.querySelector('a.match-details')?.getAttribute('href')).toBe(`/items/police-found-${POLICE_MATCH.atcId}-1`);

    for (const forbidden of ['정확도', '확률', '유사도']) expect(cards().map(card => card.textContent).join('')).not.toContain(forbidden);
  });

  it('keeps LOST QUEST results and explains when the 경찰청 source failed', async () => {
    matchesResponse = () => json({ ...RESPONSE, matches: [LQ_MATCH], sources: [RESPONSE.sources[0], { source: 'POLICE', status: 'UNAVAILABLE', candidateCount: 0, message: '경찰청 공공데이터 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' }] });
    await renderAndStart();
    expect(cards()).toHaveLength(1);
    expect(container.querySelector('.matching-source-notices')?.textContent).toContain('경찰청 공공데이터: 경찰청 공공데이터 서버에 연결할 수 없습니다.');
  });

  it('shows a failure state when every source failed (no demo data)', async () => {
    matchesResponse = () => json({ ...RESPONSE, matches: [], sources: [
      { source: 'LOST_QUEST', status: 'UNAVAILABLE', candidateCount: 0, message: 'LOST QUEST 습득물을 불러오지 못했습니다.' },
      { source: 'POLICE', status: 'UNAVAILABLE', candidateCount: 0, message: '경찰청 공공데이터 연동이 설정되지 않았습니다.' }] });
    await renderAndStart();
    expect(text()).toContain('지금은 습득물을 비교할 수 없어요');
    expect(cards()).toHaveLength(0);
    expect(button('AI 이미지 매칭').disabled).toBe(true);
  });

  it('shows an empty state when nothing scored high enough', async () => {
    matchesResponse = () => json({ ...RESPONSE, matches: [] });
    await renderAndStart();
    expect(text()).toContain('아직 비슷한 습득물을 찾지 못했어요');
    expect(cards()).toHaveLength(0);
    expect(button('AI 이미지 매칭').disabled).toBe(true);
  });

  it('shows the server answer for someone else\'s lost item (403) and a missing one (404)', async () => {
    matchesResponse = () => json({ status: 403, code: 'FORBIDDEN', message: '허용되지 않은 요청입니다.' }, 403);
    await renderAndStart('/matches?item=api-lost-13');
    expect(matchCalls()[0][0]).toBe(`${BASE}/api/lost-items/13/matches?limit=10`);
    expect(text()).toContain('본인이 등록한 분실물의 추천만 볼 수 있어요.');
    expect(cards()).toHaveLength(0);

    act(() => root.unmount());
    root = createRoot(container);
    matchesResponse = () => json({ status: 404, code: 'NOT_FOUND', message: '분실물을 찾을 수 없습니다.' }, 404);
    await renderAndStart('/matches?item=api-lost-999');
    expect(text()).toContain('분실물을 찾을 수 없어요');
  });

  it('shows a retryable error when the request fails', async () => {
    matchesResponse = () => json({ status: 500, code: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다.' }, 500);
    await renderAndStart();
    expect(text()).toContain('매칭 추천을 불러오지 못했어요');
    matchesResponse = () => json(RESPONSE);
    const retry = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('다시 시도'))!;
    await act(async () => { retry.click(); });
    for (let i = 0; i < 5; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(cards()).toHaveLength(2);
  });

  it('falls back to the category image when a match image fails to load', async () => {
    await renderAndStart();
    const image = cards()[1].querySelector('img')!;
    expect(image.getAttribute('src')).toBe(POLICE_MATCH.imageUrl);
    act(() => { image.dispatchEvent(new Event('error')); });
    expect(cards()[1].querySelector('img')?.getAttribute('src')).toBe('/images/wallet.svg');
  });

  it('hides the AI photo similarity area unless the frontend flag is on', async () => {
    await renderAndStart();
    expect(container.querySelector('.photo-similarity')).toBeNull();
    expect(text()).not.toContain('사진 유사도');
  });

  it('shows the photo similarity area as unavailable when enabled, without a score and without changing the cards', async () => {
    await renderAndStart();
    const before = cards().map((card) => card.innerHTML);
    act(() => root.unmount());
    root = createRoot(container);
    vi.stubEnv('VITE_FEATURE_AI_PHOTO_SIMILARITY', 'true');
    await renderAndStart();
    expect(container.querySelector('.photo-similarity')).toBeNull();
    await click(button('AI 이미지 매칭'));

    expect(cards()).toHaveLength(2);
    for (const [index, card] of cards().entries()) {
      const area = card.querySelector('.photo-similarity')!;
      expect(area.getAttribute('data-status')).toBe('UNAVAILABLE');
      expect(area.textContent).toContain('AI 사진 유사도');
      expect(area.textContent).toContain('지금은 사진 비교를 할 수 없어요');
      expect(area.textContent).not.toMatch(/\d/);
      // Everything else on the card (매칭도, breakdown, links, order) is exactly what it was with the flag off.
      area.remove();
      expect(card.innerHTML).toBe(before[index]);
    }
    expect(cards()[0].textContent).toContain('매칭도 98점');
    expect(cards()[1].textContent).toContain('매칭도 73점');
    expect(matchCalls()).toHaveLength(2); // one per render; no extra request for photo similarity
  });

  it('asks users without open lost items to register one', async () => {
    app.value = { authUser: { id: 99 }, authChecking: false };
    await render('/matches');
    expect(text()).toContain('먼저, 찾고 있는 물건을 알려 주세요');
    expect(matchCalls()).toHaveLength(0);
  });
});
