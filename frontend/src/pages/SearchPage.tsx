import { useSearchParams, Link } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Globe2, ListFilter, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import ItemCard from '../components/ItemCard';
import { categories, regions } from '../data/seed';
import { listAllServerItems } from '../services/itemApi';
import { getPoliceFilters, listPoliceItems, type PoliceFilterOptions } from '../services/publicItemApi';
import { SOURCE_LABELS, buildPoliceQuery, describeSourceError, idleSource, loadCommunity, loadPolicePage, mergeSearchItems, policeLostSupport, type SourceKey, type SourceState } from '../services/searchSources';

const POLICE_PAGE_SIZE = 20;

export default function SearchPage() {
  // Sources: LOST QUEST registrations (Spring Boot + MySQL) and live 경찰청 lost/found data via the backend.
  // Each source loads and fails independently; there is no seed fallback.
  const [sources, setSources] = useState<Record<SourceKey, SourceState>>({ community: idleSource, policeLost: idleSource, policeFound: idleSource });
  const setSource = (key: SourceKey, state: SourceState) => setSources(previous => ({ ...previous, [key]: state }));
  const [params, setParams] = useSearchParams();
  const paramsRef = useRef(params);
  useEffect(() => { paramsRef.current = params; }, [params]);
  const query = params.get('q') ?? '';
  const [draft, setDraft] = useState(query);
  useEffect(() => { setDraft(query); }, [query]);
  const region = params.get('region') ?? '';
  const category = params.get('category') ?? '';
  const source = params.get('source') ?? '';
  const type = params.get('type') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const sort = params.get('sort') ?? 'latest';
  // 경찰청 code filters (values come from /api/public-items/filters; the UI never hard-codes them).
  const pRegion = params.get('pRegion') ?? '';
  const pCategory = params.get('pCategory') ?? '';
  const pSub = params.get('pSub') ?? '';
  const pColor = params.get('pColor') ?? '';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [policeFilters, setPoliceFilters] = useState<{ status: 'loading' | 'ready' | 'error'; options?: PoliceFilterOptions; error?: string }>({ status: 'loading' });
  const loadPoliceFilters = useCallback(async () => {
    setPoliceFilters({ status: 'loading' });
    try {
      setPoliceFilters({ status: 'ready', options: await getPoliceFilters() });
    } catch (cause) {
      setPoliceFilters({ status: 'error', error: describeSourceError(cause) });
    }
  }, []);
  useEffect(() => { void loadPoliceFilters(); }, [loadPoliceFilters]);

  const loadCommunityItems = useCallback(async (isCancelled: () => boolean = () => false) => {
    setSource('community', { ...idleSource, status: 'loading' });
    const state = await loadCommunity(listAllServerItems);
    if (!isCancelled()) setSource('community', state);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void loadCommunityItems(() => cancelled);
    return () => { cancelled = true; };
  }, [loadCommunityItems]);

  // 경찰청 data is re-queried when the keyword or date range changes; region/category stay client-side
  // because the police API needs common codes for them (not available yet).
  const policeQuery = buildPoliceQuery({ q: query, from, to, region: pRegion, category: pCategory, subCategory: pSub, color: pColor });
  const policeKey = JSON.stringify(policeQuery);
  const policeVersion = useRef(0);
  const loadPolice = useCallback(async (key: 'policeLost' | 'policeFound', page: number, previous: SourceState['items'] = []) => {
    const version = policeVersion.current;
    setSources(current => ({ ...current, [key]: { ...current[key], status: 'loading', error: '', items: previous } }));
    const state = await loadPolicePage(() => listPoliceItems(key === 'policeLost' ? 'lost' : 'found', { ...JSON.parse(policeKey), page, size: POLICE_PAGE_SIZE }), previous);
    if (version === policeVersion.current) setSource(key, state);
  }, [policeKey]);
  useEffect(() => {
    policeVersion.current += 1;
    if (source === 'community') return;
    const lostSupport = policeLostSupport(JSON.parse(policeKey));
    if (lostSupport.supported) void loadPolice('policeLost', 1);
    else setSource('policeLost', { ...idleSource, status: 'unsupported', error: lostSupport.reason });
    void loadPolice('policeFound', 1);
  }, [loadPolice, policeKey, source]);

  const items = mergeSearchItems(sources);
  const keywordMode = !!policeQuery.q;
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(paramsRef.current);
    value ? next.set(key, value) : next.delete(key);
    paramsRef.current = next;
    setParams(next);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); update('q', draft.trim()); };
  const invalidRange = !!(from && to && from > to);
  const filtered = items.filter(item => {
    const text = `${item.title} ${item.description} ${item.category} ${item.color} ${item.location} ${item.region}`.toLowerCase();
    const police = item.createdBy === 'police';
    // 경찰청 keyword results were already matched upstream by item name.
    const textMatch = !query || text.includes(query.toLowerCase()) || (keywordMode && police);
    // LOST QUEST region/category apply to LOST QUEST items; 경찰청 items are filtered upstream by 경찰청 codes.
    return textMatch && (police || !region || item.region === region) && (police || !category || item.category === category) && (!source || item.source === source) && (!type || item.type === type) && (!from || item.date >= from) && (!to || item.date <= to);
  }).sort((a, b) => sort === 'oldest' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  const activeCount = [region, category, from, to, type, pRegion, pCategory, pSub, pColor].filter(Boolean).length;
  const policeCategory = policeFilters.options?.categories.find(c => c.value === pCategory);
  const policeFiltersDisabled = keywordMode || policeFilters.status !== 'ready';
  const policeLoaded = sources.policeLost.items.length + sources.policeFound.items.length;
  const visibleSources: SourceKey[] = source === 'community' ? ['community'] : source === 'public' ? ['policeLost', 'policeFound'] : ['community', 'policeLost', 'policeFound'];
  const anyLoading = visibleSources.some(key => sources[key].status === 'loading' || (sources[key].status === 'idle' && key !== 'policeLost'));
  const retry = (key: SourceKey) => key === 'community' ? void loadCommunityItems() : void loadPolice(key, Math.max(sources[key].page, 1), sources[key].items);

  return <div className="page-container search-page"><div className="page-heading"><span className="eyebrow"><Globe2 size={15}/>전국 통합 검색</span><h1>당신의 소중한 물건, 함께 찾아볼까요?</h1><p>LOST QUEST 회원이 등록한 물품과 경찰청 유실물 공공데이터를 한곳에서 찾아보세요.</p></div>
    <form className="catalog-search" onSubmit={submit}><Search size={22}/><input aria-label="물품 이름 또는 특징 검색" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="물품 이름, 색상, 장소로 검색해 보세요" maxLength={100}/><button className="button button-primary" type="submit">검색</button></form>
    <div className="source-tabs" role="group" aria-label="데이터 출처"><button aria-pressed={!source} className={!source?'active':''} onClick={()=>update('source','')}>전체 물품<span>{items.length}</span></button><button aria-pressed={source==='community'} className={source==='community'?'active':''} onClick={()=>update('source','community')}>LOST QUEST{sources.community.status === 'ready' && <span>{sources.community.items.length}</span>}</button><button aria-pressed={source==='public'} className={source==='public'?'active':''} onClick={()=>update('source','public')}>경찰청 공공데이터{policeLoaded > 0 && <span>{policeLoaded}</span>}</button></div>
    <button className="button button-secondary filter-toggle" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={17}/>상세 필터{activeCount > 0 && <b>{activeCount}</b>}</button>
    <div className={`search-filter-panel ${filtersOpen?'filters-open':''}`}><div className="filter-panel-label"><ListFilter size={17}/><strong>상세 조건</strong><button className="text-link" onClick={()=>{setParams(query?{q:query}:{});}}>초기화<RotateCcw size={13}/></button></div><div className="search-filter-fields">
      <label className="form-field">유형<select aria-label="물품 유형" value={type} onChange={e=>update('type',e.target.value)}><option value="">전체 유형</option><option value="found">습득물</option><option value="lost">분실물</option></select></label>
      <label className="form-field">지역 (LOST QUEST)<select aria-label="LOST QUEST 지역" value={region} onChange={e=>update('region',e.target.value)}><option value="">전국 모든 지역</option>{regions.map(r=><option key={r}>{r}</option>)}</select></label>
      <label className="form-field">카테고리 (LOST QUEST)<select aria-label="LOST QUEST 카테고리" value={category} onChange={e=>update('category',e.target.value)}><option value="">전체 카테고리</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
      <label className="form-field">시작 날짜<input type="date" value={from} max={to || undefined} onChange={e=>update('from',e.target.value)}/></label><label className="form-field">종료 날짜<input type="date" value={to} min={from || undefined} onChange={e=>update('to',e.target.value)}/></label>
    </div>{invalidRange && <p role="alert" className="field-error">종료 날짜를 시작 날짜 이후로 선택해 주세요.</p>}
      {source !== 'community' && <div className="police-filter-group" aria-label="경찰청 공공데이터 조건"><p className="police-filter-title">경찰청 공공데이터 조건 <small className="muted">경찰청 공통코드 기준</small></p>
        <div className="search-filter-fields">
          <label className="form-field">시·도<select aria-label="경찰청 지역" value={pRegion} disabled={policeFiltersDisabled} onChange={e=>update('pRegion',e.target.value)}><option value="">전체 지역</option>{policeFilters.options?.regions.map(o=><option key={o.value} value={o.value}>{o.name}</option>)}</select></label>
          <label className="form-field">물품 분류<select aria-label="경찰청 물품 분류" value={pCategory} disabled={policeFiltersDisabled} onChange={e=>{ const next = new URLSearchParams(paramsRef.current); e.target.value ? next.set('pCategory', e.target.value) : next.delete('pCategory'); next.delete('pSub'); paramsRef.current = next; setParams(next); }}><option value="">전체 분류</option>{policeFilters.options?.categories.map(o=><option key={o.value} value={o.value}>{o.name}</option>)}</select></label>
          <label className="form-field">세부 분류<select aria-label="경찰청 세부 분류" value={pSub} disabled={policeFiltersDisabled || !policeCategory} onChange={e=>update('pSub',e.target.value)}><option value="">전체 세부 분류</option>{policeCategory?.children.map(o=><option key={o.value} value={o.value}>{o.name}</option>)}</select></label>
          <label className="form-field">색상 (습득물)<select aria-label="경찰청 습득물 색상" value={pColor} disabled={policeFiltersDisabled} onChange={e=>update('pColor',e.target.value)}><option value="">전체 색상</option>{policeFilters.options?.colors.map(o=><option key={o.value} value={o.value}>{o.name}</option>)}</select></label>
        </div>
        {policeFilters.status === 'loading' && <p className="muted" role="status">경찰청 조건 목록을 불러오고 있어요.</p>}
        {policeFilters.status === 'error' && <p className="field-error" role="alert">경찰청 조건 목록을 불러오지 못했어요. {policeFilters.error} <button type="button" className="text-link" onClick={() => void loadPoliceFilters()}>다시 시도</button></p>}
        {keywordMode && <p className="muted">경찰청 공공데이터는 검색어 검색 시 날짜·지역·분류·색상 조건을 지원하지 않아, 물품명으로만 찾아요.</p>}
        {pColor && !keywordMode && <p className="muted">색상은 경찰청 습득물에만 적용돼요. 같은 이름의 색상 코드를 모두 함께 찾아요.</p>}
      </div>}
    </div>
    <ul className="search-source-status" aria-label="데이터 출처별 상태">{visibleSources.map(key => { const state = sources[key]; return <li key={key} className={state.status === 'error' ? 'field-error' : 'muted'}>
      <strong>{SOURCE_LABELS[key]}</strong>{' '}
      {state.status === 'unsupported' ? <span>{state.error}</span>
        : state.status === 'loading' || state.status === 'idle' ? <span role="status"><span className="loading-dot" /> 불러오는 중…</span>
        : state.status === 'error' ? <span role="alert">{state.error} <button type="button" className="text-link" onClick={() => retry(key)}>다시 시도</button></span>
        : key === 'community' ? <span>{state.items.length}건</span> : <span>{state.items.length.toLocaleString()} / {state.totalCount.toLocaleString()}건{state.totalCount === 0 && ' (결과 없음)'}</span>}
    </li>; })}</ul>
    <div className="catalog-result-toolbar"><p>{query && <strong>‘{query}’ </strong>}검색 결과 <b>{invalidRange ? 0 : filtered.length}</b>개</p><select aria-label="검색 결과 정렬" value={sort} onChange={e=>update('sort',e.target.value)}><option value="latest">최신 날짜순</option><option value="oldest">오래된 날짜순</option></select></div>
    {filtered.length > 0 && !invalidRange ? <div className="items-grid">{filtered.map(item=><ItemCard key={item.id} item={item}/>)}</div> : anyLoading ? null : <div className="empty-state card"><span className="empty-icon"><Search size={32}/></span><h2>조건에 맞는 물품이 아직 없어요.</h2><p>다른 검색어를 입력하거나 필터를 넓혀 보세요.<br/>물품을 직접 등록하면 AI 매칭도 체험할 수 있어요.</p><div className="button-row"><button className="button button-secondary" onClick={()=>{setParams({});setDraft('');}}>전체 물품 보기</button><Link to="/register?type=lost" className="button button-primary">분실물 등록<ArrowRight size={16}/></Link></div></div>}
    {source !== 'community' && <div className="button-row">{(['policeLost', 'policeFound'] as const).filter(key => sources[key].status === 'ready' && sources[key].page < sources[key].totalPages).map(key =>
      <button key={key} type="button" className="button button-secondary" onClick={() => void loadPolice(key, sources[key].page + 1, sources[key].items)}>{SOURCE_LABELS[key]} 더 보기</button>)}</div>}
    <div className="info-note"><Globe2 size={17}/><p>LOST QUEST 물품은 회원이 등록해 서버에 저장된 데이터입니다. 경찰청 공공데이터는 경찰청 유실물 OpenAPI에서 실시간으로 조회하며(기본 최근 30일), 실제 수령 절차와 보관 상태는 경찰청 LOST112와 보관기관에서 확인해 주세요.</p></div>
  </div>;
}
