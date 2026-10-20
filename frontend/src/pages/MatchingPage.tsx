import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CalendarDays, Check, ChevronRight, CircleHelp, Image, ListChecks, LogIn, MapPin, Play, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { useApp } from '../context/AppContext'
import ItemImage from '../components/ItemImage'
import { defaultItemImage } from '../data/seed'
import { listServerItems, parseServerRouteId } from '../services/itemApi'
import { uploadedPhotoUrl } from '../services/matchPhotoComparison'
import { itemTypeForKind } from '../features/imageAnalysis/categories'
import { describeMatchError, getItemMatches, SOURCE_LABELS, type ItemMatches, type MatchResult, type SourceStatus } from '../services/matchingApi'
import type { Item } from '../types'
import { compareMatchTexts } from '../features/textMatching/textMatching'
import './JourneyPages.css'

// The AI comparison screen (and its model code) loads only when a card's AI button is pressed.
const MatchComparePanel = lazy(() => import('./MatchComparePanel'))

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

/** Per-card photo comparison: only for cards with a real photo while the lost item also has one. */
interface PhotoControl { onCompare: () => void }

function PhotoCompareButton({ photo, compact }: { photo: PhotoControl; compact?: boolean }) {
  return <div className={`match-photo-action ${compact ? 'compact' : ''}`}>
    <button type="button" className="button button-secondary" onClick={photo.onCompare}><Image size={15} />AI 비교</button>
  </div>
}

function MatchCard({ match, best, lostItemId, photo, text, sameKind }: { match: MatchResult; best: boolean; lostItemId?: string; photo?: PhotoControl; text?: number | 'pending'; sameKind?: string }) {
  const detail = `/items/${match.routeId}${match.source === 'LOST_QUEST' && lostItemId ? '?lostItem=' + encodeURIComponent(lostItemId) : ''}`
  const place = match.source === 'POLICE' ? (match.place ? `보관: ${match.place}` : '') : match.place
  return <article className={`card match-card ${match.score >= 85 ? 'high-match' : ''} ${sameKind ? 'match-card-same-kind' : ''}`}>
    <Link className="match-photo" to={detail}><ItemImage src={match.image} fallbackSrc={match.fallbackImage} alt={match.image ? `${match.title} 사진` : `${match.title} 예시 이미지`} loading="lazy" />{best && <span className="match-photo-label"><ListChecks size={13} /> 추천 1순위</span>}</Link>
    <div className="match-main">
      <div className="match-card-top"><span className={`badge ${match.source === 'POLICE' ? 'badge-blue' : 'badge-green'}`}>{SOURCE_LABELS[match.source]}</span><span className={`match-score ${match.score >= 85 ? 'strong' : ''}`}>매칭도 <strong>{match.score}<small>점</small></strong></span></div>
      {sameKind && <span className="match-name-badge"><Check size={13} /> 이름 일치 · {sameKind}</span>}
      <h3><Link to={detail}>{match.title}</Link></h3>
      {text !== undefined && <p className="match-text-similarity">{text === 'pending' ? '텍스트 의미 비교 중…' : `텍스트 의미 ${(text * 100).toFixed(1)}%`} <small>참고값 · 매칭도와 순위에는 반영되지 않아요</small></p>}
      <div className="match-item-meta">
        {(match.region || place) && <span><MapPin size={14} /> {[match.region, place].filter(Boolean).join(' · ')}</span>}
        {match.foundDate && <span><CalendarDays size={14} /> {match.foundDate} 습득</span>}
      </div>
      <div className="match-reasons"><strong><ListChecks size={14} /> 점수를 받은 조건</strong>{match.reasons.length ? <ul>{match.reasons.map((reason) => <li key={reason}><Check size={13} /> {reason}</li>)}</ul> : <p className="match-no-reason">일치한 조건이 없어요.</p>}
        <dl className="match-breakdown" aria-label="항목별 점수">{match.breakdown.map((component) => <div key={component.key} className={`match-breakdown-${component.result.toLowerCase()}`} title={component.note ?? undefined}><dt>{BREAKDOWN_LABELS[component.key] ?? component.key}</dt><dd>{component.result === 'UNKNOWN' ? '정보 없음' : `${component.points}/${component.maxPoints}`}</dd></div>)}</dl>
      </div>
      {photo && <PhotoCompareButton photo={photo} />}
      <Link className="match-details" to={detail}>내 물건인지 자세히 확인하기 <ArrowRight size={16} /></Link>
    </div>
  </article>
}

/** Smaller row for candidates whose name does not tell the item kind; same score and link, no details. */
function CompactMatchCard({ match, lostItemId, photo }: { match: MatchResult; lostItemId?: string; photo?: PhotoControl }) {
  const detail = `/items/${match.routeId}${match.source === 'LOST_QUEST' && lostItemId ? '?lostItem=' + encodeURIComponent(lostItemId) : ''}`
  const place = match.source === 'POLICE' ? (match.place ? `보관: ${match.place}` : '') : match.place
  return <article className="card match-card match-card-compact">
    <Link className="match-photo" to={detail} tabIndex={-1} aria-hidden="true"><ItemImage src={match.image} fallbackSrc={match.fallbackImage} alt="" loading="lazy" /></Link>
    <div className="match-main">
      <div className="match-card-top"><span className={`badge ${match.source === 'POLICE' ? 'badge-blue' : 'badge-green'}`}>{SOURCE_LABELS[match.source]}</span><span className="match-score">매칭도 <strong>{match.score}<small>점</small></strong></span></div>
      <h3><Link to={detail}>{match.title}</Link></h3>
      <p className="match-compact-meta">{[[match.region, place].filter(Boolean).join(' · '), match.foundDate && `${match.foundDate} 습득`].filter(Boolean).join(' · ')}</p>
      {photo && <PhotoCompareButton photo={photo} compact />}
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
  const [request, setRequest] = useState<{ key: string; attempt: number } | null>(null)
  const [textRun, setTextRun] = useState<{ key: string; busy: boolean; values: Record<string, number>; completed: number; total: number; failed?: boolean }>({ key: '', busy: false, values: {}, completed: 0, total: 0 })
  const [photoCompare, setPhotoCompare] = useState<{ key: string; match: MatchResult } | null>(null)
  const requestSequence = useRef(0)
  const pendingMatches = useRef(new Map<string, Promise<ItemMatches>>())

  // The caller's own open lost items on the server; the server checks ownership again for the matches.
  useEffect(() => {
    if (!authUser || authChecking) return
    let cancelled = false
    const key = userKey
    listServerItems('lost')
      .then((items) => { if (!cancelled) setMine({ key, data: items.filter((item) => item.ownerId === authUser.id && item.status === 'open' && !item.hidden) }) })
      .catch((error: unknown) => { if (!cancelled) setMine({ key, error: describeMatchError(error) }) })
    return () => { cancelled = true }
  }, [authUser, authChecking, userKey])

  const myItems = mine.key === userKey ? mine.data : undefined
  const requested = params.get('item')
  const selected = requested ? myItems?.find((item) => item.id === requested) : undefined
  // A requested item that is not one of the caller's lost items is still sent to the server, which answers 403/404.
  const requestedServerId = requested ? parseServerRouteId(requested) : null
  const targetServerId = selected?.serverId ?? (requestedServerId?.type === 'lost' ? requestedServerId.serverId : undefined)
  const matchKey = targetServerId && authUser ? `${targetServerId}:${userKey}` : ''
  const runKey = request?.key === matchKey && matchKey ? `${matchKey}:${request.attempt}` : ''
  const selectItem = (id?: string) => {
    const next = new URLSearchParams(params)
    if (id) next.set('item', id)
    else next.delete('item')
    setResult({ key: '' })
    setRequest(null)
    setParams(next)
  }
  const startMatching = () => {
    if (!matchKey) return
    setResult({ key: '' })
    setRequest({ key: matchKey, attempt: ++requestSequence.current })
  }

  useEffect(() => {
    if (authChecking || !runKey || !targetServerId) return
    let cancelled = false
    // StrictMode and quick selection changes can share an already running comparison.
    let pending = pendingMatches.current.get(runKey)
    if (!pending) {
      pending = getItemMatches(targetServerId)
      pendingMatches.current.set(runKey, pending)
      const clear = () => pendingMatches.current.delete(runKey)
      void pending.then(clear, clear)
    }
    pending
      .then((data) => { if (!cancelled) setResult({ key: runKey, data }) })
      .catch((error: unknown) => { if (!cancelled) setResult({ key: runKey, error: describeMatchError(error) }) })
    return () => { cancelled = true }
  }, [authChecking, runKey, targetServerId])

  // Reference-only text meaning values, computed in the background after the results are already on screen.
  // The server's score order, the 40-point floor and the 10-item limit are never changed by this.
  const textData = runKey && result.key === runKey ? result.data : undefined
  useEffect(() => {
    if (!textData || !textData.matches.length) return
    const controller = new AbortController()
    const key = runKey
    setTextRun({ key, busy: true, values: {}, completed: 0, total: textData.matches.length + 1 })
    compareMatchTexts(textData, controller.signal, (completed, total) => {
      if (!controller.signal.aborted) setTextRun((previous) => previous.key === key ? { ...previous, completed, total } : previous)
    })
      .then((values) => { if (!controller.signal.aborted) setTextRun((previous) => previous.key === key ? { ...previous, busy: false, values } : previous) })
      .catch(() => { if (!controller.signal.aborted) setTextRun((previous) => previous.key === key ? { ...previous, busy: false, failed: true } : previous) })
    return () => controller.abort()
  }, [runKey, textData])

  const current = runKey && result.key === runKey ? result : undefined
  const matching = Boolean(runKey && !current)
  const matches = useMemo(() => {
    const list = current?.data?.matches ?? []
    // Server order is the score order (ties: closer date, then stable id); "latest" only re-sorts for display.
    return sort === 'latest' ? [...list].sort((a, b) => b.foundDate.localeCompare(a.foundDate) || a.id.localeCompare(b.id)) : list
  }, [current, sort])
  // Same-kind names are shown large; candidates whose name does not tell the kind are listed small below.
  const nameKind = current?.data?.target?.nameKind
  const grouped = Boolean(nameKind) && matches.some((match) => match.nameMatch !== undefined)
  const sameKindMatches = grouped ? matches.filter((match) => match.nameMatch === 'SAME_KIND') : matches
  const otherMatches = grouped ? matches.filter((match) => match.nameMatch !== 'SAME_KIND') : []
  const sources = current?.data?.sources ?? []
  const allFailed = sources.length > 0 && sources.every((source) => source.status === 'UNAVAILABLE' || source.status === 'SKIPPED')
  const notices = sourceNotices(sources)
  // The first card is the name-first recommendation, not necessarily the highest score.
  const bestScore = Math.max(0, ...(current?.data?.matches ?? []).map((match) => match.score))
  const currentText = runKey && textRun.key === runKey ? textRun : undefined
  // Photo comparison needs a real uploaded photo on the lost item; candidates need a real photo too (not an illustration).
  const lostHasPhoto = Boolean(selected && uploadedPhotoUrl(selected.image))
  const comparing = photoCompare && photoCompare.key === runKey && selected ? photoCompare.match : undefined

  // The comparison layer closes with Escape and keeps the page behind it from scrolling.
  useEffect(() => {
    if (!comparing) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPhotoCompare(null) }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', close)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', close) }
  }, [comparing])

  // The found photo is needed; the lost post may be compared by its words when it has no photo.
  const photoFor = (match: MatchResult): PhotoControl | undefined =>
    match.image && runKey ? { onCompare: () => setPhotoCompare({ key: runKey, match }) } : undefined

  const heading = <>
    <div className="journey-breadcrumb"><Link to="/">홈</Link><ChevronRight size={14} /><span>매칭 추천</span></div>
    <div className="page-heading"><div><span className="eyebrow">소중한 물건과 한 걸음 더 가까이</span><h1>내가 잃어버린 물건과 닮은 주운 물건</h1><p>내가 잃어버린 물건을 선택하고 매칭을 시작하면 LOST QUEST와 경찰청의 주운 물건을 함께 찾아드려요.</p></div><span className="badge badge-blue"><ListChecks size={14} /> 조건 비교 추천</span></div>
    <div className="matching-notice"><ShieldCheck size={20} /><p><strong>매칭도는 분류·지역·색상·날짜가 얼마나 일치하는지 규칙에 따라 계산한 점수예요. 추천 순서는 물품 이름이 같은 종류(예: 우산)인 주운 물건을 먼저, 그다음 매칭도가 높은 순으로 정하고, 이름이 분명히 다른 종류(예: 우산을 찾을 때 낚싯대)는 추천에서 빼요.</strong> 텍스트 의미와 사진 비교 값은 이 기기에서 계산한 참고값이라 점수와 순위에 반영되지 않아요. 내 물건이라는 확인이나 소유권 증명이 아니니 상세 정보와 사진을 꼭 함께 확인해 주세요.</p></div>
  </>

  if (authChecking) return <div className="page-container matching-page">{heading}<div className="card empty-state matching-empty" role="status"><h2>로그인 상태를 확인하고 있어요…</h2></div></div>
  if (!authUser) return <div className="page-container matching-page">{heading}<div className="card empty-state matching-empty"><span><LogIn size={36} /></span><h2>로그인하고 매칭 추천을 받아 보세요</h2><p>내가 등록한 잃어버린 물건을 기준으로 비슷한 주운 물건을 찾아 드려요.</p><Link className="button button-primary" to={`/login?returnTo=${encodeURIComponent(`/matches${requested ? `?item=${requested}` : ''}`)}`}>로그인하기 <ArrowRight size={17} /></Link></div></div>
  if (mine.key === userKey && mine.error && !targetServerId) return <div className="page-container matching-page">{heading}<div className="card empty-state matching-empty" role="alert"><span><AlertTriangle size={36} /></span><h2>내가 잃어버린 물건을 불러오지 못했어요</h2><p>{mine.error}</p><button className="button button-secondary" onClick={() => setReload((value) => value + 1)}><RefreshCw size={16} /> 다시 시도</button></div></div>
  if (!myItems && !targetServerId) return <div className="page-container matching-page">{heading}<div className="card empty-state matching-empty" role="status"><h2>내가 잃어버린 물건을 불러오고 있어요…</h2></div></div>
  if (myItems && myItems.length === 0 && !targetServerId) return <div className="page-container matching-page">{heading}<div className="card empty-state matching-empty"><span><Search size={36} /></span><h2>먼저, 찾고 있는 물건을 알려 주세요</h2><p>잃어버린 물건을 등록하면 비슷한 주운 물건을 바로 비교할 수 있어요.</p><Link className="button button-primary" to="/register?type=lost">내 물건 찾기 등록하기 <ArrowRight size={17} /></Link></div></div>
  if (!targetServerId) return <div className="page-container matching-page">{heading}
    <section className="matching-picker" aria-labelledby="matching-picker-title">
      <div className="matching-picker-heading"><div><h2 id="matching-picker-title">어떤 물품을 찾아볼까요?</h2><p>비교할 물건을 고른 뒤 ‘매칭 시작’을 눌러 주세요.</p></div><span className="badge badge-blue">선택 가능한 물품 {myItems?.length ?? 0}개</span></div>
      {requested && <p className="matching-picker-error" role="alert">선택한 물품을 확인할 수 없어요. 아래 목록에서 비교할 물건을 선택해 주세요.</p>}
      <div className="matching-choice-grid">{myItems?.map(item => <button key={item.id} type="button" className="card matching-choice" onClick={() => selectItem(item.id)} aria-label={`${item.title} (${item.date} 분실) 선택`}>
        <span className="matching-choice-image"><ItemImage src={item.image} fallbackSrc={defaultItemImage(item.category, item.title)} alt="" loading="lazy" /></span>
        <span className="matching-choice-info"><strong>{item.title}</strong><span>{item.category}{item.color ? ` · ${item.color}` : ''}</span><span><CalendarDays size={14} /> {item.date} 분실</span>{(item.region || item.location) && <span><MapPin size={14} /> {[item.region, item.location].filter(Boolean).join(' · ')}</span>}<span className="matching-choice-action">이 물품 선택 <ArrowRight size={14} /></span></span>
      </button>)}</div>
      <Link className="text-link matching-picker-register" to="/register?type=lost">다른 물건 등록하기 <ArrowRight size={14} /></Link>
    </section>
  </div>

  return <div className="page-container matching-page">
    {heading}
    <button type="button" className="text-link matching-reselect" onClick={() => selectItem()}>다른 물품 선택 <ArrowRight size={14} /></button>
    {selected ? <section className="card matching-source"><div className="matching-source-image"><ItemImage src={selected.image} fallbackSrc={defaultItemImage(selected.category, selected.title)} alt={selected.title} /></div><div className="matching-source-info"><span className="eyebrow">찾고 있는 물품</span><h2>{selected.title}</h2><div className="matching-source-meta"><span><MapPin size={15} /> {[selected.region, selected.location].filter(Boolean).join(' · ')}</span><span><CalendarDays size={15} /> {selected.date} 분실</span></div><div className="matching-source-tags">{[selected.category, selected.color, selected.region].filter(Boolean).map((tag) => <span key={tag}>{tag}</span>)}</div></div><div className="matching-source-select"><label htmlFor="matching-item">매칭할 물건 선택</label><select id="matching-item" value={selected.id} onChange={(event) => selectItem(event.target.value)}>{(myItems ?? []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><Link className="text-link" to={`/items/${selected.id}`}>등록 정보 보기 <ArrowRight size={14} /></Link></div></section>
      : myItems && myItems.length > 0 && <div className="matching-notice"><CircleHelp size={20} /><p>선택한 물건이 내가 잃어버린 물건 목록에 없어요. <button type="button" className="text-link" onClick={() => selectItem()}>내 물건 목록으로 돌아가기</button></p></div>}
    <section className="card matching-stage matching-start" aria-label="매칭 시작">
      <div className="matching-stage-info"><h2>주운 물건 매칭</h2><p>{matching ? '등록한 조건으로 주운 물건을 비교하고 있어요.' : currentText?.busy ? `추천 결과를 먼저 보여 드리고, 텍스트 의미를 이 기기에서 비교하고 있어요. ${currentText.completed}/${currentText.total}` : current?.data ? '비교가 끝났어요. 아래 추천 결과를 확인해 주세요.' : '분류·지역·색상·날짜로 주운 물건을 찾고, 제목·공개 설명의 의미를 참고값으로 보여 드려요.'}</p>
        {current?.data && matches.length > 0 && <p className="matching-photo-hint"><Image size={15} />{lostHasPhoto ? '사진이 있는 추천 항목에는 ‘AI 비교’ 버튼이 생겨요. 사진 외형·글·색상을 이 기기에서 함께 비교해요.' : '사진이 있는 추천 항목에는 ‘AI 비교’ 버튼이 생겨요. 내가 잃어버린 물건은 사진이 없어 글로 비교해요.'}</p>}</div>
      <button type="button" className="button button-primary" disabled={matching} onClick={startMatching}><Play size={16} />{matching ? '매칭 중…' : current?.data ? '다시 매칭' : '매칭 시작'}</button>
    </section>
    <div className="matching-layout"><section className="matching-results" aria-busy={matching}>
      <div className="matching-result-heading"><div><h2>추천 후보 <span>{current?.data ? matches.length : ''}</span></h2><p className="muted">매칭도 {current?.data?.minScore ?? 40}점 이상인 주운 물건을 이름이 같은 종류부터, 매칭도가 높은 순으로 보여 드려요. 이름이 분명히 다른 종류는 빼요.</p></div><div className="matching-sort" aria-label="매칭 결과 정렬"><button className={sort === 'score' ? 'active' : ''} onClick={() => setSort('score')}>추천순</button><button className={sort === 'latest' ? 'active' : ''} onClick={() => setSort('latest')}>최신 습득순</button></div></div>
      {!current ? <div className="card empty-state matching-empty" role={matching ? 'status' : undefined}><span><Search size={30} className={matching ? 'pulse-icon' : undefined} /></span><h3>{matching ? '주운 물건을 비교하고 있어요…' : '선택한 물품으로 매칭을 시작해 보세요'}</h3><p>{matching ? '경찰청 공공데이터 조회에 시간이 조금 걸릴 수 있어요.' : '위의 ‘매칭 시작’ 버튼을 누르면 추천 후보를 불러옵니다.'}</p></div>
        : current.error ? <div className="card empty-state matching-empty" role="alert"><span><AlertTriangle size={30} /></span><h3>매칭 추천을 불러오지 못했어요</h3><p>{current.error}</p><button className="button button-secondary" onClick={startMatching}><RefreshCw size={16} /> 다시 시도</button></div>
        : <>
          {currentText?.failed && <div className="matching-source-notices" role="status"><p><AlertTriangle size={15} /> 텍스트 의미 참고값을 계산하지 못했어요. 매칭도와 추천 순서에는 영향이 없어요.</p></div>}
          {notices.length > 0 && <div className="matching-source-notices" role="status">{notices.map(({ source, text }) => <p key={source.source}><AlertTriangle size={15} /> {text}</p>)}</div>}
          {allFailed ? <div className="card empty-state matching-empty" role="alert"><span><AlertTriangle size={30} /></span><h3>지금은 주운 물건을 비교할 수 없어요</h3><p>모든 데이터 출처 조회에 실패했어요. 잠시 후 다시 시도해 주세요.</p><button className="button button-secondary" onClick={startMatching}><RefreshCw size={16} /> 다시 시도</button></div>
            : matches.length === 0 ? <div className="card empty-state matching-empty"><span><Search size={30} /></span><h3>아직 비슷한 주운 물건을 찾지 못했어요</h3><p>새 주운 물건이 등록되면 다시 확인해 보세요. 전국 검색에서 직접 찾아볼 수도 있어요.</p><Link className="button button-secondary" to="/search">전국 검색하기 <ArrowRight size={16} /></Link></div>
              : <div className="matching-card-list">
                {grouped && <h3 className="match-group-title">이름이 같은 종류 · {nameKind} <span>{sameKindMatches.length}개</span></h3>}
                {grouped && !sameKindMatches.length && <p className="match-group-empty">이름이 ‘{nameKind}’인 주운 물건은 아직 없어요. 아래 후보도 확인해 보세요.</p>}
                {sameKindMatches.map((match) => <MatchCard key={match.id} match={match} lostItemId={selected?.id} best={sort === 'score' && match === sameKindMatches[0]} photo={photoFor(match)} text={currentText?.busy ? 'pending' : currentText?.values[match.id]} sameKind={grouped ? nameKind : undefined} />)}
                {otherMatches.length > 0 && <>
                  <h3 className="match-group-title match-group-minor">그 밖의 후보 <span>{otherMatches.length}개</span><small>이름으로 종류를 확인할 수 없어 작게 보여 드려요</small></h3>
                  <div className="match-compact-list">{otherMatches.map((match) => <CompactMatchCard key={match.id} match={match} lostItemId={selected?.id} photo={photoFor(match)} />)}</div>
                </>}
              </div>}
        </>}
    </section>{comparing && selected && <div className="photo-compare-layer" role="dialog" aria-modal="true" aria-label="AI 사진 비교">
      <div className="photo-compare-sheet">
        <Suspense fallback={<div className="card empty-state matching-empty" role="status"><h3>사진 비교 화면을 불러오고 있어요…</h3></div>}>
          <MatchComparePanel lost={selected} match={comparing} lostKind={nameKind} itemType={comparing.nameMatch === 'SAME_KIND' ? itemTypeForKind(nameKind) : undefined} onClose={() => setPhotoCompare(null)} />
        </Suspense>
      </div>
    </div>}<aside className="matching-aside"><div className="card matching-summary"><span className="matching-summary-icon"><ListChecks size={25} /></span><span className="eyebrow">매칭 결과 한눈에 보기</span><h3>등록한 단서와<br />닮은 주운 물건</h3><div className="matching-stat"><strong>{current?.data ? matches.length : '-'}<span>개</span></strong><span>추천 후보</span></div><div className="matching-stat"><strong>{current?.data && matches.length ? bestScore : '-'}<span>점</span></strong><span>가장 높은 매칭도 ({current?.data?.maxScore ?? 100}점 만점)</span></div><p><CircleHelp size={15} /> 분류 35 · 지역 25 · 색상 20 · 날짜 20점. 정보가 없는 조건은 점수를 받지 않아요.</p></div><div className="matching-next"><h3>내 물건을 발견했다면?</h3><ol><li><span>1</span>물품 상세 정보와 사진 확인</li><li><span>2</span>경찰청 물품은 담당 기관에 문의</li><li><span>3</span>LOST QUEST 물품은 등록자와 확인</li></ol><Link to="/search" className="text-link">전국 검색도 둘러보기 <ArrowRight size={15} /></Link></div></aside></div>
  </div>
}
