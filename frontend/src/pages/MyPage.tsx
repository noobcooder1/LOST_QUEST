import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Award, Bell, CheckCircle2, ChevronRight, Compass, HeartHandshake, LockKeyhole, Package, ShieldCheck, Sparkles, Trophy, UserRound } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useMatchNotifications } from '../context/MatchNotificationContext';
import MatchNotificationList from '../components/MatchNotificationList';
import MyItemList from '../components/MyItemList';
import type { ReturnRequest } from '../types';
import './workflow.css';

const requestLabels: Record<ReturnRequest['status'], string> = { pending: '소유자 확인 대기', owner_verified: '요청 승인 대기', approved: 'QR 인증 대기', qr_verified: '반환 완료 확인 대기', completed: '반환 완료', rejected: '반려' };

export default function MyPage() {
  const { items, requests, profile, notifications, isLoggedIn, logout, markNotificationsRead, refreshData, activityLoading } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = ['items', 'returns', 'badges', 'notifications'].includes(params.get('tab') ?? '') ? params.get('tab')! : 'items';
  const setTab = (value: string) => setParams(value === 'items' ? {} : { tab: value });
  const [error, setError] = useState('');
  const level = Math.floor(profile.xp / 100) + 1;
  const progress = profile.xp % 100;
  // Match and activity notifications are both persisted; their unread counts are shown separately.
  const { unreadCount } = useMatchNotifications();
  const unread = unreadCount ?? 0;
  const activityUnread = notifications.filter((notification) => !notification.read).length;
  const badges = [
    { name: '첫 발걸음', description: '첫 번째 물품 등록', icon: Compass, unlocked: profile.registeredCount >= 1, color: 'blue' },
    { name: '따뜻한 연결', description: '물품 1개 반환 완료', icon: HeartHandshake, unlocked: profile.returnedCount >= 1, color: 'green' },
    { name: '동네 탐정', description: '물품 3개 반환 완료', icon: ShieldCheck, unlocked: profile.returnedCount >= 3, color: 'purple' },
    { name: '친절 수집가', description: '누적 350 XP 달성', icon: Award, unlocked: profile.xp >= 350, color: 'orange' },
    { name: '든든한 이웃', description: '물품 5개 반환 완료', icon: Trophy, unlocked: profile.returnedCount >= 5, color: 'gold' },
    { name: '전국의 수호자', description: '누적 1,000 XP 달성', icon: Sparkles, unlocked: profile.xp >= 1000, color: 'navy' },
  ];

  if (!isLoggedIn) return <div className="page-container workflow-auth"><LockKeyhole size={32} /><h1>나의 작은 친절을 모아 보세요</h1><p className="muted">로그인하고 등록 내역과 경험치, 업적을 확인해요.</p><Link className="button button-primary" to={`/login?returnTo=${encodeURIComponent(`/mypage?tab=${tab}`)}`}>로그인 <ArrowRight size={16} /></Link></div>;

  return <div className="page-container workflow-page">
    <div className="page-heading"><div className="eyebrow">나의 퀘스트</div><h1>마이페이지</h1><p>함께 찾아 준 순간들이 모여, 나만의 여정이 됩니다.</p><button className="text-link" style={{ marginTop: 14 }} onClick={logout}>로그아웃</button></div>
    {activityLoading && <p role="status">계정 기록을 불러오고 있어요…</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <section className="card profile-card"><div className="profile-overview"><div className="profile-avatar"><UserRound size={43} strokeWidth={1.5} /><span>Lv.{level}</span></div><div className="profile-identity"><span className="eyebrow">일상을 되찾아 주는 탐험가</span><h2>{profile.name} <span className="badge badge-blue">회원</span></h2><p className="muted">작은 친절을 함께 나누고 있어요.</p><div className="profile-xp-label"><strong>레벨 {level}</strong><span><b>{progress}</b> / 100 XP</span></div><div className="profile-progress" role="progressbar" aria-label="다음 레벨까지 경험치" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div><p className="profile-next-level">다음 레벨까지 <strong>{100 - progress} XP</strong> 남았어요</p></div></div><div className="profile-stat-grid"><div><HeartHandshake size={20} /><strong>{profile.returnedCount}</strong><span>반환 완료</span></div><div><Sparkles size={20} /><strong>{profile.xp}</strong><span>누적 경험치</span></div><div><Award size={20} /><strong>{badges.filter((badge) => badge.unlocked).length}</strong><span>획득 업적</span></div></div></section>
    <div className="profile-tip"><span><Sparkles size={19} /><strong>친절을 경험치로!</strong> 물품 등록과 반환 활동으로 성장해요.</span><Link to="/guide">경험치 안내 <ChevronRight size={15} /></Link></div>
    <div className="workflow-tabs profile-tabs" aria-label="마이페이지 메뉴">{([
      ['items', '등록 내역', Package], ['returns', '반환 내역', HeartHandshake], ['badges', '획득 업적', Award], ['notifications', '알림', Bell],
    ] as const).map(([value, label, Icon]) => <button key={value} className={tab === value ? 'active' : ''} aria-pressed={tab === value} onClick={() => setTab(value)}><Icon size={17} />{label}{value === 'notifications' && unread > 0 && <span className="notification-count">{unread}</span>}</button>)}</div>
    {tab === 'items' && <MyItemList />}
    {tab === 'returns' && <section><div className="workflow-section-heading"><h2>내 반환 요청 <span>{requests.length}</span></h2><span className="muted">요청한 반환과 등록한 습득물의 반환</span></div>{requests.length ? <div className="profile-return-list">{requests.map((request) => {
      const item = items.find((entry) => entry.id === request.itemId);
      if (!item) return null;
      return <Link className="card profile-return" key={request.id} to={`/returns/${request.id}`}><div className={`profile-activity-icon ${request.status === 'completed' ? 'completed' : ''}`}>{request.status === 'completed' ? <CheckCircle2 size={23} /> : <HeartHandshake size={23} />}</div><div><h3>{item.title}</h3><p>{new Date(request.createdAt).toLocaleDateString('ko-KR')} 요청 {request.status === 'completed' && <strong>· 반환 완료</strong>}</p></div><span className={`badge ${request.status === 'completed' ? 'badge-green' : 'badge-blue'}`}>{requestLabels[request.status]}</span><ChevronRight size={17} /></Link>;
    })}</div> : <div className="card empty-state"><HeartHandshake size={37} /><h3>아직 반환 요청이 없어요</h3><p>찾고 있던 물품을 발견했다면 반환을 요청해 보세요.</p><Link className="button button-primary" to="/search">물품 찾아보기 <ArrowRight size={16} /></Link></div>}<p className="workflow-small-note">등록·반환 기록에 따라 경험치와 업적이 반영됩니다. 반환 보상은 물품을 돌려준 습득자에게 지급됩니다.</p></section>}
    {tab === 'badges' && <section><div className="workflow-section-heading"><h2>친절의 발자국</h2><span className="muted">{badges.filter((badge) => badge.unlocked).length} / {badges.length}개 획득</span></div><div className="profile-badge-grid">{badges.map(({ name, description, icon: Icon, unlocked, color }) => <article className={`card achievement ${unlocked ? '' : 'locked'}`} key={name}><div className={`achievement-icon ${color}`}><Icon size={31} strokeWidth={1.6} /></div><h3>{name}</h3><p>{description}</p><span className={unlocked ? 'achievement-earned' : 'muted'}>{unlocked ? <><CheckCircle2 size={13} /> 획득 완료</> : <><LockKeyhole size={13} /> 아직 도전 중</>}</span></article>)}</div></section>}
    {tab === 'notifications' && <MatchNotificationList />}
    {tab === 'notifications' && <section className="demo-notification-section" aria-labelledby="demo-notification-title"><div className="workflow-section-heading"><h2 id="demo-notification-title">활동 소식 <span>{activityUnread}</span></h2><button className="button button-ghost" onClick={() => { void markNotificationsRead().catch(() => setError('알림을 저장하지 못했어요. 다시 시도해 주세요.')); }} disabled={activityUnread === 0}>모두 읽음으로 표시</button></div><p className="workflow-small-note">물품 등록과 반환 진행 소식이에요. 계정에 저장되어 다른 브라우저에서도 확인할 수 있어요.</p>{notifications.length ? <div className="profile-notifications">{notifications.map((notification) => <article key={notification.id} className={`card profile-notification ${notification.read ? '' : 'unread'}`}><span className="profile-activity-icon"><Bell size={21} /></span><div><h3>{notification.title}{!notification.read && <span className="notification-dot" aria-label="읽지 않음" />}</h3><p>{notification.message}</p><time>{new Date(notification.createdAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div></article>)}</div> : <div className="card empty-state"><Bell size={35} /><h3>아직 도착한 알림이 없어요</h3><p>반환 요청의 진행 상황을 이곳에서 알려 드려요.</p></div>}</section>}
    <button className="button button-ghost" onClick={() => { void refreshData(); }}>기록 새로고침</button>
  </div>;
}
