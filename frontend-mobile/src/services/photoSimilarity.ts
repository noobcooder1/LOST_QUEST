/**
 * Reference indicators for explicitly requested browser photo comparisons and future server results.
 *
 * Nothing here calls a server, and nothing changes the 100-point match score, ranking or the 70-point
 * notification threshold. Browser measurements have no calibrated high/medium/low bands.
 */

export type PhotoSimilarityStatus = 'READY' | 'PENDING' | 'NO_IMAGE' | 'UNAVAILABLE' | 'SKIPPED';
export type PhotoSimilarityLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type PhotoSimilarity =
  | {
      status: 'READY';
      /** Display band chosen by the server after calibration with real photos. */
      level?: PhotoSimilarityLevel;
      /** Optional 0–100 value; shown only together with a valid level. */
      percent?: number;
      /** Raw reference measurements, never an ownership probability or part of the rule score. */
      appearancePercent?: number;
      colorPercent?: number;
    }
  | { status: 'PENDING' | 'NO_IMAGE' | 'UNAVAILABLE' | 'SKIPPED' };

/** What the indicator actually renders. A READY result without real data has no level and no percent. */
export interface PhotoSimilarityView {
  status: PhotoSimilarityStatus;
  level?: PhotoSimilarityLevel;
  percent?: number;
  appearancePercent?: number;
  colorPercent?: number;
}

const LEVELS: readonly PhotoSimilarityLevel[] = ['HIGH', 'MEDIUM', 'LOW'];
const STATUSES: readonly PhotoSimilarityStatus[] = ['READY', 'PENDING', 'NO_IMAGE', 'UNAVAILABLE', 'SKIPPED'];

/** Legacy flag for server-provided indicators. Explicit browser comparisons do not require it. */
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
  const validPercent = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
  if (validPercent(value.appearancePercent) && validPercent(value.colorPercent)) {
    return { status: 'READY', appearancePercent: value.appearancePercent, colorPercent: value.colorPercent };
  }
  const level = value.level && LEVELS.includes(value.level) ? value.level : undefined;
  if (!level) return { status: 'READY' };
  const percent = typeof value.percent === 'number' && Number.isFinite(value.percent) && value.percent >= 0 && value.percent <= 100
    ? Math.round(value.percent)
    : undefined;
  return { status: 'READY', level, percent };
}
