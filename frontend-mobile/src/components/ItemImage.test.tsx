// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ItemImage from './ItemImage';
import { fetchTunnelImage } from '../services/tunnel';

vi.mock('../services/tunnel', async importOriginal => ({
  ...await importOriginal<typeof import('../services/tunnel')>(), fetchTunnelImage: vi.fn(),
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const createObjectURL = vi.fn(() => 'blob:loaded-image');
const revokeObjectURL = vi.fn();
const tunnelUrl = 'https://example.ngrok-free.dev/api/images/photo.png';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(src: string) {
  await act(async () => root.render(<ItemImage src={src} fallbackSrc="/images/wallet.svg" alt="물품 사진" />));
}

describe('tunnel item images', () => {
  it('renders fetched bytes and revokes the old object URL when the source changes', async () => {
    vi.mocked(fetchTunnelImage).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    await render(tunnelUrl);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:loaded-image');
    await render('/images/wallet.svg');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:loaded-image');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/images/wallet.svg');
  });

  it('falls back when a tunnel image fails and preserves existing ordinary image behavior', async () => {
    vi.mocked(fetchTunnelImage).mockRejectedValue(new Error('Expected image bytes'));
    await render(tunnelUrl);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/images/wallet.svg');
    await act(async () => container.querySelector('img')!.dispatchEvent(new Event('error')));
    expect(container.textContent).toContain('이미지를 불러올 수 없어요');
  });

  it('aborts a pending source and ignores its late result', async () => {
    let resolveImage!: (blob: Blob) => void;
    vi.mocked(fetchTunnelImage).mockImplementationOnce(() => new Promise(resolve => { resolveImage = resolve; }));
    await render(tunnelUrl);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    const signal = vi.mocked(fetchTunnelImage).mock.calls[0][1];
    await render('/images/wallet.svg');
    expect(signal.aborted).toBe(true);
    await act(async () => resolveImage(new Blob(['late image'])));
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/images/wallet.svg');
  });

  it('does not fetch static or police-hosted images through the tunnel adapter', async () => {
    await render('/images/wallet.svg');
    await render('https://minwon24.police.go.kr/photo.png');
    expect(fetchTunnelImage).not.toHaveBeenCalled();
  });
});
