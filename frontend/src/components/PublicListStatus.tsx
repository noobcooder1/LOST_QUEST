import { CloudOff, Database, RefreshCw, CheckCircle2 } from 'lucide-react';
import type { SourceState } from '../services/searchSources';
import { formatRegistrationTime } from '../services/dateTime';

export default function PublicListStatus({ label, state, retry, retryPage }: { label: string; state: SourceState; retry: () => void; retryPage?: (page: number) => void }) {
  const loading = state.status === 'idle' || state.status === 'loading';
  const cached = state.dataStatus === 'cached';
  const unavailable = state.dataStatus === 'unavailable';
  const error = state.status === 'error';
  const title = state.status === 'unsupported' ? '지원하지 않는 조건' : cached ? '저장된 데이터' : unavailable ? '서버 연결 불가' : error ? '조회 요청 오류' : loading ? '연결 확인 중' : '최신 데이터';
  const synced = state.lastSyncedAt ? formatRegistrationTime(new Date(state.lastSyncedAt).toISOString()) : null;
  return <li className={`public-list-status ${cached ? 'is-cached' : error ? 'is-error' : ''}`}>
    <div className="public-list-status-heading"><strong>{label}</strong><span className="public-list-status-label">{cached ? <Database size={15} /> : error ? <CloudOff size={15} /> : loading ? <span className="loading-dot" /> : <CheckCircle2 size={15} />}{title}</span></div>
    {loading ? <p role="status">공개 목록을 불러오고 있어요.</p> : state.status === 'unsupported' ? <p>{state.error}</p> : <>
      {cached ? <p role="status">이 목록의 서버에 연결할 수 없어 저장된 목록을 읽기 전용으로 보여드려요. 최신 정보가 아닐 수 있습니다. 상세 조회·등록·수정·삭제·반환 요청은 재연결 후 이용해 주세요.</p>
        : unavailable ? <p role="alert">이 조회 조건에 사용할 수 있는 저장 목록이 없어요. 서버 연결 후 다시 시도해 주세요.</p>
        : error ? <p role="alert">{state.error} 인증·권한·입력 오류는 저장된 목록으로 대체하지 않습니다.</p>
        : <p>{state.items.length.toLocaleString()}건{state.totalPages > 1 ? ` / 전체 ${state.totalCount.toLocaleString()}건` : ''}{state.cacheSaved === false ? ' · 이 브라우저에서는 목록을 저장하지 못했어요. 온라인 조회는 정상입니다.' : ''}</p>}
      {synced && <small>마지막 동기화 <time dateTime={new Date(state.lastSyncedAt!).toISOString()}>{synced}</time> (한국 시간)</small>}
      {(cached || error) && <button type="button" className="text-link" onClick={retry}><RefreshCw size={14} />{cached || unavailable ? '다시 연결' : '다시 시도'}</button>}
      {state.pageLoading && <p role="status">추가 페이지를 불러오고 있어요.</p>}
      {state.pageError && <>
        <p role="alert" className="field-error">{state.pageError.page}페이지를 불러오지 못했어요. 이미 조회한 목록은 유지됩니다. {state.pageError.message}</p>
        <button type="button" className="text-link" disabled={state.pageLoading} onClick={() => retryPage?.(state.pageError!.page)}><RefreshCw size={14} />{state.pageError.page}페이지 다시 시도</button>
      </>}
    </>}
  </li>;
}
