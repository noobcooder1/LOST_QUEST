import type { CropRect } from './types';

export function validCrop(crop: CropRect): CropRect {
  if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > 1.000001 || crop.y + crop.height > 1.000001) {
    throw new Error('비교할 이미지 영역이 올바르지 않습니다.');
  }
  return crop;
}
// 12 hue bins x 4 saturation bins x 4 brightness bins. Neutral colors
// share a hue bin so white/gray pixels do not acquire a meaningless hue.
export function colorHistogram(rgba: Uint8ClampedArray): number[] {
  if (!rgba.length || rgba.length % 4) throw new Error('색상 분석을 위한 픽셀이 올바르지 않습니다.');
  const hist = new Array<number>(12 * 4 * 4).fill(0);
  let total = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const weight = rgba[i + 3] / 255;
    if (!weight) continue;
    const r = rgba[i] / 255, g = rgba[i + 1] / 255, b = rgba[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    const sat = max ? delta / max : 0;
    let hue = 0;
    if (delta && sat >= .1) {
      if (max === r) hue = ((g - b) / delta + 6) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
    }
    // Soft bins prevent a tiny color change at a bin boundary from looking
    // completely different. Hue wraps around so red and near-red stay close.
    const h = hue * 2, s = sat * 3, v = max * 3;
    const baseH = Math.floor(h), baseS = Math.floor(s), baseV = Math.floor(v);
    for (let dh = 0; dh <= 1; dh++) for (let ds = 0; ds <= 1; ds++) for (let dv = 0; dv <= 1; dv++) {
      const part = (dh ? h - baseH : 1 - h + baseH) * (ds ? s - baseS : 1 - s + baseS) * (dv ? v - baseV : 1 - v + baseV);
      hist[(((baseH + dh) % 12) * 4 + Math.min(3, baseS + ds)) * 4 + Math.min(3, baseV + dv)] += weight * part;
    }
    total += weight;
  }
  if (!total) throw new Error('선택한 영역이 완전히 투명해 색상을 비교할 수 없습니다.');
  return hist.map(n => n / total);
}

export function colorSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length || ![...a, ...b].every(n => Number.isFinite(n) && n >= 0)) throw new Error('색상 분포가 올바르지 않습니다.');
  const sumA = a.reduce((s, n) => s + n, 0), sumB = b.reduce((s, n) => s + n, 0);
  if (!sumA || !sumB) throw new Error('색상 분포를 계산할 수 없습니다.');
  // Bhattacharyya coefficient: 1 for the same distribution, 0 for no overlap.
  const coefficient = a.reduce((sum, n, i) => sum + Math.sqrt(n / sumA) * Math.sqrt(b[i] / sumB), 0);
  return Math.max(0, Math.min(1, coefficient)) * 100;
}

