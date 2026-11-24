// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SearchNavigation from './SearchNavigation';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
function Location() { const value = useLocation(); return <output>{value.pathname}{value.search}</output>; }
async function mount(path = '/', mobile = false) {
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}><nav><SearchNavigation mobile={mobile} /></nav><button type="button" id="outside">다른 영역</button><Location /></MemoryRouter>));
}
const trigger = () => container.querySelector<HTMLButtonElement>('.search-nav-trigger')!;
const menu = () => container.querySelector<HTMLUListElement>('.search-nav-menu');
const links = () => [...container.querySelectorAll<HTMLAnchorElement>('.search-nav-menu a')];
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function key(element: HTMLElement, value: string) {
  await act(async () => element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })));
}
async function pointer(element: HTMLElement, type: 'pointerover' | 'pointerout' | 'pointerdown', pointerType = 'mouse', relatedTarget: EventTarget | null = null) {
  const event = new MouseEvent(type, { bubbles: true, relatedTarget });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  await act(async () => element.dispatchEvent(event));
}
beforeEach(() => { container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe('search navigation disclosure', () => {
  it('opens the two destinations by click without navigating and toggles closed', async () => {
    await mount(); expect(menu()).toBeNull();
    await click(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(links().map(link => [link.textContent, link.getAttribute('href')])).toEqual([
      ['물건 검색', '/search'], ['경찰청 공공데이터', '/search?source=public&type=lost'],
    ]);
    expect(container.querySelector('output')?.textContent).toBe('/');
    await click(trigger()); expect(menu()).toBeNull();
  });
  it('previews on mouse hover, stays open over its descendants, and closes on leaving the group', async () => {
    await mount();
    await pointer(trigger(), 'pointerover'); expect(menu()).not.toBeNull();
    await pointer(trigger(), 'pointerout', 'mouse', links()[0]); expect(menu()).not.toBeNull();
    await pointer(links()[0], 'pointerout', 'mouse', container.querySelector('#outside')); expect(menu()).toBeNull();
  });
  it('keeps the hovered preview open on first click and closes it on the second click', async () => {
    await mount(); await pointer(trigger(), 'pointerover'); await click(trigger());
    expect(menu()).not.toBeNull(); await click(trigger()); expect(menu()).toBeNull();
    await pointer(trigger(), 'pointerout', 'mouse', container.querySelector('#outside'));
    await pointer(trigger(), 'pointerover'); expect(menu()).not.toBeNull();
  });
  it('closes a clicked menu when the pointer leaves it or another area is pressed', async () => {
    await mount(); await click(trigger());
    await pointer(trigger(), 'pointerout', 'mouse', container.querySelector('#outside')); expect(menu()).toBeNull();
    await click(trigger()); await pointer(container.querySelector<HTMLButtonElement>('#outside')!, 'pointerdown'); expect(menu()).toBeNull();
  });
  it('opens with the keyboard, moves between links and restores focus with Escape', async () => {
    await mount(); trigger().focus(); await key(trigger(), 'ArrowDown');
    expect(document.activeElement).toBe(links()[0]);
    await key(links()[0], 'ArrowDown'); expect(document.activeElement).toBe(links()[1]);
    await key(links()[1], 'ArrowDown'); expect(document.activeElement).toBe(links()[0]);
    await key(links()[0], 'Escape'); expect(menu()).toBeNull(); expect(document.activeElement).toBe(trigger());
    await key(trigger(), 'ArrowUp'); expect(document.activeElement).toBe(links()[1]);
  });
  it('closes when keyboard focus moves outside', async () => {
    await mount(); await key(trigger(), 'ArrowDown');
    await act(async () => container.querySelector<HTMLButtonElement>('#outside')!.focus());
    expect(menu()).toBeNull();
  });
  it('navigates to the selected source and closes after changing only the query string', async () => {
    await mount('/search'); await click(trigger()); await click(links()[1]);
    expect(container.querySelector('output')?.textContent).toBe('/search?source=public&type=lost'); expect(menu()).toBeNull();
    expect(trigger().classList.contains('active')).toBe(true);
    await click(trigger()); expect(links()[1].getAttribute('aria-current')).toBe('page');
    await click(links()[0]); expect(container.querySelector('output')?.textContent).toBe('/search'); expect(menu()).toBeNull();
  });
  it('retains current search conditions when switching sources, clearing the source-specific type on return', async () => {
    await mount('/search?q=가방&type=found&from=2026-11-01&category=가방');
    await click(trigger()); await click(links()[1]);
    const police = new URLSearchParams(container.querySelector('output')!.textContent!.split('?')[1]);
    expect(Object.fromEntries(police)).toEqual({ q: '가방', type: 'lost', from: '2026-11-01', category: '가방', source: 'public' });
    await click(trigger()); await click(links()[0]);
    const local = new URLSearchParams(container.querySelector('output')!.textContent!.split('?')[1]);
    expect(Object.fromEntries(local)).toEqual({ q: '가방', from: '2026-11-01', category: '가방' });
  });
  it('does not carry query parameters from unrelated pages into searches', async () => {
    await mount('/mypage?tab=notifications'); await click(trigger());
    expect(links().map(link => link.getAttribute('href'))).toEqual(['/search', '/search?source=public&type=lost']);
  });
  it('allows touch users to choose either destination from the mobile navigation', async () => {
    await mount('/', true); await pointer(trigger(), 'pointerover', 'touch'); expect(menu()).toBeNull();
    await click(trigger()); expect(menu()).not.toBeNull();
    await click(links()[1]); expect(container.querySelector('output')?.textContent).toBe('/search?source=public&type=lost'); expect(menu()).toBeNull();
    await click(trigger()); await click(links()[0]); expect(container.querySelector('output')?.textContent).toBe('/search');
  });
});
