/** `extra` adds wordings for shapes the main prompt misses (e.g. a folded umbrella with a strap). */
export const ITEM_TYPES: readonly { id: string; label: string; prompt: string; extra?: readonly string[] }[] = [
  { id: 'earbuds', label: '이어폰', prompt: 'wireless earbuds with a charging case or earphones' },
  { id: 'headphones', label: '헤드폰', prompt: 'over-ear headphones' },
  { id: 'umbrella', label: '우산', prompt: 'an umbrella', extra: ['an open umbrella', 'a folded compact umbrella with a wrist strap', 'a closed long umbrella with a handle'] },
  { id: 'wallet', label: '지갑', prompt: 'a wallet or coin purse' },
  { id: 'bag', label: '가방', prompt: 'a backpack, handbag or shoulder bag' },
  { id: 'phone', label: '휴대폰', prompt: 'a smartphone or mobile phone' },
  { id: 'keys', label: '열쇠', prompt: 'keys on a keyring or a car key' },
  { id: 'glasses', label: '안경·선글라스', prompt: 'eyeglasses or sunglasses' },
  { id: 'watch', label: '시계', prompt: 'a wristwatch or smartwatch' },
  { id: 'jewelry', label: '장신구', prompt: 'jewelry such as a ring, necklace or bracelet' },
  { id: 'laptop', label: '노트북', prompt: 'a laptop computer' },
  { id: 'tablet', label: '태블릿', prompt: 'a tablet computer' },
  { id: 'camera', label: '카메라', prompt: 'a digital camera' },
  { id: 'bottle', label: '물병·텀블러', prompt: 'a water bottle or insulated tumbler' },
  { id: 'hat', label: '모자', prompt: 'a cap or hat' },
  { id: 'clothes', label: '의류', prompt: 'a jacket, shirt, trousers or other clothing' },
  { id: 'shoes', label: '신발', prompt: 'shoes or sneakers' },
  { id: 'gloves', label: '장갑', prompt: 'a pair of gloves' },
  { id: 'scarf', label: '목도리', prompt: 'a scarf' },
  { id: 'book', label: '책·노트', prompt: 'a book or notebook' },
  { id: 'card', label: '카드·신분증', prompt: 'a credit card, identification card or transit card' },
  { id: 'passport', label: '여권', prompt: 'a passport' },
  { id: 'charger', label: '충전기·케이블', prompt: 'a phone charger, power adapter or charging cable' },
  { id: 'powerbank', label: '보조배터리', prompt: 'a portable power bank' },
  { id: 'mouse', label: '마우스', prompt: 'a computer mouse' },
  { id: 'keyboard', label: '키보드', prompt: 'a computer keyboard' },
  { id: 'pen', label: '필기구', prompt: 'a pen or pencil' },
  { id: 'toy', label: '장난감·인형', prompt: 'a toy or stuffed animal' },
  { id: 'suitcase', label: '여행가방', prompt: 'a suitcase or travel luggage' },
  { id: 'other', label: '기타·물품 아님', prompt: 'a landscape, a person, food, an animal or an object outside these lost item categories' },
];

/** Every wording the classifier scores; each maps back to one item type. */
export const CLASSIFIER_PROMPTS: string[] = ITEM_TYPES.flatMap(item => [item.prompt, ...(item.extra ?? [])]);
const TYPE_BY_PROMPT = new Map(ITEM_TYPES.flatMap(item => [item.prompt, ...(item.extra ?? [])].map(prompt => [prompt, item] as const)));

/**
 * Item kind names from the matching server (title-based, e.g. "우산") → the classifier's item type id. Kinds the
 * classifier has no type for (e.g. 낚시용품) are left out, so those comparisons keep automatic detection.
 */
const KIND_TO_ITEM_TYPE: Record<string, string> = {
  우산: 'umbrella', 지갑: 'wallet', 가방: 'bag', 휴대폰: 'phone', 이어폰: 'earbuds', 헤드폰: 'headphones',
  노트북: 'laptop', 태블릿: 'tablet', 열쇠: 'keys', 안경: 'glasses', 시계: 'watch', 카메라: 'camera',
  물병: 'bottle', 책: 'book', 신발: 'shoes', 모자: 'hat', 카드: 'card', 장신구: 'jewelry', 의류: 'clothes',
};
export function itemTypeForKind(kind: string | undefined): string | undefined {
  return kind ? KIND_TO_ITEM_TYPE[kind] : undefined;
}

export interface CategoryPrediction {
  id: string; label: string; score: number; margin: number; confident: boolean; source: 'auto' | 'manual';
}
export function categoryPrediction(ranked: { label: string; score: number }[]): CategoryPrediction {
  // Several wordings can describe one type: their scores add up before choosing the best type.
  const totals = new Map<string, number>();
  for (const { label, score } of ranked) {
    const item = TYPE_BY_PROMPT.get(label);
    if (!item || !Number.isFinite(score) || score < 0 || score > 1) throw new Error('물품 종류 분류 결과가 올바르지 않습니다.');
    totals.set(item.id, (totals.get(item.id) ?? 0) + score);
  }
  const [best, second] = [...totals].map(([id, score]) => ({ id, score: Math.min(1, score) })).sort((a, b) => b.score - a.score);
  const match = ITEM_TYPES.find(item => item.id === best?.id);
  if (!match || !second) throw new Error('물품 종류 분류 결과가 올바르지 않습니다.');
  const margin = best.score - second.score;
  // Experimental acceptance rules, not calibrated accuracy probabilities.
  return { id: match.id, label: match.label, score: best.score, margin, confident: match.id !== 'other' && best.score >= .35 && margin >= .12, source: 'auto' };
}

export function manualCategory(id: string): CategoryPrediction {
  const item = ITEM_TYPES.find(item => item.id === id);
  if (!item) throw new Error('지정한 물품 종류를 찾을 수 없습니다.');
  return { id, label: item.label, score: 1, margin: 1, confident: id !== 'other', source: 'manual' };
}

export function fitnessGate(rawScore: number, categories: [CategoryPrediction, CategoryPrediction], minimum: number) {
  if (!Number.isFinite(rawScore) || rawScore < 0 || rawScore > 100 || !Number.isFinite(minimum) || minimum < 0 || minimum > 100) throw new Error('적합도 기준이 올바르지 않습니다.');
  if (categories.some(c => !c.confident)) return { score: null, reason: 'category-unknown' as const };
  if (categories[0].id !== categories[1].id) return { score: 0, reason: 'category-mismatch' as const };
  // Low appearance keeps its real (low) value; only different item kinds are forced to 0.
  if (rawScore < minimum) return { score: rawScore, reason: 'appearance-low' as const };
  return { score: rawScore, reason: 'matched' as const };
}
