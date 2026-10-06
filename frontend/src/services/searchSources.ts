import type { Item } from '../types';
import { ApiClientError } from './apiClient';
import type { PolicePage, PoliceQuery } from './publicItemApi';

/**
 * The search page combines three independent sources. Each one loads and fails on its own, so a 경찰청
 * outage never hides LOST QUEST items and vice versa. There is no seed fallback for failures.
 */
export type SourceKey = 'community' | 'policeLost' | 'policeFound';

export interface SourceState {
  /** 'unsupported': the chosen conditions cannot be applied to this source (e.g. color on 경찰청 lost items). */
  status: 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';
  items: Item[];
  error: string;
  /** Police only: upstream paging. */
  page: number;
  totalPages: number;
  totalCount: number;
}

export const idleSource: SourceState = { status: 'idle', items: [], error: '', page: 0, totalPages: 0, totalCount: 0 };

export const SOURCE_LABELS: Record<SourceKey, string> = {
  community: 'LOST QUEST 자체 등록',
  policeLost: '경찰청 분실물',
  policeFound: '경찰청 습득물',
};

export function describeSourceError(cause: unknown): string {
  return cause instanceof ApiClientError ? cause.message : '데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
}

export interface PoliceSearchParams {
  q?: string;
  from?: string;
  to?: string;
  region?: string;
  category?: string;
  subCategory?: string;
  color?: string;
}

/**
 * Search-box text goes to the police keyword API (which supports no dates or code filters); otherwise a valid
 * date range (backend default: last 30 days) plus the chosen 경찰청 code filters.
 */
export function buildPoliceQuery(params: PoliceSearchParams): PoliceQuery {
  const q = params.q?.trim();
  if (q) return { q };
  const date = /^\d{4}-\d{2}-\d{2}$/;
  const from = params.from && date.test(params.from) ? params.from : undefined;
  const to = params.to && date.test(params.to) ? params.to : undefined;
  const range = from && to && from > to ? {} : { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  const codes = Object.fromEntries((['region', 'category', 'subCategory', 'color'] as const)
    .map((key) => [key, params[key]?.trim()] as const).filter(([, value]) => !!value));
  return { ...range, ...codes };
}

/** Lost items cannot be filtered by color upstream, so they are not shown (rather than shown unfiltered). */
export function policeLostSupport(query: PoliceQuery): { supported: true } | { supported: false; reason: string } {
  return query.color ? { supported: false, reason: '경찰청 분실물은 색상 조건을 지원하지 않아요.' } : { supported: true };
}

/** Loads one community source; failures become an error state instead of an exception. */
export async function loadCommunity(load: () => Promise<Item[]>): Promise<SourceState> {
  try {
    const items = await load();
    return { ...idleSource, status: 'ready', items, totalCount: items.length };
  } catch (cause) {
    return { ...idleSource, status: 'error', error: describeSourceError(cause) };
  }
}

/** Loads one police page and appends it to the previous items when paging further. */
export async function loadPolicePage(load: () => Promise<PolicePage>, previous: Item[] = []): Promise<SourceState> {
  try {
    const page = await load();
    const seen = new Set(previous.map((item) => item.id));
    return {
      status: 'ready',
      items: [...previous, ...page.items.filter((item) => !seen.has(item.id))],
      error: '',
      page: page.page,
      totalPages: page.totalPages,
      totalCount: page.totalCount,
    };
  } catch (cause) {
    return { ...idleSource, status: 'error', items: previous, error: describeSourceError(cause) };
  }
}

/** Items from every source that loaded, regardless of failures elsewhere. */
export function mergeSearchItems(sources: Record<SourceKey, SourceState>): Item[] {
  return [...sources.community.items, ...sources.policeLost.items, ...sources.policeFound.items];
}
