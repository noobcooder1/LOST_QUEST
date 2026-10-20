import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight, ImagePlus, Info, LockKeyhole, Pencil, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import ItemImage from '../components/ItemImage';
import { useApp } from '../context/AppContext';
import { categories, defaultItemImage, regions } from '../data/seed';
import { ApiClientError } from '../services/apiClient';
import { todayInKorea } from '../services/dateTime';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, describeItemMutationError, getServerItem, parseServerRouteId, updateServerItem, type CreateItemInput } from '../services/itemApi';
import type { Item } from '../types';
import './JourneyPages.css';
import './EditItemPage.css';

type EditForm = Required<CreateItemInput>;
const emptyForm: EditForm = { title: '', category: '', color: '', description: '', date: '', region: '', location: '', ownershipQuestion: '', ownershipAnswer: '' };

export default function EditItemPage() {
  const { id } = useParams();
  const { authUser, authChecking, isLoggedIn, logout } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const route = parseServerRouteId(id);
  const detailPath = `/items/${id ?? ''}`;
  const [item, setItem] = useState<Item | null>(null);
  const [form, setForm] = useState<EditForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [editOwnership, setEditOwnership] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [removeImage, setRemoveImage] = useState(false);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const inputVersion = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const ownershipInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const serverRoute = parseServerRouteId(id);
    setItem(null); setLoadError(''); setError(''); setLoading(true);
    setEditOwnership(false); setImageFile(null); setImagePreview(''); setRemoveImage(false); setReadingPhoto(false);
    inputVersion.current += 1;
    if (authChecking || !isLoggedIn || !serverRoute) { setLoading(false); return; }
    void getServerItem(serverRoute.type, serverRoute.serverId).then(value => {
      if (cancelled) return;
      setItem(value);
      setForm({ title: value.title, category: value.category, color: value.color, description: value.description,
        date: value.date, region: value.region, location: value.location, ownershipQuestion: value.ownershipQuestion ?? '', ownershipAnswer: '' });
    }).catch(cause => {
      if (cancelled) return;
      setLoadError(cause instanceof ApiClientError && cause.status === 404
        ? '물품글을 찾을 수 없어요. 이미 삭제되었을 수 있어요.'
        : '물품 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; inputVersion.current += 1; };
  }, [id, authUser?.id, authChecking, isLoggedIn, retry]);

  useEffect(() => {
    if (location.hash !== '#ownership' || item?.type !== 'found' || item.ownerId !== authUser?.id || item.status !== 'open') return;
    setEditOwnership(true);
    const frame = requestAnimationFrame(() => {
      document.getElementById('ownership')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      ownershipInput.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.hash, item?.id, item?.status, authUser?.id]);

  function update(key: keyof EditForm, value: string) {
    setForm(previous => ({ ...previous, [key]: value }));
    setError('');
  }

  function choosePhoto(file?: File) {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) { setError('PNG, JPG, WebP 이미지만 선택할 수 있어요.'); return; }
    if (file.size > MAX_IMAGE_BYTES) { setError('10MB 이하의 이미지를 선택해 주세요.'); return; }
    const version = ++inputVersion.current;
    setReadingPhoto(true); setError('');
    const reader = new FileReader();
    reader.onload = () => {
      if (version !== inputVersion.current) return;
      setImagePreview(String(reader.result)); setImageFile(file); setRemoveImage(false); setReadingPhoto(false);
    };
    reader.onerror = () => {
      if (version !== inputVersion.current) return;
      setReadingPhoto(false); setError('이미지를 읽지 못했어요. 다른 파일을 선택해 주세요.');
    };
    reader.readAsDataURL(file);
  }

  function resetPhoto(remove: boolean) {
    inputVersion.current += 1;
    setImageFile(null); setImagePreview(''); setRemoveImage(remove); setReadingPhoto(false); setError('');
    if (fileInput.current) fileInput.current.value = '';
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current || readingPhoto || !route || !item || item.ownerId !== authUser?.id || item.status !== 'open') return;
    if (!form.title.trim() || !form.category || !form.color.trim() || !form.date || !form.region || !form.location.trim()) {
      setError('물품명, 종류, 색상, 날짜, 지역과 상세 장소를 모두 입력해 주세요.'); return;
    }
    if (form.date > todayInKorea()) { setError('미래 날짜는 선택할 수 없어요.'); return; }
    if (form.description.trim().length < 10) { setError('물품을 알아볼 수 있도록 상세 설명을 10자 이상 입력해 주세요.'); return; }
    if (item.type === 'found' && editOwnership && (!form.ownershipQuestion.trim() || !form.ownershipAnswer.trim())) {
      setError('소유자 확인 질문을 변경하려면 질문과 새 비공개 답변을 모두 입력해 주세요.'); return;
    }
    const input: CreateItemInput = { title: form.title, category: form.category, color: form.color, description: form.description,
      date: form.date, region: form.region, location: form.location,
      ...(item.type === 'found' && editOwnership ? { ownershipQuestion: form.ownershipQuestion, ownershipAnswer: form.ownershipAnswer } : {}) };
    submittingRef.current = true; setSubmitting(true); setError('');
    try {
      const updated = await updateServerItem(route.type, route.serverId, input, { image: imageFile, removeImage });
      window.dispatchEvent(new Event('lostquest:data-changed'));
      navigate(`/items/${updated.id}`, { replace: true, state: { itemUpdated: true } });
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401) { setSessionExpired(true); logout(); }
      setError(describeItemMutationError(cause, 'update'));
    } finally { submittingRef.current = false; setSubmitting(false); }
  }

  if (authChecking) return <div className="page-container empty-state" role="status">로그인 정보를 확인하고 있어요.</div>;
  if (!isLoggedIn) return <div className="page-container register-gate"><span className="gate-icon"><LockKeyhole size={32} /></span><h1>{sessionExpired ? '로그인이 만료되었어요' : '로그인하고 물품글을 수정하세요'}</h1><p className="muted">직접 등록한 물품글은 로그인한 뒤 수정할 수 있어요.</p><Link className="button button-primary" to={`/login?returnTo=${encodeURIComponent(location.pathname)}`}>로그인하기</Link><Link className="text-link" to={detailPath}>물품 상세로 돌아가기</Link></div>;
  if (!route) return <div className="page-container empty-state"><h1>수정할 수 없는 물품글이에요</h1><p>LOST QUEST에 직접 등록한 물품글만 수정할 수 있어요.</p><Link className="button button-secondary" to={detailPath}>물품 상세로 돌아가기</Link></div>;
  if (loading) return <div className="page-container empty-state" role="status">물품 정보를 불러오고 있어요.</div>;
  if (loadError || !item) return <div className="page-container empty-state"><h1>물품 정보를 확인해 주세요</h1><p role="alert">{loadError || '물품글을 찾을 수 없어요.'}</p><button className="button button-primary" onClick={() => setRetry(previous => previous + 1)}>다시 불러오기</button><Link className="text-link" to={detailPath}>물품 상세로 돌아가기</Link></div>;
  if (item.ownerId !== authUser?.id) return <div className="page-container empty-state"><h1>본인이 등록한 물품글만 수정할 수 있어요</h1><Link className="button button-secondary" to={detailPath}>물품 상세로 돌아가기</Link></div>;
  if (item.status !== 'open') return <div className="page-container empty-state"><h1>{item.status === 'returned' ? '반환이 완료된 물품글이에요' : '수정할 수 없는 물품글이에요'}</h1><p>처리가 완료되거나 반환 기록이 있는 물품글은 수정할 수 없어요.</p><Link className="button button-secondary" to={detailPath}>물품 상세로 돌아가기</Link></div>;

  const found = item.type === 'found';
  const fallbackImage = defaultItemImage(form.category, form.title);
  const hasOriginalPhoto = !item.image.startsWith('/images/');
  const preview = imagePreview || (removeImage || !hasOriginalPhoto ? fallbackImage : item.image);
  const busy = submitting || readingPhoto;

  return <div className="page-container register-page edit-item-page">
    <div className="journey-breadcrumb"><Link to="/">홈</Link><ChevronRight size={14} /><Link to={detailPath}>물품 상세</Link><ChevronRight size={14} /><span>물품글 수정</span></div>
    <div className="page-heading"><div><span className="eyebrow">내가 등록한 물품 관리</span><h1>물품글 수정</h1><p>{found ? '물품 정보와 사진을 수정하고, 소유자 확인 질문도 함께 관리하세요.' : '물품 정보와 사진을 수정하세요.'}</p></div><span className={`badge ${found ? 'badge-green' : 'badge-blue'}`}>{found ? '주인 찾기' : '내 물건 찾기'}</span></div>
    <div className="register-layout edit-item-layout">
      <form className="card register-form edit-item-form" onSubmit={submit}>
        <fieldset disabled={submitting}>
          <div className="journey-section-title"><span><ImagePlus size={17} /></span><div><h2>물품 사진</h2><p className="muted">기존 사진을 유지하거나 새 사진으로 바꿀 수 있어요.</p></div></div>
          <div className="edit-item-photo-row"><div className="edit-item-photo"><ItemImage src={preview} fallbackSrc={fallbackImage} alt={`${form.title || '물품'} 수정 미리보기`} /></div><div className="edit-item-photo-controls"><button type="button" className="button button-secondary" onClick={() => { if (fileInput.current) { fileInput.current.value = ''; fileInput.current.click(); } }}><ImagePlus size={17} />{hasOriginalPhoto || imageFile ? '사진 변경' : '사진 추가'}</button>{(hasOriginalPhoto || imageFile) && !removeImage && <button type="button" className="button button-ghost" onClick={() => resetPhoto(true)}><Trash2 size={16} />사진 제거</button>}{(imageFile || removeImage) && <button type="button" className="text-link" onClick={() => resetPhoto(false)}><RotateCcw size={15} />기존 사진으로 되돌리기</button>}<p className="muted">JPG, PNG, WebP · 최대 10MB</p><p className="edit-item-photo-state" role="status">{readingPhoto ? '사진을 불러오는 중…' : imageFile ? imageFile.name : removeImage ? '저장하면 사진이 제거되고 기본 이미지로 표시돼요.' : hasOriginalPhoto ? '현재 등록된 사진을 유지해요.' : '등록된 사진이 없어 기본 이미지로 표시돼요.'}</p></div><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="새 물품 사진 선택" onChange={event => choosePhoto(event.target.files?.[0])} /></div>
          <div className="journey-section-title register-section-divider"><span><Pencil size={17} /></span><div><h2>물품 정보</h2><p className="muted"><span className="required-star">*</span> 표시는 필수 입력 항목이에요.</p></div></div>
          <div className="register-fields">
            <div className="form-field span-two"><label htmlFor="edit-title">물품명 <span className="required-star">*</span></label><input id="edit-title" value={form.title} onChange={event => update('title', event.target.value)} maxLength={100} required /></div>
            <div className="form-field"><label htmlFor="edit-category">종류 <span className="required-star">*</span></label><select id="edit-category" value={form.category} onChange={event => update('category', event.target.value)} required>{!categories.includes(form.category) && <option value={form.category}>{form.category || '종류를 선택해 주세요'}</option>}{categories.map(category => <option key={category}>{category}</option>)}</select></div>
            <div className="form-field"><label htmlFor="edit-color">색상 <span className="required-star">*</span></label><input id="edit-color" value={form.color} onChange={event => update('color', event.target.value)} maxLength={30} required /></div>
            <div className="form-field"><label htmlFor="edit-date">{found ? '습득' : '분실'} 날짜 <span className="required-star">*</span></label><input id="edit-date" type="date" max={todayInKorea()} value={form.date} onChange={event => update('date', event.target.value)} required /></div>
            <div className="form-field"><label htmlFor="edit-region">지역 <span className="required-star">*</span></label><select id="edit-region" value={form.region} onChange={event => update('region', event.target.value)} required>{!regions.includes(form.region) && <option value={form.region}>{form.region || '지역을 선택해 주세요'}</option>}{regions.map(region => <option key={region}>{region}</option>)}</select></div>
            <div className="form-field span-two"><label htmlFor="edit-location">상세 장소 <span className="required-star">*</span></label><input id="edit-location" value={form.location} onChange={event => update('location', event.target.value)} maxLength={200} required /></div>
            <div className="form-field span-two"><label htmlFor="edit-description">상세 설명 <span className="required-star">*</span></label><textarea id="edit-description" rows={5} maxLength={2000} minLength={10} value={form.description} onChange={event => update('description', event.target.value)} required /><small className="register-character-count muted">{form.description.length} / 2000</small></div>
          </div>
          {found && <section id="ownership" className="secret-answer-panel edit-item-ownership" aria-labelledby="edit-ownership-heading"><div><LockKeyhole size={19} /><h2 id="edit-ownership-heading">소유자 확인 질문</h2></div><p>{item.ownershipQuestion ? <>현재 질문: <strong>{item.ownershipQuestion}</strong></> : '아직 소유자 확인 질문이 등록되지 않았어요.'}</p><label className="edit-item-ownership-toggle"><input type="checkbox" checked={editOwnership} onChange={event => { setEditOwnership(event.target.checked); setError(''); }} />{item.ownershipConfigured ? '소유자 확인 질문과 비공개 답변 변경' : '소유자 확인 질문과 비공개 답변 설정'}</label>{editOwnership ? <div className="edit-item-ownership-fields"><div className="form-field"><label htmlFor="edit-ownership-question">확인 질문 <span className="required-star">*</span></label><input ref={ownershipInput} id="edit-ownership-question" value={form.ownershipQuestion} onChange={event => update('ownershipQuestion', event.target.value)} maxLength={200} required /></div><div className="form-field"><label htmlFor="edit-ownership-answer">새 비공개 답변 <span className="required-star">*</span></label><input id="edit-ownership-answer" type="password" value={form.ownershipAnswer} onChange={event => update('ownershipAnswer', event.target.value)} maxLength={100} autoComplete="new-password" required /><small>기존 답변은 공개되지 않아요. 질문을 변경할 때 새 답변을 함께 입력해 주세요.</small></div></div> : <small>선택하지 않으면 기존 질문과 비공개 답변을 유지해요.</small>}</section>}
        </fieldset>
        {error && <p className="field-error register-error" role="alert"><Info size={16} />{error}</p>}
        <div className="register-actions"><button type="button" className="button button-secondary" disabled={submitting} onClick={() => navigate(detailPath)}><ArrowLeft size={16} />취소</button><button type="submit" className="button button-primary" disabled={busy}><Check size={17} />{submitting ? '저장 중…' : readingPhoto ? '사진을 불러오는 중…' : '수정 내용 저장'}</button></div>
      </form>
      <aside className="edit-item-aside"><div className="card edit-item-help"><span className="register-help-icon"><ShieldCheck size={25} /></span><h2>물품 정보를 한곳에서 관리해요</h2><p>사진과 설명에 알아볼 수 있는 특징을 남겨 주세요.</p>{found && <p>소유자 확인 질문은 물품 내부의 특징처럼 실제 소유자가 알 수 있는 내용으로 작성해 주세요.</p>}<p>진행 중인 반환 요청이나 반환 기록이 있는 물품글은 수정할 수 없어요.</p><Link className="text-link" to={detailPath}><ArrowLeft size={15} />물품 상세로 돌아가기</Link></div></aside>
    </div>
  </div>;
}
