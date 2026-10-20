// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ItemCard from './ItemCard';
import ItemImage from './ItemImage';
import ItemPhoto from './ItemPhoto';
import { fromServerItem } from '../services/itemApi';
import { fromPublicItem } from '../services/publicItemApi';
import type { Item } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BASE = 'http://localhost:8080';
// Like the broken QA cards: a valid LOST QUEST image path whose file no longer loads.
const QA_JPEG = fromServerItem('lost', {
  id: 3, userId: 1, title: 'QA 지갑 분실 JPEG', category: '지갑', color: '검정', description: '설명입니다 열 글자 이상', lostDate: '2026-10-01',
  region: '서울', location: '서울역', imageUrl: '/api/images/3f2b8c1e-9a4d-4b6f-8e2a-1c3d5e7f9a0b.jpg', status: 'LOST',
}, BASE);
const QA_WEBP = fromServerItem('lost', {
  id: 4, userId: 1, title: 'QA 가방 분실 WebP', category: '가방', color: '검정', description: '설명입니다 열 글자 이상', lostDate: '2026-10-01',
  region: '서울', location: '서울역', imageUrl: '/api/images/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.webp', status: 'LOST',
}, BASE);
const POLICE = fromPublicItem({
  source: 'POLICE', type: 'FOUND', atcId: 'F2026100500001930', fdSn: 1, title: '여성용 크로스백', category: '가방', date: '2026-10-05', storagePlace: '화산지구대',
  imageUrl: 'https://minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/F2026100500001930/1/C2026100500419868/1.do', detail: false,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (node: React.ReactNode) => act(() => root.render(<MemoryRouter>{node}</MemoryRouter>));
const img = () => container.querySelector('img');
const fail = () => act(() => { img()!.dispatchEvent(new Event('error')); });
const load = () => act(() => { img()!.dispatchEvent(new Event('load')); });
const placeholder = () => container.querySelector('[role="img"].item-image-placeholder');

describe('image load failures in list cards', () => {
  it('switches a LOST QUEST image that fails to load (404/network) to the category image', () => {
    render(<ItemCard item={QA_JPEG} />);
    expect(img()!.getAttribute('src')).toBe(`${BASE}/api/images/3f2b8c1e-9a4d-4b6f-8e2a-1c3d5e7f9a0b.jpg`);
    fail();
    expect(img()!.getAttribute('src')).toBe('/images/wallet.svg');
    expect(img()!.getAttribute('alt')).toBe('QA 지갑 분실 JPEG 사진');
    expect(placeholder()).toBeNull();
  });

  it('does the same for the WebP QA card and keeps the category of the item', () => {
    render(<ItemCard item={QA_WEBP} />);
    fail();
    expect(img()!.getAttribute('src')).toBe('/images/backpack.svg');
  });

  it('switches a failing 경찰청 image to the category image', () => {
    render(<ItemCard item={POLICE} />);
    expect(img()!.getAttribute('src')).toMatch(/^https:\/\/minwon24\.police\.go\.kr\//);
    fail();
    expect(img()!.getAttribute('src')).toBe('/images/backpack.svg');
  });

  it('shows an icon placeholder when the category image fails too, and stops there (no error loop)', () => {
    render(<ItemCard item={QA_JPEG} />);
    fail();
    fail();
    expect(img()).toBeNull();
    expect(placeholder()?.getAttribute('aria-label')).toBe('QA 지갑 분실 JPEG 사진');
    expect(placeholder()?.textContent).toContain('이미지를 불러올 수 없어요');
  });

  it('goes straight to the placeholder when the failing image already is the category image (same src never retried)', () => {
    const noPhoto: Item = { ...QA_JPEG, image: '/images/wallet.svg' };
    render(<ItemCard item={noPhoto} />);
    const seen = [img()!.getAttribute('src')];
    fail();
    expect(img()).toBeNull();
    expect(placeholder()).not.toBeNull();
    expect(seen).toEqual(['/images/wallet.svg']);
  });

  it('keeps an image that loads normally', () => {
    render(<ItemCard item={POLICE} />);
    load();
    expect(img()!.getAttribute('src')).toBe(POLICE.image);
  });

  it('starts again from the real image when the card shows a different item', () => {
    render(<ItemCard item={QA_JPEG} />);
    fail();
    expect(img()!.getAttribute('src')).toBe('/images/wallet.svg');
    render(<ItemCard item={POLICE} />);
    expect(img()!.getAttribute('src')).toBe(POLICE.image);
  });
});

describe('image load failures on the detail page', () => {
  it('falls back from a failing uploaded photo to the category image, then to the placeholder', () => {
    render(<ItemPhoto item={QA_JPEG} />);
    fail();
    expect(img()!.getAttribute('src')).toBe('/images/wallet.svg');
    fail();
    expect(img()).toBeNull();
    expect(placeholder()).not.toBeNull();
  });
});

describe('ItemImage edge cases', () => {
  it('uses the fallback for an empty src and the placeholder when both are empty', () => {
    render(<ItemImage src="" fallbackSrc="/images/keys.svg" alt="빈 이미지" />);
    expect(img()!.getAttribute('src')).toBe('/images/keys.svg');
    render(<ItemImage src=" " fallbackSrc="" alt="빈 이미지" />);
    expect(img()).toBeNull();
    expect(placeholder()?.getAttribute('aria-label')).toBe('빈 이미지');
  });

  it('never puts a disallowed URL into <img>: mappers replace it before rendering', () => {
    const evil = fromPublicItem({ source: 'POLICE', type: 'FOUND', atcId: 'F2026100500001930', fdSn: 1, title: '가방', category: '가방', imageUrl: 'javascript:alert(1)', detail: false });
    const external = fromServerItem('lost', { ...{ id: 5, userId: 1, title: '지갑', category: '지갑', lostDate: '2026-10-01', location: '서울역', status: 'LOST' }, imageUrl: 'https://evil.example/x.jpg' }, BASE);
    render(<><ItemCard item={evil} /><ItemCard item={external} /></>);
    expect([...container.querySelectorAll('img')].map((el) => el.getAttribute('src'))).toEqual(['/images/backpack.svg', '/images/wallet.svg']);
  });
});
