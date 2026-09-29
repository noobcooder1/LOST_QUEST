import type { AppData, Item } from '../types';

export const categories = ['지갑', '전자기기', '가방', '액세서리', '기타'];
export const regions = ['서울', '경기', '부산', '인천', '대구', '대전', '광주', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];

export function defaultItemImage(category: string, title = ''): string {
  if (category === '지갑') return '/images/wallet.svg';
  if (category === '가방') return '/images/backpack.svg';
  if (category === '액세서리') return '/images/keys.svg';
  if (/이어폰|에어팟|버즈/.test(title)) return '/images/earbuds.svg';
  if (/카메라/.test(title)) return '/images/camera.svg';
  if (category === '전자기기') return '/images/phone.svg';
  return '/images/keys.svg';
}

const seedItems: Item[] = [
  {
    id: 'found-wallet-1', title: '검정 가죽 반지갑', type: 'found', category: '지갑',
    color: '검정', date: '2026-09-20', region: '서울', location: '서울 성동구 서울숲역 4번 출구',
    description: '서울숲역 근처 벤치에서 발견한 검정 가죽 지갑입니다. 겉면에 작은 스크래치가 있습니다. 소중한 물건이 주인에게 돌아가길 바라요.',
    image: '/images/wallet.svg', source: 'community', status: 'open', createdBy: 'community', secretAnswer: '파란색',
  },
  {
    id: 'found-earbuds-1', title: '화이트 무선 이어폰', type: 'found', category: '전자기기',
    color: '흰색', date: '2026-09-21', region: '서울', location: '서울 마포구 홍대입구역 인근 카페',
    description: '흰색 충전 케이스와 이어폰 한 쌍을 함께 보관하고 있습니다. 케이스에 파란색 스티커가 붙어 있어요.',
    image: '/images/earbuds.svg', source: 'community', status: 'open', createdBy: 'community', secretAnswer: '파란색',
  },
  {
    id: 'public-phone-1', title: '실버 스마트폰', type: 'found', category: '전자기기',
    color: '은색', date: '2026-09-21', region: '부산', location: '부산 해운대구 해운대역',
    description: '해운대역에서 접수한 스마트폰 예시입니다. 투명 케이스가 장착되어 있습니다. 이 정보는 실제 공공데이터가 아닌 가상 데이터입니다.',
    image: '/images/phone.svg', source: 'public', status: 'open', createdBy: 'public', agency: '해운대역 유실물 보관소 (가상)',
  },
  {
    id: 'found-backpack-1', title: '네이비 데일리 백팩', type: 'found', category: '가방',
    color: '네이비', date: '2026-09-19', region: '경기', location: '경기 수원시 광교중앙역 버스 정류장',
    description: '앞주머니가 있는 네이비색 백팩입니다. 개인 정보가 노출되지 않도록 내용물은 공개하지 않습니다.',
    image: '/images/backpack.svg', source: 'community', status: 'open', createdBy: 'demo', secretAnswer: '파란색',
  },
  {
    id: 'found-wallet-2', title: '블랙 지갑 · 브랜드 미상', type: 'found', category: '지갑',
    color: '검정', date: '2026-09-18', region: '경기', location: '경기 성남시 판교역 대합실',
    description: '대합실 의자 아래에서 발견한 작은 검정 지갑입니다. 지갑 안쪽 특징을 확인한 뒤 반환해 드릴게요.',
    image: '/images/wallet.svg', source: 'community', status: 'open', createdBy: 'community', secretAnswer: '파란색',
  },
  {
    id: 'public-keys-1', title: '키링이 달린 열쇠', type: 'found', category: '액세서리',
    color: '은색', date: '2026-09-20', region: '대구', location: '대구 중구 반월당역',
    description: '동그란 키링에 열쇠 세 개가 달린 예시 물품입니다. 실제 습득물 접수 정보가 아닙니다.',
    image: '/images/keys.svg', source: 'public', status: 'open', createdBy: 'public', agency: '반월당역 고객센터 (가상)',
  },
  {
    id: 'found-camera-1', title: '검정 미러리스 카메라', type: 'found', category: '전자기기',
    color: '검정', date: '2026-09-17', region: '제주', location: '제주 제주시 이호테우해변 주차장',
    description: '짧은 스트랩이 달린 카메라입니다. 본체의 특징을 확인한 뒤 반환할 수 있습니다.',
    image: '/images/camera.svg', source: 'community', status: 'open', createdBy: 'community', secretAnswer: '파란색',
  },
  {
    id: 'public-wallet-1', title: '브라운 가죽 지갑', type: 'found', category: '지갑',
    color: '갈색', date: '2026-09-21', region: '인천', location: '인천 남동구 인천터미널역',
    description: '갈색 가죽 장지갑 예시입니다. 공공기관 보관 물품의 이용 흐름을 보여 주는 가상 데이터입니다.',
    image: '/images/wallet.svg', source: 'public', status: 'open', createdBy: 'public', agency: '인천터미널역 유실물센터 (가상)',
  },
  {
    id: 'lost-wallet-demo', title: '검정 가죽 지갑을 찾습니다', type: 'lost', category: '지갑',
    color: '검정', date: '2026-09-16', region: '서울', location: '서울 성동구 서울숲역 일대',
    description: '서울숲을 산책한 뒤 지갑이 없어진 것을 알았습니다. 작은 검정색 반지갑이며, 겉면에 스크래치가 있습니다.',
    image: '/images/wallet.svg', source: 'community', status: 'open', createdBy: 'demo', secretAnswer: '파란색',
  },
  {
    id: 'lost-backpack-1', title: '출근길에 잃어버린 백팩', type: 'lost', category: '가방',
    color: '네이비', date: '2026-09-18', region: '대전', location: '대전 서구 정부청사역 주변',
    description: '작은 앞주머니가 있는 네이비 백팩을 찾고 있습니다. 비슷한 물건을 보셨다면 알려 주세요.',
    image: '/images/backpack.svg', source: 'community', status: 'open', createdBy: 'community', secretAnswer: '파란색',
  },
];

/** Fresh copies keep resets and tests independent of earlier mutations. */
export function createSeedData(): AppData {
  return {
    items: seedItems.map((item) => ({ ...item })),
    requests: [],
    profile: { name: '로스트헌터', xp: 320, returnedCount: 3, registeredCount: 2 },
    notifications: [{
      id: 'welcome', title: 'LOST QUEST에 오신 것을 환영해요',
      message: '검정 지갑의 반환 과정을 체험해 보세요. 데모 소유자 확인 답변은 ‘파란색’입니다.',
      createdAt: '2026-09-22T00:00:00.000Z', read: false,
    }],
  };
}
