import { categories, createSeedData, defaultItemImage, regions } from '../data/seed';
import type { AppData, Item, Notification, ReturnRequest, ReturnStatus } from '../types';

export const STORAGE_KEY = 'lost-quest-demo-v1';
const STORAGE_VERSION = 1;
const imagePaths = ['/images/wallet.svg', '/images/earbuds.svg', '/images/phone.svg', '/images/backpack.svg', '/images/keys.svg', '/images/camera.svg'];
const statuses: ReturnStatus[] = ['pending', 'owner_verified', 'approved', 'qr_verified', 'completed', 'rejected'];
type RecordValue = Record<string, unknown>;

const record = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max = 2000): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown): value is string => text(value, 40) && Number.isFinite(Date.parse(value));
const date = (value: unknown): value is string => text(value, 10) && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

function parseItem(value: unknown): Item | null {
  if (!record(value) || !text(value.id, 100) || !text(value.title, 100) || !['lost', 'found'].includes(String(value.type)) ||
      !categories.includes(String(value.category)) || !text(value.color, 30) || !date(value.date) ||
      !regions.includes(String(value.region)) || !text(value.location, 200) || !text(value.description) ||
      !text(value.image) || !imagePaths.includes(value.image) || !['community', 'public'].includes(String(value.source)) ||
      !['open', 'returned'].includes(String(value.status)) || !['demo', 'community', 'public'].includes(String(value.createdBy))) return null;
  if (value.agency !== undefined && !text(value.agency, 150)) return null;
  if (value.phone !== undefined && !text(value.phone, 30)) return null;
  if (value.secretAnswer !== undefined && value.secretAnswer !== '파란색') return null;
  return {
    id: value.id, title: value.title, type: value.type as Item['type'], category: String(value.category),
    color: value.color, date: value.date, region: String(value.region), location: value.location,
    description: value.description, image: value.image, source: value.source as Item['source'],
    status: value.status as Item['status'], createdBy: String(value.createdBy),
    ...(value.secretAnswer ? { secretAnswer: '파란색' } : {}),
    ...(value.agency ? { agency: String(value.agency) } : {}),
    ...(value.phone ? { phone: String(value.phone) } : {}),
  };
}

function parseRequest(value: unknown, items: Item[]): ReturnRequest | null {
  if (!record(value) || !text(value.id, 100) || !text(value.itemId, 100) || !statuses.includes(value.status as ReturnStatus) ||
      !timestamp(value.createdAt) || !timestamp(value.updatedAt)) return null;
  const item = items.find((entry) => entry.id === value.itemId);
  if (!item || item.type !== 'found' || item.source !== 'community') return null;
  if (value.status === 'completed' && item.status !== 'returned') return null;
  if (value.status !== 'completed' && value.status !== 'rejected' && item.status !== 'open') return null;
  if (value.lostItemId !== undefined && (!text(value.lostItemId, 100) || !items.some((entry) => entry.id === value.lostItemId && entry.type === 'lost' && entry.createdBy === 'demo'))) return null;
  const linked = items.find((entry) => entry.id === value.lostItemId);
  if (linked && (linked.category !== item.category || (value.status === 'completed' && linked.status !== 'returned') || (value.status !== 'completed' && value.status !== 'rejected' && linked.status !== 'open'))) return null;
  return {
    id: value.id, itemId: value.itemId, status: value.status as ReturnStatus,
    createdAt: value.createdAt, updatedAt: value.updatedAt,
    ...(value.lostItemId ? { lostItemId: String(value.lostItemId) } : {}),
  };
}

function parseNotification(value: unknown): Notification | null {
  if (!record(value) || !text(value.id, 100) || !text(value.title, 200) || !text(value.message) ||
      !timestamp(value.createdAt) || typeof value.read !== 'boolean') return null;
  return { id: value.id, title: value.title, message: value.message, createdAt: value.createdAt, read: value.read };
}

/** Whitelist persisted fields; never hydrate session credentials or arbitrary keys. */
export function parseStoredData(raw: string): AppData | null {
  try {
    const envelope: unknown = JSON.parse(raw);
    if (!record(envelope) || envelope.version !== STORAGE_VERSION || !record(envelope.data)) return null;
    const value = envelope.data;
    if (!Array.isArray(value.items) || value.items.length > 2000 || !Array.isArray(value.requests) || value.requests.length > 2000 ||
        !Array.isArray(value.notifications) || value.notifications.length > 100 || !record(value.profile)) return null;
    const items = value.items.map(parseItem);
    if (items.some((item) => item === null)) return null;
    const parsedItems = items as Item[];
    if (new Set(parsedItems.map((item) => item.id)).size !== parsedItems.length) return null;
    const requests = value.requests.map((request) => parseRequest(request, parsedItems));
    const notifications = value.notifications.map(parseNotification);
    if (requests.some((request) => request === null) || notifications.some((notification) => notification === null)) return null;
    const parsedRequests = requests as ReturnRequest[];
    const activeIds = parsedRequests.filter((request) => request.status !== 'rejected').map((request) => request.itemId);
    const linkedIds = parsedRequests.filter((request) => request.status !== 'rejected' && request.lostItemId).map((request) => request.lostItemId);
    if (new Set(linkedIds).size !== linkedIds.length) return null;
    if (new Set(parsedRequests.map((request) => request.id)).size !== parsedRequests.length || new Set(activeIds).size !== activeIds.length) return null;
    if (value.profile.name !== '로스트헌터' || !count(value.profile.xp) || !count(value.profile.returnedCount) || !count(value.profile.registeredCount)) return null;
    return {
      items: parsedItems, requests: parsedRequests, notifications: notifications as Notification[],
      profile: { name: '로스트헌터', xp: value.profile.xp, returnedCount: value.profile.returnedCount, registeredCount: value.profile.registeredCount },
    };
  } catch {
    return null;
  }
}

export function serializeData(data: AppData): string {
  // Uploaded photographs remain in memory only. Reloads use a category illustration.
  const safeData: AppData = {
    items: data.items.map((item) => ({
      id: item.id, title: item.title, type: item.type, category: item.category, color: item.color,
      date: item.date, region: item.region, location: item.location, description: item.description,
      image: imagePaths.includes(item.image) ? item.image : defaultItemImage(item.category, item.title),
      source: item.source, status: item.status, createdBy: item.createdBy,
      ...(item.secretAnswer ? { secretAnswer: '파란색' } : {}),
      ...(item.agency ? { agency: item.agency } : {}),
      ...(item.phone ? { phone: item.phone } : {}),
    })),
    requests: data.requests.map(({ id, itemId, lostItemId, status, createdAt, updatedAt }) => ({ id, itemId, lostItemId, status, createdAt, updatedAt })),
    profile: { name: '로스트헌터', xp: data.profile.xp, returnedCount: data.profile.returnedCount, registeredCount: data.profile.registeredCount },
    notifications: data.notifications.map(({ id, title, message, createdAt, read }) => ({ id, title, message, createdAt, read })),
  };
  return JSON.stringify({ version: STORAGE_VERSION, data: safeData });
}

export function loadDemoData(): { data: AppData; error: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { data: createSeedData(), error: null };
    const data = parseStoredData(raw);
    return data
      ? { data, error: null }
      : { data: createSeedData(), error: '저장된 테스트 데이터를 읽을 수 없어 기본 데모로 복구했어요.' };
  } catch {
    return { data: createSeedData(), error: '이 브라우저에서는 테스트 데이터를 저장할 수 없어요. 현재 화면에서는 계속 체험할 수 있어요.' };
  }
}
