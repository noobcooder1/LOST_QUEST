import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import type { NewItem } from '../types';
import { registerItem, requestReturn, transitionReturn, verifyOwnership } from './demoStore';
import { getMatches } from './matching';
import { parseStoredData, serializeData } from './storage';

describe('demo return workflow', () => {
  it('requires each stage and awards the completed return exactly once', () => {
    const seed = createSeedData();
    const { data: requested, request } = requestReturn(seed, 'found-wallet-1', 'lost-wallet-demo');
    expect(transitionReturn(requested, request.id, 'completed')).toBe(requested);
    expect(transitionReturn(requested, request.id, 'approved')).toBe(requested);
    expect(verifyOwnership(requested, request.id, '빨간색').verified).toBe(false);
    expect(requested.profile.xp).toBe(320);

    const verified = verifyOwnership(requested, request.id, ' 파란색 ').data;
    expect(transitionReturn(verified, request.id, 'qr_verified')).toBe(verified);
    const approved = transitionReturn(verified, request.id, 'approved');
    const qrVerified = transitionReturn(approved, request.id, 'qr_verified');
    const completed = transitionReturn(qrVerified, request.id, 'completed');
    expect(completed.profile.xp).toBe(370);
    expect(completed.profile.returnedCount).toBe(4);
    expect(completed.items.find((item) => item.id === 'found-wallet-1')?.status).toBe('returned');
    expect(completed.items.find((item) => item.id === 'lost-wallet-demo')?.status).toBe('returned');
    expect(transitionReturn(completed, request.id, 'completed')).toBe(completed);
    expect(transitionReturn(completed, request.id, 'rejected')).toBe(completed);
    expect(seed.profile.xp).toBe(320);
  });

  it('deduplicates repeated requests and automatically connects a compatible own lost item', () => {
    const { data, request } = requestReturn(createSeedData(), 'found-wallet-1');
    const repeated = requestReturn(data, 'found-wallet-1');
    expect(request.lostItemId).toBe('lost-wallet-demo');
    expect(repeated.request.id).toBe(request.id);
    expect(repeated.data.requests).toHaveLength(1);
  });

  it('does not let public records enter the local return process', () => {
    expect(() => requestReturn(createSeedData(), 'public-phone-1')).toThrow('자체 등록');
  });

  it('prevents multiple candidates from claiming the same lost item', () => {
    const { data, request } = requestReturn(createSeedData(), 'found-wallet-1', 'lost-wallet-demo');
    expect(() => requestReturn(data, 'found-wallet-2', 'lost-wallet-demo')).toThrow('다른 반환 요청');
    expect(() => requestReturn(data, 'found-wallet-2')).toThrow('다른 반환 요청');
    const rejected = transitionReturn(data, request.id, 'rejected');
    expect(requestReturn(rejected, 'found-wallet-2', 'lost-wallet-demo').request.status).toBe('pending');
    expect(() => requestReturn(createSeedData(), 'found-earbuds-1', 'lost-wallet-demo')).toThrow('같은 종류');
  });

  it('allows another request after rejection without granting experience', () => {
    const { data, request } = requestReturn(createSeedData(), 'found-wallet-1');
    const rejected = transitionReturn(data, request.id, 'rejected');
    expect(rejected.profile.xp).toBe(320);
    expect(verifyOwnership(rejected, request.id, '파란색').verified).toBe(false);
    expect(transitionReturn(rejected, request.id, 'approved')).toBe(rejected);
    const next = requestReturn(rejected, 'found-wallet-1');
    expect(next.request.id).not.toBe(request.id);
    expect(next.data.requests).toHaveLength(2);
  });

  it('adds registration XP and keeps all new posts within the demo community', () => {
    const seed = createSeedData();
    const input: NewItem = {
      title: '테스트 지갑', type: 'lost', category: '지갑', color: '검정',
      date: '2026-09-16', region: '서울', location: '서울숲역', description: '테스트 물품입니다.',
      image: 'data:image/png;base64,TEST', source: 'public', secretAnswer: 'real-private-clue',
    };
    const result = registerItem(seed, input);
    expect(result.data.profile.xp).toBe(330);
    expect(result.data.profile.registeredCount).toBe(3);
    expect(result.item.createdBy).toBe('demo');
    expect(result.item.source).toBe('community');
    expect(result.item.secretAnswer).toBe('파란색');
    expect(result.item.image).toBe(input.image);
    expect(() => registerItem(seed, { ...input, date: '2026-02-30' })).toThrow('날짜');
  });
});

describe('versioned local storage', () => {
  it('round-trips the seed and completed workflow', () => {
    const seed = createSeedData();
    expect(parseStoredData(serializeData(seed))).toEqual(seed);
    const { data, request } = requestReturn(seed, 'found-wallet-1');
    let updated = verifyOwnership(data, request.id, '파란색').data;
    updated = transitionReturn(updated, request.id, 'approved');
    updated = transitionReturn(updated, request.id, 'qr_verified');
    updated = transitionReturn(updated, request.id, 'completed');
    expect(parseStoredData(serializeData(updated))).toEqual(updated);
  });

  it('rejects malformed, incomplete and incompatible data', () => {
    expect(parseStoredData('{')).toBeNull();
    expect(parseStoredData('{}')).toBeNull();
    expect(parseStoredData(JSON.stringify({ version: 99, data: createSeedData() }))).toBeNull();
    expect(parseStoredData(JSON.stringify({ version: 1, data: { items: [] } }))).toBeNull();
    const negativeXp = createSeedData();
    negativeXp.profile.xp = -1;
    expect(parseStoredData(JSON.stringify({ version: 1, data: negativeXp }))).toBeNull();
    const invalidDate = createSeedData();
    invalidDate.items[0].date = '2026-02-30';
    expect(parseStoredData(JSON.stringify({ version: 1, data: invalidDate }))).toBeNull();
  });

  it('does not persist uploaded photos or unexpected authentication fields', () => {
    const seed = createSeedData();
    seed.items[0].image = 'data:image/png;base64,PRIVATE_PHOTO';
    const polluted = { ...seed, password: 'SECRET_PASSWORD', email: 'private@example.test', isLoggedIn: true };
    const raw = serializeData(polluted);
    expect(raw).not.toContain('PRIVATE_PHOTO');
    expect(raw).not.toContain('SECRET_PASSWORD');
    expect(raw).not.toContain('private@example.test');
    expect(raw).not.toContain('isLoggedIn');
    expect(parseStoredData(raw)?.items[0].image).toBe('/images/wallet.svg');
  });

  it('rejects dangling requests and duplicate active claims', () => {
    const { data, request } = requestReturn(createSeedData(), 'found-wallet-1');
    const dangling = { ...data, requests: [{ ...request, itemId: 'does-not-exist' }] };
    expect(parseStoredData(JSON.stringify({ version: 1, data: dangling }))).toBeNull();
    const duplicate = { ...data, requests: [request, { ...request, id: 'another-id' }] };
    expect(parseStoredData(JSON.stringify({ version: 1, data: duplicate }))).toBeNull();
    const sharedLost = { ...data, requests: [request, { ...request, id: 'another-id', itemId: 'found-wallet-2' }] };
    expect(parseStoredData(JSON.stringify({ version: 1, data: sharedLost }))).toBeNull();
    const invalidState = { ...data, items: data.items.map(item => item.id === request.itemId ? { ...item, status: 'returned' } : item) };
    expect(parseStoredData(JSON.stringify({ version: 1, data: invalidState }))).toBeNull();
  });
});

describe('deterministic matching simulation', () => {
  it('ranks the demo wallet first with a 92-point example score', () => {
    const { items } = createSeedData();
    const lost = items.find((item) => item.id === 'lost-wallet-demo')!;
    const matches = getMatches(lost, items);
    expect(matches[0].item.id).toBe('found-wallet-1');
    expect(matches[0].score).toBe(92);
    expect(matches[0].reasons).toHaveLength(4);
    expect(matches.every((match) => match.item.type === 'found' && match.item.category === lost.category)).toBe(true);
  });

  it('excludes returned records and does not match a found item as a lost item', () => {
    const { items } = createSeedData();
    const lost = items.find((item) => item.id === 'lost-wallet-demo')!;
    items[0].status = 'returned';
    expect(getMatches(lost, items).some((match) => match.item.id === 'found-wallet-1')).toBe(false);
    expect(getMatches(items[1], items)).toEqual([]);
  });
});
