import { describe, expect, it } from 'vitest';
import { itemTypeBadge } from './itemTypeBadge';

describe('itemTypeBadge', () => {
  it('keeps lost and found badges on one shared map', () => {
    expect(itemTypeBadge('lost')).toEqual({ className: 'badge-blue', label: '찾고 있어요' });
    expect(itemTypeBadge('found')).toEqual({ className: 'badge-green', label: '주인을 찾아요' });
  });
});
