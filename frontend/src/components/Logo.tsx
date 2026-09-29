import { Compass } from 'lucide-react';
export default function Logo({ light = false }: { light?: boolean }) {
  return <span className={`brand ${light ? 'brand-light' : ''}`}><span className="brand-mark"><Compass size={30} strokeWidth={1.7} /></span><span>LOST QUEST<span className="brand-dot">.</span></span></span>;
}
