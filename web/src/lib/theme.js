const THEME_KEY = 'jugad-theme'; // 'system' | 'light' | 'dark'
const ACCENT_KEY = 'jugad-accent'; // hex color, e.g. '#6366f1'

export const ACCENT_PRESETS = [
  '#6366f1', // indigo (default)
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#0ea5e9', // sky
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

export function applyAccent(color) {
  document.documentElement.style.setProperty('--accent', color);
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
