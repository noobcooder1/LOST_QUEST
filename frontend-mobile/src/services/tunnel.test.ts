import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTunnelImage, getTunnelHeaders, isTunnelItemImage } from './tunnel';

afterEach(() => vi.unstubAllGlobals());

describe('ngrok development transport', () => {
  it.each(['https://example.ngrok-free.dev', 'https://example.ngrok-free.app'])('recognizes the assigned development domain %s', url => {
    expect(getTunnelHeaders(url)).toEqual({ 'ngrok-skip-browser-warning': '1' });
    expect(isTunnelItemImage(`${url}/api/images/example.png`)).toBe(true);
    expect(isTunnelItemImage(`${url}/other/image.png`)).toBe(false);
  });

  it.each(['http://localhost:8080', 'https://api.example.com', 'https://example.ngrok-free.dev.evil.test', 'https://evilngrok-free.dev', 'http://example.ngrok-free.dev', '/images/wallet.svg'])('leaves non-ngrok transport unchanged %s', url => {
    expect(getTunnelHeaders(url)).toEqual({});
    expect(isTunnelItemImage(url)).toBe(false);
  });

  it('rejects a successful HTML visitor page rather than treating it as an image', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Visitor warning</html>', { headers: { 'Content-Type': 'text/html' } })));
    await expect(fetchTunnelImage('https://example.ngrok-free.dev/api/images/example.png', new AbortController().signal)).rejects.toThrow('Expected image bytes');
  });

  it('fetches image bytes with bypass headers and without credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(['image bytes'], { type: 'image/png' }), { headers: { 'Content-Type': 'image/png' } }));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    const blob = await fetchTunnelImage('https://example.ngrok-free.dev/api/images/example.png', signal);
    expect(blob.type).toBe('image/png');
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), { headers: { Accept: 'image/png,image/jpeg,image/webp', 'ngrok-skip-browser-warning': '1' }, credentials: 'omit', signal });
  });
});
