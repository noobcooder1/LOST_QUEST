import type { LucideIcon } from 'lucide-react'
import { CloudOff, ImageOff, Images, Info, LoaderCircle, ScanSearch } from 'lucide-react'
import { resolvePhotoSimilarity, type PhotoSimilarity, type PhotoSimilarityLevel } from '../services/photoSimilarity'
import './PhotoSimilarityIndicator.css'

const LEVEL_TEXT: Record<PhotoSimilarityLevel, { label: string; text: string; bars: number }> = {
  HIGH: { label: '높음', text: '사진의 종류와 모양이 많이 비슷해요', bars: 3 },
  MEDIUM: { label: '보통', text: '사진의 종류와 모양이 조금 비슷해요', bars: 2 },
  LOW: { label: '낮음', text: '사진이 많이 달라 보여요', bars: 1 },
}

const STATUS_VIEW: Record<'PENDING' | 'NO_IMAGE' | 'UNAVAILABLE' | 'SKIPPED', { icon: LucideIcon; label: string; text: string }> = {
  PENDING: { icon: LoaderCircle, label: '비교 중', text: '사진을 비교하고 있어요' },
  NO_IMAGE: { icon: ImageOff, label: '사진 없음', text: '비교할 수 있는 사진이 없어요' },
  UNAVAILABLE: { icon: CloudOff, label: '이용 불가', text: '지금은 사진 비교를 할 수 없어요' },
  SKIPPED: { icon: ImageOff, label: '비교 제외', text: '이번 이미지 비교에서 제외된 물품이에요' },
}

/**
 * Reference-only photo similarity row for a match card. It never shows a number unless the server sent a
 * real READY result, and it never affects the 매칭도 score shown above it.
 */
export default function PhotoSimilarityIndicator({ similarity, className }: { similarity?: PhotoSimilarity | null; className?: string }) {
  const view = resolvePhotoSimilarity(similarity)
  const level = view.status === 'READY' && view.level ? LEVEL_TEXT[view.level] : undefined
  const measured = view.status === 'READY' && view.appearancePercent !== undefined
  const state = view.status === 'READY'
    ? measured
      ? { icon: Images, label: `외형 ${view.appearancePercent!.toFixed(1)}%`, text: `DINOv2 외형·무늬 비교 · 색상 분포 ${view.colorPercent!.toFixed(1)}%` }
      : { icon: level ? Images : ScanSearch, label: level ? `유사도 ${level.label}` : '결과 없음', text: level ? level.text : '표시할 비교 결과가 아직 없어요' }
    : STATUS_VIEW[view.status]
  const Icon = state.icon

  return <section className={['photo-similarity', `photo-similarity-${view.status.toLowerCase()}`, level ? `photo-similarity-level-${view.level!.toLowerCase()}` : '', className ?? ''].filter(Boolean).join(' ')}
    data-status={view.status} aria-label="AI 사진 유사도 (참고 정보)">
    <span className="photo-similarity-icon" aria-hidden="true"><Icon size={17} /></span>
    <div className="photo-similarity-body">
      <div className="photo-similarity-head">
        <strong>AI 사진 유사도</strong>
        <span className="photo-similarity-tag">참고</span>
        <span className="photo-similarity-state" role={view.status === 'PENDING' ? 'status' : undefined}>
          {level && <span className="photo-similarity-bars" aria-hidden="true">{[1, 2, 3].map((bar) => <i key={bar} className={bar <= level.bars ? 'on' : ''} />)}</span>}
          {state.label}{level && view.percent !== undefined && <b className="photo-similarity-percent"> · {view.percent}%</b>}
        </span>
      </div>
      <p>{state.text}</p>
      <small><Info size={12} aria-hidden="true" /> 매칭도 점수에는 반영되지 않는 참고 정보예요. 실물과 상세 정보를 꼭 확인해 주세요.</small>
    </div>
  </section>
}
