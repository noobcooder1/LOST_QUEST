export interface ApiHealthResponse {
  status: 'OK';
  service: 'LOST QUEST API';
}

export type ApiErrorCode = 'NOT_CONFIGURED' | 'INVALID_CONFIG' | 'HTTP_ERROR' | 'INVALID_RESPONSE' | 'TIMEOUT' | 'NETWORK_ERROR';

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;

  constructor(code: ApiErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

/** Vite substitutes this public setting at startup/build time; it must not contain secrets. */
export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
}

function healthUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) {
    throw new ApiClientError('NOT_CONFIGURED', 'VITE_API_BASE_URL을 설정하고 개발 서버를 다시 시작해 주세요.');
  }
  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('Invalid API base URL');
    }
    return `${normalized}/api/health`;
  } catch {
    throw new ApiClientError('INVALID_CONFIG', 'API 주소를 확인해 주세요. http:// 또는 https://로 시작하는 서버 주소가 필요해요.');
  }
}

/** This optional connection check is independent of the local item/return demo. */
export async function checkApiHealth(options: { baseUrl?: string; timeoutMs?: number } = {}): Promise<ApiHealthResponse> {
  const url = healthUrl(options.baseUrl ?? getApiBaseUrl());
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ApiClientError('INVALID_CONFIG', 'API 연결 확인의 제한 시간을 확인해 주세요.');
  }
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ApiClientError('HTTP_ERROR', `서버가 오류를 반환했어요. (HTTP ${response.status})`, response.status);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ApiClientError('INVALID_RESPONSE', '서버 응답을 읽지 못했어요. /api/health가 JSON을 반환하는지 확인해 주세요.');
    }
    if (!body || typeof body !== 'object' || !('status' in body) || body.status !== 'OK' || !('service' in body) || body.service !== 'LOST QUEST API') {
      throw new ApiClientError('INVALID_RESPONSE', '예상한 LOST QUEST API 응답이 아니에요. 서버 주소와 응답 형식을 확인해 주세요.');
    }
    if (timedOut) throw new ApiClientError('TIMEOUT', '서버 응답 시간이 초과되었어요. 서버 실행 상태를 확인한 뒤 다시 시도해 주세요.');
    return { status: 'OK', service: 'LOST QUEST API' };
  } catch (error) {
    if (timedOut) {
      throw new ApiClientError('TIMEOUT', '서버 응답 시간이 초과되었어요. 서버 실행 상태를 확인한 뒤 다시 시도해 주세요.');
    }
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('NETWORK_ERROR', '서버에 연결하지 못했어요. 백엔드 실행 상태, API 주소와 CORS 설정을 확인해 주세요.');
  } finally {
    clearTimeout(timer);
  }
}
