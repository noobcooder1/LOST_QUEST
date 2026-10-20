import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import ItemCard from './ItemCard';
import ItemPhoto from './ItemPhoto';
import { fromPublicItem } from '../services/publicItemApi';
import { fromServerItem } from '../services/itemApi';
import { createSeedData } from '../data/seed';
import { parseStoredData, serializeData } from '../services/storage';

const IMAGE = 'https://minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/F2026100500001930/1/C2026100500419868/1.do';
const FOUND = {
  source: 'POLICE', type: 'FOUND', atcId: 'F2026100500001930', fdSn: 1, title: '여성용 크로스백', subject: '여성용 크로스백을 습득하여 보관하고 있습니다.',
  category: '가방', categoryPath: '가방 > 여성용가방', color: '블랙(검정)', date: '2026-10-05', storagePlace: '화산지구대', imageUrl: IMAGE, detail: false,
};
const LOST = { source: 'POLICE', type: 'LOST', atcId: 'L2026100500001176', fdSn: null, title: '오토바이 차키', category: '자동차', date: '2026-09-30', location: '이동 중 떨굼 추정', imageUrl: null, detail: false };
const imgSrc = (html: string) => /<img[^>]*src="([^"]*)"/.exec(html)?.[1]?.replaceAll('&amp;', '&');

describe('경찰청 items in list and detail views', () => {
  it('shows a 경찰청 found item with its real image and source label', () => {
    const html = renderToStaticMarkup(<MemoryRouter><ItemCard item={fromPublicItem(FOUND)} /></MemoryRouter>);
    expect(imgSrc(html)).toBe(IMAGE);
    expect(html).toContain('경찰청 공공데이터');
    expect(html).toContain('href="/items/police-found-F2026100500001930-1"');
    expect(html).toContain('화산지구대');
  });

  it('shows a 경찰청 lost item with the category fallback image', () => {
    const html = renderToStaticMarkup(<MemoryRouter><ItemCard item={fromPublicItem(LOST)} /></MemoryRouter>);
    expect(imgSrc(html)).toBe('/images/keys.svg');
    expect(html).toContain('경찰청 공공데이터');
  });

  it('captions 경찰청 photos and fallbacks on the detail page', () => {
    expect(renderToStaticMarkup(<ItemPhoto item={fromPublicItem(FOUND)} />)).toContain('경찰청 공공데이터 등록 사진');
    expect(renderToStaticMarkup(<ItemPhoto item={fromPublicItem(LOST)} />)).toContain('사진이 없어 종류별 기본 이미지로 표시해요');
  });

  it('keeps LOST QUEST own items labelled as before', () => {
    const own = fromServerItem('lost', { id: 3, userId: 1, title: '검정 지갑', category: '지갑', color: '검정', description: '설명입니다 열 글자', lostDate: '2026-10-01', region: '서울', location: '서울역', imageUrl: null, status: 'LOST' }, 'http://localhost:8080');
    const html = renderToStaticMarkup(<MemoryRouter><ItemCard item={own} /></MemoryRouter>);
    expect(html).toContain('>LOST QUEST<');
    expect(html).not.toContain('경찰청');
  });
});

describe('retired 공공데이터 seed', () => {
  it('no longer ships simulated public items, while LOST QUEST demo items for return/matching remain', () => {
    const seed = createSeedData();
    expect(seed.items.some((entry) => entry.source === 'public' || entry.id.startsWith('public-'))).toBe(false);
    expect(seed.items.map((entry) => entry.id)).toEqual(expect.arrayContaining(['found-wallet-1', 'lost-wallet-demo']));
  });

  it('drops simulated public items saved by earlier versions instead of resetting the whole demo', () => {
    const seed = createSeedData();
    const legacy = JSON.parse(serializeData(seed));
    legacy.data.items.push({ ...legacy.data.items[0], id: 'public-phone-1', source: 'public', createdBy: 'public', agency: '해운대역 유실물 보관소 (가상)' });
    const parsed = parseStoredData(JSON.stringify(legacy));
    expect(parsed).not.toBeNull();
    expect(parsed!.items.some((entry) => entry.source === 'public')).toBe(false);
    expect(parsed!.items).toHaveLength(seed.items.length);
  });
});
