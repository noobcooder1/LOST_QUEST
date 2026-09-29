import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, ChevronRight, ClipboardCheck, FileImage, HeartHandshake, ImagePlus, Info, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react'
import { useApp } from '../context/AppContext'
import type { Item } from '../types'
import './JourneyPages.css'

import { categories, regions } from '../data/seed'

const examples = [
  { key: 'wallet', label: '검은색 지갑', title: '검은색 가죽 지갑', category: '지갑', color: '검정', description: '검은색 반지갑입니다. 겉면에 작은 스크래치가 있고 안쪽에 카드 수납공간이 있어요.' },
  { key: 'earbuds', label: '무선 이어폰', title: '흰색 무선 이어폰', category: '전자기기', color: '흰색', description: '흰색 충전 케이스에 담긴 무선 이어폰입니다. 케이스 오른쪽 아래에 작은 흠집이 있어요.' },
  { key: 'phone', label: '스마트폰', title: '검은색 스마트폰', category: '전자기기', color: '검정', description: '투명 케이스를 씌운 검은색 스마트폰입니다. 케이스 모서리에 사용감이 조금 있어요.' },
  { key: 'backpack', label: '백팩', title: '네이비 백팩', category: '가방', color: '네이비', description: '앞쪽에 작은 포켓이 있는 네이비 백팩입니다. 지퍼에 작은 키링이 달려 있어요.' },
]

export default function RegisterPage() {
  const { isLoggedIn, addItem } = useApp()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const type: 'lost' | 'found' = params.get('type') === 'found' ? 'found' : 'lost'
  const found = type === 'found'
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState('wallet')
  const [form, setForm] = useState({ title: examples[0].title, category: examples[0].category, color: examples[0].color, date: '2026-09-16', region: '서울', location: '서울 성동구 서울숲역', description: examples[0].description, secretAnswer: '파란색' })
  const [image, setImage] = useState('/images/wallet.svg')
  const [fileName, setFileName] = useState('샘플 이미지 · 검은색 지갑')
  const [error, setError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzed, setAnalyzed] = useState(false)
  const [suggestion, setSuggestion] = useState({ title: '', category: '', color: '' })
  const [registered, setRegistered] = useState<Item | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const inputVersion = useRef(0)

  useEffect(() => { setStep(0); setRegistered(null); setError('') }, [type])

  function update(key: keyof typeof form, value: string) {
    setForm(previous => ({ ...previous, [key]: value }))
    setError('')
  }
  function chooseExample(key: string) {
    const sample = examples.find(example => example.key === key)!
    inputVersion.current += 1
    setSelected(key)
    setImage(`/images/${key}.svg`)
    setFileName(`샘플 이미지 · ${sample.label}`)
    setForm(previous => ({ ...previous, title: sample.title, category: sample.category, color: sample.color, description: sample.description }))
    setAnalyzed(false)
    setAnalyzing(false)
    setError('')
    if (fileInput.current) fileInput.current.value = ''
  }
  function choosePhoto(file?: File) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('PNG, JPG, WebP 이미지만 선택할 수 있어요.'); return }
    if (file.size > 2 * 1024 * 1024) { setError('2MB 이하의 테스트 이미지를 선택해 주세요.'); return }
    const version = ++inputVersion.current
    const reader = new FileReader()
    reader.onload = () => {
      if (version !== inputVersion.current) return
      setImage(String(reader.result))
      setFileName(file.name)
      setSelected('')
      setAnalyzed(false)
      setAnalyzing(false)
      setError('')
    }
    reader.onerror = () => setError('이미지를 읽지 못했어요. 다른 파일을 선택해 주세요.')
    reader.readAsDataURL(file)
  }
  function simulateAnalysis() {
    setAnalyzing(true)
    setAnalyzed(false)
    const version = inputVersion.current
    const sample = examples.find(example => example.key === selected)
    const nextSuggestion = sample ? { title: sample.title, category: sample.category, color: sample.color } : { title: form.title || '테스트 물품', category: form.category, color: form.color || '검정' }
    window.setTimeout(() => {
      if (version !== inputVersion.current) return
      setSuggestion(nextSuggestion)
      setAnalyzing(false)
      setAnalyzed(true)
    }, 750)
  }
  function nextStep(event: React.FormEvent) {
    event.preventDefault()
    if (!form.title.trim() || !form.color.trim() || !form.date || !form.location.trim()) { setError('물품명, 색상, 날짜와 상세 장소를 모두 입력해 주세요.'); return }
    const today = new Date(); const current = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    if (form.date > current) { setError('미래 날짜는 선택할 수 없어요.'); return }
    setError(''); setStep(1); window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting || registered) return
    if (form.description.trim().length < 10) { setError('물품을 알아볼 수 있도록 상세 설명을 10자 이상 입력해 주세요.'); return }
    if (found && !form.secretAnswer.trim()) { setError('테스트용 비공개 특징을 확인해 주세요.'); return }
    setSubmitting(true)
    try {
      const item = addItem({ ...form, title: form.title.trim(), color: form.color.trim(), location: form.location.trim(), description: form.description.trim(), type, image, source: 'community', secretAnswer: found ? form.secretAnswer.trim() : undefined })
      setRegistered(item); setStep(2); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (cause) { setError(cause instanceof Error ? cause.message : '등록하지 못했어요. 다시 시도해 주세요.') }
    finally { setSubmitting(false) }
  }

  if (!isLoggedIn) return <div className="page-container register-gate"><span className="gate-icon"><LockKeyhole size={32} /></span><span className="eyebrow">소중한 일상을 되찾는 여정</span><h1>소중한 물건을 위한 첫걸음</h1><p className="muted">물품을 등록하고 반환 과정을 확인하려면<br />테스트 계정으로 로그인해 주세요.</p><Link className="button button-primary" to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>테스트 계정으로 시작하기 <ArrowRight size={18} /></Link><Link className="text-link" to="/search">먼저 등록된 물품 둘러보기</Link><div className="gate-note"><ShieldCheck size={17} /> 실제 개인정보나 계정 가입은 필요하지 않아요.</div></div>

  return <div className="page-container register-page">
    <div className="journey-breadcrumb"><Link to="/">홈</Link><ChevronRight size={14} /><span>{found ? '습득물' : '분실물'} 등록</span></div>
    <div className="page-heading"><div><span className="eyebrow">{found ? '작은 친절로 시작되는 연결' : '다시 찾는 여정을 시작해요'}</span><h1>{found ? '주인을 기다리는 물건이 있나요?' : '어떤 물건을 잃어버리셨나요?'}</h1><p>{found ? '당신의 작은 친절이 누군가의 소중한 일상을 되찾아 줘요.' : '기억나는 단서를 남겨 주세요. 다시 만나는 여정을 함께할게요.'}</p></div><span className="badge badge-blue">프론트엔드 체험</span></div>
    <div className="register-tabs"><button className={!found ? 'active' : ''} disabled={step === 2} onClick={() => { navigate('/register?type=lost'); setStep(0); setError('') }}>분실물 등록</button><button className={found ? 'active' : ''} disabled={step === 2} onClick={() => { navigate('/register?type=found'); setStep(0); setError('') }}>습득물 등록</button></div>
    <ol className="register-steps" aria-label="등록 진행 단계">{['물품 정보', '상세 정보 및 확인', '등록 완료'].map((label, index) => <li key={label} className={step === index ? 'active' : step > index ? 'done' : ''}><span>{step > index ? <Check size={16} /> : String(index + 1).padStart(2, '0')}</span><strong>{label}</strong></li>)}</ol>

    {step === 2 && registered ? <section className="card register-success"><div className="success-illustration"><CheckCircle2 size={48} strokeWidth={1.7} /><span className="success-spark"><Sparkles size={21} /></span></div><span className="eyebrow">다시 만나는 여정의 시작</span><h2>{found ? '소중한 연결을 만들었어요!' : '물품 등록이 완료되었어요!'}</h2><p className="muted">{found ? '등록된 습득물은 전국 검색에서 확인할 수 있어요.' : '이제 등록한 단서로 비슷한 습득물을 찾아볼까요?'}<br />테스트 물품 정보는 이 브라우저에 저장돼요.</p><div className="registered-item-summary"><img src={registered.image} alt={registered.title} /><div><span className="badge badge-blue">{found ? '습득물' : '분실물'}</span><strong>{registered.title}</strong><span className="muted">{registered.region} · {registered.date}</span></div></div><div className="success-buttons">{!found && <Link className="button button-primary" to={`/matches?item=${registered.id}`}><Sparkles size={17} /> AI 자동 매칭 체험 <ArrowRight size={17} /></Link>}<Link className={`button ${found ? 'button-primary' : 'button-secondary'}`} to={`/items/${registered.id}`}>등록한 물품 보기 <ArrowRight size={17} /></Link></div><Link className="text-link" to="/mypage">마이페이지에서 활동 확인하기</Link></section> : <div className="register-layout">
      <form className="card register-form" onSubmit={step === 0 ? nextStep : submit}>
        {step === 0 ? <>
          <div className="journey-section-title"><span>01</span><div><h2>사진으로 남기는 첫 번째 단서</h2><p className="muted">물품의 전체 모습이 잘 보이는 사진을 선택해 주세요.</p></div></div>
          <div className="register-photo-row"><div className="register-photo"><img src={image} alt="등록할 물품 미리보기" /><span><FileImage size={14} /> {selected ? '가상 샘플' : '선택한 사진'}</span></div><button type="button" className="photo-upload" onClick={() => fileInput.current?.click()}><ImagePlus size={30} strokeWidth={1.6} /><strong>사진 업로드</strong><span>JPG, PNG, WebP · 최대 2MB</span></button><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="물품 사진 선택" onChange={event => choosePhoto(event.target.files?.[0])} /></div>
          <p className="photo-file-name"><Camera size={14} /> {fileName}</p>
          <div className="register-examples"><span>샘플로 빠르게 체험하기</span><div>{examples.map(example => <button type="button" key={example.key} onClick={() => chooseExample(example.key)} className={selected === example.key ? 'selected' : ''}>{example.label}</button>)}</div></div>
          <div className="analysis-panel"><div className="analysis-panel-top"><span className="analysis-icon"><Sparkles size={21} /></span><div><strong>AI가 찾아주는 물품의 특징</strong><p>선택한 샘플·입력값을 바탕으로 제안하는 시뮬레이션이에요.</p></div><span className="badge badge-blue">데모</span></div>{analyzed ? <><dl className="analysis-results"><div><dt>물품명</dt><dd>{suggestion.title}</dd></div><div><dt>종류</dt><dd>{suggestion.category}</dd></div><div><dt>색상</dt><dd>{suggestion.color}</dd></div></dl><button type="button" className="button analysis-apply" onClick={() => { setForm(previous => ({ ...previous, ...suggestion })); setError('') }}><Check size={16} /> 이 정보로 입력하기</button></> : <button type="button" disabled={analyzing} onClick={simulateAnalysis} className="button analysis-apply"><Sparkles size={16} className={analyzing ? 'pulse-icon' : ''} /> {analyzing ? '샘플 특징을 준비하고 있어요…' : 'AI 분석 시뮬레이션 실행'}</button>}</div>
          <div className="journey-section-title register-section-divider"><span>02</span><div><h2>기억나는 정보를 알려 주세요</h2><p className="muted"><span className="required-star">*</span> 표시는 필수 입력 항목이에요.</p></div></div>
          <div className="register-fields"><div className="form-field span-two"><label htmlFor="item-title">물품명 <span className="required-star">*</span></label><input id="item-title" value={form.title} onChange={event => update('title', event.target.value)} maxLength={60} placeholder="예) 검은색 가죽 지갑" required /></div><div className="form-field"><label htmlFor="item-category">종류 <span className="required-star">*</span></label><select id="item-category" value={form.category} onChange={event => update('category', event.target.value)}>{categories.map(category => <option key={category}>{category}</option>)}</select></div><div className="form-field"><label htmlFor="item-color">색상 <span className="required-star">*</span></label><input id="item-color" value={form.color} onChange={event => update('color', event.target.value)} maxLength={25} placeholder="예) 검정" required /></div><div className="form-field"><label htmlFor="item-date">{found ? '습득' : '분실'} 날짜 <span className="required-star">*</span></label><input id="item-date" type="date" value={form.date} onChange={event => update('date', event.target.value)} required /></div><div className="form-field"><label htmlFor="item-region">지역 <span className="required-star">*</span></label><select id="item-region" value={form.region} onChange={event => update('region', event.target.value)}>{regions.map(region => <option key={region}>{region}</option>)}</select></div><div className="form-field span-two"><label htmlFor="item-location">상세 장소 <span className="required-star">*</span></label><input id="item-location" value={form.location} onChange={event => update('location', event.target.value)} maxLength={100} placeholder="예) 서울 성동구 서울숲역 3번 출구" required /></div></div>
        </> : <>
          <div className="journey-section-title"><span>03</span><div><h2>물건을 알아볼 수 있는 작은 특징</h2><p className="muted">개인정보 대신 물품의 특징을 구체적으로 적어 주세요.</p></div></div>
          <div className="form-field"><label htmlFor="item-description">상세 설명 <span className="required-star">*</span></label><textarea id="item-description" rows={5} maxLength={600} minLength={10} required value={form.description} onChange={event => update('description', event.target.value)} placeholder="모양, 크기, 무늬 등 기억나는 특징을 적어 주세요." /><small className="register-character-count muted">{form.description.length} / 600</small></div>
          {found && <div className="secret-answer-panel"><div><LockKeyhole size={19} /><strong>소유자 확인을 위한 비공개 단서</strong><span className="badge badge-blue">테스트용</span></div><p>반환 요청 시 ‘물품 안쪽의 특징 색상은?’이라는 질문으로 확인해요. 실제 개인 정보는 입력하지 마세요.</p><div className="form-field"><label htmlFor="secret-answer">데모 정답 (보안 정보 저장 없음)</label><input id="secret-answer" value="파란색" readOnly /></div><small>이 값은 브라우저에서 확인할 수 있는 데모 데이터이며, 실제 보안 기능이 아니에요.</small></div>}
          <div className="register-review"><h3><ClipboardCheck size={20} /> 등록 전 한 번 더 확인해 주세요</h3><div className="register-review-item"><img src={image} alt={form.title} /><div><span className="badge badge-blue">{found ? '습득물' : '분실물'}</span><h3>{form.title}</h3><p>{form.category} · {form.color}</p></div></div><dl><div><dt>{found ? '습득' : '분실'} 날짜</dt><dd>{form.date}</dd></div><div><dt>지역 및 장소</dt><dd>{form.region} · {form.location}</dd></div></dl><p className="register-review-note"><Info size={16} /> 가상 물품으로만 체험해 주세요. 연락처·주소 등 개인정보는 입력하지 않아요.</p></div>
        </>}
        {error && <p className="field-error register-error" role="alert"><Info size={16} /> {error}</p>}
        <div className="register-actions">{step === 1 ? <button type="button" className="button button-secondary" onClick={() => { setStep(0); setError('') }}><ArrowLeft size={16} /> 이전 단계</button> : <Link to="/" className="button button-ghost">취소</Link>}<button type="submit" className="button button-primary" disabled={analyzing || submitting}>{step === 0 ? '다음 단계' : submitting ? '등록 중…' : `${found ? '습득물' : '분실물'} 등록하기`} <ArrowRight size={17} /></button></div>
      </form>
      <aside className="register-aside"><div className="register-help card"><span className="register-help-icon"><HeartHandshake size={25} /></span><h3>다시 만날 가능성을<br />조금 더 높이는 방법</h3><ul><li><CheckCircle2 size={17} /><div><strong>사진은 선명하게</strong><p>물품 전체와 눈에 띄는 특징이 잘 보이도록 올려 주세요.</p></div></li><li><CheckCircle2 size={17} /><div><strong>장소는 구체적으로</strong><p>역 이름이나 건물명 등 기억나는 단서를 남겨 주세요.</p></div></li><li><CheckCircle2 size={17} /><div><strong>특징은 자세하게</strong><p>색상, 무늬, 흠집 등 작은 차이가 중요한 단서가 돼요.</p></div></li></ul></div><div className="register-safety"><ShieldCheck size={20} /><div><strong>안심하고 체험하세요</strong><p>사진은 서버로 전송되지 않아요. 새로고침 후 업로드 사진은 종류별 샘플 이미지로 표시돼요.</p><p>AI 분석과 매칭은 가상 데이터를 사용하는 시뮬레이션이에요.</p></div></div></aside>
    </div>}
  </div>
}


