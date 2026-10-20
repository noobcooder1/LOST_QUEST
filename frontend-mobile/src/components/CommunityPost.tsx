import { ArrowUpRight, Clock3, Link2, MessageCircle, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { COMMUNITY_CATEGORIES, type DiscussionPost } from '../services/communityApi';
import { formatRegistrationTime } from '../services/dateTime';
import { resolveServerImageUrl, toServerRouteId } from '../services/itemApi';
import ItemImage from './ItemImage';

export default function CommunityPost({ post, returnTo }: { post: DiscussionPost; returnTo: string }) {
  const createdAt = formatRegistrationTime(post.createdAt);
  const image = resolveServerImageUrl(post.imageUrl);
  const detailTo = `/community/posts/${post.id}`;
  const category = COMMUNITY_CATEGORIES.find(category => category.value === post.category)?.label;
  return <li>
    <Link className={`community-post${image ? ' has-photo' : ''}`} to={detailTo} state={{ communityReturnTo: returnTo }} aria-label={`${post.title} 게시글 보기`}>
      <div className="community-post-body">
        <div className="community-post-labels"><span className={`badge ${post.category === 'story' ? 'badge-green' : 'badge-blue'}`}>{category}</span>{post.linkedItem && <span className="community-post-category"><Link2 size={12} aria-hidden="true" />관련 물품</span>}</div>
        <h3>{post.title}</h3><p className="community-post-excerpt">{post.content}</p>
      </div>
      {image && <span className="community-post-thumbnail"><ItemImage src={image} fallbackSrc="" alt={`${post.title} 첨부 사진`} loading="lazy" /></span>}
      <div className="community-post-footer"><div className="community-post-meta"><span><UserRound size={13} aria-hidden="true" />{post.authorNickname}</span>{createdAt && <span className="community-post-date"><Clock3 size={13} aria-hidden="true" /><time dateTime={post.createdAt} title="한국 시간">{createdAt.replace(/:\d{2}$/, '')}</time></span>}{post.commentCount > 0 && <span className="community-post-comments"><MessageCircle size={13} aria-hidden="true" />댓글 {post.commentCount}</span>}</div><span className="community-post-open" aria-hidden="true">이야기 읽기<ArrowUpRight size={16} /></span></div>
    </Link>
    {post.linkedItem && <div className="community-post-related"><span><Link2 size={15} aria-hidden="true" /><span>{post.linkedItem.title}</span></span><Link to={`/items/${toServerRouteId(post.linkedItem.type, post.linkedItem.id)}`} state={{ communityReturnTo: detailTo, communityListReturnTo: returnTo }}>물품글 보기<ArrowUpRight size={14} aria-hidden="true" /></Link></div>}
  </li>;
}
