import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ClipboardCheck, Compass, ImagePlus, LockKeyhole, QrCode, Search, ShieldCheck, Sparkles } from 'lucide-react';
import './workflow.css';

const steps = [
  { icon: ImagePlus, title: '분실물을 등록해요', description: '검은색 지갑을 잃어버린 상황으로 시작해 보세요. 사진과 종류, 색상, 날짜, 지역을 입력합니다.', hint: '사진 분석은 준비된 예시 결과를 보여 주는 시뮬레이션이에요.' },
  { icon: Sparkles, title: 'AI 매칭 후보를 살펴봐요', description: '검은색 지갑 후보의 일치 점수와 추천 근거를 확인하고, 내 물건과 비슷한 후보의 상세 화면으로 이동하세요.', hint: '점수는 로컬 규칙으로 계산한 데모 값이며 실제 AI의 판단이 아닙니다.' },
  { icon: LockKeyhole, title: '반환 요청과 소유자 확인', description: '자체 등록 습득물에 반환을 요청한 뒤, 비공개 특징을 입력해요. 예시 지갑의 테스트 답변은 ‘파란색’입니다.', hint: '개인 연락처나 신분증은 입력하지 않아도 됩니다.' },
  { icon: ClipboardCheck, title: '관리자 역할로 요청을 승인해요', description: '관리자 화면에서 비공개 특징 확인이 끝난 요청을 승인하세요. 반환 화면에 테스트 QR이 나타납니다.', hint: '체험 계정은 요청자와 관리자 역할을 모두 이용할 수 있어요.' },
  { icon: QrCode, title: '테스트 QR 인증을 진행해요', description: '반환 진행 화면으로 돌아와 ‘테스트 QR 인증하기’를 눌러 물품 전달 상황을 체험해 보세요.', hint: '실제 촬영이나 본인 인증 기능이 아닌 상태 변경 시뮬레이션입니다.' },
  { icon: CheckCircle2, title: '반환을 마무리하고 경험치를 받아요', description: '관리자가 반환 완료를 확인하면 50 XP가 지급됩니다. 마이페이지에서 레벨과 업적의 변화를 확인하세요.', hint: '같은 반환 요청에는 보상이 한 번만 지급됩니다.' },
];

export default function GuidePage() {
  return <div className="page-container workflow-page guide-page"><div className="page-heading"><div className="eyebrow">이용 안내</div><h1>다시 만나는 순간까지, 함께</h1><p>처음이라도 괜찮아요. LOST QUEST의 탐색과 반환 과정을 따라가 보세요.</p></div><div className="guide-intro"><div className="workflow-icon"><Compass size={29} /></div><div><span className="eyebrow">프론트엔드 프로토타입</span><h2>검은색 지갑으로 첫 번째 퀘스트를 시작하세요</h2><p>백엔드 연결 없이 가상 데이터로 서비스의 전체 흐름을 직접 체험할 수 있어요.</p></div><Link className="button button-primary" to="/register?type=lost">분실물 등록하기 <ArrowRight size={16} /></Link></div><div className="guide-steps">{steps.map(({ icon: Icon, title, description, hint }, index) => <article className="card guide-step" key={title}><div className="guide-step-top"><span className="guide-step-icon"><Icon size={24} /></span><span>0{index + 1} 단계</span></div><h2>{title}</h2><p>{description}</p><div className="guide-step-hint">{hint}</div></article>)}</div><div className="guide-bottom-grid"><section className="card"><ShieldCheck size={25} /><h2>체험 데이터는 이 브라우저에</h2><p>등록 물품과 사진, 반환 상태, 경험치는 이 브라우저에 저장되어 새로고침하거나 다시 방문해도 유지됩니다. 테스트 로그인은 가상 계정으로 진행하며 실제 개인정보와 인증 정보를 저장하지 않습니다.</p><p>마이페이지에서 언제든 체험 데이터를 초기화할 수 있어요.</p></section><section className="card"><Search size={25} /><h2>전국의 정보를 한곳에서</h2><p>자체 등록 물품은 반환 요청 흐름을 체험할 수 있습니다. 공공데이터로 표시된 물품도 현재는 예시 데이터이며, 해당 물품은 공식 보관기관을 통해 확인하도록 안내합니다.</p><p>실제 공공데이터, 이미지 AI, 본인 인증과 QR 검증은 추후 서버 연동이 필요합니다.</p></section></div><div className="guide-cta"><div><h2>작은 친절이, 다시 누군가의 일상이 됩니다.</h2><p>잃어버린 소중한 것, 함께 찾아요.</p></div><Link className="button button-primary" to="/search">전국 분실물 찾아보기 <ArrowRight size={17} /></Link></div></div>;
}

