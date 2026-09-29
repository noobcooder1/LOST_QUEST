import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, CircleHelp, LockKeyhole, QrCode, ShieldCheck, Sparkles } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useApp } from '../context/AppContext';
import './workflow.css';

const stages = ['반환 요청', '소유자 확인', '요청 승인', 'QR 인증', '반환 완료'];
const stageIndexes: Record<string, number> = { pending: 1, owner_verified: 2, approved: 3, qr_verified: 4, completed: 4, rejected: -1 };

export default function ReturnPage() {
  const { id } = useParams();
  const { requests, items, isLoggedIn, verifyOwner, verifyQr } = useApp();
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState('');
  const request = requests.find((entry) => entry.id === id);
  const item = items.find((entry) => entry.id === request?.itemId);

  if (!isLoggedIn) return <div className="page-container workflow-auth"><LockKeyhole size={32} /><h1>반환 진행 상황을 확인해 보세요</h1><p className="muted">테스트 계정으로 로그인하면 소유 확인부터 반환 완료까지 체험할 수 있어요.</p><Link className="button button-primary" to={`/login?returnTo=${encodeURIComponent(`/returns/${id ?? ''}`)}`}>테스트 계정으로 로그인 <ArrowRight size={16} /></Link></div>;
  if (!request || !item) return <div className="page-container"><div className="empty-state"><CircleHelp size={36} /><h1>반환 요청을 찾을 수 없어요</h1><p>물품 상세 화면에서 반환 요청을 먼저 만들어 주세요.</p><Link to="/search" className="button button-primary">물품 찾아보기</Link></div></div>;

  const currentStage = stageIndexes[request.status];
  const confirmOwner = (event: React.FormEvent) => {
    event.preventDefault();
    const correct = verifyOwner(request.id, answer);
    setFeedback(correct ? '비공개 특징이 일치해요. 관리자에게 승인 요청이 전달되었습니다.' : '비공개 특징이 일치하지 않아요. 아래 테스트 답변을 확인하고 다시 입력해 주세요.');
  };

  return <div className="page-container workflow-page">
    <Link className="workflow-back" to={`/items/${item.id}`}><ArrowLeft size={16} /> 물품 상세로 돌아가기</Link>
    <div className="page-heading"><div className="eyebrow">반환 퀘스트</div><h1>물건이 돌아가는 여정</h1><p>한 단계씩 확인하고, 소중한 일상을 다시 연결해요.</p></div>
    <div className="workflow-demo-note"><Sparkles size={17} /><span><strong>프로토타입 체험 중</strong> · 모든 확인과 QR 인증은 가상 데이터로 진행되는 테스트입니다.</span></div>
    <ol className="return-stepper" aria-label="반환 진행 단계">
      {stages.map((stage, index) => <li key={stage} className={`${index < currentStage ? 'is-done' : ''} ${index === currentStage ? 'is-current' : ''}`} aria-current={index === currentStage ? 'step' : undefined}><span className="return-step-number">{index < currentStage || request.status === 'completed' ? <Check size={17} /> : index + 1}</span><span>{stage}</span></li>)}
    </ol>
    <div className="return-layout">
      <section className="card return-main">
        {request.status === 'pending' && <>
          <div className="workflow-icon"><LockKeyhole size={26} /></div><span className="eyebrow">02 · 소유자 확인</span><h2>소유자만 아는 특징을 확인해요</h2><p className="muted">습득자가 등록한 비공개 특징과 답변을 비교합니다.<br />연락처나 신분증 없이 테스트 답변만 입력해 주세요.</p>
          <form className="owner-form" onSubmit={confirmOwner}><label className="form-field"><span>{item.category === '지갑' || item.title.includes('지갑') ? '지갑 안쪽에 있는 카드의 색상은 무엇인가요?' : '물품에 등록된 비공개 확인 특징은 무엇인가요?'}</span><input value={answer} onChange={(event) => { setAnswer(event.target.value); setFeedback(''); }} placeholder="비공개 특징을 입력해 주세요" required autoComplete="off" aria-describedby="demo-answer" /></label><div className="workflow-hint" id="demo-answer"><CircleHelp size={17} /><span>체험용 답변: <strong>{item.secretAnswer || '파란색'}</strong><br /><small>실제 서비스에서는 소유자에게 답변이 공개되지 않습니다.</small></span></div>{feedback && <p className="field-error" role="alert">{feedback}</p>}<button type="submit" className="button button-primary workflow-full-button"><ShieldCheck size={17} /> 소유자 확인하기</button></form>
        </>}
        {request.status === 'owner_verified' && <>
          <div className="workflow-icon workflow-icon-success"><ShieldCheck size={28} /></div><span className="eyebrow">03 · 요청 승인</span><h2>소유자 확인이 완료되었어요</h2><p className="muted">비공개 특징이 일치해요. 관리자 화면에서 요청을 승인하면 반환용 테스트 QR이 발급됩니다.</p><div className="workflow-state-message"><CheckCircle2 size={19} /><span>관리자 승인 대기 중</span></div><Link className="button button-primary" to="/admin">관리자 화면에서 승인하기 <ArrowRight size={17} /></Link><p className="workflow-small-note">체험에서는 같은 계정으로 관리자 역할도 수행할 수 있어요.</p>
        </>}
        {request.status === 'approved' && <>
          <div className="workflow-icon"><QrCode size={28} /></div><span className="eyebrow">04 · QR 인증</span><h2>반환용 테스트 QR</h2><p className="muted">만남을 통한 물품 전달 상황을 시뮬레이션해요.<br />아래 버튼으로 QR 인증 단계를 체험해 보세요.</p><div className="return-qr"><QRCodeSVG value={`LOSTQUEST:DEMO:RETURN:${request.id}`} size={172} level="M" title="실제 인증에 사용할 수 없는 반환 테스트 QR" /><span>테스트 · 실제 인증 효력 없음</span></div><button className="button button-primary" onClick={() => { verifyQr(request.id); setFeedback(''); }}><QrCode size={17} /> 테스트 QR 인증하기</button><p className="workflow-small-note">QR에는 테스트 요청 ID만 담겨 있으며 개인정보가 없습니다.<br />실제 카메라 촬영이나 신원 인증은 진행하지 않습니다.</p>
        </>}
        {request.status === 'qr_verified' && <>
          <div className="workflow-icon workflow-icon-success"><CheckCircle2 size={29} /></div><span className="eyebrow">05 · 최종 확인</span><h2>테스트 QR 인증이 완료되었어요</h2><p className="muted">마지막으로 관리자가 물품 반환을 확인하면<br />반환 완료 상태로 바뀌고 경험치가 지급됩니다.</p><div className="workflow-state-message"><CheckCircle2 size={19} /><span>관리자 반환 완료 확인 대기 중</span></div><Link className="button button-primary" to="/admin">관리자 화면에서 반환 완료하기 <ArrowRight size={17} /></Link>
        </>}
        {request.status === 'completed' && <>
          <div className="workflow-icon workflow-icon-success"><CheckCircle2 size={31} /></div><span className="eyebrow">퀘스트 완료</span><h2>소중한 물건이 주인에게 돌아갔어요!</h2><p className="muted">작은 친절이 누군가의 일상을 되찾아 주었어요.<br />이번 반환 활동에 대한 경험치가 반영되었습니다.</p><div className="return-reward"><Sparkles size={26} /><strong>+50 <span>XP</span></strong><p>반환 완료 보상 · 요청당 1회 지급</p></div><Link className="button button-primary" to="/mypage">내 경험치와 업적 확인하기 <ArrowRight size={17} /></Link>
        </>}
        {request.status === 'rejected' && <>
          <div className="workflow-icon"><CircleHelp size={29} /></div><h2>반환 요청이 승인되지 않았어요</h2><p className="muted">관리자 검토에서 요청이 반려되었습니다.<br />물품 정보를 다시 확인하거나 다른 후보를 찾아보세요.</p><Link className="button button-primary" to="/search">다른 물품 찾아보기 <ArrowRight size={17} /></Link>
        </>}
      </section>
      <aside className="return-aside"><section className="card return-item-summary"><h3>반환 요청 물품</h3><img src={item.image} alt={item.title} /><span className="badge badge-blue">자체 등록 · 습득물</span><h2>{item.title}</h2><dl><div><dt>습득 날짜</dt><dd>{item.date}</dd></div><div><dt>습득 지역</dt><dd>{item.region}</dd></div><div><dt>습득 장소</dt><dd>{item.location}</dd></div><div><dt>요청 날짜</dt><dd>{new Date(request.createdAt).toLocaleDateString('ko-KR')}</dd></div></dl><Link className="text-link" to={`/items/${item.id}`}>물품 정보 자세히 보기 <ChevronRight size={15} /></Link></section><div className="return-help"><ShieldCheck size={21} /><div><h3>안심하고 찾을 수 있도록</h3><p>비공개 특징 확인, 요청 승인, QR 인증, 최종 확인까지 순서대로 진행해요.</p></div></div></aside>
    </div>
  </div>;
}
