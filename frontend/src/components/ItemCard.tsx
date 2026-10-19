import { ArrowUpRight, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Item } from '../types';
import { defaultItemImage } from '../data/seed';
import ItemImage from './ItemImage';
import { formatRegistrationTime } from '../services/dateTime';

export default function ItemCard({ item, readOnly = false, returnTo }: { item: Item; readOnly?: boolean; returnTo?: string }) {
  const registeredAt = formatRegistrationTime(item.createdAt);
  const content = <>
    <div className={`item-card-image image-${item.category}`}><ItemImage src={item.image} fallbackSrc={defaultItemImage(item.category, item.title)} alt={item.image.startsWith('/images/') ? `${item.title} 예시 이미지` : `${item.title} 사진`} loading="lazy" /><span className={`badge ${item.type === 'found' ? 'badge-green' : 'badge-blue'}`}>{item.type === 'found' ? '주인을 찾아요' : '찾고 있어요'}</span><span className="item-hover-arrow"><ArrowUpRight size={18}/></span></div>
    <div className="item-card-body"><div className="item-card-tags"><span>{item.category}</span><span>{item.source === 'public' ? '경찰청 공공데이터' : item.createdBy === 'server' ? 'LOST QUEST' : 'LOST QUEST · 체험'}</span></div><h3>{item.title}</h3><p className="item-location"><MapPin size={13}/>{item.location.startsWith(item.region) ? item.location : [item.region, item.location].join(' ')}</p><div className="item-card-bottom"><span><i className={item.status === 'returned' ? 'dot-gray' : item.type === 'found' ? 'dot-green' : 'dot-blue'}/>{item.status === 'returned' ? '반환 완료' : item.type === 'found' ? '보관 중' : '탐색 중'}</span><time dateTime={item.date}>{item.type === 'found' ? '습득' : '분실'} {item.date.replaceAll('-', '.')}</time></div>{registeredAt && <p className="item-registration-time">글 등록 <time dateTime={item.createdAt}>{registeredAt}</time> (한국 시간)</p>}</div>
    {readOnly && <p className="cached-item-note">저장 당시 정보 · 상세 조회는 다시 연결 후 이용해 주세요.</p>}
  </>;
  return readOnly ? <article className="item-card item-card-readonly" aria-label={`${item.title} 저장된 목록`}>{content}</article>
    : <Link to={`/items/${item.id}`} state={returnTo ? { communityReturnTo: returnTo } : undefined} className="item-card" aria-label={`${item.title} 상세 보기`}>{content}</Link>;
}
