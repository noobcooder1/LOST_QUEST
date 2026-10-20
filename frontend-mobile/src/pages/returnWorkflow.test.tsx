// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item, ReturnRequest } from '../types';
import AdminPage from './AdminPage';
import ReturnPage from './ReturnPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const app = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../context/AppContext', () => ({ useApp: () => app.value }));

const ITEM: Item = {
  id: 'api-found-7', title: '검은색 지갑', type: 'found', category: '지갑', color: '검정', date: '2026-10-01', region: '서울',
  location: '서울역', description: '안쪽에 스티커가 있는 지갑입니다', image: '/images/wallet.svg', source: 'community', status: 'open',
  createdBy: 'server', serverId: 7, ownerId: 2, ownershipQuestion: '안쪽 스티커 색상은?', ownershipConfigured: true,
};
const request = (status: ReturnRequest['status'], extra: Partial<ReturnRequest> = {}): ReturnRequest => ({
  id: '11', itemId: ITEM.id, status, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z', requesterId: 1, finderId: 2, ...extra,
});
const FINDER = { id: 2, role: 'USER' };
const ADMIN = { id: 9, role: 'ADMIN' };
const REQUESTER = { id: 1, role: 'USER' };

function setApp(user: { id: number; role: string }, requests: ReturnRequest[]) {
  app.value = {
    items: [ITEM], requests, isLoggedIn: true, authUser: user, activityLoading: false,
    approveRequest: vi.fn(), completeReturn: vi.fn().mockResolvedValue(undefined), rejectRequest: vi.fn(),
    verifyOwner: vi.fn(), verifyQr: vi.fn(), renewQr: vi.fn(), refreshData: vi.fn().mockResolvedValue(undefined),
  };
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(path: string) {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[path]}><Routes>
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/returns/:id" element={<ReturnPage />} />
    </Routes></MemoryRouter>);
  });
}
const buttons = () => [...container.querySelectorAll('button')].map((b) => b.textContent ?? '');
const text = () => container.textContent ?? '';

describe('final completion is admin-only in the UI', () => {
  it('does not show the completion button to the finder (a normal USER)', async () => {
    setApp(FINDER, [request('qr_verified')]);
    await render('/admin');
    expect(buttons().some((b) => b.includes('반환 완료'))).toBe(false);
    expect(text()).toContain('관리자의 최종 반환 확인을 기다리고 있어요');
  });

  it('shows the completion button to an ADMIN and calls the complete action', async () => {
    setApp(ADMIN, [request('qr_verified')]);
    await render('/admin');
    const complete = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('반환 완료'))!;
    expect(complete).toBeDefined();
    await act(async () => { complete.click(); });
    expect(app.value.completeReturn).toHaveBeenCalledWith('11');
  });

  it('links to final confirmation from the return page only for an ADMIN', async () => {
    setApp(FINDER, [request('qr_verified')]);
    await render('/returns/11');
    expect(container.querySelector('a[href="/admin"]')).toBeNull();
    expect(text()).toContain('관리자가 물품 전달을 최종 확인하면');
    act(() => root.unmount());
    root = createRoot(container);
    setApp(ADMIN, [request('qr_verified')]);
    await render('/returns/11');
    expect(container.querySelector('a[href="/admin"]')?.textContent).toContain('반환 완료 확인하기');
  });
});

describe('ownership answer limit', () => {
  it('shows the remaining attempts next to the answer form', async () => {
    setApp(REQUESTER, [request('pending', { ownershipAttemptsRemaining: 3, ownershipLocked: false })]);
    await render('/returns/11');
    expect(container.querySelector('form.owner-form')).not.toBeNull();
    expect(text()).toContain('남은 시도: 3회');
  });

  it('reloads the server state after a failed answer so the attempt counter is current', async () => {
    setApp(REQUESTER, [request('pending', { ownershipAttemptsRemaining: 5, ownershipLocked: false })]);
    app.value.verifyOwner = vi.fn().mockRejectedValue(new Error('비공개 특징이 일치하지 않습니다. 남은 시도: 4회'));
    await render('/returns/11');
    const refresh = app.value.refreshData as ReturnType<typeof vi.fn>;
    const before = refresh.mock.calls.length;
    const input = container.querySelector('form.owner-form input') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setValue.call(input, '빨간색'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { (container.querySelector('form.owner-form button') as HTMLButtonElement).click(); });
    expect(app.value.verifyOwner).toHaveBeenCalledWith('11', '빨간색');
    expect(refresh.mock.calls.length).toBeGreaterThan(before);
  });

  it('hides the form and explains the next step once the request is locked', async () => {
    setApp(REQUESTER, [request('pending', { ownershipAttemptsRemaining: 0, ownershipLocked: true })]);
    await render('/returns/11');
    expect(container.querySelector('form.owner-form')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('시도 횟수를 모두 사용했어요');
  });
});
