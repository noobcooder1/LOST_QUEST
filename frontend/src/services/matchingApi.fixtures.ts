/** Test fixtures shaped like GET /api/lost-items/{id}/matches responses (scores add up to their breakdowns). */
export const POLICE_IMAGE = 'https://minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/F2026100500001930/1/C2026100500419868/1.do';

const breakdown = (category: number, region: number | null, color: number, date: number) => [
  { key: 'category', points: category, maxPoints: 35, result: category ? 'MATCH' : 'MISMATCH', note: null },
  region === null
    ? { key: 'region', points: 0, maxPoints: 25, result: 'UNKNOWN', note: '경찰청 습득물 목록은 지역 정보를 제공하지 않습니다.' }
    : { key: 'region', points: region, maxPoints: 25, result: region ? 'MATCH' : 'MISMATCH', note: null },
  { key: 'color', points: color, maxPoints: 20, result: color ? 'MATCH' : 'MISMATCH', note: null },
  { key: 'date', points: date, maxPoints: 20, result: date === 20 ? 'MATCH' : date ? 'PARTIAL' : 'MISMATCH', note: null },
];

export const LQ_MATCH = {
  id: 'LOST_QUEST:7', source: 'LOST_QUEST', foundItemId: 7, atcId: null, fdSn: null, title: '검은 지갑 주웠어요', category: '지갑', color: '검정색',
  foundDate: '2026-09-11', region: '서울', location: '서울숲역 2번 출구', storagePlace: null,
  imageUrl: '/api/images/3f2b8c1e-9a4d-4b6f-8e2a-1c3d5e7f9a0b.jpg', score: 98, maxScore: 100,
  scoreBreakdown: breakdown(35, 25, 20, 18), reasons: ['같은 분류(지갑)', '같은 지역(서울)', '같은 색상(검정색)', '분실 1일 후 습득'],
};
export const POLICE_MATCH = {
  id: 'POLICE:F2026100500001930-1', source: 'POLICE', foundItemId: null, atcId: 'F2026100500001930', fdSn: 1, title: '검정 반지갑', category: '지갑',
  color: '블랙(검정)', foundDate: '2026-09-12', region: null, location: null, storagePlace: '성동경찰서', imageUrl: POLICE_IMAGE, score: 73, maxScore: 100,
  scoreBreakdown: breakdown(35, null, 20, 18), reasons: ['같은 분류(지갑)', '같은 색상(블랙(검정))', '분실 2일 후 습득'],
};
export const RESPONSE = {
  lostItem: { id: 12, title: '검은색 가죽 지갑', category: '지갑', color: '검정', region: '서울', lostDate: '2026-09-10' },
  maxScore: 100, minScore: 40, limit: 10, matches: [LQ_MATCH, POLICE_MATCH],
  sources: [{ source: 'LOST_QUEST', status: 'OK', candidateCount: 3, message: null }, { source: 'POLICE', status: 'OK', candidateCount: 40, message: null }],
};
