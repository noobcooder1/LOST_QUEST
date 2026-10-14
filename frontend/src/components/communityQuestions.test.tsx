// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CommunityQuestions from './CommunityQuestions';
import CommunityPanel from './CommunityPanel';
import CommunityInboxPage from '../pages/CommunityInboxPage';
import { answerCommunityQuestion, askCommunityQuestion, listCommunityQuestions, type CommunityQuestion } from '../services/communityApi';
import { ApiClientError } from '../services/apiClient';
import type { Item } from '../types';
const account = vi.hoisted(() => ({ loggedIn: true, id: 2 }));
vi.mock('../context/AppContext', () => ({ useApp: () => ({ isLoggedIn: account.loggedIn, authUser: account.loggedIn ? { id: account.id, role: 'USER' } : null }) }));
vi.mock('../services/communityApi', () => ({ listCommunityQuestions: vi.fn(), askCommunityQuestion: vi.fn(), answerCommunityQuestion: vi.fn(), reportCommunityPost: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const item: Item = { id: 'api-found-9', serverId: 9, ownerId: 1, createdBy: 'server', title: '지갑', type: 'found', category: '지갑', color: '검정', date: '2026-10-13', region: '서울', location: '서울역', description: '지갑', image: '/images/wallet.svg', source: 'community', status: 'open' };
const row: CommunityQuestion = { id: 1, itemType: 'found', itemId: 9, itemTitle: '지갑', question: '스티커가 있나요?', answer: null, createdAt: '2026-10-13T00:00:00Z', answeredAt: null, canAnswer: false };
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks(); account.loggedIn = true; account.id = 2;
  vi.mocked(listCommunityQuestions).mockResolvedValue({ items: [], page: 0, hasNext: false });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function mount(element: React.ReactNode) { await act(async () => { root.render(<MemoryRouter>{element}</MemoryRouter>); }); }
async function fill(value: string) {
  const input = container.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function submit() { await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); }
describe('community private correspondence UI', () => {
  it('guides visitors to login without querying private records', async () => {
    account.loggedIn = false; await mount(<CommunityPanel item={item} />);
    expect(container.textContent).toContain('로그인 후 질문하기'); expect(listCommunityQuestions).not.toHaveBeenCalled();
  });
  it('sends a private question, displays its state and does not claim ownership verification', async () => {
    vi.mocked(askCommunityQuestion).mockResolvedValue(row);
    await mount(<CommunityQuestions item={item} />); await fill(row.question);
    vi.mocked(listCommunityQuestions).mockResolvedValue({ items: [row], page: 0, hasNext: false });
    await submit(); expect(askCommunityQuestion).toHaveBeenCalledWith('api-found-9', row.question);
    expect(container.textContent).toContain('답변 대기'); expect(container.textContent).toContain('답변만으로 소유자 인증이 완료되지는 않습니다');
    expect(container.textContent).not.toContain('질문 답변');
  });
  it('lets the author answer once and links to the existing return flow', async () => {
    account.id = 1;
    vi.mocked(listCommunityQuestions).mockResolvedValue({ items: [{ ...row, canAnswer: true }], page: 0, hasNext: false });
    const answered = { ...row, canAnswer: true, answer: '반환 절차로 진행해 주세요.', answeredAt: row.createdAt };
    vi.mocked(answerCommunityQuestion).mockResolvedValue(answered);
    await mount(<CommunityQuestions item={item} />); await fill(answered.answer);
    vi.mocked(listCommunityQuestions).mockResolvedValue({ items: [answered], page: 0, hasNext: false });
    await submit(); expect(answerCommunityQuestion).toHaveBeenCalledWith(1, answered.answer);
    expect(container.textContent).toContain('답변 완료'); expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('a[href="/items/api-found-9"]')).not.toBeNull();
  });
  it('escapes message text rather than injecting HTML', async () => {
    vi.mocked(listCommunityQuestions).mockResolvedValue({ items: [{ ...row, question: '<script>danger()</script>' }], page: 0, hasNext: false });
    await mount(<CommunityQuestions />); expect(container.querySelector('script')).toBeNull(); expect(container.textContent).toContain('<script>danger()</script>');
  });
  it('does not automatically resend a failed write and offers explicit list recovery', async () => {
    vi.mocked(askCommunityQuestion).mockRejectedValue(new ApiClientError('NETWORK_ERROR', '서버 연결 실패'));
    await mount(<CommunityQuestions item={item} />); await fill('질문'); await submit();
    expect(askCommunityQuestion).toHaveBeenCalledTimes(1); expect(container.textContent).toContain('자동으로 재전송하지 않습니다');
    const retry = [...container.querySelectorAll('button')].find(button => button.textContent === '목록 다시 조회')!;
    await act(async () => retry.click()); expect(askCommunityQuestion).toHaveBeenCalledTimes(1);
  });
  it('removes private correspondence when the account logs out', async () => {
    vi.mocked(listCommunityQuestions).mockResolvedValue({ items: [row], page: 0, hasNext: false });
    await mount(<CommunityInboxPage />); expect(container.textContent).toContain(row.question);
    account.loggedIn = false; await mount(<CommunityInboxPage />);
    expect(container.textContent).not.toContain(row.question); expect(container.textContent).toContain('로그인하기');
  });
});
