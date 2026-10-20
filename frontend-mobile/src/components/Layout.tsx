import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { Bell, BookOpen, ChevronLeft, ChevronRight, ClipboardCheck, Gamepad2, Home, Inbox, Menu, Plus, ScanSearch, Search, Sparkles, UserRound, UsersRound, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useMatchNotifications } from '../context/MatchNotificationContext';
import Logo from './Logo';
import ApiHealthStatus from './ApiHealthStatus';
import './Navigation.css';

/** Tab roots show the menu button; every other screen gets a back button. */
const tabRoots = ['/', '/search', '/register', '/matches', '/mypage', '/community'];

const screenTitles: [pattern: string, title: string][] = [
  ['/search', '물건 탐색'],
  ['/register', '물품 등록'],
  ['/matches', '매칭 추천'],
  ['/mypage', '마이페이지'],
  ['/mypage/settings', '내 정보 수정'],
  ['/mypage/badges', '획득 업적'],
  ['/community', '커뮤니티'],
  ['/community/write', '게시글 작성'],
  ['/community/posts/:id', '커뮤니티 게시글'],
  ['/community-inbox', '비공개 질문함'],
  ['/items/:id/edit', '물품 수정'],
  ['/items/:id', '물품 상세'],
  ['/login', '로그인'],
  ['/signup', '회원가입'],
  ['/returns/:id', '반환 진행'],
  ['/admin', '반환 관리'],
  ['/guide', '이용 안내'],
  ['/quest-game', '분실물 탐정 게임'],
  ['/image-analysis', 'AI 이미지 분석'],
];

/** Focused flows hide the tab bar so their own actions stay within reach. */
const hideTabBarOn = ['/login', '/signup', '/items/:id/edit', '/returns/:id', '/community/write'];

const menuLinks = [
  { to: '/community', label: '커뮤니티', icon: UsersRound, tone: 'blue' },
  { to: '/community-inbox', label: '비공개 질문함', icon: Inbox, tone: 'mint' },
  { to: '/image-analysis', label: 'AI 이미지 분석', icon: ScanSearch, tone: 'purple' },
  { to: '/quest-game', label: '탐정 게임', icon: Gamepad2, tone: 'orange' },
  { to: '/guide', label: '이용 안내', icon: BookOpen, tone: 'blue' },
  { to: '/admin', label: '반환 관리', icon: ClipboardCheck, tone: 'mint' },
] as const;

function titleFor(pathname: string): string | null {
  return screenTitles.find(([pattern]) => matchPath(pattern, pathname))?.[1] ?? null;
}

export default function Layout({ children }: { children: ReactNode }) {
  const { isLoggedIn, profile, storageError } = useApp();
  const { unreadCount } = useMatchNotifications();
  const { pathname, key: locationKey, state: locationState } = useLocation();
  const navigate = useNavigate();
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // A recovered connection resets dismissal so a later failure can be shown again.
  useEffect(() => { if (!storageError) setDismissedError(null); }, [storageError]);
  // The header counts match notifications; persisted activity messages have their own list on MyPage.
  const unread = isLoggedIn ? unreadCount ?? 0 : 0;
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menuOpen]);

  const isHome = pathname === '/';
  const isTabRoot = tabRoots.includes(pathname);
  const title = titleFor(pathname);
  const showTabBar = !hideTabBarOn.some((pattern) => matchPath(pattern, pathname));
  // React Router gives the entry the app was opened on the key 'default'; there is nothing in-app to go back to.
  const goBack = () => {
    const isProfileSection = pathname === '/mypage/settings' || pathname === '/mypage/badges';
    if (isProfileSection && (locationKey === 'default' || locationState?.fromMyPage !== true)) {
      navigate('/mypage', { replace: true });
    } else if (locationKey === 'default') navigate('/');
    else navigate(-1);
  };

  return <div className={`app-shell ${showTabBar ? 'has-tabbar' : ''}`}>
    <a className="skip-link" href="#main-content">본문 바로가기</a>
    <header className="app-bar">
      <div className="app-bar-leading">
        {isTabRoot
          ? isHome ? <Link to="/" aria-label="LOST QUEST 홈"><Logo /></Link> : <strong className="app-bar-title">{title}</strong>
          : <><button type="button" className="app-bar-icon" aria-label="뒤로 가기" onClick={goBack}><ChevronLeft size={24} aria-hidden="true" /></button><strong className="app-bar-title">{title ?? 'LOST QUEST'}</strong></>}
      </div>
      <div className="app-bar-actions">
        <Link to="/mypage?tab=notifications" className="app-bar-icon notification-button" aria-label={unread > 0 ? `알림, 읽지 않은 매칭 알림 ${unread}개` : '알림'}><Bell size={22} aria-hidden="true" />{unread > 0 && <i className="notification-badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</i>}</Link>
        <button type="button" className="app-bar-icon" aria-label="전체 메뉴" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={23} aria-hidden="true" /></button>
      </div>
    </header>
    {storageError && storageError !== dismissedError && <div role="alert" className="storage-alert"><span>{storageError}</span><button type="button" className="storage-alert-close" aria-label="오류 안내 닫기" onClick={() => setDismissedError(storageError)}><X size={18} aria-hidden="true" /></button></div>}
    <main id="main-content">{children}</main>
    {showTabBar && <nav className="app-tabbar" aria-label="하단 탭 내비게이션">
      <NavLink to="/" end><Home size={22} aria-hidden="true" /><span>홈</span></NavLink>
      <NavLink to="/search"><Search size={22} aria-hidden="true" /><span>탐색</span></NavLink>
      <NavLink to="/register" className="app-tabbar-register"><span className="app-tabbar-plus"><Plus size={24} aria-hidden="true" /></span><span>등록</span></NavLink>
      <NavLink to="/matches"><Sparkles size={22} aria-hidden="true" /><span>매칭</span></NavLink>
      <NavLink to="/mypage"><UserRound size={22} aria-hidden="true" /><span>마이</span></NavLink>
    </nav>}
    {menuOpen && <div className="app-sheet-layer" onClick={() => setMenuOpen(false)}>
      <div className="app-sheet" role="dialog" aria-modal="true" aria-label="전체 메뉴" onClick={(event) => event.stopPropagation()}>
        <div className="app-sheet-handle" aria-hidden="true" />
        <div className="app-sheet-header"><strong>전체 메뉴</strong><button type="button" className="app-bar-icon" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)} autoFocus><X size={22} aria-hidden="true" /></button></div>
        <Link className="app-sheet-profile" to={isLoggedIn ? '/mypage' : '/login'}>
          <span className="app-sheet-avatar"><UserRound size={22} aria-hidden="true" /></span>
          <span className="app-sheet-profile-copy">{isLoggedIn ? <><strong>{profile.name}</strong><small>Lv.{Math.floor(profile.xp / 100) + 1} · {profile.xp} XP</small></> : <><strong>로그인하기</strong><small>등록 내역과 알림을 확인해요</small></>}</span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
        <nav className="app-sheet-grid" aria-label="전체 메뉴 바로가기">
          {menuLinks.map(({ to, label, icon: Icon, tone }) => <Link key={to} to={to}><span className={`app-sheet-icon tone-${tone}`}><Icon size={22} aria-hidden="true" /></span>{label}</Link>)}
        </nav>
        <ApiHealthStatus />
        <p className="app-sheet-footer">© 2026 LOST QUEST · Find it. Together.</p>
      </div>
    </div>}
  </div>;
}
