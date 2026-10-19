// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QuestGamePage from './QuestGamePage';
import { generateSimpleRound, getSimpleGrade } from '../services/questGameData';

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
  });

  it('generates rounds with exactly 1 matching item and 3 distractors', () => {
    const round = generateSimpleRound(1, 0);
    expect(round.choices).toHaveLength(4);
    expect(round.choices.filter(c => c.isMatch)).toHaveLength(1);
    expect(getSimpleGrade(750)).toBe('S');
    expect(getSimpleGrade(100)).toBe('C');
  });

  it('awards score and advances round on clicking the matching card, and ends game after 3 wrong clicks', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/quest-game']}>
          <QuestGamePage />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('진짜 주인을 찾아라!');
    expect(container.textContent).toContain('ROUND 1');

    // Find the matching choice in Round 1 and click it
    const round1 = generateSimpleRound(1, 0);
    const matchIdx = round1.choices.findIndex(c => c.isMatch);
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.simple-choice-btn'));
    expect(buttons).toHaveLength(4);

    await act(async () => {
      buttons[matchIdx].click();
    });

    expect(container.textContent).toContain('ROUND 2');
    expect(container.textContent).toContain('100점');

    // Click wrong choice 3 times in Round 2 to trigger Game Over
    const round2 = generateSimpleRound(2, 0);
    const wrongIdx = round2.choices.findIndex(c => !c.isMatch);
    for (let i = 0; i < 3; i++) {
      const currentButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('.simple-choice-btn'));
      await act(async () => {
        currentButtons[wrongIdx].click();
      });
    }

    expect(container.textContent).toContain('반환 미션 종료!');
    expect(container.textContent).toContain('다시 플레이하기');
  });
});
