import { useRef, useState } from 'react';
import { CheckCircle2, CircleHelp, LoaderCircle, Server, TriangleAlert } from 'lucide-react';
import { ApiClientError, checkApiHealth, getApiBaseUrl } from '../services/apiClient';
import './ApiHealthStatus.css';

type HealthState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'not-configured' }
  | { status: 'error'; message: string };

export default function ApiHealthStatus() {
  const [state, setState] = useState<HealthState>(() => ({ status: getApiBaseUrl() ? 'idle' : 'not-configured' }));
  const inFlight = useRef(false);

  async function checkConnection() {
    if (inFlight.current) return;
    if (!getApiBaseUrl()) { setState({ status: 'not-configured' }); return; }
    inFlight.current = true;
    setState({ status: 'loading' });
    try {
      await checkApiHealth();
      setState({ status: 'success' });
    } catch (error) {
      setState({ status: 'error', message: error instanceof ApiClientError ? error.message : '연결을 확인하지 못했어요. 다시 시도해 주세요.' });
    } finally {
      inFlight.current = false;
    }
  }

  const message = state.status === 'not-configured'
    ? '연결 설정 전이에요. frontend/.env.local에 VITE_API_BASE_URL을 설정하고 개발 서버를 다시 시작해 주세요.'
    : state.status === 'idle'
      ? '버튼을 누르면 회원·물품·반환 기능에 사용하는 서버의 응답을 확인해요.'
      : state.status === 'loading'
        ? '백엔드 응답을 기다리고 있어요. 최대 5초가 걸려요.'
        : state.status === 'success'
          ? 'LOST QUEST API가 정상 응답했어요. 저장된 기록은 각 화면에서 확인할 수 있어요.'
          : state.message;

  return <section className={`api-health-status api-health-${state.status}`} aria-label="백엔드 연결 확인">
    <div className="api-health-title"><Server size={17} aria-hidden="true" /><strong>백엔드 연결 확인</strong></div>
    <div className="api-health-message" role="status" aria-live="polite" aria-atomic="true">
      {state.status === 'success' ? <CheckCircle2 size={16} aria-hidden="true" /> : state.status === 'error' ? <TriangleAlert size={16} aria-hidden="true" /> : <CircleHelp size={16} aria-hidden="true" />}
      <span>{message}</span>
    </div>
    <button type="button" className="api-health-button" onClick={checkConnection} disabled={state.status === 'loading' || state.status === 'not-configured'}>
      {state.status === 'loading' && <LoaderCircle size={15} className="api-health-spinner" aria-hidden="true" />}
      {state.status === 'loading' ? '확인 중' : state.status === 'not-configured' ? '설정 필요' : state.status === 'idle' ? '연결 확인' : '다시 확인'}
    </button>
  </section>;
}
