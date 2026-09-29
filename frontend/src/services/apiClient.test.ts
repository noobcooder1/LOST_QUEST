import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkApiHealth } from './apiClient';

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
