import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Award, Bell, CheckCircle2, ChevronRight, Compass, HeartHandshake, LockKeyhole, Package, RotateCcw, ShieldCheck, Sparkles, Trophy, UserRound } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useMatchNotifications } from '../context/MatchNotificationContext';
import MatchNotificationList from '../components/MatchNotificationList';
import MyItemList from '../components/MyItemList';
import type { ReturnRequest } from '../types';
import './workflow.css';

const requestLabels: Record<ReturnRequest['status'], string> = { pending: '소유자 확인 대기', owner_verified: '요청 승인 대기', approved: 'QR 인증 대기', qr_verified: '반환 완료 확인 대기', completed: '반환 완료', rejected: '반려' };

export default function MyPage() {
  const { items, requests, profile, notifications, isLoggedIn, logout, markNotificationsRead, resetDemo } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = ['items', 'returns', 'badges', 'notifications'].includes(params.get('tab') ?? '') ? params.get('tab')! : 'items';
  const setTab = (value: string) => setParams(value === 'items' ? {} : { tab: value });
  const [resetOpen, setResetOpen] = useState(false);
  const resetDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (resetOpen) resetDialog.current?.showModal(); }, [resetOpen]);
  const level = Math.floor(profile.xp / 100) + 1;
  const progress = profile.xp % 100;
  // The tab badge counts server match notifications; return-demo messages keep their own count below.
  const { unreadCount } = useMatchNotifications();
  const unread = unreadCount ?? 0;
  const demoUnread = notifications.filter((notification) => !notification.read).length;
  const badges = [
    { name: '첫 발걸음', description: '첫 번째 물품 등록', icon: Compass, unlocked: profile.registeredCount >= 1, color: 'blue' },
    { name: '따뜻한 연결', description: '물품 1개 반환 완료', icon: HeartHandshake, unlocked: profile.returnedCount >= 1, color: 'green' },
    { name: '동네 탐정', description: '물품 3개 반환 완료', icon: ShieldCheck, unlocked: profile.returnedCount >= 3, color: 'purple' },
    { name: '친절 수집가', description: '누적 350 XP 달성', icon: Award, unlocked: profile.xp >= 350, color: 'orange' },
    { name: '든든한 이웃', description: '물품 5개 반환 완료', icon: Trophy, unlocked: profile.returnedCount >= 5, color: 'gold' },
    { name: '전국의 수호자', description: '누적 1,000 XP 달성', icon: Sparkles, unlocked: profile.xp >= 1000, color: 'navy' },
  ];

  if (!isLoggedIn) return <div className="page-container workflow-auth"><LockKeyhole size={32} /><h1>나의 작은 친절을 모아 보세요</h1><p className="muted">테스트 계정으로 로그인하고 등록 내역과 경험치, 업적을 확인해요.</p><Link className="button button-primary" to={`/login?returnTo=${encodeURIComponent(`/mypage?tab=${tab}`)}`}>테스트 계정으로 로그인 <ArrowRight size={16} /></Link></div>;

  return <div className="page-container workflow-page">
    <div className="page-heading"><div className="eyebrow">나의 퀘스트</div><h1>마이페이지</h1><p>함께 찾아 준 순간들이 모여, 나만의 여정이 됩니다.</p><button className="text-link" style={{ marginTop: 14 }} onClick={logout}>테스트 계정 로그아웃</button></div>
    <section className="card profile-card"><div className="profile-overview"><div className="profile-avatar"><UserRound size={43} strokeWidth={1.5} /><span>Lv.{level}</span></div><div className="profile-identity"><span className="eyebrow">일상을 되찾아 주는 탐험가</span><h2>{profile.name} <span className="badge badge-blue">테스트 계정</span></h2><p className="muted">작은 친절을 함께 나누고 있어요.</p><div className="profile-xp-label"><strong>레벨 {level}</strong><span><b>{progress}</b> / 100 XP</span></div><div className="profile-progress" role="progressbar" aria-label="다음 레벨까지 경험치" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div><p className="profile-next-level">다음 레벨까지 <strong>{100 - progress} XP</strong> 남았어요</p></div></div><div className="profile-stat-grid"><div><HeartHandshake size={20} /><strong>{profile.returnedCount}</strong><span>반환 완료</span></div><div><Sparkles size={20} /><strong>{profile.xp}</strong><span>누적 경험치</span></div><div><Award size={20} /><strong>{badges.filter((badge) => badge.unlocked).length}</strong><span>획득 업적</span></div></div></section>
    <div className="profile-tip"><span><Sparkles size={19} /><strong>친절을 경험치로!</strong> 물품 등록과 반환 활동으로 성장해요.</span><Link to="/guide">경험치 안내 <ChevronRight size={15} /></Link></div>
    <div className="workflow-tabs profile-tabs" aria-label="마이페이지 메뉴">{([
      ['items', '등록 내역', Package], ['returns', '반환 내역', HeartHandshake], ['badges', '획득 업적', Award], ['notifications', '알림', Bell],
    ] as const).map(([value, label, Icon]) => <button key={value} className={tab === value ? 'active' : ''} aria-pressed={tab === value} onClick={() => setTab(value)}><Icon size={17} />{label}{value === 'notifications' && unread > 0 && <span className="notification-count">{unread}</span>}</button>)}</div>
    {tab === 'items' && <MyItemList />}
    {tab === 'returns' && <section><div className="workflow-section-heading"><h2>내 반환 요청 <span>{requests.length}</span></h2><span className="muted">이번 체험에서 생성한 요청</span></div>{requests.length ? <div className="profile-return-list">{requests.map((request) => {
      const item = items.find((entry) => entry.id === request.itemId);
      if (!item) return null;
      return <Link className="card profile-return" key={request.id} to={`/returns/${request.id}`}><div className={`profile-activity-icon ${request.status === 'completed' ? 'completed' : ''}`}>{request.status === 'completed' ? <CheckCircle2 size={23} /> : <HeartHandshake size={23} />}</div><div><h3>{item.title}</h3><p>{new Date(request.createdAt).toLocaleDateString('ko-KR')} 요청 {request.status === 'completed' && <strong>· +50 XP</strong>}</p></div><span className={`badge ${request.status === 'completed' ? 'badge-green' : 'badge-blue'}`}>{requestLabels[request.status]}</span><ChevronRight size={17} /></Link>;
    })}</div> : <div className="card empty-state"><HeartHandshake size={37} /><h3>아직 반환 요청이 없어요</h3><p>찾고 있던 물품을 발견했다면 반환을 요청해 보세요.</p><Link className="button button-primary" to="/search">물품 찾아보기 <ArrowRight size={16} /></Link></div>}<p className="workflow-small-note">프로필의 초기 반환 3건·경험치 320 XP는 예시 이력입니다. 이 목록에는 이번 체험에서 만든 요청이 표시됩니다.</p></section>}
    {tab === 'badges' && <section><div className="workflow-section-heading"><h2>친절의 발자국</h2><span className="muted">{badges.filter((badge) => badge.unlocked).length} / {badges.length}개 획득</span></div><div className="profile-badge-grid">{badges.map(({ name, description, icon: Icon, unlocked, color }) => <article className={`card achievement ${unlocked ? '' : 'locked'}`} key={name}><div className={`achievement-icon ${color}`}><Icon size={31} strokeWidth={1.6} /></div><h3>{name}</h3><p>{description}</p><span className={unlocked ? 'achievement-earned' : 'muted'}>{unlocked ? <><CheckCircle2 size={13} /> 획득 완료</> : <><LockKeyhole size={13} /> 아직 도전 중</>}</span></article>)}</div></section>}
    {tab === 'notifications' && <MatchNotificationList />}
    {tab === 'notifications' && <section className="demo-notification-section" aria-labelledby="demo-notification-title"><div className="workflow-section-heading"><h2 id="demo-notification-title">반환 체험 소식 <span>{demoUnread}</span></h2><button className="button button-ghost" onClick={markNotificationsRead} disabled={demoUnread === 0}>모두 읽음으로 표시</button></div><p className="workflow-small-note">반환·QR·경험치 체험(데모)에서 생긴 소식이에요. 이 브라우저에만 저장되며 실제 매칭 알림과는 별개예요.</p>{notifications.length ? <div className="profile-notifications">{notifications.map((notification) => <article key={notification.id} className={`card profile-notification ${notification.read ? '' : 'unread'}`}><span className="profile-activity-icon"><Bell size={21} /></span><div><h3>{notification.title}{!notification.read && <span className="notification-dot" aria-label="읽지 않음" />}</h3><p>{notification.message}</p><time>{new Date(notification.createdAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div></article>)}</div> : <div className="card empty-state"><Bell size={35} /><h3>아직 도착한 알림이 없어요</h3><p>반환 요청의 진행 상황을 이곳에서 알려 드려요.</p></div>}</section>}
    <div className="profile-demo-tools"><div><strong>테스트 데이터 관리</strong><p>이 브라우저에 저장된 체험 데이터를 초기 상태로 되돌릴 수 있어요.</p></div><button className="button button-ghost" onClick={() => setResetOpen(true)}><RotateCcw size={15} /> 체험 초기화</button></div>
    {resetOpen && <dialog ref={resetDialog} className="card workflow-modal" onCancel={() => setResetOpen(false)} aria-labelledby="reset-title"><h2 id="reset-title">체험 데이터를 초기화할까요?</h2><p className="muted">직접 등록한 물품, 반환 요청, 경험치와 알림이 삭제되고 초기 예시 데이터로 돌아갑니다. 이 작업은 되돌릴 수 없어요.</p><div className="workflow-modal-actions"><button autoFocus className="button button-secondary" onClick={() => setResetOpen(false)}>취소</button><button className="button button-primary" onClick={() => { resetDemo(); setResetOpen(false); setTab('items'); }}>초기화하기</button></div></dialog>}
  </div>;
}


