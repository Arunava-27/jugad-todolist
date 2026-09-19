import { describe, it, expect } from 'vitest';
import { colorFor, colorForPerson, initials } from './format.js';

describe('colorFor', () => {
  const list = [{ name: 'Backend', color: '#111111' }, { name: 'Frontend', color: '#222222' }];

  it('returns the matching entry\'s color', () => {
    expect(colorFor(list, 'Frontend')).toBe('#222222');
  });

  it('falls back to the default gray for an unknown or stale name', () => {
    expect(colorFor(list, 'Nonexistent')).toBe('#94a3b8');
  });

  it('falls back safely when the list itself is missing', () => {
    expect(colorFor(undefined, 'Anything')).toBe('#94a3b8');
  });
});

describe('colorForPerson', () => {
  it('is deterministic for the same key', () => {
    expect(colorForPerson('arunava@example.com')).toBe(colorForPerson('arunava@example.com'));
  });

  it('always returns a color from the fixed palette', () => {
    const palette = ['#d9a02a', '#6366f1', '#22c55e', '#a855f7', '#e2725b', '#3ba7b0', '#e2c53d', '#f0993d'];
    expect(palette).toContain(colorForPerson('someone@example.com'));
  });
});

describe('initials', () => {
  it('takes the first letter of up to two words, uppercased', () => {
    expect(initials('Arunava Kundu')).toBe('AK');
  });

  it('handles a single-word name', () => {
    expect(initials('Cher')).toBe('C');
  });
});
