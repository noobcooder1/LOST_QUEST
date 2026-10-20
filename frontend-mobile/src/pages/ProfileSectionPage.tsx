import { ArrowRight, CheckCircle2, LockKeyhole } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import ProfileSettings from '../components/ProfileSettings';
import { useApp } from '../context/AppContext';
import { getProfileBadges } from '../data/profileBadges';
import './workflow.css';

export default function ProfileSectionPage({ section }: { section: 'settings' | 'badges' }) {
  const { profile, isLoggedIn, authChecking, activityLoading } = useApp();
  const location = useLocation();
  const title = section === 'settings' ? '내 정보 수정' : '획득 업적';

  if (authChecking) return <div className="page-container workflow-page" role="status">계정 정보를 확인하고 있어요…</div>;
  if (!isLoggedIn) return <div className="page-container workflow-auth">
    <LockKeyhole size={32} /><h1>{title}</h1><p className="muted">로그인하고 내 정보와 업적을 확인해요.</p>
    <Link className="button button-primary" to={`/login?returnTo=${encodeURIComponent(location.pathname)}`}>로그인 <ArrowRight size={16} /></Link>
  </div>;

  const badges = getProfileBadges(profile);
  const earnedBadgeCount = badges.filter(badge => badge.unlocked).length;

  return <div className="page-container workflow-page">
    <h1 className="sr-only">{title}</h1>
    {activityLoading && <p role="status">계정 기록을 불러오고 있어요…</p>}
    {section === 'settings' ? <ProfileSettings /> : <section id="profile-badges" aria-labelledby="profile-badges-title">
      <div className="workflow-section-heading"><h2 id="profile-badges-title">친절의 발자국</h2><span className="muted">{earnedBadgeCount} / {badges.length}개 획득</span></div>
      <div className="profile-badge-grid">{badges.map(({ name, description, icon: Icon, unlocked, color }) => <article className={`card achievement ${unlocked ? '' : 'locked'}`} key={name}>
        <div className={`achievement-icon ${color}`}><Icon size={31} strokeWidth={1.6} /></div><h3>{name}</h3><p>{description}</p>
        <span className={unlocked ? 'achievement-earned' : 'muted'}>{unlocked ? <><CheckCircle2 size={13} /> 획득 완료</> : <><LockKeyhole size={13} /> 아직 도전 중</>}</span>
      </article>)}</div>
    </section>}
  </div>;
}
