// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiClientError } from '../services/apiClient';
import { getServerItem, updateServerItem } from '../services/itemApi';
import type { Item } from '../types';
import EditItemPage from './EditItemPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const app = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../context/AppContext', () => ({ useApp: () => app.value }));
vi.mock('../services/itemApi', async importOriginal => ({
  ...await importOriginal<typeof import('../services/itemApi')>(), getServerItem: vi.fn(), updateServerItem: vi.fn(),
}));

const ITEM: Item = { id: 'api-found-7', title: '검은색 지갑', type: 'found', category: '지갑', color: '검정', date: '2026-09-01', region: '서울',
  location: '서울역', description: '안쪽에 스티커가 있는 가죽 지갑입니다.', image: 'http://localhost:8080/api/images/12345678-1234-1234-1234-123456789abc.jpg',
  source: 'community', status: 'open', createdBy: 'server', ownerId: 2, serverId: 7, ownershipQuestion: '안쪽 스티커 색상은?', ownershipConfigured: true };
let container: HTMLDivElement;
let root: Root;

function DetailDestination() {
  const location = useLocation();
  return <div data-testid="detail-destination">{location.pathname}{location.state?.itemUpdated ? ' 수정 완료' : ''}</div>;
}
beforeEach(() => {
  vi.clearAllMocks();
  app.value = { authUser: { id: 2 }, isLoggedIn: true, authChecking: false, logout: vi.fn() };
  vi.mocked(getServerItem).mockResolvedValue(ITEM);
  vi.mocked(updateServerItem).mockResolvedValue(ITEM);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(path = '/items/api-found-7/edit') {
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/items/:id/edit" element={<EditItemPage />} />
    <Route path="/items/:id" element={<DetailDestination />} />
  </Routes></MemoryRouter>));
}
async function enter(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit() {
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}
async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(value => value.textContent?.includes(label));
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
async function optIntoOwnership() {
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
}

it('loads the author’s values and saves ordinary edits without replacing private ownership credentials', async () => {
  const changed = vi.fn(); window.addEventListener('lostquest:data-changed', changed);
  await render();
  expect(getServerItem).toHaveBeenCalledWith('found', 7);
  expect(container.querySelector<HTMLInputElement>('#edit-title')?.value).toBe(ITEM.title);
  expect(container.querySelector<HTMLTextAreaElement>('#edit-description')?.value).toBe(ITEM.description);
  expect(container.querySelector('#edit-ownership-answer')).toBeNull();
  await enter('#edit-title', '검은색 반지갑'); await submit();
  const [type, id, input, config] = vi.mocked(updateServerItem).mock.calls[0];
  expect([type, id]).toEqual(['found', 7]);
  expect(input.title).toBe('검은색 반지갑');
  expect(input).not.toHaveProperty('ownershipQuestion'); expect(input).not.toHaveProperty('ownershipAnswer');
  expect(input).not.toHaveProperty('ownerId'); expect(input).not.toHaveProperty('status');
  expect(config).toEqual({ image: null, removeImage: false });
  expect(changed).toHaveBeenCalledOnce();
  expect(container.textContent).toContain('/items/api-found-7 수정 완료');
  window.removeEventListener('lostquest:data-changed', changed);
});

it('requires a new answer only when explicitly changing the ownership question', async () => {
  await render(); await optIntoOwnership();
  expect(container.querySelector<HTMLInputElement>('#edit-ownership-question')?.value).toBe(ITEM.ownershipQuestion);
  expect(container.querySelector<HTMLInputElement>('#edit-ownership-answer')?.value).toBe('');
  await enter('#edit-ownership-question', '안쪽 스티커의 모양은?'); await submit();
  expect(updateServerItem).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('새 비공개 답변을 모두 입력');
  await enter('#edit-ownership-answer', '별'); await submit();
  expect(updateServerItem).toHaveBeenCalledWith('found', 7, expect.objectContaining({ ownershipQuestion: '안쪽 스티커의 모양은?', ownershipAnswer: '별' }), expect.any(Object));
});

it('opens the ownership fields and focuses the question when arriving from the question menu', async () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return 1; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  await render('/items/api-found-7/edit#ownership');
  expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
  expect(container.querySelector<HTMLInputElement>('#edit-ownership-question')?.value).toBe(ITEM.ownershipQuestion);
  expect(container.querySelector<HTMLInputElement>('#edit-ownership-answer')?.value).toBe('');
  await act(async () => frames[0](0));
  expect(document.activeElement).toBe(container.querySelector('#edit-ownership-question'));
});

it('keeps the existing private credentials after a question edit is opted out', async () => {
  await render(); await optIntoOwnership(); await enter('#edit-ownership-question', '새 질문'); await enter('#edit-ownership-answer', '새 답변');
  await optIntoOwnership(); await submit();
  expect(vi.mocked(updateServerItem).mock.calls[0][2]).not.toHaveProperty('ownershipAnswer');
});

it.each([
  { item: { ...ITEM, ownerId: 99 }, expected: '본인이 등록한 물품글만 수정' },
  { item: { ...ITEM, status: 'returned' as const }, expected: '반환이 완료된 물품글' },
  { item: { ...ITEM, status: 'closed' as const }, expected: '수정할 수 없는 물품글' },
])('prevents editing inaccessible items: $expected', async ({ item, expected }) => {
  vi.mocked(getServerItem).mockResolvedValue(item);
  await render();
  expect(container.textContent).toContain(expected); expect(container.querySelector('form')).toBeNull(); expect(updateServerItem).not.toHaveBeenCalled();
});

it('gates signed-out users and never requests a public-data item as a community registration', async () => {
  app.value = { ...app.value, authUser: null, isLoggedIn: false };
  await render();
  expect(getServerItem).not.toHaveBeenCalled();
  expect(container.querySelector('a[href^="/login?"]')?.getAttribute('href')).toContain('returnTo=%2Fitems%2Fapi-found-7%2Fedit');
  act(() => root.unmount()); root = createRoot(container);
  app.value = { ...app.value, authUser: { id: 2 }, isLoggedIn: true };
  await render('/items/police-99/edit');
  expect(container.textContent).toContain('직접 등록한 물품글만 수정'); expect(getServerItem).not.toHaveBeenCalled();
});

it('preserves edits and displays a server conflict when a return prevents saving', async () => {
  vi.mocked(updateServerItem).mockRejectedValueOnce(new ApiClientError('HTTP_ERROR', '반환 요청이 진행 중인 물품은 수정할 수 없습니다.', 409));
  await render(); await enter('#edit-title', '스티커가 있는 반지갑'); await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('반환 요청이 진행 중');
  expect(container.querySelector<HTMLInputElement>('#edit-title')?.value).toBe('스티커가 있는 반지갑');
  expect(container.querySelector('button[type="submit"]')?.hasAttribute('disabled')).toBe(false);
});

it('submits only once if save is triggered twice before the server responds', async () => {
  let resolve!: (value: Item) => void;
  vi.mocked(updateServerItem).mockReturnValueOnce(new Promise(value => { resolve = value; }));
  await render();
  await act(async () => {
    const form = container.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(updateServerItem).toHaveBeenCalledOnce();
  await act(async () => resolve(ITEM));
});

it('removes the stored photo only when selected and allows cancelling removal', async () => {
  await render(); await click('사진 제거');
  expect(container.querySelector('.edit-item-photo-state')?.textContent).toContain('저장하면 사진이 제거');
  await click('기존 사진으로 되돌리기');
  expect(container.querySelector('.edit-item-photo img')?.getAttribute('src')).toBe(ITEM.image);
  await click('사진 제거'); await submit();
  expect(vi.mocked(updateServerItem).mock.calls[0][3]).toEqual({ image: null, removeImage: true });
});

it('uploads the selected photo itself and does not submit while its preview is still being read', async () => {
  const readers: { result: string; onload: (() => void) | null; readAsDataURL: (file: File) => void }[] = [];
  vi.stubGlobal('FileReader', class {
    result = 'data:image/png;base64,AA=='; onload: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor() { readers.push(this); }
    readAsDataURL() {}
  });
  await render();
  const file = new File(['photo'], 'wallet.png', { type: 'image/png' });
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  await submit(); expect(updateServerItem).not.toHaveBeenCalled();
  await act(async () => readers[0].onload!());
  await submit();
  expect(vi.mocked(updateServerItem).mock.calls[0][3]).toEqual({ image: file, removeImage: false });
});

it('drops an expired session after saving is rejected with HTTP 401', async () => {
  vi.mocked(updateServerItem).mockRejectedValueOnce(new ApiClientError('HTTP_ERROR', '로그인이 만료되었습니다.', 401));
  await render(); await submit();
  expect(app.value.logout).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('로그인이 만료');
});

it('cancels back to the detail page without saving the edited fields', async () => {
  await render(); await enter('#edit-title', '저장하지 않을 제목'); await click('취소');
  expect(updateServerItem).not.toHaveBeenCalled(); expect(container.textContent).toBe('/items/api-found-7');
});
