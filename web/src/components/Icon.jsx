// A small hand-drawn line-icon set, used in place of emoji throughout the
// app. One consistent stroke system (round caps/joins, 1.75 weight, 24x24
// grid) so every icon reads as part of the same kit rather than a grab-bag
// of platform emoji glyphs.
const PATHS = {
  calendar: (
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      <line x1="8" y1="2.5" x2="8" y2="6.5" />
      <line x1="16" y1="2.5" x2="16" y2="6.5" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.3 8.7 13 13l-4.3 2.3L11 11z" strokeLinejoin="round" />
    </>
  ),
  inbox: (
    <>
      <path d="M3.5 12.5h4.8l1.6 2.4h4.2l1.6-2.4h4.8" />
      <path d="M6.5 12.5 8 5.5h8l1.5 7" />
      <path d="M3.5 12.5v6a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1v-6" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.3" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.3" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.3" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.3" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="7" />
      <line x1="19" y1="12" x2="21.5" y2="12" />
      <line x1="12" y1="19" x2="12" y2="21.5" />
      <line x1="5" y1="12" x2="2.5" y2="12" />
      <line x1="12" y1="5" x2="12" y2="2.5" />
      <line x1="16.95" y1="16.95" x2="18.72" y2="18.72" />
      <line x1="7.05" y1="16.95" x2="5.28" y2="18.72" />
      <line x1="7.05" y1="7.05" x2="5.28" y2="5.28" />
      <line x1="16.95" y1="7.05" x2="18.72" y2="5.28" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 19 6v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6Z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="15.3" y1="15.3" x2="20.5" y2="20.5" />
    </>
  ),
  x: (
    <>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </>
  ),
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  star: (
    <path
      d="M12 3 14.5 8.9 21 9.6 16.1 13.8 17.5 20.2 12 16.8 6.5 20.2 7.9 13.8 3 9.6 9.5 8.9Z"
      strokeLinejoin="round"
    />
  ),
  trash: (
    <>
      <path d="M4.5 7h15" />
      <path d="M9 7V4.8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7" />
      <path d="M6.5 7l1 12a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-12" />
      <line x1="10" y1="10.5" x2="10" y2="16.5" />
      <line x1="14" y1="10.5" x2="14" y2="16.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12c2.3-5 6.5-8 10-8s7.7 3 10 8c-2.3 5-6.5 8-10 8s-7.7-3-10-8Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M2 12c2.3-5 6.5-8 10-8 1.6 0 3.2.5 4.7 1.4M22 12c-1 2.2-2.6 4-4.4 5.3M4.6 6.6C3.5 7.9 2.6 9.4 2 12c2.3 5 6.5 8 10 8 1.4 0 2.8-.3 4.1-.9" />
      <line x1="3.5" y1="3.5" x2="20.5" y2="20.5" />
    </>
  ),
  menu: (
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </>
  ),
  check: <polyline points="5,13 9.5,17.5 19,7" strokeLinejoin="round" />,
  grip: (
    <>
      <circle cx="9" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  flag: (
    <>
      <line x1="6" y1="3" x2="6" y2="21" />
      <path d="M6 4h11l-2.5 3.5L17 11H6Z" strokeLinejoin="round" />
    </>
  ),
  folder: (
    <path d="M3 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2h9a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z" strokeLinejoin="round" />
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9.3a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1 .9-.9 1.8" />
      <circle cx="12" cy="17.2" r="0.4" fill="currentColor" stroke="none" />
    </>
  ),
  logout: (
    <>
      <path d="M9.5 3.5h-4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h4" />
      <line x1="21" y1="12" x2="9.5" y2="12" />
      <polyline points="16.5,7 21,12 16.5,17" strokeLinejoin="round" />
    </>
  ),
  bolt: <path d="M13 2 4 14h6l-1 8 9-12h-6z" strokeLinejoin="round" />,
  users: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.2-6 5-6s5 2.7 5 6" />
      <circle cx="16.5" cy="7.5" r="2.4" />
      <path d="M14 20c.2-2.8 1.8-5 3.8-5.6" />
    </>
  ),
  server: (
    <>
      <rect x="4" y="4" width="16" height="6" rx="1.3" />
      <rect x="4" y="14" width="16" height="6" rx="1.3" />
      <circle cx="7.5" cy="7" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="17" r="0.6" fill="currentColor" stroke="none" />
      <line x1="11" y1="7" x2="16.5" y2="7" />
      <line x1="11" y1="17" x2="16.5" y2="17" />
    </>
  ),
  chevron: <polyline points="6,9 12,15.5 18,9" strokeLinejoin="round" />,
  book: (
    <>
      <path d="M12 6.7c-1.9-1.4-4.2-2.1-6.7-2.1-1 0-1.5.4-1.5 1.3v10.7c0 .8.5 1.3 1.5 1.3 2.5 0 4.8.7 6.7 2.1 1.9-1.4 4.2-2.1 6.7-2.1 1 0 1.5-.5 1.5-1.3V5.9c0-.9-.5-1.3-1.5-1.3-2.5 0-4.8.7-6.7 2.1Z" strokeLinejoin="round" />
      <line x1="12" y1="6.7" x2="12" y2="19.7" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.3" r="3.3" />
      <path d="M5 19.5c0-3.6 3.1-6.3 7-6.3s7 2.7 7 6.3" strokeLinejoin="round" />
    </>
  ),
  chart: (
    <>
      <line x1="5" y1="20" x2="19" y2="20" />
      <rect x="6" y="13" width="3.5" height="7" strokeLinejoin="round" />
      <rect x="10.5" y="8" width="3.5" height="12" strokeLinejoin="round" />
      <rect x="15" y="4.5" width="3.5" height="15.5" strokeLinejoin="round" />
    </>
  ),
};

export default function Icon({ name, size = 17, filled = false, className = '', style }) {
  const body = PATHS[name];
  if (!body) return null;
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {body}
    </svg>
  );
}

// The app's wordmark: a drafting-square bracket with a check, standing in
// for the ✅ emoji brand mark.
export function Logo({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="var(--accent)" />
      <polyline
        points="7,12.5 10.5,16 17,8.5"
        fill="none"
        stroke="var(--sidebar-bg)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
