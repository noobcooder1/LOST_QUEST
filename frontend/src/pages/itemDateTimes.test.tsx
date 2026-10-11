// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ItemCard from '../components/ItemCard';
import { createServerItem, fromServerItem, getServerItem } from '../services/itemApi';
import ItemDetailPage from './ItemDetailPage';
import RegisterPage from './RegisterPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('../context/AppContext', () => ({ useApp: () => ({
  items: [], requests: [], authUser: { id: 99 }, isLoggedIn: true, logout: vi.fn(), createRequest: vi.fn(),
}) }));
vi.mock('../context/MatchNotificationContext', () => ({ useMatchNotifications: () => ({ runRefresh: vi.fn() }) }));
vi.mock('../services/itemApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/itemApi')>(),
  getServerItem: vi.fn(), createServerItem: vi.fn(),
}));

const registeredAt = '2026-10-10T11:27:53.949063Z';
const item = (type: 'found' | 'lost', createdAt: string | undefined = registeredAt) => fromServerItem(type, {
  id: 2, userId: 3, title: '그림리퍼 피규어', category: '기타', color: '검정', description: '멋있게 생긴 그림리퍼 피규어입니다.',
  foundDate: '2026-09-16', lostDate: '2026-09-16', region: '경기', location: '신구대학교',
  status: type === 'found' ? 'STORED' : 'LOST', createdAt,
});
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks();
});
async function render(element: React.ReactNode, path = '/') {
  await act(async () => { root.render(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>); });
}
async function enter(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit() {
  await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}

it.each(['found', 'lost'] as const)('shows the %s event date and real Korean registration time separately on details', async (type) => {
  vi.mocked(getServerItem).mockResolvedValue(item(type));
  await render(<Routes><Route path="/items/:id" element={<ItemDetailPage />} /></Routes>, `/items/api-${type}-2`);
  const facts = container.querySelector('.detail-facts')!;
  expect(facts.textContent).toContain(`${type === 'found' ? '습득' : '분실'} 날짜2026. 09. 16`);
  expect(facts.textContent).toContain('글 등록일시2026. 10. 10 20:27:53한국 시간');
  expect(facts.querySelector('time')?.getAttribute('datetime')).toBe(registeredAt);
});

it('shows registration time on list cards but does not invent one for an unknown timestamp', async () => {
  await render(<><ItemCard item={item('found')} /><ItemCard item={{ ...item('lost'), createdAt: undefined }} /></>);
  const cards = container.querySelectorAll('.item-card');
  expect(cards[0].textContent).toContain('습득 2026.09.16');
  expect(cards[0].textContent).toContain('글 등록 2026. 10. 10 20:27:53 (한국 시간)');
  expect(cards[1].querySelector('.item-registration-time')).toBeNull();
});

it('defaults to Korean today instead of a sample date, and submits a chosen event date without a client timestamp', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T15:30:00Z'));
  vi.mocked(createServerItem).mockResolvedValue(item('found'));
  await render(<RegisterPage />, '/register?type=found');
  const date = container.querySelector<HTMLInputElement>('#item-date')!;
  expect(date.value).toBe('2026-10-10');
  expect(date.max).toBe('2026-10-10');
  await enter('#item-date', '2026-09-16');
  await submit();
  await enter('#ownership-question', '소품 색은?'); await enter('#ownership-answer', '검정');
  await submit();
  expect(createServerItem).toHaveBeenCalledWith('found', expect.objectContaining({ date: '2026-09-16' }), { image: null });
  expect(vi.mocked(createServerItem).mock.calls[0][1]).not.toHaveProperty('createdAt');
  expect(container.textContent).toContain('글 등록 2026. 10. 10 20:27:53 (한국 시간)');
});

it('rejects tomorrow using Korea time even if the browser clock uses another zone', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-09T15:30:00Z'));
  await render(<RegisterPage />, '/register');
  await enter('#item-date', '2026-10-11'); await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('미래 날짜는 선택할 수 없어요');
  expect(createServerItem).not.toHaveBeenCalled();
});
