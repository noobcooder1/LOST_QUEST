import { ArrowUpRight, Clock3, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { defaultItemImage } from '../data/seed';
import { formatRegistrationTime } from '../services/dateTime';
import type { Item } from '../types';
import ItemImage from './ItemImage';

export default function CommunityPost({ item, returnTo }: { item: Item; returnTo: string }) {
  const registeredAt = formatRegistrationTime(item.createdAt);
  const location = item.location.startsWith(item.region) ? item.location : [item.region, item.location].filter(Boolean).join(' ');
  const status = item.status === 'returned' ? '반환 완료' : item.type === 'found' ? '보관 중' : '찾는 중';
  return <li>
    <Link className="community-post" to={`/items/${item.id}`} state={{ communityReturnTo: returnTo }} aria-label={`${item.title} 게시글 보기`}>
      <div className="community-post-body">
        <div className="community-post-labels"><span className={`badge ${item.type === 'found' ? 'badge-green' : 'badge-blue'}`}>{item.type === 'found' ? '습득물' : '분실물'}</span><span className="community-post-category">{item.category}</span><span className={`community-post-status ${item.status === 'returned' ? 'is-returned' : ''}`}><i aria-hidden="true" />{status}</span></div>
        <h3>{item.title}</h3>
        {item.description.trim() && <p className="community-post-excerpt">{item.description}</p>}
      </div>
      <span className="community-post-thumbnail"><ItemImage src={item.image} fallbackSrc={defaultItemImage(item.category, item.title)} alt={`${item.title} ${!item.image || item.image.startsWith('/images/') ? '예시 이미지' : '사진'}`} loading="lazy" /></span>
      <div className="community-post-footer"><div className="community-post-meta">{location && <span><MapPin size={13} aria-hidden="true" />{location}</span>}{registeredAt && <span className="community-post-date"><Clock3 size={13} aria-hidden="true" />글 등록 <time dateTime={item.createdAt} title="한국 시간">{registeredAt.replace(/:\d{2}$/, '')}</time></span>}</div><span className="community-post-open" aria-hidden="true">게시글 보기<ArrowUpRight size={16} /></span></div>
    </Link>
  </li>;
}
