export type RankGrade = 'S' | 'A' | 'B' | 'C';
/** Icon names; the page maps them to the site's line icons (no emoji). */
export type ItemIconKey = 'wallet' | 'earbuds' | 'phone' | 'backpack' | 'camera' | 'watch' | 'glasses' | 'key';

export interface SimpleItemCard {
  id: string;
  icon: ItemIconKey;
  category: string;
  colorName: string;
  colorHex: string;
  feature: string;
  location: string;
  isMatch: boolean;
}

export interface GameRound {
  roundNumber: number;
  clientName: string;
  targetCategory: string;
  targetIcon: ItemIconKey;
  targetColorName: string;
  targetColorHex: string;
  targetFeature: string;
  targetLocation: string;
  choices: SimpleItemCard[];
}

export interface SimpleGameRecord {
  bestScore: number;
  bestCombo: number;
  totalSolved: number;
}

const STORAGE_KEY = 'lostquest:simple-game:v1';

const ITEM_POOL: { category: string; icon: ItemIconKey }[] = [
  { category: '가죽 지갑', icon: 'wallet' },
  { category: '무선 이어폰', icon: 'earbuds' },
  { category: '스마트폰', icon: 'phone' },
  { category: '백팩 가방', icon: 'backpack' },
  { category: '필름 카메라', icon: 'camera' },
  { category: '손목시계', icon: 'watch' },
  { category: '안경 케이스', icon: 'glasses' },
  { category: '자동차 스마트키', icon: 'key' },
];

/** Colors come in look-alike pairs (same `group`); harder levels use the twin as a distractor. */
const COLOR_POOL = [
  { name: '블랙', hex: '#1e293b', group: 'dark' },
  { name: '차콜', hex: '#57606f', group: 'dark' },
  { name: '네이비', hex: '#1e3a8a', group: 'blue' },
  { name: '블루', hex: '#2563eb', group: 'blue' },
  { name: '민트', hex: '#0d9488', group: 'green' },
  { name: '그린', hex: '#16a34a', group: 'green' },
  { name: '버건디', hex: '#9f1239', group: 'red' },
  { name: '레드', hex: '#dc2626', group: 'red' },
  { name: '옐로우', hex: '#d97706', group: 'yellow' },
  { name: '베이지', hex: '#b08d62', group: 'yellow' },
  { name: '퍼플', hex: '#7e22ce', group: 'purple' },
  { name: '라벤더', hex: '#8b7bd8', group: 'purple' },
];

/** Features also come in look-alike pairs: index 2k and 2k+1 differ by one detail. */
const FEATURE_PAIRS: [string, string][] = [
  ['별 모양 키링', '하트 모양 키링'],
  ['네잎클로버 스티커', '세잎클로버 스티커'],
  ['이니셜 K 각인', '이니셜 R 각인'],
  ['체크무늬 리본', '물방울무늬 리본'],
  ['고양이 참 장식', '강아지 참 장식'],
  ['은색 자물쇠 고리', '금색 자물쇠 고리'],
  ['카페 영수증 동봉', '영화 티켓 동봉'],
  ['가죽 스트랩', '실리콘 스트랩'],
];
const FEATURE_POOL = FEATURE_PAIRS.flat();

const LOCATION_POOL = [
  '서울숲 벤치',
  '홍대 버스킹존',
  '강남역 카페',
  '여의도 한강공원',
  '코엑스 도서관',
  '성수동 팝업스토어',
];

const CLIENT_POOL = ['김서연', '박준호', '이도현', '최유진', '정하늘'];

export interface GameLevel { level: 1 | 2 | 3 | 4; name: string; hint: string }

/** Difficulty rises with the round: obvious → one clear difference → look-alike → every distractor is a look-alike. */
export function levelFor(roundNumber: number): GameLevel {
  if (roundNumber <= 3) return { level: 1, name: '쉬움', hint: '품목·색상·특징을 차례로 확인해 보세요.' };
  if (roundNumber <= 7) return { level: 2, name: '보통', hint: '이제 모든 후보가 같은 품목이에요.' };
  if (roundNumber <= 12) return { level: 3, name: '어려움', hint: '비슷한 색이나 비슷한 특징이 섞여 있어요.' };
  return { level: 4, name: '전문가', hint: '모든 후보가 한 끗 차이예요. 색과 특징을 끝까지 읽어 보세요.' };
}

/** Small seeded generator (mulberry32): random-looking, yet the same seed always gives the same round. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(pool: readonly T[], random: () => number): T => pool[Math.floor(random() * pool.length)];
const shuffle = <T,>(items: T[], random: () => number): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

type Color = (typeof COLOR_POOL)[number];
const twinColor = (color: Color) => COLOR_POOL.find(c => c.group === color.group && c !== color)!;
const otherGroupColor = (color: Color, random: () => number) => pick(COLOR_POOL.filter(c => c.group !== color.group), random);
const twinFeature = (feature: string) => FEATURE_PAIRS.find(pair => pair.includes(feature))!.find(f => f !== feature)!;
const otherPairFeature = (feature: string, random: () => number) => pick(FEATURE_PAIRS.filter(pair => !pair.includes(feature)).flat(), random);

/**
 * Answer slot for a round, drawn like a shuffled bag: every block of 4 rounds uses each slot exactly once in random
 * order. Still unpredictable, but the answer is spread evenly and never sits in one slot 3+ rounds in a row.
 */
export function answerSlot(roundNumber: number, seedOffset = 0): number {
  const block = Math.floor((roundNumber - 1) / 4);
  const order = shuffle([0, 1, 2, 3], seededRandom(seedOffset * 31337 + block * 7349 + 3));
  return order[(roundNumber - 1) % 4];
}

type Distractor = { item: (typeof ITEM_POOL)[number]; color: Color; feature: string };

/**
 * One round: 1 exact match and 3 distractors, placed at random positions. `seedOffset` is the game's random seed,
 * so a game is reproducible while every game (and every round) differs.
 */
export function generateSimpleRound(roundNumber: number, seedOffset = 0): GameRound {
  const random = seededRandom(seedOffset * 7919 + roundNumber * 104729 + 17);
  const { level } = levelFor(roundNumber);
  const item = pick(ITEM_POOL, random);
  const color = pick(COLOR_POOL, random);
  const feature = pick(FEATURE_POOL, random);
  const location = pick(LOCATION_POOL, random);
  const client = pick(CLIENT_POOL, random);

  const plans: Array<() => Distractor> =
    level === 1 ? [
      () => ({ item: pick(ITEM_POOL.filter(i => i !== item), random), color, feature }),
      () => ({ item, color: otherGroupColor(color, random), feature }),
      () => ({ item, color, feature: otherPairFeature(feature, random) }),
    ] : level === 2 ? [
      () => ({ item, color: otherGroupColor(color, random), feature }),
      () => ({ item, color, feature: otherPairFeature(feature, random) }),
      () => ({ item, color: otherGroupColor(color, random), feature: otherPairFeature(feature, random) }),
    ] : level === 3 ? [
      () => ({ item, color: twinColor(color), feature }),
      () => ({ item, color, feature: twinFeature(feature) }),
      () => ({ item, color: otherGroupColor(color, random), feature }),
    ] : [
      () => ({ item, color: twinColor(color), feature }),
      () => ({ item, color, feature: twinFeature(feature) }),
      () => ({ item, color: twinColor(color), feature: twinFeature(feature) }),
    ];

  const key = (d: Distractor) => `${d.item.category}|${d.color.name}|${d.feature}`;
  const seen = new Set([key({ item, color, feature })]);
  const distractors = plans.map(plan => {
    let next = plan();
    for (let tries = 0; seen.has(key(next)) && tries < 20; tries++) next = plan();
    seen.add(key(next));
    return next;
  });

  const cards = shuffle(distractors.map(d => ({ ...d, isMatch: false })), random);
  cards.splice(answerSlot(roundNumber, seedOffset), 0, { item, color, feature, isMatch: true });
  const choices: SimpleItemCard[] = cards.map((card, idx) => ({
    id: `card-${seedOffset}-${roundNumber}-${idx}`,
    icon: card.item.icon,
    category: card.item.category,
    colorName: card.color.name,
    colorHex: card.color.hex,
    feature: card.feature,
    // The found place is not a clue; at higher levels every card shows the same place so it cannot give hints.
    location: card.isMatch || level >= 3 ? location : pick(LOCATION_POOL, random),
    isMatch: card.isMatch,
  }));

  return {
    roundNumber,
    clientName: client,
    targetCategory: item.category,
    targetIcon: item.icon,
    targetColorName: color.name,
    targetColorHex: color.hex,
    targetFeature: feature,
    targetLocation: location,
    choices,
  };
}

export function getSimpleGrade(score: number): RankGrade {
  if (score >= 700) return 'S';
  if (score >= 450) return 'A';
  if (score >= 200) return 'B';
  return 'C';
}

export function loadSimpleRecord(): SimpleGameRecord {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { bestScore: 0, bestCombo: 0, totalSolved: 0 };
    const parsed = JSON.parse(raw) as Partial<SimpleGameRecord>;
    return {
      bestScore: typeof parsed.bestScore === 'number' ? parsed.bestScore : 0,
      bestCombo: typeof parsed.bestCombo === 'number' ? parsed.bestCombo : 0,
      totalSolved: typeof parsed.totalSolved === 'number' ? parsed.totalSolved : 0,
    };
  } catch {
    return { bestScore: 0, bestCombo: 0, totalSolved: 0 };
  }
}

export function saveSimpleRecord(record: SimpleGameRecord): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage errors
  }
}

/** Local (this device only) top-10 ranking. Nothing is sent to a server. */
export interface RankingEntry {
  nickname: string;
  score: number;
  solved: number;
  bestCombo: number;
  playedAt: string;
}

export const RANKING_SIZE = 10;
export const NICKNAME_MAX = 12;
const RANKING_KEY = 'lostquest:simple-game:ranking:v1';
const NICKNAME_KEY = 'lostquest:simple-game:nickname:v1';

const byRank = (a: RankingEntry, b: RankingEntry) => b.score - a.score || a.playedAt.localeCompare(b.playedAt);

/** Trims, collapses spaces and drops control characters; returns '' when nothing usable is left. */
export function cleanNickname(value: string): string {
  return Array.from(value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()).slice(0, NICKNAME_MAX).join('');
}

export function loadRanking(): RankingEntry[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RANKING_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is RankingEntry => !!e && typeof e === 'object'
        && typeof e.nickname === 'string' && cleanNickname(e.nickname) !== ''
        && [e.score, e.solved, e.bestCombo].every(n => Number.isSafeInteger(n) && n >= 0)
        && typeof e.playedAt === 'string' && !Number.isNaN(Date.parse(e.playedAt)))
      .map(e => ({ nickname: cleanNickname(e.nickname), score: e.score, solved: e.solved, bestCombo: e.bestCombo, playedAt: e.playedAt }))
      .sort(byRank)
      .slice(0, RANKING_SIZE);
  } catch {
    return [];
  }
}

/** A finished game can enter the ranking when it scored and beats the current 10th place (or there is room). */
export function qualifiesForRanking(score: number, ranking: RankingEntry[]): boolean {
  if (score <= 0) return false;
  return ranking.length < RANKING_SIZE || score > ranking[ranking.length - 1].score;
}

/** Adds one entry and keeps the top 10. Returns the new list and the entry's rank (1-based), or null if it fell out. */
export function addRankingEntry(entry: RankingEntry): { ranking: RankingEntry[]; rank: number | null } {
  const ranking = [...loadRanking(), entry].sort(byRank).slice(0, RANKING_SIZE);
  try {
    window.localStorage.setItem(RANKING_KEY, JSON.stringify(ranking));
  } catch {
    // Storage may be full or blocked; the list is still shown for this visit.
  }
  const index = ranking.indexOf(entry);
  return { ranking, rank: index >= 0 ? index + 1 : null };
}

export function loadLastNickname(): string {
  try { return cleanNickname(window.localStorage.getItem(NICKNAME_KEY) ?? ''); } catch { return ''; }
}

export function saveLastNickname(nickname: string): void {
  try { window.localStorage.setItem(NICKNAME_KEY, nickname); } catch { /* ignore */ }
}

class SoundEffectEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playTone(freq: number, durationMs: number, type: OscillatorType = 'sine', gainValue = 0.08) {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(gainValue, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
    } catch {
      // Ignore audio errors
    }
  }

  playCorrect() {
    this.playTone(587.33, 90, 'triangle', 0.1);
    setTimeout(() => this.playTone(880, 160, 'triangle', 0.11), 70);
  }

  playWrong() {
    this.playTone(210, 200, 'sawtooth', 0.08);
  }

  playFinish() {
    [523.25, 659.25, 783.99, 1046.5].forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 180, 'triangle', 0.1), idx * 90);
    });
  }
}

export const gameSfx = new SoundEffectEngine();
