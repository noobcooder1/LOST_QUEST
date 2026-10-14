import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiClientError } from './apiClient';
import { loadAuthSession } from './authSession';
import { answerCommunityQuestion, askCommunityQuestion, hideReportedPost, listCommunityQuestions, listCommunityReports, parseCommunityQuestion, reportCommunityPost } from './communityApi';
vi.mock('./apiClient', async original => ({ ...await original<typeof import('./apiClient')>(), apiRequest: vi.fn() }));
vi.mock('./authSession', () => ({ loadAuthSession: vi.fn() }));
const row = { id: 1, itemType: 'found', itemId: 9, itemTitle: '지갑', question: '스티커가 있나요?', answer: null, createdAt: '2026-10-13T00:00:00Z', answeredAt: null, canAnswer: false };
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(loadAuthSession).mockReturnValue({ accessToken: 'test-only-token', expiresAt: Date.now() + 60000 });
});
describe('authenticated community requests', () => {
  it('queries only private endpoints with Bearer credentials and bounded pages', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: [row], page: 0, hasNext: false });
    expect((await listCommunityQuestions('api-found-9')).items).toEqual([row]);
    expect(apiRequest).toHaveBeenCalledWith('/api/community/found/9/questions?page=0', { accessToken: 'test-only-token' });
    await listCommunityQuestions(undefined, 2);
    expect(apiRequest).toHaveBeenLastCalledWith('/api/community/questions?page=2', { accessToken: 'test-only-token' });
  });
  it('asks and answers without client-supplied author or requester identities', async () => {
    vi.mocked(apiRequest).mockResolvedValue(row);
    await askCommunityQuestion('api-lost-9', '질문');
    expect(apiRequest).toHaveBeenLastCalledWith('/api/community/lost/9/questions', { accessToken: 'test-only-token', method: 'POST', body: { message: '질문' } });
    await answerCommunityQuestion(1, '답변');
    expect(apiRequest).toHaveBeenLastCalledWith('/api/community/questions/1/answer', { accessToken: 'test-only-token', method: 'POST', body: { message: '답변' } });
  });
  it('sends reports and explicit admin hide requests with existing auth only', async () => {
    vi.mocked(apiRequest).mockResolvedValue(null);
    await reportCommunityPost('api-found-9', '신고 사유');
    expect(apiRequest).toHaveBeenLastCalledWith('/api/community/found/9/reports', { accessToken: 'test-only-token', method: 'POST', body: { message: '신고 사유' } });
    const report = { id: 1, itemType: 'found', itemId: 9, itemTitle: '지갑', reason: '신고', createdAt: row.createdAt, hiddenAt: null };
    vi.mocked(apiRequest).mockResolvedValue({ items: [report], page: 0, hasNext: false });
    expect((await listCommunityReports()).items).toEqual([report]);
    vi.mocked(apiRequest).mockResolvedValue({ ...report, hiddenAt: row.createdAt });
    await hideReportedPost(1);
    expect(apiRequest).toHaveBeenLastCalledWith('/api/community/reports/1/hide', { accessToken: 'test-only-token', method: 'POST' });
  });
  it('blocks unauthenticated writes and non-community ids before any request', async () => {
    vi.mocked(loadAuthSession).mockReturnValue(null);
    await expect(askCommunityQuestion('api-found-9', '질문')).rejects.toMatchObject({ status: 401 });
    vi.mocked(loadAuthSession).mockReturnValue({ accessToken: 'test-only-token', expiresAt: Date.now() + 60000 });
    await expect(askCommunityQuestion('police-found-F2026101200000001-1', '질문')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(listCommunityQuestions(undefined, -1)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(answerCommunityQuestion(0, '답변')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it('rejects malformed responses including a tunnel HTML page', async () => {
    vi.mocked(apiRequest).mockResolvedValue('<html>ngrok error</html>');
    await expect(listCommunityQuestions()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(() => parseCommunityQuestion({ ...row, canAnswer: 'true' })).toThrow(ApiClientError);
    expect(() => parseCommunityQuestion({ ...row, createdAt: 'invalid' })).toThrow(ApiClientError);
  });
  it('never supplies cached data or automatically replays a failed write', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new ApiClientError('NETWORK_ERROR', '연결 실패'));
    await expect(askCommunityQuestion('api-found-9', '질문')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
