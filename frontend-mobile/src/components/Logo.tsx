export default function Logo({ light = false }: { light?: boolean }) {
  return <span className={`brand ${light ? 'brand-light' : ''}`}>
    <span className="brand-mark" aria-hidden="true">
      <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
        <rect x="1" y="1" width="38" height="38" rx="12" fill={light ? '#15364e' : '#edf4fc'} />
        <path d="M20 8c-5.3 0-9 3.8-9 8.8 0 6.6 9 14.7 9 14.7s9-8.1 9-14.7c0-5-3.7-8.8-9-8.8Z" fill="#2874ed" />
        <circle cx="20" cy="16.8" r="3" fill="#fff" />
      </svg>
    </span>
    <span>LOST QUEST<span className="brand-dot">.</span></span>
  </span>;
}
