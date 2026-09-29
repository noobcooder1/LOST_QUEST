import { lazy, Suspense } from 'react';
import { Route, Routes, Link } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import ItemDetailPage from './pages/ItemDetailPage';
const AuthPage = lazy(() => import('./pages/AuthPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const MatchingPage = lazy(() => import('./pages/MatchingPage'));
const ReturnPage = lazy(() => import('./pages/ReturnPage'));
const MyPage = lazy(() => import('./pages/MyPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const GuidePage = lazy(() => import('./pages/GuidePage'));

export default function App() {
  return <Layout><Suspense fallback={<div className="page-container empty-state" role="status"><span className="loading-dot" />화면을 준비하고 있어요.</div>}>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/items/:id" element={<ItemDetailPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/signup" element={<AuthPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/matches" element={<MatchingPage />} />
      <Route path="/returns/:id" element={<ReturnPage />} />
      <Route path="/mypage" element={<MyPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/guide" element={<GuidePage />} />
      <Route path="*" element={<div className="page-container empty-state"><p className="eyebrow">404 · 길을 잠시 벗어났어요</p><h1>이 페이지를 찾을 수 없어요.</h1><p>홈에서 새로운 탐색을 시작해 주세요.</p><Link className="button button-primary" to="/">홈으로 돌아가기</Link></div>} />
    </Routes>
  </Suspense></Layout>;
}
