import { categories, defaultItemImage, regions } from '../data/seed';
import type { AppData, Item, NewItem, ReturnRequest, ReturnStatus } from '../types';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${globalThis.crypto.randomUUID()}`;

function notify(data: AppData, title: string, message: string): AppData {
  return {
    ...data,
    notifications: [{ id: id('notification'), title, message, createdAt: now(), read: false }, ...data.notifications].slice(0, 100),
  };
}

function requiredText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error(`${label}을(를) 확인해 주세요. (최대 ${max}자)`);
  }
  return value.trim();
}

export function registerItem(data: AppData, input: NewItem): { data: AppData; item: Item } {
  if (!['lost', 'found'].includes(input.type) || !categories.includes(input.category) || !regions.includes(input.region)) {
    throw new Error('물품 구분, 종류와 지역을 선택해 주세요.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0, 10) !== input.date) {
    throw new Error('올바른 날짜를 입력해 주세요.');
  }
  const title = requiredText(input.title, '물품 이름', 100);
  const item: Item = {
    id: id('item'), title, type: input.type, category: input.category,
    color: requiredText(input.color, '색상', 30), date: input.date, region: input.region,
    location: requiredText(input.location, '상세 장소', 200),
    description: requiredText(input.description, '상세 설명', 2000),
    image: typeof input.image === 'string' && (input.image.startsWith('/images/') || /^data:image\/(png|jpeg|webp|gif);base64,/.test(input.image))
      ? input.image : defaultItemImage(input.category, title),
    source: 'community', status: 'open', createdBy: 'demo',
    // This fixed demo clue avoids collecting real ownership/authentication data.
    secretAnswer: '파란색',
  };
  const updated = notify({
    ...data, items: [item, ...data.items],
    profile: { ...data.profile, xp: data.profile.xp + 10, registeredCount: data.profile.registeredCount + 1 },
  }, '물품 등록 완료 · +10 XP', `‘${item.title}’ ${item.type === 'lost' ? '분실물' : '습득물'}을 등록했어요.`);
  return { data: updated, item };
}

export function requestReturn(data: AppData, itemId: string, lostItemId?: string): { data: AppData; request: ReturnRequest } {
  const item = data.items.find((entry) => entry.id === itemId);
  if (!item || item.type !== 'found' || item.source !== 'community') {
    throw new Error('자체 등록된 습득물만 반환을 요청할 수 있어요.');
  }
  const existing = data.requests.find((request) => request.itemId === itemId && request.status !== 'rejected');
  if (existing) return { data, request: existing };
  if (item.status !== 'open') throw new Error('이미 반환이 완료된 물품이에요.');

  let lostItem = lostItemId ? data.items.find((entry) => entry.id === lostItemId) : undefined;
  if (lostItemId && (!lostItem || lostItem.type !== 'lost' || lostItem.status !== 'open' || lostItem.createdBy !== 'demo')) {
    throw new Error('연결할 분실물 정보를 확인해 주세요.');
  }
  if (!lostItemId) {
    const possible = data.items.filter((entry) => entry.type === 'lost' && entry.status === 'open' && entry.createdBy === 'demo' && entry.category === item.category && entry.color === item.color);
    lostItem = possible.find((entry) => entry.region === item.region) ?? possible[0];
  }
  if (lostItem && lostItem.category !== item.category) throw new Error('같은 종류의 분실물에만 반환 요청을 연결할 수 있어요.');
  if (lostItem && data.requests.some((entry) => entry.lostItemId === lostItem.id && entry.status !== 'rejected')) {
    throw new Error('이 분실물은 다른 반환 요청이 진행 중이에요. 마이페이지에서 기존 요청을 먼저 확인해 주세요.');
  }
  const timestamp = now();
  const request: ReturnRequest = {
    id: id('return'), itemId, ...(lostItem ? { lostItemId: lostItem.id } : {}),
    status: 'pending', createdAt: timestamp, updatedAt: timestamp,
  };
  return {
    data: notify({ ...data, requests: [request, ...data.requests] }, '반환 요청 접수', `‘${item.title}’의 비공개 특징을 확인해 주세요.`),
    request,
  };
}

export function verifyOwnership(data: AppData, requestId: string, answer: string): { data: AppData; verified: boolean } {
  const request = data.requests.find((entry) => entry.id === requestId);
  if (!request || request.status === 'rejected') return { data, verified: false };
  if (request.status !== 'pending') return { data, verified: true };
  const item = data.items.find((entry) => entry.id === request.itemId);
  const normalize = (text: string) => text.trim().replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
  if (!item || normalize(answer) !== normalize(item.secretAnswer ?? '파란색')) return { data, verified: false };
  return { data: transitionReturn(data, requestId, 'owner_verified'), verified: true };
}

const previousStatus: Partial<Record<ReturnStatus, ReturnStatus>> = {
  owner_verified: 'pending', approved: 'owner_verified', qr_verified: 'approved', completed: 'qr_verified',
};

/** Pure transitions are the seam for replacing this simulation with REST calls. */
export function transitionReturn(data: AppData, requestId: string, nextStatus: ReturnStatus): AppData {
  const request = data.requests.find((entry) => entry.id === requestId);
  if (!request || request.status === 'completed' || request.status === 'rejected') return data;
  if (nextStatus !== 'rejected' && previousStatus[nextStatus] !== request.status) return data;
  const item = data.items.find((entry) => entry.id === request.itemId);
  if (!item || item.status !== 'open' || item.source !== 'community') return data;
  const lostItem = request.lostItemId ? data.items.find((entry) => entry.id === request.lostItemId) : undefined;
  if (nextStatus !== 'rejected' && request.lostItemId && (!lostItem || lostItem.status !== 'open')) return data;

  let updated: AppData = {
    ...data,
    requests: data.requests.map((entry) => entry.id === requestId ? { ...entry, status: nextStatus, updatedAt: now() } : entry),
  };
  if (nextStatus === 'completed') {
    updated = {
      ...updated,
      items: updated.items.map((entry) => entry.id === request.itemId || entry.id === request.lostItemId ? { ...entry, status: 'returned' } : entry),
      profile: { ...updated.profile, xp: updated.profile.xp + 50, returnedCount: updated.profile.returnedCount + 1 },
    };
  }
  const messages: Partial<Record<ReturnStatus, [string, string]>> = {
    owner_verified: ['소유자 확인 완료', '데모 특징 확인을 마쳤어요. 관리자에게 요청 승인을 받을 수 있어요.'],
    approved: ['반환 요청 승인', '요청이 승인되었어요. 테스트 QR 인증을 진행해 주세요.'],
    qr_verified: ['테스트 QR 인증 완료', '마지막으로 관리자가 반환 완료를 확인하면 경험치가 지급돼요.'],
    completed: ['반환 완료 · +50 XP', `‘${item.title}’이 주인을 찾았어요! 마이페이지에서 경험치와 업적을 확인해 보세요.`],
    rejected: ['반환 요청 반려', '테스트 반환 요청이 반려되었어요. 물품 정보를 확인한 뒤 다시 요청할 수 있어요.'],
  };
  const message = messages[nextStatus];
  return message ? notify(updated, ...message) : updated;
}
