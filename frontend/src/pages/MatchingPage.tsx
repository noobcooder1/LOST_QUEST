import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CalendarDays, Check, ChevronRight, CircleHelp, ListChecks, LogIn, MapPin, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { useApp } from '../context/AppContext'
import ItemImage from '../components/ItemImage'
import { defaultItemImage } from '../data/seed'
import { listServerItems, parseServerRouteId } from '../services/itemApi'
import { describeMatchError, getItemMatches, SOURCE_LABELS, type ItemMatches, type MatchResult, type SourceStatus } from '../services/matchingApi'
import type { Item } from '../types'
import './JourneyPages.css'

const BREAKDOWN_LABELS: Record<string, string> = { category: '분류', region: '지역', color: '색상', date: '날짜' }

type Load<T> = { key: string; data?: T; error?: string }

/** One line per source that did not fully succeed; nothing is shown when every source answered. */
function sourceNotices(sources: SourceStatus[]): { source: SourceStatus; text: string }[] {
  return sources.filter((source) => source.status !== 'OK').map((source) => {
    const label = SOURCE_LABELS[source.source]
    const fallback = source.status === 'PARTIAL' ? '일부 결과만 불러왔어요.' : source.status === 'SKIPPED' ? '이번에는 검색하지 않았어요.' : '지금은 불러올 수 없어요.'
    return { source, text: `${label}: ${source.message ?? fallback}` }
  })
}

function MatchCard({ match, best }: { match: MatchResult; best: boolean }) {
  const detail = `/items/${match.routeId}`
  const place = match.source === 'POLICE' ? (match.place ? `보관: ${match.place}` : '') : match.place
  return <article className={`card match-card ${match.score >= 85 ? 'high-match' : ''}`}>
    <Link className="match-photo" to={detail}><ItemImage src={match.image} fallbackSrc={match.fallbackImage} alt={match.image ? `${match.title} 사진` : `${match.title} 예시 이미지`} loading="lazy" />{best && <span className="match-photo-label"><ListChecks size={13} /> 가장 높은 매칭도</span>}</Link>
    <div className="match-main">
      <div className="match-card-top"><span className={`badge ${match.source === 'POLICE' ? 'badge-blue' : 'badge-green'}`}>{SOURCE_LABELS[match.source]}</span><span className={`match-score ${match.score >= 85 ? 'strong' : ''}`}>매칭도 <strong>{match.score}<small>점</small></strong></span></div>
      <h3><Link to={detail}>{match.title}</Link></h3>
      <div className="match-item-meta">
        {(match.region || place) && <span><MapPin size={14} /> {[match.region, place].filter(Boolean).join(' · ')}</span>}
        {match.foundDate && <span><CalendarDays size={14} /> {match.foundDate} 습득</span>}
      </div>
      <div className="match-reasons"><strong><ListChecks size={14} /> 점수를 받은 조건</strong>{match.reasons.length ? <ul>{match.reasons.map((reason) => <li key={reason}><Check size={13} /> {reason}</li>)}</ul> : <p className="match-no-reason">일치한 조건이 없어요.</p>}
        <dl className="match-breakdown" aria-label="항목별 점수">{match.breakdown.map((component) => <div key={component.key} className={`match-breakdown-${component.result.toLowerCase()}`} title={component.note ?? undefined}><dt>{BREAKDOWN_LABELS[component.key] ?? component.key}</dt><dd>{component.result === 'UNKNOWN' ? '정보 없음' : `${component.points}/${component.maxPoints}`}</dd></div>)}</dl>
      </div>
      <Link className="match-details" to={detail}>내 물건인지 자세히 확인하기 <ArrowRight size={16} /></Link>
    </div>
  </article>
}

export default function MatchingPage() {
  const { authUser, authChecking } = useApp()
  const [params, setParams] = useSearchParams()
  const [sort, setSort] = useState<'score' | 'latest'>('score')
  const [reload, setReload] = useState(0)
  const userKey = authUser ? `${authUser.id}:${reload}` : ''
  const [mine, setMine] = useState<Load<Item[]>>({ key: '' })
  const [result, setResult] = useState<Load<ItemMatches>>({ key: '' })

  // The caller's own open lost items on the server; the server checks ownership again for the matches.
  useEffect(() => {
    if (!authUser) return
    let cancelled = false
    const key = userKey
    listServerItems('lost')
      .then((items) => { if (!cancelled) setMine({ key, data: items.filter((item) => item.ownerId === authUser.id && item.status === 'open') }) })
      .catch((error: unknown) => { if (!cancelled) setMine({ key, error: describeMatchError(error) }) })
    return () => { cancelled = true }
  }, [authUser, userKey])

  const myItems = mine.key === userKey ? mine.data : undefined
  const requested = params.get('item')
  const selected = myItems ? (requested ? myItems.find((item) => item.id === requested) : myItems[0]) : undefined
  // A requested item that is not one of the caller's lost items is still sent to the server, which answers 403/404.
  const requestedServerId = requested ? parseServerRouteId(requested) : null
  const targetServerId = selected?.serverId ?? (requestedServerId?.type === 'lost' ? requestedServerId.serverId : undefined)
  const matchKey = targetServerId && authUser ? `${targetServerId}:${userKey}` : ''

  useEffect(() => {
    if (!matchKey || !targetServerId) return
    let cancelled = false
    getItemMatches(targetServerId)
      .then((data) => { if (!cancelled) setResult({ key: matchKey, data }) })
      .catch((error: unknown) => { if (!cancelled) setResult({ key: matchKey, error: describeMatchError(error) }) })
    return () => { cancelled = true }
  }, [matchKey, targetServerId])

  const current = result.key === matchKey ? result : undefined
  const matches = useMemo(() => {
    const list = current?.data?.matches ?? []
    // Server order is the score order (ties: closer date, then stable id); "latest" only re-sorts for display.
    return sort === 'latest' ? [...list].sort((a, b) => b.foundDate.localeCompare(a.foundDate) || a.id.localeCompare(b.id)) : list
  }, [current, sort])
  const sources = current?.data?.sources ?? []
  const allFailed = sources.length > 0 && sources.every((source) => source.status === 'UNAVAILABLE' || source.status === 'SKIPPED')
  const notices = sourceNotices(sources)
  const bestScore = current?.data?.matches[0]?.score ?? 0

  const heading = <>
    <div className="journey-breadcrumb"><Link to="/">홈</Link><ChevronRight size={14} /><span>습득물 매칭 추천</span></div>
    <div className="page-heading"><div><span className="eyebrow">소중한 물건과 한 걸음 더 가까이</span><h1>내 분실물과 닮은 습득물</h1><p>LOST QUEST에 등록된 습득물과 경찰청 습득물 공공데이터를 함께 비교했어요.</p></div><span className="badge badge-blue"><ListChecks size={14} /> 조건 비교 추천</span></div>
    <div className="matching-notice"><ShieldCheck size={20} /><p><strong>매칭도는 분류·지역·색상·날짜가 얼마나 일치하는지 규칙에 따라 계산한 점수예요.</strong> 사진은 비교하지 않으며, 내 물건이라는 확인이나 소유권 증명이 아니에요. 상세 정보와 사진을 꼭 함께 확인해 주세요.</p></div>
  </>

  if (authChecking) return <div className="page-container matching-page">{heading}<div className="card empty-state matching-empty" role="status"><h2>로그인 상태를 확인하고 있어요…</h2></div></div>
  if (!authUser) return <div className="page-container matching-page">{heading}<div className="card empty-state matching-empty"><span><LogIn size={36} /></span><h2>로그인하고 매칭 추천을 받아 보세요</h2><p>내가 등록한 분실물을 기준으로 비슷한 습득물을 찾아 드려요.</p><Link className="button button-primary" to={`/login?returnTo=${encodeURIComponent(`/matches${requested ? `?item=${requested}` : ''}`)}`}>로그인하기 <ArrowRight size={17} /></Link></div></div>
  if (mine.key === userKey && mine.error && !targetServerId) return <div className="page-container matching-page">{heading}<div className="card empty-state matching-empty" role="alert"><span><AlertTriangle size={36} /></span><h2>내 분실물을 불러오지 못했어요</h2><p>{mine.error}</p><button className="button button-secondary" onClick={() => setReload((value) => value + 1)}><RefreshCw size={16} /> 다시 시도</button></div></div>
  if (!myItems && !targetServerId) return <div className="page-container matching-page">{heading}<div className="card empty-state matching-empty" role="status"><h2>내 분실물을 불러오고 있어요…</h2></div></div>
  if (myItems && myItems.length === 0 && !targetServerId) return <div className="page-container matching-page">{heading}<div className="card empty-state matching-empty"><span><Search size={36} /></span><h2>먼저, 찾고 있는 물건을 알려 주세요</h2><p>분실물을 등록하면 비슷한 습득물을 바로 비교할 수 있어요.</p><Link className="button button-primary" to="/register?type=lost">분실물 등록하기 <ArrowRight size={17} /></Link></div></div>

  return <div className="page-container matching-page">
    {heading}
    {selected ? <section className="card matching-source"><div className="matching-source-image"><ItemImage src={selected.image} fallbackSrc={defaultItemImage(selected.category, selected.title)} alt={selected.title} /></div><div className="matching-source-info"><span className="eyebrow">찾고 있는 물품</span><h2>{selected.title}</h2><div className="matching-source-meta"><span><MapPin size={15} /> {[selected.region, selected.location].filter(Boolean).join(' · ')}</span><span><CalendarDays size={15} /> {selected.date} 분실</span></div><div className="matching-source-tags">{[selected.category, selected.color, selected.region].filter(Boolean).map((tag) => <span key={tag}>{tag}</span>)}</div></div><div className="matching-source-select"><label htmlFor="matching-item">매칭할 분실물 선택</label><select id="matching-item" value={selected.id} onChange={(event) => setParams({ item: event.target.value })}>{(myItems ?? []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><Link className="text-link" to={`/items/${selected.id}`}>등록 정보 보기 <ArrowRight size={14} /></Link></div></section>
      : myItems && myItems.length > 0 && <div className="matching-notice"><CircleHelp size={20} /><p>선택한 분실물이 내 분실물 목록에 없어요. <button type="button" className="text-link" onClick={() => setParams({})}>내 분실물로 돌아가기</button></p></div>}
    <div className="matching-layout"><section className="matching-results" aria-busy={!current}>
      <div className="matching-result-heading"><div><h2>추천 습득물 <span>{current?.data ? matches.length : ''}</span></h2><p className="muted">매칭도 {current?.data?.minScore ?? 40}점 이상인 습득물을 높은 순으로 보여 드려요.</p></div><div className="matching-sort" aria-label="매칭 결과 정렬"><button className={sort === 'score' ? 'active' : ''} onClick={() => setSort('score')}>매칭도순</button><button className={sort === 'latest' ? 'active' : ''} onClick={() => setSort('latest')}>최신 습득순</button></div></div>
      {!current ? <div className="card empty-state matching-empty" role="status"><span><Search size={30} className="pulse-icon" /></span><h3>습득물을 비교하고 있어요…</h3><p>경찰청 공공데이터 조회에 시간이 조금 걸릴 수 있어요.</p></div>
        : current.error ? <div className="card empty-state matching-empty" role="alert"><span><AlertTriangle size={30} /></span><h3>매칭 추천을 불러오지 못했어요</h3><p>{current.error}</p><button className="button button-secondary" onClick={() => setReload((value) => value + 1)}><RefreshCw size={16} /> 다시 시도</button></div>
        : <>
          {notices.length > 0 && <div className="matching-source-notices" role="status">{notices.map(({ source, text }) => <p key={source.source}><AlertTriangle size={15} /> {text}</p>)}</div>}
          {allFailed ? <div className="card empty-state matching-empty" role="alert"><span><AlertTriangle size={30} /></span><h3>지금은 습득물을 비교할 수 없어요</h3><p>모든 데이터 출처 조회에 실패했어요. 잠시 후 다시 시도해 주세요.</p><button className="button button-secondary" onClick={() => setReload((value) => value + 1)}><RefreshCw size={16} /> 다시 시도</button></div>
            : matches.length === 0 ? <div className="card empty-state matching-empty"><span><Search size={30} /></span><h3>아직 비슷한 습득물을 찾지 못했어요</h3><p>새 습득물이 등록되면 다시 확인해 보세요. 전국 검색에서 직접 찾아볼 수도 있어요.</p><Link className="button button-secondary" to="/search">전국 검색하기 <ArrowRight size={16} /></Link></div>
              : <div className="matching-card-list">{matches.map((match) => <MatchCard key={match.id} match={match} best={sort === 'score' && match === current.data?.matches[0]} />)}</div>}
        </>}
    </section><aside className="matching-aside"><div className="card matching-summary"><span className="matching-summary-icon"><ListChecks size={25} /></span><span className="eyebrow">매칭 결과 한눈에 보기</span><h3>등록한 단서와<br />닮은 습득물</h3><div className="matching-stat"><strong>{current?.data ? matches.length : '-'}<span>개</span></strong><span>추천 습득물</span></div><div className="matching-stat"><strong>{current?.data && matches.length ? bestScore : '-'}<span>점</span></strong><span>가장 높은 매칭도 ({current?.data?.maxScore ?? 100}점 만점)</span></div><p><CircleHelp size={15} /> 분류 35 · 지역 25 · 색상 20 · 날짜 20점. 정보가 없는 조건은 점수를 받지 않아요.</p></div><div className="matching-next"><h3>내 물건을 발견했다면?</h3><ol><li><span>1</span>물품 상세 정보와 사진 확인</li><li><span>2</span>경찰청 물품은 담당 기관에 문의</li><li><span>3</span>LOST QUEST 물품은 등록자와 확인</li></ol><Link to="/search" className="text-link">전국 검색도 둘러보기 <ArrowRight size={15} /></Link></div></aside></div>
  </div>
}
