import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedData } from '../data/seed';
import type { ItemType, NewItem } from '../types';
import { registerItem } from './demoStore';
import { isStoredItemImage, loadDemoData, parseStoredData, saveDemoData, serializeData, STORAGE_KEY } from './storage';

function photoItem(type: ItemType, image: string): NewItem {
  return {
    title: '사진 저장 확인용 물품', type, category: '기타', color: '검정',
    date: '2026-09-16', region: '서울', location: '테스트 장소',
    description: '새로고침 후에도 같은 사진을 표시하는 테스트 물품입니다.',
    image, source: 'community',
  };
}

describe('persistent demo photos', () => {
  let legacyStorage: Map<string, string>;

  beforeEach(() => {
    legacyStorage = new Map();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => legacyStorage.get(key) ?? null,
      setItem: (key: string, value: string) => legacyStorage.set(key, value),
      removeItem: (key: string) => legacyStorage.delete(key),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ['lost', 'png'], ['found', 'png'],
    ['lost', 'jpeg'], ['found', 'jpeg'],
    ['lost', 'webp'], ['found', 'webp'],
  ] as const)('restores a registered %s item and its %s photo from a fresh load', async (type, format) => {
    const image = `data:image/${format};base64,${Buffer.alloc(4096, 123).toString('base64')}`;
    const { data, item } = registerItem(createSeedData(), photoItem(type, image));
    await saveDemoData(data);
    const restored = await loadDemoData();
    expect(restored.error).toBeNull();
    expect(restored.data).toEqual(data);
    expect(restored.data.items.find((entry) => entry.id === item.id)?.image).toBe(image);
  });

  it('keeps multiple 2MB photos beyond the usual localStorage capacity', async () => {
    let data = createSeedData();
    const photos = ['png', 'jpeg', 'webp'].map((format, index) =>
      `data:image/${format};base64,${Buffer.alloc(2 * 1024 * 1024, index + 1).toString('base64')}`);
    for (const image of photos) data = registerItem(data, photoItem('lost', image)).data;
    await saveDemoData(data);
    const restored = await loadDemoData();
    expect(restored.error).toBeNull();
    expect(restored.data.items.slice(0, 3).map((item) => item.image)).toEqual([...photos].reverse());
    expect(legacyStorage.has(STORAGE_KEY)).toBe(false);
  });

  it('migrates existing posts, notifications and XP without resetting them', async () => {
    const { data } = registerItem(createSeedData(), photoItem('lost', '/images/keys.svg'));
    legacyStorage.set(STORAGE_KEY, serializeData(data));
    const migrated = await loadDemoData();
    expect(migrated).toEqual({ data, error: null });
    expect(legacyStorage.has(STORAGE_KEY)).toBe(false);
    expect(await loadDemoData()).toEqual(migrated);
  });

  it('retains the original legacy copy if migration cannot be saved', async () => {
    const data = createSeedData();
    const raw = serializeData(data);
    legacyStorage.set(STORAGE_KEY, raw);
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    const restored = await loadDemoData();
    expect(restored.data).toEqual(data);
    expect(restored.error).toContain('보관하지 못했어요');
    expect(legacyStorage.get(STORAGE_KEY)).toBe(raw);
  });

  it('rejects an aborted transaction, preserves the previous snapshot and permits retry', async () => {
    const seed = createSeedData();
    await saveDemoData(seed);
    const { data } = registerItem(seed, photoItem('lost', 'data:image/png;base64,aGVsbG8='));
    const originalPut = IDBObjectStore.prototype.put;
    const failingPut = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = originalPut.call(this, value, key);
      this.transaction.abort();
      return request;
    });
    await expect(saveDemoData(data)).rejects.toBeDefined();
    expect((await loadDemoData()).data).toEqual(seed);
    failingPut.mockRestore();
    await saveDemoData(data);
    expect((await loadDemoData()).data).toEqual(data);
  });

  it('keeps the newest snapshot when actions save in quick succession', async () => {
    const first = registerItem(createSeedData(), photoItem('lost', 'data:image/png;base64,aGVsbG8=')).data;
    const second = registerItem(first, photoItem('found', 'data:image/webp;base64,d29ybGQ=')).data;
    await Promise.all([saveDemoData(first), saveDemoData(second)]);
    expect((await loadDemoData()).data).toEqual(second);
  });

  it('removes uploaded photos when the demo is reset and does not restore them on reload', async () => {
    const seed = createSeedData();
    await saveDemoData(registerItem(seed, photoItem('lost', 'data:image/png;base64,aGVsbG8=')).data);
    await saveDemoData(seed);
    expect((await loadDemoData()).data).toEqual(seed);
  });

  it('falls back to localStorage with the original photo when IndexedDB is disabled', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const data = registerItem(createSeedData(), photoItem('lost', 'data:image/jpeg;base64,aGVsbG8=')).data;
    await saveDemoData(data);
    expect((await loadDemoData()).data).toEqual(data);
    vi.stubGlobal('localStorage', {
      setItem: () => { throw new DOMException('Storage full', 'QuotaExceededError'); },
    });
    await expect(saveDemoData(data)).rejects.toThrow('Storage full');
  });

  it('rejects incompatible or oversized image values while retaining legacy sample images', () => {
    expect(isStoredItemImage('/images/keys.svg')).toBe(true);
    for (const image of [
      'blob:expired-upload', 'https://example.test/photo.png',
      'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,INVALID_PHOTO',
      `data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')}`,
    ]) {
      expect(isStoredItemImage(image)).toBe(false);
      const seed = createSeedData();
      seed.items[0].image = image;
      expect(parseStoredData(JSON.stringify({ version: 1, data: seed }))).toBeNull();
    }
  });
});
