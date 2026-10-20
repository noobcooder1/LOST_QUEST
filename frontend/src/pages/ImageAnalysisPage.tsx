import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ArrowRight, CheckCircle2, ChevronRight, ImagePlus, LoaderCircle, RotateCcw, ScanSearch, ShieldCheck, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { analyzeAppearance, releaseAppearanceResources } from '../features/imageAnalysis/appearance';
import { fitnessGate, ITEM_TYPES } from '../features/imageAnalysis/categories';
import { validateImageFile } from '../features/imageAnalysis/similarityMath';
import { FULL_CROP, type AppearanceResult, type Progress } from '../features/imageAnalysis/types';
import './ImageAnalysisPage.css';

const MINIMUM_SCORE = 30;

const progressLabels: Record<Progress, string> = {
  checking: 'AI 모델을 준비하고 있어요.',
  reading: '이미지 파일을 읽고 있어요.',
  imageA: '첫 번째 이미지의 특징을 추출하고 있어요.',
  imageB: '두 번째 이미지의 특징을 추출하고 있어요.',
  calculating: '외형과 색상 점수를 계산하고 있어요.',
};

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file) { setUrl(''); return; }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function UploadPanel({ label, file, category, disabled, onFile, onCategory }: {
  label: string;
  file: File | null;
  category: string;
  disabled: boolean;
  onFile: (file: File | null) => void;
  onCategory: (category: string) => void;
}) {
  const preview = useObjectUrl(file);
  const choose = (event: ChangeEvent<HTMLInputElement>) => onFile(event.target.files?.[0] ?? null);
  return <section className="analysis-upload-card">
    <div className="analysis-upload-heading"><span>{label}</span><div><strong>{label === 'A' ? '분실물 사진' : '비교할 습득물 사진'}</strong><small>{file ? file.name : '이미지를 선택해 주세요'}</small></div>{file && <button type="button" aria-label={`${label} 이미지 삭제`} onClick={() => onFile(null)} disabled={disabled}><X size={17}/></button>}</div>
    <label className={`analysis-dropzone ${file ? 'has-image' : ''}`}>
      {preview ? <img src={preview} alt={`${label} 비교 이미지 미리보기`}/> : <><span><ImagePlus size={31}/></span><strong>사진 선택</strong><small>PNG · JPEG · WebP, 최대 20MB</small></>}
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={choose} disabled={disabled}/>
    </label>
    <label className="analysis-category"><span>물품 종류</span><select value={category} onChange={(event) => onCategory(event.target.value)} disabled={disabled}><option value="auto">AI 자동 판별</option>{ITEM_TYPES.filter((item) => item.id !== 'other').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
  </section>;
}

function decisionText(result: AppearanceResult, score: number | null, reason: ReturnType<typeof fitnessGate>['reason']) {
  if (reason === 'category-unknown') return '물품 종류를 확실히 판별하지 못했어요. 종류를 직접 선택하고 다시 분석해 주세요.';
  if (reason === 'category-mismatch') return `서로 다른 종류로 판단했어요 (${result.categories[0].label} ↔ ${result.categories[1].label}).`;
  if (reason === 'appearance-low') return `같은 종류지만 외형이 많이 달라요 (기준 ${MINIMUM_SCORE}% 미만). 펼친 우산과 접힌 우산처럼 모양이 다르게 찍힌 사진은 낮게 나올 수 있어요.`;
  return `같은 종류로 판단됐으며 종합 유사도는 ${score?.toFixed(1)}%예요.`;
}

export default function ImageAnalysisPage() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [categoryA, setCategoryA] = useState('auto');
  const [categoryB, setCategoryB] = useState('auto');
  const [result, setResult] = useState<AppearanceResult | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const busy = progress !== null;

  useEffect(() => () => controller.current?.abort(), []);

  const clearResult = () => { controller.current?.abort(); setProgress(null); setResult(null); setError(''); };
  const chooseFile = (side: 'A' | 'B', file: File | null) => {
    clearResult();
    if (file) {
      try { validateImageFile(file); }
      catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); return; }
    }
    (side === 'A' ? setFileA : setFileB)(file);
  };
  const reset = () => { clearResult(); setFileA(null); setFileB(null); setCategoryA('auto'); setCategoryB('auto'); };

  const summary = useMemo(() => {
    if (!result) return null;
    // The overall score is the DINOv2 appearance only. Whole-photo color distribution mostly reflects the
    // background and lighting (e.g. the same black umbrella on white vs. wooden floor), so it is shown as a reference.
    const base = result.visualPercent;
    const gated = fitnessGate(base, result.categories, MINIMUM_SCORE);
    return { base, ...gated };
  }, [result]);

  const analyze = async (a = fileA, b = fileB) => {
    if (!a || !b || controller.current) return;
    clearResult();
    const nextController = new AbortController();
    controller.current = nextController;
    setProgress('reading');
    try {
      const next = await analyzeAppearance(a, b, [FULL_CROP, FULL_CROP], [categoryA, categoryB], setProgress, nextController.signal);
      if (!nextController.signal.aborted) setResult(next);
    } catch (reason) {
      if (!nextController.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (controller.current === nextController) { releaseAppearanceResources(); controller.current = null; setProgress(null); }
    }
  };

  return <div className="page-container image-analysis-page">
    <div className="journey-breadcrumb"><Link to="/">홈</Link><ChevronRight size={14}/><span>AI 이미지 분석</span></div>
    <div className="analysis-hero"><div><span className="eyebrow"><Sparkles size={14}/> LOCAL AI IMAGE MATCH</span><h1>두 물건이 얼마나 닮았는지<br/>사진으로 비교해 보세요.</h1><p>DINOv2가 외형과 무늬를, 색상 분석기가 색 분포를 비교하고 CLIP이 물품 종류를 확인합니다.</p></div><span className="analysis-hero-icon"><ScanSearch size={46}/></span></div>
    <div className="analysis-privacy"><ShieldCheck size={20}/><p><strong>사진은 외부 서버로 전송되지 않습니다.</strong> AI 모델을 브라우저에 불러와 이 기기 안에서만 분석하며, 결과는 동일 물품일 확률이나 소유권 증명이 아닙니다.</p></div>

    <div className="analysis-workspace">
      <UploadPanel label="A" file={fileA} category={categoryA} disabled={busy} onFile={(file) => chooseFile('A', file)} onCategory={(value) => { clearResult(); setCategoryA(value); }}/>
      <div className="analysis-center">
        {result && summary
          ? <div className="analysis-center-score" aria-label="종합 유사도"><strong>{summary.score === null ? '보류' : `${summary.score.toFixed(1)}%`}</strong><small>종합 유사도</small></div>
          : <span className="analysis-connector"><ArrowRight size={23}/></span>}
        <button type="button" className="button button-primary analysis-run" onClick={() => void analyze()} disabled={!fileA || !fileB || busy}>{busy ? <><LoaderCircle className="analysis-spin" size={18}/>분석 중</> : <><ScanSearch size={18}/>유사도 분석</>}</button>
        <small>첫 실행은 모델을 불러오느라 시간이 걸릴 수 있어요.</small>
      </div>
      <UploadPanel label="B" file={fileB} category={categoryB} disabled={busy} onFile={(file) => chooseFile('B', file)} onCategory={(value) => { clearResult(); setCategoryB(value); }}/>
    </div>

    {progress && <div className="analysis-progress-card" role="status"><LoaderCircle className="analysis-spin" size={18}/><div><strong>{progressLabels[progress]}</strong><span>이미지는 이 기기를 벗어나지 않아요.</span></div></div>}
    {error && <div className="analysis-error" role="alert"><strong>분석을 완료하지 못했어요.</strong><p>{error}</p><button type="button" onClick={() => setError('')} aria-label="오류 닫기"><X size={17}/></button></div>}

    {result && summary && <section className="analysis-results" aria-live="polite">
      <div className="analysis-result-heading"><div><span className="eyebrow">분석 결과</span><h2>{summary.score === null ? '종류 확인이 필요해요' : `${summary.score.toFixed(1)}% 유사해요`}</h2><p>{decisionText(result, summary.score, summary.reason)}</p></div><button type="button" className="button button-secondary" onClick={reset} disabled={busy}><RotateCcw size={16}/>다시 비교</button></div>
      <div className="analysis-metrics">
        <article><span>종합 유사도</span><strong>{summary.score === null ? '보류' : `${summary.score.toFixed(1)}%`}</strong><small>외형·무늬 기준</small></article>
        <article><span>외형·무늬</span><strong>{result.visualPercent.toFixed(1)}%</strong><small>DINOv2 {result.dimensions}차원 특징</small></article>
        <article className="analysis-metric-reference"><span>색상 분포 · 참고</span><strong>{result.colorPercent.toFixed(1)}%</strong><small>배경·조명에 따라 크게 달라져 종합에서 제외</small></article>
        <article><span>물품 종류</span><strong className="analysis-category-result">{result.categories[0].label}<ChevronRight size={16}/>{result.categories[1].label}</strong><small>{result.categories.every((item) => item.source === 'manual') ? '직접 선택' : 'CLIP 자동 판별 포함'}</small></article>
      </div>
      <div className="analysis-result-note"><CheckCircle2 size={18}/><p>처리 시간 {(result.totalMs / 1000).toFixed(1)}초 · 배경, 조명, 촬영 각도에 따라 점수가 달라질 수 있으므로 실제 사진과 상세 특징을 함께 확인하세요.</p></div>
    </section>}
  </div>;
}
