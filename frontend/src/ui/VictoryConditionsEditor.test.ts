import { describe, it, expect } from 'vitest';
import { mergeRules, rulesEqual, conditionKey } from './VictoryConditionsEditor';
import type { VictoryRules } from '../core/level';

// The pure helpers behind the additive-preset / idempotent-add behaviour (ADR-0055 if-then rules).

describe('victory rule helpers (ADR-0055)', () => {
  it('mergeRules adds rules but never duplicates, and re-merging is a no-op', () => {
    const base: VictoryRules = [{ if: [{ kind: 'reach', side: 'player' }], then: 'win' }];
    const add: VictoryRules = [
      { if: [{ kind: 'eliminate', side: 'enemy' }], then: 'win' },
      { if: [{ kind: 'reach', side: 'player' }], then: 'win' }, // identical to base → not duplicated
    ];
    const merged = mergeRules(base, add);
    expect(merged).toHaveLength(2);
    expect(mergeRules(merged, add)).toEqual(merged); // idempotent
  });

  it('a win rule and a lose rule with the same conditions are distinct', () => {
    const win: VictoryRules = [{ if: [{ kind: 'eliminate', side: 'enemy' }], then: 'win' }];
    const lose: VictoryRules = [{ if: [{ kind: 'eliminate', side: 'enemy' }], then: 'lose' }];
    expect(rulesEqual(win, lose)).toBe(false);
    expect(mergeRules(win, lose)).toHaveLength(2); // different `then` → both kept
  });

  it('conditionKey de-dupes eliminate by side+filter, but turnLimit by kind alone', () => {
    expect(conditionKey({ kind: 'eliminate', side: 'enemy' }))
      .not.toBe(conditionKey({ kind: 'eliminate', side: 'enemy', filter: { type: 'king' } }));
    expect(conditionKey({ kind: 'eliminate', side: 'enemy' }))
      .not.toBe(conditionKey({ kind: 'eliminate', side: 'player' }));
    expect(conditionKey({ kind: 'turnLimit', turns: 5 })).toBe(conditionKey({ kind: 'turnLimit', turns: 9 }));
  });

  it('rulesEqual is order-insensitive (rules and conditions) but turn-sensitive', () => {
    const a: VictoryRules = [
      { if: [{ kind: 'reach', side: 'player' }], then: 'win' },
      { if: [{ kind: 'eliminate', side: 'player' }], then: 'lose' },
    ];
    const b: VictoryRules = [ // rules reordered
      { if: [{ kind: 'eliminate', side: 'player' }], then: 'lose' },
      { if: [{ kind: 'reach', side: 'player' }], then: 'win' },
    ];
    expect(rulesEqual(a, b)).toBe(true);
    const c: VictoryRules = [{ if: [{ kind: 'turnLimit', turns: 5 }], then: 'win' }];
    const d: VictoryRules = [{ if: [{ kind: 'turnLimit', turns: 8 }], then: 'win' }];
    expect(rulesEqual(c, d)).toBe(false); // different turn count → not equal
  });
});
