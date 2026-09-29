import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, ClipboardCheck, LockKeyhole, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { ReturnRequest } from '../types';
import './workflow.css';

const statusNames: Record<ReturnRequest['status'], string> = { pending: '소유자 확인 대기', owner_verified: '요청 승인 대기', approved: 'QR 인증 대기', qr_verified: '반환 완료 확인 대기', completed: '반환 완료', rejected: '반려' };

export default function AdminPage() {
  const { items, requests, isLoggedIn, approveRequest, completeReturn, rejectRequest } = useApp();
  const [filter, setFilter] = useState<'active' | 'all' | 'completed'>('active');
  const [feedback, setFeedback] = useState('');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const rejectDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (rejectId) rejectDialog.current?.showModal(); }, [rejectId]);
  const reviewCount = requests.filter((request) => request.status === 'owner_verified').length;
  const confirmCount = requests.filter((request) => request.status === 'qr_verified').length;
  const completeCount = requests.filter((request) => request.status === 'completed').length;
  const visibleRequests = requests.filter((request) => filter === 'all' || (filter === 'completed' ? request.status === 'completed' : !['completed', 'rejected'].includes(request.status)));

  if (!isLoggedIn) return <div className="page-container workflow-auth"><LockKeyhole size={32} /><h1>테스트 계정으로 관리자 역할을 체험해요</h1><p className="muted">실제 관리자 권한이 없는 프론트엔드 시뮬레이션 화면입니다.</p><Link className="button button-primary" to="/login?returnTo=%2Fadmin">테스트 계정으로 로그인 <ArrowRight size={16} /></Link></div>;

  return <div className="page-container workflow-page">
    <div className="page-heading"><div className="eyebrow">관리자 체험</div><h1>반환 관리</h1><p>반환 요청을 확인하고, 물건이 돌아가는 마지막 단계를 도와주세요.</p></div>
    <div className="workflow-demo-note"><ShieldCheck size={18} /><span><strong>관리자 역할 체험</strong> · 로그인한 테스트 계정 모두 이용할 수 있는 시뮬레이션입니다. 실제 권한 검증은 적용되지 않습니다.</span></div>
    <div className="admin-stats"><div className="card"><span className="admin-stat-icon"><ClipboardCheck size={22} /></span><div><p>승인이 필요한 요청</p><strong>{reviewCount}<small>건</small></strong></div></div><div className="card"><span className="admin-stat-icon orange"><Clock3 size={22} /></span><div><p>반환 완료 확인 대기</p><strong>{confirmCount}<small>건</small></strong></div></div><div className="card"><span className="admin-stat-icon green"><CheckCircle2 size={22} /></span><div><p>이번 체험 반환 완료</p><strong>{completeCount}<small>건</small></strong></div></div></div>
    <div className="workflow-section-heading"><div><h2>반환 요청 목록 <span>{requests.length}</span></h2><p className="muted">소유 확인이 끝난 요청부터 승인할 수 있어요.</p></div><div className="workflow-tabs compact" aria-label="반환 요청 필터">{([['active', '진행 중'], ['all', '전체'], ['completed', '완료']] as const).map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</button>)}</div></div>
    {feedback && <div className="workflow-feedback" role="status"><CheckCircle2 size={18} /><span>{feedback}</span><button onClick={() => setFeedback('')} aria-label="알림 닫기"><X size={16} /></button></div>}
    <div className="admin-requests">{visibleRequests.map((request) => {
      const item = items.find((entry) => entry.id === request.itemId);
      if (!item) return null;
      return <article className="card admin-request" key={request.id}><div className="admin-request-top"><div className="admin-item"><img src={item.image} alt={item.title} /><div><span className={`badge ${request.status === 'completed' ? 'badge-green' : 'badge-blue'}`}>{statusNames[request.status]}</span><h3>{item.title}</h3><p>{item.region} · {new Date(request.createdAt).toLocaleDateString('ko-KR')} 요청</p></div></div><Link className="text-link" to={`/returns/${request.id}`}>반환 진행 보기 <ArrowRight size={15} /></Link></div><div className="admin-checklist"><span className={!['pending', 'rejected'].includes(request.status) ? 'checked' : ''}><CheckCircle2 size={15} /> 비공개 특징 확인</span><span className={['approved', 'qr_verified', 'completed'].includes(request.status) ? 'checked' : ''}><CheckCircle2 size={15} /> 관리자 요청 승인</span><span className={['qr_verified', 'completed'].includes(request.status) ? 'checked' : ''}><CheckCircle2 size={15} /> 테스트 QR 인증</span></div><div className="admin-request-bottom"><p>{request.status === 'pending' && '요청자가 비공개 특징을 확인하면 승인할 수 있어요.'}{request.status === 'owner_verified' && '비공개 특징이 일치합니다. 요청 승인 시 테스트 QR이 발급됩니다.'}{request.status === 'approved' && '요청자가 반환 화면에서 테스트 QR 인증을 진행해야 합니다.'}{request.status === 'qr_verified' && '최종 확인 시 반환 완료 처리와 경험치 +50 XP가 한 번 적용됩니다.'}{request.status === 'completed' && '반환이 완료되었으며 경험치 보상도 지급되었습니다.'}{request.status === 'rejected' && '관리자 검토에서 반려된 요청입니다.'}</p><div className="admin-actions">{['pending', 'owner_verified', 'approved'].includes(request.status) && <button className="button button-ghost admin-reject-button" onClick={() => setRejectId(request.id)}>요청 반려</button>}{request.status === 'owner_verified' && <button className="button button-primary" onClick={() => { approveRequest(request.id); setFeedback(`${item.title} 반환 요청을 승인했어요. 반환 화면에서 테스트 QR 인증을 진행해 주세요.`); }}><ShieldCheck size={16} /> 요청 승인</button>}{request.status === 'qr_verified' && <button className="button button-primary" onClick={() => { completeReturn(request.id); setFeedback(`${item.title} 반환이 완료되었어요. 경험치 50 XP가 지급되었습니다.`); }}><Sparkles size={16} /> 반환 완료 · +50 XP</button>}{['pending', 'approved'].includes(request.status) && <Link className="button button-secondary" to={`/returns/${request.id}`}>요청자 화면으로 <ArrowRight size={15} /></Link>}{request.status === 'completed' && <Link className="button button-secondary" to="/mypage">경험치 확인하기 <ArrowRight size={15} /></Link>}</div></div></article>;
    })}</div>
    {visibleRequests.length === 0 && <div className="card empty-state"><ClipboardCheck size={38} /><h3>{filter === 'completed' ? '아직 완료된 반환이 없어요' : '검토할 반환 요청이 없어요'}</h3><p>습득물 상세 페이지에서 반환을 요청하고 전체 흐름을 체험해 보세요.</p><Link className="button button-primary" to="/search">물품 찾아보기 <ArrowRight size={16} /></Link></div>}
    {rejectId && <dialog ref={rejectDialog} className="card workflow-modal" onCancel={() => setRejectId(null)} aria-labelledby="reject-title"><h2 id="reject-title">이 반환 요청을 반려할까요?</h2><p className="muted">반려된 요청의 진행은 종료됩니다. 테스트 물품 정보와 현재 확인 단계를 먼저 살펴보세요.</p><div className="workflow-modal-actions"><button autoFocus className="button button-secondary" onClick={() => setRejectId(null)}>취소</button><button className="button button-primary" onClick={() => { rejectRequest(rejectId); setRejectId(null); setFeedback('반환 요청을 반려했어요. 요청자는 반환 화면에서 상태를 확인할 수 있습니다.'); }}>요청 반려하기</button></div></dialog>}
  </div>;
}


