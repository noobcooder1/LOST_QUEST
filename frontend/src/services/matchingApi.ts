import { defaultItemImage } from '../data/seed';
import { ApiClientError, apiRequest, getApiBaseUrl, type ApiRequestOptions } from './apiClient';
import { loadAuthSession } from './authSession';
import { resolveServerImageUrl, toServerRouteId } from './itemApi';
import { parsePoliceRouteId, safePoliceImageUrl, toPoliceRouteId } from './publicItemApi';

/**
 * Found-item recommendations for one of the signed-in user's lost items
 * (GET /api/lost-items/{id}/matches). Scores are the server's rule-based metadata scores (category,
 * region, color, date); the browser never computes or adjusts them and never calls the 경찰청 API itself.
 */
export type MatchSource = 'LOST_QUEST' | 'POLICE';
export type MatchSourceStatus = 'OK' | 'PARTIAL' | 'UNAVAILABLE' | 'SKIPPED';
export type ScoreResult = 'MATCH' | 'PARTIAL' | 'MISMATCH' | 'UNKNOWN';

export interface ScoreComponent {
  key: string;
  points: number;
  maxPoints: number;
  result: ScoreResult;
  note: string | null;
}

export interface MatchResult {
  /** Stable id from the server: `LOST_QUEST:12` or `POLICE:F2026…-1`. */
  id: string;
  source: MatchSource;
  /** Detail page route: `api-found-12` or `police-found-F2026…-1`. */
  routeId: string;
  title: string;
  category: string;
  color: string;
  foundDate: string;
  /** LOST QUEST region, or the 경찰청 region that was searched; empty when unknown. */
  region: string;
  /** LOST QUEST: found location. 경찰청: storage place. */
  place: string;
  /** Validated image URL, or '' (then the category image is shown). */
  image: string;
  fallbackImage: string;
  score: number;
  maxScore: number;
  breakdown: ScoreComponent[];
  reasons: string[];
}

export interface SourceStatus {
  source: MatchSource;
  status: MatchSourceStatus;
  candidateCount: number;
  message: string | null;
}

export interface ItemMatches {
  lostItemId: number;
  maxScore: number;
  minScore: number;
  matches: MatchResult[];
  sources: SourceStatus[];
}

/** Server limits (MatchingService): default 10, at most 20. */
export const DEFAULT_MATCH_LIMIT = 10;
export const MAX_MATCH_LIMIT = 20;
/** The server queries 경찰청 in parallel; each upstream call may take up to its 20s read timeout. */
const MATCH_TIMEOUT_MS = 45_000;

type RequestConfig = Pick<ApiRequestOptions, 'baseUrl' | 'timeoutMs'> & { accessToken?: string | null; limit?: number };

const invalidResponse = () => new ApiClientError('INVALID_RESPONSE', '예상한 매칭 추천 응답이 아니에요.');
const isText = (value: unknown): value is string => typeof value === 'string';
const text = (value: unknown): string => (isText(value) ? value.trim() : '');
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const SOURCES: MatchSource[] = ['LOST_QUEST', 'POLICE'];
const STATUSES: MatchSourceStatus[] = ['OK', 'PARTIAL', 'UNAVAILABLE', 'SKIPPED'];
const RESULTS: ScoreResult[] = ['MATCH', 'PARTIAL', 'MISMATCH', 'UNKNOWN'];

function parseComponent(value: unknown): ScoreComponent {
  if (!value || typeof value !== 'object') throw invalidResponse();
  const raw = value as Record<string, unknown>;
  if (!isText(raw.key) || !isCount(raw.points) || !isCount(raw.maxPoints) || raw.points > raw.maxPoints ||
      !RESULTS.includes(raw.result as ScoreResult)) throw invalidResponse();
  return { key: raw.key, points: raw.points, maxPoints: raw.maxPoints, result: raw.result as ScoreResult, note: isText(raw.note) ? raw.note : null };
}

function routeIdOf(raw: Record<string, unknown>): string {
  if (raw.source === 'LOST_QUEST') {
    if (typeof raw.foundItemId !== 'number' || !Number.isSafeInteger(raw.foundItemId) || raw.foundItemId <= 0) throw invalidResponse();
    return toServerRouteId('found', raw.foundItemId);
  }
  if (!isText(raw.atcId) || typeof raw.fdSn !== 'number') throw invalidResponse();
  const routeId = toPoliceRouteId('found', raw.atcId, raw.fdSn);
  if (!parsePoliceRouteId(routeId)) throw invalidResponse();
  return routeId;
}

export function parseMatch(value: unknown, baseUrl = getApiBaseUrl()): MatchResult {
  if (!value || typeof value !== 'object') throw invalidResponse();
  const raw = value as Record<string, unknown>;
  if (!isText(raw.id) || !SOURCES.includes(raw.source as MatchSource) || !isCount(raw.score) || !isCount(raw.maxScore) ||
      raw.score > raw.maxScore || !Array.isArray(raw.scoreBreakdown) || !Array.isArray(raw.reasons) ||
      !raw.reasons.every(isText)) throw invalidResponse();
  const source = raw.source as MatchSource;
  const breakdown = raw.scoreBreakdown.map(parseComponent);
  // The score shown must be exactly what the breakdown adds up to.
  if (breakdown.reduce((sum, component) => sum + component.points, 0) !== raw.score) throw invalidResponse();
  const title = text(raw.title) || '물품명 정보 없음';
  const category = text(raw.category);
  const image = source === 'LOST_QUEST' ? resolveServerImageUrl(raw.imageUrl, baseUrl) : safePoliceImageUrl(raw.imageUrl);
  return {
    id: raw.id,
    source,
    routeId: routeIdOf(raw),
    title,
    category,
    color: text(raw.color),
    foundDate: text(raw.foundDate),
    region: text(raw.region),
    place: source === 'POLICE' ? text(raw.storagePlace) || text(raw.location) : text(raw.location),
    image: image ?? '',
    fallbackImage: defaultItemImage(category, title),
    score: raw.score,
    maxScore: raw.maxScore,
    breakdown,
    reasons: raw.reasons.map((reason) => reason.trim()).filter(Boolean),
  };
}

function parseSource(value: unknown): SourceStatus {
  if (!value || typeof value !== 'object') throw invalidResponse();
  const raw = value as Record<string, unknown>;
  if (!SOURCES.includes(raw.source as MatchSource) || !STATUSES.includes(raw.status as MatchSourceStatus) || !isCount(raw.candidateCount)) {
    throw invalidResponse();
  }
  return { source: raw.source as MatchSource, status: raw.status as MatchSourceStatus, candidateCount: raw.candidateCount, message: isText(raw.message) ? raw.message : null };
}

export function parseItemMatches(value: unknown, baseUrl = getApiBaseUrl()): ItemMatches {
  if (!value || typeof value !== 'object') throw invalidResponse();
  const raw = value as Record<string, unknown>;
  const lostItem = raw.lostItem as Record<string, unknown> | null;
  if (!lostItem || typeof lostItem !== 'object' || typeof lostItem.id !== 'number' || !isCount(raw.maxScore) || !isCount(raw.minScore) ||
      !Array.isArray(raw.matches) || !Array.isArray(raw.sources)) throw invalidResponse();
  return {
    lostItemId: lostItem.id,
    maxScore: raw.maxScore,
    minScore: raw.minScore,
    matches: raw.matches.map((match) => parseMatch(match, baseUrl)),
    sources: raw.sources.map(parseSource),
  };
}

/** Sends the signed-in user's token; the server decides ownership from it (no user id is sent). */
export async function getItemMatches(lostServerId: number, config: RequestConfig = {}): Promise<ItemMatches> {
  const { accessToken = loadAuthSession()?.accessToken ?? null, limit = DEFAULT_MATCH_LIMIT, ...requestConfig } = config;
  if (!Number.isSafeInteger(lostServerId) || lostServerId <= 0) throw new ApiClientError('INVALID_CONFIG', '분실물 번호를 확인해 주세요.');
  const boundedLimit = Math.min(Math.max(Math.trunc(limit) || DEFAULT_MATCH_LIMIT, 1), MAX_MATCH_LIMIT);
  const body = await apiRequest(`/api/lost-items/${lostServerId}/matches?limit=${boundedLimit}`, {
    timeoutMs: MATCH_TIMEOUT_MS, ...requestConfig, accessToken,
  });
  return parseItemMatches(body, requestConfig.baseUrl);
}

export function describeMatchError(error: unknown): string {
  if (!(error instanceof ApiClientError)) return '매칭 추천을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
  if (error.status === 401) return '로그인이 만료되었어요. 다시 로그인한 뒤 확인해 주세요.';
  if (error.status === 403) return '본인이 등록한 분실물의 추천만 볼 수 있어요.';
  if (error.status === 404) return '분실물을 찾을 수 없어요. 삭제되었거나 주소가 잘못되었을 수 있어요.';
  return error.message;
}

export const SOURCE_LABELS: Record<MatchSource, string> = { LOST_QUEST: 'LOST QUEST 등록', POLICE: '경찰청 공공데이터' };
