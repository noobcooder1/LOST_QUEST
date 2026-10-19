import { colorHistogram, colorSimilarity, validCrop } from './appearanceMath';
import { loadImage } from './image';
import { cosineSimilarity, validateImageFile } from './similarityMath';
import type { AppearanceResult, CropRect, Progress } from './types';
import type { CategoryPrediction } from './categories';
import { VISION_MODELS } from './modelConfig';

let worker: Worker | null = null;
let nextId = 0;
type Extracted = { vector: number[]; category: CategoryPrediction };
type Pending = { resolve: (result: Extracted) => void; reject: (error: Error) => void; loading: () => void };
const pending = new Map<number, Pending>();

function disposeWorker(error: Error) {
  worker?.terminate();
  worker = null;
  for (const task of pending.values()) task.reject(error);
  pending.clear();
}
export function releaseAppearanceResources() {
  disposeWorker(new DOMException('Aborted', 'AbortError'));
}
function extract(image: Blob, categoryId: string, loading: () => void, signal?: AbortSignal): Promise<Extracted> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    if (!worker) {
      worker = new Worker(new URL('./vision.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<{ id: number; type: string; vector?: number[]; category?: CategoryPrediction; message?: string }>) => {
        const task = pending.get(event.data.id);
        if (!task) return;
        if (event.data.type === 'loading') { task.loading(); return; }
        pending.delete(event.data.id);
        if (event.data.type === 'result' && event.data.vector && event.data.category) task.resolve({ vector: event.data.vector, category: event.data.category });
        else task.reject(new Error(`로컬 외형 모델을 실행하지 못했습니다. npm run setup:vision으로 파일을 준비해 주세요. 상세: ${event.data.message?.slice(0, 250) ?? '알 수 없는 응답'}`));
      };
      worker.onerror = () => disposeWorker(new Error('외형 분석 작업을 실행하지 못했습니다. 브라우저를 새로고침하고 모델 파일을 확인해 주세요.'));
    }
    const abort = () => disposeWorker(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(() => disposeWorker(new Error('로컬 외형 분석 대기 시간(180초)을 초과했습니다.')), 180_000);
    const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const id = ++nextId;
    pending.set(id, { resolve: vector => { finish(); resolve(vector); }, reject: error => { finish(); reject(error); }, loading });
    signal?.addEventListener('abort', abort, { once: true });
    worker.postMessage({ id, image, categoryId });
  });
}

async function prepare(file: File, crop: CropRect, signal?: AbortSignal) {
  validateImageFile(file);
  validCrop(crop);
  const image = await loadImage(file, signal);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const sourceWidth = Math.max(1, Math.round(image.naturalWidth * crop.width));
  const sourceHeight = Math.max(1, Math.round(image.naturalHeight * crop.height));
  // Fit the complete selected region without squashing or center-cropping it.
  const scale = Math.min(1, 1024 / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  const visionCanvas = document.createElement('canvas');
  try {
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('브라우저의 이미지 분석 기능을 사용할 수 없습니다.');
    ctx.drawImage(image, image.naturalWidth * crop.x, image.naturalHeight * crop.y, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    const hist = colorHistogram(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
    // DINO sees the same region. Composite transparency on neutral white.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const inputSize = VISION_MODELS.feature.inputSize;
    visionCanvas.width = visionCanvas.height = inputSize;
    const visionContext = visionCanvas.getContext('2d');
    if (!visionContext) throw new Error('외형 모델의 입력 이미지를 준비할 수 없습니다.');
    visionContext.fillStyle = '#fff';
    visionContext.fillRect(0, 0, inputSize, inputSize);
    const factor = inputSize / Math.max(canvas.width, canvas.height);
    const width = canvas.width * factor, height = canvas.height * factor;
    visionContext.drawImage(canvas, (inputSize - width) / 2, (inputSize - height) / 2, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => visionCanvas.toBlob(b => b ? resolve(b) : reject(new Error('선택 영역을 PNG로 변환할 수 없습니다.')), 'image/png'));
    return { blob, hist };
  } finally { canvas.width = canvas.height = visionCanvas.width = visionCanvas.height = 0; }
}

export async function analyzeAppearance(a: File, b: File, crops: [CropRect, CropRect], categoryIds: [string, string], onProgress?: (progress: Progress) => void, signal?: AbortSignal): Promise<AppearanceResult> {
  const started = performance.now();
  const run = async (file: File, crop: CropRect, label: 'A' | 'B', categoryId: string) => {
    const start = performance.now();
    try {
      onProgress?.(label === 'A' ? 'imageA' : 'imageB');
      const prepared = await prepare(file, crop, signal);
      const extracted = await extract(prepared.blob, categoryId, () => onProgress?.('checking'), signal);
      onProgress?.(label === 'A' ? 'imageA' : 'imageB');
      return { ...extracted, hist: prepared.hist, metrics: { clientMs: performance.now() - start, serverMs: null, loadMs: null } };
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error(`이미지 ${label} 외형 분석 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const first = await run(a, crops[0], 'A', categoryIds[0]);
  const second = await run(b, crops[1], 'B', categoryIds[1]);
  onProgress?.('calculating');
  const visualCosine = cosineSimilarity(first.vector, second.vector);
  return {
    visualCosine, visualPercent: Math.max(0, visualCosine) * 100,
    colorPercent: colorSimilarity(first.hist, second.hist), dimensions: first.vector.length,
    imageA: first.metrics, imageB: second.metrics, totalMs: performance.now() - started,
    crops,
    categories: [first.category, second.category],
  };
}
