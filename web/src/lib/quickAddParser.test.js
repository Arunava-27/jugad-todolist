import { describe, it, expect } from 'vitest';
import { parseQuickAdd } from './quickAddParser.js';

// A fixed reference "now" (a Tuesday) so date-phrase tests are deterministic
// regardless of when the suite actually runs.
const NOW = new Date(2026, 8, 15); // 2026-09-15, a Tuesday

describe('parseQuickAdd — dates', () => {
  it('parses "today"/"tomorrow"/"yesterday"', () => {
    expect(parseQuickAdd('Ship it today', {}, NOW).due_date).toBe('2026-09-15');
    expect(parseQuickAdd('Ship it tomorrow', {}, NOW).due_date).toBe('2026-09-16');
    expect(parseQuickAdd('Ship it yesterday', {}, NOW).due_date).toBe('2026-09-14');
  });

  it('parses "in N days"/"in N weeks"', () => {
    expect(parseQuickAdd('Follow up in 3 days', {}, NOW).due_date).toBe('2026-09-18');
    expect(parseQuickAdd('Follow up in 2 weeks', {}, NOW).due_date).toBe('2026-09-29');
  });

  it('parses a bare weekday as the next upcoming occurrence, including today\'s own name', () => {
    // NOW is a Tuesday — "tuesday" should mean next Tuesday, not today.
    expect(parseQuickAdd('Standup tuesday', {}, NOW).due_date).toBe('2026-09-22');
    expect(parseQuickAdd('Standup friday', {}, NOW).due_date).toBe('2026-09-18');
  });

  it('parses an ISO date and a US-style month/day', () => {
    expect(parseQuickAdd('Launch 2026-10-01', {}, NOW).due_date).toBe('2026-10-01');
    expect(parseQuickAdd('Launch 10/1', {}, NOW).due_date).toBe('2026-10-01');
  });

  it('strips the matched date phrase out of the title', () => {
    const result = parseQuickAdd('Ship the release tomorrow', {}, NOW);
    expect(result.title).toBe('Ship the release');
  });

  it('leaves due_date null when nothing matches', () => {
    expect(parseQuickAdd('Just a plain title', {}, NOW).due_date).toBeNull();
  });
});

describe('parseQuickAdd — #project', () => {
  const projects = [{ id: 1, name: 'Website' }, { id: 2, name: 'HAL App' }];

  it('matches a known project name, including one with a space', () => {
    const result = parseQuickAdd('Fix the header #HAL App', { projects }, NOW);
    expect(result.project).toBe('HAL App');
    expect(result.project_id).toBe(2);
    expect(result.title).toBe('Fix the header');
  });

  it('uses the last "#" when several appear', () => {
    const result = parseQuickAdd('Not #this but #Website', { projects }, NOW);
    expect(result.project).toBe('Website');
    expect(result.project_id).toBe(1);
  });

  it('falls back to a bare token for an unrecognized project name', () => {
    const result = parseQuickAdd('Task #SomeNewProject', { projects }, NOW);
    expect(result.project).toBe('SomeNewProject');
    expect(result.project_id).toBeNull();
  });
});

describe('parseQuickAdd — @labels', () => {
  it('collects every @label in order and strips them from the title', () => {
    const result = parseQuickAdd('Review @frontend @urgent the PR', {}, NOW);
    expect(result.labels).toEqual(['frontend', 'urgent']);
    expect(result.title).toBe('Review the PR');
  });
});

describe('parseQuickAdd — pN priority', () => {
  it('matches a priority whose own name carries "P<n>", regardless of list order (regression: was position-based)', () => {
    // Deliberately out of P-number order, as it would be after a real reorder in Settings.
    const priorities = [
      { name: '🟢 P3 - Low' },
      { name: '🔴 P1 - Urgent' },
      { name: '🟡 P2 - Medium' },
    ];
    const result = parseQuickAdd('Fix the outage p1', { priorities }, NOW);
    expect(result.priority).toBe('🔴 P1 - Urgent');
  });

  it('falls back to array position only when no priority carries a matching label', () => {
    const priorities = [{ name: 'Low' }, { name: 'Medium' }, { name: 'High' }];
    const result = parseQuickAdd('Something p2', { priorities }, NOW);
    expect(result.priority).toBe('Medium');
  });

  it('does not falsely match "p1" inside another word', () => {
    const priorities = [{ name: '🔴 P1 - Urgent' }];
    const result = parseQuickAdd('Update the app1 config', { priorities }, NOW);
    expect(result.priority).toBeNull();
    expect(result.title).toBe('Update the app1 config');
  });
});

describe('parseQuickAdd — combined', () => {
  it('parses date, project, label, and priority together, leaving a clean title', () => {
    const projects = [{ id: 5, name: 'Website' }];
    const priorities = [{ name: '🔴 P1 - Urgent' }];
    const result = parseQuickAdd('Fix login bug tomorrow #Website @frontend p1', { projects, priorities }, NOW);
    expect(result.due_date).toBe('2026-09-16');
    expect(result.project).toBe('Website');
    expect(result.labels).toEqual(['frontend']);
    expect(result.priority).toBe('🔴 P1 - Urgent');
    expect(result.title).toBe('Fix login bug');
  });
});
