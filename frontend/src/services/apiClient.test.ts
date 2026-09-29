import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, checkApiHealth } from './apiClient';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('optional API health connection', () => {
  it('uses the environment URL, removes trailing slashes, and validates the service response', async () => {
    vi.stubEnv('VITE_API_BASE_URL', ' http://localhost:8080/// ');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'OK', service: 'LOST QUEST API' }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkApiHealth()).resolves.toEqual({ status: 'OK', service: 'LOST QUEST API' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/api/health', expect.objectContaining({ method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', signal: expect.any(AbortSignal) }));
  });

  it('does not send a request when the optional URL is missing', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(checkApiHealth()).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid configuration before making a network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    for (const baseUrl of ['localhost:8080', 'ftp://localhost', 'https://user:secret@example.test', 'https://example.test?token=secret']) {
      await expect(checkApiHealth({ baseUrl })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports HTTP failures without treating an error body as a successful health check', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'OK', service: 'LOST QUEST API' }), { status: 503 })));
    await expect(checkApiHealth({ baseUrl: 'http://localhost:8080' })).rejects.toMatchObject({ code: 'HTTP_ERROR', status: 503 });
  });

  it.each([
    { status: 'DOWN', service: 'LOST QUEST API' },
    { status: 'OK', service: 'Another API' },
    { status: 'OK' },
    null,
  ])('rejects a response that does not match the health contract: %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    await expect(checkApiHealth({ baseUrl: 'http://localhost:8080' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('reports a non-JSON response clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Proxy error</html>')));
    await expect(checkApiHealth({ baseUrl: 'http://localhost:8080' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('reports network and CORS failures as connection errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(checkApiHealth({ baseUrl: 'http://localhost:8080' })).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('aborts a stalled request after the timeout and releases the timer', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      requestSignal = options.signal as AbortSignal;
      requestSignal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));
    const request = checkApiHealth({ baseUrl: 'http://localhost:8080', timeoutMs: 500 });
    const assertion = expect(request).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('shared API request', () => {
  const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('sends JSON bodies and the Bearer token only in the Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest('/api/auth/login', { baseUrl: 'http://localhost:8080/', method: 'POST', body: { email: 'a@b.test' }, accessToken: 'h.p.s' })).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8080/api/auth/login');
    expect(url).not.toContain('h.p.s');
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store', body: '{"email":"a@b.test"}' });
    expect(init.headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer h.p.s' });
  });

  it('omits Authorization and Content-Type when there is no token or body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest('/api/lost-items', { baseUrl: 'http://localhost:8080' });
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers).toEqual({ Accept: 'application/json' });
  });

  it('maps the server ApiError format to status, server code, message, and field errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      status: 400, code: 'VALIDATION_ERROR', message: '입력값을 확인해 주세요.', path: '/api/auth/signup',
      errors: [{ field: 'email', message: '올바른 형식의 이메일 주소여야 합니다' }, { bogus: true }],
    }, 400)));
    await expect(apiRequest('/api/auth/signup', { baseUrl: 'http://localhost:8080', method: 'POST', body: {} })).rejects.toMatchObject({
      code: 'HTTP_ERROR', status: 400, serverCode: 'VALIDATION_ERROR', message: '입력값을 확인해 주세요.',
      fieldErrors: [{ field: 'email', message: '올바른 형식의 이메일 주소여야 합니다' }],
    });
  });

  it('falls back to a generic message for non-JSON error bodies and reports network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>502</html>', { status: 502 })));
    await expect(apiRequest('/api/auth/me', { baseUrl: 'http://localhost:8080' })).rejects.toMatchObject({ code: 'HTTP_ERROR', status: 502, serverCode: undefined });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiRequest('/api/auth/me', { baseUrl: 'http://localhost:8080' })).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('refuses to send requests without a configured API address', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest('/api/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
