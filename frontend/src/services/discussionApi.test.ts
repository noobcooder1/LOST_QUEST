import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiClientError } from './apiClient';
import { loadAuthSession } from './authSession';
import { addDiscussionComment, createDiscussionPost, deleteDiscussionComment, getDiscussionPost, isDiscussionDate, listDiscussionComments, listDiscussionPosts, parseDiscussionPost } from './communityApi';
vi.mock('./apiClient', async original => ({ ...await original<typeof import('./apiClient')>(), apiRequest: vi.fn() }));
vi.mock('./authSession', () => ({ loadAuthSession: vi.fn() }));
const row = { id: 1, category: 'chat', title: '오늘의 이야기', content: '이웃과 나눠요.', authorNickname: '회원', createdAt: '2026-10-20T01:00:00Z', imageUrl: null, linkedItem: null, commentCount: 2 };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(loadAuthSession).mockReturnValue({ accessToken: 'test-only-token', expiresAt: Date.now() + 60000 }); });
describe('standalone community discussion API', () => {
  it('reads comment counts, defaulting to zero for servers that do not send one', () => {
    expect(parseDiscussionPost(row).commentCount).toBe(2);
    const { commentCount: _omitted, ...older } = row;
    expect(parseDiscussionPost(older).commentCount).toBe(0);
    expect(() => parseDiscussionPost({ ...row, commentCount: -1 })).toThrow(ApiClientError);
    expect(() => parseDiscussionPost({ ...row, commentCount: '2' })).toThrow(ApiClientError);
  });
  it('lists public comments with the viewer token and falls back to an anonymous read when it expired', async () => {
    const comment = { id: 5, content: '역무실에 문의해 보세요.', authorNickname: '이웃', createdAt: '2026-10-20T02:00:00Z', mine: false };
    vi.mocked(apiRequest).mockResolvedValueOnce([comment]);
    expect(await listDiscussionComments(3)).toEqual([comment]);
    expect(apiRequest).toHaveBeenLastCalledWith('/api/community/posts/3/comments', { accessToken: 'test-only-token' });
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiClientError('HTTP_ERROR', 'expired', 401)).mockResolvedValueOnce([]);
    expect(await listDiscussionComments(3)).toEqual([]);
    expect(apiRequest).toHaveBeenLastCalledWith('/api/community/posts/3/comments');
    vi.mocked(apiRequest).mockResolvedValueOnce([{ ...comment, mine: 'yes' }]);
    await expect(listDiscussionComments(3)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(listDiscussionComments(0)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('adds trimmed comments within the limit and deletes by post and comment id', async () => {
    const saved = { id: 6, content: '감사합니다', authorNickname: '회원', createdAt: '2026-10-20T02:00:00Z', mine: true };
    vi.mocked(apiRequest).mockResolvedValueOnce(saved);
    expect(await addDiscussionComment(3, '  감사합니다  ')).toEqual(saved);
    expect(apiRequest).toHaveBeenLastCalledWith('/api/community/posts/3/comments', { accessToken: 'test-only-token', method: 'POST', body: { content: '감사합니다' } });
    await expect(addDiscussionComment(3, '   ')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(addDiscussionComment(3, '가'.repeat(1001))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    vi.mocked(apiRequest).mockResolvedValueOnce(null);
    await deleteDiscussionComment(3, 6);
    expect(apiRequest).toHaveBeenLastCalledWith('/api/community/posts/3/comments/6', { accessToken: 'test-only-token', method: 'DELETE' });
    vi.mocked(loadAuthSession).mockReturnValue(null);
    await expect(addDiscussionComment(3, '로그인 없이')).rejects.toMatchObject({ status: 401 });
  });
  it('uses public discussion endpoints without requiring or sending credentials', async () => {
    vi.mocked(loadAuthSession).mockReturnValue(null);
    vi.mocked(apiRequest).mockResolvedValueOnce({ items: [row], page: 2, hasNext: true });
    expect((await listDiscussionPosts({ category: 'chat', q: ' 이야기 ', from: '2026-10-01', to: '2026-10-20', page: 2 })).items).toEqual([row]);
    expect(apiRequest).toHaveBeenCalledWith('/api/community/posts?category=chat&q=%EC%9D%B4%EC%95%BC%EA%B8%B0&from=2026-10-01&to=2026-10-20&page=2');
    vi.mocked(apiRequest).mockResolvedValueOnce(row); expect(await getDiscussionPost(1)).toEqual(row);
    expect(apiRequest).toHaveBeenLastCalledWith('/api/community/posts/1');
  });
  it('validates real calendar dates, date order and page bounds before requests', async () => {
    expect(isDiscussionDate('2026-02-30')).toBe(false); expect(isDiscussionDate('2024-02-29')).toBe(true);
    await expect(listDiscussionPosts({ from: '2026-02-30' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(listDiscussionPosts({ from: '2026-10-20', to: '2026-10-01' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(listDiscussionPosts({ page: -1 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(getDiscussionPost(0)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it('creates discussion JSON separately with trimmed content and no supplied author', async () => {
    vi.mocked(apiRequest).mockResolvedValue(row);
    await createDiscussionPost({ category: 'chat', title: ' 이야기 ', content: ' 본문 ', linkedItemType: 'found', linkedItemId: 9 });
    expect(apiRequest).toHaveBeenCalledWith('/api/community/posts', { accessToken: 'test-only-token', method: 'POST', body: { category: 'chat', title: '이야기', content: '본문', linkedItemType: 'found', linkedItemId: 9 } });
  });
  it('uploads the post JSON and actual photo as multipart', async () => {
    vi.mocked(apiRequest).mockResolvedValue(row);
    const photo = new File(['image-bytes'], 'photo.png', { type: 'image/png' });
    await createDiscussionPost({ category: 'info', title: '정보', content: '본문' }, photo);
    const [path, config] = vi.mocked(apiRequest).mock.lastCall!;
    expect(path).toBe('/api/community/posts'); expect(config).toMatchObject({ method: 'POST', timeoutMs: 60000, accessToken: 'test-only-token' });
    const form = config!.body as FormData;
    expect(await (form.get('post') as Blob).text()).toBe(JSON.stringify({ category: 'info', title: '정보', content: '본문' }));
    expect(await (form.get('image') as File).text()).toBe('image-bytes');
  });
  it('rejects missing session, partial links, empty content and unsupported photos', async () => {
    const input = { category: 'chat' as const, title: '이야기', content: '본문' };
    vi.mocked(loadAuthSession).mockReturnValue(null);
    await expect(createDiscussionPost(input)).rejects.toMatchObject({ status: 401 });
    vi.mocked(loadAuthSession).mockReturnValue({ accessToken: 'test-only-token', expiresAt: Date.now() + 60000 });
    await expect(createDiscussionPost({ ...input, linkedItemId: 3 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(createDiscussionPost({ ...input, content: ' ' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(createDiscussionPost(input, new File(['x'], 'bad.svg', { type: 'image/svg+xml' }))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it('rejects mixed item responses, invalid image paths and malformed linked items', () => {
    expect(() => parseDiscussionPost({ id: 1, title: '물품', itemType: 'lost' })).toThrow(ApiClientError);
    expect(() => parseDiscussionPost({ ...row, imageUrl: 'https://other.example/photo.jpg' })).toThrow(ApiClientError);
    expect(() => parseDiscussionPost({ ...row, linkedItem: { id: -1, type: 'lost', title: '물품' } })).toThrow(ApiClientError);
    expect(() => parseDiscussionPost({ ...row, createdAt: '2026-10-20T10:00:00' })).toThrow(ApiClientError);
    expect(() => parseDiscussionPost({ ...row, category: 'lost' })).toThrow(ApiClientError);
  });
});
