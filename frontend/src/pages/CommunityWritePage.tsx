import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronRight, ImagePlus, Info, Link2, LockKeyhole, MessageSquare, Send, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ApiClientError } from '../services/apiClient';
import { COMMUNITY_CATEGORIES, createDiscussionPost, type DiscussionCategory } from '../services/communityApi';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, describeMyItemsError, listMyItems, parseServerRouteId } from '../services/itemApi';
import type { Item } from '../types';
import './CommunityDiscussion.css';

const fieldLabels: Record<string, string> = { category: '카테고리', title: '제목', content: '본문', linkedItemType: '연결할 물품글', linkedItemId: '연결할 물품글' };
function describeCreateError(error: unknown) {
  if (!(error instanceof ApiClientError)) return '게시글을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.';
  if (error.status === 401) return '로그인이 만료되었어요. 다시 로그인해 주세요.';
  if (error.fieldErrors.length) return error.fieldErrors.map(({ field, message }) => `${fieldLabels[field] ?? field}: ${message}`).join('\n');
  return error.message;
}

export default function CommunityWritePage() {
  const { isLoggedIn, authChecking, authUser, logout } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedReturn = location.state?.communityReturnTo;
  const returnTo = typeof requestedReturn === 'string' && /^\/community(?:\?[^#\\]*)?$/.test(requestedReturn) ? requestedReturn : '/community';
  const [category, setCategory] = useState<DiscussionCategory | ''>('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [linkEnabled, setLinkEnabled] = useState(false);
  const [linkedItemId, setLinkedItemId] = useState('');
  const [myItems, setMyItems] = useState<Item[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState('');
  const [itemsRetry, setItemsRetry] = useState(0);
  const [error, setError] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const inputVersion = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const previousAuthor = useRef(authUser?.id);
  const authorGeneration = useRef(0);
  const currentAuthor = useRef(authUser?.id);
  currentAuthor.current = authUser?.id;

  useEffect(() => {
    if (previousAuthor.current !== authUser?.id) {
      previousAuthor.current = authUser?.id;
      authorGeneration.current += 1;
      submittingRef.current = false; setSubmitting(false);
      inputVersion.current += 1;
      setCategory(''); setTitle(''); setContent(''); setImageFile(null); setImagePreview(''); setReadingPhoto(false);
      setLinkEnabled(false); setLinkedItemId(''); setMyItems([]); setError('');
      if (authUser) setSessionExpired(false);
    }
  }, [authUser]);
  useEffect(() => () => { inputVersion.current += 1; authorGeneration.current += 1; }, []);
  useEffect(() => { if (error) alertRef.current?.focus(); }, [error]);

  useEffect(() => {
    if (!linkEnabled || !isLoggedIn || authChecking || sessionExpired) return;
    let cancelled = false;
    setItemsLoading(true); setItemsError(''); setMyItems([]);
    void listMyItems().then(value => {
      if (!cancelled) setMyItems([...value.lostItems, ...value.foundItems].filter(item => !item.hidden && parseServerRouteId(item.id)));
    }).catch(cause => { if (!cancelled) setItemsError(describeMyItemsError(cause)); })
      .finally(() => { if (!cancelled) setItemsLoading(false); });
    return () => { cancelled = true; };
  }, [linkEnabled, isLoggedIn, authChecking, authUser?.id, itemsRetry, sessionExpired]);

  function choosePhoto(file?: File) {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) { setError('JPG, PNG, WebP 사진만 첨부할 수 있어요.'); return; }
    if (file.size > MAX_IMAGE_BYTES) { setError('사진은 10MB 이하로 첨부해 주세요.'); return; }
    const version = ++inputVersion.current;
    setReadingPhoto(true); setError('');
    const reader = new FileReader();
    reader.onload = () => {
      if (version !== inputVersion.current) return;
      setImageFile(file); setImagePreview(String(reader.result)); setReadingPhoto(false);
    };
    reader.onerror = () => {
      if (version !== inputVersion.current) return;
      setReadingPhoto(false); setError('사진을 읽지 못했어요. 다른 사진을 선택해 주세요.');
    };
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    inputVersion.current += 1;
    setImageFile(null); setImagePreview(''); setReadingPhoto(false); setError('');
    if (fileInput.current) fileInput.current.value = '';
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current || readingPhoto || !isLoggedIn || sessionExpired) return;
    if (!COMMUNITY_CATEGORIES.some(value => value.value === category)) { setError('게시글 카테고리를 선택해 주세요.'); return; }
    if (!title.trim() || title.trim().length > 120) { setError('제목을 1자 이상 120자 이하로 입력해 주세요.'); return; }
    if (!content.trim() || content.trim().length > 3000) { setError('본문을 1자 이상 3,000자 이하로 입력해 주세요.'); return; }
    const linked = linkEnabled ? myItems.find(item => item.id === linkedItemId) : undefined;
    const itemRef = linked ? parseServerRouteId(linked.id) : null;
    if (linkEnabled && (itemsLoading || itemsError || !itemRef)) { setError('연결할 내 물품글을 선택하거나 물품글 연결을 해제해 주세요.'); return; }
    const requestAuthor = authUser?.id;
    const requestGeneration = authorGeneration.current;
    const isCurrentRequest = () => requestGeneration === authorGeneration.current && requestAuthor === currentAuthor.current;
    submittingRef.current = true; setSubmitting(true); setError('');
    try {
      const post = await createDiscussionPost({ category: category as DiscussionCategory, title: title.trim(), content: content.trim(),
        ...(itemRef ? { linkedItemType: itemRef.type, linkedItemId: itemRef.serverId } : {}) }, imageFile);
      if (!isCurrentRequest()) return;
      navigate(`/community/posts/${post.id}`, { replace: true, state: { communityReturnTo: returnTo, postCreated: true } });
    } catch (cause) {
      if (!isCurrentRequest()) return;
      if (cause instanceof ApiClientError && cause.status === 401) { setSessionExpired(true); logout(); }
      setError(describeCreateError(cause));
    } finally { if (isCurrentRequest()) { submittingRef.current = false; setSubmitting(false); } }
  }

  if (authChecking) return <div className="page-container empty-state" role="status">로그인 정보를 확인하고 있어요.</div>;
  if (!isLoggedIn || sessionExpired) return <div className="page-container empty-state discussion-gate"><span className="empty-icon"><LockKeyhole size={29} /></span><h1>{sessionExpired ? '로그인이 만료되었어요' : '로그인하고 이야기를 나눠 보세요'}</h1><p>커뮤니티 글은 로그인한 뒤 작성할 수 있어요.</p><Link className="button button-primary" to={`/login?returnTo=${encodeURIComponent('/community/write')}`}>로그인하기</Link><Link className="text-link" to={returnTo}><ArrowLeft size={16} />커뮤니티로 돌아가기</Link></div>;

  const busy = submitting || readingPhoto;
  return <div className="page-container discussion-write-page">
    <nav className="discussion-breadcrumb" aria-label="현재 위치"><Link to={returnTo}>커뮤니티</Link><ChevronRight size={14} /><span>글쓰기</span></nav>
    <div className="page-heading discussion-heading"><span className="eyebrow"><MessageSquare size={17} />LOST QUEST 커뮤니티</span><h1>함께 나누고 싶은 이야기가 있나요?</h1><p>가벼운 일상부터 유용한 정보까지, 이웃들과 자유롭게 나눠 보세요.</p></div>
    <div className="discussion-write-layout">
      <form className="card discussion-form" noValidate onSubmit={submit} aria-busy={submitting}>
        <fieldset disabled={submitting}>
          <div className="discussion-form-intro"><h2>게시글 작성</h2><p><span aria-hidden="true">*</span> 필수 입력 항목</p></div>
          <div className="form-field discussion-category-field"><label htmlFor="discussion-category">카테고리 <span aria-hidden="true">*</span></label><select id="discussion-category" value={category} onChange={event => { setCategory(event.target.value as DiscussionCategory | ''); setError(''); }} required><option value="">이야기에 맞는 카테고리를 선택해 주세요</option>{COMMUNITY_CATEGORIES.map(value => <option key={value.value} value={value.value}>{value.label}</option>)}</select></div>
          <div className="form-field"><label htmlFor="discussion-title">제목 <span aria-hidden="true">*</span></label><input id="discussion-title" placeholder="이야기의 제목을 입력해 주세요" value={title} maxLength={120} onChange={event => { setTitle(event.target.value); setError(''); }} required /><small className="discussion-count">{title.length} / 120</small></div>
          <div className="form-field"><label htmlFor="discussion-content">본문 <span aria-hidden="true">*</span></label><textarea id="discussion-content" rows={12} placeholder={'궁금한 점이나 공유하고 싶은 이야기를 적어 주세요.\n서로를 존중하는 따뜻한 대화를 나눠요.'} value={content} maxLength={3000} onChange={event => { setContent(event.target.value); setError(''); }} required /><small className="discussion-count">{content.length.toLocaleString('ko-KR')} / 3,000</small></div>
          <section className="discussion-attachment" aria-labelledby="discussion-photo-title"><div className="discussion-section-heading"><h2 id="discussion-photo-title">사진 첨부 <span>선택</span></h2><p>JPG, PNG, WebP · 1장 · 최대 10MB</p></div><div className="discussion-photo-row">{imagePreview && <div className="discussion-photo-preview"><img src={imagePreview} alt="첨부할 사진 미리보기" /></div>}<div className="discussion-photo-controls"><button type="button" className="button button-secondary" disabled={readingPhoto} onClick={() => { if (fileInput.current) { fileInput.current.value = ''; fileInput.current.click(); } }}><ImagePlus size={18} />{imageFile ? '사진 변경' : '사진 추가'}</button>{imageFile && <button type="button" className="button button-ghost" onClick={removePhoto}><Trash2 size={16} />사진 제거</button>}<p role="status">{readingPhoto ? '사진을 불러오는 중…' : imageFile?.name ?? '사진 없이도 자유롭게 글을 쓸 수 있어요.'}</p></div></div><input ref={fileInput} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" aria-label="커뮤니티 사진 선택" onChange={event => choosePhoto(event.target.files?.[0])} /></section>
          <section className="discussion-item-link" aria-labelledby="discussion-link-title"><div className="discussion-section-heading"><h2 id="discussion-link-title"><Link2 size={18} />관련 물품글 <span>선택</span></h2><p>필요할 때만 내가 등록한 물품글을 연결해 주세요.</p></div><label className="discussion-link-toggle"><input type="checkbox" checked={linkEnabled} onChange={event => { setLinkEnabled(event.target.checked); setLinkedItemId(''); setError(''); }} />물품글 연결하기</label>{linkEnabled && <div className="discussion-link-picker">{itemsLoading ? <p role="status">내 물품글을 불러오는 중이에요.</p> : itemsError ? <div><p role="alert">{itemsError}</p><button type="button" className="text-link" onClick={() => setItemsRetry(value => value + 1)}>다시 불러오기</button></div> : myItems.length ? <div className="form-field"><label htmlFor="discussion-linked-item">연결할 내 물품글</label><select id="discussion-linked-item" value={linkedItemId} onChange={event => { setLinkedItemId(event.target.value); setError(''); }}><option value="">물품글을 선택해 주세요</option>{myItems.map(item => <option key={item.id} value={item.id}>[{item.type === 'lost' ? '내 물건 찾기' : '주인 찾기'}] {item.title}</option>)}</select><small>게시글에 물품 상세로 바로 가는 버튼이 표시돼요.</small></div> : <p>연결할 물품글이 없어요. 물품글 연결을 해제하면 바로 글을 등록할 수 있어요.</p>}</div>}</section>
        </fieldset>
        {error && <p ref={alertRef} className="field-error discussion-form-error" role="alert" tabIndex={-1}><Info size={17} /><span>{error}</span></p>}
        <div className="discussion-form-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => navigate(returnTo)}>취소</button><button type="submit" className="button button-primary" disabled={busy}><Send size={17} />{submitting ? '등록 중…' : readingPhoto ? '사진을 불러오는 중…' : '게시글 등록'}</button></div>
      </form>
      <aside className="discussion-writing-guide"><div className="card"><span className="discussion-guide-icon"><MessageSquare size={25} /></span><h2>좋은 이야기가<br />모이는 공간</h2><p>서로의 일상을 나누고, 궁금한 점을 묻고, 도움이 되는 정보를 공유해요.</p><ul><li>이야기에 맞는 카테고리를 골라 주세요.</li><li>연락처나 개인정보는 본문과 사진에 담지 않도록 주의해 주세요.</li><li>서로를 존중하는 말로 대화해 주세요.</li></ul><div className="discussion-guide-item"><strong>잃어버린 물건이나 주운 물건을 등록하려면?</strong><p>물품 정보는 물건 검색에서 따로 관리해요.</p><Link className="text-link" to="/register">물품 등록하기 <ArrowRight size={15} /></Link></div></div></aside>
    </div>
  </div>;
}
