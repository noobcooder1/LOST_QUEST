import { env, pipeline, RawImage, type ImageFeatureExtractionPipeline, type ZeroShotImageClassificationPipeline } from '@huggingface/transformers';
import { CLASSIFIER_PROMPTS, categoryPrediction, manualCategory } from './categories';
import { VISION_MODELS } from './modelConfig';

env.allowLocalModels = true;
env.allowRemoteModels = __ALLOW_REMOTE_MODELS__;
env.localModelPath = '/models/';
env.useBrowserCache = __ALLOW_REMOTE_MODELS__;
env.backends.onnx.wasm!.wasmPaths = '/onnx/';
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;

let extractor: Promise<ImageFeatureExtractionPipeline> | null = null;
let classifier: Promise<ZeroShotImageClassificationPipeline> | null = null;
// The library's generic pipeline union exceeds TypeScript's union size limit.
const createExtractor = pipeline as unknown as (task: string, model: string, options: object) => Promise<ImageFeatureExtractionPipeline>;
const createClassifier = pipeline as unknown as (task: string, model: string, options: object) => Promise<ZeroShotImageClassificationPipeline>;
const modelId = (model: { directory: string; source: string }) => __ALLOW_REMOTE_MODELS__ ? model.source : model.directory;
const modelOptions = (model: { revision: string; dtype: string }) => ({
  device: 'wasm',
  dtype: model.dtype,
  local_files_only: !__ALLOW_REMOTE_MODELS__,
  ...(__ALLOW_REMOTE_MODELS__ ? { revision: model.revision } : {}),
});
function loadClassifier(id: number) {
  if (!classifier) {
    self.postMessage({ id, type: 'loading' });
    const classifierConfig = VISION_MODELS.classifier;
    classifier = createClassifier('zero-shot-image-classification', modelId(classifierConfig), modelOptions(classifierConfig)).then(model => {
      if (model.processor.image_processor) model.processor.image_processor.do_center_crop = false;
      return model;
    });
  }
  return classifier;
}

self.onmessage = async (event: MessageEvent<{ id: number; image: Blob; categoryId?: string; prompts?: string[] }>) => {
  const { id, image, categoryId = 'auto', prompts } = event.data;
  try {
    // Text ↔ photo: CLIP scores how well each English description fits this photo (softmax over the prompts).
    if (prompts) {
      if (!prompts.length || prompts.length > 64 || prompts.some(p => typeof p !== 'string' || !p || p.length > 200)) throw new Error('Invalid prompts');
      const ranked = await (await loadClassifier(id))(await RawImage.fromBlob(image), prompts);
      self.postMessage({ id, type: 'describe', ranked });
      return;
    }
    if (!extractor) {
      self.postMessage({ id, type: 'loading' });
      const feature = VISION_MODELS.feature;
      extractor = createExtractor('image-feature-extraction', modelId(feature), modelOptions(feature)).then(model => {
        const processor = model.processor.image_processor;
        if (!processor) throw new Error('DINOv2 이미지 전처리기를 찾을 수 없습니다.');
        // Input is already letterboxed, so do not cut the selected object's edges.
        processor.do_center_crop = false;
        processor.size = { height: feature.inputSize, width: feature.inputSize };
        return model;
      });
    }
    const model = await extractor;
    const raw = await RawImage.fromBlob(image);
    const tensor = await model(raw);
    // This ONNX export returns [batch, CLS + patch tokens, 384], without
    // pooler_output. DINOv2's first (CLS) token is the global image descriptor.
    const dimensions = VISION_MODELS.feature.dimensions;
    if (tensor.dims.length !== 3 || tensor.dims[0] !== 1 || tensor.dims[2] !== dimensions) throw new Error('외형 모델의 이미지 특징 출력 차원이 설정과 다릅니다.');
    const vector = Array.from((tensor.data as Float32Array).slice(0, dimensions));
    if (vector.length !== dimensions || !vector.every(Number.isFinite) || !vector.some(n => n !== 0)) throw new Error('외형 모델이 유효한 특징 벡터를 반환하지 않았습니다.');
    let category;
    if (categoryId !== 'auto') category = manualCategory(categoryId);
    else {
      const ranked = await (await loadClassifier(id))(raw, CLASSIFIER_PROMPTS);
      category = categoryPrediction(ranked as { label: string; score: number }[]);
    }
    self.postMessage({ id, type: 'result', vector, category });
  } catch (error) {
    extractor = null;
    classifier = null;
    self.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
