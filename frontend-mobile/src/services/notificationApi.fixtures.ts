/** Test fixtures shaped like /api/notifications responses. */
export const LQ_NOTIFICATION = {
  id: 5, lostItemId: 12, lostItemTitle: '검정 지갑', source: 'LOST_QUEST', foundItemId: 7, atcId: null, fdSn: null,
  foundTitle: '검은 지갑 주웠어요', foundDate: '2026-10-02', score: 98, maxScore: 100, createdAt: '2026-10-07T03:00:00Z', read: false, readAt: null,
};
export const POLICE_NOTIFICATION = {
  id: 4, lostItemId: 12, lostItemTitle: '검정 지갑', source: 'POLICE', foundItemId: null, atcId: 'F2026100600004521', fdSn: 1,
  foundTitle: '검정 반지갑', foundDate: '2026-10-03', score: 92, maxScore: 100, createdAt: '2026-10-07T02:00:00Z', read: false, readAt: null,
};
export const READ_NOTIFICATION = {
  id: 3, lostItemId: 15, lostItemTitle: '노트북 파우치', source: 'LOST_QUEST', foundItemId: 9, atcId: null, fdSn: null,
  foundTitle: '회색 파우치', foundDate: '2026-10-01', score: 78, maxScore: 100, createdAt: '2026-10-06T02:00:00Z', read: true, readAt: '2026-10-06T05:00:00Z',
};
export const LIST = { notifications: [LQ_NOTIFICATION, POLICE_NOTIFICATION, READ_NOTIFICATION], unreadCount: 2 };
export const REFRESH_POLICE_DOWN = {
  checkedLostItems: 1, throttledLostItems: 0, failedLostItems: 0, created: 1, unreadCount: 2,
  sources: [{ source: 'LOST_QUEST', status: 'OK', message: null }, { source: 'POLICE', status: 'UNAVAILABLE', message: '경찰청 공공데이터 서버에 연결할 수 없습니다.' }],
};
