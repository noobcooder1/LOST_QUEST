import type { ItemType } from '../types';

/** Shared lost/found badge map for list cards, detail, and my registrations. */
export function itemTypeBadge(type: ItemType): { className: 'badge-blue' | 'badge-green'; label: string } {
  return type === 'found'
    ? { className: 'badge-green', label: '주인을 찾아요' }
    : { className: 'badge-blue', label: '찾고 있어요' };
}
