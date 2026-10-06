import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createSeedData } from '../data/seed';
import { login as loginRequest, restoreAuthSession, signup as signupRequest, type AuthUser, type SignupInput } from '../services/authApi';
import { clearAuthSession, saveAuthSession } from '../services/authSession';
import { registerItem, requestReturn, transitionReturn, verifyOwnership } from '../services/demoStore';
import { loadDemoData, saveDemoData } from '../services/storage';
import type { AppData, Item, NewItem, ReturnRequest, ReturnStatus } from '../types';

interface AppContextValue extends AppData {
  isLoggedIn: boolean;
  /** The server-verified user; null while signed out or while a stored token is being checked. */
  authUser: AuthUser | null;
  authChecking: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => void;
  addItem: (input: NewItem) => Promise<Item>;
  createRequest: (itemId: string, lostItemId?: string) => ReturnRequest;
  verifyOwner: (requestId: string, answer: string) => boolean;
  approveRequest: (id: string) => void;
  verifyQr: (id: string) => void;
  completeReturn: (id: string) => void;
  rejectRequest: (id: string) => void;
  markNotificationsRead: () => void;
  resetDemo: () => void;
  storageError: string | null;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState(createSeedData);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authExpiresAt, setAuthExpiresAt] = useState<number | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const isLoggedIn = authUser !== null;
  const dataRef = useRef(data);
  const sessionRef = useRef(false);
  const registrationPending = useRef(false);
  /** Bumped on every login/logout so a slower startup check cannot overwrite a newer session. */
  const authVersionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadDemoData().then((initial) => {
      if (cancelled) return;
      dataRef.current = initial.data;
      setData(initial.data);
      setStorageError(initial.error);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  const commit = useCallback((next: AppData) => {
    // Synchronous ref updates make rapid repeated actions idempotent before rerender.
    if (dataRef.current === next) return Promise.resolve(true);
    dataRef.current = next;
    setData(next);
    return saveDemoData(next).then(() => {
      setStorageError(null);
      return true;
    }, () => {
      setStorageError('테스트 데이터를 저장하지 못했어요. 저장 공간과 브라우저 설정을 확인해 주세요.');
      return false;
    });
  }, []);

  const applySession = useCallback((user: AuthUser | null, expiresAt: number | null) => {
    sessionRef.current = user !== null;
    setAuthUser(user);
    setAuthExpiresAt(expiresAt);
    setAuthChecking(false);
  }, []);

  // A stored token only counts once the server confirms it through /api/auth/me.
  useEffect(() => {
    let cancelled = false;
    const version = authVersionRef.current;
    restoreAuthSession().then((restored) => {
      if (cancelled || version !== authVersionRef.current) return;
      applySession(restored?.user ?? null, restored?.expiresAt ?? null);
    });
    return () => { cancelled = true; };
  }, [applySession]);

  // Sign out locally when the access token expires; the server rejects it from then on anyway.
  useEffect(() => {
    if (authExpiresAt === null) return;
    const timer = setTimeout(() => { clearAuthSession(); applySession(null, null); }, Math.min(Math.max(authExpiresAt - Date.now(), 0), 2_147_483_647));
    return () => clearTimeout(timer);
  }, [authExpiresAt, applySession]);

  const requireSession = () => {
    if (!sessionRef.current) throw new Error('테스트 계정으로 로그인한 뒤 이용해 주세요.');
  };
  const login = async (email: string, password: string) => {
    const result = await loginRequest(email, password);
    authVersionRef.current += 1;
    const session = saveAuthSession(result.accessToken, result.expiresIn);
    applySession(result.user, session.expiresAt);
  };
  const signup = async (input: SignupInput) => {
    await signupRequest(input);
    await login(input.email, input.password);
  };
  const logout = () => { authVersionRef.current += 1; clearAuthSession(); applySession(null, null); };
  const addItem = async (input: NewItem) => {
    requireSession();
    if (registrationPending.current) throw new Error('물품을 저장하고 있어요. 잠시 기다려 주세요.');
    registrationPending.current = true;
    const previous = dataRef.current;
    try {
      const result = registerItem(previous, input);
      if (!await commit(result.data)) {
        if (dataRef.current === result.data) {
          dataRef.current = previous;
          setData(previous);
        }
        throw new Error('사진과 물품 정보를 저장하지 못했어요. 저장 공간과 브라우저 설정을 확인한 뒤 다시 등록해 주세요.');
      }
      return result.item;
    } finally {
      registrationPending.current = false;
    }
  };
  const createRequest = (itemId: string, lostItemId?: string) => {
    requireSession();
    const result = requestReturn(dataRef.current, itemId, lostItemId);
    commit(result.data);
    return result.request;
  };
  const verifyOwner = (requestId: string, answer: string) => {
    if (!sessionRef.current) return false;
    const result = verifyOwnership(dataRef.current, requestId, answer);
    commit(result.data);
    return result.verified;
  };
  const transition = (requestId: string, nextStatus: ReturnStatus) => {
    if (!sessionRef.current) return;
    commit(transitionReturn(dataRef.current, requestId, nextStatus));
  };
  const resetDemo = () => {
    setStorageError(null);
    commit(createSeedData());
  };

  if (!ready) return <div className="page-container" role="status">저장된 물품과 사진을 불러오고 있어요…</div>;

  return <AppContext.Provider value={{
    // The server nickname replaces the demo profile name for display only; XP data stays local.
    ...data, profile: authUser ? { ...data.profile, name: authUser.nickname } : data.profile,
    isLoggedIn, authUser, authChecking, login, signup, logout, addItem, createRequest, verifyOwner,
    approveRequest: (id) => transition(id, 'approved'),
    verifyQr: (id) => transition(id, 'qr_verified'),
    completeReturn: (id) => transition(id, 'completed'),
    rejectRequest: (id) => transition(id, 'rejected'),
    markNotificationsRead: () => commit({ ...dataRef.current, notifications: dataRef.current.notifications.map((notification) => ({ ...notification, read: true })) }),
    resetDemo, storageError,
  }}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
