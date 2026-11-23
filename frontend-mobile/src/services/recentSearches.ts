/** Local (this device only) recent search terms for the mobile catalog search. */

export const RECENT_SEARCHES_KEY = 'lostquest:recent-searches:v1';
export const RECENT_SEARCHES_LIMIT = 10;
export const RECENT_SEARCH_MAX_LENGTH = 100;

function normalize(term: string): string {
  return term.trim().slice(0, RECENT_SEARCH_MAX_LENGTH);
}

/** Reads recent terms newest-first. Invalid storage yields []. */
export function loadRecentSearches(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const terms: string[] = [];
    for (const entry of parsed) {
      if (typeof entry !== 'string') continue;
      const term = normalize(entry);
      if (!term || seen.has(term)) continue;
      seen.add(term);
      terms.push(term);
      if (terms.length >= RECENT_SEARCHES_LIMIT) break;
    }
    return terms;
  } catch {
    return [];
  }
}

function write(terms: string[]): string[] {
  const next = terms.slice(0, RECENT_SEARCHES_LIMIT);
  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // Storage may be full or blocked; still return the in-memory list for this visit.
  }
  return next;
}

/** Inserts or moves a term to the front. Empty input is ignored. */
export function rememberSearch(term: string): string[] {
  const value = normalize(term);
  if (!value) return loadRecentSearches();
  const rest = loadRecentSearches().filter(entry => entry !== value);
  return write([value, ...rest]);
}

export function removeRecentSearch(term: string): string[] {
  const value = normalize(term);
  return write(loadRecentSearches().filter(entry => entry !== value));
}

export function clearRecentSearches(): string[] {
  return write([]);
}
