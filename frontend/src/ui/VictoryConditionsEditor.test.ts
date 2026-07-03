import { describe, it, expect } from 'vitest';
import { mergeRules, rulesEqual, conditionKey } from './VictoryConditionsEditor';
import type { VictoryRules } from '../core/level';

// The pure helpers behind the additive-preset / idempotent-add behaviour (ADR-0055).

describe('victory condition helpers (ADR-0055)', () => {
  it('mergeRules adds conditions but never duplicates, and re-merging is a no-op', () => {
    const base: VictoryRules = { win: [{ kind: 'reach', side: 'player' }], lose: [{ kind: 'eliminate', side: 'player' }] };
    const add: VictoryRules = { win: [{ kind: 'eliminate', side: 'enemy' }], lose: [{ kind: 'eliminate', side: 'player' }] };
    const merged = mergeRules(base, add);
    expect(merged.win).toHaveLength(2); // reach + eliminate(enemy)
    expect(merged.lose).toHaveLength(1); // eliminate(player) already present → not duplicated
    expect(mergeRules(merged, add)).toEqual(merged); // idempotent
  });

  it('conditionKey de-dupes eliminate by side+filter, but turnLimit by kind alone (one per list)', () => {
    expect(conditionKey({ kind: 'eliminate', side: 'enemy' }))
      .not.toBe(conditionKey({ kind: 'eliminate', side: 'enemy', filter: { type: 'king' } }));
    expect(conditionKey({ kind: 'eliminate', side: 'enemy' }))
      .not.toBe(conditionKey({ kind: 'eliminate', side: 'player' }));
    expect(conditionKey({ kind: 'turnLimit', turns: 5 })).toBe(conditionKey({ kind: 'turnLimit', turns: 9 }));
  });

  it('rulesEqual is order-insensitive but turn-sensitive', () => {
    const a: VictoryRules = { win: [{ kind: 'reach', side: 'player' }, { kind: 'eliminate', side: 'enemy' }], lose: [{ kind: 'eliminate', side: 'player' }] };
    const b: VictoryRules = { win: [{ kind: 'eliminate', side: 'enemy' }, { kind: 'reach', side: 'player' }], lose: [{ kind: 'eliminate', side: 'player' }] };
    expect(rulesEqual(a, b)).toBe(true); // reordered win → still equal
    const c: VictoryRules = { win: [{ kind: 'turnLimit', turns: 5 }], lose: [] };
    const d: VictoryRules = { win: [{ kind: 'turnLimit', turns: 8 }], lose: [] };
    expect(rulesEqual(c, d)).toBe(false); // different turn count → not equal
    expect(rulesEqual(a, c)).toBe(false); // different conditions entirely
  });
});
