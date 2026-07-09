// Phase-4 transposition-table tests (ADR-0069). vitest v4 hides console.log for passing tests,
// so every claim is an assertion. Covers the six-flag model, depth-preferred + proven-sticky
// replacement, ttEntryLimit eviction (proofs survive), and provenCounts.

import { describe, it, expect } from 'vitest';
import { TranspositionTable, PROVEN_DEPTH, type TTEntry } from './transpositionTable';

const entry = (key: string, flag: TTEntry['flag'], depth: number, over: Partial<TTEntry> = {}): TTEntry => ({
  key, flag, value: 0, depth, distancePlies: 0, ...over,
});

describe('TranspositionTable — put/get + depth-preferred replacement', () => {
  it('stores and retrieves an entry', () => {
    const tt = new TranspositionTable();
    tt.put(entry('a', 'exact', 3, { value: 7 }));
    expect(tt.get('a')?.value).toBe(7);
    expect(tt.get('missing')).toBeUndefined();
    expect(tt.size).toBe(1);
  });

  it('a deeper bound replaces a shallower one; a shallower one does not', () => {
    const tt = new TranspositionTable();
    tt.put(entry('a', 'exact', 2, { value: 1 }));
    tt.put(entry('a', 'exact', 5, { value: 2 })); // deeper → replaces
    expect(tt.get('a')?.depth).toBe(5);
    expect(tt.get('a')?.value).toBe(2);
    tt.put(entry('a', 'exact', 3, { value: 9 })); // shallower → ignored
    expect(tt.get('a')?.depth).toBe(5);
    expect(tt.get('a')?.value).toBe(2);
  });
});

describe('TranspositionTable — proven-sticky', () => {
  it('a proven-win survives a later shallower bound put', () => {
    const tt = new TranspositionTable();
    tt.put(entry('a', 'exact', 2, { value: 1 }));           // a heuristic bound at depth 2
    tt.put(entry('a', 'proven-win', PROVEN_DEPTH, { distancePlies: 3, value: 9997 })); // a proof
    expect(tt.get('a')?.flag).toBe('proven-win');
    // A later, shallower heuristic bound must NOT overwrite the proof (proven-sticky).
    tt.put(entry('a', 'exact', 4, { value: 5 }));
    expect(tt.get('a')?.flag).toBe('proven-win');
    expect(tt.get('a')?.distancePlies).toBe(3);
  });

  it('a proof with a SHORTER DTM refines an existing proof; a longer one does not', () => {
    const tt = new TranspositionTable();
    tt.put(entry('a', 'proven-win', PROVEN_DEPTH, { distancePlies: 7 }));
    tt.put(entry('a', 'proven-win', PROVEN_DEPTH, { distancePlies: 3 })); // shorter → refines
    expect(tt.get('a')?.distancePlies).toBe(3);
    tt.put(entry('a', 'proven-win', PROVEN_DEPTH, { distancePlies: 9 })); // longer → ignored
    expect(tt.get('a')?.distancePlies).toBe(3);
  });

  it('a proof replaces a heuristic bound even when shallower-depth-tagged (proofs win outright)', () => {
    const tt = new TranspositionTable();
    tt.put(entry('a', 'exact', 20, { value: 3 }));
    tt.put(entry('a', 'proven-draw', PROVEN_DEPTH));
    expect(tt.get('a')?.flag).toBe('proven-draw');
  });
});

describe('TranspositionTable — eviction keeps the deepest/proven', () => {
  it('at the entry limit, the shallowest non-proven entry is evicted; a proof is never evicted', () => {
    const tt = new TranspositionTable(3);
    tt.put(entry('shallow', 'exact', 1));
    tt.put(entry('proof', 'proven-win', PROVEN_DEPTH, { distancePlies: 1 }));
    tt.put(entry('deep', 'exact', 10));
    expect(tt.size).toBe(3);
    // Inserting a 4th trips eviction: the shallowest NON-proven ('shallow', depth 1) goes.
    tt.put(entry('new', 'exact', 5));
    expect(tt.size).toBe(3);
    expect(tt.get('shallow')).toBeUndefined();
    expect(tt.get('proof')?.flag).toBe('proven-win'); // the proof survived
    expect(tt.get('deep')).toBeDefined();
    expect(tt.get('new')).toBeDefined();
  });
});

describe('TranspositionTable — provenCounts + provenEntries', () => {
  it('counts and iterates only the proven entries', () => {
    const tt = new TranspositionTable();
    tt.put(entry('w1', 'proven-win', PROVEN_DEPTH, { distancePlies: 1 }));
    tt.put(entry('w2', 'proven-win', PROVEN_DEPTH, { distancePlies: 2 }));
    tt.put(entry('l1', 'proven-loss', PROVEN_DEPTH, { distancePlies: 3 }));
    tt.put(entry('d1', 'proven-draw', PROVEN_DEPTH));
    tt.put(entry('b1', 'exact', 4)); // a heuristic bound — not counted.
    expect(tt.provenCounts()).toEqual({ win: 2, loss: 1, draw: 1 });
    const proven = [...tt.provenEntries()];
    expect(proven.length).toBe(4);
    expect(proven.every((e) => e.flag.startsWith('proven-'))).toBe(true);
  });

  it('clear empties the table', () => {
    const tt = new TranspositionTable();
    tt.put(entry('a', 'exact', 1));
    tt.clear();
    expect(tt.size).toBe(0);
    expect(tt.get('a')).toBeUndefined();
  });
});
