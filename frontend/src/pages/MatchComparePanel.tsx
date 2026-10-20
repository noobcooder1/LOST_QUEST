import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, FileText, LoaderCircle, RotateCcw, Sparkles, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { loadMatchPhotos } from '../services/matchPhotoComparison';
import type { MatchResult } from '../services/matchingApi';
import type { Item } from '../types';
import { analyzeAppearance, describeImage, releaseAppearanceResources } from '../features/imageAnalysis/appearance';
import { FULL_CROP } from '../features/imageAnalysis/types';
import { textEmbeddings } from '../features/textMatching/textMatching';
import { matchText } from '../features/textMatching/ranking';
import { cosineSimilarity } from '../features/imageAnalysis/similarityMath';
import { descriptionPrompts, describeScores } from '../features/crossMatch/describePrompts';
import { colorPart, combinedScore, textPart, visualPart, WEIGHTS, type Part, type Parts } from '../features/crossMatch/combinedScore';
import './ImageAnalysisPage.css';
import './MatchComparePanel.css';

/** One lost post ↔ one recommended found post, opened from the matching results. */
export interface MatchCompareProps {
  lost: Item;
  match: MatchResult;
  /** Kind read from the lost post's title by the server (e.g. "우산"), used for the English CLIP description. */
  lostKind?: string;
  /** Both titles name the same kind: the appearance step skips CLIP's own type guess. */
  itemType?: string;
  onClose?: () => void;
}

type Step = 'photos' | 'describe' | 'appearance' | 'text';
const STEP_TEXT: Record<Step, string> = {
  photos: '두 글의 사진을 불러오고 있어요.',
  describe: '잃어버린 물건 글과 주운 물건 사진을 비교하고 있어요. (CLIP)',
  appearance: '두 사진의 외형을 비교하고 있어요. (DINOv2)',
  text: '두 글의 의미를 비교하고 있어요. (E5)',
};
const PART_LABEL: Record<Part, string> = { visual: '사진 외형', kind: '글 ↔ 사진', text: '텍스트 의미', color: '색상 일치' };

interface Outcome { parts: Parts; raw: { visual?: number; text?: number }; prompt?: string; ms: number }

function usePreview(file: File | null) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file) { setUrl(''); return; }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function Panel({ label, title, caption, file, fallback }: { label: string; title: string; caption: string; file: File | null; fallback?: string }) {
  const preview = usePreview(file);
  return <section className="analysis-upload-card">
    <div className="analysis-upload-heading"><span>{label}</span><div><strong>{title}</strong><small>{caption}</small></div></div>
    <div className={`analysis-dropzone ${preview ? 'has-image' : ''} match-compare-photo`}>
      {preview ? <img src={preview} alt={`${title} 사진`} />
        : fallback ? <div className="match-compare-textonly"><FileText size={22} /><strong>잃어버린 물건 사진 없음 · 글로 비교해요</strong><p>{fallback}</p></div>
          : <LoaderCircle className="analysis-spin" size={22} />}
    </div>
  </section>;
}

const percent = (n: number | undefined) => n === undefined ? '—' : `${(n * 100).toFixed(1)}%`;

export default function MatchComparePanel({ lost, match, lostKind, itemType, onClose }: MatchCompareProps) {
  const { authUser, authChecking } = useApp();
  const [photos, setPhotos] = useState<{ lost: File | null; found: File } | null>(null);
  const [step, setStep] = useState<Step | null>('photos');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const lostText = matchText({ title: lost.title, category: lost.category, color: lost.color, description: lost.description });

  useEffect(() => {
    if (authChecking) return;
    if (!authUser) { setStep(null); setError('로그인한 뒤 비교할 수 있어요.'); return; }
    const controller = new AbortController();
    const { signal } = controller;
    const started = performance.now();
    setOutcome(null); setError('');
    (async () => {
      setStep('photos');
      const loaded = photos ?? await loadMatchPhotos(lost, match, authUser.id, signal);
      if (signal.aborted) return;
      setPhotos(loaded);
      const parts: Parts = {};
      const raw: Outcome['raw'] = {};
      // 1) The lost post's words vs the found photo (works even when the lost post has no photo).
      const prompts = descriptionPrompts({ kindLabel: lostKind, category: lost.category, color: lost.color, title: lost.title });
      if (prompts) {
        setStep('describe');
        parts.kind = describeScores(await describeImage(loaded.found, prompts.prompts, signal), prompts).kind;
      }
      // 2) Photo vs photo, only when both posts have one.
      if (loaded.lost) {
        setStep('appearance');
        const type = itemType ?? 'auto';
        const result = await analyzeAppearance(loaded.lost, loaded.found, [FULL_CROP, FULL_CROP], [type, type], undefined, signal);
        raw.visual = result.visualCosine;
        parts.visual = visualPart(result.visualCosine);
      }
      releaseAppearanceResources();
      // 3) Korean text meaning of the two posts.
      setStep('text');
      const foundText = matchText({ title: match.title, category: match.category, color: match.color, description: match.description });
      // The text model is optional: if it cannot load, the photo-based parts still give a score (text shows '—').
      try {
        const [a, b] = await textEmbeddings([lostText, foundText], undefined, signal);
        raw.text = cosineSimilarity(a, b);
        parts.text = textPart(raw.text);
      } catch (reason) {
        if (signal.aborted) throw reason;
      }
      parts.color = colorPart(lost.color || lost.title, match.color || match.title);
      if (!signal.aborted) { setOutcome({ parts, raw, prompt: prompts?.target, ms: performance.now() - started }); setStep(null); }
    })().catch((reason: unknown) => {
      if (signal.aborted) return;
      releaseAppearanceResources();
      setStep(null);
      setError(reason instanceof Error ? reason.message : '비교를 완료하지 못했어요.');
    });
    return () => { controller.abort(); releaseAppearanceResources(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per pair and per "다시 비교"
  }, [lost.id, match.id, authChecking, authUser?.id, attempt]);

  const combined = outcome ? combinedScore(outcome.parts) : null;
  const used = new Set(combined?.used ?? []);
  const weightNote = combined ? combined.used.map(key => `${PART_LABEL[key]} ${Math.round(WEIGHTS[key] * 100)}`).join(' · ') : '';

  return <div className="page-container image-analysis-page image-analysis-embedded match-compare">
    <div className="analysis-preset-head">
      <div><span className="eyebrow"><Sparkles size={14} /> AI 종합 비교</span><h2>내가 잃어버린 물건 ‘{lost.title}’ ↔ ‘{match.title}’</h2><p>사진 외형·글↔사진·텍스트 의미·색상을 이 기기에서 함께 비교한 참고 점수예요. 매칭도 {match.score}점과 추천 순서는 바뀌지 않아요.</p></div>
      {onClose && <button type="button" className="button button-secondary" onClick={onClose}><X size={16} />매칭 결과로 돌아가기</button>}
    </div>

    <div className="analysis-workspace">
      <Panel label="A" title="내가 잃어버린 물건" caption={lost.title} file={photos?.lost ?? null} fallback={photos && !photos.lost ? lostText : undefined} />
      <div className="analysis-center">
        {combined
          ? <div className="analysis-center-score" aria-label="AI 종합 참고 점수"><strong>{combined.score.toFixed(1)}%</strong><small>AI 종합 참고</small></div>
          : <span className="analysis-connector">{step ? <LoaderCircle className="analysis-spin" size={22} /> : <ArrowRight size={23} />}</span>}
        <button type="button" className="button button-primary analysis-run" onClick={() => setAttempt(n => n + 1)} disabled={step !== null}>
          {step ? <><LoaderCircle className="analysis-spin" size={18} />비교 중</> : <><RotateCcw size={17} />다시 비교</>}
        </button>
      </div>
      <Panel label="B" title="추천 후보" caption={match.title} file={photos?.found ?? null} />
    </div>

    {step && <div className="analysis-progress-card" role="status"><LoaderCircle className="analysis-spin" size={18} /><div><strong>{STEP_TEXT[step]}</strong><span>사진과 글은 이 기기를 벗어나지 않아요. 처음에는 모델을 불러오느라 시간이 걸려요.</span></div></div>}
    {error && <div className="analysis-error" role="alert"><strong>비교를 완료하지 못했어요.</strong><p>{error}</p></div>}

    {outcome && <section className="analysis-results" aria-live="polite">
      <div className="analysis-result-heading"><div><h2>{combined ? `AI 종합 참고 ${combined.score.toFixed(1)}%` : '종합 점수를 낼 수 없어요'}</h2><p>{combined ? `반영: ${weightNote} (없는 값은 빼고 비율을 다시 맞춰요)` : '사진으로 비교할 수 있는 값이 없어 텍스트 의미만 보여 드려요.'}</p></div></div>
      <div className="analysis-metrics match-compare-metrics">
        <article className={used.has('visual') ? '' : 'is-missing'}><span>사진 외형 · DINOv2</span><strong>{photos?.lost ? percent(outcome.parts.visual) : '사진 없음'}</strong><small>{outcome.raw.visual === undefined ? '잃어버린 물건 사진이 있어야 계산돼요' : `두 사진 생김새 (원값 ${outcome.raw.visual.toFixed(3)})`}</small></article>
        <article className={used.has('kind') ? '' : 'is-missing'}><span>글 ↔ 사진 · CLIP</span><strong>{percent(outcome.parts.kind)}</strong><small>{outcome.prompt ? `주운 물건 사진이 “${outcome.prompt.replace(/^a photo of (an? )?/, '')}”인 정도` : '잃어버린 물건 글에서 물품 종류를 알 수 없어요'}</small></article>
        <article><span>텍스트 의미 · E5</span><strong>{percent(outcome.parts.text)}</strong><small>{outcome.raw.text === undefined ? '텍스트 모델을 불러오지 못했어요' : `제목·설명 의미 (원값 ${outcome.raw.text.toFixed(3)})`}</small></article>
        <article className={used.has('color') ? '' : 'is-missing'}><span>색상 일치 · 글 기준</span><strong>{outcome.parts.color === undefined ? '정보 없음' : outcome.parts.color ? '같음' : '다름'}</strong><small>{lost.color || '—'} ↔ {match.color || '—'}</small></article>
      </div>
      <div className="analysis-result-note"><CheckCircle2 size={18} /><p>처리 시간 {(outcome.ms / 1000).toFixed(1)}초 · 같은 물건일 확률이나 소유권 증명이 아니라, 비슷한 정도를 보여 주는 참고값이에요.</p></div>
    </section>}
  </div>;
}
