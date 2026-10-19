// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchResult } from '../services/matchingApi';
import type { Item } from '../types';
import ImageAnalysisPage from './ImageAnalysisPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const app = vi.hoisted(() => ({ value: { authUser: { id: 3 } as null | { id: number }, authChecking: false } }));
vi.mock('../context/AppContext', () => ({ useApp: () => app.value }));
const photos = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../services/matchPhotoComparison', () => ({ loadMatchPhotoPair: photos.load }));
const model = vi.hoisted(() => ({ analyze: vi.fn(), release: vi.fn() }));
vi.mock('../features/imageAnalysis/appearance', () => ({ analyzeAppearance: model.analyze, releaseAppearanceResources: model.release }));

const lost = { id: 'api-lost-12', title: '검은색 우산' } as Item;
const match = { id: 'LOST_QUEST:31', title: '검정 자동 장우산', score: 98 } as MatchResult;
const jpeg = (name: string) => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], name, { type: 'image/jpeg' });
const umbrella = { id: 'umbrella', label: '우산', confident: true, source: 'clip' };
const RESULT = { visualCosine: .8, visualPercent: 80, colorPercent: 90, dimensions: 384, totalMs: 1200,
  imageA: { clientMs: 1, serverMs: null, loadMs: null }, imageB: { clientMs: 1, serverMs: null, loadMs: null },
  crops: [{ x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1, height: 1 }], categories: [umbrella, umbrella] };

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  app.value = { authUser: { id: 3 }, authChecking: false };
  photos.load.mockReset().mockResolvedValue([jpeg('a.jpg'), jpeg('b.jpg')]);
  model.analyze.mockReset().mockResolvedValue(RESULT); model.release.mockReset();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:preview', revokeObjectURL: () => {} }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

async function render(onClose = vi.fn()) {
  await act(async () => { root.render(<MemoryRouter><ImageAnalysisPage preset={{ lost, match }} onClose={onClose} /></MemoryRouter>); });
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  return onClose;
}
const text = () => container.textContent ?? '';

describe('ImageAnalysisPage opened from a match', () => {
  it('loads both photos, compares them right away and shows the overall percent in the middle', async () => {
    const onClose = await render();
    expect(photos.load).toHaveBeenCalledTimes(1);
    expect(photos.load.mock.calls[0].slice(0, 3)).toEqual([lost, match, 3]);
    const [a, b] = model.analyze.mock.calls[0];
    expect([a.name, b.name]).toEqual(['a.jpg', 'b.jpg']);
    expect(container.querySelector('.analysis-center-score')?.textContent).toContain('83.0%'); // 80×0.7 + 90×0.3
    expect(text()).toContain('내 분실물 · 검은색 우산'); expect(text()).toContain('추천 습득물 · 검정 자동 장우산');
    expect(text()).toContain('매칭도 98점과 추천 순서는 바뀌지 않아요');
    expect(container.querySelector('.analysis-hero')).toBeNull(); expect(model.release).toHaveBeenCalled();
    const back = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('매칭 결과로 돌아가기'))!;
    await act(async () => back.click()); expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows why and runs no model when a photo cannot be loaded', async () => {
    photos.load.mockRejectedValueOnce(new Error('이 습득물에는 비교할 사진이 없어요.'));
    await render();
    expect(text()).toContain('이 습득물에는 비교할 사진이 없어요.'); expect(model.analyze).not.toHaveBeenCalled();
    expect(container.querySelector('.analysis-center-score')).toBeNull();
  });

  it('asks to sign in instead of loading photos when signed out', async () => {
    app.value = { authUser: null, authChecking: false };
    await render();
    expect(text()).toContain('로그인한 뒤 사진을 비교할 수 있어요.'); expect(photos.load).not.toHaveBeenCalled();
  });
});
