// Todoist-style "magic add" parsing: pull a due date, #project, @label(s) and
// pN priority out of free-typed text, returning the cleaned-up title plus
// whatever was detected. Pure function, no React — easy to unit-reason about
// and to preview live as the user types.

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function toISO(date) {
  // Local-date formatting (not toISOString, which shifts to UTC and can land
  // on the wrong day depending on timezone/time-of-day).
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

// Next upcoming occurrence of a weekday (today counts as "next week" if it
// matches, since "monday" typed on a Monday almost always means the coming
// one, not right now). "next <day>" is treated the same — simpler and more
// predictable than trying to special-case a "skip an extra week" reading.
function nextWeekday(base, targetDow) {
  const currentDow = base.getDay();
  let delta = (targetDow - currentDow + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(base, delta);
}

// Returns { date: 'YYYY-MM-DD', matchStart, matchEnd } for the first date-ish
// phrase found, or null. `now` is injectable for testing.
function extractDate(text, now = new Date()) {
  const lower = text.toLowerCase();

  const patterns = [
    { re: /\btoday\b/, resolve: () => now },
    { re: /\btomorrow\b/, resolve: () => addDays(now, 1) },
    { re: /\byesterday\b/, resolve: () => addDays(now, -1) },
    { re: /\bin (\d+) days?\b/, resolve: (m) => addDays(now, Number(m[1])) },
    { re: /\bin (\d+) weeks?\b/, resolve: (m) => addDays(now, Number(m[1]) * 7) },
    { re: /\bnext (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/, resolve: (m) => nextWeekday(now, WEEKDAYS.indexOf(m[1])) },
    { re: /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/, resolve: (m) => nextWeekday(now, WEEKDAYS.indexOf(m[1])) },
    { re: /\b(sun|mon|tue|wed|thu|fri|sat)\b/, resolve: (m) => nextWeekday(now, WEEKDAY_ABBR.indexOf(m[1])) },
    // ISO date, e.g. 2026-09-15
    { re: /\b(\d{4})-(\d{2})-(\d{2})\b/, resolve: (m) => new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) },
    // Month/day, e.g. 9/15 or 9/15/2026 (US-style, mirroring Todoist's default locale)
    { re: /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, resolve: (m) => {
      const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.getFullYear();
      return new Date(year, Number(m[1]) - 1, Number(m[2]));
    } },
  ];

  for (const { re, resolve } of patterns) {
    const m = lower.match(re);
    if (m) {
      const date = resolve(m);
      if (Number.isNaN(date.getTime())) continue;
      return { date: toISO(date), matchStart: m.index, matchEnd: m.index + m[0].length };
    }
  }
  return null;
}

export function parseQuickAdd(rawText, { priorities = [], projects = [] } = {}, now = new Date()) {
  let text = rawText;
  const result = { title: rawText.trim(), due_date: null, dueLabel: null, priority: null, project: null, project_id: null, labels: [] };

  // #project — last "#" wins (Todoist behavior). Project names can contain
  // spaces (e.g. "HAL App"), so rather than stopping at the first whitespace
  // we greedily match the *longest* known project name that prefixes
  // whatever follows the "#", and only consume that many characters —
  // leaving any trailing text (further @labels, pN, etc.) intact to parse.
  const hashIdx = text.lastIndexOf('#');
  if (hashIdx !== -1) {
    const after = text.slice(hashIdx + 1);
    let best = null;
    for (const p of projects) {
      if (after.toLowerCase().startsWith(p.name.toLowerCase()) && (!best || p.name.length > best.name.length)) {
        best = p;
      }
    }
    if (best) {
      result.project = best.name;
      result.project_id = best.id;
      text = text.slice(0, hashIdx) + after.slice(best.name.length);
    } else {
      const m = after.match(/^(\S+)/);
      if (m) {
        result.project = m[1];
        text = text.slice(0, hashIdx) + after.slice(m[1].length);
      }
    }
  }

  // @label(s) — every match kept, in order.
  text = text.replace(/@(\S+)/g, (full, name) => {
    result.labels.push(name);
    return '';
  });

  // pN priority (p1..p5), word-boundaried so it doesn't eat "up1" etc.
  // Priorities are reorderable/renamable (Settings → Workflow), so "p1"
  // means whichever priority actually carries "P1" in its own name (e.g. the
  // seeded "🔴 P1 - Urgent") — not "whatever sits first in the list today".
  // Falls back to array position only for a list with no such label at all,
  // so a still-default, untouched workspace keeps working exactly as before.
  const priorityMatch = text.match(/(?:^|\s)p([1-5])(?=\s|$)/i);
  if (priorityMatch) {
    const n = Number(priorityMatch[1]);
    const byLabel = priorities.find((p) => new RegExp(`\\bp${n}\\b`, 'i').test(p.name));
    const target = byLabel || priorities[n - 1];
    if (target) result.priority = target.name;
    text = text.slice(0, priorityMatch.index) + text.slice(priorityMatch.index + priorityMatch[0].length);
  }

  // Due date phrase — found last since removing project/label tokens first
  // avoids false matches inside them (e.g. a label literally called "@today").
  const dateMatch = extractDate(text, now);
  if (dateMatch) {
    result.due_date = dateMatch.date;
    result.dueLabel = text.slice(dateMatch.matchStart, dateMatch.matchEnd);
    text = text.slice(0, dateMatch.matchStart) + text.slice(dateMatch.matchEnd);
  }

  result.title = text.replace(/\s+/g, ' ').trim();
  return result;
}
