import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Compass, HeartHandshake, LockKeyhole, Mail, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { describeAuthError } from '../services/authApi'
import { EMAIL_MESSAGE, isValidSignupEmail } from '../services/emailValidation'
import './JourneyPages.css'

export default function AuthPage() {
  const { isLoggedIn, login, signup, profile, authUser } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const isSignup = location.pathname === '/signup'
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const params = new URLSearchParams(location.search)
  const requestedPath = params.get('returnTo') || '/mypage'
  const returnTo = requestedPath.startsWith('/') && !requestedPath.startsWith('//') && !requestedPath.includes('\\') ? requestedPath : '/mypage'
  const authSearch = params.has('returnTo') ? `?returnTo=${encodeURIComponent(returnTo)}` : ''

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    if (isSignup && !nickname.trim()) { setError('닉네임을 입력해 주세요.'); return }
    if (!email.trim()) { setError('이메일을 입력해 주세요.'); return }
    if (isSignup && !isValidSignupEmail(email)) { setError(EMAIL_MESSAGE); return }
    if (!password) { setError('비밀번호를 입력해 주세요.'); return }
    if (isSignup && password.length < 8) { setError('비밀번호는 8자 이상이어야 해요.'); return }
    if (isSignup && !agreed) { setError('회원 정보 저장 안내에 동의해 주세요.'); return }
    setSubmitting(true)
    try {
      if (isSignup) await signup({ email, password, nickname })
      else await login(email, password)
      setPassword('')
      navigate(returnTo, { replace: true })
    } catch (caught) {
      setError(describeAuthError(caught))
    } finally {
      setSubmitting(false)
    }
  }
  const edit = (setter: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement>) => { setter(event.target.value); setError('') }

  return <div className="page-container auth-page">
    <Link to="/" className="text-link auth-back"><ArrowLeft size={17} /> 홈으로 돌아가기</Link>
    <div className="auth-layout card">
      <section className="auth-story">
        <div className="auth-story-brand"><Compass size={26} /> LOST QUEST</div>
        <span className="auth-kicker">함께 찾는 소중한 일상</span>
        <h1>잃어버린 순간에서,<br />다시 만나는 순간까지.</h1>
        <p>당신의 소중한 물건을 찾는 여정.<br />이제 혼자가 아닌, 우리 함께해요.</p>
        <div className="auth-orbit" aria-hidden="true">
          <div className="auth-orbit-ring" /><div className="auth-orbit-ring inner" />
          <div className="auth-compass"><Compass size={76} strokeWidth={1.3} /></div>
          <span className="auth-orbit-chip one"><Sparkles size={16} /> 소중한 연결</span>
          <span className="auth-orbit-chip two"><HeartHandshake size={17} /> 작은 친절의 시작</span>
        </div>
        <div className="auth-story-foot"><ShieldCheck size={18} /> 함께 찾고, 안전하게 돌려주는 공간</div>
      </section>
      <section className="auth-form-side">
        {isLoggedIn ? <div className="auth-welcome">
          <span className="auth-welcome-icon"><Check size={29} /></span>
          <span className="eyebrow">당신의 여정이 준비됐어요</span>
          <h2>{profile.name}님,<br />다시 만나 반가워요!</h2>
          <p className="muted">{authUser?.email} 계정으로 로그인되어 있어요.<br />소중한 물건을 찾는 여정을 이어가세요.</p>
          <Link className="button button-primary" to={returnTo}>계속 둘러보기 <ArrowRight size={17} /></Link>
        </div> : <>
          <span className="eyebrow">로스트퀘스트에 오신 것을 환영해요</span>
          <h2>{isSignup ? '함께 찾는 여정의 시작' : '다시 만나 반가워요'}</h2>
          <p className="muted">{isSignup ? '계정을 만들고 LOST QUEST를 시작해 보세요.' : '작은 친절이 모여, 소중한 일상을 되찾아요.'}</p>
          <div className="auth-tabs">
            <Link className={!isSignup ? 'active' : ''} to={`/login${authSearch}`}>로그인</Link>
            <Link className={isSignup ? 'active' : ''} to={`/signup${authSearch}`}>회원가입</Link>
          </div>
          <form onSubmit={submit} className="auth-form" noValidate>
            {isSignup && <div className="form-field"><label htmlFor="auth-nickname">닉네임</label><div className="auth-input"><UserRound size={18} /><input id="auth-nickname" value={nickname} onChange={edit(setNickname)} maxLength={20} autoComplete="nickname" placeholder="사용할 닉네임" /></div></div>}
            <div className="form-field"><label htmlFor="auth-email">이메일</label><div className="auth-input"><Mail size={18} /><input id="auth-email" type="email" value={email} onChange={edit(setEmail)} maxLength={254} autoComplete="email" placeholder="you@example.com" /></div></div>
            <div className="form-field"><label htmlFor="auth-password">비밀번호</label><div className="auth-input"><LockKeyhole size={18} /><input id="auth-password" type="password" value={password} onChange={edit(setPassword)} maxLength={64} autoComplete={isSignup ? 'new-password' : 'current-password'} placeholder={isSignup ? '8자 이상' : '비밀번호'} /></div>{isSignup && <small className="muted">8~64자로 입력해 주세요. 비밀번호는 암호화되어 저장돼요.</small>}</div>
            {isSignup && <label className="auth-agree"><input type="checkbox" checked={agreed} onChange={event => { setAgreed(event.target.checked); setError('') }} /><span>로그인을 위해 이메일과 닉네임이 저장되는 것에 동의해요.</span></label>}
            {error && <p className="field-error" role="alert" style={{ whiteSpace: 'pre-line' }}>{error}</p>}
            <button type="submit" className="button button-primary auth-submit" disabled={submitting} aria-busy={submitting}>{submitting ? '처리 중이에요…' : isSignup ? '가입하고 시작하기' : '로그인'} <ArrowRight size={18} /></button>
          </form>
          <div className="auth-demo-note"><ShieldCheck size={20} /><div><strong>안전하게 로그인해요</strong><p>회원·등록 물품·반환 기록과 경험치는 계정에 저장돼요. 로그인 상태는 이 브라우저 탭에서만 유지됩니다.</p></div></div>
          <p className="auth-browse">아직 둘러보는 중인가요? <Link to="/search">로그인 없이 물품 찾기 <ArrowRight size={14} /></Link></p>
        </>}
      </section>
    </div>
  </div>
}

