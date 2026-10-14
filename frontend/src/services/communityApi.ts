import { ApiClientError, apiRequest } from './apiClient';
import { loadAuthSession } from './authSession';
import { parseServerRouteId } from './itemApi';

export interface CommunityQuestion {
  id: number; itemType: 'lost' | 'found'; itemId: number; itemTitle: string;
  question: string; answer: string | null; createdAt: string; answeredAt: string | null; canAnswer: boolean;
}
export interface CommunityReport {
  id: number; itemType: 'lost' | 'found'; itemId: number; itemTitle: string;
  reason: string; createdAt: string; hiddenAt: string | null;
}
export interface CommunityPage<T> { items: T[]; page: number; hasNext: boolean }
const invalid = () => new ApiClientError('INVALID_RESPONSE', '커뮤니티 응답을 읽지 못했어요. 다시 시도해 주세요.');
function options() {
  const session = loadAuthSession();
  if (!session) throw new ApiClientError('HTTP_ERROR', '로그인 후 이용해 주세요.', 401);
  return { accessToken: session.accessToken };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
const timestamp = (s: unknown): s is string => typeof s === 'string' && Number.isFinite(Date.parse(s));
const optionalDate = (s: unknown): s is string | null => s === null || timestamp(s);
function base(value: unknown) {
  const r = object(value);
  if (!positive(r.id) || !positive(r.itemId) || !['lost', 'found'].includes(String(r.itemType)) || typeof r.itemTitle !== 'string' || !timestamp(r.createdAt)) throw invalid();
  return r;
}
export function parseCommunityQuestion(value: unknown): CommunityQuestion {
  const r = base(value);
  if (typeof r.question !== 'string' || (r.answer !== null && typeof r.answer !== 'string') || !optionalDate(r.answeredAt) || typeof r.canAnswer !== 'boolean') throw invalid();
  return r as unknown as CommunityQuestion;
}
function parseReport(value: unknown): CommunityReport {
  const r = base(value);
  if (typeof r.reason !== 'string' || !optionalDate(r.hiddenAt)) throw invalid();
  return r as unknown as CommunityReport;
}
function parsePage<T>(value: unknown, parse: (row: unknown) => T): CommunityPage<T> {
  const r = object(value);
  if (!Array.isArray(r.items) || r.items.length > 20 || !Number.isSafeInteger(r.page) || (r.page as number) < 0 || typeof r.hasNext !== 'boolean') throw invalid();
  return { items: r.items.map(parse), page: r.page as number, hasNext: r.hasNext };
}
function postPath(itemId: string) {
  const ref = parseServerRouteId(itemId);
  if (!ref) throw new ApiClientError('INVALID_INPUT', '자체 등록 게시글에서만 이용할 수 있어요.');
  return `/api/community/${ref.type}/${ref.serverId}`;
}
function pageNumber(page: number) {
  if (!Number.isSafeInteger(page) || page < 0 || page > 10000) throw new ApiClientError('INVALID_INPUT', '페이지 번호를 확인해 주세요.');
  return page;
}
function recordId(id: number) {
  if (!positive(id)) throw new ApiClientError('INVALID_INPUT', '질문·신고 번호를 확인해 주세요.');
  return id;
}
export async function listCommunityQuestions(itemId?: string, page = 0) {
  const path = itemId ? `${postPath(itemId)}/questions` : '/api/community/questions';
  return parsePage(await apiRequest(`${path}?page=${pageNumber(page)}`, options()), parseCommunityQuestion);
}
export async function askCommunityQuestion(itemId: string, message: string) {
  return parseCommunityQuestion(await apiRequest(`${postPath(itemId)}/questions`, { ...options(), method: 'POST', body: { message } }));
}
export async function answerCommunityQuestion(id: number, message: string) {
  return parseCommunityQuestion(await apiRequest(`/api/community/questions/${recordId(id)}/answer`, { ...options(), method: 'POST', body: { message } }));
}
export async function reportCommunityPost(itemId: string, message: string) {
  await apiRequest(`${postPath(itemId)}/reports`, { ...options(), method: 'POST', body: { message } });
}
export async function listCommunityReports(page = 0) {
  return parsePage(await apiRequest(`/api/community/reports?page=${pageNumber(page)}`, options()), parseReport);
}
export async function hideReportedPost(id: number) {
  return parseReport(await apiRequest(`/api/community/reports/${recordId(id)}/hide`, { ...options(), method: 'POST' }));
}
