import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Bell, CheckCheck, ListChecks, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useMatchNotifications } from '../context/MatchNotificationContext';
import {
  describeNotificationError, listNotifications, markAllNotificationsRead, markNotificationRead, notificationMessage, notificationMeta,
  type MatchNotification, type RefreshResult,
} from '../services/notificationApi';

const timeFormat: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };

function refreshSummary(result: RefreshResult): string {
  const parts: string[] = [];
  if (result.created > 0) parts.push(`새 매칭 알림 ${result.created}건이 도착했어요.`);
  else if (result.checkedLostItems > 0) parts.push('새로 발견된 매칭 후보가 없어요.');
  else if (result.throttledLostItems > 0) parts.push('최근에 이미 확인했어요. 잠시 후 다시 확인할 수 있어요.');
  else parts.push('최근 30일 안에 등록한 진행 중인 분실물이 없어 확인할 대상이 없어요.');
  const police = result.sources.find((source) => source.source === 'POLICE');
  if (police && police.status !== 'OK') {
    const what = police.status === 'PARTIAL' ? '경찰청 공공데이터는 일부만 확인했어요' : '경찰청 공공데이터는 확인하지 못했어요';
    parts.push(`${what}${police.message ? ` (${police.message})` : ''}. LOST QUEST 습득물은 확인했어요.`);
  }
  return parts.join(' ');
}

/** The signed-in user's server match notifications. Errors are shown as errors; nothing falls back to demo data. */
export default function MatchNotificationList() {
  const navigate = useNavigate();
  const { unreadCount, setUnreadCount, refreshing, lastRefresh, refreshError, runRefresh } = useMatchNotifications();
  const { authUser } = useApp();
  const userId = authUser?.id ?? null;
  // `forUser` records whose list this is, so another account's list is never shown.
  const [state, setState] = useState<{ forUser: number | null; loading: boolean; error?: string; notifications: MatchNotification[] }>({ forUser: userId, loading: true, notifications: [] });
  const [actionError, setActionError] = useState<string | null>(null);
  // Bumped by every new load, account switch and unmount: a response is applied only by the latest request.
  const generation = useRef(0);

  const load = useCallback(async () => {
    const forUser = userId;
    const request = ++generation.current;
    setState((previous) => (previous.forUser === forUser ? { ...previous, loading: true, error: undefined } : { forUser, loading: true, notifications: [] }));
    try {
      const list = await listNotifications();
      if (generation.current !== request) return; // signed out, switched accounts or superseded meanwhile
      setState({ forUser, loading: false, notifications: list.notifications });
      setUnreadCount(list.unreadCount);
    } catch (error) {
      if (generation.current !== request) return;
      setState({ forUser, loading: false, notifications: [], error: describeNotificationError(error) });
    }
  }, [userId, setUnreadCount]);

  // The user this mounted list currently belongs to (undefined after unmount). Read/read-all responses are applied
  // only if the user that started the request is still this one, like the list guard above.
  const activeUser = useRef<number | null | undefined>(undefined);
  useLayoutEffect(() => {
    activeUser.current = userId;
    return () => { activeUser.current = undefined; };
  }, [userId]);
  const isActive = (forUser: number | null) => activeUser.current === forUser;

  // Initial load, again for another account, and whenever a refresh (sign-in or button) finished.
  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load, lastRefresh]);

  const open = async (event: MouseEvent<HTMLAnchorElement>, notification: MatchNotification, path: string) => {
    event.preventDefault();
    const forUser = userId;
    if (!notification.read) {
      try {
        const updated = await markNotificationRead(notification.id);
        if (isActive(forUser)) {
          setState((previous) => ({ ...previous, notifications: previous.notifications.map((n) => (n.id === updated.id ? updated : n)) }));
          if (unreadCount !== null) setUnreadCount(Math.max(0, unreadCount - 1));
        }
      } catch {
        // Navigation still happens; the item stays unread and can be retried.
      }
    }
    // After a sign-out or account switch the previous user's item is not opened for the new user.
    if (isActive(forUser)) navigate(path);
  };

  const readAll = async () => {
    const forUser = userId;
    setActionError(null);
    try {
      const count = await markAllNotificationsRead();
      if (!isActive(forUser)) return; // signed out or switched accounts meanwhile
      setUnreadCount(count);
      setState((previous) => ({ ...previous, notifications: previous.notifications.map((n) => ({ ...n, read: true })) }));
    } catch (error) {
      if (isActive(forUser)) setActionError(describeNotificationError(error));
    }
  };

  const shown = state.forUser === userId ? state : { loading: true, error: undefined, notifications: [] as MatchNotification[] };
  const unread = unreadCount ?? shown.notifications.filter((n) => !n.read).length;

  return <section aria-labelledby="match-notification-title" className="match-notification-section">
    <div className="workflow-section-heading"><h2 id="match-notification-title">매칭 알림 <span>{unread}</span></h2>
      <div className="match-notification-actions">
        <button type="button" className="button button-ghost" onClick={() => void runRefresh()} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'pulse-icon' : ''} aria-hidden="true" /> {refreshing ? '확인 중…' : '새 매칭 확인'}</button>
        <button type="button" className="button button-ghost" onClick={() => void readAll()} disabled={unread === 0}><CheckCheck size={15} aria-hidden="true" /> 모두 읽음</button>
      </div>
    </div>
    <p className="match-notification-status" role="status">{refreshing ? '내 분실물과 닮은 새 습득물을 확인하고 있어요…' : lastRefresh ? refreshSummary(lastRefresh) : ''}</p>
    {(refreshError || actionError) && <p className="match-notification-error" role="alert"><AlertTriangle size={15} aria-hidden="true" /> {actionError ?? `새 매칭을 확인하지 못했어요. ${refreshError}`}</p>}
    {shown.loading && shown.notifications.length === 0 ? <div className="card empty-state" role="status"><Bell size={32} aria-hidden="true" /><h3>알림을 불러오고 있어요…</h3></div>
      : shown.error ? <div className="card empty-state" role="alert"><AlertTriangle size={32} aria-hidden="true" /><h3>알림을 불러오지 못했어요</h3><p>{shown.error}</p><button type="button" className="button button-secondary" onClick={() => void load()}><RefreshCw size={15} aria-hidden="true" /> 다시 시도</button></div>
        : shown.notifications.length === 0 ? <div className="card empty-state"><Bell size={35} aria-hidden="true" /><h3>아직 도착한 매칭 알림이 없어요</h3><p>분실물을 등록하면, 닮은 습득물이 새로 발견될 때 이곳에서 알려 드려요.</p><Link className="button button-primary" to="/register?type=lost">분실물 등록하기 <ArrowRight size={16} /></Link></div>
          : <ul className="profile-notifications match-notifications" aria-label="매칭 알림 목록">{shown.notifications.map((n) => {
            const detail = n.foundRouteId ? `/items/${n.foundRouteId}` : n.matchesPath;
            return <li key={n.id} className={`card profile-notification ${n.read ? '' : 'unread'}`}>
              <span className="profile-activity-icon"><ListChecks size={21} aria-hidden="true" /></span>
              <div>
                <h3>{!n.read && <span className="badge badge-blue match-notification-new">새 알림</span>}<span>{notificationMessage(n)}</span></h3>
                <p><strong className="match-notification-meta">{notificationMeta(n)}</strong> · 습득물 ‘{n.foundTitle}’{n.foundDate && ` · ${n.foundDate} 습득`}</p>
                <time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString('ko-KR', timeFormat)}{n.read ? ' · 읽음' : ''}</time>
                <div className="match-notification-links">
                  <Link to={detail} onClick={(event) => void open(event, n, detail)} aria-label={`‘${n.foundTitle}’ 습득물 자세히 보기`}>습득물 자세히 보기 <ArrowRight size={14} aria-hidden="true" /></Link>
                  <Link to={n.matchesPath} onClick={(event) => void open(event, n, n.matchesPath)} aria-label={`‘${n.lostItemTitle}’ 매칭 추천 보기`}>매칭 추천 보기 <ArrowRight size={14} aria-hidden="true" /></Link>
                </div>
              </div>
            </li>;
          })}</ul>}
  </section>;
}
