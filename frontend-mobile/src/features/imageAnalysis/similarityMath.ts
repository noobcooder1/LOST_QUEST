import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES } from './types';

export function validateImageFile(file: File): void {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new Error('PNG, JPEG, WebP 이미지만 사용할 수 있습니다.');
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('이미지 크기는 20MB 이하여야 합니다.');
}

export function cosineSimilarity(first: number[], second: number[]): number {
  if (!first.length || first.length !== second.length) throw new Error('이미지 특징 벡터의 크기가 일치하지 않습니다.');
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < first.length; index += 1) {
    const a = first[index];
    const b = second[index];
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('이미지 특징 벡터가 올바르지 않습니다.');
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (!normA || !normB) throw new Error('이미지 특징 벡터가 비어 있습니다.');
  return Math.max(-1, Math.min(1, dot / Math.sqrt(normA * normB)));
}
