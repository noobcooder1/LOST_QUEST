import { useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, LoaderCircle, UserRound } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { describeAuthError, MAX_NICKNAME_LENGTH } from '../services/authApi';
import './ProfileSettings.css';

/** My page "내 정보": nickname and password changes. The email is the login ID and stays fixed. */
export default function ProfileSettings() {
  const { authUser, updateNickname, changePassword } = useApp();
  const [nickname, setNickname] = useState(authUser?.nickname ?? '');
  const [nicknameState, setNicknameState] = useState<{ saving: boolean; error: string; done: string }>({ saving: false, error: '', done: '' });
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [passwordState, setPasswordState] = useState<{ saving: boolean; error: string; done: string }>({ saving: false, error: '', done: '' });

  async function saveNickname(event: FormEvent) {
    event.preventDefault();
    if (nicknameState.saving) return;
    const value = nickname.trim();
    if (!value) { setNicknameState({ saving: false, error: '닉네임을 입력해 주세요.', done: '' }); return; }
    if (value === authUser?.nickname) { setNicknameState({ saving: false, error: '지금 쓰고 있는 닉네임이에요.', done: '' }); return; }
    setNicknameState({ saving: true, error: '', done: '' });
    try {
      await updateNickname(value);
      setNickname(value);
      setNicknameState({ saving: false, error: '', done: '닉네임을 바꿨어요. 내가 쓴 글과 댓글에도 새 닉네임이 보여요.' });
    } catch (cause) {
      setNicknameState({ saving: false, error: describeAuthError(cause), done: '' });
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (passwordState.saving) return;
    const fail = (error: string) => setPasswordState({ saving: false, error, done: '' });
    if (!passwords.current) return fail('현재 비밀번호를 입력해 주세요.');
    if (passwords.next.length < 8) return fail('새 비밀번호는 8자 이상으로 입력해 주세요.');
    if (passwords.next !== passwords.confirm) return fail('새 비밀번호 확인이 일치하지 않아요.');
    setPasswordState({ saving: true, error: '', done: '' });
    try {
      await changePassword(passwords.current, passwords.next);
      setPasswords({ current: '', next: '', confirm: '' });
      setPasswordState({ saving: false, error: '', done: '비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 사용해 주세요.' });
    } catch (cause) {
      fail(describeAuthError(cause));
    }
  }

  const editPassword = (key: keyof typeof passwords) => (value: string) => {
    setPasswords(previous => ({ ...previous, [key]: value }));
    if (passwordState.error || passwordState.done) setPasswordState(previous => ({ ...previous, error: '', done: '' }));
  };

  return <section id="profile-settings" className="profile-settings" aria-labelledby="profile-settings-title">
    <div className="workflow-section-heading"><h2 id="profile-settings-title">내 정보</h2><span className="muted">로그인 이메일 {authUser?.email}</span></div>
    <form className="card profile-settings-card" onSubmit={event => void saveNickname(event)} noValidate>
      <h3><UserRound size={18} aria-hidden="true" />닉네임</h3>
      <p className="muted">커뮤니티 글과 댓글에 표시되는 이름이에요.</p>
      <label className="form-field" htmlFor="profile-nickname">새 닉네임
        <input id="profile-nickname" value={nickname} maxLength={MAX_NICKNAME_LENGTH} autoComplete="nickname"
          onChange={event => { setNickname(event.target.value); setNicknameState({ saving: false, error: '', done: '' }); }} />
      </label>
      <div className="profile-settings-actions"><small>{nickname.trim().length} / {MAX_NICKNAME_LENGTH}</small>
        <button type="submit" className="button button-primary" disabled={nicknameState.saving}>{nicknameState.saving && <LoaderCircle size={16} className="spin" aria-hidden="true" />}닉네임 저장</button></div>
      {nicknameState.error && <p className="field-error" role="alert">{nicknameState.error}</p>}
      {nicknameState.done && <p className="profile-settings-done" role="status"><CheckCircle2 size={16} aria-hidden="true" />{nicknameState.done}</p>}
    </form>
    <form className="card profile-settings-card" onSubmit={event => void savePassword(event)} noValidate>
      <h3><KeyRound size={18} aria-hidden="true" />비밀번호 변경</h3>
      <p className="muted">현재 비밀번호를 확인한 뒤 바꿔요.</p>
      <label className="form-field" htmlFor="profile-current-password">현재 비밀번호
        <input id="profile-current-password" type="password" value={passwords.current} maxLength={64} autoComplete="current-password" onChange={event => editPassword('current')(event.target.value)} />
      </label>
      <label className="form-field" htmlFor="profile-new-password">새 비밀번호
        <input id="profile-new-password" type="password" value={passwords.next} maxLength={64} autoComplete="new-password" placeholder="8자 이상" onChange={event => editPassword('next')(event.target.value)} />
      </label>
      <label className="form-field" htmlFor="profile-confirm-password">새 비밀번호 확인
        <input id="profile-confirm-password" type="password" value={passwords.confirm} maxLength={64} autoComplete="new-password" onChange={event => editPassword('confirm')(event.target.value)} />
      </label>
      <div className="profile-settings-actions"><span />
        <button type="submit" className="button button-primary" disabled={passwordState.saving}>{passwordState.saving && <LoaderCircle size={16} className="spin" aria-hidden="true" />}비밀번호 변경</button></div>
      {passwordState.error && <p className="field-error" role="alert">{passwordState.error}</p>}
      {passwordState.done && <p className="profile-settings-done" role="status"><CheckCircle2 size={16} aria-hidden="true" />{passwordState.done}</p>}
    </form>
  </section>;
}
