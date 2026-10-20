import { englishColor } from './describePrompts';

/**
 * AI combined reference score for one lost post ↔ one found post. It never changes the 100-point 매칭도, the
 * recommendation order or notifications.
 *
 * Calibration (2026-10-20, real models in the browser, 5 lost posts × 18 demo found posts = 90 pairs):
 * - Text meaning (multilingual-e5 cosine): same kind 0.828–0.926, different kind 0.788–0.868. Mapped 0.80 → 0, 0.92 → 1.
 * - Text ↔ photo (CLIP, P(photo shows the described kind)): same kind 0.92–1.00 (folded umbrella 0.22),
 *   different kind mostly < 0.30 (max 0.81, a brown bag read as a wallet). Used as is.
 * - Photo appearance (DINOv2 cosine): similar same-kind photos 0.60–0.76, open vs folded umbrella 0.07,
 *   different kinds 0.00–0.32. Mapped 0 → 0, 0.75 → 1.
 * - CLIP color words were unreliable (a navy backpack scored 0.15 for "navy"), so color comes from the posts' color
 *   fields instead: same color 1, different 0.
 * Weights: appearance 40, text ↔ photo 25, text 20, color 15. Missing parts are left out and the rest re-weighted.
 */
export const WEIGHTS = { visual: 0.40, kind: 0.25, text: 0.20, color: 0.15 } as const;
export type Part = keyof typeof WEIGHTS;
export interface Parts { visual?: number; kind?: number; text?: number; color?: number }

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
export const textPart = (cosine: number) => clamp01((cosine - 0.80) / 0.12);
export const visualPart = (cosine: number) => clamp01(cosine / 0.75);

/** 1 same color, 0 different, undefined when either post's color cannot be read. */
export function colorPart(a: string | undefined, b: string | undefined): number | undefined {
  const x = englishColor(a), y = englishColor(b);
  return x && y ? (x === y ? 1 : 0) : undefined;
}

/**
 * 0–100, or null when no photo-based part exists (text alone is not shown as an "AI photo" score).
 * `used` lists the parts that counted, for the explanation under the score.
 */
export function combinedScore(parts: Parts): { score: number; used: Part[] } | null {
  const used = (Object.keys(WEIGHTS) as Part[]).filter(key => parts[key] !== undefined && Number.isFinite(parts[key]));
  if (!used.includes('visual') && !used.includes('kind')) return null;
  const total = used.reduce((sum, key) => sum + WEIGHTS[key], 0);
  const score = used.reduce((sum, key) => sum + WEIGHTS[key] * clamp01(parts[key]!), 0) / total;
  return { score: Math.round(score * 1000) / 10, used };
}
