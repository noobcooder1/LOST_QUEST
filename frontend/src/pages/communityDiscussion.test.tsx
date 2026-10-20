// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../services/apiClient';
import { createDiscussionPost, getDiscussionPost, type DiscussionPost } from '../services/communityApi';
import { listMyItems, MAX_IMAGE_BYTES } from '../services/itemApi';
import type { Item } from '../types';
import CommunityWritePage from './CommunityWritePage';
import CommunityDetailPage from './CommunityDetailPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const app = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../context/AppContext', () => ({ useApp: () => app.value }));
vi.mock('../services/communityApi', async importOriginal => ({ ...await importOriginal<typeof import('../services/communityApi')>(), createDiscussionPost: vi.fn(), getDiscussionPost: vi.fn() }));
vi.mock('../services/itemApi', async importOriginal => ({ ...await importOriginal<typeof import('../services/itemApi')>(), listMyItems: vi.fn() }));

const POST: DiscussionPost = { id: 31, category: 'info', title: '서울역 유실물센터 이용 안내', content: '센터는 역 안에 있어요.\n방문 전 운영 시간을 확인해 주세요.', authorNickname: '동네 이웃', createdAt: '2026-10-20T01:20:00Z', imageUrl: null, linkedItem: null };
const FOUND: Item = { id: 'api-found-8', serverId: 8, title: '파란색 우산', type: 'found', category: '기타', color: '파랑', date: '2026-10-19', region: '서울', location: '서울역', description: '역 근처에서 주운 우산입니다.', image: '/images/umbrella.webp', source: 'community', status: 'open', createdBy: 'server', ownerId: 2 };
let container: HTMLDivElement;
let root: Root;

function Destination() { const location = useLocation(); return <output>{location.pathname}{location.search} {JSON.stringify(location.state)}</output>; }
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080');
  app.value = { authUser: { id: 2 }, isLoggedIn: true, authChecking: false, logout: vi.fn() };
  vi.mocked(createDiscussionPost).mockResolvedValue(POST);
  vi.mocked(getDiscussionPost).mockResolvedValue(POST);
  vi.mocked(listMyItems).mockResolvedValue({ lostItems: [], foundItems: [FOUND] });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function mount(path = '/community/write', state?: Record<string, unknown>, detail = false) {
  await act(async () => root.render(<MemoryRouter initialEntries={[{ pathname: path, state }]}><Routes>
    <Route path="/community/write" element={<CommunityWritePage />} />
    <Route path="/community/posts/:id" element={detail ? <CommunityDetailPage /> : <Destination />} />
    <Route path="/items/:id" element={<Destination />} />
    <Route path="/community" element={<Destination />} />
  </Routes></MemoryRouter>));
}
async function setField(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)!;
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
}
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find(value => value.textContent?.includes(text));
  expect(button, `button ${text}`).toBeDefined();
  await act(async () => button!.click());
}
async function submit() { await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); }
async function fill() { await setField('#discussion-category', 'info'); await setField('#discussion-title', '  유실물센터 안내  '); await setField('#discussion-content', '  방문 전에 운영 시간을 확인해 주세요.  '); }
async function enableLink() { await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()); }
async function photo(file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
function mockPhotoReader() {
  vi.stubGlobal('FileReader', class {
    result = 'data:image/png;base64,cGhvdG8=';
    onload: (() => void) | null = null;
    readAsDataURL() { this.onload?.(); }
  });
}

describe('community writing', () => {
  it('requires login before rendering a form or loading private item options', async () => {
    app.value = { ...app.value, isLoggedIn: false, authUser: null };
    await mount();
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('a[href="/login?returnTo=%2Fcommunity%2Fwrite"]')).not.toBeNull();
    expect(listMyItems).not.toHaveBeenCalled(); expect(createDiscussionPost).not.toHaveBeenCalled();
  });
  it('submits a discussion with required category, title and body, then preserves the board return location', async () => {
    await mount('/community/write', { communityReturnTo: '/community?category=info&q=센터' });
    expect(container.querySelector('#discussion-category')).not.toBeNull();
    expect(container.querySelector('input[type="date"]')).toBeNull();
    await submit(); expect(container.querySelector('[role="alert"]')?.textContent).toContain('카테고리를 선택');
    await fill(); await submit();
    expect(createDiscussionPost).toHaveBeenCalledExactlyOnceWith({ category: 'info', title: '유실물센터 안내', content: '방문 전에 운영 시간을 확인해 주세요.' }, null);
    expect(container.querySelector('output')?.textContent).toContain('/community/posts/31');
    expect(container.querySelector('output')?.textContent).toContain('/community?category=info&q=센터');
    expect(listMyItems).not.toHaveBeenCalled();
  });
  it('rejects whitespace-only text and enforces the server’s title and body limits', async () => {
    await mount(); await fill();
    await setField('#discussion-title', '   '); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('120자 이하');
    await setField('#discussion-title', '정보 나눔'); await setField('#discussion-content', 'x'.repeat(3001)); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('3,000자 이하');
    expect(createDiscussionPost).not.toHaveBeenCalled();
  });
  it('loads own items only when requested and requires a real selection to create an item button', async () => {
    await mount(); await fill(); await enableLink();
    expect(listMyItems).toHaveBeenCalledOnce();
    await submit(); expect(createDiscussionPost).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('연결할 내 물품글을 선택');
    await setField('#discussion-linked-item', FOUND.id); await submit();
    expect(createDiscussionPost).toHaveBeenCalledWith(expect.objectContaining({ linkedItemType: 'found', linkedItemId: 8 }), null);
  });
  it('keeps writing available when own item loading fails and retries the item chooser', async () => {
    vi.mocked(listMyItems).mockRejectedValueOnce(new Error('offline'));
    await mount(); await fill(); await enableLink();
    expect(container.textContent).toContain('등록 내역을 불러오지 못했어요.');
    await click('다시 불러오기'); expect(container.querySelector('#discussion-linked-item')).not.toBeNull();
    await enableLink(); await submit();
    expect(createDiscussionPost).toHaveBeenCalledWith(expect.not.objectContaining({ linkedItemId: expect.anything() }), null);
  });
  it('validates optional photo type and size, previews and removes it, and uploads the selected photo', async () => {
    mockPhotoReader(); await mount(); await fill();
    await photo(new File(['no'], 'document.txt', { type: 'text/plain' }));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('JPG, PNG, WebP');
    const oversized = new File(['photo'], 'large.png', { type: 'image/png' }); Object.defineProperty(oversized, 'size', { value: MAX_IMAGE_BYTES + 1 });
    await photo(oversized); expect(container.querySelector('[role="alert"]')?.textContent).toContain('10MB 이하');
    const image = new File(['photo'], 'station.png', { type: 'image/png' });
    await photo(image); expect(container.querySelector('img[alt="첨부할 사진 미리보기"]')).not.toBeNull();
    await click('사진 제거'); expect(container.querySelector('img')).toBeNull();
    await photo(image); await submit(); expect(createDiscussionPost).toHaveBeenCalledWith(expect.anything(), image);
  });
  it('blocks duplicate submissions and keeps the draft after a failed request', async () => {
    let rejectRequest: (cause: unknown) => void = () => {};
    vi.mocked(createDiscussionPost).mockImplementationOnce(() => new Promise((_, reject) => { rejectRequest = reject; }));
    await mount(); await fill(); await submit(); await submit();
    expect(createDiscussionPost).toHaveBeenCalledOnce();
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    await act(async () => rejectRequest(new ApiClientError('NETWORK_ERROR', '연결을 확인해 주세요.')));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('연결을 확인');
    expect(container.querySelector<HTMLInputElement>('#discussion-title')?.value).toContain('유실물센터 안내');
    await submit(); expect(createDiscussionPost).toHaveBeenCalledTimes(2);
  });
  it('returns to the login gate when a create request reports an expired session', async () => {
    vi.mocked(createDiscussionPost).mockRejectedValue(new ApiClientError('HTTP_ERROR', 'Unauthorized', 401));
    await mount(); await fill(); await submit();
    expect(app.value.logout).toHaveBeenCalledOnce(); expect(container.textContent).toContain('로그인이 만료되었어요');
    expect(container.querySelector('form')).toBeNull();
  });
  it('ignores the previous author’s success and cannot unlock a new author’s pending submission', async () => {
    let resolveFirst: (post: DiscussionPost) => void = () => {};
    let resolveSecond: (post: DiscussionPost) => void = () => {};
    vi.mocked(createDiscussionPost)
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve; }));
    await mount(); await fill(); await submit();
    app.value = { ...app.value, authUser: { id: 3 } }; await mount();
    expect(container.querySelector<HTMLInputElement>('#discussion-title')?.value).toBe('');
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    await fill(); await submit();
    await act(async () => resolveFirst(POST));
    expect(container.querySelector('output')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    await submit(); expect(createDiscussionPost).toHaveBeenCalledTimes(2);
    await act(async () => resolveSecond({ ...POST, id: 32 }));
    expect(container.querySelector('output')?.textContent).toContain('/community/posts/32');
  });
  it('does not log out or change the new author’s draft after a previous author’s expired-session response', async () => {
    let rejectFirst: (cause: unknown) => void = () => {};
    vi.mocked(createDiscussionPost).mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject; }));
    await mount(); await fill(); await submit();
    app.value = { ...app.value, authUser: { id: 3 } }; await mount();
    await setField('#discussion-title', '새 회원이 작성 중인 이야기');
    await act(async () => rejectFirst(new ApiClientError('HTTP_ERROR', 'Old session expired', 401)));
    expect(app.value.logout).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLInputElement>('#discussion-title')?.value).toBe('새 회원이 작성 중인 이야기');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('form')).not.toBeNull();
  });
});

describe('community discussion detail', () => {
  it('reads publicly and shows the separate linked item button with a return path to the discussion', async () => {
    app.value = { ...app.value, isLoggedIn: false, authUser: null };
    vi.mocked(getDiscussionPost).mockResolvedValue({ ...POST, linkedItem: { id: 8, type: 'found', title: FOUND.title }, imageUrl: '/api/images/12345678-1234-1234-1234-123456789abc.png' });
    await mount('/community/posts/31', { communityReturnTo: '/community?category=info' }, true);
    expect(getDiscussionPost).toHaveBeenCalledWith(31);
    expect(container.querySelector('article h1')?.textContent).toBe(POST.title);
    expect(container.querySelector('.discussion-article-body p')?.textContent).toBe(POST.content);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('http://localhost:8080/api/images/12345678-1234-1234-1234-123456789abc.png');
    expect(container.querySelector('a[href="/community?category=info"]')).not.toBeNull();
    const itemLink = container.querySelector<HTMLAnchorElement>('a[href="/items/api-found-8"]')!;
    expect(itemLink.textContent).toContain('물품글 보기');
    await act(async () => itemLink.click());
    expect(container.querySelector('output')?.textContent).toContain('"communityReturnTo":"/community/posts/31"');
    expect(container.querySelector('output')?.textContent).toContain('"communityListReturnTo":"/community?category=info"');
  });
  it('omits unrelated item UI and rejects unexpected image paths and unsafe return state', async () => {
    vi.mocked(getDiscussionPost).mockResolvedValue({ ...POST, imageUrl: 'https://untrusted.example/photo.png' });
    await mount('/community/posts/31', { communityReturnTo: '//untrusted.example' }, true);
    expect(container.querySelector('img')).toBeNull(); expect(container.querySelector('.discussion-linked-card')).toBeNull();
    expect(container.querySelector('a[href="/community"]')).not.toBeNull();
  });
  it('shows loading, a recoverable error and the post after a retry', async () => {
    let rejectRequest: (cause: unknown) => void = () => {};
    vi.mocked(getDiscussionPost).mockImplementationOnce(() => new Promise((_, reject) => { rejectRequest = reject; }));
    await mount('/community/posts/31', undefined, true);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('불러오고');
    await act(async () => rejectRequest(new ApiClientError('HTTP_ERROR', 'Gone', 404)));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('찾을 수 없어요');
    await click('다시 불러오기'); expect(container.querySelector('article h1')?.textContent).toBe(POST.title);
  });
  it('does not send malformed route identifiers to the server', async () => {
    await mount('/community/posts/zero', undefined, true);
    expect(getDiscussionPost).not.toHaveBeenCalled(); expect(container.querySelector('[role="alert"]')?.textContent).toContain('주소를 확인');
  });
});
