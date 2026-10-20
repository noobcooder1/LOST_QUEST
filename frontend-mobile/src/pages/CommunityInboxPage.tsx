import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import CommunityQuestions from '../components/CommunityQuestions';

export default function CommunityInboxPage() {
  const { isLoggedIn, authUser } = useApp();
  return <div className="page-container"><div className="page-heading"><span className="eyebrow">LOST QUEST 커뮤니티</span><h1>내 비공개 질문함</h1><p>받은 질문에 답변하고, 보낸 질문의 답변을 확인해요.</p><div className="button-row"><Link className="text-link" to="/community">커뮤니티 목록</Link><Link className="text-link" to="/mypage">마이페이지</Link></div></div>
    {isLoggedIn ? <CommunityQuestions key={authUser?.id} /> : <section className="card community-section"><p>로그인하면 본인이 주고받은 질문만 확인할 수 있어요.</p><Link className="button button-primary" to="/login?returnTo=%2Fcommunity-inbox">로그인하기</Link></section>}
  </div>;
}
