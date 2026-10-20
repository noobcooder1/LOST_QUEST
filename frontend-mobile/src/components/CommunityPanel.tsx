import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { describeActivityError } from '../services/activityApi';
import { reportCommunityPost } from '../services/communityApi';
import CommunityQuestions from './CommunityQuestions';
import type { Item } from '../types';

export default function CommunityPanel({ item }: { item: Item }) {
  const { isLoggedIn, authUser } = useApp();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const report = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setFeedback('');
    try { await reportCommunityPost(item.id, reason); setFeedback('신고를 접수했어요. 관리자가 검토합니다.'); setReporting(false); setReason(''); }
    catch (cause) { setFeedback(describeActivityError(cause)); } finally { setBusy(false); }
  };
  if (!isLoggedIn) return <section className="card community-section"><h2>작성자에게 비공개로 질문하기</h2><p>질문·답변은 로그인한 두 참여자에게만 공개돼요.</p><Link className="button button-primary" to={`/login?returnTo=${encodeURIComponent(`/items/${item.id}`)}`}>로그인 후 질문하기</Link></section>;
  return <><CommunityQuestions key={`${item.id}:${authUser?.id}`} item={item} />
    <section className="community-section card"><h3>물품글 신고</h3><p className="muted">허위 정보나 개인정보 노출이 있다면 알려 주세요. 신고 내용은 관리자만 확인합니다.</p>
      {feedback && <p role="status">{feedback}</p>}
      {!reporting ? <button className="text-link" onClick={() => setReporting(true)}>이 물품글 신고하기</button> : <form onSubmit={event => { void report(event); }}><label className="form-field"><span>신고 사유</span><textarea required maxLength={1000} rows={3} value={reason} onChange={event => setReason(event.target.value)} /></label><div className="button-row"><button className="button button-secondary" type="button" disabled={busy} onClick={() => setReporting(false)}>취소</button><button className="button button-primary" disabled={busy}>신고 접수</button></div></form>}
    </section></>;
}
