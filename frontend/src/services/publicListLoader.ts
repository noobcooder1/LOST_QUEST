import { ApiClientError } from './apiClient';
import { listServerItems } from './itemApi';
import { listPoliceItems, type PoliceQuery } from './publicItemApi';
import { readPublicList, savePublicList, type PublicListData, type PublicListRequest } from './publicListCache';
import { describeSourceError, idleSource, type SourceState } from './searchSources';
import type { ItemType } from '../types';

/** Auth/validation/not-found/permission failures are never disguised as connectivity outages. */
export function isPublicConnectionFailure(error: unknown): boolean {
  if (!(error instanceof ApiClientError)) return false;
  if (error.status && [400, 401, 403, 404, 409, 422, 429].includes(error.status)) return error.gatewayError && ![400, 401, 403].includes(error.status);
  return error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT' || error.gatewayError
    || (error.code === 'HTTP_ERROR' && [500, 502, 503, 504].includes(error.status ?? 0));
}

export async function loadPublicList(request: PublicListRequest, load: () => Promise<PublicListData>): Promise<SourceState> {
  try {
    const data = await load();
    const lastSyncedAt = Date.now();
    const cacheSaved = await savePublicList(request, data, lastSyncedAt);
    return { ...idleSource, ...data, status: 'ready', dataStatus: 'live', lastSyncedAt, cacheSaved };
  } catch (error) {
    const errorMessage = describeSourceError(error);
    const connectionFailure = isPublicConnectionFailure(error);
    // Additional-page failures belong to that page; they must not replace an existing result set.
    if (!connectionFailure || (request.kind.startsWith('police') && request.page > 1)) {
      return { ...idleSource, status: 'error', dataStatus: connectionFailure ? 'unavailable' : 'request-error', error: errorMessage };
    }
    // Restore the contiguous pages actually viewed for this exact police query, without mixing queries.
    const cached = request.kind.startsWith('police')
      ? await readPublicList({ ...request, page: 1 }, Date.now(), true)
      : await readPublicList(request);
    return cached
      ? { ...idleSource, ...cached, status: 'ready', dataStatus: 'cached', lastSyncedAt: cached.updatedAt, error: errorMessage }
      : { ...idleSource, status: 'error', dataStatus: 'unavailable', error: errorMessage };
  }
}

export function loadCommunityPublicList(type: ItemType): Promise<SourceState> {
  return loadPublicList({ kind: type === 'lost' ? 'communityLost' : 'communityFound', page: 1, size: 0 }, async () => {
    const items = await listServerItems(type);
    return { items, page: 1, totalPages: 1, totalCount: items.length };
  });
}

export function loadPolicePublicList(type: ItemType, query: PoliceQuery): Promise<SourceState> {
  return loadPublicList({ kind: type === 'lost' ? 'policeLost' : 'policeFound', query: { ...query }, page: query.page ?? 1, size: query.size ?? 20 },
    () => listPoliceItems(type, query));
}
