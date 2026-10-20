function abortError() {
  return new DOMException('Aborted', 'AbortError');
}
export function loadImage(file: File, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const image = new Image();
    const url = URL.createObjectURL(file);
    const clean = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener('abort', cancel);
      URL.revokeObjectURL(url);
    };
    const cancel = () => { clean(); image.src = ''; reject(abortError()); };
    image.onload = () => { clean(); resolve(image); };
    image.onerror = () => { clean(); reject(new Error('브라우저가 이미지 파일을 읽을 수 없습니다. 파일이 손상되었는지 확인해 주세요.')); };
    signal?.addEventListener('abort', cancel, { once: true });
    image.src = url;
  });
}

function pngBlob(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const cancel = () => reject(abortError());
    signal?.addEventListener('abort', cancel, { once: true });
    canvas.toBlob(blob => {
      signal?.removeEventListener('abort', cancel);
      if (signal?.aborted) { reject(abortError()); return; }
      if (!blob || blob.type !== 'image/png') {
        reject(new Error('이미지를 표준 PNG로 변환할 수 없습니다. 이미지 해상도를 줄이거나 다른 파일을 선택해 주세요.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

function blobBase64(blob: Blob, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const reader = new FileReader();
    const cancel = () => reader.abort();
    const clean = () => signal?.removeEventListener('abort', cancel);
    signal?.addEventListener('abort', cancel, { once: true });
    reader.onload = () => {
      clean();
      const data = reader.result;
      if (typeof data !== 'string' || !data.startsWith('data:image/png;base64,') || data.endsWith(',')) {
        reject(new Error('PNG 이미지의 전송 데이터를 만들 수 없습니다.'));
        return;
      }
      resolve(data.slice(data.indexOf(',') + 1));
    };
    reader.onerror = () => { clean(); reject(new Error('변환한 PNG 파일을 읽을 수 없습니다.')); };
    reader.onabort = () => { clean(); reject(abortError()); };
    reader.readAsDataURL(blob);
  });
}

// Decode with the same browser image stack used by the preview. Re-encode pixels
// as standard PNG to avoid passing unusual JPEG encodings or misleading file
// extensions directly to Ollama's native media decoder. No upload or resize.
export async function normalizedPngBase64(file: File, signal?: AbortSignal): Promise<string> {
  const image = await loadImage(file, signal);
  if (signal?.aborted) throw abortError();
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('이미지 크기를 확인할 수 없습니다.');
  const canvas = document.createElement('canvas');
  try {
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('브라우저의 이미지 변환 기능을 사용할 수 없습니다.');
    context.drawImage(image, 0, 0);
    return await blobBase64(await pngBlob(canvas, signal), signal);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
