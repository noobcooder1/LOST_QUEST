/**
 * Display-only model for the future "AI 사진 유사도" reference indicator on match cards.
 *
 * Nothing here calls a server, and nothing changes the 100-point match score, ranking or the 70-point
 * notification threshold. The server does not send this data yet, so cards show it only when the
 * frontend flag is on, and then as UNAVAILABLE.
 */

export type PhotoSimilarityStatus = 'READY' | 'PENDING' | 'NO_IMAGE' | 'UNAVAILABLE';
export type PhotoSimilarityLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type PhotoSimilarity =
  | {
      status: 'READY';
      /** Display band chosen by the server after calibration with real photos. */
      level?: PhotoSimilarityLevel;
      /** Optional 0–100 value; shown only together with a valid level. */
      percent?: number;
    }
  | { status: 'PENDING' | 'NO_IMAGE' | 'UNAVAILABLE' };

/** What the indicator actually renders. A READY result without real data has no level and no percent. */
export interface PhotoSimilarityView {
  status: PhotoSimilarityStatus;
  level?: PhotoSimilarityLevel;
  percent?: number;
}

const LEVELS: readonly PhotoSimilarityLevel[] = ['HIGH', 'MEDIUM', 'LOW'];
const STATUSES: readonly PhotoSimilarityStatus[] = ['READY', 'PENDING', 'NO_IMAGE', 'UNAVAILABLE'];

/** Off unless `VITE_FEATURE_AI_PHOTO_SIMILARITY=true` is set when Vite starts or builds. */
export function isPhotoSimilarityEnabled(): boolean {
  return (import.meta.env.VITE_FEATURE_AI_PHOTO_SIMILARITY ?? '').trim().toLowerCase() === 'true';
}

/**
 * Normalizes whatever the card has into something safe to show. Missing or unknown data becomes
 * UNAVAILABLE, and a READY result keeps a level/percent only when they are real, valid values.
 */
export function resolvePhotoSimilarity(value: PhotoSimilarity | null | undefined): PhotoSimilarityView {
  if (!value || !STATUSES.includes(value.status)) return { status: 'UNAVAILABLE' };
  if (value.status !== 'READY') return { status: value.status };
  const level = value.level && LEVELS.includes(value.level) ? value.level : undefined;
  if (!level) return { status: 'READY' };
  const percent = typeof value.percent === 'number' && Number.isFinite(value.percent) && value.percent >= 0 && value.percent <= 100
    ? Math.round(value.percent)
    : undefined;
  return { status: 'READY', level, percent };
}
