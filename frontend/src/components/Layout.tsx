import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Bell, ChevronRight, Home, Plus, Search, Sparkles, UserRound, UsersRound, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useMatchNotifications } from '../context/MatchNotificationContext';
import Logo from './Logo';
import ApiHealthStatus from './ApiHealthStatus';
import './Navigation.css';

export default function Layout({ children }: { children: ReactNode }) {
  const { isLoggedIn, profile, storageError } = useApp();
  const { unreadCount } = useMatchNotifications();
  const { pathname } = useLocation();
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  // A recovered connection resets dismissal so a later failure can be shown again.
  useEffect(() => { if (!storageError) setDismissedError(null); }, [storageError]);
  // The header counts match notifications; persisted activity messages have their own list on MyPage.
  const unread = isLoggedIn ? unreadCount ?? 0 : 0;
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">본문 바로가기</a>
    <header className="site-header"><div className="header-inner">
      <Link to="/" aria-label="LOST QUEST 홈"><Logo /></Link>
      <nav className="desktop-nav" aria-label="주 내비게이션">
        <NavLink to="/" end>홈</NavLink><NavLink to="/search">분실물 찾기</NavLink><NavLink to="/matches">매칭 추천</NavLink><NavLink to="/community">커뮤니티</NavLink><NavLink to="/quest-game">탐정 게임<span className="nav-new">NEW</span></NavLink><NavLink to="/guide">이용 안내</NavLink>
      </nav>
      <div className="header-actions"><Link to="/mypage?tab=notifications" className="notification-button" aria-label={unread > 0 ? `알림, 읽지 않은 매칭 알림 ${unread}개` : '알림'}><Bell size={19} aria-hidden="true" />{unread > 0 && <i className="notification-badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</i>}</Link><span className="header-divider" />{isLoggedIn ? <Link to="/mypage" className="header-profile"><span className="mini-avatar"><UserRound size={16}/></span><span>{profile.name}</span></Link> : <Link to="/login" className="login-link">로그인</Link>}<Link to="/register?type=found" className="button button-primary header-register"><Plus size={16} />물품 등록</Link></div>
    </div></header>
    {storageError && storageError !== dismissedError && <div role="alert" className="storage-alert"><span>{storageError}</span><button type="button" className="storage-alert-close" aria-label="오류 안내 닫기" onClick={() => setDismissedError(storageError)}><X size={18} aria-hidden="true" /></button></div>}
    <main id="main-content">{children}</main>
    <footer className="site-footer"><div className="footer-inner"><div><Link to="/"><Logo /></Link><p>잃어버린 소중한 것, 다시 만나는 여정.</p></div><div className="footer-links"><Link to="/quest-game">분실물 탐정 게임</Link><Link to="/guide">서비스 이용 안내</Link><Link to="/admin">반환 관리<ChevronRight size={13}/></Link><span>이웃의 친절로 함께 찾는 서비스</span></div></div><ApiHealthStatus /><div className="footer-bottom"><span>© 2026 LOST QUEST. Find it. Together.</span><span>작은 친절이, 다시 누군가의 일상이 됩니다.</span></div></footer>
    <nav className="mobile-nav" aria-label="모바일 내비게이션"><NavLink to="/" end><Home size={21}/><span>홈</span></NavLink><NavLink to="/search"><Search size={21}/><span>탐색</span></NavLink><NavLink to="/register" className="mobile-register"><span className="mobile-plus"><Plus size={23}/></span><span>등록</span></NavLink><NavLink to="/matches"><Sparkles size={21}/><span>매칭 추천</span></NavLink><NavLink to="/community"><UsersRound size={21}/><span>커뮤니티</span></NavLink><NavLink to="/mypage"><UserRound size={21}/><span>마이</span></NavLink></nav>
  </div>;
}
