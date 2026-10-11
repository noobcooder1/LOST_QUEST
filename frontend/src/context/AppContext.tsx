import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { login as loginRequest, restoreAuthSession, signup as signupRequest, type AuthUser, type SignupInput } from '../services/authApi';
import { clearAuthSession, saveAuthSession } from '../services/authSession';
import { createReturn, describeActivityError, loadActivity, markActivityRead, returnAction } from '../services/activityApi';
import { listAllServerItems } from '../services/itemApi';
import type { AppData, ReturnRequest } from '../types';

interface AppContextValue extends AppData {
  isLoggedIn: boolean;
  authUser: AuthUser | null;
  authChecking: boolean;
  activityLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => void;
  refreshData: () => Promise<void>;
  createRequest: (itemId: string, lostItemId?: string) => Promise<ReturnRequest>;
  verifyOwner: (id: string, answer: string) => Promise<boolean>;
  approveRequest: (id: string) => Promise<void>;
  verifyQr: (id: string, token: string) => Promise<void>;
  renewQr: (id: string) => Promise<void>;
  completeReturn: (id: string) => Promise<void>;
  rejectRequest: (id: string) => Promise<void>;
  markNotificationsRead: () => Promise<void>;
  storageError: string | null;
}
const emptyData = (): AppData => ({ items: [], requests: [], notifications: [], profile: { name: '방문자', xp: 0, registeredCount: 0, returnedCount: 0 } });
const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState(emptyData);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authExpiresAt, setAuthExpiresAt] = useState<number | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [activityLoading, setActivityLoading] = useState(false);
  const userRef = useRef<AuthUser | null>(null);
  const authVersion = useRef(0);
  const loadVersion = useRef(0);

  const applySession = useCallback((user: AuthUser | null, expiresAt: number | null) => {
    userRef.current = user;
    loadVersion.current += 1;
    setAuthUser(user); setAuthExpiresAt(expiresAt); setAuthChecking(false);
    // Remove the previous user's private records immediately on logout/account switch.
    setData(previous => ({ ...emptyData(), items: previous.items, profile: { ...emptyData().profile, name: user?.nickname ?? '방문자' } }));
    setStorageError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const version = authVersion.current;
    void restoreAuthSession().then(restored => {
      if (!cancelled && version === authVersion.current) applySession(restored?.user ?? null, restored?.expiresAt ?? null);
    });
    return () => { cancelled = true; };
  }, [applySession]);

  const refreshData = useCallback(async () => {
    const version = ++loadVersion.current;
    const user = userRef.current;
    setActivityLoading(user !== null);
    // Public items and private activity fail independently; no fabricated/local-data fallback.
    const [items, activity] = await Promise.allSettled([listAllServerItems(), user ? loadActivity() : Promise.resolve(null)]);
    if (version !== loadVersion.current || user?.id !== userRef.current?.id) return;
    setData(previous => {
      const publicItems = items.status === 'fulfilled' ? items.value : previous.items;
      const privateData = activity.status === 'fulfilled' ? activity.value : null;
      const combined = new Map(publicItems.map(item => [item.id, item]));
      privateData?.relatedItems.forEach(item => combined.set(item.id, item));
      return { items: [...combined.values()], requests: privateData?.requests ?? previous.requests,
        notifications: privateData?.notifications ?? previous.notifications,
        profile: privateData?.profile ?? previous.profile };
    });
    setStorageError(items.status === 'rejected' ? describeActivityError(items.reason)
      : activity.status === 'rejected' ? describeActivityError(activity.reason) : null);
    setActivityLoading(false);
  }, []);

  useEffect(() => {
    if (authChecking) return;
    void refreshData();
    const refresh = () => { void refreshData(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('lostquest:data-changed', refresh);
    return () => {
      loadVersion.current += 1;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('lostquest:data-changed', refresh);
    };
  }, [authUser, authChecking, refreshData]);

  useEffect(() => {
    if (authExpiresAt === null) return;
    const timer = setTimeout(() => { authVersion.current += 1; clearAuthSession(); applySession(null, null); },
      Math.min(Math.max(authExpiresAt - Date.now(), 0), 2_147_483_647));
    return () => clearTimeout(timer);
  }, [authExpiresAt, applySession]);

  const login = async (email: string, password: string) => {
    const version = ++authVersion.current;
    const result = await loginRequest(email, password);
    if (version !== authVersion.current) return;
    const session = saveAuthSession(result.accessToken, result.expiresIn);
    applySession(result.user, session.expiresAt);
  };
  const signup = async (input: SignupInput) => { await signupRequest(input); await login(input.email, input.password); };
  const logout = () => { authVersion.current += 1; clearAuthSession(); applySession(null, null); };
  const requireSession = () => { if (!userRef.current) throw new Error('로그인한 뒤 이용해 주세요.'); };
  const createRequest = async (itemId: string, lostItemId?: string) => {
    requireSession();
    const request = await createReturn(itemId, lostItemId);
    await refreshData(); return request;
  };
  const act = async (id: string, action: Parameters<typeof returnAction>[1], body?: unknown) => {
    requireSession(); await returnAction(id, action, body); await refreshData();
  };
  return <AppContext.Provider value={{
    ...data, isLoggedIn: authUser !== null, authUser, authChecking, activityLoading, login, signup, logout,
    refreshData, createRequest, storageError,
    verifyOwner: async (id, answer) => { await act(id, 'verify-owner', { answer }); return true; },
    approveRequest: id => act(id, 'approve'),
    verifyQr: (id, token) => act(id, 'verify-qr', { token }),
    renewQr: id => act(id, 'renew-qr'),
    completeReturn: id => act(id, 'complete'),
    rejectRequest: id => act(id, 'reject'),
    markNotificationsRead: async () => { requireSession(); await markActivityRead(); await refreshData(); },
  }}>{children}</AppContext.Provider>;
}
export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
