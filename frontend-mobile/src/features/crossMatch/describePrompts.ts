/**
 * Text ↔ photo with CLIP. The installed CLIP only understands English, so the Korean post is reduced to what can be
 * read reliably — item kind and color — and turned into an English description ("a photo of a black umbrella").
 * The photo is then scored against that description and contrast descriptions (same kind in other colors, other
 * kinds). Free-text details (scratches, key rings) are left to the Korean text model.
 */

const KIND_NOUN: Record<string, string> = {
  우산: 'umbrella', 지갑: 'wallet', 가방: 'bag', 휴대폰: 'smartphone', 이어폰: 'pair of wireless earbuds',
  헤드폰: 'pair of headphones', 노트북: 'laptop', 태블릿: 'tablet', 열쇠: 'set of keys', 안경: 'pair of glasses',
  시계: 'watch', 카메라: 'camera', 물병: 'water bottle', 책: 'book', 신발: 'pair of shoes', 모자: 'hat',
  카드: 'card', 장신구: 'piece of jewelry', 의류: 'piece of clothing',
};
/** Used only when the title names no known kind. */
const CATEGORY_NOUN: Record<string, string> = { 지갑: 'wallet', 가방: 'bag' };

const COLORS: [RegExp, string][] = [
  [/검정|검은|블랙|까만/, 'black'], [/흰|하양|화이트/, 'white'], [/회색|그레이|은색|실버|스페이스/, 'gray'],
  [/남색|네이비/, 'navy blue'], [/파랑|파란|블루|하늘/, 'blue'], [/빨강|빨간|레드|버건디/, 'red'],
  [/갈색|브라운|캐러멜/, 'brown'], [/베이지|아이보리/, 'beige'], [/초록|녹색|그린|민트/, 'green'],
  [/노랑|노란|옐로/, 'yellow'], [/분홍|핑크/, 'pink'], [/보라|퍼플|라벤더/, 'purple'], [/투명/, 'transparent'],
];
const CONTRAST_COLORS = ['black', 'white', 'gray', 'navy blue', 'brown', 'red', 'beige', 'transparent'];
const CONTRAST_NOUNS = ['wallet', 'bag', 'umbrella', 'smartphone', 'pair of wireless earbuds', 'laptop', 'set of keys', 'piece of clothing'];

export interface PostForDescription { kindLabel?: string; category: string; color?: string; title?: string }
export interface DescriptionPrompts { target: string; sameKind: string[]; prompts: string[]; noun: string; color?: string }

export function englishColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return COLORS.find(([pattern]) => pattern.test(value))?.[1];
}

/** null when the post's kind cannot be told (then text ↔ photo is skipped rather than guessed). */
export function descriptionPrompts(post: PostForDescription): DescriptionPrompts | null {
  const noun = (post.kindLabel && KIND_NOUN[post.kindLabel]) || CATEGORY_NOUN[post.category];
  if (!noun) return null;
  const color = englishColor(post.color) ?? englishColor(post.title);
  const phrase = (c: string | undefined, n: string) => `a photo of a ${c ? `${c} ` : ''}${n}`;
  const target = phrase(color, noun);
  const sameKind = CONTRAST_COLORS.filter(c => c !== color).slice(0, 6).map(c => phrase(c, noun));
  const others = CONTRAST_NOUNS.filter(n => n !== noun).map(n => phrase(undefined, n));
  return { target, sameKind, prompts: [target, ...sameKind, ...others, 'a photo of something else'], noun, color };
}

/** kind: the photo shows this kind of item (any color). exact: … and in the described color, relative to that kind. */
export function describeScores(ranked: { label: string; score: number }[], prompts: DescriptionPrompts): { kind: number; exact: number } {
  const score = (label: string) => ranked.find(r => r.label === label)?.score ?? 0;
  const target = score(prompts.target);
  const kind = target + prompts.sameKind.reduce((sum, label) => sum + score(label), 0);
  return { kind: Math.min(1, kind), exact: kind > 0 ? target / kind : 0 };
}
