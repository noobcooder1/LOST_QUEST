import { CloudOff, Database, RefreshCw, CheckCircle2, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SourceState } from '../services/searchSources';
import { formatRegistrationTime } from '../services/dateTime';
import './PublicListStatus.css';

export default function PublicListStatus({ label, state, retry, retryPage, refresh }: { label: string; state: SourceState; retry: () => void; retryPage?: (page: number) => void; refresh?: () => void }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!state.cache) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.cache]);
  const seconds = state.cache ? Math.max(0, Math.ceil((Date.parse(state.cache.refreshAllowedAt) - now) / 1000)) : 0;
  const minutes = state.cache ? Math.max(0, Math.floor((now - Date.parse(state.cache.fetchedAt)) / 60_000)) : 0;
  const age = minutes < 1 ? '방금 조회' : minutes < 60 ? `${minutes}분 전` : `${Math.floor(minutes / 60)}시간 전`;
  const loading = state.status === 'idle' || state.status === 'loading';
  const cached = state.dataStatus === 'cached';
  const unavailable = state.dataStatus === 'unavailable';
  const error = state.status === 'error';
  const title = state.status === 'unsupported' ? '지원하지 않는 조건' : cached ? '저장된 데이터' : unavailable ? '서버 연결 불가' : error ? '조회 요청 오류' : loading ? '연결 확인 중' : state.cache?.stale ? '이전 조회 결과' : state.cache?.hit ? '서버 캐시' : '최신 데이터';
  const synced = state.lastSyncedAt ? formatRegistrationTime(new Date(state.lastSyncedAt).toISOString()) : null;
  const needsAttention = cached || unavailable || error || state.status === 'unsupported' || state.cache?.stale || !!state.refreshError;
  return <li className={`public-list-status ${cached ? 'is-cached' : error ? 'is-error' : ''}`}>
    <div className="public-list-status-heading"><strong>{label}</strong>
      {!loading && !error && state.status !== 'unsupported' && <span className="public-list-status-count">{state.items.length.toLocaleString()}건{state.totalPages > 1 ? ` / 전체 ${state.totalCount.toLocaleString()}건` : ''}</span>}
      <span className="public-list-status-label" role="status">{cached ? <Database size={15} aria-hidden="true" /> : error ? <CloudOff size={15} aria-hidden="true" /> : loading ? <span className="loading-dot" /> : <CheckCircle2 size={15} aria-hidden="true" />}{title}</span>
      {state.cache && !cached && <span className="public-list-status-age">{age}</span>}
      {refresh && state.cache && <button type="button" className="public-list-status-refresh" disabled={loading || state.refreshing || state.pageLoading || seconds > 0} onClick={refresh} aria-label={`${label} ${seconds ? `${seconds}초 후 새로고침 가능` : '새로고침'}`} title={seconds ? `${seconds}초 후 새로고침할 수 있어요. 반복 호출은 서버에서도 제한합니다.` : '현재 조건의 첫 페이지를 새로 조회합니다.'}><RefreshCw size={13} aria-hidden="true" />{state.refreshing ? '갱신 중' : '새로고침'}</button>}
      {synced && !needsAttention && !loading && <details className="public-list-status-details"><summary aria-label={`${label} 데이터 상세`}><Info size={16} aria-hidden="true" /></summary><div className="public-list-status-popover"><strong>{label}</strong><small>마지막 동기화 <time dateTime={new Date(state.lastSyncedAt!).toISOString()}>{synced}</time> (한국 시간)</small></div></details>}
    </div>
    {loading ? <span className="public-list-status-sr-only">공개 목록을 불러오고 있어요.</span> : state.status === 'unsupported' ? <p>{state.error}</p> : <>
      {cached ? <p role="status">이 목록의 서버에 연결할 수 없어 저장된 목록을 읽기 전용으로 보여드려요. 최신 정보가 아닐 수 있습니다. 상세 조회·등록·수정·삭제·반환 요청은 재연결 후 이용해 주세요.</p>
        : unavailable ? <p role="alert">이 조회 조건에 사용할 수 있는 저장 목록이 없어요. 서버 연결 후 다시 시도해 주세요.</p>
        : error ? <p role="alert">{state.error} 인증·권한·입력 오류는 저장된 목록으로 대체하지 않습니다.</p>
        : state.cacheSaved === false ? <p>이 브라우저에서는 목록을 저장하지 못했어요. 온라인 조회는 정상입니다.</p> : null}
      {synced && needsAttention && <small>마지막 동기화 <time dateTime={new Date(state.lastSyncedAt!).toISOString()}>{synced}</time> (한국 시간)</small>}
      {(cached || error) && <button type="button" className="text-link" onClick={retry}><RefreshCw size={14} />{cached || unavailable ? '다시 연결' : '다시 시도'}</button>}
      {(state.refreshError || state.cache?.refreshError) && <p role="alert">{state.refreshError || state.cache?.refreshError}</p>}
      {state.pageLoading && <p role="status">추가 페이지를 불러오고 있어요.</p>}
      {state.pageError && <>
        <p role="alert" className="field-error">{state.pageError.page}페이지를 불러오지 못했어요. 이미 조회한 목록은 유지됩니다. {state.pageError.message}</p>
        <button type="button" className="text-link" disabled={state.pageLoading} onClick={() => retryPage?.(state.pageError!.page)}><RefreshCw size={14} />{state.pageError.page}페이지 다시 시도</button>
      </>}
    </>}
  </li>;
}
