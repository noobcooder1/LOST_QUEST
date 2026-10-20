import { describe, expect, it } from 'vitest';
import { categoryPrediction, CLASSIFIER_PROMPTS, fitnessGate, ITEM_TYPES, itemTypeForKind, manualCategory } from './categories';

describe('item kinds from matching → classifier item types', () => {
  it('maps every known kind name to an existing item type and leaves unknown kinds to auto detection', () => {
    for (const kind of ['우산', '지갑', '가방', '휴대폰', '이어폰', '헤드폰', '노트북', '태블릿', '열쇠', '안경', '시계', '카메라', '물병', '책', '신발', '모자', '카드', '장신구', '의류']) {
      const id = itemTypeForKind(kind);
      expect(ITEM_TYPES.some(item => item.id === id)).toBe(true);
    }
    expect(itemTypeForKind('우산')).toBe('umbrella');
    expect(itemTypeForKind('낚시용품')).toBeUndefined();
    expect(itemTypeForKind(undefined)).toBeUndefined();
  });

  it('describes folded umbrellas too, and a manual type passes the same-kind gate with the appearance score', () => {
    expect(ITEM_TYPES.find(item => item.id === 'umbrella')!.extra!.some(prompt => prompt.includes('folded'))).toBe(true);
    const umbrella = manualCategory('umbrella');
    expect(fitnessGate(68.2, [umbrella, umbrella], 30)).toEqual({ score: 68.2, reason: 'matched' });
    expect(fitnessGate(7.4, [umbrella, umbrella], 30)).toEqual({ score: 7.4, reason: 'appearance-low' });
    expect(fitnessGate(90, [umbrella, manualCategory('bag')], 30)).toEqual({ score: 0, reason: 'category-mismatch' });
  });

  it('adds up the scores of all wordings for one type before choosing', () => {
    const scores = CLASSIFIER_PROMPTS.map(label => ({ label, score: 0.002 }));
    const set = (label: string, score: number) => { scores.find(s => s.label === label)!.score = score; };
    set('a phone charger, power adapter or charging cable', 0.3);
    set('a folded compact umbrella with a wrist strap', 0.25);
    set('a closed long umbrella with a handle', 0.2);
    const result = categoryPrediction(scores.sort((a, b) => b.score - a.score));
    expect(result.id).toBe('umbrella'); expect(result.score).toBeCloseTo(0.452 + 0.002 * 0, 1);
    expect(() => categoryPrediction([{ label: 'unknown wording', score: 1 }, { label: 'an umbrella', score: 0 }])).toThrow();
  });
});
