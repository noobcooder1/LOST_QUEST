import type { Item, MatchResult } from '../types';

const DAY = 86_400_000;

/**
 * Deterministic demonstration, not image analysis or a probability of ownership.
 * Replace this boundary with a Spring Boot matching endpoint in a later version.
 */
export function getMatches(lostItem: Item, items: Item[]): MatchResult[] {
  if (lostItem.type !== 'lost' || lostItem.status !== 'open') return [];

  return items
    .filter((item) => item.id !== lostItem.id && item.type === 'found' && item.status === 'open' && item.category === lostItem.category)
    .map((item): MatchResult => {
      let score = 45;
      const reasons = [`물품 종류가 ‘${lostItem.category}’으로 같아요.`];
      if (item.color === lostItem.color) {
        score += 22;
        reasons.push(`등록된 색상이 ‘${item.color}’으로 같아요.`);
      } else {
        score += 4;
        reasons.push('색상이 달라 사진과 세부 특징을 확인해 주세요.');
      }
      if (item.region === lostItem.region) {
        score += 15;
        reasons.push(`${item.region} 지역에서 접수된 물품이에요.`);
      } else {
        score += 4;
        reasons.push(`다른 지역(${item.region})에서 접수되었어요.`);
      }
      const days = Math.round((Date.parse(item.date) - Date.parse(lostItem.date)) / DAY);
      if (days >= 0 && days <= 14) {
        score += 10;
        reasons.push(days === 0 ? '분실일과 습득일이 같아요.' : `분실일로부터 ${days}일 뒤에 발견되었어요.`);
      } else if (days > 14) {
        score += 5;
        reasons.push('분실일 이후에 접수되었지만 날짜 차이가 있어요.');
      } else {
        reasons.push('습득일이 분실일보다 빨라 날짜 확인이 필요해요.');
      }
      return { item, score, reasons };
    })
    .sort((a, b) => b.score - a.score || b.item.date.localeCompare(a.item.date));
}
