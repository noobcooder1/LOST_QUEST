export type RankGrade = 'S' | 'A' | 'B' | 'C';

export interface SimpleItemCard {
  id: string;
  icon: string;
  category: string;
  colorName: string;
  colorHex: string;
  feature: string;
  location: string;
  isMatch: boolean;
}

export interface GameRound {
  roundNumber: number;
  clientEmoji: string;
  clientName: string;
  targetCategory: string;
  targetIcon: string;
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

const ITEM_POOL = [
  { category: '가죽 지갑', icon: '👛' },
  { category: '무선 이어폰', icon: '🎧' },
  { category: '스마트폰', icon: '📱' },
  { category: '백팩 가방', icon: '🎒' },
  { category: '필름 카메라', icon: '📷' },
  { category: '손목시계', icon: '⌚' },
  { category: '안경 케이스', icon: '👓' },
  { category: '자동차 스마트키', icon: '🔑' },
];

const COLOR_POOL = [
  { name: '블랙', hex: '#1e293b' },
  { name: '네이비', hex: '#1d4ed8' },
  { name: '민트', hex: '#0d9488' },
  { name: '버건디', hex: '#be123c' },
  { name: '옐로우', hex: '#d97706' },
  { name: '퍼플', hex: '#7e22ce' },
];

const FEATURE_POOL = [
  '⭐ 별 모양 키링',
  '🍀 네잎클로버 스티커',
  '🏷️ 이니셜 K 각인',
  '🎀 체크무늬 리본',
  '🐱 고양이 참 장식',
  '🧾 카페 영수증 동봉',
  '🔒 은색 자물쇠 고리',
  '💙 파란색 스트랩',
];

const LOCATION_POOL = [
  '서울숲 벤치',
  '홍대 버스킹존',
  '강남역 카페',
  '여의도 한강공원',
  '코엑스 도서관',
  '성수동 팝업스토어',
];

const CLIENT_POOL = [
  { name: '김서연', emoji: '🙋‍♀️' },
  { name: '박준호', emoji: '🙋‍♂️' },
  { name: '이도현', emoji: '🧑‍💻' },
  { name: '최유진', emoji: '👩‍🎨' },
  { name: '정하늘', emoji: '🧑‍🎓' },
];

function pickDifferent<T>(pool: T[], exclude: T, seed: number): T {
  const filtered = pool.filter(item => item !== exclude);
  return filtered[Math.abs(seed) % filtered.length];
}

/**
 * Generates a single, immediately playable matching round with 1 exact match and 3 look-alike distractors.
 */
export function generateSimpleRound(roundNumber: number, seedOffset = 0): GameRound {
  const s = roundNumber * 31 + seedOffset * 17;
  const item = ITEM_POOL[s % ITEM_POOL.length];
  const color = COLOR_POOL[(s * 3) % COLOR_POOL.length];
  const feature = FEATURE_POOL[(s * 5) % FEATURE_POOL.length];
  const location = LOCATION_POOL[(s * 7) % LOCATION_POOL.length];
  const client = CLIENT_POOL[s % CLIENT_POOL.length];

  const correctIndex = (s + roundNumber) % 4;

  const choices: SimpleItemCard[] = [0, 1, 2, 3].map(idx => {
    if (idx === correctIndex) {
      return {
        id: `card-${roundNumber}-${idx}`,
        icon: item.icon,
        category: item.category,
        colorName: color.name,
        colorHex: color.hex,
        feature,
        location,
        isMatch: true,
      };
    }

    // Distractor 1: Same item & color, different feature
    if (idx === (correctIndex + 1) % 4) {
      return {
        id: `card-${roundNumber}-${idx}`,
        icon: item.icon,
        category: item.category,
        colorName: color.name,
        colorHex: color.hex,
        feature: pickDifferent(FEATURE_POOL, feature, s + idx * 11),
        location: pickDifferent(LOCATION_POOL, location, s + idx * 3),
        isMatch: false,
      };
    }

    // Distractor 2: Same item & feature, different color
    if (idx === (correctIndex + 2) % 4) {
      const otherColor = pickDifferent(COLOR_POOL, color, s + idx * 13);
      return {
        id: `card-${roundNumber}-${idx}`,
        icon: item.icon,
        category: item.category,
        colorName: otherColor.name,
        colorHex: otherColor.hex,
        feature,
        location,
        isMatch: false,
      };
    }

    // Distractor 3: Different color and feature (or different item at early rounds)
    const otherColor = pickDifferent(COLOR_POOL, color, s + idx * 19);
    const otherFeature = pickDifferent(FEATURE_POOL, feature, s + idx * 23);
    return {
      id: `card-${roundNumber}-${idx}`,
      icon: item.icon,
      category: item.category,
      colorName: otherColor.name,
      colorHex: otherColor.hex,
      feature: otherFeature,
      location: pickDifferent(LOCATION_POOL, location, s + idx * 9),
      isMatch: false,
    };
  });

  return {
    roundNumber,
    clientEmoji: client.emoji,
    clientName: client.name,
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
