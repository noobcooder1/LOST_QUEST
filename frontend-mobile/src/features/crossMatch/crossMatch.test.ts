import { describe, expect, it } from 'vitest';
import { descriptionPrompts, describeScores, englishColor } from './describePrompts';
import { colorPart, combinedScore, textPart, visualPart } from './combinedScore';

describe('English descriptions for text ↔ photo', () => {
  it('turns the Korean kind and color into a description with same-kind and other-kind contrasts', () => {
    const p = descriptionPrompts({ kindLabel: '우산', category: '액세서리', color: '검정', title: '검은색 우산' })!;
    expect(p.target).toBe('a photo of a black umbrella');
    expect(p.sameKind).toHaveLength(6);
    expect(p.sameKind.every(s => s.endsWith(' umbrella') && !s.includes('black'))).toBe(true);
    expect(p.prompts).toContain('a photo of a wallet'); expect(p.prompts).not.toContain('a photo of a umbrella');
    expect(new Set(p.prompts).size).toBe(p.prompts.length);
  });

  it('falls back to the category, reads the color from the title, and skips unknown kinds instead of guessing', () => {
    expect(descriptionPrompts({ category: '지갑', title: '네이비 반지갑' })!.target).toBe('a photo of a navy blue wallet');
    expect(descriptionPrompts({ category: '가방' })!.target).toBe('a photo of a bag');
    expect(descriptionPrompts({ category: '기타', title: '검은 물건' })).toBeNull();
    expect(descriptionPrompts({ kindLabel: '낚시용품', category: '기타' })).toBeNull();
    expect([englishColor('검은색'), englishColor('회색'), englishColor('캐러멜'), englishColor('무지개')]).toEqual(['black', 'gray', 'brown', undefined]);
  });

  it('scores the described kind in any color, and the described color within that kind', () => {
    const p = descriptionPrompts({ kindLabel: '우산', category: '기타', color: '검정' })!;
    const ranked = p.prompts.map(label => ({ label, score: 0 }));
    const set = (label: string, score: number) => { ranked.find(r => r.label === label)!.score = score; };
    set(p.target, 0.3); set(p.sameKind[0], 0.5); set('a photo of a wallet', 0.2);
    const s = describeScores(ranked, p);
    expect(s.kind).toBeCloseTo(0.8); expect(s.exact).toBeCloseTo(0.375);
  });
});

describe('AI combined reference score', () => {
  it('maps raw model values with the measured reference points', () => {
    expect(textPart(0.80)).toBe(0); expect(textPart(0.92)).toBe(1); expect(textPart(0.86)).toBeCloseTo(0.5);
    expect(visualPart(0.75)).toBe(1); expect(visualPart(-0.1)).toBe(0); expect(visualPart(0.375)).toBeCloseTo(0.5);
    expect([colorPart('검정', '블랙'), colorPart('검정', '갈색'), colorPart('검정', undefined)]).toEqual([1, 0, undefined]);
  });

  it('weights appearance 40, text ↔ photo 25, text 20, color 15 and re-weights when a part is missing', () => {
    expect(combinedScore({ visual: 1, kind: 1, text: 1, color: 1 })).toEqual({ score: 100, used: ['visual', 'kind', 'text', 'color'] });
    expect(combinedScore({ visual: 1, kind: 0, text: 0, color: 0 })!.score).toBe(40);
    // No lost photo: kind 25 / text 20 / color 15 → re-weighted over 60.
    expect(combinedScore({ kind: 1, text: 0, color: 0 })).toEqual({ score: 41.7, used: ['kind', 'text', 'color'] });
    expect(combinedScore({ text: 1, color: 1 })).toBeNull(); // text alone is not shown as an AI photo score
  });

  it('keeps the measured demo pairs in a sensible order', () => {
    const pair = (visual: number | undefined, kind: number, text: number, color: number) =>
      combinedScore({ ...(visual === undefined ? {} : { visual: visualPart(visual) }), kind, text: textPart(text), color })!.score;
    const blackUmbrella = pair(0.761, 0.998, 0.887, 1), blueUmbrella = pair(0.647, 0.931, 0.853, 0), navyBackpack = pair(0.074, 0.084, 0.807, 0);
    const blackWallet = pair(undefined, 0.994, 0.905, 1), brownWallet = pair(undefined, 0.999, 0.896, 0), blackUmbrellaForWallet = pair(undefined, 0.040, 0.838, 1);
    expect(blackUmbrella).toBeGreaterThan(90); expect(blueUmbrella).toBeGreaterThan(55); expect(blueUmbrella).toBeLessThan(blackUmbrella);
    expect(navyBackpack).toBeLessThan(15);
    expect(blackWallet).toBeGreaterThan(brownWallet); expect(brownWallet).toBeGreaterThan(blackUmbrellaForWallet);
  });
});
