import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Clock3, LoaderCircle, MessageCircle, Send, Trash2, UserRound } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ApiClientError } from '../services/apiClient';
import { addDiscussionComment, deleteDiscussionComment, listDiscussionComments, MAX_COMMENT_LENGTH, type DiscussionComment } from '../services/communityApi';
import { formatRegistrationTime } from '../services/dateTime';
import './CommunityComments.css';

const message = (cause: unknown, fallback: string) => cause instanceof ApiClientError ? cause.message : fallback;

/** Public replies under a discussion post. Writing needs a login; only the author (or an admin) deletes. */
export default function CommunityComments({ postId, initialCount }: { postId: number; initialCount: number }) {
  const { isLoggedIn } = useApp();
  const [comments, setComments] = useState<DiscussionComment[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    void listDiscussionComments(postId).then(value => { if (!cancelled) setComments(value); })
      .catch(cause => { if (!cancelled) setLoadError(message(cause, '댓글을 불러오지 못했어요.')); });
    return () => { cancelled = true; };
  }, [postId, isLoggedIn, retry]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!draft.trim()) { setFormError('댓글 내용을 입력해 주세요.'); return; }
    setSubmitting(true); setFormError('');
    try {
      const saved = await addDiscussionComment(postId, draft);
      setComments(previous => [...(previous ?? []), saved]); setDraft('');
    } catch (cause) {
      setFormError(message(cause, '댓글을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.'));
    } finally { setSubmitting(false); }
  }

  async function remove(comment: DiscussionComment) {
    if (deleting !== null || !window.confirm('이 댓글을 삭제할까요?')) return;
    setDeleting(comment.id); setFormError('');
    try {
      await deleteDiscussionComment(postId, comment.id);
      setComments(previous => (previous ?? []).filter(value => value.id !== comment.id));
    } catch (cause) {
      setFormError(message(cause, '댓글을 삭제하지 못했어요.'));
    } finally { setDeleting(null); }
  }

  const count = comments?.length ?? initialCount;
  return <section className="discussion-comments" aria-labelledby="discussion-comments-heading">
    <h2 id="discussion-comments-heading"><MessageCircle size={18} aria-hidden="true" />댓글 <span>{count}</span></h2>
    {loadError ? <div className="discussion-comments-error" role="alert"><p>{loadError}</p><button type="button" className="text-link" onClick={() => setRetry(value => value + 1)}>다시 시도</button></div>
      : comments === null ? <p className="discussion-comments-status" role="status"><LoaderCircle size={16} className="spin" aria-hidden="true" />댓글을 불러오고 있어요.</p>
      : comments.length === 0 ? <p className="discussion-comments-status">아직 댓글이 없어요. 첫 댓글을 남겨 보세요.</p>
      : <ol className="discussion-comment-list">{comments.map(comment => {
        const time = formatRegistrationTime(comment.createdAt);
        return <li key={comment.id} className={comment.mine ? 'mine' : undefined}>
          <div className="discussion-comment-meta"><strong><UserRound size={14} aria-hidden="true" />{comment.authorNickname}</strong>{time && <span><Clock3 size={13} aria-hidden="true" /><time dateTime={comment.createdAt}>{time.replace(/:\d{2}$/, '')}</time></span>}
            {comment.mine && <button type="button" className="discussion-comment-delete" aria-label={`${comment.authorNickname}의 댓글 삭제`} disabled={deleting === comment.id} onClick={() => void remove(comment)}><Trash2 size={14} aria-hidden="true" />삭제</button>}</div>
          <p>{comment.content}</p>
        </li>;
      })}</ol>}
    {isLoggedIn ? <form className="discussion-comment-form" onSubmit={event => void submit(event)}>
      <label className="sr-only" htmlFor="discussion-comment-input">댓글 내용</label>
      <textarea id="discussion-comment-input" value={draft} maxLength={MAX_COMMENT_LENGTH} rows={3} placeholder="따뜻한 댓글을 남겨 주세요. 연락처는 공개 댓글 대신 비공개 질문을 이용해 주세요."
        onChange={event => { setDraft(event.target.value); if (formError) setFormError(''); }} />
      <div className="discussion-comment-actions"><small>{draft.length.toLocaleString('ko-KR')} / {MAX_COMMENT_LENGTH.toLocaleString('ko-KR')}</small>
        <button type="submit" className="button button-primary" disabled={submitting}>{submitting ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}댓글 등록</button></div>
      {formError && <p className="field-error" role="alert">{formError}</p>}
    </form>
      : <div className="discussion-comment-login"><p>댓글은 로그인한 뒤 남길 수 있어요.</p><Link className="button button-secondary" to={`/login?returnTo=${encodeURIComponent(`/community/posts/${postId}`)}`}>로그인하고 댓글 쓰기</Link></div>}
  </section>;
}
