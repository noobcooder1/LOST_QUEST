import { defaultItemImage } from '../data/seed';
import type { Item, ItemType } from '../types';
import { ApiClientError, apiRequest, type ApiRequestOptions } from './apiClient';
import { loadAuthSession } from './authSession';

/**
 * Community items registered through LOST QUEST live in Spring Boot + MySQL. Public items are
 * still seed data. Server items get route ids like `api-lost-12` so lost/found ids never collide
 * with each other or with seed ids such as `found-wallet-1`.
 */
const SERVER_ID = /^api-(lost|found)-([1-9]\d{0,15})$/;

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

const invalidResponse = () => new ApiClientError('INVALID_RESPONSE', '예상한 물품 응답이 아니에요. 서버 주소를 확인해 주세요.');
const isText = (value: unknown): value is string => typeof value === 'string';
const isDate = (value: unknown): value is string => isText(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Converts a LostItemResponse/FoundItemResponse into the UI's Item model. */
export function fromServerItem(type: ItemType, value: unknown): Item {
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
    // Image upload is a later step; the server never stores client data URLs.
    image: defaultItemImage(raw.category, raw.title),
    source: 'community',
    status: raw.status === openStatus ? 'open' : 'returned',
    createdBy: 'server',
    serverId: raw.id,
    ownerId: raw.userId,
  };
}

function parseList(type: ItemType, value: unknown): Item[] {
  if (!Array.isArray(value)) throw invalidResponse();
  return value.map((entry) => fromServerItem(type, entry));
}

const collectionPath = (type: ItemType) => (type === 'lost' ? '/api/lost-items' : '/api/found-items');

export async function listServerItems(type: ItemType, config: RequestConfig = {}): Promise<Item[]> {
  return parseList(type, await apiRequest(collectionPath(type), config));
}

/** Lost and found lists together; public GET, so no token is sent. */
export async function listAllServerItems(config: RequestConfig = {}): Promise<Item[]> {
  const [lost, found] = await Promise.all([listServerItems('lost', config), listServerItems('found', config)]);
  return [...lost, ...found];
}

export async function getServerItem(type: ItemType, serverId: number, config: RequestConfig = {}): Promise<Item> {
  return fromServerItem(type, await apiRequest(`${collectionPath(type)}/${serverId}`, config));
}

/**
 * Registers an item as the signed-in user. Only item fields are sent: the server takes the
 * author from the JWT and sets the initial status itself.
 */
export async function createServerItem(type: ItemType, input: CreateItemInput,
  config: RequestConfig & { accessToken?: string | null } = {}): Promise<Item> {
  const { accessToken = loadAuthSession()?.accessToken ?? null, ...requestConfig } = config;
  const body = {
    title: input.title.trim(),
    category: input.category,
    color: input.color.trim(),
    description: input.description.trim(),
    [type === 'lost' ? 'lostDate' : 'foundDate']: input.date,
    region: input.region,
    location: input.location.trim(),
  };
  return fromServerItem(type, await apiRequest(collectionPath(type), { ...requestConfig, method: 'POST', body, accessToken }));
}

const fieldLabels: Record<string, string> = {
  title: '물품명', category: '종류', color: '색상', description: '상세 설명',
  lostDate: '분실 날짜', foundDate: '습득 날짜', region: '지역', location: '상세 장소',
};

/** Korean message for the register form; server validation messages are shown per field. */
export function describeItemError(error: unknown): string {
  if (!(error instanceof ApiClientError)) return '등록하지 못했어요. 잠시 후 다시 시도해 주세요.';
  if (error.status === 401) return '로그인이 만료되었어요. 다시 로그인한 뒤 등록해 주세요.';
  if (error.serverCode === 'VALIDATION_ERROR' && error.fieldErrors.length > 0) {
    return error.fieldErrors.map(({ field, message }) => `${fieldLabels[field] ?? field}: ${message}`).join('\n');
  }
  return error.message;
}
