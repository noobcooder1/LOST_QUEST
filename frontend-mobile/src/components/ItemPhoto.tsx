import type { Item } from '../types';
import { defaultItemImage } from '../data/seed';
import ItemImage from './ItemImage';

/** Detail-page photo: an uploaded server image when present, otherwise the category/sample illustration. */
export default function ItemPhoto({ item }: { item: Item }) {
  const uploaded = (item.createdBy === 'server' || item.createdBy === 'police') && !item.image.startsWith('/images/');
  const caption = item.createdBy === 'police'
    ? uploaded ? '경찰청 공공데이터 등록 사진' : '경찰청 공공데이터 · 사진이 없어 종류별 기본 이미지로 표시해요'
    : item.createdBy !== 'server' ? '프로토타입용 가상 물품 · 예시 이미지'
    : uploaded ? 'LOST QUEST 회원이 등록한 사진' : 'LOST QUEST 등록 물품 · 사진이 없어 종류별 기본 이미지로 표시해요';
  return <div><div className="detail-photo"><ItemImage src={item.image} fallbackSrc={defaultItemImage(item.category, item.title)} alt={uploaded ? `${item.title} 등록 사진` : `${item.title} 예시 이미지`}/><span className="photo-counter">1 / 1</span></div><p className="sample-caption">{caption}</p></div>;
}
