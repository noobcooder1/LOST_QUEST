import { ApiClientError, apiRequest } from './apiClient';
import { loadAuthSession } from './authSession';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, parseServerRouteId } from './itemApi';
import { isTimestamp } from './dateTime';

export const COMMUNITY_CATEGORIES = [
  { value: 'chat', label: '자유·잡담' },
  { value: 'info', label: '정보공유' },
  { value: 'question', label: '질문' },
  { value: 'story', label: '후기' },
] as const;
export type DiscussionCategory = typeof COMMUNITY_CATEGORIES[number]['value'];
export interface DiscussionPost {
  id: number; category: DiscussionCategory; title: string; content: string;
  authorNickname: string; createdAt: string; imageUrl: string | null;
  linkedItem: { id: number; type: 'lost' | 'found'; title: string } | null;
}
export interface CreateDiscussionInput {
  category: DiscussionCategory; title: string; content: string;
  linkedItemType?: 'lost' | 'found'; linkedItemId?: number;
}
export interface DiscussionFilters {
  category?: DiscussionCategory | ''; q?: string; from?: string; to?: string; page?: number;
}
export function isDiscussionCategory(value: unknown): value is DiscussionCategory {
  return COMMUNITY_CATEGORIES.some(category => category.value === value);
}
export function isDiscussionDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '0001-01-01'
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

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

/** Discussion posts have their own collection; item registrations never enter this list. */
export function parseDiscussionPost(value: unknown): DiscussionPost {
  const r = object(value);
  if (!positive(r.id) || !isDiscussionCategory(r.category) || typeof r.title !== 'string'
    || typeof r.content !== 'string' || typeof r.authorNickname !== 'string' || !isTimestamp(r.createdAt)
    || (r.imageUrl !== null && (typeof r.imageUrl !== 'string'
      || !/^\/api\/images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(r.imageUrl)))) throw invalid();
  let linkedItem: DiscussionPost['linkedItem'] = null;
  if (r.linkedItem !== null) {
    const link = object(r.linkedItem);
    if (!positive(link.id) || !['lost', 'found'].includes(String(link.type)) || typeof link.title !== 'string') throw invalid();
    linkedItem = { id: link.id, type: link.type as 'lost' | 'found', title: link.title };
  }
  return { id: r.id, category: r.category, title: r.title, content: r.content,
    authorNickname: r.authorNickname, createdAt: r.createdAt, imageUrl: r.imageUrl as string | null, linkedItem };
}
export async function listDiscussionPosts(filters: DiscussionFilters = {}): Promise<CommunityPage<DiscussionPost>> {
  const params = new URLSearchParams();
  if (filters.category) {
    if (!isDiscussionCategory(filters.category)) throw new ApiClientError('INVALID_INPUT', '카테고리를 확인해 주세요.');
    params.set('category', filters.category);
  }
  const q = filters.q?.trim() ?? '';
  if (q.length > 100) throw new ApiClientError('INVALID_INPUT', '검색어는 100자 이하로 입력해 주세요.');
  if (q) params.set('q', q);
  for (const key of ['from', 'to'] as const) {
    const value = filters[key];
    if (value) {
      if (!isDiscussionDate(value)) throw new ApiClientError('INVALID_INPUT', '작성 기간을 확인해 주세요.');
      params.set(key, value);
    }
  }
  if (filters.from && filters.to && filters.from > filters.to) throw new ApiClientError('INVALID_INPUT', '시작일은 종료일보다 늦을 수 없어요.');
  params.set('page', String(pageNumber(filters.page ?? 0)));
  return parsePage(await apiRequest(`/api/community/posts?${params}`), parseDiscussionPost);
}
export async function getDiscussionPost(id: number): Promise<DiscussionPost> {
  return parseDiscussionPost(await apiRequest(`/api/community/posts/${recordId(id)}`));
}
export async function createDiscussionPost(input: CreateDiscussionInput, image: File | null = null): Promise<DiscussionPost> {
  const auth = options();
  if (!isDiscussionCategory(input.category) || !input.title.trim() || input.title.trim().length > 120
    || !input.content.trim() || input.content.trim().length > 3000) {
    throw new ApiClientError('INVALID_INPUT', '카테고리, 제목(120자 이하), 본문(3,000자 이하)을 확인해 주세요.');
  }
  const hasLink = input.linkedItemType !== undefined || input.linkedItemId !== undefined;
  if (hasLink && (!['lost', 'found'].includes(input.linkedItemType ?? '') || !positive(input.linkedItemId))) {
    throw new ApiClientError('INVALID_INPUT', '연결할 물품을 다시 선택해 주세요.');
  }
  if (image && (!ALLOWED_IMAGE_TYPES.includes(image.type) || image.size <= 0 || image.size > MAX_IMAGE_BYTES)) {
    throw new ApiClientError('INVALID_INPUT', '사진은 10MB 이하의 JPG, PNG, WebP 파일을 선택해 주세요.');
  }
  const body = { category: input.category, title: input.title.trim(), content: input.content.trim(),
    ...(hasLink ? { linkedItemType: input.linkedItemType, linkedItemId: input.linkedItemId } : {}) };
  if (!image) return parseDiscussionPost(await apiRequest('/api/community/posts', { ...auth, method: 'POST', body }));
  const form = new FormData();
  form.append('post', new Blob([JSON.stringify(body)], { type: 'application/json' }));
  form.append('image', image, image.name);
  return parseDiscussionPost(await apiRequest('/api/community/posts', { ...auth, method: 'POST', body: form, timeoutMs: 60_000 }));
}
