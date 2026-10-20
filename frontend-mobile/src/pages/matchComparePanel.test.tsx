// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchResult } from '../services/matchingApi';
import type { Item } from '../types';
import MatchComparePanel from './MatchComparePanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const app = vi.hoisted(() => ({ value: { authUser: { id: 5 } as null | { id: number }, authChecking: false } }));
vi.mock('../context/AppContext', () => ({ useApp: () => app.value }));
const photos = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../services/matchPhotoComparison', () => ({ loadMatchPhotos: photos.load }));
const vision = vi.hoisted(() => ({ analyze: vi.fn(), describe: vi.fn(), release: vi.fn() }));
vi.mock('../features/imageAnalysis/appearance', () => ({ analyzeAppearance: vision.analyze, describeImage: vision.describe, releaseAppearanceResources: vision.release }));
const text = vi.hoisted(() => ({ embed: vi.fn() }));
vi.mock('../features/textMatching/textMatching', () => ({ textEmbeddings: text.embed }));

const lost = { id: 'api-lost-11', title: '검은색 우산', category: '액세서리', color: '검정', description: '검은 장우산', image: 'http://x/api/images/a.jpg' } as Item;
const match = { id: 'LOST_QUEST:31', title: '검정 자동 장우산', category: '액세서리', color: '검정', description: '버튼식 자동 우산', score: 98 } as MatchResult;
const jpeg = (name: string) => new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: 'image/jpeg' });
const unit = (cos: number) => [cos, Math.sqrt(1 - cos * cos)];

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  app.value = { authUser: { id: 5 }, authChecking: false };
  photos.load.mockReset().mockResolvedValue({ lost: jpeg('a.jpg'), found: jpeg('b.jpg') });
  // CLIP: all probability on the described "black umbrella" prompt.
  vision.describe.mockReset().mockImplementation(async (_file: File, prompts: string[]) => prompts.map((label, i) => ({ label, score: i === 0 ? 1 : 0 })));
  vision.analyze.mockReset().mockResolvedValue({ visualCosine: 0.6, visualPercent: 60, colorPercent: 20, categories: [] });
  vision.release.mockReset();
  text.embed.mockReset().mockResolvedValue([unit(1), unit(0.86)]);
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

async function render(props: Partial<Parameters<typeof MatchComparePanel>[0]> = {}) {
  await act(async () => { root.render(<MatchComparePanel lost={lost} match={match} lostKind="우산" itemType="umbrella" onClose={vi.fn()} {...props} />); });
  for (let i = 0; i < 8; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}
const page = () => container.textContent ?? '';

describe('MatchComparePanel (AI combined comparison)', () => {
  it('combines photo appearance, text ↔ photo, text meaning and color into one reference score', async () => {
    await render();
    expect(vision.describe.mock.calls[0][1][0]).toBe('a photo of a black umbrella');
    expect(vision.analyze.mock.calls[0][3]).toEqual(['umbrella', 'umbrella']);
    // visual 0.6/0.75=0.8, kind 1, text 0.5, color 1 → (0.32 + 0.25 + 0.10 + 0.15) = 82.0
    expect(container.querySelector('.analysis-center-score')?.textContent).toContain('82.0%');
    expect(page()).toContain('사진 외형 40 · 글 ↔ 사진 25 · 텍스트 의미 20 · 색상 일치 15');
    expect(page()).toContain('주운 물건 사진이 “black umbrella”인 정도'); expect(page()).toContain('같음');
    expect(page()).toContain('매칭도 98점과 추천 순서는 바뀌지 않아요');
    expect(vision.release).toHaveBeenCalled();
  });

  it('compares by words when the lost post has no photo', async () => {
    photos.load.mockResolvedValueOnce({ lost: null, found: jpeg('b.jpg') });
    await render();
    expect(vision.analyze).not.toHaveBeenCalled();
    expect(page()).toContain('잃어버린 물건 사진 없음 · 글로 비교해요'); expect(page()).toContain('사진 없음');
    // kind 1, text 0.5, color 1 over weights 25/20/15 → (0.25 + 0.10 + 0.15) / 0.60 = 83.3
    expect(container.querySelector('.analysis-center-score')?.textContent).toContain('83.3%');
  });

  it('shows only the text meaning when neither photo nor kind can be compared', async () => {
    photos.load.mockResolvedValueOnce({ lost: null, found: jpeg('b.jpg') });
    await render({ lost: { ...lost, category: '기타', title: '물건', color: '' } as Item, lostKind: undefined, itemType: undefined });
    expect(vision.describe).not.toHaveBeenCalled();
    expect(page()).toContain('종합 점수를 낼 수 없어요'); expect(container.querySelector('.analysis-center-score')).toBeNull();
  });

  it('reports a failure without a score, and re-runs on 다시 비교', async () => {
    photos.load.mockRejectedValueOnce(new Error('이 주운 물건에는 비교할 사진이 없어요.'));
    await render();
    expect(page()).toContain('이 주운 물건에는 비교할 사진이 없어요.'); expect(container.querySelector('.analysis-center-score')).toBeNull();
    const again = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('다시 비교'))!;
    await act(async () => again.click());
    for (let i = 0; i < 8; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(container.querySelector('.analysis-center-score')?.textContent).toContain('82.0%');
  });

  it('still gives a photo-based score when the text model cannot load', async () => {
    text.embed.mockRejectedValueOnce(new Error('model missing'));
    await render();
    // visual 0.8 (40), kind 1 (25), color 1 (15) over 80 → 90.0; text left out
    expect(container.querySelector('.analysis-center-score')?.textContent).toContain('90.0%');
    expect(page()).toContain('텍스트 모델을 불러오지 못했어요'); expect(page()).not.toContain('비교를 완료하지 못했어요');
  });

  it('asks to sign in when signed out', async () => {
    app.value = { authUser: null, authChecking: false };
    await render();
    expect(page()).toContain('로그인한 뒤 비교할 수 있어요.'); expect(photos.load).not.toHaveBeenCalled();
  });
});
