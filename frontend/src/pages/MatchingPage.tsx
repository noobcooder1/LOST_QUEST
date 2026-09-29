import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, CalendarDays, Check, ChevronRight, CircleHelp, MapPin, Search, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { getMatches } from '../services/matching'
import './JourneyPages.css'

export default function MatchingPage() {
  const { items } = useApp()
  const [params, setParams] = useSearchParams()
  const [sort, setSort] = useState<'score' | 'latest'>('score')
  const lostItems = items.filter(item => item.type === 'lost' && item.status === 'open' && item.source === 'community' && item.createdBy === 'demo')
  const selectedItem = params.has('item') ? lostItems.find(item => item.id === params.get('item')) : lostItems[0]
  const matches = useMemo(() => {
    if (!selectedItem) return []
    const result = getMatches(selectedItem, items)
    return sort === 'latest' ? [...result].sort((a, b) => b.item.date.localeCompare(a.item.date)) : [...result].sort((a, b) => b.score - a.score)
  }, [selectedItem, items, sort])
  const bestScore = matches.length ? Math.max(...matches.map(match => match.score)) : 0

  return <div className="page-container matching-page">
    <div className="journey-breadcrumb"><Link to="/">홈</Link><ChevronRight size={14} /><span>AI 자동 매칭</span></div>
    <div className="page-heading"><div><span className="eyebrow">소중한 물건과 한 걸음 더 가까이</span><h1>소중한 물건, 다시 만날 수 있도록</h1><p>등록한 단서를 비교해, 내 물건과 닮은 습득물을 모았어요.</p></div><span className="badge badge-blue"><Sparkles size={14} /> AI 매칭 시뮬레이션</span></div>
    <div className="matching-notice"><ShieldCheck size={20} /><p><strong>지금은 가상 데이터로 체험 중이에요.</strong> 점수와 추천 근거는 종류·색상·지역·날짜를 비교한 규칙 기반 결과이며, 실제 AI 분석이나 소유권 증명이 아니에요.</p></div>
    {!selectedItem ? <div className="card empty-state matching-empty"><span><Search size={36} /></span><h2>먼저, 찾고 있는 물건을 알려 주세요</h2><p>분실물을 등록하면 비슷한 습득물을 바로 비교할 수 있어요.</p><Link className="button button-primary" to="/register?type=lost">분실물 등록하기 <ArrowRight size={17} /></Link></div> : <>
      <section className="card matching-source"><div className="matching-source-image"><img src={selectedItem.image} alt={selectedItem.title} /></div><div className="matching-source-info"><span className="eyebrow">찾고 있는 물품</span><h2>{selectedItem.title}</h2><div className="matching-source-meta"><span><MapPin size={15} /> {selectedItem.location}</span><span><CalendarDays size={15} /> {selectedItem.date} 분실</span></div><div className="matching-source-tags"><span>{selectedItem.category}</span><span>{selectedItem.color}</span><span>{selectedItem.region}</span></div></div><div className="matching-source-select"><label htmlFor="matching-item">매칭할 분실물 선택</label><select id="matching-item" value={selectedItem.id} onChange={event => setParams({ item: event.target.value })}>{lostItems.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><Link className="text-link" to={`/items/${selectedItem.id}`}>등록 정보 보기 <ArrowRight size={14} /></Link></div></section>
      <div className="matching-layout"><section className="matching-results"><div className="matching-result-heading"><div><h2>발견한 연결 <span>{matches.length}</span></h2><p className="muted">작은 단서 하나까지 꼼꼼하게 확인해 보세요.</p></div><div className="matching-sort" aria-label="매칭 결과 정렬"><button className={sort === 'score' ? 'active' : ''} onClick={() => setSort('score')}>정확도순</button><button className={sort === 'latest' ? 'active' : ''} onClick={() => setSort('latest')}>최신 습득순</button></div></div>
        {matches.length === 0 ? <div className="card empty-state matching-empty"><span><Search size={30} /></span><h3>아직 비슷한 물품을 찾지 못했어요</h3><p>다른 분실물을 선택하거나 전국 검색에서 직접 찾아보세요.</p><Link className="button button-secondary" to="/search">전국 검색하기 <ArrowRight size={16} /></Link></div> : <div className="matching-card-list">{matches.map(({ item, score, reasons }, index) => <article key={item.id} className={`card match-card ${score >= 85 ? 'high-match' : ''}`}>
          <Link className="match-photo" to={`/items/${item.id}?lostItem=${selectedItem.id}`}><img src={item.image} alt={item.title} />{index === 0 && sort === 'score' && <span className="match-photo-label"><Sparkles size={13} /> 가장 닮은 물품</span>}</Link>
          <div className="match-main"><div className="match-card-top"><span className={`badge ${item.source === 'public' ? 'badge-blue' : 'badge-green'}`}>{item.source === 'public' ? '공공데이터 · 가상' : '자체 등록'}</span><span className={`match-score ${score >= 85 ? 'strong' : ''}`}>유사도 <strong>{score}<small>%</small></strong></span></div><h3><Link to={`/items/${item.id}?lostItem=${selectedItem.id}`}>{item.title}</Link></h3><div className="match-item-meta"><span><MapPin size={14} /> {item.location}</span><span><CalendarDays size={14} /> {item.date} 습득</span></div><div className="match-reasons"><strong><WandSparkles size={14} /> 이렇게 닮았어요</strong><ul>{reasons.map(reason => <li key={reason}><Check size={13} /> {reason}</li>)}</ul></div><Link className="match-details" to={`/items/${item.id}?lostItem=${selectedItem.id}`}>내 물건인지 자세히 확인하기 <ArrowRight size={16} /></Link></div>
        </article>)}</div>}
      </section><aside className="matching-aside"><div className="card matching-summary"><span className="matching-summary-icon"><Sparkles size={25} /></span><span className="eyebrow">매칭 결과 한눈에 보기</span><h3>다시 만날 가능성을<br />발견했어요</h3><div className="matching-stat"><strong>{matches.length}<span>개</span></strong><span>비슷한 습득물</span></div><div className="matching-stat"><strong>{bestScore}<span>%</span></strong><span>가장 높은 유사도</span></div><p><CircleHelp size={15} /> 매칭 점수는 참고용이에요. 사진과 상세 특징을 함께 확인해 주세요.</p></div><div className="matching-next"><h3>내 물건을 발견했다면?</h3><ol><li><span>1</span>물품 상세 정보 확인</li><li><span>2</span>비공개 특징으로 소유자 확인</li><li><span>3</span>QR 인증 후 관리자 반환 승인</li></ol><Link to="/search" className="text-link">전국 검색도 둘러보기 <ArrowRight size={15} /></Link></div></aside></div>
    </>}
  </div>
}

