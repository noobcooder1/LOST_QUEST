import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import ItemCard from './ItemCard';
import ItemPhoto from './ItemPhoto';
import { fromServerItem } from '../services/itemApi';

const BASE = 'http://localhost:8080';
const IMAGE_PATH = '/api/images/3f2b8c1e-9a4d-4b6f-8e2a-1c3d5e7f9a0b.png';
const RESPONSE = {
  id: 12, userId: 3, title: '검은색 가죽 지갑', category: '지갑', color: '검정', description: '겉면에 작은 스크래치가 있어요.',
  lostDate: '2026-09-16', region: '서울', location: '서울 성동구 서울숲역', imageUrl: IMAGE_PATH, status: 'LOST', createdAt: '2026-09-29T00:00:00Z',
};

const imgSrc = (html: string) => /<img[^>]*src="([^"]*)"/.exec(html)?.[1];

describe('item images in list and detail views', () => {
  it('shows the uploaded server image on the list card', () => {
    const item = fromServerItem('lost', RESPONSE, BASE);
    const html = renderToStaticMarkup(<MemoryRouter><ItemCard item={item} /></MemoryRouter>);
    expect(imgSrc(html)).toBe(`${BASE}${IMAGE_PATH}`);
    expect(html).toContain('href="/items/api-lost-12"');
  });

  it('falls back to the category image on the list card when imageUrl is null', () => {
    const item = fromServerItem('lost', { ...RESPONSE, imageUrl: null }, BASE);
    const html = renderToStaticMarkup(<MemoryRouter><ItemCard item={item} /></MemoryRouter>);
    expect(imgSrc(html)).toBe('/images/wallet.svg');
  });

  it('shows the uploaded image with an uploaded-photo caption on the detail page', () => {
    const html = renderToStaticMarkup(<ItemPhoto item={fromServerItem('lost', RESPONSE, BASE)} />);
    expect(imgSrc(html)).toBe(`${BASE}${IMAGE_PATH}`);
    expect(html).toContain('검은색 가죽 지갑 등록 사진');
    expect(html).toContain('LOST QUEST 회원이 등록한 사진');
  });

  it('keeps the category image and explains it on the detail page when there is no photo', () => {
    const html = renderToStaticMarkup(<ItemPhoto item={fromServerItem('lost', { ...RESPONSE, imageUrl: null }, BASE)} />);
    expect(imgSrc(html)).toBe('/images/wallet.svg');
    expect(html).toContain('사진이 없어 종류별 기본 이미지로 표시해요');
  });

  it('leaves seed demo items unchanged', () => {
    const html = renderToStaticMarkup(<ItemPhoto item={{
      id: 'found-wallet-1', title: '검정 가죽 반지갑', type: 'found', category: '지갑', color: '검정', date: '2026-09-20', region: '서울',
      location: '서울 성동구 서울숲역 4번 출구', description: '예시', image: '/images/wallet.svg', source: 'community', status: 'open', createdBy: 'community',
    }} />);
    expect(imgSrc(html)).toBe('/images/wallet.svg');
    expect(html).toContain('프로토타입용 가상 물품 · 예시 이미지');
  });
});
