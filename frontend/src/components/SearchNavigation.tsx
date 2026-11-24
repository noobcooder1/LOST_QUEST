import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Globe2, Search } from 'lucide-react';

export default function SearchNavigation({ mobile = false }: { mobile?: boolean }) {
  const location = useLocation();
  const active = location.pathname === '/search';
  const current = new URLSearchParams(active ? location.search : '');
  const policeActive = active && current.get('source') === 'public';
  const itemParams = new URLSearchParams(current);
  itemParams.delete('source');
  if (policeActive) itemParams.delete('type');
  const policeParams = new URLSearchParams(current);
  policeParams.set('source', 'public');
  policeParams.set('type', 'lost');
  const itemTo = `/search${itemParams.size ? `?${itemParams}` : ''}`;
  const policeTo = `/search?${policeParams}`;
  const [mode, setMode] = useState<'closed' | 'preview' | 'expanded'>('closed');
  const open = mode !== 'closed';
  const group = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<'first' | 'last' | null>(null);
  const menuId = useId();

  useEffect(() => { setMode('closed'); pendingFocus.current = null; }, [location.key]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !group.current?.contains(event.target)) setMode('closed');
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  useEffect(() => {
    if (!open || !pendingFocus.current) return;
    const links = group.current?.querySelectorAll<HTMLAnchorElement>('.search-nav-menu a');
    (pendingFocus.current === 'last' ? links?.[links.length - 1] : links?.[0])?.focus();
    pendingFocus.current = null;
  }, [open, mode]);

  const openWithFocus = (edge: 'first' | 'last') => {
    const links = group.current?.querySelectorAll<HTMLAnchorElement>('.search-nav-menu a');
    if (open) (edge === 'last' ? links?.[links.length - 1] : links?.[0])?.focus();
    else { pendingFocus.current = edge; setMode('expanded'); }
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault(); setMode('closed'); trigger.current?.focus();
    }
  };

  return <div ref={group} className={`search-nav-group${mobile ? ' is-mobile' : ''}`}
    onPointerEnter={event => { if (!mobile && event.pointerType === 'mouse') setMode(previous => previous === 'closed' ? 'preview' : previous); }}
    onPointerLeave={event => { if (!mobile && event.pointerType === 'mouse') setMode('closed'); }}
    onBlur={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setMode('closed'); }}
    onKeyDown={escape}>
    <button ref={trigger} type="button" className={`search-nav-trigger${active ? ' active' : ''}`}
      aria-label="물건 검색 메뉴" aria-expanded={open} aria-controls={menuId}
      onClick={() => setMode(previous => previous === 'expanded' ? 'closed' : 'expanded')}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); openWithFocus(event.key === 'ArrowUp' ? 'last' : 'first');
        }
      }}>
      {mobile && <Search size={21} aria-hidden="true" />}<span>{mobile ? '탐색' : '물건 검색'}</span>
    </button>
    {open && <ul id={menuId} className="search-nav-menu" aria-label="물건 검색 하위 메뉴"
      onKeyDown={event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const links = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>('a')];
        const index = links.indexOf(document.activeElement as HTMLAnchorElement);
        links[(index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]?.focus();
      }}>
      <li><Link to={itemTo} aria-current={active && !policeActive ? 'page' : undefined} onClick={() => setMode('closed')}><Search size={18} aria-hidden="true" /><span>물건 검색</span></Link></li>
      <li><Link to={policeTo} aria-current={policeActive ? 'page' : undefined} onClick={() => setMode('closed')}><Globe2 size={18} aria-hidden="true" /><span>경찰청 공공데이터</span></Link></li>
    </ul>}
  </div>;
}
