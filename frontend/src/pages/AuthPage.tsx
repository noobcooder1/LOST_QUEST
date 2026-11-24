import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, LockKeyhole, Mail, UserRound } from 'lucide-react'
import GoogleSignInButton from '../components/GoogleSignInButton'
import Logo from '../components/Logo'
import { useApp } from '../context/AppContext'
import { ApiClientError } from '../services/apiClient'
import { describeAuthError } from '../services/authApi'
import { EMAIL_MESSAGE, isValidSignupEmail } from '../services/emailValidation'
import './JourneyPages.css'

function KakaoMark() {
  return (
    <svg className="auth-entry-kakao-mark" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#191919" d="M12 3C6.48 3 2 6.58 2 10.9c0 2.74 1.78 5.15 4.5 6.55-.15.54-.54 1.96-.62 2.27-.09.36.13.35.27.26.11-.07 1.78-1.21 2.5-1.7.77.11 1.56.17 2.35.17 5.52 0 10-3.58 10-7.9S17.52 3 12 3z" />
    </svg>
  )
}

export default function AuthPage() {
  const { isLoggedIn, login, loginWithGoogle, signup, profile, authUser } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const isSignup = location.pathname === '/signup'
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPasswordLogin, setShowPasswordLogin] = useState(false)
  /** Held only in memory while a new Google account waits for an email; Google's ID token expires within an hour. */
  const [googleCredential, setGoogleCredential] = useState<string | null>(null)
  const [googleEmail, setGoogleEmail] = useState('')
  const params = new URLSearchParams(location.search)
  const requestedPath = params.get('returnTo') || '/mypage'
  const returnTo = requestedPath.startsWith('/') && !requestedPath.startsWith('//') && !requestedPath.includes('\\') ? requestedPath : '/mypage'
  const authSearch = params.has('returnTo') ? `?returnTo=${encodeURIComponent(returnTo)}` : ''

  useEffect(() => {
    setShowPasswordLogin(false)
    setError('')
  }, [isSignup])

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

  async function continueWithGoogle(credential: string, enteredEmail?: string) {
    if (submitting) return
    setSubmitting(true); setError('')
    try {
      if (await loginWithGoogle(credential, enteredEmail) === 'EMAIL_REQUIRED') { setGoogleCredential(credential); return }
      setGoogleCredential(null); setGoogleEmail(''); setPassword('')
      navigate(returnTo, { replace: true })
    } catch (caught) {
      setError(describeAuthError(caught))
      // A rejected or expired Google token cannot be reused; the user signs in with Google again.
      if (caught instanceof ApiClientError && caught.status === 401) setGoogleCredential(null)
    } finally {
      setSubmitting(false)
    }
  }

  function submitGoogleEmail(event: React.FormEvent) {
    event.preventDefault()
    if (!googleCredential) return
    if (!googleEmail.trim()) { setError('이메일을 입력해 주세요.'); return }
    if (!isValidSignupEmail(googleEmail)) { setError(EMAIL_MESSAGE); return }
    void continueWithGoogle(googleCredential, googleEmail)
  }

  function cancelGoogleSignup() {
    setGoogleCredential(null); setGoogleEmail(''); setError('')
  }

  const edit = (setter: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement>) => { setter(event.target.value); setError('') }

  const brandHeader = (
    <div className="auth-brand-block">
      <Logo />
      <p className="auth-tagline">잃어버린 순간에서,<br />다시 만나는 순간까지.</p>
    </div>
  )

  const secondaryLinks = (
    <nav className="auth-secondary-links" aria-label="계정 안내">
      {isSignup
        ? <Link to={`/login${authSearch}`}>이미 계정이 있나요? 로그인</Link>
        : <Link to={`/signup${authSearch}`}>회원가입</Link>}
      <Link to="/search">로그인 없이 물품 찾기</Link>
    </nav>
  )

  const passwordForm = (
    <form onSubmit={submit} className="auth-form" noValidate>
      {isSignup && <div className="form-field"><label htmlFor="auth-nickname">닉네임</label><div className="auth-input"><UserRound size={18} /><input id="auth-nickname" value={nickname} onChange={edit(setNickname)} maxLength={20} autoComplete="nickname" placeholder="사용할 닉네임" /></div></div>}
      <div className="form-field"><label htmlFor="auth-email">이메일</label><div className="auth-input"><Mail size={18} /><input id="auth-email" type="email" value={email} onChange={edit(setEmail)} maxLength={254} autoComplete="email" placeholder="you@example.com" /></div></div>
      <div className="form-field"><label htmlFor="auth-password">비밀번호</label><div className="auth-input"><LockKeyhole size={18} /><input id="auth-password" type="password" value={password} onChange={edit(setPassword)} maxLength={64} autoComplete={isSignup ? 'new-password' : 'current-password'} placeholder={isSignup ? '8자 이상' : '비밀번호'} /></div>{isSignup && <small className="muted">8~64자로 입력해 주세요. 비밀번호는 암호화되어 저장돼요.</small>}</div>
      {isSignup && <label className="auth-agree"><input type="checkbox" checked={agreed} onChange={event => { setAgreed(event.target.checked); setError('') }} /><span>로그인을 위해 이메일과 닉네임이 저장되는 것에 동의해요.</span></label>}
      {error && <p className="field-error" role="alert" style={{ whiteSpace: 'pre-line' }}>{error}</p>}
      <button type="submit" className="button button-primary auth-submit" disabled={submitting} aria-busy={submitting}>{submitting ? '처리 중이에요…' : isSignup ? '가입하고 시작하기' : '로그인'} <ArrowRight size={18} /></button>
    </form>
  )

  return <div className="page-container auth-page">
    <div className="auth-layout">
      <section className="auth-panel">
        {isLoggedIn ? <div className="auth-welcome">
          {brandHeader}
          <span className="auth-welcome-icon"><Check size={29} /></span>
          <h2>{profile.name}님,<br />다시 만나 반가워요!</h2>
          <p className="muted">{authUser?.email} 계정으로 로그인되어 있어요.<br />소중한 물건을 찾는 여정을 이어가세요.</p>
          <Link className="button button-primary auth-submit" to={returnTo}>계속 둘러보기 <ArrowRight size={17} /></Link>
        </div> : googleCredential ? <>
          {brandHeader}
          <div className="auth-step-copy">
            <h2>이메일을 알려 주세요</h2>
            <p className="muted">구글 계정에서 확인된 이메일을 받지 못했어요.<br />로그인 계정에 저장할 이메일을 입력하면 가입이 끝나요.</p>
          </div>
          <form onSubmit={submitGoogleEmail} className="auth-form auth-google-email" noValidate>
            <div className="form-field"><label htmlFor="auth-google-email">이메일</label><div className="auth-input"><Mail size={18} /><input id="auth-google-email" type="email" value={googleEmail} onChange={edit(setGoogleEmail)} maxLength={254} autoComplete="email" placeholder="you@example.com" /></div><small className="muted">이메일과 구글 계정의 이름(닉네임)이 저장돼요. 다음부터는 구글 버튼으로 바로 로그인해요.</small></div>
            {error && <p className="field-error" role="alert" style={{ whiteSpace: 'pre-line' }}>{error}</p>}
            <button type="submit" className="button button-primary auth-submit" disabled={submitting} aria-busy={submitting}>{submitting ? '처리 중이에요…' : '이메일 등록하고 시작하기'} <ArrowRight size={18} /></button>
            <button type="button" className="button button-secondary auth-submit" disabled={submitting} onClick={cancelGoogleSignup}>취소</button>
          </form>
        </> : isSignup ? <>
          {brandHeader}
          <div className="auth-step-copy">
            <h2>함께 찾는 여정의 시작</h2>
            <p className="muted">계정을 만들고 LOST QUEST를 시작해 보세요.</p>
          </div>
          {passwordForm}
          <div className="auth-signup-google">
            <GoogleSignInButton variant="entry" mode="signup" disabled={submitting} onCredential={credential => void continueWithGoogle(credential)} />
          </div>
          {secondaryLinks}
        </> : showPasswordLogin ? <>
          {brandHeader}
          <div className="auth-step-copy">
            <button type="button" className="auth-step-back" onClick={() => { setShowPasswordLogin(false); setError('') }}>
              <ArrowLeft size={16} /> 다른 방법으로 로그인
            </button>
            <h2>일반 로그인</h2>
            <p className="muted">이메일과 비밀번호로 로그인해요.</p>
          </div>
          {passwordForm}
          {secondaryLinks}
        </> : <>
          {brandHeader}
          <div className="auth-entry-stack">
            <GoogleSignInButton variant="entry" mode="signin" disabled={submitting} onCredential={credential => void continueWithGoogle(credential)} />
            <button
              type="button"
              className="auth-entry-btn auth-entry-kakao"
              disabled
              aria-disabled="true"
              title="카카오 로그인은 준비 중이에요"
            >
              <KakaoMark />
              <span>카카오로 시작하기</span>
              <span className="auth-entry-soon">준비 중</span>
            </button>
            <button
              type="button"
              className="auth-entry-btn auth-entry-general"
              disabled={submitting}
              onClick={() => { setShowPasswordLogin(true); setError('') }}
            >
              <Mail size={18} aria-hidden="true" />
              <span>일반 로그인</span>
            </button>
          </div>
          {error && <p className="field-error auth-entry-error" role="alert" style={{ whiteSpace: 'pre-line' }}>{error}</p>}
          {secondaryLinks}
        </>}
      </section>
    </div>
  </div>
}
