// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QuestGamePage from './QuestGamePage';
import { addRankingEntry, cleanNickname, generateSimpleRound, getSimpleGrade, levelFor, loadRanking, qualifiesForRanking, type RankingEntry } from '../services/questGameData';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Simple Lost-and-Found Matching Game (QuestGamePage)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const render = async (strict = false) => {
    const page = <MemoryRouter><QuestGamePage /></MemoryRouter>;
    await act(async () => { root.render(strict ? <StrictMode>{page}</StrictMode> : page); });
  };
  const text = () => container.textContent ?? '';
  const button = (label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.includes(label))!;
  const start = () => act(async () => { button('게임 시작').click(); });
  const choices = () => Array.from(container.querySelectorAll<HTMLButtonElement>('.simple-choice-btn'));
  const clues = () => Array.from(container.querySelectorAll('.simple-clue-pill strong')).map(e => e.textContent!.trim());
  const correctButton = () => {
    const [category, color, feature] = clues();
    return choices().find(b => b.querySelector('strong')!.textContent === `${color} ${category}` && b.querySelector('.simple-choice-feature')!.textContent === feature)!;
  };
  const wrongButton = () => choices().find(b => b !== correctButton())!;
  const timeLeft = () => container.querySelector('.simple-hud-box strong')!.textContent;

  it('generates rounds with exactly 1 matching item and 3 distractors, all different cards', () => {
    for (let seed = 0; seed < 50; seed++) {
      const round = generateSimpleRound(1 + (seed % 7), seed);
      expect(round.choices).toHaveLength(4);
      expect(round.choices.filter(c => c.isMatch)).toHaveLength(1);
      expect(new Set(round.choices.map(c => `${c.category}|${c.colorName}|${c.feature}`)).size).toBe(4);
    }
    expect(getSimpleGrade(750)).toBe('S');
    expect(getSimpleGrade(100)).toBe('C');
  });

  it('places the answer at a random position, spread evenly over the four slots', () => {
    const counts = [0, 0, 0, 0];
    for (let seed = 1; seed <= 200; seed++) {
      const positions = new Set<number>();
      for (let round = 1; round <= 20; round++) {
        const index = generateSimpleRound(round, seed).choices.findIndex(c => c.isMatch);
        counts[index]++; positions.add(index);
      }
      expect(positions.size).toBe(4); // every slot is used within a game
    }
    expect(counts).toEqual([1000, 1000, 1000, 1000]); // exactly even over whole blocks of 4 rounds
  });

  it('never keeps the answer in the same slot three rounds in a row, and games differ', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const slots = Array.from({ length: 40 }, (_, i) => generateSimpleRound(i + 1, seed).choices.findIndex(c => c.isMatch));
      for (let i = 2; i < slots.length; i++) expect(slots[i] === slots[i - 1] && slots[i] === slots[i - 2]).toBe(false);
    }
    const order = (seed: number) => Array.from({ length: 8 }, (_, i) => generateSimpleRound(i + 1, seed).choices.findIndex(c => c.isMatch)).join('');
    expect(new Set(Array.from({ length: 30 }, (_, s) => order(s + 1))).size).toBeGreaterThan(20);
  });

  it('gets harder as rounds go on: other items first, then same item, then look-alike colors and features', () => {
    const twins = [['블랙', '차콜'], ['네이비', '블루'], ['민트', '그린'], ['버건디', '레드'], ['옐로우', '베이지'], ['퍼플', '라벤더']];
    const featureTwins = [['별 모양 키링', '하트 모양 키링'], ['네잎클로버 스티커', '세잎클로버 스티커'], ['이니셜 K 각인', '이니셜 R 각인'], ['체크무늬 리본', '물방울무늬 리본'],
      ['고양이 참 장식', '강아지 참 장식'], ['은색 자물쇠 고리', '금색 자물쇠 고리'], ['카페 영수증 동봉', '영화 티켓 동봉'], ['가죽 스트랩', '실리콘 스트랩']];
    const isTwin = (pairs: string[][], a: string, b: string) => pairs.some(pair => pair.includes(a) && pair.includes(b));
    expect([1, 3, 4, 7, 8, 12, 13, 40].map(r => levelFor(r).name)).toEqual(['쉬움', '쉬움', '보통', '보통', '어려움', '어려움', '전문가', '전문가']);
    for (let seed = 1; seed <= 60; seed++) {
      for (const round of [1, 5, 9, 15]) {
        const r = generateSimpleRound(round, seed);
        const wrong = r.choices.filter(c => !c.isMatch);
        const level = levelFor(round).level;
        if (level === 1) expect(wrong.some(c => c.category !== r.targetCategory)).toBe(true);
        else expect(r.choices.every(c => c.category === r.targetCategory)).toBe(true);
        if (level === 2) for (const c of wrong) {
          expect(c.colorName === r.targetColorName || !isTwin(twins, c.colorName, r.targetColorName)).toBe(true);
          expect(c.feature === r.targetFeature || !isTwin(featureTwins, c.feature, r.targetFeature)).toBe(true);
        }
        if (level === 4) for (const c of wrong) {
          expect(c.colorName === r.targetColorName || isTwin(twins, c.colorName, r.targetColorName)).toBe(true);
          expect(c.feature === r.targetFeature || isTwin(featureTwins, c.feature, r.targetFeature)).toBe(true);
        }
        if (level >= 3) expect(wrong.some(c => isTwin(twins, c.colorName, r.targetColorName) || isTwin(featureTwins, c.feature, r.targetFeature))).toBe(true);
      }
    }
  });

  it('is reproducible for the same game seed and different for another', () => {
    expect(generateSimpleRound(5, 42)).toEqual(generateSimpleRound(5, 42));
    expect(generateSimpleRound(5, 42)).not.toEqual(generateSimpleRound(5, 43));
  });

  it('waits on an intro screen until the player starts, without counting down', async () => {
    vi.useFakeTimers();
    await render();
    expect(text()).toContain('게임 시작'); expect(choices()).toHaveLength(0);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(container.querySelector('.quest-hud')).toBeNull(); // no clock before the game starts
    await start();
    expect(timeLeft()).toBe('60초');
    expect(choices()).toHaveLength(4); expect(text()).toContain('ROUND 1');
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(timeLeft()).toBe('57초');
  });

  it('awards score and advances round on the matching card, and ends the game after 3 wrong clicks', async () => {
    await render(); await start();
    await act(async () => { correctButton().click(); });
    expect(text()).toContain('ROUND 2'); expect(text()).toContain('100점');
    for (let i = 0; i < 3; i++) await act(async () => { wrongButton().click(); });
    expect(text()).toContain('반환 미션 종료!'); expect(text()).toContain('다시 플레이하기');
  });

  it('keeps counting down while the player answers faster than once a second', async () => {
    vi.useFakeTimers();
    await render(); await start();
    for (let i = 0; i < 20; i++) {
      await act(async () => { correctButton().click(); });
      await act(async () => { vi.advanceTimersByTime(500); });
    }
    expect(timeLeft()).toBe('50초');
    expect(text()).toContain('ROUND 21');
  });

  it('saves the record once when time runs out, even under StrictMode', async () => {
    vi.useFakeTimers();
    await render(true); await start();
    for (let i = 0; i < 3; i++) await act(async () => { correctButton().click(); });
    await act(async () => { vi.advanceTimersByTime(61_000); });
    expect(text()).toContain('총 3건의 주인을 찾아주었어요');
    expect(JSON.parse(window.localStorage.getItem('lostquest:simple-game:v1')!)).toEqual({ bestScore: 360, bestCombo: 3, totalSolved: 3 });
    expect(timeLeft()).toBe('0초');
  });

  it('plays a different question order on each start', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.7);
    await render(); await start();
    const first = clues().join('|');
    for (let i = 0; i < 3; i++) await act(async () => { wrongButton().click(); });
    await act(async () => { button('다시 플레이하기').click(); });
    expect(random).toHaveBeenCalledTimes(2);
    expect(clues().join('|')).not.toBe(first);
  });

  it('ignores held-down number keys and keys typed into fields', async () => {
    await render(); await start();
    const key = String(choices().indexOf(correctButton()) + 1);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key, repeat: true })); });
    const input = document.createElement('input'); document.body.appendChild(input);
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
    input.remove();
    expect(text()).toContain('ROUND 1');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key })); });
    expect(text()).toContain('ROUND 2');
  });
  const entry = (nickname: string, score: number, playedAt = '2026-10-20T00:00:00.000Z'): RankingEntry => ({ nickname, score, solved: 1, bestCombo: 1, playedAt });
  const finishWithScore = async (corrects: number) => {
    await render(); await start();
    for (let i = 0; i < corrects; i++) await act(async () => { correctButton().click(); });
    for (let i = 0; i < 3; i++) await act(async () => { wrongButton().click(); });
  };
  const typeNickname = async (value: string) => {
    const input = container.querySelector<HTMLInputElement>('#quest-nickname')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('keeps a clean, sorted local top 10 and only lets scores that beat 10th place in', () => {
    expect(cleanNickname('  탐정  김   철수  ')).toBe('탐정 김 철수');
    expect(cleanNickname('가나다라마바사아자차카타파하')).toHaveLength(12);
    expect(cleanNickname('   ')).toBe('');
    window.localStorage.setItem('lostquest:simple-game:ranking:v1', JSON.stringify([entry('a', 100), { nickname: '', score: 5 }, entry('b', -1), 'x', entry('c', 300)]));
    expect(loadRanking().map(e => e.nickname)).toEqual(['c', 'a']);
    window.localStorage.setItem('lostquest:simple-game:ranking:v1', 'not json');
    expect(loadRanking()).toEqual([]);

    window.localStorage.clear();
    for (let i = 1; i <= 10; i++) addRankingEntry(entry(`p${i}`, i * 100, `2026-10-20T00:00:${String(i).padStart(2, '0')}.000Z`));
    const ranking = loadRanking();
    expect(ranking).toHaveLength(10); expect(ranking[0].nickname).toBe('p10');
    expect(qualifiesForRanking(0, [])).toBe(false);
    expect(qualifiesForRanking(100, ranking)).toBe(false);
    expect(qualifiesForRanking(150, ranking)).toBe(true);
    const added = addRankingEntry(entry('new', 550, '2026-10-20T01:00:00.000Z'));
    expect(added.rank).toBe(6); expect(added.ranking).toHaveLength(10);
    expect(added.ranking.some(e => e.nickname === 'p1')).toBe(false);
  });

  it('shows the ranking on the start screen', async () => {
    addRankingEntry(entry('명탐정', 900));
    await render();
    const board = container.querySelector('.quest-ranking')!;
    expect(board.textContent).toContain('랭킹 TOP 10'); expect(board.textContent).toContain('명탐정'); expect(board.textContent).toContain('900');
  });

  it('lets the player set a nickname after a game and shows where it landed', async () => {
    await finishWithScore(2);
    expect(text()).toContain('랭킹에 오를 수 있는 기록이에요');
    await typeNickname('   ');
    await act(async () => { button('랭킹 등록').click(); });
    expect(text()).toContain('닉네임을 1~12자로 입력해 주세요.'); expect(loadRanking()).toHaveLength(0);

    await typeNickname('  셜록 홈즈  ');
    await act(async () => { button('랭킹 등록').click(); });
    expect(text()).toContain('셜록 홈즈 님이 1위에 올랐어요!');
    expect(container.querySelector('#quest-nickname')).toBeNull(); // one save per game
    expect(loadRanking()).toEqual([expect.objectContaining({ nickname: '셜록 홈즈', score: 220, solved: 2, bestCombo: 2 })]);

    await act(async () => { button('랭킹 보기').click(); });
    const mine = container.querySelector('.quest-ranking-list li.is-mine')!;
    expect(mine.textContent).toContain('셜록 홈즈');

    act(() => root.unmount()); root = createRoot(container);
    await finishWithScore(1);
    expect(container.querySelector<HTMLInputElement>('#quest-nickname')!.value).toBe('셜록 홈즈'); // remembered
  });

  it('offers no nickname form for a zero score', async () => {
    await finishWithScore(0);
    expect(text()).toContain('반환 미션 종료!'); expect(container.querySelector('#quest-nickname')).toBeNull();
  });
});
