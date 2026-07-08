// Phase-4 cycle-detection tests (ADR-0068 F8). vitest v4 hides console.log for passing tests, so
// every claim is an assertion. PathHistory is the mechanism that proves DRAWS in this loopy game.

import { describe, it, expect } from 'vitest';
import { PathHistory } from './cycleDetection';

describe('PathHistory — repeat detection', () => {
  it('flags a key already on the path and not one that is absent', () => {
    const h = new PathHistory();
    h.push('a');
    h.push('b');
    expect(h.repeats('a')).toBe(true);
    expect(h.repeats('b')).toBe(true);
    expect(h.repeats('c')).toBe(false);
  });

  it('a 3-position loop reports the repeat when the loop closes', () => {
    // a → b → c → a: descending back into 'a' closes a cycle.
    const h = new PathHistory();
    h.push('a'); h.push('b'); h.push('c');
    expect(h.repeats('a')).toBe(true); // 'a' is an ancestor ⇒ the loop repeats
  });
});

describe('PathHistory — push/pop symmetry', () => {
  it('popping removes the ancestor so it no longer repeats', () => {
    const h = new PathHistory();
    h.push('a');
    h.push('b');
    h.pop('b');
    expect(h.repeats('b')).toBe(false);
    expect(h.repeats('a')).toBe(true);
    h.pop('a');
    expect(h.repeats('a')).toBe(false);
    expect(h.size).toBe(0);
  });

  it('a position pushed twice needs two pops (multiset, not a set)', () => {
    const h = new PathHistory();
    h.push('a');
    h.push('a'); // legitimately on the path twice before it is recognized as a repeat
    h.pop('a');
    expect(h.repeats('a')).toBe(true); // still one occurrence left
    h.pop('a');
    expect(h.repeats('a')).toBe(false);
  });
});

describe('PathHistory — GHI lowlink (depthOf / stackLen)', () => {
  it('records the FIRST stack depth of each key and the current path length', () => {
    const h = new PathHistory();
    expect(h.stackLen).toBe(0);
    h.push('a'); // depth 0
    h.push('b'); // depth 1
    h.push('c'); // depth 2
    expect(h.depthOf('a')).toBe(0);
    expect(h.depthOf('b')).toBe(1);
    expect(h.depthOf('c')).toBe(2);
    expect(h.depthOf('absent')).toBe(Infinity);
    expect(h.stackLen).toBe(3);
    h.pop('c');
    expect(h.stackLen).toBe(2);
    expect(h.depthOf('c')).toBe(Infinity);
  });
});
