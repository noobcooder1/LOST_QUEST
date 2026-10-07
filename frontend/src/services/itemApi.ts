import { defaultItemImage } from '../data/seed';
import type { Item, ItemType } from '../types';
import { ApiClientError, apiRequest, getApiBaseUrl, type ApiRequestOptions } from './apiClient';
import { loadAuthSession } from './authSession';

/**
 * Community items registered through LOST QUEST live in Spring Boot + MySQL. Public items are
 * still seed data. Server items get route ids like `api-lost-12` so lost/found ids never collide
 * with each other or with seed ids such as `found-wallet-1`.
 */
const SERVER_ID = /^api-(lost|found)-([1-9]\d{0,15})$/;
/** The only image URL shape the server stores: a relative path to a server-generated file name. */
const SERVER_IMAGE = /^\/api\/images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/** Same limits as the server (ImageService): one JPEG/PNG/WebP file up to 10MB. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const UPLOAD_TIMEOUT_MS = 60_000;

type RequestConfig = Pick<ApiRequestOptions, 'baseUrl' | 'timeoutMs'>;

export interface CreateItemInput {
  title: string;
  category: string;
  color: string;
  description: string;
  date: string;
  region: string;
  location: string;
}

export function toServerRouteId(type: ItemType, serverId: number): string {
  return `api-${type}-${serverId}`;
}

export function parseServerRouteId(routeId: string | undefined): { type: ItemType; serverId: number } | null {
  const match = routeId ? SERVER_ID.exec(routeId) : null;
  if (!match) return null;
  const serverId = Number(match[2]);
  return Number.isSafeInteger(serverId) ? { type: match[1] as ItemType, serverId } : null;
}

/**
 * Joins a stored server image path with the API base URL. Anything else (absolute URLs, data URLs,
 * unexpected paths) is rejected so the UI falls back to the category image.
 */
export function resolveServerImageUrl(value: unknown, baseUrl = getApiBaseUrl()): string | null {
  if (typeof value !== 'string' || !SERVER_IMAGE.test(value)) return null;
  const base = baseUrl.trim().replace(/\/+$/, '');
  return /^https?:\/\/[^/?#]+$/.test(base) ? `${base}${value}` : null;
}

const invalidResponse = () => new ApiClientError('INVALID_RESPONSE', '예상한 물품 응답이 아니에요. 서버 주소를 확인해 주세요.');
const isText = (value: unknown): value is string => typeof value === 'string';
const isDate = (value: unknown): value is string => isText(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Converts a LostItemResponse/FoundItemResponse into the UI's Item model. */
export function fromServerItem(type: ItemType, value: unknown, baseUrl = getApiBaseUrl()): Item {
  if (!value || typeof value !== 'object') throw invalidResponse();
  const raw = value as Record<string, unknown>;
  const date = type === 'lost' ? raw.lostDate : raw.foundDate;
  const openStatus = type === 'lost' ? 'LOST' : 'STORED';
  if (typeof raw.id !== 'number' || !Number.isSafeInteger(raw.id) || raw.id <= 0 || typeof raw.userId !== 'number' ||
      !isText(raw.title) || !isText(raw.category) || !isText(raw.location) || !isDate(date) || !isText(raw.status) ||
      (raw.color != null && !isText(raw.color)) || (raw.description != null && !isText(raw.description)) ||
      (raw.region != null && !isText(raw.region))) throw invalidResponse();
  return {
    id: toServerRouteId(type, raw.id),
    title: raw.title,
    type,
    category: raw.category,
    color: isText(raw.color) ? raw.color : '',
    date,
    // Rows created before the region column existed have no region; they show the location only.
    region: isText(raw.region) ? raw.region : '',
    location: raw.location,
    description: isText(raw.description) ? raw.description : '',
    // Rows without an uploaded image (imageUrl NULL) keep the category illustration.
    image: resolveServerImageUrl(raw.imageUrl, baseUrl) ?? defaultItemImage(raw.category, raw.title),
    source: 'community',
    status: raw.status === openStatus ? 'open' : 'returned',
    createdBy: 'server',
    serverId: raw.id,
    ownerId: raw.userId,
  };
}

function parseList(type: ItemType, value: unknown, baseUrl?: string): Item[] {
  if (!Array.isArray(value)) throw invalidResponse();
  return value.map((entry) => fromServerItem(type, entry, baseUrl));
}

const collectionPath = (type: ItemType) => (type === 'lost' ? '/api/lost-items' : '/api/found-items');

export async function listServerItems(type: ItemType, config: RequestConfig = {}): Promise<Item[]> {
  return parseList(type, await apiRequest(collectionPath(type), config), config.baseUrl);
}

/** Lost and found lists together; public GET, so no token is sent. */
export async function listAllServerItems(config: RequestConfig = {}): Promise<Item[]> {
  const [lost, found] = await Promise.all([listServerItems('lost', config), listServerItems('found', config)]);
  return [...lost, ...found];
}

export async function getServerItem(type: ItemType, serverId: number, config: RequestConfig = {}): Promise<Item> {
  return fromServerItem(type, await apiRequest(`${collectionPath(type)}/${serverId}`, config), config.baseUrl);
}

export interface MyItems {
  lostItems: Item[];
  foundItems: Item[];
}

/**
 * The signed-in user's own registrations (GET /api/me/items). The server decides whose items these are from the
 * access token; no user id is sent. Each list keeps the server's newest-first order. There is no local/demo fallback:
 * failures are thrown for the caller to show.
 */
export async function listMyItems(config: RequestConfig & { accessToken?: string | null } = {}): Promise<MyItems> {
  const { accessToken = loadAuthSession()?.accessToken ?? null, ...requestConfig } = config;
  const body = await apiRequest('/api/me/items', { ...requestConfig, accessToken });
  const raw = body && typeof body === 'object' ? body as Record<string, unknown> : null;
  if (!raw || !Array.isArray(raw.lostItems) || !Array.isArray(raw.foundItems)) throw invalidResponse();
  return { lostItems: parseList('lost', raw.lostItems, requestConfig.baseUrl), foundItems: parseList('found', raw.foundItems, requestConfig.baseUrl) };
}

/** Korean message when the user's own item list cannot be loaded. */
export function describeMyItemsError(error: unknown): string {
  if (!(error instanceof ApiClientError)) return '등록 내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
  if (error.status === 401) return '로그인이 만료되었어요. 다시 로그인해 주세요.';
  return error.message;
}

/**
 * Registers an item as the signed-in user. Only item fields are sent: the server takes the
 * author from the JWT and sets the initial status itself. With an image, the same fields go in a
 * multipart "item" part next to the "image" file; without one, the original JSON request is used.
 */
export async function createServerItem(type: ItemType, input: CreateItemInput,
  config: RequestConfig & { accessToken?: string | null; image?: Blob | null } = {}): Promise<Item> {
  const { accessToken = loadAuthSession()?.accessToken ?? null, image = null, ...requestConfig } = config;
  const body = {
    title: input.title.trim(),
    category: input.category,
    color: input.color.trim(),
    description: input.description.trim(),
    [type === 'lost' ? 'lostDate' : 'foundDate']: input.date,
    region: input.region,
    location: input.location.trim(),
  };
  if (!image) {
    return fromServerItem(type, await apiRequest(collectionPath(type), { ...requestConfig, method: 'POST', body, accessToken }), requestConfig.baseUrl);
  }
  const form = new FormData();
  form.append('item', new Blob([JSON.stringify(body)], { type: 'application/json' }));
  form.append('image', image, image instanceof File ? image.name : 'image');
  return fromServerItem(type, await apiRequest(collectionPath(type), {
    timeoutMs: UPLOAD_TIMEOUT_MS, ...requestConfig, method: 'POST', body: form, accessToken,
  }), requestConfig.baseUrl);
}

const fieldLabels: Record<string, string> = {
  title: '물품명', category: '종류', color: '색상', description: '상세 설명',
  lostDate: '분실 날짜', foundDate: '습득 날짜', region: '지역', location: '상세 장소',
};

/** Korean message for the register form; server validation messages are shown per field. */
export function describeItemError(error: unknown): string {
  if (!(error instanceof ApiClientError)) return '등록하지 못했어요. 잠시 후 다시 시도해 주세요.';
  if (error.status === 401) return '로그인이 만료되었어요. 다시 로그인한 뒤 등록해 주세요.';
  if (error.serverCode === 'INVALID_IMAGE' || error.serverCode === 'IMAGE_TOO_LARGE') return `사진: ${error.message}`;
  if (error.serverCode === 'VALIDATION_ERROR' && error.fieldErrors.length > 0) {
    return error.fieldErrors.map(({ field, message }) => `${fieldLabels[field] ?? field}: ${message}`).join('\n');
  }
  return error.message;
}
