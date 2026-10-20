import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
export function readModelConfig() {
  const local = path.join(root, 'config/models.local.json');
  const config = JSON.parse(readFileSync(existsSync(local) ? local : path.join(root, 'config/models.example.json'), 'utf8'));
  const endpoint = new URL(config.ollama.baseUrl);
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
    throw new Error('Ollama baseUrl must be a plain HTTP loopback URL without credentials.');
  }
  if (typeof config.ollama.model !== 'string' || !/^[a-zA-Z0-9_.:/-]+$/.test(config.ollama.model)) throw new Error('Invalid Ollama model name.');
  for (const [role, model] of Object.entries(config.vision)) {
    if (!['feature', 'classifier'].includes(role) || !/^[a-zA-Z0-9_-]+$/.test(model.directory) || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(model.source) || !/^[a-f0-9]{40}$/.test(model.revision)) throw new Error(`Invalid ${role} model source or pinned revision.`);
    if (typeof model.label !== 'string' || model.label.length > 80 || !['q8', 'fp32', 'fp16', 'int8', 'uint8', 'q4', 'q4f16', 'bnb4'].includes(model.dtype)) throw new Error(`Invalid ${role} model metadata.`);
    if (!Array.isArray(model.files) || !model.files.length || model.files.some(file => typeof file !== 'string' || file.includes('..') || !/^[a-zA-Z0-9_/-]+\.(json|onnx)$/.test(file))) throw new Error(`Invalid ${role} model file path.`);
  }
  if (config.vision.feature.adapter !== 'dinov2-cls' || config.vision.classifier.adapter !== 'clip-zero-shot') throw new Error('Unsupported model adapter. See MODEL_CONFIG.md.');
  if (!Number.isInteger(config.vision.feature.dimensions) || config.vision.feature.dimensions < 1 || config.vision.feature.dimensions > 8192 || !Number.isInteger(config.vision.feature.inputSize) || config.vision.feature.inputSize < 32 || config.vision.feature.inputSize > 2048) throw new Error('Invalid feature dimensions or input size.');
  // Only explicitly allowed public model metadata reaches the browser. No env or keys.
  return {
    ollama: { baseUrl: endpoint.origin, model: config.ollama.model },
    vision: { feature: config.vision.feature, classifier: config.vision.classifier },
  };
}
