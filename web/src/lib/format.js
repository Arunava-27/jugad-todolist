export function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function isOverdue(dueDate, isCompleted) {
  if (!dueDate || isCompleted) return false;
  return dueDate < todayISO();
}

export function isToday(dueDate) {
  return dueDate === todayISO();
}

export function formatDueDate(dueDate) {
  if (!dueDate) return '';
  const today = todayISO();
  if (dueDate === today) return 'Today';
  const d = new Date(dueDate + 'T00:00:00');
  const t = new Date(today + 'T00:00:00');
  const diffDays = Math.round((d - t) / 86400000);
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== t.getFullYear() ? 'numeric' : undefined });
}

export function initials(name) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// Look up a color from a {name, color} list (statuses/priorities/labels),
// falling back to a neutral gray when the name isn't found (e.g. stale data).
export function colorFor(list, name, fallback = '#94a3b8') {
  return list?.find((x) => x.name === name)?.color || fallback;
}

// Deterministic avatar color for a real account, which — unlike labels/
// statuses/the old free-text assignees — doesn't carry its own `color`
// column. Same input always gives the same color, so a person's avatar
// stays visually consistent across the app without needing to store one.
const AVATAR_PALETTE = ['#d9a02a', '#6366f1', '#22c55e', '#a855f7', '#e2725b', '#3ba7b0', '#e2c53d', '#f0993d'];
export function colorForPerson(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
