import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Compass, HeartHandshake, LockKeyhole, Mail, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import { useApp } from '../context/AppContext'
import './JourneyPages.css'

export default function AuthPage() {
  const { isLoggedIn, login, profile } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const isSignup = location.pathname === '/signup'
  const [nickname, setNickname] = useState('로스트헌터')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')
  const params = new URLSearchParams(location.search)
  const requestedPath = params.get('returnTo') || '/mypage'
  const returnTo = requestedPath.startsWith('/') && !requestedPath.startsWith('//') && !requestedPath.includes('\\') ? requestedPath : '/mypage'
  const authSearch = params.has('returnTo') ? `?returnTo=${encodeURIComponent(returnTo)}` : ''

  function enterDemo(event?: React.FormEvent) {
    event?.preventDefault()
    if (isSignup && !nickname.trim()) { setError('체험용 닉네임을 입력해 주세요.'); return }
    if (isSignup && !agreed) { setError('테스트 서비스 안내에 동의해 주세요.'); return }
    login()
    navigate(returnTo, { replace: true })
  }

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
          <p className="muted">테스트 계정으로 로그인되어 있어요.<br />소중한 물건을 찾는 여정을 이어가세요.</p>
          <Link className="button button-primary" to={returnTo}>계속 둘러보기 <ArrowRight size={17} /></Link>
        </div> : <>
          <span className="eyebrow">로스트퀘스트에 오신 것을 환영해요</span>
          <h2>{isSignup ? '함께 찾는 여정의 시작' : '다시 만나 반가워요'}</h2>
          <p className="muted">{isSignup ? '테스트 계정으로 LOST QUEST를 체험해 보세요.' : '작은 친절이 모여, 소중한 일상을 되찾아요.'}</p>
          <div className="auth-tabs">
            <Link className={!isSignup ? 'active' : ''} to={`/login${authSearch}`}>로그인</Link>
            <Link className={isSignup ? 'active' : ''} to={`/signup${authSearch}`}>회원가입</Link>
          </div>
          <form onSubmit={enterDemo} className="auth-form">
            {isSignup ? <div className="form-field"><label htmlFor="demo-nickname">체험용 닉네임</label><div className="auth-input"><UserRound size={18} /><input id="demo-nickname" value={nickname} onChange={event => { setNickname(event.target.value); setError('') }} maxLength={16} autoComplete="off" placeholder="사용해 볼 닉네임" /></div><small className="muted">가입 흐름 체험 후 공용 계정 ‘로스트헌터’로 시작해요. 입력값은 저장되지 않아요.</small></div> : <>
              <div className="form-field"><label htmlFor="demo-email">테스트 이메일</label><div className="auth-input"><Mail size={18} /><input id="demo-email" value="quest@demo.local" readOnly aria-describedby="demo-account-note" /></div></div>
              <div className="form-field"><label htmlFor="demo-password">테스트 비밀번호</label><div className="auth-input"><LockKeyhole size={18} /><input id="demo-password" type="password" value="lostquest" readOnly /></div></div>
            </>}
            {isSignup && <label className="auth-agree"><input type="checkbox" checked={agreed} onChange={event => { setAgreed(event.target.checked); setError('') }} /><span>실제 계정이 생성되지 않는 테스트 서비스임을 확인했어요.</span></label>}
            {error && <p className="field-error" role="alert">{error}</p>}
            <button type="submit" className="button button-primary auth-submit">{isSignup ? '가입 흐름 체험하고 시작하기' : '테스트 계정으로 로그인'} <ArrowRight size={18} /></button>
          </form>
          <div className="auth-demo-note" id="demo-account-note"><ShieldCheck size={20} /><div><strong>개인정보 없이 가볍게 체험해요</strong><p>실제 이메일·비밀번호를 입력할 필요가 없어요. 로그인 상태는 현재 실행 중에만 유지돼요.</p></div></div>
          <p className="auth-browse">아직 둘러보는 중인가요? <Link to="/search">로그인 없이 물품 찾기 <ArrowRight size={14} /></Link></p>
        </>}
      </section>
    </div>
  </div>
}

