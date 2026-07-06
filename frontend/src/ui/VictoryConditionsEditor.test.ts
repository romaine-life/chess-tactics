import { describe, it, expect } from 'vitest';
import { appendRules, rulesEqual, conditionKey } from './VictoryConditionsEditor';
import type { VictoryRules } from '../core/level';

// The pure helpers behind additive event templates (ADR-0064 if-then rules).

describe('victory rule helpers (ADR-0064)', () => {
  it('appendRules always adds template rules with fresh identities, even when content duplicates', () => {
    const base: VictoryRules = [{ id: 'reach-goal', name: 'Reach goal', if: [{ kind: 'reach', side: 'player' }], do: [{ kind: 'win', side: 'player' }] }];
    const add: VictoryRules = [
      { id: 'wipe-enemy', name: 'Wipe enemy', if: [{ kind: 'eliminate', side: 'enemy' }], do: [{ kind: 'win', side: 'player' }] },
      { id: 'reach-goal', name: 'Reach goal', if: [{ kind: 'reach', side: 'player' }], do: [{ kind: 'win', side: 'player' }] },
    ];
    const merged = appendRules(base, add);
    expect(merged).toHaveLength(3);
    expect(merged.map((rule) => rule.id)).toEqual(['reach-goal', 'wipe-enemy', 'reach-goal-2']);
    expect(merged.map((rule) => rule.name)).toEqual(['Reach goal', 'Wipe enemy', 'Reach goal 2']);
    expect(appendRules(merged, add)).toHaveLength(5);
  });

  it('a win rule and a lose rule with the same conditions are distinct', () => {
    const win: VictoryRules = [{ if: [{ kind: 'eliminate', side: 'enemy' }], do: [{ kind: 'win', side: 'player' }] }];
    const lose: VictoryRules = [{ if: [{ kind: 'eliminate', side: 'enemy' }], do: [{ kind: 'lose', side: 'player' }] }];
    expect(rulesEqual(win, lose)).toBe(false);
    expect(appendRules(win, lose)).toHaveLength(2); // different `then` → both kept
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
      { if: [{ kind: 'reach', side: 'player' }], do: [{ kind: 'win', side: 'player' }] },
      { if: [{ kind: 'eliminate', side: 'player' }], do: [{ kind: 'lose', side: 'player' }] },
    ];
    const b: VictoryRules = [ // rules reordered
      { if: [{ kind: 'eliminate', side: 'player' }], do: [{ kind: 'lose', side: 'player' }] },
      { if: [{ kind: 'reach', side: 'player' }], do: [{ kind: 'win', side: 'player' }] },
    ];
    expect(rulesEqual(a, b)).toBe(true);
    const c: VictoryRules = [{ if: [{ kind: 'turnLimit', turns: 5 }], do: [{ kind: 'win', side: 'player' }] }];
    const d: VictoryRules = [{ if: [{ kind: 'turnLimit', turns: 8 }], do: [{ kind: 'win', side: 'player' }] }];
    expect(rulesEqual(c, d)).toBe(false); // different turn count → not equal
  });
});
