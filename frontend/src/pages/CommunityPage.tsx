import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, MessagesSquare, Plus, RefreshCw, Search, SlidersHorizontal, UsersRound } from 'lucide-react';
import CommunityPost from '../components/CommunityPost';
import { useApp } from '../context/AppContext';
import { COMMUNITY_CATEGORIES, isDiscussionCategory, isDiscussionDate, listDiscussionPosts, type CommunityPage as PostPage, type DiscussionPost } from '../services/communityApi';
import { todayInKorea } from '../services/dateTime';
import './CommunityPage.css';

function recentRange(days: number) {
  const to = todayInKorea();
  const start = new Date(`${to}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { from: start.toISOString().slice(0, 10), to };
}

export default function CommunityPage() {
  const { isLoggedIn } = useApp();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const categoryParam = params.get('category');
  const category = isDiscussionCategory(categoryParam) ? categoryParam : '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const pageParam = params.get('page') ?? '0';
  const page = /^\d+$/.test(pageParam) && Number(pageParam) <= 10000 ? Number(pageParam) : 0;
  const [draft, setDraft] = useState({ q: query, from, to });
  const [validation, setValidation] = useState('');
  const [result, setResult] = useState<PostPage<DiscussionPost> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const version = useRef(0);
  useEffect(() => { setDraft({ q: query, from, to }); setValidation(''); }, [query, from, to]);
  const load = useCallback(async () => {
    const request = ++version.current;
    setLoading(true); setError(''); setResult(null);
    try {
      const next = await listDiscussionPosts({ q: query, category, from, to, page });
      if (request === version.current) setResult(next);
    } catch (reason) {
      if (request === version.current) setError(reason instanceof Error ? reason.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      if (request === version.current) setLoading(false);
    }
  }, [query, category, from, to, page]);
  useEffect(() => { void load(); return () => { version.current += 1; }; }, [load]);
  const update = (values: Record<string, string>, keepPage = false) => {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.delete('type');
      if (!keepPage) next.delete('page');
      for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
      return next;
    });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if ((draft.from && !isDiscussionDate(draft.from)) || (draft.to && !isDiscussionDate(draft.to))) {
      setValidation('올바른 작성 기간을 입력해 주세요.'); return;
    }
    if (draft.from && draft.to && draft.from > draft.to) {
      setValidation('시작일은 종료일보다 늦을 수 없어요.'); return;
    }
    setValidation(''); update({ q: draft.q.trim(), from: draft.from, to: draft.to });
  };
  const setPeriod = (days: number | null) => {
    const range = days ? recentRange(days) : { from: '', to: '' };
    setDraft(previous => ({ ...previous, ...range })); setValidation(''); update(range);
  };
  const returnTo = `/community${params.size ? `?${params}` : ''}`;
  const filtered = Boolean(query.trim() || category || from || to);
  const posts = result?.items ?? [];
  return <div className="page-container community-page">
    <header className="community-hero">
      <div className="community-hero-copy"><span className="eyebrow"><UsersRound size={16} aria-hidden="true" />LOST QUEST 커뮤니티</span>
        <h1>일상의 이야기, <span>함께 나눠요.</span></h1>
        <p>가벼운 잡담부터 유용한 정보, 다시 찾은 기쁨까지.<br />이웃과 자유롭게 이야기하는 공간이에요.</p>
        <div className="button-row"><Link className="button button-primary" to="/community/write" state={{ communityReturnTo: returnTo }}><Plus size={18} aria-hidden="true" />게시글 작성</Link><Link className="community-inbox-link" to="/search"><Search size={17} aria-hidden="true" />물건 검색<ArrowRight size={16} aria-hidden="true" /></Link></div>
        {!isLoggedIn && <small>게시글은 누구나 볼 수 있어요. 글 작성은 로그인 후 이용해 주세요.</small>}
      </div>
      <aside className="community-hero-note"><MessagesSquare size={26} aria-hidden="true" /><h2>이야기는 여기서, 물품은 물품찾기에서</h2><p>분실·습득 물품은 물품찾기에 등록해 주세요. 이야기와 관련된 물품은 게시글에 연결할 수 있어요.</p><Link to="/register">분실·습득 물품 등록<ArrowRight size={15} aria-hidden="true" /></Link></aside>
    </header>
    <section className="community-board" aria-labelledby="community-posts-title">
      <div className="community-board-toolbar"><div className="community-type-tabs" role="group" aria-label="게시글 카테고리">
        {[{ value: '', label: '전체' }, ...COMMUNITY_CATEGORIES].map(({ value, label }) => <button key={value} type="button" aria-pressed={category === value} className={category === value ? 'active' : ''} onClick={() => update({ category: value })}>{label}</button>)}
      </div></div>
      <form className="community-filter-form" role="search" aria-label="커뮤니티 게시글 검색" onSubmit={submit}>
        <div className="community-search-row"><label className="catalog-search community-post-search"><Search size={19} aria-hidden="true" /><input aria-label="게시글 검색어" placeholder="제목이나 본문으로 이야기 검색" maxLength={100} value={draft.q} onChange={event => setDraft(previous => ({ ...previous, q: event.target.value }))} /></label><button className="button button-primary" type="submit">검색</button></div>
        <div className="community-date-filters"><span className="community-filter-label"><CalendarDays size={16} aria-hidden="true" />작성 기간</span>
          <div className="community-periods" role="group" aria-label="작성 기간 빠른 선택">{([{ days: null, label: '전체 기간' }, { days: 7, label: '최근 7일' }, { days: 30, label: '최근 30일' }] as const).map(({ days, label }) => {
            const range = days ? recentRange(days) : { from: '', to: '' };
            const active = from === range.from && to === range.to;
            return <button type="button" key={label} aria-pressed={active} className={active ? 'active' : ''} onClick={() => setPeriod(days)}>{label}</button>;
          })}</div>
          <div className="community-date-range"><label><span className="community-date-label">작성 시작일</span><input type="date" aria-label="작성 시작일" value={draft.from} onChange={event => setDraft(previous => ({ ...previous, from: event.target.value }))} /></label><span aria-hidden="true">~</span><label><span className="community-date-label">작성 종료일</span><input type="date" aria-label="작성 종료일" value={draft.to} onChange={event => setDraft(previous => ({ ...previous, to: event.target.value }))} /></label><button type="submit" className="community-filter-apply"><SlidersHorizontal size={14} aria-hidden="true" />적용</button></div>
          {(filtered || draft.q || draft.from || draft.to) && <button type="button" className="community-filter-reset" onClick={() => { setParams({}); setDraft({ q: '', from: '', to: '' }); setValidation(''); }}>초기화</button>}
        </div>
        {validation && <p className="community-filter-validation" role="alert">{validation}</p>}
      </form>
      <div className="community-board-heading"><div><h2 id="community-posts-title">{filtered ? '조건에 맞는 이야기' : '최근 올라온 이야기'}</h2><p>{query.trim() ? `‘${query.trim()}’ 제목·본문 검색 결과` : '자유롭게 나누는 일상과 이웃의 유용한 정보를 만나보세요.'}</p></div><span role="status" aria-live="polite">{loading ? '게시글을 불러오고 있어요…' : error ? '목록을 확인해 주세요' : `${page + 1}페이지 · ${posts.length}개${result?.hasNext ? ' 표시' : ''}`}</span></div>
      {error ? <div className="community-source-error" role="alert"><div><strong>게시글을 불러오지 못했어요.</strong><p>{error}</p></div><button type="button" className="button button-secondary" onClick={() => void load()}><RefreshCw size={15} aria-hidden="true" />다시 시도</button></div>
        : loading ? <div className="community-board-loading" role="status"><span className="loading-dot" />이웃의 이야기를 불러오는 중이에요.</div>
        : posts.length > 0 ? <ul className="community-post-list" aria-label="커뮤니티 게시글 목록">{posts.map(post => <CommunityPost post={post} key={post.id} returnTo={returnTo} />)}</ul>
        : <div className="card empty-state"><MessagesSquare size={32} aria-hidden="true" /><h3>{filtered ? '조건에 맞는 게시글이 없어요.' : page > 0 ? '이 페이지에는 게시글이 없어요.' : '첫 번째 이야기를 기다리고 있어요.'}</h3><p>{filtered ? '검색어나 카테고리, 작성 기간을 바꿔 보세요.' : page > 0 ? '이전 페이지에서 다른 이야기를 만나보세요.' : '이웃에게 건네고 싶은 이야기나 유용한 정보를 남겨 주세요.'}</p>{filtered && <div className="button-row"><button type="button" className="button button-secondary" onClick={() => setParams({})}>전체 게시글 보기</button></div>}</div>}
      {!loading && !error && (page > 0 || result?.hasNext) && <nav className="community-pagination" aria-label="커뮤니티 게시글 페이지"><button type="button" className="button button-secondary" disabled={page === 0} onClick={() => update({ page: page === 1 ? '' : String(page - 1) }, true)}><ArrowLeft size={15} aria-hidden="true" />이전</button><span aria-current="page">{page + 1}페이지</span><button type="button" className="button button-secondary" disabled={!result?.hasNext || page >= 10000} onClick={() => update({ page: String(page + 1) }, true)}>다음<ArrowRight size={15} aria-hidden="true" /></button></nav>}
    </section>
    <aside className="community-search-note"><Search size={21} aria-hidden="true" /><div><strong>잃어버리거나 발견한 물건이 있나요?</strong><p>물품찾기에서 분실·습득 물품과 경찰청 등록 물품을 찾아보세요.</p></div><Link className="text-link" to="/search">물품찾기로 이동<ArrowRight size={16} aria-hidden="true" /></Link></aside>
  </div>;
}
