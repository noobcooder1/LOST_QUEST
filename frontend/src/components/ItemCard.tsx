import { ArrowUpRight, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Item } from '../types';

export default function ItemCard({ item }: { item: Item }) {
  return <Link to={`/items/${item.id}`} className="item-card" aria-label={`${item.title} 상세 보기`}>
    <div className={`item-card-image image-${item.category}`}><img src={item.image} alt={`${item.title} 예시 이미지`} loading="lazy" /><span className={`badge ${item.type === 'found' ? 'badge-green' : 'badge-blue'}`}>{item.type === 'found' ? '주인을 찾아요' : '찾고 있어요'}</span><span className="item-hover-arrow"><ArrowUpRight size={18}/></span></div>
    <div className="item-card-body"><div className="item-card-tags"><span>{item.category}</span><span>{item.source === 'public' ? '공공데이터 · 예시' : item.createdBy === 'server' ? 'LOST QUEST' : 'LOST QUEST · 체험'}</span></div><h3>{item.title}</h3><p className="item-location"><MapPin size={13}/>{item.location.startsWith(item.region) ? item.location : [item.region, item.location].join(' ')}</p><div className="item-card-bottom"><span><i className={item.status === 'returned' ? 'dot-gray' : item.type === 'found' ? 'dot-green' : 'dot-blue'}/>{item.status === 'returned' ? '반환 완료' : item.type === 'found' ? '보관 중' : '탐색 중'}</span><time dateTime={item.date}>{item.date.replaceAll('-', '.')}</time></div></div>
  </Link>;
}
