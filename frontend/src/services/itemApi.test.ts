import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './apiClient';
import { createServerItem, describeItemError, fromServerItem, getServerItem, listAllServerItems, parseServerRouteId, resolveServerImageUrl, toServerRouteId } from './itemApi';

const BASE = { baseUrl: 'http://localhost:8080' };
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';
const LOST = {
  id: 12, userId: 3, title: '검은색 가죽 지갑', category: '지갑', color: '검정', description: '겉면에 작은 스크래치가 있어요.',
  lostDate: '2026-09-16', region: '서울', location: '서울 성동구 서울숲역', imageUrl: null, status: 'LOST', createdAt: '2026-09-29T00:00:00Z',
};
const FOUND = {
  id: 7, userId: 4, title: '화이트 무선 이어폰', category: '전자기기', color: '흰색', description: '충전 케이스와 함께 보관 중이에요.',
  foundDate: '2026-09-21', region: '경기', location: '경기 수원시 광교중앙역', imageUrl: null, status: 'STORED', createdAt: '2026-09-29T00:00:00Z',
};
const INPUT = { title: ' 검은색 가죽 지갑 ', category: '지갑', color: ' 검정 ', description: ' 겉면에 작은 스크래치가 있어요. ', date: '2026-09-16', region: '서울', location: ' 서울 성동구 서울숲역 ' };
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('server item route ids', () => {
  it('keeps lost and found ids apart and never mistakes seed ids for server ids', () => {
    expect(toServerRouteId('lost', 12)).toBe('api-lost-12');
    expect(parseServerRouteId('api-lost-12')).toEqual({ type: 'lost', serverId: 12 });
    expect(parseServerRouteId('api-found-12')).toEqual({ type: 'found', serverId: 12 });
    for (const id of ['found-wallet-1', 'lost-wallet-demo', 'public-phone-1', 'item-abc', 'api-lost-0', 'api-lost-01', 'api-lost--1', 'api-other-1', 'api-lost-1x', undefined]) {
      expect(parseServerRouteId(id)).toBeNull();
    }
  });
});

describe('server response → Item conversion', () => {
  it('maps lost and found responses to community items with server ids and default images', () => {
    expect(fromServerItem('lost', LOST)).toEqual({
      id: 'api-lost-12', title: '검은색 가죽 지갑', type: 'lost', category: '지갑', color: '검정', date: '2026-09-16',
      region: '서울', location: '서울 성동구 서울숲역', description: '겉면에 작은 스크래치가 있어요.', image: '/images/wallet.svg',
      source: 'community', status: 'open', createdBy: 'server', serverId: 12, ownerId: 3,
    });
    expect(fromServerItem('found', FOUND)).toMatchObject({ id: 'api-found-7', type: 'found', date: '2026-09-21', status: 'open', image: '/images/earbuds.svg' });
    expect(fromServerItem('found', { ...FOUND, status: 'RETURNED' }).status).toBe('returned');
  });

  it('keeps legacy rows without a region and ignores any server image URL', () => {
    const item = fromServerItem('lost', { ...LOST, region: null, color: null, description: null, imageUrl: 'data:image/png;base64,AAAA' });
    expect(item).toMatchObject({ region: '', color: '', description: '', image: '/images/wallet.svg' });
  });

  it.each([
    null,
    { ...LOST, id: '12' },
    { ...LOST, id: 0 },
    { ...LOST, lostDate: undefined },
    { ...LOST, title: 5 },
    { ...LOST, region: 3 },
  ])('rejects malformed responses %#', (body) => {
    expect(() => fromServerItem('lost', body)).toThrow(ApiClientError);
  });
});

describe('item API requests', () => {
  it('lists lost and found items from both public endpoints without a token', async () => {
    const fetchMock = vi.fn((url: string) => Promise.resolve(jsonResponse(url.endsWith('/api/lost-items') ? [LOST] : [FOUND])));
    vi.stubGlobal('fetch', fetchMock);
    const items = await listAllServerItems(BASE);
    expect(items.map((item) => item.id)).toEqual(['api-lost-12', 'api-found-7']);
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual(['http://localhost:8080/api/found-items', 'http://localhost:8080/api/lost-items']);
    for (const [, init] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(init.headers).not.toHaveProperty('Authorization');
    }
  });

  it('fetches a detail from the endpoint matching the item type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(FOUND));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getServerItem('found', 7, BASE)).resolves.toMatchObject({ id: 'api-found-7' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/api/found-items/7');
  });

  it('reports a missing item as a 404 error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 404, code: 'NOT_FOUND', message: '분실물을 찾을 수 없습니다. id: 99' }, 404)));
    await expect(getServerItem('lost', 99, BASE)).rejects.toMatchObject({ status: 404, serverCode: 'NOT_FOUND' });
  });

  it('registers a lost item with the Bearer token and only item fields (no userId, status, or image)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(LOST, 201));
    vi.stubGlobal('fetch', fetchMock);
    await expect(createServerItem('lost', INPUT, { ...BASE, accessToken: TOKEN })).resolves.toMatchObject({ id: 'api-lost-12', serverId: 12 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8080/api/lost-items');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({
      title: '검은색 가죽 지갑', category: '지갑', color: '검정', description: '겉면에 작은 스크래치가 있어요.',
      lostDate: '2026-09-16', region: '서울', location: '서울 성동구 서울숲역',
    });
  });

  it('registers a found item with foundDate and reads the token from the session by default', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => JSON.stringify({ accessToken: TOKEN, expiresAt: Date.now() + 60_000 }),
      setItem: () => undefined,
      removeItem: () => undefined,
    });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(FOUND, 201));
    vi.stubGlobal('fetch', fetchMock);
    await createServerItem('found', INPUT, BASE);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8080/api/found-items');
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ foundDate: '2026-09-16' });
    expect(body).not.toHaveProperty('lostDate');
  });

  it('surfaces 401 and validation failures as form messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 401, code: 'UNAUTHORIZED', message: '인증이 필요한 요청입니다.' }, 401)));
    const unauthorized = await createServerItem('lost', INPUT, { ...BASE, accessToken: null }).catch((error: unknown) => error);
    expect(unauthorized).toMatchObject({ status: 401 });
    expect(describeItemError(unauthorized)).toBe('로그인이 만료되었어요. 다시 로그인한 뒤 등록해 주세요.');

    const invalid = new ApiClientError('HTTP_ERROR', '입력값을 확인해 주세요.', 400, {
      serverCode: 'VALIDATION_ERROR', fieldErrors: [{ field: 'lostDate', message: '과거 또는 현재의 날짜여야 합니다' }, { field: 'region', message: '지원하는 광역 지역' }],
    });
    expect(describeItemError(invalid)).toBe('분실 날짜: 과거 또는 현재의 날짜여야 합니다\n지역: 지원하는 광역 지역');
    expect(describeItemError(new Error('boom'))).toBe('등록하지 못했어요. 잠시 후 다시 시도해 주세요.');
  });
});

describe('uploaded item images', () => {
  const IMAGE_PATH = '/api/images/3f2b8c1e-9a4d-4b6f-8e2a-1c3d5e7f9a0b.jpg';

  it('joins a stored server image path with the API base URL', () => {
    expect(resolveServerImageUrl(IMAGE_PATH, 'http://localhost:8080/')).toBe(`http://localhost:8080${IMAGE_PATH}`);
    expect(resolveServerImageUrl('/api/images/3f2b8c1e-9a4d-4b6f-8e2a-1c3d5e7f9a0b.webp', 'https://api.example.test')).toBe('https://api.example.test/api/images/3f2b8c1e-9a4d-4b6f-8e2a-1c3d5e7f9a0b.webp');
  });

  it.each([
    null, undefined, '', 'data:image/png;base64,AAAA', 'http://evil.example/x.jpg', '//evil.example/x.jpg',
    '/api/images/../application.yml', '/api/images/photo.jpg', '/api/images/3f2b8c1e-9a4d-4b6f-8e2a-1c3d5e7f9a0b.svg',
    'C:\\uploads\\3f2b8c1e-9a4d-4b6f-8e2a-1c3d5e7f9a0b.jpg', 'javascript:alert(1)',
  ])('rejects anything but the server image path: %s', (value) => {
    expect(resolveServerImageUrl(value, 'http://localhost:8080')).toBeNull();
  });

  it('needs a configured API base URL to build the image address', () => {
    expect(resolveServerImageUrl(IMAGE_PATH, '')).toBeNull();
    expect(resolveServerImageUrl(IMAGE_PATH, 'localhost:8080')).toBeNull();
  });

  it('uses the uploaded image for an Item and falls back to the category image when imageUrl is null', () => {
    expect(fromServerItem('lost', { ...LOST, imageUrl: IMAGE_PATH }, 'http://localhost:8080').image).toBe(`http://localhost:8080${IMAGE_PATH}`);
    expect(fromServerItem('lost', { ...LOST, imageUrl: null }, 'http://localhost:8080').image).toBe('/images/wallet.svg');
    expect(fromServerItem('found', { ...FOUND, imageUrl: null }, 'http://localhost:8080').image).toBe('/images/earbuds.svg');
  });

  it('maps list and detail responses with the request base URL', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(jsonResponse(
      url.endsWith('/api/lost-items') ? [{ ...LOST, imageUrl: IMAGE_PATH }] : url.endsWith('/api/found-items') ? [FOUND] : { ...FOUND, imageUrl: IMAGE_PATH }))));
    const items = await listAllServerItems(BASE);
    expect(items.find((item) => item.type === 'lost')?.image).toBe(`http://localhost:8080${IMAGE_PATH}`);
    expect(items.find((item) => item.type === 'found')?.image).toBe('/images/earbuds.svg');
    await expect(getServerItem('found', 7, BASE)).resolves.toMatchObject({ image: `http://localhost:8080${IMAGE_PATH}` });
  });

  it('sends the chosen file as multipart with the item JSON part and the Bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ...LOST, imageUrl: IMAGE_PATH }, 201));
    vi.stubGlobal('fetch', fetchMock);
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'my photo.jpg', { type: 'image/jpeg' });

    const item = await createServerItem('lost', INPUT, { ...BASE, accessToken: TOKEN, image: photo });
    expect(item.image).toBe(`http://localhost:8080${IMAGE_PATH}`);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8080/api/lost-items');
    expect(init.method).toBe('POST');
    // The browser must set the multipart boundary itself, so no Content-Type is forced.
    expect(init.headers).toEqual({ Accept: 'application/json', Authorization: `Bearer ${TOKEN}` });
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect([...form.keys()]).toEqual(['item', 'image']);
    const itemPart = form.get('item') as Blob;
    expect(itemPart.type).toBe('application/json');
    expect(JSON.parse(await itemPart.text())).toEqual({
      title: '검은색 가죽 지갑', category: '지갑', color: '검정', description: '겉면에 작은 스크래치가 있어요.',
      lostDate: '2026-09-16', region: '서울', location: '서울 성동구 서울숲역',
    });
    const imagePart = form.get('image') as File;
    expect(imagePart.name).toBe('my photo.jpg');
    expect(imagePart.type).toBe('image/jpeg');
    expect(new Uint8Array(await imagePart.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));
  });

  it('keeps the plain JSON request when no image is chosen', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(FOUND, 201));
    vi.stubGlobal('fetch', fetchMock);
    await createServerItem('found', INPUT, { ...BASE, accessToken: TOKEN, image: null });
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(typeof init.body).toBe('string');
  });

  it('shows server image errors as photo messages', () => {
    const invalid = new ApiClientError('HTTP_ERROR', 'JPEG, PNG, WebP 이미지만 업로드할 수 있어요.', 400, { serverCode: 'INVALID_IMAGE' });
    expect(describeItemError(invalid)).toBe('사진: JPEG, PNG, WebP 이미지만 업로드할 수 있어요.');
    const tooLarge = new ApiClientError('HTTP_ERROR', '이미지는 10MB 이하만 업로드할 수 있어요.', 413, { serverCode: 'IMAGE_TOO_LARGE' });
    expect(describeItemError(tooLarge)).toBe('사진: 이미지는 10MB 이하만 업로드할 수 있어요.');
  });
});
