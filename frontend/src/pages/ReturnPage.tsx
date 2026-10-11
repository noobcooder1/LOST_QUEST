import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleHelp, LockKeyhole, QrCode, ShieldCheck, Sparkles } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useApp } from '../context/AppContext';
import { describeActivityError } from '../services/activityApi';
import './workflow.css';

const stages = ['반환 요청', '소유자 확인', '요청 승인', 'QR 인증', '반환 완료'];
const indexes = { pending: 1, owner_verified: 2, approved: 3, qr_verified: 4, completed: 5, rejected: -1 };

export default function ReturnPage() {
  const { id } = useParams();
  const { requests, items, isLoggedIn, authUser, activityLoading, verifyOwner, verifyQr, renewQr, refreshData } = useApp();
  const [answer, setAnswer] = useState('');
  const [token, setToken] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void refreshData(); }, [id, refreshData]);
  const request = requests.find(entry => entry.id === id);
  const item = items.find(entry => entry.id === request?.itemId);
  if (!isLoggedIn) return <div className="page-container workflow-auth"><LockKeyhole size={32}/><h1>반환 진행 상황을 확인해 보세요</h1><Link className="button button-primary" to={`/login?returnTo=${encodeURIComponent('/returns/' + (id ?? ''))}`}>로그인 <ArrowRight size={16}/></Link></div>;
  if (activityLoading && !request) return <div className="page-container" role="status">반환 기록을 불러오고 있어요…</div>;
  if (!request || !item) return <div className="page-container empty-state"><CircleHelp size={36}/><h1>반환 요청을 찾을 수 없어요</h1><p>요청자·습득자·관리자만 기록을 볼 수 있어요.</p><button className="button button-secondary" onClick={() => { void refreshData(); }}>다시 불러오기</button></div>;
  const mine = request.requesterId === authUser?.id;
  const manager = request.finderId === authUser?.id || authUser?.role === 'ADMIN';
  const run = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(true); setFeedback('');
    try { await action(); setFeedback(message); setAnswer(''); setToken(''); }
    catch (error) { setFeedback(describeActivityError(error)); }
    finally { setBusy(false); }
  };
  const stage = indexes[request.status];
  const qr = request.qrToken ? `LOSTQUEST:RETURN:${request.id}:${request.qrToken}` : '';
  return <div className="page-container workflow-page">
    <Link className="workflow-back" to={`/items/${item.id}`}><ArrowLeft size={16}/> 물품 상세로 돌아가기</Link>
    <div className="page-heading"><div className="eyebrow">반환 퀘스트</div><h1>물건이 돌아가는 여정</h1><p>확인 단계에 따라 안전하게 물품을 돌려주세요.</p></div>
    <ol className="return-stepper" aria-label="반환 진행 단계">{stages.map((label,index) => <li key={label} className={`${index < stage ? 'is-done' : ''} ${index === stage ? 'is-current' : ''}`}><span className="return-step-number">{index < stage ? <Check size={17}/> : index + 1}</span><span>{label}</span></li>)}</ol>
    <div className="return-layout"><section className="card return-main">
      {feedback && <p className="field-error" role="status">{feedback}</p>}
      {request.status === 'pending' && <><LockKeyhole size={28}/><h2>소유자만 아는 특징을 확인해요</h2>{mine ? <form className="owner-form" onSubmit={event => {event.preventDefault(); void run(() => verifyOwner(request.id, answer), '소유자 확인을 마쳤어요. 습득자의 승인을 기다려 주세요.');}}><label className="form-field"><span>{item.ownershipQuestion || '물품의 비공개 특징은 무엇인가요?'}</span><input required value={answer} onChange={event => setAnswer(event.target.value)} maxLength={100} autoComplete="off"/></label><button className="button button-primary" disabled={busy}>소유자 확인하기</button></form> : <p>요청자가 비공개 특징을 확인하고 있어요.</p>}</>}
      {request.status === 'owner_verified' && <><ShieldCheck size={28}/><h2>소유자 확인이 완료되었어요</h2><p>습득자 또는 관리자의 승인 후 QR이 발급됩니다.</p>{manager && <Link className="button button-primary" to="/admin">반환 요청 승인하기 <ArrowRight size={17}/></Link>}</>}
      {request.status === 'approved' && <><QrCode size={28}/><h2>물품 전달을 위한 QR 인증</h2>{mine && qr && <><p>만남에서 습득자에게 이 QR 또는 인증 코드를 제시해 주세요.</p><div className="return-qr"><QRCodeSVG value={qr} size={172} level="M" title="물품 반환 인증 QR"/></div><label className="form-field"><span>반환 인증 코드</span><input readOnly value={qr} onFocus={event => event.target.select()}/></label><p>유효기간: {request.qrExpiresAt ? new Date(request.qrExpiresAt).toLocaleString('ko-KR') : ''}</p><button className="button button-secondary" onClick={() => {void refreshData();}}>승인·인증 상태 새로고침</button></>}{manager && <><form className="owner-form" onSubmit={event => {event.preventDefault(); void run(() => verifyQr(request.id, token), 'QR을 확인했어요. 최종 반환을 확인해 주세요.');}}><label className="form-field"><span>요청자가 제시한 QR의 인증 코드</span><input required value={token} onChange={event => setToken(event.target.value)} maxLength={200} autoComplete="off" placeholder="QR 내용을 읽어 입력하거나 코드를 붙여 넣으세요"/></label><button className="button button-primary" disabled={busy}>QR 인증 확인</button></form><button className="button button-secondary" disabled={busy} onClick={() => {void run(() => renewQr(request.id), '새 QR이 발급됐어요. 요청자가 화면을 새로고침하면 확인할 수 있어요.');}}>만료된 QR 재발급</button></>}</>}
      {request.status === 'qr_verified' && <><CheckCircle2 size={29}/><h2>QR 인증이 완료되었어요</h2><p>습득자 또는 관리자가 물품 전달을 최종 확인해 주세요.</p>{manager && <Link className="button button-primary" to="/admin">반환 완료 확인하기 <ArrowRight size={17}/></Link>}</>}
      {request.status === 'completed' && <><CheckCircle2 size={31}/><h2>소중한 물건이 주인에게 돌아갔어요!</h2><p>반환 기록이 저장되고, 물품을 돌려준 습득자에게 경험치가 지급됐어요.</p><div className="return-reward"><Sparkles size={26}/><strong>+50 <span>XP</span></strong><p>습득자에게 요청당 1회 지급</p></div><Link className="button button-primary" to="/mypage">내 기록 확인하기</Link></>}
      {request.status === 'rejected' && <><CircleHelp size={29}/><h2>반환 요청이 반려되었어요</h2><p>물품 정보를 다시 확인해 주세요.</p><Link to="/search" className="button button-primary">다른 물품 찾아보기</Link></>}
    </section><aside className="return-aside"><section className="card return-item-summary"><h3>반환 요청 물품</h3><img src={item.image} alt={item.title}/><h2>{item.title}</h2><p>{item.region} · {item.location}</p><p>요청 날짜: {new Date(request.createdAt).toLocaleDateString('ko-KR')}</p></section></aside></div>
  </div>;
}
