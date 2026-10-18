import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFile, rm } from 'node:fs/promises';
// @ts-expect-error Shared Node configuration loader is intentionally plain JavaScript.
import { readModelConfig } from './scripts/model-config.mjs';

const modelConfig = readModelConfig();

function localOnnxRuntime(): Plugin {
  const names = new Set(['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']);
  const install = (server: Pick<ViteDevServer, 'middlewares'>) => {
    server.middlewares.use((request, response, next) => {
      const pathname = request.url?.split('?')[0] ?? '';
      if (!pathname.startsWith('/onnx/') || !names.has(pathname.slice('/onnx/'.length))) { next(); return; }
      const name = pathname.slice('/onnx/'.length);
      void readFile(new URL(`./public/onnx/${name}`, import.meta.url)).then((bytes) => {
        response.writeHead(200, { 'Content-Type': name.endsWith('.wasm') ? 'application/wasm' : 'application/javascript', 'Cache-Control': 'no-cache' });
        response.end(bytes);
      }).catch(() => { response.writeHead(404); response.end('Local ONNX runtime missing. Run npm run setup:vision.'); });
    });
  };
  return { name: 'local-onnx-runtime', configureServer: install, configurePreviewServer: install };
}

function stripBundledModels(enabled: boolean): Plugin {
  return {
    name: 'strip-bundled-models',
    apply: 'build',
    async closeBundle() {
      if (enabled) await rm(new URL('./dist/models/', import.meta.url), { recursive: true, force: true });
    },
  };
}

export default defineConfig(({ mode }) => {
  const allowRemoteModels = loadEnv(mode, process.cwd(), '').VITE_REMOTE_VISION_MODELS === 'true';
  return {
    plugins: [react(), tailwindcss(), localOnnxRuntime(), stripBundledModels(allowRemoteModels)],
    define: {
      __ALLOW_REMOTE_MODELS__: JSON.stringify(allowRemoteModels),
      __LOCAL_MODEL_CONFIG__: JSON.stringify({
        vision: Object.fromEntries(Object.entries(modelConfig.vision).map(([role, spec]) => {
          const model = spec as { directory: string; source: string; revision: string; label: string; adapter: string; dimensions?: number; inputSize?: number; dtype: string };
          return [role, { directory: model.directory, source: model.source, revision: model.revision, label: model.label, adapter: model.adapter, dimensions: model.dimensions, inputSize: model.inputSize, dtype: model.dtype }];
        })),
      }),
    },
    optimizeDeps: { include: ['@huggingface/transformers'] },
    server: { port: 5173, strictPort: true },
  };
});
