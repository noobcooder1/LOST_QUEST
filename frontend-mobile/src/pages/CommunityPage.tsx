import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, MessageCircleQuestion, Plus, RefreshCw, Search, ShieldCheck, UsersRound } from 'lucide-react';
import CommunityPost from '../components/CommunityPost';
import { useApp } from '../context/AppContext';
import { listServerItems } from '../services/itemApi';
import { idleSource, loadCommunity, type SourceState } from '../services/searchSources';
import type { ItemType } from '../types';
import './CommunityPage.css';

export default function CommunityPage() {
  const { isLoggedIn } = useApp();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const type = params.get('type') === 'lost' ? 'lost' : params.get('type') === 'found' ? 'found' : '';
  const [draft, setDraft] = useState(query);
  const [sources, setSources] = useState<Record<ItemType, SourceState>>({ lost: idleSource, found: idleSource });
  const versions = useRef({ lost: 0, found: 0 });
  useEffect(() => setDraft(query), [query]);
  const load = useCallback(async (kind: ItemType) => {
    const version = ++versions.current[kind];
    setSources(previous => ({ ...previous, [kind]: { ...idleSource, status: 'loading' } }));
    // Only live public registrations: an old offline summary cannot establish current moderation visibility.
    const result = await loadCommunity(() => listServerItems(kind));
    if (versions.current[kind] === version) setSources(previous => ({ ...previous, [kind]: result }));
  }, []);
  useEffect(() => {
    void load('lost'); void load('found');
    const current = versions.current;
    return () => { current.lost += 1; current.found += 1; };
  }, [load]);
  const kinds: ItemType[] = type ? [type] : ['lost', 'found'];
  const loading = kinds.some(kind => ['idle', 'loading'].includes(sources[kind].status));
  const errors = kinds.filter(kind => sources[kind].status === 'error');
  const items = kinds.flatMap(kind => sources[kind].items).filter(item => {
    const text = `${item.title} ${item.description} ${item.category} ${item.color} ${item.location} ${item.region}`.toLocaleLowerCase();
    return item.source === 'community' && item.createdBy === 'server' && !item.hidden && item.status !== 'closed'
      && (!query.trim() || text.includes(query.trim().toLocaleLowerCase()));
  }).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const update = (key: string, value: string) => {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    });
  };
  const submit = (event: FormEvent) => { event.preventDefault(); update('q', draft.trim()); };
  const returnTo = `/community${params.size ? `?${params}` : ''}`;
  const registerTo = type ? `/register?type=${type}` : '/register';
  return <div className="page-container community-page">
    <header className="community-hero">
      <div className="community-hero-copy"><span className="eyebrow"><UsersRound size={16} aria-hidden="true" />LOST QUEST 커뮤니티</span>
        <h1>우리의 물건, <span>함께 찾아요.</span></h1>
        <p>잃어버린 물건과 주운 물건을 공유하고, 비공개 질문으로 안전하게 소통하세요.</p>
        <div className="button-row"><Link className="button button-primary" to={registerTo}><Plus size={18} aria-hidden="true" />게시글 작성</Link><Link className="community-inbox-link" to="/community-inbox"><MessageCircleQuestion size={18} aria-hidden="true" />내 비공개 질문함<ArrowRight size={16} aria-hidden="true" /></Link></div>
        {!isLoggedIn && <small>목록은 누구나 볼 수 있어요. 글 작성과 비공개 질문은 로그인 후 이용해 주세요.</small>}
      </div>
      <aside className="community-hero-note"><ShieldCheck size={26} aria-hidden="true" /><h2>물건을 찾는 대화도, 안전하게</h2><p>게시글에는 공개할 수 있는 특징만 적어 주세요. 질문과 답변은 작성자와 질문자만 확인할 수 있어요.</p><Link to="/guide">안전한 이용 안내<ArrowRight size={15} aria-hidden="true" /></Link></aside>
    </header>
    <section className="community-board" aria-labelledby="community-posts-title">
      <div className="community-board-toolbar"><div className="community-type-tabs" role="group" aria-label="게시글 유형">
        {([['', '전체 게시글'], ['lost', '내 물건 찾기'], ['found', '주인 찾기']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={type === value} className={type === value ? 'active' : ''} onClick={() => update('type', value)}>{label}</button>)}
      </div><form className="catalog-search community-post-search" role="search" aria-label="커뮤니티 게시글 검색" onSubmit={submit}><Search size={19} aria-hidden="true" /><input aria-label="게시글 검색어" placeholder="물건 이름, 특징, 장소 검색" maxLength={100} value={draft} onChange={event => setDraft(event.target.value)} /><button className="button button-primary" type="submit">검색</button></form></div>
      <div className="community-board-heading"><div><h2 id="community-posts-title">{query.trim() ? '게시글 검색 결과' : '최근 등록 게시글'}</h2><p>{query.trim() ? `‘${query.trim()}’ 검색 결과` : '이웃들이 직접 공유한 잃어버린 물건과 주운 물건이에요.'}</p></div><span role="status" aria-live="polite">{loading ? '게시글을 불러오고 있어요…' : `${errors.length ? '확인된 ' : ''}게시글 ${items.length}개`}</span></div>
      {errors.map(kind => <div className="community-source-error" role="alert" key={kind}><div><strong>{kind === 'lost' ? '내 물건 찾기' : '주인 찾기'} 게시글을 불러오지 못했어요.</strong><p>{sources[kind].error}</p></div><button type="button" className="button button-secondary" onClick={() => void load(kind)}><RefreshCw size={15} aria-hidden="true" />다시 시도</button></div>)}
      {items.length > 0 ? <ul className="community-post-list" aria-label="커뮤니티 게시글 목록">{items.map(item => <CommunityPost item={item} key={item.id} returnTo={returnTo} />)}</ul>
        : !loading && !errors.length ? <div className="card empty-state"><Search size={32} aria-hidden="true" /><h3>{query.trim() ? '조건에 맞는 게시글이 없어요.' : '아직 등록된 게시글이 없어요.'}</h3><p>{query.trim() ? '다른 검색어나 게시글 유형으로 찾아보세요.' : '분실했거나 습득한 물건을 이웃에게 알려 주세요.'}</p><div className="button-row">{(query || type) && <button type="button" className="button button-secondary" onClick={() => setParams({})}>전체 게시글 보기</button>}<Link className="button button-primary" to={registerTo}>게시글 작성<Plus size={16} aria-hidden="true" /></Link></div></div> : null}
    </section>
    <aside className="community-search-note"><Search size={21} aria-hidden="true" /><div><strong>더 넓게 찾아보고 싶나요?</strong><p>물건 검색에서 경찰청 공공데이터까지 함께 검색할 수 있어요.</p></div><Link className="text-link" to="/search">통합 검색으로 이동<ArrowRight size={16} aria-hidden="true" /></Link></aside>
  </div>;
}
