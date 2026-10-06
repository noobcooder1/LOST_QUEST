import { defaultItemImage } from '../data/seed';
import type { Item, ItemType } from '../types';
import { ApiClientError, apiRequest, type ApiRequestOptions } from './apiClient';

/**
 * 경찰청 공공데이터, served live by LOST QUEST (/api/public-items/...). The browser never talks to the
 * police API or sees its keys; it only receives the backend's normalized JSON.
 * Route ids: `police-lost-L2026…` and `police-found-F2026…-1` (found items need atcId + fdSn).
 */
const LOST_ROUTE = /^police-lost-(L\d{16})$/;
const FOUND_ROUTE = /^police-found-(F\d{16})-([1-9]\d{0,2})$/;
/** Same rule as the backend PoliceImagePolicy: only verified 경찰청 attachment images. */
const POLICE_IMAGE = /^https:\/\/minwon24\.police\.go\.kr\/lost112\/find\/getOpenapiAttachFileImage\/[LF]\d{16}\/\d{1,3}\/[A-Z]\d{16}\/\d{1,3}\.do$/;
const POLICE_TIMEOUT_MS = 30_000;

type RequestConfig = Pick<ApiRequestOptions, 'baseUrl' | 'timeoutMs'>;

export interface PoliceQuery {
  page?: number;
  size?: number;
  /** yyyy-MM-dd; ignored when q is set (the police keyword API has no date filter). */
  from?: string;
  to?: string;
  q?: string;
  /** Opaque values from GET /api/public-items/filters (경찰청 common codes). Date mode only. */
  region?: string;
  category?: string;
  subCategory?: string;
  /** Found items only: the 경찰청 lost-item API has no color condition. */
  color?: string;
}

export interface FilterOption {
  value: string;
  name: string;
}

export interface PoliceFilterOptions {
  regions: FilterOption[];
  categories: (FilterOption & { children: FilterOption[] })[];
  colors: FilterOption[];
}

export interface PolicePage {
  items: Item[];
  page: number;
  size: number;
  totalCount: number;
  totalPages: number;
  searchMode: 'DATE_RANGE' | 'KEYWORD';
}

export function toPoliceRouteId(type: ItemType, atcId: string, fdSn?: number | null): string {
  return type === 'lost' ? `police-lost-${atcId}` : `police-found-${atcId}-${fdSn}`;
}

export function parsePoliceRouteId(routeId: string | undefined): { type: ItemType; atcId: string; fdSn?: number } | null {
  if (!routeId) return null;
  const lost = LOST_ROUTE.exec(routeId);
  if (lost) return { type: 'lost', atcId: lost[1] };
  const found = FOUND_ROUTE.exec(routeId);
  return found ? { type: 'found', atcId: found[1], fdSn: Number(found[2]) } : null;
}

export function safePoliceImageUrl(value: unknown): string | null {
  return typeof value === 'string' && POLICE_IMAGE.test(value) ? value : null;
}

const invalidResponse = () => new ApiClientError('INVALID_RESPONSE', '예상한 경찰청 공공데이터 응답이 아니에요.');
const optionalText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Converts a PublicItemResponse into the UI Item model. Missing police values stay empty; nothing is invented. */
export function fromPublicItem(value: unknown): Item {
  if (!value || typeof value !== 'object') throw invalidResponse();
  const raw = value as Record<string, unknown>;
  if (raw.source !== 'POLICE' || (raw.type !== 'LOST' && raw.type !== 'FOUND') || typeof raw.atcId !== 'string') throw invalidResponse();
  const type: ItemType = raw.type === 'LOST' ? 'lost' : 'found';
  const fdSn = typeof raw.fdSn === 'number' && Number.isInteger(raw.fdSn) ? raw.fdSn : null;
  const routeId = toPoliceRouteId(type, raw.atcId, fdSn);
  if (!parsePoliceRouteId(routeId)) throw invalidResponse();

  const title = optionalText(raw.title) ?? optionalText(raw.subject) ?? '물품명 정보 없음';
  const category = optionalText(raw.category) ?? '';
  const storagePlace = optionalText(raw.storagePlace);
  const agency = optionalText(raw.agencyName) ?? storagePlace;
  const phone = optionalText(raw.agencyTel);
  const facts = [
    ['물품 분류', raw.categoryPath], ['지역', raw.region], [type === 'lost' ? '분실 장소 유형' : '습득 장소', type === 'lost' ? raw.placeType : raw.location],
    ['보관 장소', storagePlace], ['처리 상태', raw.status], ['시간대', typeof raw.hour === 'string' && raw.hour.trim() ? `${raw.hour.trim()}시` : null],
    ['특이사항', raw.note],
  ].flatMap(([label, v]) => { const text = optionalText(v); return text ? [{ label: String(label), value: text }] : []; });

  return {
    id: routeId,
    title,
    type,
    category,
    color: optionalText(raw.color) ?? '',
    date: optionalText(raw.date) ?? '',
    region: optionalText(raw.region) ?? '',
    // Lost items: where it was lost. Found lists only provide the storage place.
    location: type === 'lost' ? (optionalText(raw.location) ?? '') : (storagePlace ?? optionalText(raw.location) ?? ''),
    description: optionalText(raw.subject) ?? '',
    image: safePoliceImageUrl(raw.imageUrl) ?? defaultItemImage(category, title),
    source: 'public',
    status: 'open',
    createdBy: 'police',
    ...(agency ? { agency } : {}),
    ...(phone ? { phone } : {}),
    ...(facts.length ? { facts } : {}),
  };
}

export async function listPoliceItems(type: ItemType, query: PoliceQuery = {}, config: RequestConfig = {}): Promise<PolicePage> {
  const params = new URLSearchParams();
  params.set('page', String(query.page ?? 1));
  params.set('size', String(query.size ?? 20));
  const keyword = query.q?.trim();
  if (keyword) {
    params.set('q', keyword.slice(0, 50));
  } else {
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    if (query.region) params.set('region', query.region);
    if (query.category) params.set('category', query.category);
    if (query.subCategory) params.set('subCategory', query.subCategory);
    if (query.color && type === 'found') params.set('color', query.color);
  }
  const value = await apiRequest(`/api/public-items/${type}?${params}`, { timeoutMs: POLICE_TIMEOUT_MS, ...config });
  if (!value || typeof value !== 'object' || !Array.isArray((value as Record<string, unknown>).items)) throw invalidResponse();
  const raw = value as Record<string, unknown>;
  const number = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    items: (raw.items as unknown[]).map(fromPublicItem),
    page: number(raw.page),
    size: number(raw.size),
    totalCount: number(raw.totalCount),
    totalPages: number(raw.totalPages),
    searchMode: raw.searchMode === 'KEYWORD' ? 'KEYWORD' : 'DATE_RANGE',
  };
}

const isOption = (value: unknown): value is FilterOption => !!value && typeof value === 'object'
  && typeof (value as FilterOption).value === 'string' && typeof (value as FilterOption).name === 'string';

/** Region / item-class / color options, taken by the backend from the 경찰청 common-code API. */
export async function getPoliceFilters(config: RequestConfig = {}): Promise<PoliceFilterOptions> {
  const value = await apiRequest('/api/public-items/filters', { timeoutMs: POLICE_TIMEOUT_MS, ...config });
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  if (!Array.isArray(raw.regions) || !Array.isArray(raw.categories) || !Array.isArray(raw.colors)) throw invalidResponse();
  const options = (list: unknown[]) => list.filter(isOption).map(({ value: v, name }) => ({ value: v, name }));
  return {
    regions: options(raw.regions),
    categories: raw.categories.filter(isOption).map((category) => ({
      value: category.value,
      name: category.name,
      children: options(Array.isArray((category as unknown as Record<string, unknown>).children) ? (category as unknown as Record<string, unknown>).children as unknown[] : []),
    })),
    colors: options(raw.colors),
  };
}

export async function getPoliceItem(routeId: string, config: RequestConfig = {}): Promise<Item> {
  const ref = parsePoliceRouteId(routeId);
  if (!ref) throw new ApiClientError('INVALID_CONFIG', '잘못된 경찰청 물품 주소예요.');
  const path = ref.type === 'lost' ? `/api/public-items/lost/${ref.atcId}` : `/api/public-items/found/${ref.atcId}/${ref.fdSn}`;
  return fromPublicItem(await apiRequest(path, { timeoutMs: POLICE_TIMEOUT_MS, ...config }));
}
