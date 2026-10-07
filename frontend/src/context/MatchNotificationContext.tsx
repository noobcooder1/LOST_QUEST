import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from './AppContext';
import { describeNotificationError, getUnreadCount, refreshMatchNotifications, type RefreshResult } from '../services/notificationApi';

interface MatchNotificationValue {
  /** Server unread count; null while signed out or not loaded yet. */
  unreadCount: number | null;
  setUnreadCount: (count: number) => void;
  refreshing: boolean;
  lastRefresh: RefreshResult | null;
  refreshError: string | null;
  /** Re-matches the user's recent lost items on the server and updates the count. */
  runRefresh: () => Promise<RefreshResult | null>;
  reloadCount: () => Promise<void>;
}

const MatchNotificationContext = createContext<MatchNotificationValue | null>(null);

/**
 * Match-notification state shared by the header badge and the notification list. No polling, WebSocket or push:
 * the server re-matches when the user signs in (and when asked), and the cheap unread count is reloaded on navigation.
 */
export function MatchNotificationProvider({ children }: { children: ReactNode }) {
  const { authUser } = useApp();
  const { pathname } = useLocation();
  const userId = authUser?.id ?? null;
  const [unreadCount, setUnreadCountState] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<RefreshResult | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  // Responses that arrive after a logout or user switch are ignored.
  const userRef = useRef<number | null>(userId);
  userRef.current = userId;

  const setUnreadCount = useCallback((count: number) => setUnreadCountState(count), []);

  const reloadCount = useCallback(async () => {
    const forUser = userRef.current;
    if (forUser === null) return;
    try {
      const count = await getUnreadCount();
      if (userRef.current === forUser) setUnreadCountState(count);
    } catch {
      // Keep the last known count; the list view shows errors explicitly.
    }
  }, []);

  const runRefresh = useCallback(async () => {
    const forUser = userRef.current;
    if (forUser === null) return null;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const result = await refreshMatchNotifications();
      if (userRef.current !== forUser) return null;
      setLastRefresh(result);
      setUnreadCountState(result.unreadCount);
      return result;
    } catch (error) {
      if (userRef.current === forUser) setRefreshError(describeNotificationError(error));
      return null;
    } finally {
      if (userRef.current === forUser) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setUnreadCountState(null);
    setLastRefresh(null);
    setRefreshError(null);
    setRefreshing(false);
    if (userId === null) return;
    void reloadCount();
    void runRefresh();
  }, [userId, reloadCount, runRefresh]);

  useEffect(() => {
    void reloadCount();
  }, [pathname, reloadCount]);

  return <MatchNotificationContext.Provider value={{ unreadCount, setUnreadCount, refreshing, lastRefresh, refreshError, runRefresh, reloadCount }}>
    {children}
  </MatchNotificationContext.Provider>;
}

export function useMatchNotifications(): MatchNotificationValue {
  const context = useContext(MatchNotificationContext);
  if (!context) throw new Error('useMatchNotifications must be used within MatchNotificationProvider');
  return context;
}
