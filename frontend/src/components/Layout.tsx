import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Bell, ChevronRight, FlaskConical, Home, Plus, Search, Sparkles, UserRound, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Logo from './Logo';
import ApiHealthStatus from './ApiHealthStatus';

export default function Layout({ children }: { children: ReactNode }) {
  const { isLoggedIn, profile, notifications, storageError } = useApp();
  const { pathname } = useLocation();
  const [showNotice, setShowNotice] = useState(true);
  const unread = notifications.filter(n => !n.read).length;
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">본문 바로가기</a>
    {showNotice && <div className="demo-strip"><span><FlaskConical size={12} />함께 만들어가는 LOST QUEST <b>·</b> 가상 데이터로 체험하는 프론트엔드 프로토타입</span><button aria-label="프로토타입 안내 닫기" onClick={() => setShowNotice(false)}><X size={14} /></button></div>}
    <header className="site-header"><div className="header-inner">
      <Link to="/" aria-label="LOST QUEST 홈"><Logo /></Link>
      <nav className="desktop-nav" aria-label="주 내비게이션">
        <NavLink to="/" end>홈</NavLink><NavLink to="/search">분실물 찾기</NavLink><NavLink to="/matches">AI 매칭<span className="nav-new">AI</span></NavLink><NavLink to="/guide">이용 안내</NavLink>
      </nav>
      <div className="header-actions"><Link to="/mypage?tab=notifications" className="notification-button" aria-label={`알림 ${unread}개`}><Bell size={19} />{unread > 0 && <i />}</Link><span className="header-divider" />{isLoggedIn ? <Link to="/mypage" className="header-profile"><span className="mini-avatar"><UserRound size={16}/></span><span>{profile.name}</span></Link> : <Link to="/login" className="login-link">로그인</Link>}<Link to="/register?type=found" className="button button-primary header-register"><Plus size={16} />물품 등록</Link></div>
    </div></header>
    {storageError && <div role="alert" className="storage-alert">{storageError}</div>}
    <main id="main-content">{children}</main>
    <footer className="site-footer"><div className="footer-inner"><div><Link to="/"><Logo /></Link><p>잃어버린 소중한 것, 다시 만나는 여정.</p></div><div className="footer-links"><Link to="/guide">서비스 이용 안내</Link><Link to="/admin">관리자 체험<ChevronRight size={13}/></Link><span>실제 기관·AI와 연결되지 않은 학습용 서비스</span></div></div><ApiHealthStatus /><div className="footer-bottom"><span>© 2026 LOST QUEST. Find it. Together.</span><span>작은 친절이, 다시 누군가의 일상이 됩니다.</span></div></footer>
    <nav className="mobile-nav" aria-label="모바일 내비게이션"><NavLink to="/" end><Home size={21}/><span>홈</span></NavLink><NavLink to="/search"><Search size={21}/><span>탐색</span></NavLink><NavLink to="/register" className="mobile-register"><span className="mobile-plus"><Plus size={23}/></span><span>등록</span></NavLink><NavLink to="/matches"><Sparkles size={21}/><span>AI 매칭</span></NavLink><NavLink to="/mypage"><UserRound size={21}/><span>마이</span></NavLink></nav>
  </div>;
}
