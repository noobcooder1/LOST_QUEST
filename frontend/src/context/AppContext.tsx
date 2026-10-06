import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createSeedData } from '../data/seed';
import { registerItem, requestReturn, transitionReturn, verifyOwnership } from '../services/demoStore';
import { loadDemoData, saveDemoData } from '../services/storage';
import type { AppData, Item, NewItem, ReturnRequest, ReturnStatus } from '../types';

interface AppContextValue extends AppData {
  isLoggedIn: boolean;
  login: () => void;
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const dataRef = useRef(data);
  const sessionRef = useRef(false);
  const registrationPending = useRef(false);

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

  const requireSession = () => {
    if (!sessionRef.current) throw new Error('테스트 계정으로 로그인한 뒤 이용해 주세요.');
  };
  const login = () => { sessionRef.current = true; setIsLoggedIn(true); };
  const logout = () => { sessionRef.current = false; setIsLoggedIn(false); };
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
    ...data, isLoggedIn, login, logout, addItem, createRequest, verifyOwner,
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
