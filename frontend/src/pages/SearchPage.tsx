import { useSearchParams, Link } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Globe2, ListFilter, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { useApp } from '../context/AppContext';
import ItemCard from '../components/ItemCard';
import { categories, regions } from '../data/seed';
import { ApiClientError } from '../services/apiClient';
import { listAllServerItems } from '../services/itemApi';
import type { Item } from '../types';

export default function SearchPage() {
  const { items: demoItems } = useApp();
  // Two sources: community items from the Spring Boot API (MySQL) and public items from seed data.
  // Seed community examples stay in the app for the return/matching demos but are not listed here.
  const [serverItems, setServerItems] = useState<Item[]>([]);
  const [serverState, setServerState] = useState<{ loading: boolean; error: string }>({ loading: true, error: '' });
  const loadServerItems = useCallback(async (isCancelled: () => boolean = () => false) => {
    setServerState({ loading: true, error: '' });
    try {
      const loaded = await listAllServerItems();
      if (isCancelled()) return;
      setServerItems(loaded);
      setServerState({ loading: false, error: '' });
    } catch (error) {
      if (isCancelled()) return;
      setServerState({ loading: false, error: error instanceof ApiClientError ? error.message : '자체 등록 물품을 불러오지 못했어요.' });
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    void loadServerItems(() => cancelled);
    return () => { cancelled = true; };
  }, [loadServerItems]);
  const items = [...serverItems, ...demoItems.filter(item => item.source === 'public')];
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
  const [filtersOpen, setFiltersOpen] = useState(false);
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
    return (!query || text.includes(query.toLowerCase())) && (!region || item.region === region) && (!category || item.category === category) && (!source || item.source === source) && (!type || item.type === type) && (!from || item.date >= from) && (!to || item.date <= to);
  }).sort((a, b) => sort === 'oldest' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  const activeCount = [region, category, from, to, type].filter(Boolean).length;
  return <div className="page-container search-page"><div className="page-heading"><span className="eyebrow"><Globe2 size={15}/>전국 통합 검색</span><h1>당신의 소중한 물건, 함께 찾아볼까요?</h1><p>이웃의 등록 물품부터 공공 보관기관의 예시 데이터까지 한곳에서 찾아보세요.</p></div>
    <form className="catalog-search" onSubmit={submit}><Search size={22}/><input aria-label="물품 이름 또는 특징 검색" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="물품 이름, 색상, 장소로 검색해 보세요" maxLength={100}/><button className="button button-primary" type="submit">검색</button></form>
    <div className="source-tabs" role="group" aria-label="데이터 출처"><button aria-pressed={!source} className={!source?'active':''} onClick={()=>update('source','')}>전체 물품<span>{items.length}</span></button><button aria-pressed={source==='community'} className={source==='community'?'active':''} onClick={()=>update('source','community')}>자체 등록{!serverState.loading && !serverState.error && <span>{serverItems.length}</span>}</button><button aria-pressed={source==='public'} className={source==='public'?'active':''} onClick={()=>update('source','public')}>공공데이터<span className="tab-demo">예시</span></button></div>
    <button className="button button-secondary filter-toggle" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={17}/>상세 필터{activeCount > 0 && <b>{activeCount}</b>}</button>
    <div className={`search-filter-panel ${filtersOpen?'filters-open':''}`}><div className="filter-panel-label"><ListFilter size={17}/><strong>상세 조건</strong><button className="text-link" onClick={()=>{setParams(query?{q:query}:{});}}>초기화<RotateCcw size={13}/></button></div><div className="search-filter-fields">
      <label className="form-field">유형<select aria-label="물품 유형" value={type} onChange={e=>update('type',e.target.value)}><option value="">전체 유형</option><option value="found">습득물</option><option value="lost">분실물</option></select></label>
      <label className="form-field">지역<select aria-label="지역" value={region} onChange={e=>update('region',e.target.value)}><option value="">전국 모든 지역</option>{regions.map(r=><option key={r}>{r}</option>)}</select></label>
      <label className="form-field">카테고리<select aria-label="카테고리" value={category} onChange={e=>update('category',e.target.value)}><option value="">전체 카테고리</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
      <label className="form-field">시작 날짜<input type="date" value={from} max={to || undefined} onChange={e=>update('from',e.target.value)}/></label><label className="form-field">종료 날짜<input type="date" value={to} min={from || undefined} onChange={e=>update('to',e.target.value)}/></label>
    </div>{invalidRange && <p role="alert" className="field-error">종료 날짜를 시작 날짜 이후로 선택해 주세요.</p>}</div>
    {serverState.loading && <p className="info-note" role="status"><span className="loading-dot" />LOST QUEST에 등록된 물품을 불러오고 있어요.</p>}
    {serverState.error && <div className="field-error" role="alert"><p>자체 등록 물품을 불러오지 못했어요. {serverState.error}</p><button type="button" className="button button-secondary" onClick={() => { void loadServerItems(); }}>다시 시도</button></div>}
    <div className="catalog-result-toolbar"><p>{query && <strong>‘{query}’ </strong>}검색 결과 <b>{invalidRange ? 0 : filtered.length}</b>개</p><select aria-label="검색 결과 정렬" value={sort} onChange={e=>update('sort',e.target.value)}><option value="latest">최신 날짜순</option><option value="oldest">오래된 날짜순</option></select></div>
    {filtered.length > 0 && !invalidRange ? <div className="items-grid">{filtered.map(item=><ItemCard key={item.id} item={item}/>)}</div> : serverState.loading && source !== 'public' ? null : <div className="empty-state card"><span className="empty-icon"><Search size={32}/></span><h2>조건에 맞는 물품이 아직 없어요.</h2><p>다른 검색어를 입력하거나 필터를 넓혀 보세요.<br/>물품을 직접 등록하면 AI 매칭도 체험할 수 있어요.</p><div className="button-row"><button className="button button-secondary" onClick={()=>{setParams({});setDraft('');}}>전체 물품 보기</button><Link to="/register?type=lost" className="button button-primary">분실물 등록<ArrowRight size={16}/></Link></div></div>}
    <div className="info-note"><Globe2 size={17}/><p>자체 등록 물품은 LOST QUEST 회원이 등록해 서버에 저장된 데이터입니다. 공공데이터는 형식을 재현한 가상 데이터이며, 실제 접수 여부와 보관 상태는 공식 보관기관에서 확인해 주세요.</p></div>
  </div>;
}
