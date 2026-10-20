// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPhotoSimilarityEnabled, resolvePhotoSimilarity, type PhotoSimilarity } from '../services/photoSimilarity';
import PhotoSimilarityIndicator from './PhotoSimilarityIndicator';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllEnvs();
});

function show(similarity?: PhotoSimilarity | null) {
  act(() => root.render(<PhotoSimilarityIndicator similarity={similarity} />));
  const area = container.querySelector('.photo-similarity')!;
  return { status: area.getAttribute('data-status'), text: area.textContent ?? '', area };
}

describe('isPhotoSimilarityEnabled', () => {
  it('is off unless the flag is exactly true', () => {
    expect(isPhotoSimilarityEnabled()).toBe(false);
    for (const value of ['', 'false', '1', 'yes', 'on']) {
      vi.stubEnv('VITE_FEATURE_AI_PHOTO_SIMILARITY', value);
      expect(isPhotoSimilarityEnabled()).toBe(false);
    }
    vi.stubEnv('VITE_FEATURE_AI_PHOTO_SIMILARITY', ' TRUE ');
    expect(isPhotoSimilarityEnabled()).toBe(true);
  });
});

describe('PhotoSimilarityIndicator', () => {
  it('treats missing data as unavailable', () => {
    for (const value of [undefined, null]) {
      const { status, text } = show(value);
      expect(status).toBe('UNAVAILABLE');
      expect(text).toContain('지금은 사진 비교를 할 수 없어요');
    }
  });

  it('shows pending, no-image and unavailable states without any number', () => {
    const cases = [
      ['PENDING', '사진을 비교하고 있어요'],
      ['NO_IMAGE', '비교할 수 있는 사진이 없어요'],
      ['UNAVAILABLE', '지금은 사진 비교를 할 수 없어요'],
    ] as const;
    for (const [state, message] of cases) {
      const { status, text, area } = show({ status: state });
      expect(status).toBe(state);
      expect(text).toContain('AI 사진 유사도');
      expect(text).toContain('참고');
      expect(text).toContain(message);
      expect(text).not.toMatch(/\d/);
      expect(area.querySelector('[role="status"]') !== null).toBe(state === 'PENDING');
    }
  });

  it('never shows a level or percent for a READY result without real data', () => {
    const empty = [
      { status: 'READY' },
      { status: 'READY', percent: 87 },
      { status: 'READY', level: 'VERY_HIGH' as never, percent: 87 },
    ] as PhotoSimilarity[];
    for (const value of empty) {
      const { status, text, area } = show(value);
      expect(status).toBe('READY');
      expect(text).toContain('표시할 비교 결과가 아직 없어요');
      expect(text).not.toMatch(/\d/);
      expect(text).not.toContain('유사도 높음');
      expect(area.querySelector('.photo-similarity-bars')).toBeNull();
    }
  });

  it('shows a real READY level, and a percent only when it is valid', () => {
    let shown = show({ status: 'READY', level: 'HIGH', percent: 82.6 });
    expect(shown.text).toContain('유사도 높음');
    expect(shown.text).toContain('83%');
    expect(shown.area.querySelectorAll('.photo-similarity-bars i.on')).toHaveLength(3);

    shown = show({ status: 'READY', level: 'LOW' });
    expect(shown.text).toContain('유사도 낮음');
    expect(shown.text).not.toContain('%');
    expect(shown.area.querySelectorAll('.photo-similarity-bars i.on')).toHaveLength(1);

    for (const percent of [Number.NaN, -1, 101, Infinity]) {
      expect(resolvePhotoSimilarity({ status: 'READY', level: 'MEDIUM', percent })).toEqual({ status: 'READY', level: 'MEDIUM', percent: undefined });
    }
  });

  it('maps unknown statuses to unavailable and never claims ownership', () => {
    const { status, text } = show({ status: 'MAYBE' } as never);
    expect(status).toBe('UNAVAILABLE');
    expect(text).toContain('매칭도 점수에는 반영되지 않는 참고 정보예요');
    for (const forbidden of ['AI가 판단', '확인했', '본인 물건', '소유']) expect(text).not.toContain(forbidden);
  });

  it('shows measured browser references without inventing calibrated bands or ownership probabilities', () => {
    const { text, area, status } = show({ status: 'READY', appearancePercent: 86.43, colorPercent: 72.15 });
    expect(status).toBe('READY'); expect(text).toContain('외형 86.4%'); expect(text).toContain('색상 분포 72.2%');
    expect(area.querySelector('.photo-similarity-bars')).toBeNull();
    expect(text).not.toContain('유사도 높음'); expect(text).not.toContain('확률');
    expect(show({ status: 'SKIPPED' }).text).toContain('이번 이미지 비교에서 제외된 물품이에요');
  });

  it('does not render invalid browser percentages', () => {
    for (const n of [Number.NaN, Infinity, -1, 101]) {
      expect(show({ status: 'READY', appearancePercent: n, colorPercent: 80 }).text).not.toContain('%');
      expect(show({ status: 'READY', appearancePercent: 80, colorPercent: n }).text).not.toContain('%');
    }
  });
});
