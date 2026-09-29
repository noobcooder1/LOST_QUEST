import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createSeedData } from '../data/seed';
import { registerItem, requestReturn, transitionReturn, verifyOwnership } from '../services/demoStore';
import { loadDemoData, serializeData, STORAGE_KEY } from '../services/storage';
import type { AppData, Item, NewItem, ReturnRequest, ReturnStatus } from '../types';

interface AppContextValue extends AppData {
  isLoggedIn: boolean;
  login: () => void;
  logout: () => void;
  addItem: (input: NewItem) => Item;
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
  const [initial] = useState(loadDemoData);
  const [data, setData] = useState(initial.data);
  const [storageError, setStorageError] = useState<string | null>(initial.error);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const dataRef = useRef(data);
  const sessionRef = useRef(false);

  const commit = useCallback((next: AppData) => {
    // Synchronous ref updates make rapid repeated actions idempotent before rerender.
    if (dataRef.current === next) return;
    dataRef.current = next;
    setData(next);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeData(data));
    } catch {
      setStorageError('테스트 데이터를 저장하지 못했어요. 저장 공간과 브라우저 설정을 확인해 주세요. 현재 체험은 계속할 수 있어요.');
    }
  }, [data]);

  const requireSession = () => {
    if (!sessionRef.current) throw new Error('테스트 계정으로 로그인한 뒤 이용해 주세요.');
  };
  const login = () => { sessionRef.current = true; setIsLoggedIn(true); };
  const logout = () => { sessionRef.current = false; setIsLoggedIn(false); };
  const addItem = (input: NewItem) => {
    requireSession();
    const result = registerItem(dataRef.current, input);
    commit(result.data);
    return result.item;
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
