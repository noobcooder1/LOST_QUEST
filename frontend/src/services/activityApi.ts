import { ApiClientError, apiRequest } from './apiClient';
import { loadAuthSession } from './authSession';
import { fromServerItem, parseServerRouteId } from './itemApi';
import type { AppData, Item, ReturnRequest, ReturnStatus } from '../types';

const statuses: ReturnStatus[] = ['pending', 'owner_verified', 'approved', 'qr_verified', 'completed', 'rejected'];
const invalid = () => new ApiClientError('INVALID_RESPONSE', '반환 기록을 읽지 못했어요. 서버 응답을 확인해 주세요.');
const options = () => ({ accessToken: loadAuthSession()?.accessToken });
export function parseReturn(value: unknown): { request: ReturnRequest; items: Item[] } {
  if (!value || typeof value !== 'object') throw invalid();
  const r = value as Record<string, unknown>;
  if (typeof r.id !== 'number' || !Number.isSafeInteger(r.id) || r.id < 1 ||
      typeof r.requesterId !== 'number' || typeof r.finderId !== 'number' ||
      typeof r.status !== 'string' || !statuses.includes(r.status.toLowerCase() as ReturnStatus) ||
      typeof r.createdAt !== 'string' || typeof r.updatedAt !== 'string') throw invalid();
  const found = fromServerItem('found', r.foundItem);
  const lost = r.lostItem ? fromServerItem('lost', r.lostItem) : null;
  return {
    request: { id: String(r.id), itemId: found.id, ...(lost ? { lostItemId: lost.id } : {}),
      status: r.status.toLowerCase() as ReturnStatus, createdAt: r.createdAt, updatedAt: r.updatedAt,
      requesterId: r.requesterId, finderId: r.finderId,
      ...(typeof r.qrToken === 'string' ? { qrToken: r.qrToken } : {}),
      ...(typeof r.qrExpiresAt === 'string' ? { qrExpiresAt: r.qrExpiresAt } : {}) },
    items: [found, ...(lost ? [lost] : [])],
  };
}
export async function loadActivity(): Promise<Omit<AppData, 'items'> & { relatedItems: Item[] }> {
  const body = await apiRequest('/api/me/activity', options());
  if (!body || typeof body !== 'object') throw invalid();
  const r = body as Record<string, unknown>;
  const p = r.profile as Record<string, unknown> | null;
  if (!p || typeof p.name !== 'string' || ![p.xp, p.registeredCount, p.returnedCount].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0) ||
      !Array.isArray(r.requests) || !Array.isArray(r.notifications)) throw invalid();
  const parsed = r.requests.map(parseReturn);
  const notifications = r.notifications.map(value => {
    const n = value as Record<string, unknown> | null;
    if (!n || typeof n.id !== 'number' || typeof n.title !== 'string' || typeof n.message !== 'string' ||
        typeof n.createdAt !== 'string' || typeof n.read !== 'boolean') throw invalid();
    return { id: String(n.id), title: n.title, message: n.message, createdAt: n.createdAt, read: n.read };
  });
  return { profile: { name: p.name, xp: p.xp as number, registeredCount: p.registeredCount as number, returnedCount: p.returnedCount as number },
    requests: parsed.map(p => p.request), notifications, relatedItems: parsed.flatMap(p => p.items) };
}
export async function createReturn(itemId: string, lostItemId?: string) {
  const found = parseServerRouteId(itemId);
  const lost = parseServerRouteId(lostItemId);
  if (!found || found.type !== 'found' || (lostItemId && (!lost || lost.type !== 'lost')))
    throw new ApiClientError('INVALID_INPUT', 'LOST QUEST에 등록된 습득물과 분실물만 연결할 수 있어요.');
  return parseReturn(await apiRequest('/api/returns', { ...options(), method: 'POST',
    body: { foundItemId: found.serverId, ...(lost ? { lostItemId: lost.serverId } : {}) } })).request;
}
export async function returnAction(id: string, action: 'verify-owner' | 'approve' | 'verify-qr' | 'complete' | 'reject' | 'renew-qr', body?: unknown) {
  if (!/^[1-9]\d*$/.test(id)) throw new ApiClientError('INVALID_INPUT', '반환 요청 번호를 확인해 주세요.');
  return parseReturn(await apiRequest(`/api/returns/${id}/${action}`, { ...options(), method: 'POST', body })).request;
}
export async function markActivityRead() {
  await apiRequest('/api/me/activity/read-all', { ...options(), method: 'POST' });
}
export async function setupOwnership(id: number, question: string, answer: string): Promise<Item> {
  return fromServerItem('found', await apiRequest(`/api/found-items/${id}/ownership`, { ...options(), method: 'POST', body: { question, answer } }));
}
export function describeActivityError(error: unknown): string {
  if (error instanceof ApiClientError) return error.fieldErrors.length
    ? error.fieldErrors.map(e => e.message).join('\n') : error.message;
  return '기록을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
