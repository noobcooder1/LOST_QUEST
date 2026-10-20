import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readModelConfig } from './model-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtimeRoot = path.join(root, 'public/onnx');
const models = Object.values(readModelConfig().vision);
const runtimeFiles = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'];

async function checkModel(spec) {
  const modelRoot = path.join(root, 'public/models', spec.directory);
  const manifest = JSON.parse(await readFile(path.join(modelRoot, 'assets.json'), 'utf8'));
  if (manifest.revision !== spec.revision || manifest.source !== spec.source) throw new Error('Model source/revision mismatch');
  for (const name of spec.files) {
    const bytes = await readFile(path.join(modelRoot, name));
    if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256[name]) throw new Error(`Model integrity check failed: ${name}`);
  }
}
async function check() {
  for (const name of runtimeFiles) await stat(path.join(runtimeRoot, name));
  for (const spec of models) {
    try { await checkModel(spec); }
    catch (error) {
      if (process.argv.includes('--allow-missing') && error.code === 'ENOENT') {
        console.log(`${spec.directory}: weights absent (expected in a fresh clone). Run npm run setup:vision before analysis.`);
      } else throw error;
    }
  }
}

try {
  if (process.argv.includes('--check')) {
    await check();
    console.log('Local vision model and WASM assets verified.');
  } else {
    await mkdir(runtimeRoot, { recursive: true });
    for (const name of runtimeFiles) await copyFile(path.join(root, 'node_modules/onnxruntime-web/dist', name), path.join(runtimeRoot, name));
    if (!process.argv.includes('--runtime-only')) {
      for (const spec of models) {
      const modelRoot = path.join(root, 'public/models', spec.directory);
      await mkdir(path.join(modelRoot, 'onnx'), { recursive: true });
      try { await checkModel(spec); console.log(`${spec.directory} already installed.`); continue; } catch { /* Download the pinned public model below. */ }
      const sha256 = {};
      for (const name of spec.files) {
        console.log(`Downloading ${spec.directory}: ${name}`);
        const response = await fetch(`https://huggingface.co/${spec.source}/resolve/${spec.revision}/${name}`, { signal: AbortSignal.timeout(180000) });
        if (!response.ok) throw new Error(`Download failed: ${name}, HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (name.endsWith('.onnx') && bytes.length < 20_000_000) throw new Error('Model download is incomplete.');
        if (name.endsWith('.json')) JSON.parse(bytes.toString('utf8'));
        await writeFile(path.join(modelRoot, name), bytes);
        sha256[name] = createHash('sha256').update(bytes).digest('hex');
      }
      await writeFile(path.join(modelRoot, 'assets.json'), JSON.stringify({ source: spec.source, revision: spec.revision, sha256 }, null, 2));
      }
      await check();
      console.log('Vision setup complete. Inference uses local assets only.');
    }
  }
} catch (error) {
  console.error(error.message);
  console.error('외형 비교 파일 준비: npm run setup:vision (최초 1회 인터넷 필요)');
  process.exitCode = 1;
}
