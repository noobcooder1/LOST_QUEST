import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, ChevronRight, Clock3, Link2, MessageSquare, UserRound } from 'lucide-react';
import ItemImage from '../components/ItemImage';
import { ApiClientError } from '../services/apiClient';
import { COMMUNITY_CATEGORIES, getDiscussionPost, type DiscussionPost } from '../services/communityApi';
import { formatRegistrationTime } from '../services/dateTime';
import { resolveServerImageUrl } from '../services/itemApi';
import './CommunityDiscussion.css';

export default function CommunityDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const requestedReturn = location.state?.communityReturnTo;
  const returnTo = typeof requestedReturn === 'string' && /^\/community(?:\?[^#\\]*)?$/.test(requestedReturn) ? requestedReturn : '/community';
  const [post, setPost] = useState<DiscussionPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPost(null); setError(''); setLoading(true);
    const postId = id && /^[1-9]\d*$/.test(id) ? Number(id) : NaN;
    if (!Number.isSafeInteger(postId)) { setError('게시글 주소를 확인해 주세요.'); setLoading(false); return; }
    void getDiscussionPost(postId).then(value => { if (!cancelled) setPost(value); })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof ApiClientError && cause.status === 404 ? '게시글을 찾을 수 없어요. 삭제되었을 수 있어요.' : '게시글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, retry]);

  if (loading) return <div className="page-container empty-state" role="status">게시글을 불러오고 있어요.</div>;
  if (error || !post) return <div className="page-container empty-state"><span className="empty-icon"><MessageSquare size={28} /></span><h1>게시글을 확인해 주세요</h1><p role="alert">{error || '게시글을 찾을 수 없어요.'}</p><button type="button" className="button button-primary" onClick={() => setRetry(value => value + 1)}>다시 불러오기</button><Link className="text-link" to={returnTo}><ArrowLeft size={16} />커뮤니티 목록</Link></div>;

  const imageUrl = resolveServerImageUrl(post.imageUrl);
  const category = COMMUNITY_CATEGORIES.find(value => value.value === post.category)?.label ?? post.category;
  return <div className="page-container discussion-detail-page">
    <nav className="discussion-breadcrumb" aria-label="현재 위치"><Link to={returnTo}>커뮤니티</Link><ChevronRight size={14} /><span>{category}</span></nav>
    {location.state?.postCreated && <p className="discussion-created-note" role="status">게시글이 등록되었어요. 이웃들과 이야기를 나눠 보세요.</p>}
    <article className="card discussion-article">
      <header className="discussion-article-header"><span className={`badge discussion-category-badge discussion-category-${post.category}`}>{category}</span><h1>{post.title}</h1><div className="discussion-article-meta"><span><UserRound size={15} />{post.authorNickname}</span><span><Clock3 size={15} /><time dateTime={post.createdAt}>{formatRegistrationTime(post.createdAt) ?? '작성 시간 확인 중'}</time></span></div></header>
      <div className="discussion-article-body"><p>{post.content}</p>{imageUrl && <figure className="discussion-article-photo"><ItemImage src={imageUrl} fallbackSrc="" alt={`${post.title} 첨부 사진`} /></figure>}</div>
      {post.linkedItem && <section className="discussion-linked-card" aria-labelledby="discussion-linked-heading"><span className="discussion-linked-icon"><Link2 size={22} /></span><div><h2 id="discussion-linked-heading">함께 볼 물품글</h2><p><span>{post.linkedItem.type === 'lost' ? '분실물' : '습득물'}</span>{post.linkedItem.title}</p></div><Link className="button button-secondary" to={`/items/api-${post.linkedItem.type}-${post.linkedItem.id}`} state={{ communityReturnTo: `/community/posts/${post.id}`, communityListReturnTo: returnTo }}>물품글 보기 <ArrowUpRight size={17} /></Link></section>}
      <footer className="discussion-article-footer"><Link className="button button-secondary" to={returnTo}><ArrowLeft size={17} />목록으로</Link><Link className="text-link" to="/community/write" state={{ communityReturnTo: returnTo }}>나도 글쓰기 <MessageSquare size={16} /></Link></footer>
    </article>
  </div>;
}
