import { ApiClientError, apiRequest, type ApiRequestOptions } from './apiClient';
import { loadAuthSession } from './authSession';
import { toServerRouteId } from './itemApi';
import type { MatchSource, MatchSourceStatus } from './matchingApi';
import { parsePoliceRouteId, toPoliceRouteId } from './publicItemApi';

/**
 * Match notifications of the signed-in user (/api/notifications). The server decides whose notifications these
 * are from the access token; no user id is ever sent. There is no local/demo fallback: failures are shown as errors.
 */
export interface MatchNotification {
  id: number;
  lostItemId: number;
  lostItemTitle: string;
  source: MatchSource;
  /** Detail route of the matched found item (`api-found-12` / `police-found-F…-1`), or null if the ids are unusable. */
  foundRouteId: string | null;
  /** Matching page of the lost item. */
  matchesPath: string;
  foundTitle: string;
  foundDate: string;
  score: number;
  maxScore: number;
  createdAt: string;
  read: boolean;
}

export interface NotificationList {
  notifications: MatchNotification[];
  unreadCount: number;
}

export interface RefreshResult {
  checkedLostItems: number;
  throttledLostItems: number;
  created: number;
  unreadCount: number;
  sources: { source: MatchSource; status: MatchSourceStatus; message: string | null }[];
}

export const DEFAULT_NOTIFICATION_LIMIT = 30;
/** Refresh may call the 경찰청 API for several lost items. */
const REFRESH_TIMEOUT_MS = 90_000;

type RequestConfig = Pick<ApiRequestOptions, 'baseUrl' | 'timeoutMs'> & { accessToken?: string | null };

const invalidResponse = () => new ApiClientError('INVALID_RESPONSE', '예상한 알림 응답이 아니에요.');
const isText = (value: unknown): value is string => typeof value === 'string';
const isId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const SOURCES: MatchSource[] = ['LOST_QUEST', 'POLICE'];
const STATUSES: MatchSourceStatus[] = ['OK', 'PARTIAL', 'UNAVAILABLE', 'SKIPPED'];

function foundRoute(raw: Record<string, unknown>): string | null {
  if (raw.source === 'LOST_QUEST') return isId(raw.foundItemId) ? toServerRouteId('found', raw.foundItemId) : null;
  if (!isText(raw.atcId) || !isId(raw.fdSn)) return null;
  const route = toPoliceRouteId('found', raw.atcId, raw.fdSn);
  return parsePoliceRouteId(route) ? route : null;
}

export function parseNotification(value: unknown): MatchNotification {
  if (!value || typeof value !== 'object') throw invalidResponse();
  const raw = value as Record<string, unknown>;
  if (!isId(raw.id) || !isId(raw.lostItemId) || !SOURCES.includes(raw.source as MatchSource) || !isCount(raw.score) ||
      !isCount(raw.maxScore) || raw.score > raw.maxScore || !isText(raw.createdAt) || typeof raw.read !== 'boolean') {
    throw invalidResponse();
  }
  return {
    id: raw.id,
    lostItemId: raw.lostItemId,
    lostItemTitle: isText(raw.lostItemTitle) && raw.lostItemTitle.trim() ? raw.lostItemTitle.trim() : '내 분실물',
    source: raw.source as MatchSource,
    foundRouteId: foundRoute(raw),
    matchesPath: `/matches?item=${toServerRouteId('lost', raw.lostItemId)}`,
    foundTitle: isText(raw.foundTitle) && raw.foundTitle.trim() ? raw.foundTitle.trim() : '물품명 정보 없음',
    foundDate: isText(raw.foundDate) ? raw.foundDate : '',
    score: raw.score,
    maxScore: raw.maxScore,
    createdAt: raw.createdAt,
    read: raw.read,
  };
}

function unreadOf(value: unknown): number {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (!isCount(raw.unreadCount)) throw invalidResponse();
  return raw.unreadCount;
}

const tokenOf = (config: RequestConfig) => config.accessToken ?? loadAuthSession()?.accessToken ?? null;

export async function listNotifications(config: RequestConfig & { limit?: number } = {}): Promise<NotificationList> {
  const { limit = DEFAULT_NOTIFICATION_LIMIT, accessToken: _ignored, ...request } = config;
  const bounded = Math.min(Math.max(Math.trunc(limit) || DEFAULT_NOTIFICATION_LIMIT, 1), 100);
  const body = await apiRequest(`/api/notifications?limit=${bounded}`, { ...request, accessToken: tokenOf(config) });
  const raw = body && typeof body === 'object' ? body as Record<string, unknown> : null;
  if (!raw || !Array.isArray(raw.notifications)) throw invalidResponse();
  return { notifications: raw.notifications.map(parseNotification), unreadCount: unreadOf(raw) };
}

export async function getUnreadCount(config: RequestConfig = {}): Promise<number> {
  const { accessToken: _ignored, ...request } = config;
  return unreadOf(await apiRequest('/api/notifications/unread-count', { ...request, accessToken: tokenOf(config) }));
}

export async function markNotificationRead(id: number, config: RequestConfig = {}): Promise<MatchNotification> {
  if (!isId(id)) throw new ApiClientError('INVALID_CONFIG', '알림 번호를 확인해 주세요.');
  const { accessToken: _ignored, ...request } = config;
  return parseNotification(await apiRequest(`/api/notifications/${id}/read`, { ...request, method: 'POST', accessToken: tokenOf(config) }));
}

export async function markAllNotificationsRead(config: RequestConfig = {}): Promise<number> {
  const { accessToken: _ignored, ...request } = config;
  return unreadOf(await apiRequest('/api/notifications/read-all', { ...request, method: 'POST', accessToken: tokenOf(config) }));
}

/** Asks the server to re-match the user's recent lost items; the server throttles this per lost item. */
export async function refreshMatchNotifications(config: RequestConfig = {}): Promise<RefreshResult> {
  const { accessToken: _ignored, ...request } = config;
  const body = await apiRequest('/api/notifications/refresh', {
    timeoutMs: REFRESH_TIMEOUT_MS, ...request, method: 'POST', accessToken: tokenOf(config),
  });
  const raw = body && typeof body === 'object' ? body as Record<string, unknown> : null;
  if (!raw || !isCount(raw.checkedLostItems) || !isCount(raw.throttledLostItems) || !isCount(raw.created) || !Array.isArray(raw.sources)) {
    throw invalidResponse();
  }
  const sources = raw.sources.map((entry) => {
    const source = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    if (!SOURCES.includes(source.source as MatchSource) || !STATUSES.includes(source.status as MatchSourceStatus)) throw invalidResponse();
    return { source: source.source as MatchSource, status: source.status as MatchSourceStatus, message: isText(source.message) ? source.message : null };
  });
  return { checkedLostItems: raw.checkedLostItems, throttledLostItems: raw.throttledLostItems, created: raw.created, unreadCount: unreadOf(raw), sources };
}

/** Korean particle after the lost item title: ‘검정 지갑’과 (final consonant) / ‘노트북 파우치’와 (none). */
function withParticle(title: string): string {
  const last = title.charCodeAt(title.length - 1);
  const hangul = last >= 0xac00 && last <= 0xd7a3;
  return `‘${title}’${hangul && (last - 0xac00) % 28 === 0 ? '와' : '과'}`;
}

export function notificationMessage(notification: MatchNotification): string {
  return `등록한 ${withParticle(notification.lostItemTitle)} 유사한 습득물이 발견되었습니다.`;
}

export function notificationMeta(notification: MatchNotification): string {
  return `매칭도 ${notification.score}점 · ${notification.source === 'POLICE' ? '경찰청' : 'LOST QUEST'}`;
}

export function describeNotificationError(error: unknown): string {
  if (!(error instanceof ApiClientError)) return '알림을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
  if (error.status === 401) return '로그인이 만료되었어요. 다시 로그인해 주세요.';
  if (error.status === 404) return '알림을 찾을 수 없어요. 이미 삭제되었거나 다른 계정의 알림일 수 있어요.';
  return error.message;
}
