import type { Item } from '../types';
import { getApiBaseUrl } from './apiClient';
import { parseServerRouteId, resolveServerImageUrl } from './itemApi';
import { parsePoliceRouteId, safePoliceImageUrl } from './publicItemApi';
import { defaultItemImage } from '../data/seed';

export type PublicListKind = 'communityLost' | 'communityFound' | 'policeLost' | 'policeFound';
export interface PublicListRequest {
  kind: PublicListKind;
  query?: Record<string, string | number | undefined>;
  page: number;
  size: number;
}
export interface PublicListData {
  items: Item[];
  page: number;
  totalCount: number;
  totalPages: number;
}
export const PUBLIC_CACHE_DB = 'lost-quest-public-lists';
export const PUBLIC_CACHE_STORE = 'lists';
export const CACHE_POLICY = {
  maxEntries: 40, maxBytes: 5 * 1024 * 1024, maxEntryBytes: 512 * 1024,
  maxItems: 2000, maxAgeMs: 7 * 24 * 60 * 60 * 1000, operationTimeoutMs: 2000,
} as const;
interface CacheRecord extends PublicListData {
  key: string;
  version: 1;
  kind: PublicListKind;
  createdAt: number;
  updatedAt: number;
  bytes: number;
}
const kinds: PublicListKind[] = ['communityLost', 'communityFound', 'policeLost', 'policeFound'];

/** Only actual public GET conditions enter the key; never tokens, arbitrary options, or sessions. */
export async function publicListKey(request: PublicListRequest, baseUrl = getApiBaseUrl()): Promise<string> {
  const query = request.kind.startsWith('community') ? { scope: 'all' } : request.query?.q
    ? { q: String(request.query.q).trim().slice(0, 50) }
    : Object.fromEntries(['from', 'to', 'region', 'category', 'subCategory', ...(request.kind === 'policeFound' ? ['color'] : [])]
      .flatMap(field => request.query?.[field] ? [[field, String(request.query[field]).trim()]] : []));
  // Query text can itself contain personal information. Persist only a cryptographic scope hash.
  const scope = JSON.stringify([1, baseUrl.trim().replace(/\/+$/, ''), request.kind, query, request.size]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(scope));
  return `${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}:${request.page}`;
}

const safeText = (value: unknown, max: number): string => typeof value === 'string'
  ? value.slice(0, max).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[연락처 제외]')
    .replace(/(?:\+82[-\s]?|0)\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/g, '[연락처 제외]') : '';

/** Explicit allowlist: no descriptions, precise locations, user ids, clues, answers, phones or image bytes. */
function summary(item: Item, kind: PublicListKind): Item {
  const type = kind.endsWith('Lost') ? 'lost' : 'found';
  const community = kind.startsWith('community');
  const route = community ? parseServerRouteId(item.id) : parsePoliceRouteId(item.id);
  if (!route || route.type !== type || !['open', 'returned', 'closed'].includes(item.status) ||
      typeof item.title !== 'string' || typeof item.category !== 'string' || typeof item.date !== 'string') {
    throw new Error('Invalid public item summary');
  }
  const region = safeText(item.region, 80);
  let image = defaultItemImage(item.category, item.title);
  if (community) {
    try {
      const base = getApiBaseUrl().replace(/\/+$/, '');
      const relative = item.image.startsWith('/api/images/') ? item.image : item.image.startsWith(`${base}/api/images/`) ? item.image.slice(base.length) : '';
      if (resolveServerImageUrl(relative, 'https://cache.invalid')) image = relative;
    } catch { /* Category illustration remains available without API images. */ }
  } else image = safePoliceImageUrl(item.image) ?? image;
  return {
    id: item.id, title: safeText(item.title, 100), type, category: safeText(item.category, 100),
    color: safeText(item.color, 40), date: safeText(item.date, 10), region, location: region,
    description: '', image, source: community ? 'community' : 'public', status: item.status,
    createdBy: community ? 'server' : 'police',
  };
}
const byteSize = (value: unknown) => new Blob([JSON.stringify(value)]).size;

function validRecord(value: unknown, now: number): value is CacheRecord {
  if (!value || typeof value !== 'object') return false;
  const row = value as CacheRecord;
  return row.version === 1 && typeof row.key === 'string' && kinds.includes(row.kind)
    && Array.isArray(row.items) && row.items.length <= CACHE_POLICY.maxItems
    && [row.page, row.totalCount, row.totalPages, row.bytes].every(n => Number.isSafeInteger(n) && n >= 0)
    && row.bytes <= CACHE_POLICY.maxEntryBytes && Number.isFinite(row.createdAt) && Number.isFinite(row.updatedAt)
    && row.createdAt <= row.updatedAt && row.updatedAt <= now && now - row.updatedAt <= CACHE_POLICY.maxAgeMs;
}

async function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    let finished = false;
    const done = (db: IDBDatabase | null) => {
      if (finished) { db?.close(); return; }
      finished = true; clearTimeout(timer); resolve(db);
    };
    const timer = setTimeout(() => done(null), CACHE_POLICY.operationTimeoutMs);
    try {
      const request = indexedDB.open(PUBLIC_CACHE_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(PUBLIC_CACHE_STORE)) request.result.createObjectStore(PUBLIC_CACHE_STORE, { keyPath: 'key' });
      };
      request.onerror = () => done(null);
      request.onblocked = () => done(null);
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        done(request.result);
      };
    } catch { done(null); }
  });
}

/** A bounded transaction; unavailable storage never escapes as an API error. */
async function transaction<T>(work: (store: IDBObjectStore, setResult: (value: T) => void) => void): Promise<T | null> {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise(resolve => {
    let result: T | null = null;
    let finished = false;
    let tx: IDBTransaction | undefined;
    const done = (value: T | null) => { if (!finished) { finished = true; clearTimeout(timer); db.close(); resolve(value); } };
    const timer = setTimeout(() => { try { tx?.abort(); } catch { /* Already complete. */ } done(null); }, CACHE_POLICY.operationTimeoutMs);
    try {
      tx = db.transaction(PUBLIC_CACHE_STORE, 'readwrite');
      tx.oncomplete = () => done(result);
      tx.onerror = tx.onabort = () => done(null);
      work(tx.objectStore(PUBLIC_CACHE_STORE), value => { result = value; });
    } catch { try { tx?.abort(); } catch { /* No active transaction. */ } done(null); }
  });
}

function keepWithinPolicy(rows: CacheRecord[], store: IDBObjectStore, now: number): CacheRecord[] {
  let bytes = 0;
  const kept: CacheRecord[] = [];
  for (const row of rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))) {
    if (!validRecord(row, now) || kept.length >= CACHE_POLICY.maxEntries || bytes + row.bytes > CACHE_POLICY.maxBytes) {
      if (typeof row.key === 'string') store.delete(row.key);
    } else { kept.push(row); bytes += row.bytes; }
  }
  return kept;
}

export async function savePublicList(request: PublicListRequest, data: PublicListData, now = Date.now()): Promise<boolean> {
  try {
    if (!kinds.includes(request.kind) || data.items.length > CACHE_POLICY.maxItems) return false;
    const key = await publicListKey(request);
    const scope = key.slice(0, key.lastIndexOf(':'));
    const record: CacheRecord = {
      key, kind: request.kind, version: 1, createdAt: now, updatedAt: now, bytes: 0,
      items: data.items.map(item => summary(item, request.kind)), page: data.page, totalCount: data.totalCount, totalPages: data.totalPages,
    };
    for (let pass = 0; pass < 3; pass += 1) record.bytes = byteSize(record);
    if (record.bytes > CACHE_POLICY.maxEntryBytes || !validRecord(record, now)) return false;
    return await transaction<boolean>((store, setResult) => {
      const all = store.getAll();
      all.onsuccess = () => {
        const previous = (all.result as CacheRecord[]).find(row => row.key === key && validRecord(row, now));
        if (previous) record.createdAt = previous.createdAt;
        const others = all.result.filter((row: CacheRecord) => {
          if (row.key === key) return false;
          // Refreshing page one starts a new result set; never attach old following pages to it.
          if (request.page === 1 && row.page > 1 && typeof row.key === 'string' && row.key.slice(0, row.key.lastIndexOf(':')) === scope) {
            store.delete(row.key); return false;
          }
          return true;
        });
        // The new successful snapshot replaces this exact query/page, including an empty result.
        const kept = keepWithinPolicy([record, ...others], store, now);
        if (kept.includes(record)) { store.put(record); setResult(true); }
      };
    }) ?? false;
  } catch { return false; }
}

export async function readPublicList(request: PublicListRequest, now = Date.now(), includeFollowingPages = false): Promise<(PublicListData & { updatedAt: number }) | null> {
  try {
    const key = await publicListKey(request);
    const scope = key.slice(0, key.lastIndexOf(':'));
    return await transaction<PublicListData & { updatedAt: number }>((store, setResult) => {
      const all = store.getAll();
      all.onsuccess = () => {
        const kept = keepWithinPolicy(all.result, store, now);
        const row = kept.find(entry => entry.key === key && entry.kind === request.kind);
        if (!row) return;
        try {
          const pages = [row];
          if (includeFollowingPages) {
            for (let page = request.page + 1; page <= row.totalPages && pages.length < CACHE_POLICY.maxEntries; page += 1) {
              const next = kept.find(entry => entry.key === `${scope}:${page}` && entry.kind === request.kind);
              if (!next) break;
              pages.push(next);
            }
          }
          const items = pages.flatMap(page => page.items).map(item => summary(item, row.kind)).map(item => ({
            ...item, image: item.image.startsWith('/api/images/') ? resolveServerImageUrl(item.image) ?? defaultItemImage(item.category, item.title) : item.image,
          }));
          setResult({ items: [...new Map(items.map(item => [item.id, item])).values()], page: pages.at(-1)!.page, totalCount: row.totalCount, totalPages: row.totalPages, updatedAt: Math.min(...pages.map(page => page.updatedAt)) });
        } catch { store.delete(row.key); }
      };
    });
  } catch { return null; }
}

export async function clearPublicListCache(): Promise<void> {
  await transaction<boolean>((store, setResult) => { store.clear(); setResult(true); });
}
