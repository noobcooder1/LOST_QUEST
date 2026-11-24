// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RECENT_SEARCHES_KEY,
  RECENT_SEARCHES_LIMIT,
  clearRecentSearches,
  loadRecentSearches,
  rememberSearch,
  removeRecentSearch,
} from './recentSearches';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('recentSearches', () => {
  it('returns an empty list when nothing is stored', () => {
    expect(loadRecentSearches()).toEqual([]);
  });

  it('stores newest first and de-duplicates by moving an existing term to the front', () => {
    rememberSearch('지갑');
    rememberSearch('가방');
    rememberSearch('지갑');
    expect(loadRecentSearches()).toEqual(['지갑', '가방']);
  });

  it('trims whitespace and ignores blank terms', () => {
    rememberSearch('  우산  ');
    rememberSearch('   ');
    rememberSearch('');
    expect(loadRecentSearches()).toEqual(['우산']);
  });

  it(`keeps at most ${RECENT_SEARCHES_LIMIT} terms`, () => {
    for (let i = 0; i < RECENT_SEARCHES_LIMIT + 5; i += 1) rememberSearch(`term-${i}`);
    const terms = loadRecentSearches();
    expect(terms).toHaveLength(RECENT_SEARCHES_LIMIT);
    expect(terms[0]).toBe(`term-${RECENT_SEARCHES_LIMIT + 4}`);
    expect(terms.at(-1)).toBe('term-5');
  });

  it('removes one term and can clear all', () => {
    rememberSearch('지갑');
    rememberSearch('가방');
    expect(removeRecentSearch('지갑')).toEqual(['가방']);
    expect(clearRecentSearches()).toEqual([]);
    expect(window.localStorage.getItem(RECENT_SEARCHES_KEY)).toBe('[]');
  });

  it('tolerates corrupt localStorage values', () => {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, 'not-json');
    expect(loadRecentSearches()).toEqual([]);
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify({ bad: true }));
    expect(loadRecentSearches()).toEqual([]);
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(['ok', 12, '', '  ']));
    expect(loadRecentSearches()).toEqual(['ok']);
  });
});
