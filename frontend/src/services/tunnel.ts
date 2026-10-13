/** Free ngrok tunnels may return a visitor page instead of API JSON or image bytes. */
export function getTunnelHeaders(url: string): Record<string, string> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && ['.ngrok-free.dev', '.ngrok-free.app'].some(suffix => parsed.hostname.endsWith(suffix))) {
      return { 'ngrok-skip-browser-warning': '1' };
    }
  } catch {
    // Relative/static image paths and invalid addresses need no tunnel headers.
  }
  return {};
}

export function isTunnelItemImage(url: string): boolean {
  try {
    return !!getTunnelHeaders(url)['ngrok-skip-browser-warning'] && new URL(url).pathname.startsWith('/api/images/');
  } catch {
    return false;
  }
}

/** Images fetched through a tunnel require headers that an ordinary <img> cannot send. */
export async function fetchTunnelImage(url: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(url, {
    headers: { Accept: 'image/png,image/jpeg,image/webp', ...getTunnelHeaders(url) },
    credentials: 'omit',
    signal,
  });
  if (!response.ok) throw new Error('Image request failed');
  const type = (response.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) throw new Error('Expected image bytes');
  return response.blob();
}
