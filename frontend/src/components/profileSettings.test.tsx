// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../services/apiClient';
import ProfileSettings from './ProfileSettings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const app = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../context/AppContext', () => ({ useApp: () => app.value }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  app.value = { authUser: { id: 1, email: 'hunter@lostquest.test', nickname: '처음이름', role: 'USER' }, updateNickname: vi.fn().mockResolvedValue(undefined), changePassword: vi.fn().mockResolvedValue(undefined) };
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  act(() => root.render(<ProfileSettings />));
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function type(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function submit(index: number) {
  await act(async () => container.querySelectorAll('form')[index].dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}
const text = (index: number) => container.querySelectorAll('form')[index].textContent ?? '';

describe('ProfileSettings', () => {
  it('shows the login email and saves a changed, trimmed nickname', async () => {
    expect(container.textContent).toContain('hunter@lostquest.test');
    expect(container.querySelector<HTMLInputElement>('#profile-nickname')!.value).toBe('처음이름');
    await submit(0); expect(text(0)).toContain('지금 쓰고 있는 닉네임');
    await type('#profile-nickname', '   '); await submit(0); expect(text(0)).toContain('닉네임을 입력해 주세요');
    await type('#profile-nickname', '  비오는날우산 '); await submit(0);
    expect(app.value.updateNickname).toHaveBeenCalledWith('비오는날우산');
    expect(text(0)).toContain('닉네임을 바꿨어요');
  });
  it('validates and changes the password, clearing the fields only on success', async () => {
    await type('#profile-current-password', 'Quest1234!');
    await type('#profile-new-password', 'short'); await submit(1); expect(text(1)).toContain('8자 이상');
    await type('#profile-new-password', 'NewQuest5678!'); await type('#profile-confirm-password', 'Different1!'); await submit(1);
    expect(text(1)).toContain('일치하지 않아요'); expect(app.value.changePassword).not.toHaveBeenCalled();
    vi.mocked(app.value.changePassword as () => Promise<void>).mockRejectedValueOnce(new ApiClientError('HTTP_ERROR', '입력값을 확인해 주세요.', 400,
      { serverCode: 'VALIDATION_ERROR', fieldErrors: [{ field: 'currentPassword', message: '현재 비밀번호가 올바르지 않습니다.' }] }));
    await type('#profile-confirm-password', 'NewQuest5678!'); await submit(1);
    expect(text(1)).toContain('현재 비밀번호: 현재 비밀번호가 올바르지 않습니다.');
    expect(container.querySelector<HTMLInputElement>('#profile-new-password')!.value).toBe('NewQuest5678!');
    await submit(1);
    expect(app.value.changePassword).toHaveBeenLastCalledWith('Quest1234!', 'NewQuest5678!');
    expect(text(1)).toContain('비밀번호를 바꿨어요');
    expect(container.querySelector<HTMLInputElement>('#profile-current-password')!.value).toBe('');
  });
});
