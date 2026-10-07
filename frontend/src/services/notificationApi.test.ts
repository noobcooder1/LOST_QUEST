import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './apiClient';
import {
  describeNotificationError, getUnreadCount, listNotifications, markAllNotificationsRead, markNotificationRead, notificationMessage,
  notificationMeta, parseNotification, refreshMatchNotifications,
} from './notificationApi';
import { LIST, LQ_NOTIFICATION, POLICE_NOTIFICATION, READ_NOTIFICATION, REFRESH_POLICE_DOWN } from './notificationApi.fixtures';

const BASE = 'http://localhost:8080';
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const config = { baseUrl: BASE, accessToken: TOKEN };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('notification parsing and wording', () => {
  it('links each source to its own detail route and to the matching page of the lost item', () => {
    expect(parseNotification(LQ_NOTIFICATION)).toMatchObject({ id: 5, source: 'LOST_QUEST', foundRouteId: 'api-found-7', matchesPath: '/matches?item=api-lost-12', read: false });
    expect(parseNotification(POLICE_NOTIFICATION).foundRouteId).toBe('police-found-F2026100600004521-1');
  });

  it('never builds a link from untrusted 경찰청 ids', () => {
    expect(parseNotification({ ...POLICE_NOTIFICATION, atcId: '../../admin' }).foundRouteId).toBeNull();
    expect(parseNotification({ ...POLICE_NOTIFICATION, atcId: 'F2026100600004521?x=1' }).foundRouteId).toBeNull();
    expect(parseNotification({ ...POLICE_NOTIFICATION, fdSn: 0 }).foundRouteId).toBeNull();
    expect(parseNotification({ ...LQ_NOTIFICATION, foundItemId: -1 }).foundRouteId).toBeNull();
  });

  it('rejects malformed notifications', () => {
    expect(() => parseNotification({ ...LQ_NOTIFICATION, score: 120 })).toThrow(ApiClientError);
    expect(() => parseNotification({ ...LQ_NOTIFICATION, source: 'AI' })).toThrow(ApiClientError);
    expect(() => parseNotification({ ...LQ_NOTIFICATION, id: '5' })).toThrow(ApiClientError);
    expect(() => parseNotification({ ...LQ_NOTIFICATION, read: 'no' })).toThrow(ApiClientError);
  });

  it('writes the message with the right particle and the score/source line', () => {
    expect(notificationMessage(parseNotification(LQ_NOTIFICATION))).toBe('등록한 ‘검정 지갑’과 유사한 습득물이 발견되었습니다.');
    expect(notificationMessage(parseNotification(READ_NOTIFICATION))).toBe('등록한 ‘노트북 파우치’와 유사한 습득물이 발견되었습니다.');
    expect(notificationMeta(parseNotification(POLICE_NOTIFICATION))).toBe('매칭도 92점 · 경찰청');
    expect(notificationMeta(parseNotification(LQ_NOTIFICATION))).toBe('매칭도 98점 · LOST QUEST');
  });
});

describe('/api/notifications requests', () => {
  it('lists with the bearer token and a bounded limit, never a user id', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json(LIST)));
    vi.stubGlobal('fetch', fetchMock);
    const result = await listNotifications({ ...config, limit: 500 });
    expect(result.unreadCount).toBe(2);
    expect(result.notifications).toHaveLength(3);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/notifications?limit=100`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(url).not.toContain('userId');
    expect(url).not.toContain(TOKEN);
  });

  it('marks one or all as read with POST and reads the unread count', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(
      url.endsWith('/5/read') ? json({ ...LQ_NOTIFICATION, read: true, readAt: '2026-10-07T04:00:00Z' })
        : url.endsWith('/read-all') ? json({ unreadCount: 0 }) : json({ unreadCount: 3 })));
    vi.stubGlobal('fetch', fetchMock);

    expect((await markNotificationRead(5, config)).read).toBe(true);
    expect(await markAllNotificationsRead(config)).toBe(0);
    expect(await getUnreadCount(config)).toBe(3);
    expect(fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit).method} ${url}`)).toEqual([
      `POST ${BASE}/api/notifications/5/read`, `POST ${BASE}/api/notifications/read-all`, `GET ${BASE}/api/notifications/unread-count`,
    ]);
  });

  it('rejects invalid ids before calling the server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    for (const id of [0, -1, 1.5, Number.NaN]) {
      await expect(markNotificationRead(id, config)).rejects.toBeInstanceOf(ApiClientError);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses a refresh where 경찰청 failed but LOST QUEST worked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(json(REFRESH_POLICE_DOWN))));
    const result = await refreshMatchNotifications(config);
    expect(result.created).toBe(1);
    expect(result.sources[1]).toEqual({ source: 'POLICE', status: 'UNAVAILABLE', message: '경찰청 공공데이터 서버에 연결할 수 없습니다.' });
  });

  it('turns 401/404 into clear messages', async () => {
    for (const [status, text] of [[401, '로그인이 만료'], [404, '알림을 찾을 수 없어요']] as const) {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(json({ status, code: 'X', message: 'server' }, status))));
      const error = await markNotificationRead(99, config).catch((caught: unknown) => caught);
      expect(describeNotificationError(error)).toContain(text);
    }
  });
});
