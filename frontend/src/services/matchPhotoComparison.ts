import { getServerItem, MAX_IMAGE_BYTES, parseServerRouteId, resolveServerImageUrl, ALLOWED_IMAGE_TYPES } from './itemApi';
import { getTunnelHeaders } from './tunnel';
import { getApiBaseUrl } from './apiClient';
import { loadAuthSession } from './authSession';
import { safePoliceImageUrl } from './publicItemApi';
import type { Item } from '../types';
import type { MatchResult } from './matchingApi';
import type { PhotoSimilarity } from './photoSimilarity';

/** Only uploaded LOST QUEST photos: never category illustrations, police URLs or arbitrary hosts. */
export function uploadedPhotoUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const safe = resolveServerImageUrl(url.pathname);
    return safe === url.href ? safe : null;
  } catch { return null; }
}

function checkAbort(signal: AbortSignal) { signal.throwIfAborted(); }

/** The browser never fetches police pixels directly; only the authenticated, fixed-host backend proxy. */
export function policePhotoUrl(image: string): string | null {
  const safe = safePoliceImageUrl(image);
  const base = getApiBaseUrl();
  return safe && /^https?:\/\/[^/?#]+$/.test(base) ? `${base}/api/public-items/image?url=${encodeURIComponent(safe)}` : null;
}

function isPoliceProxyUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const image = url.searchParams.get('url');
    return image !== null && policePhotoUrl(image) === value;
  } catch { return false; }
}

async function photoFile(url: string, signal: AbortSignal): Promise<File> {
  // Redirects are rejected so photo requests cannot leave the configured API origin.
  const proxy = isPoliceProxyUrl(url);
  if (!uploadedPhotoUrl(url) && !proxy) throw new Error('비교할 물품 사진을 확인할 수 없어요.');
  const token = proxy ? loadAuthSession()?.accessToken : undefined;
  if (proxy && !token) throw new Error('다시 로그인하고 경찰청 사진을 비교해 주세요.');
  const response = await fetch(url, {
    headers: { Accept: 'image/jpeg,image/png,image/webp', ...getTunnelHeaders(url), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: 'omit', redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  });
  const type = response.headers.get('Content-Type')?.split(';')[0].trim() ?? '';
  if (!response.ok || !ALLOWED_IMAGE_TYPES.includes(type) || Number(response.headers.get('Content-Length')) > MAX_IMAGE_BYTES || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new Error('물품 사진을 불러오지 못했어요.');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) throw new Error('물품 사진은 10MB 이하여야 해요.');
      chunks.push(new Uint8Array(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  checkAbort(signal);
  if (!size) throw new Error('물품 사진이 비어 있어요.');
  return new File(chunks, new URL(url).pathname.split('/').pop()!, { type });
}

/** Re-reads the caller's lost item so a hidden/closed item or a replaced photo is never compared. */
async function freshTargetPhotoUrl(target: Item, ownerId: number, signal: AbortSignal): Promise<string | null> {
  const id = parseServerRouteId(target.id);
  if (!id || id.type !== 'lost') throw new Error('비교할 물건을 다시 선택해 주세요.');
  const freshTarget = await getServerItem('lost', id.serverId);
  checkAbort(signal);
  if (freshTarget.ownerId !== ownerId || freshTarget.hidden || freshTarget.status !== 'open') throw new Error('현재 비교할 수 있는 내 물건이 아니에요.');
  if (freshTarget.image !== target.image) throw new Error('잃어버린 물건 사진이 변경됐어요. 매칭을 다시 시작해 주세요.');
  return uploadedPhotoUrl(freshTarget.image);
}

/** Police photos only through the authenticated proxy; LOST QUEST posts are re-read (hidden/closed/replaced photo). */
async function candidatePhotoUrl(match: MatchResult, signal: AbortSignal): Promise<string | null> {
  if (match.source === 'POLICE') return policePhotoUrl(match.image);
  const candidateId = parseServerRouteId(match.routeId);
  if (!candidateId || candidateId.type !== 'found') throw new Error('잘못된 주운 물건');
  const candidate = await getServerItem('found', candidateId.serverId);
  checkAbort(signal);
  if (candidate.hidden || candidate.status !== 'open' || candidate.image !== (match.image || candidate.image)) throw new Error('비교할 수 없는 주운 물건이에요.');
  return uploadedPhotoUrl(candidate.image);
}

/**
 * Photos for the AI comparison screen: the found item's real photo (required) and the caller's lost-item photo when
 * there is one. Same checks as before (owner, open, not hidden, unchanged photo); nothing is uploaded or stored.
 */
export async function loadMatchPhotos(target: Item, match: MatchResult, ownerId: number, signal: AbortSignal): Promise<{ lost: File | null; found: File }> {
  checkAbort(signal);
  const targetUrl = await freshTargetPhotoUrl(target, ownerId, signal);
  const candidateUrl = await candidatePhotoUrl(match, signal);
  if (!candidateUrl) throw new Error('이 주운 물건에는 비교할 사진이 없어요.');
  const found = await photoFile(candidateUrl, signal);
  return { lost: targetUrl ? await photoFile(targetUrl, signal) : null, found };
}

/** Read-only second stage. Police pixels use the bounded server cache; no uploads or score/order changes. */
export async function compareMatchPhotos(target: Item, matches: MatchResult[], ownerId: number,
  onResult: (id: string, result: PhotoSimilarity) => void, signal: AbortSignal): Promise<void> {
  checkAbort(signal);
  const candidates = matches.slice(0, 20);
  if (!candidates.length) return;
  const targetUrl = await freshTargetPhotoUrl(target, ownerId, signal);
  if (!targetUrl) {
    for (const match of candidates) onResult(match.id, { status: 'NO_IMAGE' });
    return;
  }
  const targetFile = await photoFile(targetUrl, signal);
  // Lazy import: no model/worker work until an explicit click and a real registered photo exist.
  const { analyzeAppearance, releaseAppearanceResources } = await import('../features/imageAnalysis/appearance');
  try {
    for (const match of candidates) {
      checkAbort(signal);
      try {
        const candidateUrl = await candidatePhotoUrl(match, signal);
        if (!candidateUrl) { onResult(match.id, { status: 'NO_IMAGE' }); continue; }
        const file = await photoFile(candidateUrl, signal);
        // Category was already compared in stage one. Avoid loading CLIP again for each recommendation.
        const crop = { x: 0, y: 0, width: 1, height: 1 };
        const result = await analyzeAppearance(targetFile, file, [crop, crop], ['other', 'other'], undefined, signal);
        checkAbort(signal);
        if (![result.visualPercent, result.colorPercent].every(n => Number.isFinite(n) && n >= 0 && n <= 100)) throw new Error('잘못된 비교 결과');
        onResult(match.id, { status: 'READY', appearancePercent: result.visualPercent, colorPercent: result.colorPercent });
      } catch (error) {
        if (signal.aborted) throw error;
        onResult(match.id, { status: 'UNAVAILABLE' });
      }
    }
  } finally {
    // This PC shares RAM with MySQL, Spring Boot and Vite; keep no idle model worker after the run.
    releaseAppearanceResources();
  }
}
