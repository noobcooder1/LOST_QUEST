import { useState, type ImgHTMLAttributes } from 'react';
import { ImageOff } from 'lucide-react';

type Stage = 'primary' | 'fallback' | 'placeholder';

interface ItemImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'onError'> {
  /** Already validated by the item mappers (LOST QUEST /api/images/…, allow-listed 경찰청 URL, or a category image). */
  src: string;
  /** Category illustration shown when {@code src} is empty or fails to load. */
  fallbackSrc: string;
  alt: string;
}

const firstStage = (src: string, fallbackSrc: string): Stage => (src.trim() ? 'primary' : fallbackSrc.trim() ? 'fallback' : 'placeholder');

/**
 * Image with load-failure handling: actual image → category image → icon placeholder.
 * URL validation stays in the mappers; this only reacts to images that pass validation but fail to load
 * (404, network error). Each stage is tried at most once, so an error can never loop on the same src.
 */
export default function ItemImage({ src, fallbackSrc, alt, ...imgProps }: ItemImageProps) {
  const [failure, setFailure] = useState<{ src: string; stage: Stage } | null>(null);
  // A different item/src starts again from its own first stage.
  const stage: Stage = failure && failure.src === src ? failure.stage : firstStage(src, fallbackSrc);
  const current = stage === 'primary' ? src : stage === 'fallback' ? fallbackSrc : null;

  const handleError = () => {
    // Skip the fallback when it is the URL that just failed: go straight to the placeholder.
    const next: Stage = stage === 'primary' && fallbackSrc.trim() && fallbackSrc !== src ? 'fallback' : 'placeholder';
    setFailure({ src, stage: next });
  };

  if (!current) {
    return <span role="img" aria-label={alt} className="item-image-placeholder"><ImageOff size={32} strokeWidth={1.5} aria-hidden="true" /><span>이미지를 불러올 수 없어요</span></span>;
  }
  return <img {...imgProps} src={current} alt={alt} onError={handleError} />;
}
