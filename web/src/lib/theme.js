const THEME_KEY = 'jugad-theme'; // 'system' | 'light' | 'dark'
const ACCENT_KEY = 'jugad-accent'; // hex color, e.g. '#d9a02a'

export const ACCENT_PRESETS = [
  '#d9a02a', // signal amber (default)
  '#c0663a', // rust
  '#3f8f6f', // pine
  '#3d7ea6', // slate blue
  '#7a6bc4', // violet
  '#b5456f', // rose
  '#5c8a3a', // moss
  '#9a8154', // brass
];

export function getTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'system';
  } catch {
    return 'system';
  }
}

export function getAccent() {
  try {
    return localStorage.getItem(ACCENT_KEY) || ACCENT_PRESETS[0];
  } catch {
    return ACCENT_PRESETS[0];
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  } else {
    root.removeAttribute('data-theme');
  }
}

// Picks readable ink for text/icons sitting on a solid accent fill, so a
// user choosing a dark custom accent (e.g. a deep violet) doesn't end up
// with unreadable dark-on-dark (or washed-out light-on-light) button labels.
// Rather than a single luminance cutoff — which gets it wrong for midtones
// right at the boundary — this compares the actual WCAG contrast ratio each
// candidate ink would get against the accent, and keeps the winner.
function relativeLuminance(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return 0;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const DARK_INK = '#241a02';
const LIGHT_INK = '#f5f2ea';

function inkFor(hex) {
  const bg = relativeLuminance(hex);
  const contrast = (l) => (Math.max(bg, l) + 0.05) / (Math.min(bg, l) + 0.05);
  return contrast(relativeLuminance(DARK_INK)) >= contrast(relativeLuminance(LIGHT_INK)) ? DARK_INK : LIGHT_INK;
}

export function applyAccent(color) {
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-ink', inkFor(color));
}

export function setTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  applyTheme(theme);
}

export function setAccent(color) {
  try { localStorage.setItem(ACCENT_KEY, color); } catch { /* ignore */ }
  applyAccent(color);
}

// Call once, as early as possible, to avoid a flash of the default theme.
export function initTheme() {
  applyTheme(getTheme());
  applyAccent(getAccent());
}
