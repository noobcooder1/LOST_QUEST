export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export interface ImageMetrics {
  clientMs: number;
  serverMs: number | null;
  loadMs: number | null;
}

export type Progress = 'checking' | 'reading' | 'imageA' | 'imageB' | 'calculating';
export interface CropRect { x: number; y: number; width: number; height: number }
export const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };

export interface AppearanceResult {
  visualCosine: number;
  visualPercent: number;
  colorPercent: number;
  dimensions: number;
  imageA: ImageMetrics;
  imageB: ImageMetrics;
  totalMs: number;
  crops: [CropRect, CropRect];
  categories: [import('./categories').CategoryPrediction, import('./categories').CategoryPrediction];
}
