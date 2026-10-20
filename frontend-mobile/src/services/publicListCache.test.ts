import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '../types';
import { CACHE_POLICY, PUBLIC_CACHE_DB, PUBLIC_CACHE_STORE, publicListKey, readPublicList, savePublicList, type PublicListRequest } from './publicListCache';

const now = Date.parse('2026-10-13T00:00:00Z');
const request: PublicListRequest = { kind: 'communityLost', page: 1, size: 0 };
const item: Item = { id: 'api-lost-1', title: '검은 지갑', type: 'lost', category: '지갑', color: '검정', date: '2026-10-12', region: '서울', location: '개인 주소', description: '개인 상세 설명', image: 'http://localhost:8080/api/images/3f2c1c9e-8a5b-4f43-9d0a-5a1c3b7e9f10.png', source: 'community', status: 'open', createdBy: 'server', ownerId: 8, ownershipQuestion: '비공개 질문', secretAnswer: '비밀 답변', phone: '010-1111-2222' };
const data = (items = [item], page = 1) => ({ items, page, totalCount: items.length, totalPages: 1 });
beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('crypto', webcrypto); vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080'); vi.spyOn(Date, 'now').mockReturnValue(now); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function rawRows(): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(PUBLIC_CACHE_DB, 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(PUBLIC_CACHE_STORE, 'readonly');
      const get = tx.objectStore(PUBLIC_CACHE_STORE).getAll();
      tx.oncomplete = () => { db.close(); resolve(get.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

describe('public IndexedDB snapshots', () => {
  it('stores a minimized summary, never private fields, precise location, description, credentials or blobs', async () => {
    const unsafe = { ...item, title: '지갑 test@example.com 010-1234-5678', password: 'password-secret', accessToken: 'jwt-secret', ownershipAnswer: 'owner-secret', facts: [{ label: '기타', value: 'private-fact' }] };
    expect(await savePublicList(request, data([unsafe]))).toBe(true);
    const rows = await rawRows();
    const stored = JSON.stringify(rows);
    for (const forbidden of ['ownerId', 'ownershipQuestion', 'ownershipAnswer', 'secretAnswer', 'password', 'accessToken', 'phone', 'facts', 'password-secret', 'jwt-secret', '個人', '개인 주소', '개인 상세 설명', 'test@example.com', '010-1234-5678']) expect(stored).not.toContain(forbidden);
    expect(stored).not.toContain('http://localhost:8080/api/images');
    const restored = await readPublicList(request);
    expect(restored?.items[0]).toMatchObject({ description: '', location: '서울', image: item.image });
  });

  it('replaces the exact snapshot, preserves creation time and records last successful sync including empty lists', async () => {
    await savePublicList(request, data(), now - 1000);
    await savePublicList(request, data([]), now);
    const rows = await rawRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ createdAt: now - 1000, updatedAt: now, items: [] });
    expect(await readPublicList(request)).toMatchObject({ items: [], updatedAt: now });
  });

  it('separates kind, actual query conditions, size, page and API server without storing raw query text', async () => {
    const base = { kind: 'policeFound' as const, query: { region: 'A', category: 'B' }, page: 1, size: 20 };
    const baseKey = await publicListKey(base);
    expect(baseKey).toBe(await publicListKey({ ...base, query: { category: 'B', region: 'A', token: 'secret' } }));
    for (const changed of [{ ...base, kind: 'policeLost' as const }, { ...base, query: { region: 'C' } }, { ...base, page: 2 }, { ...base, size: 10 }]) expect(await publicListKey(changed)).not.toBe(baseKey);
    expect(await publicListKey(base, 'https://other.example')).not.toBe(baseKey);
    expect(await publicListKey({ ...base, query: { q: ' 지갑 ', region: 'A' } })).toBe(await publicListKey({ ...base, query: { q: '지갑', region: 'B' } }));
    expect(await publicListKey({ ...request, query: { q: '가방' } })).toBe(await publicListKey(request)); // Community API always returns the full list.
    expect(await publicListKey({ ...base, query: { q: 'private@example.com' } })).not.toContain('private@example.com');
  });

  it('expires snapshots and removes expired entries', async () => {
    await savePublicList(request, data(), now - CACHE_POLICY.maxAgeMs - 1);
    expect(await readPublicList(request)).toBeNull();
    expect(await rawRows()).toHaveLength(0);
  });

  it('keeps the newest 40 entries', async () => {
    const police = { ...item, id: 'police-lost-L2026100500000001', source: 'public' as const, createdBy: 'police' };
    for (let n = 0; n < 45; n += 1) await savePublicList({ kind: 'policeLost', query: { q: String(n) }, page: 1, size: 20 }, data([police]), now - 45 + n);
    const rows = await rawRows();
    expect(rows).toHaveLength(40);
    expect(await readPublicList({ kind: 'policeLost', query: { q: '0' }, page: 1, size: 20 })).toBeNull();
    expect(await readPublicList({ kind: 'policeLost', query: { q: '44' }, page: 1, size: 20 })).not.toBeNull();
  });

  it('bounds aggregate byte size and refuses oversized snapshots without partially saving a list', async () => {
    const many = Array.from({ length: 800 }, (_, n) => ({ ...item, id: `api-lost-${n + 1}`, title: '지'.repeat(100) }));
    for (let n = 0; n < 20; n += 1) await savePublicList({ ...request, page: n + 1 }, data(many, n + 1), now - 20 + n);
    const rows = await rawRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(20);
    expect(rows.reduce((sum, row) => sum + Number(row.bytes), 0)).toBeLessThanOrEqual(CACHE_POLICY.maxBytes);
    expect(await savePublicList(request, data(Array.from({ length: CACHE_POLICY.maxItems + 1 }, () => item)))).toBe(false);
  });

  it('returns safely when IndexedDB is unavailable or quota writes fail', async () => {
    vi.stubGlobal('indexedDB', undefined);
    expect(await savePublicList(request, data())).toBe(false);
    expect(await readPublicList(request)).toBeNull();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    expect(await savePublicList(request, data())).toBe(false);
    expect(await readPublicList(request)).toBeNull();
  });

  it('restores only contiguous pages of the same police query and resets later pages after page-one refresh', async () => {
    const first = { ...item, id: 'police-lost-L2026100500000001', source: 'public' as const, createdBy: 'police' };
    const second = { ...first, id: 'police-lost-L2026100500000002' };
    const police: PublicListRequest = { kind: 'policeLost', query: { q: '지갑' }, page: 1, size: 20 };
    await savePublicList(police, { ...data([first]), totalPages: 3 }, now - 1000);
    await savePublicList({ ...police, page: 2 }, { ...data([second], 2), totalPages: 3 }, now);
    expect((await readPublicList({ ...police, page: 2 }))?.items.map(entry => entry.id)).toEqual([second.id]);
    expect(await readPublicList({ ...police, query: { q: '가방' } })).toBeNull();
    expect(await readPublicList(police, now, true)).toMatchObject({ page: 2, updatedAt: now - 1000 });
    await savePublicList(police, data([]), now);
    expect(await readPublicList({ ...police, page: 2 })).toBeNull();
    expect((await readPublicList(police, now, true))?.items).toEqual([]);
  });
});
