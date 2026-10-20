// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../services/apiClient';
import { deleteServerItem, getServerItem } from '../services/itemApi';
import { getPoliceItem } from '../services/publicItemApi';
import type { Item, ReturnRequest } from '../types';
import ItemDetailPage from './ItemDetailPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const app = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../context/AppContext', () => ({ useApp: () => app.value }));
vi.mock('../services/itemApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/itemApi')>(),
  getServerItem: vi.fn(), deleteServerItem: vi.fn(),
}));
vi.mock('../services/publicItemApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/publicItemApi')>(), getPoliceItem: vi.fn(),
}));

const found: Item = {
  id: 'api-found-7', title: '검은색 지갑', type: 'found', category: '지갑', color: '검정', date: '2026-10-01',
  location: '서울역', region: '서울', description: '안쪽에 작은 스티커가 있는 지갑입니다.', image: '/images/wallet.svg',
  source: 'community', createdBy: 'server', serverId: 7, ownerId: 2, status: 'open',
  ownershipQuestion: '안쪽 스티커의 색상은?', ownershipConfigured: true,
};
const lost: Item = { ...found, id: 'api-lost-8', type: 'lost', serverId: 8, ownershipQuestion: undefined, ownershipConfigured: undefined };
const request = (extra: Partial<ReturnRequest> = {}): ReturnRequest => ({
  id: '11', itemId: found.id, status: 'pending', requesterId: 3, finderId: 2,
  createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z', ...extra,
});
let container: HTMLDivElement;
let root: Root;
const nativeShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const nativeClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

beforeAll(() => {
  // jsdom does not implement native modal dialogs. Preserve their visible open/closed behavior for interaction tests.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
});
afterAll(() => {
  if (nativeShowModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', nativeShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (nativeClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', nativeClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
beforeEach(() => {
  vi.clearAllMocks();
  app.value = { items: [], requests: [], isLoggedIn: true, authUser: { id: 2, role: 'USER' }, logout: vi.fn(), createRequest: vi.fn() };
  vi.mocked(deleteServerItem).mockResolvedValue(undefined);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{JSON.stringify({ pathname: location.pathname, state: location.state })}</output>;
}
async function render(item: Item, state?: Record<string, unknown>) {
  if (item.source === 'public') vi.mocked(getPoliceItem).mockResolvedValue(item);
  else vi.mocked(getServerItem).mockResolvedValue(item);
  await act(async () => { root.render(<MemoryRouter initialEntries={[{ pathname: `/items/${item.id}`, state }]}><LocationProbe /><Routes>
    <Route path="/items/:id" element={<ItemDetailPage />} />
    <Route path="/community/posts/:id" element={<p>커뮤니티 글</p>} />
    <Route path="/mypage" element={<p>내 등록 물품</p>} />
    <Route path="/login" element={<p>로그인</p>} />
  </Routes></MemoryRouter>); });
}
function button(label: string, scope: ParentNode = container): HTMLButtonElement {
  const match = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(entry => entry.textContent === label);
  expect(match, `button with label ${label}`).toBeDefined();
  return match!;
}
async function click(element: HTMLElement) { await act(async () => { element.click(); }); }
async function confirmDeletion() { await click(button('물품글 삭제')); }
function location() { return JSON.parse(container.querySelector('[data-testid="location"]')!.textContent!) as { pathname: string; state: unknown }; }

describe('linked item return navigation', () => {
  it.each(['/community', '/community?category=chat&q=%EC%A7%80%EA%B0%91', '/community/posts/42'])('returns to the originating discussion path %s', async communityReturnTo => {
    app.value.isLoggedIn = false; app.value.authUser = null;
    await render(found, { communityReturnTo });
    const back = container.querySelector<HTMLAnchorElement>('a.detail-back')!;
    expect(back.getAttribute('href')).toBe(communityReturnTo);
    expect(back.textContent).toContain('커뮤니티로 돌아가기');
  });

  it.each(['//example.com', '/community-other', '/community/posts/0', '/community/posts/-1', '/community/posts/1/edit', '/community/../search', '/community\n'])('falls back to item search for an unrecognized return path %s', async communityReturnTo => {
    app.value.isLoggedIn = false; app.value.authUser = null;
    await render(found, { communityReturnTo });
    const back = container.querySelector<HTMLAnchorElement>('a.detail-back')!;
    expect(back.getAttribute('href')).toBe('/search');
    expect(back.textContent).toContain('물품 목록으로 돌아가기');
  });

  it.each(['/community', '/community?category=info&q=%EC%84%BC%ED%84%B0&page=2'])('preserves the board filters when returning through a discussion from its item %s', async communityListReturnTo => {
    app.value.isLoggedIn = false; app.value.authUser = null;
    await render(found, { communityReturnTo: '/community/posts/42', communityListReturnTo });
    await click(container.querySelector<HTMLAnchorElement>('a.detail-back')!);
    expect(location()).toEqual({ pathname: '/community/posts/42', state: { communityReturnTo: communityListReturnTo } });
  });

  it.each(['//example.com', '/community/posts/1', '/community\n'])('discards an invalid board return state %s', async communityListReturnTo => {
    app.value.isLoggedIn = false; app.value.authUser = null;
    await render(found, { communityReturnTo: '/community/posts/42', communityListReturnTo });
    await click(container.querySelector<HTMLAnchorElement>('a.detail-back')!);
    expect(location()).toEqual({ pathname: '/community/posts/42', state: null });
  });
});

describe('author-only item management', () => {
  it('offers one unified edit entry for found items without a separate ownership-question menu or inline form', async () => {
    await render(found);
    const menu = container.querySelector('.item-management-options')!;
    expect(menu.querySelector('a[href="/items/api-found-7/edit"]')?.textContent).toBe('물품글 수정');
    expect(menu.querySelectorAll('a')).toHaveLength(1);
    expect(menu.textContent).not.toContain('소유자 확인 질문');
    expect(button('물품글 삭제', menu).disabled).toBe(false);
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('a[href="/admin"]')?.textContent).toContain('내 습득물 반환 관리');
  });

  it('offers lost-item editing and deletion without ownership-question controls', async () => {
    await render(lost);
    const menu = container.querySelector('.item-management-options')!;
    expect(menu.querySelector('a[href="/items/api-lost-8/edit"]')?.textContent).toBe('물품글 수정');
    expect(button('물품글 삭제', menu).disabled).toBe(false);
    expect(menu.textContent).not.toContain('소유자 확인 질문');
  });

  it.each([
    { label: 'another member', user: { id: 3, role: 'USER' } },
    { label: 'a non-author administrator', user: { id: 9, role: 'ADMIN' } },
    { label: 'a visitor', user: null },
  ])('hides author controls from $label', async ({ user }) => {
    app.value.authUser = user; app.value.isLoggedIn = user !== null;
    await render(found);
    expect(container.querySelector('.item-management')).toBeNull();
    expect(container.querySelector('dialog')).toBeNull();
  });

  it('never shows management controls for police public-data items', async () => {
    await render({ ...found, id: 'police-found-F2026100500001930-1', source: 'public', createdBy: 'police', serverId: undefined });
    expect(container.querySelector('.item-management')).toBeNull();
    expect(container.querySelector('a[href*="/edit"]')).toBeNull();
  });

  it.each([
    { label: 'a returned found item', item: { ...found, status: 'returned' as const }, returns: [] },
    { label: 'a found item with an active request', item: found, returns: [request({ status: 'owner_verified' })] },
    { label: 'a lost item linked to an active request', item: lost, returns: [request({ lostItemId: lost.id })] },
  ])('disables editing and deletion for $label', async ({ item, returns }) => {
    app.value.requests = returns;
    await render(item);
    const menu = container.querySelector('.item-management-options')!;
    expect(menu.querySelector('a')).toBeNull();
    expect([...menu.querySelectorAll<HTMLButtonElement>('button')].every(entry => entry.disabled)).toBe(true);
    expect(menu.textContent).toContain('반환이 진행 중이거나 완료된 글은 수정·삭제할 수 없어요.');
    await click(button('물품글 삭제', menu));
    expect(container.querySelector('dialog')?.open).toBe(false);
    expect(deleteServerItem).not.toHaveBeenCalled();
  });

  it('allows management again after the only linked return request was rejected', async () => {
    app.value.requests = [request({ status: 'rejected', lostItemId: lost.id })];
    await render(lost);
    expect(container.querySelector('a[href="/items/api-lost-8/edit"]')).not.toBeNull();
    expect(button('물품글 삭제').disabled).toBe(false);
  });
});

describe('item deletion confirmation', () => {
  it('allows cancellation without deleting the item', async () => {
    await render(found); await confirmDeletion();
    const dialog = container.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain(found.title);
    await click(button('취소', dialog));
    expect(dialog.open).toBe(false);
    expect(deleteServerItem).not.toHaveBeenCalled();
    expect(location().pathname).toBe(`/items/${found.id}`);
  });

  it('refreshes item records and returns to My Page after a successful deletion', async () => {
    const changed = vi.fn(); window.addEventListener('lostquest:data-changed', changed);
    try {
      await render(found); await confirmDeletion(); await click(button('삭제하기'));
      expect(deleteServerItem).toHaveBeenCalledExactlyOnceWith('found', 7);
      expect(changed).toHaveBeenCalledTimes(1);
      expect(location()).toEqual({ pathname: '/mypage', state: { itemDeleted: true } });
    } finally { window.removeEventListener('lostquest:data-changed', changed); }
  });

  it('keeps a server conflict visible in the confirmation dialog without navigating', async () => {
    vi.mocked(deleteServerItem).mockRejectedValue(new ApiClientError('HTTP_ERROR', '반환 요청이 진행 중이거나 완료된 물품은 삭제할 수 없습니다.', 409));
    await render(found); await confirmDeletion(); await click(button('삭제하기'));
    const dialog = container.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('반환 요청이 진행 중이거나 완료된 물품은 삭제할 수 없습니다.');
    expect(button('취소', dialog).disabled).toBe(false);
    expect(location().pathname).toBe(`/items/${found.id}`);
    expect(deleteServerItem).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate deletion and dialog dismissal while the first request is pending', async () => {
    let finish!: () => void;
    vi.mocked(deleteServerItem).mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    await render(lost); await confirmDeletion();
    const remove = button('삭제하기');
    await act(async () => { remove.click(); remove.click(); });
    const dialog = container.querySelector('dialog')!;
    expect(deleteServerItem).toHaveBeenCalledExactlyOnceWith('lost', 8);
    expect(button('삭제 중…', dialog).disabled).toBe(true);
    expect(button('취소', dialog).disabled).toBe(true);
    await act(async () => { dialog.dispatchEvent(new Event('cancel', { cancelable: true })); dialog.click(); });
    expect(dialog.open).toBe(true);
    await act(async () => { finish(); });
    expect(location()).toEqual({ pathname: '/mypage', state: { itemDeleted: true } });
  });
});

it('excludes deleted items preserved in return history from related-item recommendations', async () => {
  app.value.items = [{ ...lost, id: 'api-lost-20', title: '삭제된 지갑 글', status: 'closed' }, { ...lost, id: 'api-lost-21', title: '아직 찾는 지갑' }];
  await render(found);
  const related = container.querySelector('.detail-related')!;
  expect(related.textContent).toContain('아직 찾는 지갑');
  expect(related.textContent).not.toContain('삭제된 지갑 글');
});
