import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, ChevronRight, Gamepad2, Globe2, HeartHandshake, PackageSearch, ScanSearch, Search, ShieldCheck, Sparkles, UsersRound, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import ItemCard from '../components/ItemCard';

const quickActions = [
  { icon: PackageSearch, label: '분실 등록', link: '/register?type=lost', tone: 'blue' },
  { icon: Wallet, label: '습득 등록', link: '/register?type=found', tone: 'mint' },
  { icon: Sparkles, label: '매칭 추천', link: '/matches', tone: 'purple' },
  { icon: Globe2, label: '전국 검색', link: '/search', tone: 'orange' },
  { icon: ScanSearch, label: 'AI 비교', link: '/image-analysis', tone: 'purple' },
  { icon: UsersRound, label: '커뮤니티', link: '/community', tone: 'blue' },
  { icon: Gamepad2, label: '탐정 게임', link: '/quest-game', tone: 'orange' },
  { icon: BookOpen, label: '이용 안내', link: '/guide', tone: 'mint' },
];

const popularKeywords = ['지갑', '이어폰', '스마트폰', '가방', '카드', '열쇠'];

export default function HomePage() {
  const { profile, items, isLoggedIn, itemsReady } = useApp();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const search = (e: FormEvent) => { e.preventDefault(); navigate(`/search?q=${encodeURIComponent(query.trim())}`); };
  const level = Math.floor(profile.xp / 100) + 1;
  const progress = profile.xp % 100;
  const recentItems = useMemo(() => items
    .filter((item) => item.source !== 'public' && item.status !== 'returned')
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, 8), [items]);

  return <div className="home-app">
    <section className="home-hero">
      <p className="home-hero-greeting">{isLoggedIn ? `${profile.name}님, 반가워요` : '기술로 찾고, 마음으로 연결하다'}</p>
      <h1>잃어버린 소중함,<br /><span>다시 만나는 여정.</span></h1>
      <form className="home-search" onSubmit={search} role="search">
        <Search size={20} aria-hidden="true" />
        <input aria-label="찾고 있는 물건" value={query} onChange={e => setQuery(e.target.value)} placeholder="어떤 물건을 찾고 계신가요?" maxLength={100} />
        <button type="submit" aria-label="물건 검색"><ArrowRight size={20} /></button>
      </form>
      <div className="home-keywords" aria-label="많이 찾는 물건">
        {popularKeywords.map(k => <Link key={k} to={`/search?q=${encodeURIComponent(k)}`}>#{k}</Link>)}
      </div>
    </section>

    <section className="home-section">
      <nav className="home-quick-grid" aria-label="빠른 메뉴">
        {quickActions.map(({ icon: Icon, label, link, tone }) => <Link key={link} to={link}><span className={`home-quick-icon tone-${tone}`}><Icon size={24} strokeWidth={1.8} aria-hidden="true" /></span>{label}</Link>)}
      </nav>
    </section>

    <Link to="/mypage" className="home-section home-quest-card">
      <span className="home-quest-level">Lv.{level}</span>
      <span className="home-quest-copy">
        <small>나의 친절 퀘스트</small>
        <strong>{isLoggedIn ? profile.name : '로그인하고 경험치를 모아요'}</strong>
        <span className="progress-track" role="progressbar" aria-label="다음 레벨까지 경험치" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></span>
        <small>{progress} / 100 XP · 반환하면 +50 XP</small>
      </span>
      <ChevronRight size={20} aria-hidden="true" />
    </Link>

    <section className="home-section">
      <div className="home-section-heading"><h2>최근 등록된 물건</h2><Link to="/search">전체 보기<ChevronRight size={15} aria-hidden="true" /></Link></div>
      {recentItems.length
        ? <div className="home-recent-scroller">{recentItems.map(item => <ItemCard key={item.id} item={item} />)}</div>
        : itemsReady === false
          ? <div className="home-recent-scroller" role="status" aria-label="최근 등록된 물건을 불러오는 중">{[0, 1, 2].map(key => <span key={key} className="home-recent-skeleton" />)}</div>
          : <div className="home-recent-empty"><PackageSearch size={28} aria-hidden="true" /><p>아직 등록된 물건이 없어요.<br />첫 번째 물건을 등록해 보세요.</p><Link className="button button-primary" to="/register">물품 등록하기</Link></div>}
    </section>

    <Link to="/image-analysis" className="home-section home-ai-banner">
      <span className="home-ai-icon"><ScanSearch size={28} strokeWidth={1.5} aria-hidden="true" /></span>
      <span className="home-ai-copy"><small>브라우저에서 실행하는 로컬 AI</small><strong>두 장의 사진으로 외형을 비교해 보세요</strong><span>사진은 외부로 보내지 않아요</span></span>
      <ArrowRight size={20} aria-hidden="true" />
    </Link>

    <section className="home-section home-trust-list" aria-label="LOST QUEST의 약속">
      <div><ShieldCheck size={18} aria-hidden="true" /><span><strong>비공개 특징으로 소유 확인</strong>등록자만 아는 단서로 주인을 확인해요</span></div>
      <div><HeartHandshake size={18} aria-hidden="true" /><span><strong>돌려주면 쌓이는 경험치</strong>반환 활동으로 업적을 모아요</span></div>
    </section>
  </div>;
}
