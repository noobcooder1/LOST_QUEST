import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ClipboardCheck, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { describeActivityError } from '../services/activityApi';
import type { ReturnStatus } from '../types';
import './workflow.css';
const labels: Record<ReturnStatus, string> = { pending: '소유자 확인 대기', owner_verified: '요청 승인 대기', approved: 'QR 인증 대기', qr_verified: '반환 완료 확인 대기', completed: '반환 완료', rejected: '반려' };
export default function AdminPage() {
  const { items, requests, isLoggedIn, authUser, activityLoading, approveRequest, completeReturn, rejectRequest, refreshData } = useApp();
  const [filter, setFilter] = useState<'active'|'all'|'completed'>('active');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejectId, setRejectId] = useState<string|null>(null);
  useEffect(() => {void refreshData();}, [refreshData]);
  if (!isLoggedIn) return <div className="page-container workflow-auth"><LockKeyhole size={32}/><h1>등록한 습득물의 반환을 관리해요</h1><Link className="button button-primary" to="/login?returnTo=%2Fadmin">로그인 <ArrowRight size={16}/></Link></div>;
  const managed = requests.filter(request => request.finderId === authUser?.id || authUser?.role === 'ADMIN');
  const visible = managed.filter(request => filter === 'all' || (filter === 'completed' ? request.status === 'completed' : !['completed','rejected'].includes(request.status)));
  const run = async (action: () => Promise<void>, message: string) => {
    if (busy) return; setBusy(true); setFeedback('');
    try {await action(); setFeedback(message); setRejectId(null);} catch(error){setFeedback(describeActivityError(error));}
    finally {setBusy(false);}
  };
  return <div className="page-container workflow-page">
    <div className="page-heading"><div className="eyebrow">습득자·관리자</div><h1>반환 관리</h1><p>내가 등록한 습득물의 요청을 승인하고 반환을 확인해 주세요.</p></div>
    <div className="workflow-demo-note"><ShieldCheck size={18}/><span>습득자와 관리자만 요청 승인·QR 확인·반환 완료를 처리할 수 있어요.</span></div>
    <div className="workflow-section-heading"><h2>반환 요청 <span>{managed.length}</span></h2><div className="workflow-tabs compact">{([['active','진행 중'],['all','전체'],['completed','완료']] as const).map(([value,label])=><button key={value} onClick={()=>setFilter(value)} aria-pressed={filter===value} className={filter===value?'active':''}>{label}</button>)}<button onClick={()=>{void refreshData();}}>새로고침</button></div></div>
    {activityLoading && <p role="status">반환 기록을 불러오고 있어요…</p>}
    {feedback && <p className="workflow-feedback" role="status">{feedback}</p>}
    <div className="admin-requests">{visible.map(request=>{
      const item=items.find(entry=>entry.id===request.itemId); if(!item) return null;
      return <article className="card admin-request" key={request.id}><div className="admin-request-top"><div className="admin-item"><img src={item.image} alt={item.title}/><div><span className="badge badge-blue">{labels[request.status]}</span><h3>{item.title}</h3><p>{item.region} · {new Date(request.createdAt).toLocaleDateString('ko-KR')}</p></div></div><Link to={`/returns/${request.id}`} className="text-link">진행·QR 확인 <ArrowRight size={15}/></Link></div>
      <div className="admin-request-bottom"><div className="admin-actions">{request.status==='owner_verified'&&<button className="button button-primary" disabled={busy} onClick={()=>{void run(()=>approveRequest(request.id),'반환 요청을 승인하고 QR을 발급했어요.');}}><ShieldCheck size={16}/>요청 승인</button>}
      {request.status==='qr_verified'&&<button className="button button-primary" disabled={busy} onClick={()=>{void run(()=>completeReturn(request.id),'반환을 완료했어요. 습득자에게 50 XP가 지급됐어요.');}}><CheckCircle2 size={16}/>반환 완료 · +50 XP</button>}
      {!['completed','rejected'].includes(request.status)&&<button className="button button-ghost" disabled={busy} onClick={()=>setRejectId(request.id)}>요청 반려</button>}</div>
      {rejectId===request.id&&<div role="alert"><p>이 반환 요청을 반려할까요?</p><button className="button button-secondary" disabled={busy} onClick={()=>setRejectId(null)}>취소</button><button className="button button-primary" disabled={busy} onClick={()=>{void run(()=>rejectRequest(request.id),'반환 요청을 반려했어요.');}}>반려 확인</button></div>}</div></article>;
    })}</div>
    {!activityLoading&&visible.length===0&&<div className="card empty-state"><ClipboardCheck size={38}/><h3>검토할 반환 요청이 없어요</h3><p>본인이 등록한 습득물에 접수된 요청만 표시돼요.</p><Link className="button button-primary" to="/mypage">내 등록 물품 보기</Link></div>}
  </div>;
}
