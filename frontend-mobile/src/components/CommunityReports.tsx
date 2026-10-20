import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { describeActivityError } from '../services/activityApi';
import { hideReportedPost, listCommunityReports, type CommunityPage, type CommunityReport } from '../services/communityApi';
import './community.css';

export default function CommunityReports() {
  const [result, setResult] = useState<CommunityPage<CommunityReport>>({ items: [], page: 0, hasNext: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<number | null>(null);
  const version = useRef(0);
  const load = useCallback(async (page = 0) => {
    const request = ++version.current; setLoading(true); setError('');
    try { const next = await listCommunityReports(page); if (request === version.current) setResult(next); }
    catch (cause) { if (request === version.current) setError(describeActivityError(cause)); }
    finally { if (request === version.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); return () => { version.current += 1; }; }, [load]);
  const hide = async (id: number) => {
    if (busy) return; setBusy(true); setError('');
    try { await hideReportedPost(id); setConfirm(null); await load(result.page); }
    catch (cause) { setError(describeActivityError(cause)); } finally { setBusy(false); }
  };
  return <section className="card community-section" aria-label="관리자 게시글 신고 검토"><h2>게시글 신고 검토</h2><p className="muted">관리자만 신고 사유를 확인하고 공개 목록에서 게시글을 숨길 수 있어요. 반환 기록은 삭제하지 않습니다.</p>
    {error && <p className="field-error" role="alert">{error}</p>}
    {loading ? <p role="status">신고를 불러오고 있어요…</p> : <>
      {!result.items.length && !error && <p>접수된 신고가 없어요.</p>}
      {result.items.map(report => <article key={report.id} className="community-report"><div className="community-heading"><strong>{report.itemTitle}</strong><span className="badge badge-neutral">{report.hiddenAt ? '숨김 처리됨' : '검토 대기'}</span></div><p>{report.reason}</p><small>{new Date(report.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</small>
        {!report.hiddenAt && <div className="button-row"><Link className="text-link" to={`/items/api-${report.itemType}-${report.itemId}`}>게시글 확인</Link><button className="button button-secondary" disabled={busy} onClick={() => setConfirm(report.id)}>공개 목록에서 숨기기</button></div>}
        {confirm === report.id && <div role="alert"><p>이 게시글을 숨길까요? 공개 상세·검색·새 질문·새 반환 요청이 차단됩니다.</p><div className="button-row"><button className="button button-secondary" disabled={busy} onClick={() => setConfirm(null)}>취소</button><button className="button button-primary" disabled={busy} onClick={() => { void hide(report.id); }}>숨김 확인</button></div></div>}
      </article>)}
    </>}
    <div className="button-row"><button className="button button-secondary" disabled={loading || busy || result.page === 0} onClick={() => { void load(result.page - 1); }}>이전 신고</button><span>{result.page + 1}페이지</span><button className="button button-secondary" disabled={loading || busy || !result.hasNext} onClick={() => { void load(result.page + 1); }}>다음 신고</button><button className="text-link" disabled={loading || busy} onClick={() => { void load(result.page); }}>다시 조회</button></div>
  </section>;
}
