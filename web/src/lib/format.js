export const PRIORITIES = [
  '🔴 P1 - Urgent',
  '🟠 P2 - High',
  '🟡 P3 - Medium',
  '🟢 P4 - Low',
  '⚪ P5 - Optional',
];

export const PRIORITY_COLORS = {
  '🔴 P1 - Urgent': '#e53e3e',
  '🟠 P2 - High': '#f0993d',
  '🟡 P3 - Medium': '#e2c53d',
  '🟢 P4 - Low': '#3fae5f',
  '⚪ P5 - Optional': '#a0aec0',
};

export const STATUSES = ['Not started', 'In progress', 'Ongoing', 'Maintenance', 'Clarity from IEMRF', 'Done'];

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
