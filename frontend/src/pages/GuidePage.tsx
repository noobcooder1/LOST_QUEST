import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardCheck, Compass, LockKeyhole, QrCode, Search, ShieldCheck, Sparkles } from 'lucide-react';
import './workflow.css';
const steps = [
  { icon: Compass, title: '회원가입하고 물품을 등록해요', description: '올바른 이메일 주소로 가입하고, 분실물이나 습득물의 특징과 사진을 등록하세요.' },
  { icon: Search, title: '물품을 검색하고 매칭 후보를 살펴봐요', description: '회원이 등록한 물품과 경찰청 공공데이터를 검색하고, 내 분실물의 추천 후보를 확인하세요.' },
  { icon: LockKeyhole, title: '반환 요청과 소유자 확인', description: '다른 회원의 습득물에 반환을 요청하고 소유자만 아는 특징을 답하세요. 정답은 공개되지 않습니다.' },
  { icon: ClipboardCheck, title: '습득자 또는 관리자가 승인해요', description: '소유자 확인이 끝난 요청을 반환 관리 화면에서 승인하면 반환 QR이 발급됩니다.' },
  { icon: QrCode, title: '물품 전달 때 QR을 확인해요', description: '요청자가 제시한 QR의 인증 코드를 습득자가 입력해 확인합니다. QR은 30분간 유효하며 만료되면 재발급할 수 있어요.' },
  { icon: Sparkles, title: '반환 완료와 경험치', description: '습득자 또는 관리자가 최종 반환을 확인하면 물품 상태와 연결된 분실물이 반환 완료로 바뀝니다. 등록은 +10 XP, 반환은 습득자에게 +50 XP가 지급돼요.' },
];
export default function GuidePage() {
  return <div className="page-container workflow-page guide-page"><div className="page-heading"><div className="eyebrow">이용 안내</div><h1>다시 만나는 순간까지, 함께</h1><p>등록부터 반환까지 차근차근 따라가 보세요.</p></div><div className="guide-steps">{steps.map(({icon:Icon,title,description},index)=><article className="card guide-step" key={title}><div className="guide-step-top"><span className="guide-step-icon"><Icon size={24}/></span><span>0{index+1} 단계</span></div><h2>{title}</h2><p>{description}</p></article>)}</div><div className="guide-bottom-grid"><section className="card"><ShieldCheck size={25}/><h2>기록은 내 계정에</h2><p>회원 정보, 등록 물품, 반환·QR 상태, 경험치와 알림은 서버에 저장됩니다. 다른 브라우저에서도 로그인하면 확인할 수 있어요.</p><p>소유 확인 답변은 해시로 보관됩니다. 업적과 레벨은 저장된 활동 기록에 따라 계산해요.</p></section><section className="card"><Search size={25}/><h2>전국의 정보를 한곳에서</h2><p>경찰청 물품의 수령·반환은 담당 기관과 경찰청 LOST112를 통해 진행해 주세요. LOST QUEST의 반환 기능은 회원이 등록한 습득물에 적용됩니다.</p><p>사진 특징 분석 화면은 현재 시뮬레이션이며, 이메일의 실제 사용 여부를 확인하는 인증 메일 기능은 아직 없습니다.</p></section></div><Link className="button button-primary" to="/search">물품 찾아보기 <ArrowRight size={17}/></Link></div>;
}
