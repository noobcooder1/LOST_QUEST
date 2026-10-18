import { useSearchParams, Link } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ChevronDown, Globe2, ListFilter, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import ItemCard from '../components/ItemCard';
import PublicListStatus from '../components/PublicListStatus';
import { categories, regions } from '../data/seed';
import { getPoliceFilters, type PoliceFilterOptions } from '../services/publicItemApi';
import { loadCommunityPublicList, loadPolicePublicList } from '../services/publicListLoader';
import { SOURCE_LABELS, applyPolicePage, buildPoliceQuery, describeSourceError, idleSource, type SourceKey, type SourceState } from '../services/searchSources';
import './SearchPage.css';

const POLICE_PAGE_SIZE = 50;

export default function SearchPage() {
  // Sources: LOST QUEST registrations and shared, cached 경찰청 lists via the backend.
  // Each source loads and fails independently; there is no seed fallback.
  const [sources, setSources] = useState<Record<SourceKey, SourceState>>({ communityLost: idleSource, communityFound: idleSource, policeLost: idleSource, policeFound: idleSource });
  const requestVersions = useRef<Record<SourceKey, number>>({ communityLost: 0, communityFound: 0, policeLost: 0, policeFound: 0 });
  const setSource = (key: SourceKey, state: SourceState) => setSources(previous => ({ ...previous, [key]: state }));
  const [params, setParams] = useSearchParams();
  const paramsRef = useRef(params);
  useEffect(() => { paramsRef.current = params; }, [params]);
  const query = params.get('q') ?? '';
  const [draft, setDraft] = useState(query);
  useEffect(() => { setDraft(query); }, [query]);
  const region = params.get('region') ?? '';
  const category = params.get('category') ?? '';
  // Only an explicit police selection opts into the external source. Legacy all/unknown URLs use LOST QUEST.
  const source = params.get('source') === 'public' ? 'public' : 'community';
  const activeSource = useRef(source);
  activeSource.current = source;
  // Legacy police links without a type open the lost tab; police lists are never combined.
  const type = source === 'public' ? (params.get('type') === 'found' ? 'found' : 'lost') : params.get('type') ?? '';
  const policeSource = type === 'found' ? 'policeFound' : 'policeLost';
  const activePoliceSource = useRef(policeSource);
  activePoliceSource.current = policeSource;
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const sort = params.get('sort') ?? (source === 'community' ? 'registered' : 'latest');
  // 경찰청 code filters (values come from /api/public-items/filters; the UI never hard-codes them).
  const pRegion = params.get('pRegion') ?? '';
  const pCategory = params.get('pCategory') ?? '';
  const pSub = params.get('pSub') ?? '';
  const pColor = params.get('pColor') ?? '';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [policeFilters, setPoliceFilters] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; options?: PoliceFilterOptions; error?: string }>({ status: 'idle' });
  const filterRequest = useRef<Promise<PoliceFilterOptions> | null>(null);
  const filterVersion = useRef(0);
  const loadPoliceFilters = useCallback(async () => {
    if (activeSource.current !== 'public') return;
    const version = ++filterVersion.current;
    setPoliceFilters({ status: 'loading' });
    try {
      // Share StrictMode and quick-return requests. Codes are needed only while viewing this source.
      filterRequest.current ??= getPoliceFilters();
      const options = await filterRequest.current;
      if (version === filterVersion.current && activeSource.current === 'public') setPoliceFilters({ status: 'ready', options });
    } catch (cause) {
      filterRequest.current = null;
      if (version === filterVersion.current && activeSource.current === 'public') setPoliceFilters({ status: 'error', error: describeSourceError(cause) });
    }
  }, []);
  useEffect(() => {
    if (source === 'public') void loadPoliceFilters();
    return () => { filterVersion.current += 1; };
  }, [loadPoliceFilters, source]);

  const loadCommunityItems = useCallback(async (key: 'communityLost' | 'communityFound', isCancelled: () => boolean = () => false) => {
    const version = ++requestVersions.current[key];
    setSource(key, { ...idleSource, status: 'loading' });
    const state = await loadCommunityPublicList(key === 'communityLost' ? 'lost' : 'found');
    if (!isCancelled() && version === requestVersions.current[key] && activeSource.current === 'community') setSource(key, state);
  }, []);
  useEffect(() => {
    if (source !== 'community') return;
    let cancelled = false;
    void loadCommunityItems('communityLost', () => cancelled);
    void loadCommunityItems('communityFound', () => cancelled);
    return () => { cancelled = true; };
  }, [loadCommunityItems, source]);

  // Each police query uses the backend's shared cache; code filters are applied upstream.
  const policeQuery = buildPoliceQuery({ q: query, from, to, region: pRegion, category: pCategory, subCategory: pSub, color: type === 'found' ? pColor : '' });
  const policeKey = JSON.stringify(policeQuery);
  const policeVersion = useRef(0);
  const refreshEpoch = useRef({ policeLost: 0, policeFound: 0 });
  const refreshing = useRef(new Set<string>());
  const pendingPolice = useRef(new Map<string, Promise<SourceState>>());
  const loadPolice = useCallback(async (key: 'policeLost' | 'policeFound', page: number, refresh = false) => {
    if (activeSource.current !== 'public' || activePoliceSource.current !== key) return;
    const refreshKey = `${key}:${policeKey}`;
    if (refresh && refreshing.current.has(refreshKey)) return;
    if (refresh) { refreshing.current.add(refreshKey); refreshEpoch.current[key] += 1; }
    const epoch = refreshEpoch.current[key];
    const version = policeVersion.current;
    const requestVersion = ++requestVersions.current[key];
    setSources(current => ({ ...current, [key]: refresh
      ? { ...current[key], refreshing: true, refreshError: undefined, pageLoading: false, pageError: undefined }
      : page > 1
      ? { ...current[key], pageLoading: true, pageError: undefined }
      : { ...idleSource, status: 'loading' } }));
    const pendingKey = `${refreshKey}:${page}:${epoch}:${refresh}`;
    let pending = pendingPolice.current.get(pendingKey);
    if (!pending) {
      pending = loadPolicePublicList(key === 'policeLost' ? 'lost' : 'found', { ...JSON.parse(policeKey), page, size: POLICE_PAGE_SIZE, ...(refresh ? { refresh: true } : {}) },
        () => refreshEpoch.current[key] === epoch);
      pendingPolice.current.set(pendingKey, pending);
      void pending.finally(() => pendingPolice.current.delete(pendingKey));
    }
    const state = await pending;
    if (refresh) refreshing.current.delete(refreshKey);
    if (activeSource.current === 'public' && activePoliceSource.current === key && version === policeVersion.current && requestVersion === requestVersions.current[key]) {
      setSources(current => {
        const previous = current[key];
        if (refresh && previous.items.length && (state.status === 'error' || state.dataStatus === 'cached'))
          return { ...current, [key]: { ...previous, refreshing: false, refreshError: state.error || '새 정보를 가져오지 못해 기존 목록을 유지합니다.' } };
        if (refresh && previous.items.length && state.cache?.refreshError)
          return { ...current, [key]: { ...previous, cache: { ...(previous.cache ?? state.cache), stale: true, refreshAllowedAt: state.cache.refreshAllowedAt, refreshError: state.cache.refreshError }, refreshing: false } };
        if (refresh && previous.items.length && state.cache?.hit && state.cache.fetchedAt === previous.cache?.fetchedAt)
          return { ...current, [key]: { ...previous, cache: state.cache, refreshing: false, refreshError: undefined } };
        return { ...current, [key]: { ...applyPolicePage(previous, state, page), refreshing: false } };
      });
    }
  }, [policeKey]);
  useEffect(() => {
    policeVersion.current += 1;
    if (source !== 'public') return;
    void loadPolice(policeSource, 1);
    return () => { policeVersion.current += 1; };
  }, [loadPolice, policeKey, policeSource, source]);

  const visibleSources: SourceKey[] = source === 'public' ? [policeSource] : ['communityLost', 'communityFound'];
  const items = visibleSources.flatMap(key => sources[key].items);
  const keywordMode = !!policeQuery.q;
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(paramsRef.current);
    value ? next.set(key, value) : next.delete(key);
    paramsRef.current = next;
    setParams(next);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); update('q', draft.trim()); };
  const selectSource = (nextSource: 'community' | 'public', nextType?: 'lost' | 'found') => {
    const next = new URLSearchParams(paramsRef.current);
    next.set('source', nextSource);
    if (nextSource === 'public') next.set('type', nextType ?? 'lost');
    else if (source === 'public') next.delete('type');
    paramsRef.current = next;
    setParams(next);
  };
  const reset = (keepQuery: boolean) => {
    const next = new URLSearchParams({ source, ...(source === 'public' ? { type } : {}), ...(keepQuery && query ? { q: query } : {}) });
    paramsRef.current = next;
    setParams(next);
    if (!keepQuery) setDraft('');
  };
  const invalidRange = !!(from && to && from > to && (source === 'community' || !keywordMode));
  const filtered = items.filter(item => {
    const text = `${item.title} ${item.description} ${item.category} ${item.color} ${item.location} ${item.region}`.toLowerCase();
    const police = item.createdBy === 'police';
    // 경찰청 keyword results were already matched upstream by item name.
    const textMatch = !query || text.includes(query.toLowerCase()) || (keywordMode && police);
    // LOST QUEST region/category apply to LOST QUEST items; 경찰청 items are filtered upstream by 경찰청 codes.
    return textMatch && (police || !region || item.region === region) && (police || !category || item.category === category) && item.source === source && (!type || item.type === type) && (police || ((!from || item.date >= from) && (!to || item.date <= to)));
  }).sort((a, b) => sort === 'registered' ? (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date)
    : sort === 'oldest' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  const activeCount = (source === 'community' ? [region, category, from, to, type] : keywordMode ? [] : [from, to, pRegion, pCategory, pSub, type === 'found' ? pColor : '']).filter(Boolean).length;
  const policeCategory = policeFilters.options?.categories.find(c => c.value === pCategory);
  const policeFiltersDisabled = keywordMode || policeFilters.status !== 'ready';
  const policeLoaded = sources[policeSource].items.length;
  const communityCount = sources.communityLost.items.length + sources.communityFound.items.length;
  const relevantSources = visibleSources.filter(key => !type || key.endsWith(type === 'lost' ? 'Lost' : 'Found'));
  const hasStoredData = relevantSources.some(key => sources[key].dataStatus === 'cached');
  const hasUnavailableData = relevantSources.some(key => sources[key].dataStatus === 'unavailable' || sources[key].status === 'error');
  const readOnlyIds = new Set(relevantSources.flatMap(key => sources[key].dataStatus === 'cached' || sources[key].status === 'error' ? sources[key].items.map(item => item.id) : []));
  const anyLoading = relevantSources.some(key => sources[key].status === 'loading' || sources[key].status === 'idle');
  const retry = (key: SourceKey) => key.startsWith('community') ? void loadCommunityItems(key as 'communityLost' | 'communityFound') : void loadPolice(key as 'policeLost' | 'policeFound', 1);

  return <div className="page-container search-page"><div className="page-heading"><span className="eyebrow"><Globe2 size={15}/>{source === 'community' ? 'LOST QUEST 물품 검색' : '경찰청 공공데이터 검색'}</span><h1>당신의 소중한 물건, 함께 찾아볼까요?</h1><p>{source === 'community' ? '회원이 등록한 분실물·습득물을 찾아보세요. 경찰청 자료는 분실물·습득물 탭에서 따로 조회할 수 있어요.' : '경찰청에 접수된 분실물·습득물을 찾아보세요. 회원이 등록한 물품은 LOST QUEST 탭에서 확인할 수 있어요.'}</p><div className="button-row"><Link className="text-link" to="/community-inbox">내 비공개 질문함</Link><Link className="text-link" to="/community">사용자 물품 게시판</Link></div></div>
    <form className="catalog-search" onSubmit={submit}><Search size={22}/><input aria-label="물품 이름 또는 특징 검색" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="물품 이름, 색상, 장소로 검색해 보세요" maxLength={100}/><button className="button button-primary" type="submit">검색</button></form>
    <div className="source-tabs" role="group" aria-label="데이터 출처"><button aria-pressed={source==='community'} className={source==='community'?'active':''} onClick={()=>selectSource('community')}>LOST QUEST{communityCount > 0 && <span>{communityCount}</span>}</button>{(['lost', 'found'] as const).map(policeType => {
      const selected = source === 'public' && type === policeType;
      return <button key={policeType} aria-pressed={selected} className={selected ? 'active' : ''} onClick={()=>selectSource('public', policeType)}>경찰청 {policeType === 'lost' ? '분실물' : '습득물'}{selected && !anyLoading && sources[policeSource].status === 'ready' && <span>불러온 {policeLoaded}건</span>}</button>;
    })}</div>
    <button className="button button-secondary filter-toggle" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={17}/>상세 필터{activeCount > 0 && <b>{activeCount}</b>}</button>
    <div className={`search-filter-panel ${filtersOpen?'filters-open':''}`}><div className="filter-panel-label"><ListFilter size={17}/><strong>상세 조건</strong><button className="text-link" onClick={()=>reset(true)}>초기화<RotateCcw size={13}/></button></div><div className={`search-filter-fields ${source === 'public' ? 'police-date-fields' : ''}`}>
      {source === 'community' && <label className="form-field">유형<select aria-label="물품 유형" value={type} onChange={e=>update('type',e.target.value)}><option value="">전체 유형</option><option value="found">습득물</option><option value="lost">분실물</option></select></label>}
      {source === 'community' && <><label className="form-field">지역 (LOST QUEST)<select aria-label="LOST QUEST 지역" value={region} onChange={e=>update('region',e.target.value)}><option value="">전국 모든 지역</option>{regions.map(r=><option key={r}>{r}</option>)}</select></label>
      <label className="form-field">카테고리 (LOST QUEST)<select aria-label="LOST QUEST 카테고리" value={category} onChange={e=>update('category',e.target.value)}><option value="">전체 카테고리</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label></>}
      <label className="form-field">시작 날짜<input type="date" aria-label="시작 날짜" value={from} max={to || undefined} disabled={source === 'public' && keywordMode} onChange={e=>update('from',e.target.value)}/></label><label className="form-field">종료 날짜<input type="date" aria-label="종료 날짜" value={to} min={from || undefined} disabled={source === 'public' && keywordMode} onChange={e=>update('to',e.target.value)}/></label>
    </div>{invalidRange && <p role="alert" className="field-error">종료 날짜를 시작 날짜 이후로 선택해 주세요.</p>}
      {source !== 'community' && <div className="police-filter-group" aria-label="경찰청 공공데이터 조건"><p className="police-filter-title">경찰청 공공데이터 조건 <small className="muted">경찰청 공통코드 기준</small></p>
        <div className={`search-filter-fields ${type === 'lost' ? 'police-lost-fields' : ''}`}>
          <label className="form-field">시·도<select aria-label="경찰청 지역" value={pRegion} disabled={policeFiltersDisabled} onChange={e=>update('pRegion',e.target.value)}><option value="">전체 지역</option>{policeFilters.options?.regions.map(o=><option key={o.value} value={o.value}>{o.name}</option>)}</select></label>
          <label className="form-field">물품 분류<select aria-label="경찰청 물품 분류" value={pCategory} disabled={policeFiltersDisabled} onChange={e=>{ const next = new URLSearchParams(paramsRef.current); e.target.value ? next.set('pCategory', e.target.value) : next.delete('pCategory'); next.delete('pSub'); paramsRef.current = next; setParams(next); }}><option value="">전체 분류</option>{policeFilters.options?.categories.map(o=><option key={o.value} value={o.value}>{o.name}</option>)}</select></label>
          <label className="form-field">세부 분류<select aria-label="경찰청 세부 분류" value={pSub} disabled={policeFiltersDisabled || !policeCategory} onChange={e=>update('pSub',e.target.value)}><option value="">전체 세부 분류</option>{policeCategory?.children.map(o=><option key={o.value} value={o.value}>{o.name}</option>)}</select></label>
          {type === 'found' && <label className="form-field">색상 (습득물)<select aria-label="경찰청 습득물 색상" value={pColor} disabled={policeFiltersDisabled} onChange={e=>update('pColor',e.target.value)}><option value="">전체 색상</option>{policeFilters.options?.colors.map(o=><option key={o.value} value={o.value}>{o.name}</option>)}</select></label>}
        </div>
        {policeFilters.status === 'loading' && <p className="muted" role="status">경찰청 조건 목록을 불러오고 있어요.</p>}
        {policeFilters.status === 'error' && <p className="field-error" role="alert">경찰청 조건 목록을 불러오지 못했어요. {policeFilters.error} <button type="button" className="text-link" onClick={() => void loadPoliceFilters()}>다시 시도</button></p>}
        {keywordMode && <p className="muted">경찰청 공공데이터는 검색어 검색 시 날짜·지역·분류·색상 조건을 지원하지 않아, 물품명으로만 찾아요.</p>}
        {type === 'found' && pColor && !keywordMode && <p className="muted">색상은 경찰청 습득물에만 적용돼요. 같은 이름의 색상 코드를 모두 함께 찾아요.</p>}
      </div>}
    </div>
    <ul className="public-list-status-grid" aria-label="데이터 출처별 상태">{relevantSources.map(key => <PublicListStatus key={key} label={SOURCE_LABELS[key]} state={sources[key]} retry={() => retry(key)} refresh={key.startsWith('police') ? () => { void loadPolice(key as 'policeLost' | 'policeFound', 1, true); } : undefined} retryPage={key.startsWith('police') ? page => { void loadPolice(key as 'policeLost' | 'policeFound', page); } : undefined} />)}</ul>
    <div className="catalog-result-toolbar"><p>{query && <strong>‘{query}’ </strong>}검색 결과 <b>{invalidRange ? 0 : filtered.length}</b>개</p><select aria-label="검색 결과 정렬" value={sort} onChange={e=>update('sort',e.target.value)}><option value="registered">최근 등록순</option><option value="latest">최신 날짜순</option><option value="oldest">오래된 날짜순</option></select></div>
    {filtered.length > 0 && !invalidRange ? <div className="items-grid">{filtered.map(item=><ItemCard key={item.id} item={item} readOnly={readOnlyIds.has(item.id)}/>)}</div> : anyLoading ? null : <div className="empty-state card"><span className="empty-icon"><Search size={32}/></span><h2>{hasUnavailableData ? '공개 목록을 확인할 수 없어요.' : hasStoredData ? '저장된 목록에 조건에 맞는 물품이 없어요.' : '조건에 맞는 물품이 아직 없어요.'}</h2><p>{hasUnavailableData || hasStoredData ? '서버에 다시 연결하거나 이전에 조회한 조건으로 확인해 주세요.' : '다른 검색어를 입력하거나 필터를 넓혀 보세요.'}</p><div className="button-row"><button className="button button-secondary" onClick={()=>reset(false)}>검색 조건 초기화</button>{!hasStoredData && !hasUnavailableData && <Link to="/register?type=lost" className="button button-primary">분실물 등록<ArrowRight size={16}/></Link>}</div></div>}
    {source === 'public' && !invalidRange && sources[policeSource].status === 'ready' && sources[policeSource].dataStatus === 'live' && sources[policeSource].page < sources[policeSource].totalPages && <div className="catalog-load-more">
      <button type="button" className="button button-secondary" disabled={sources[policeSource].pageLoading || sources[policeSource].refreshing || !!sources[policeSource].pageError} aria-busy={!!sources[policeSource].pageLoading} onClick={() => void loadPolice(policeSource, sources[policeSource].page + 1)}>{SOURCE_LABELS[policeSource]} 더 보기<ChevronDown size={18} aria-hidden="true"/></button></div>}
    <div className="info-note"><Globe2 size={17}/><p>LOST QUEST 물품은 회원이 등록해 서버에 저장된 데이터입니다. 경찰청 목록은 기본 최근 30일 기준입니다. {(sources.policeLost.cache || sources.policeFound.cache) && '같은 조회 조건의 목록은 최대 12시간 재사용하며, 새로고침은 1분 간격으로 가능합니다. '}실제 수령 절차와 보관 상태는 경찰청 LOST112와 보관기관에서 확인해 주세요.</p></div>
  </div>;
}
