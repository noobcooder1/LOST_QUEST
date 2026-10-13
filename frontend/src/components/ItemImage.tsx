import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { ImageOff } from 'lucide-react';
import { fetchTunnelImage, isTunnelItemImage } from '../services/tunnel';

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
  const [tunnelImage, setTunnelImage] = useState<{ src: string; url: string } | null>(null);
  const needsTunnelFetch = isTunnelItemImage(src);
  useEffect(() => {
    if (!needsTunnelFetch) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void fetchTunnelImage(src, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setTunnelImage({ src, url: objectUrl });
    }).catch(() => {
      if (!controller.signal.aborted) {
        setFailure({ src, stage: fallbackSrc.trim() && fallbackSrc !== src ? 'fallback' : 'placeholder' });
      }
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, fallbackSrc, needsTunnelFetch]);
  // A different item/src starts again from its own first stage.
  const stage: Stage = failure && failure.src === src ? failure.stage : firstStage(src, fallbackSrc);
  const waitingForTunnel = stage === 'primary' && needsTunnelFetch && tunnelImage?.src !== src;
  const current = stage === 'primary' ? needsTunnelFetch ? tunnelImage?.src === src ? tunnelImage.url : null : src : stage === 'fallback' ? fallbackSrc : null;

  const handleError = () => {
    // Skip the fallback when it is the URL that just failed: go straight to the placeholder.
    const next: Stage = stage === 'primary' && fallbackSrc.trim() && fallbackSrc !== src ? 'fallback' : 'placeholder';
    setFailure({ src, stage: next });
  };

  if (waitingForTunnel) {
    return <span role="img" aria-label={alt} aria-busy="true" className="item-image-placeholder"><span>사진을 불러오는 중이에요</span></span>;
  }
  if (!current) {
    return <span role="img" aria-label={alt} className="item-image-placeholder"><ImageOff size={32} strokeWidth={1.5} aria-hidden="true" /><span>이미지를 불러올 수 없어요</span></span>;
  }
  return <img {...imgProps} src={current} alt={alt} onError={handleError} />;
}
