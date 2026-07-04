import type { ReactElement } from 'react';
import type { ConditionSide, VictoryAction, VictoryCondition, VictoryRule, VictoryRules } from '../core/level';
import { Stepper } from './shared/Stepper';
import { Toggle } from './shared/Toggle';
import { DEFAULT_SURVIVE_TURNS } from '../core/objectives';

// The Level Editor's "Events" rules-bar for ADR-0055 victory conditions — an ordered list of
// `IF <conditions> THEN <do actions>` rules. Conditions in a rule are ANDed; rules are checked
// top-to-bottom and the first that fires decides. Each rule's THEN is a faction win/lose action
// (a `do[]` so effects can join later). Templates (in a separate card) load rules in; this is the
// raw logic view. Chrome is the editor's kit idiom only — le-seg-btn buttons, the shared Toggle /
// Stepper, the styled le-layer-select dropdown.

/** The board's factions offered in the "IF <faction>" / "THEN <faction>" dropdowns — one per side,
 * label from the board's assigned palette (see LevelEditor). Values map to the engine's side. */
export interface FactionOption { side: ConditionSide; label: string; }

const DEFAULT_ACTION: VictoryAction = { kind: 'win', side: 'player' };

// ---- pure helpers (exported for the template-merge / dirty-diff in LevelEditor) ---------------

/** De-dupe identity for a condition. `turnLimit` collides on kind ALONE (one deadline per rule);
 * eliminate/reach distinguish by side/filter. */
export function conditionKey(c: VictoryCondition): string {
  switch (c.kind) {
    case 'eliminate': return `eliminate:${c.side}:${c.filter?.type ?? ''}`;
    case 'reach': return `reach:${c.side}`;
    case 'turnLimit': return 'turnLimit';
  }
}
function conditionFullKey(c: VictoryCondition): string {
  return c.kind === 'turnLimit' ? `turnLimit:${c.turns}` : conditionKey(c);
}
const actionKey = (a: VictoryAction): string => `${a.kind}:${a.side}`;
const ruleKey = (r: VictoryRule, condKey: (c: VictoryCondition) => string): string =>
  `[${r.do.map(actionKey).slice().sort().join('&')}]|${r.if.map(condKey).slice().sort().join('&')}`;

/** Merge template rules into the current list — each rule added only if an identical one isn't
 * already present, so loading two templates composes their rules without duplicates. */
export function mergeRules(base: VictoryRules, add: VictoryRules): VictoryRules {
  const seen = new Set(base.map((r) => ruleKey(r, conditionKey)));
  const out = base.slice();
  for (const r of add) {
    const k = ruleKey(r, conditionKey);
    if (!seen.has(k)) { seen.add(k); out.push(r); }
  }
  return out;
}

/** True when two rule lists hold the same rules (order-insensitive) — keeps a level that still
 * matches its objective preset from storing `victory`. */
export function rulesEqual(a: VictoryRules, b: VictoryRules): boolean {
  if (a.length !== b.length) return false;
  const ka = a.map((r) => ruleKey(r, conditionFullKey)).sort();
  const kb = b.map((r) => ruleKey(r, conditionFullKey)).sort();
  return ka.every((k, i) => k === kb[i]);
}

/** Plain-language summary of one condition (the row's identity, live as params change). */
function conditionSummary(c: VictoryCondition, factionLabel: (s: ConditionSide) => string): string {
  switch (c.kind) {
    case 'eliminate':
      return c.filter?.type === 'king' ? `${factionLabel(c.side)}'s King is captured` : `${factionLabel(c.side)} is wiped out`;
    case 'reach':
      return 'a pawn reaches the Goal zone';
    case 'turnLimit':
      return `turn ${c.turns} is reached`;
  }
}

// ---- component --------------------------------------------------------------------------------

export function VictoryConditionsEditor({ value, factions, onChange }: {
  value: VictoryRules;
  factions: FactionOption[];
  onChange: (next: VictoryRules) => void;
}): ReactElement {
  const factionLabel = (s: ConditionSide): string => factions.find((f) => f.side === s)?.label ?? (s === 'player' ? 'Player' : 'Enemy');
  const setRule = (i: number, r: VictoryRule): void => onChange(value.map((x, j) => (j === i ? r : x)));
  const removeRule = (i: number): void => onChange(value.filter((_, j) => j !== i));
  const addRule = (r: VictoryRule): void => onChange([...value, r]);

  const addCond = (i: number, c: VictoryCondition): void => {
    const rule = value[i];
    if (rule.if.some((x) => conditionKey(x) === conditionKey(c))) return; // idempotent
    setRule(i, { ...rule, if: [...rule.if, c] });
  };
  const setCond = (i: number, j: number, c: VictoryCondition): void =>
    setRule(i, { ...value[i], if: value[i].if.map((x, k) => (k === j ? c : x)) });
  const removeCond = (i: number, j: number): void =>
    setRule(i, { ...value[i], if: value[i].if.filter((_, k) => k !== j) });
  // The THEN action (edits do[0] — one outcome per rule today; effects would add more).
  const patchAction = (i: number, patch: Partial<VictoryAction>): void =>
    setRule(i, { ...value[i], do: [{ ...(value[i].do[0] ?? DEFAULT_ACTION), ...patch }, ...value[i].do.slice(1)] });

  return (
    <div className="le-rules">
      {value.length === 0 ? <p className="le-board-warning">No rules yet — load a template above, or add a rule.</p> : null}

      {value.map((rule, i) => {
        const action = rule.do[0] ?? DEFAULT_ACTION;
        return (
          <div className="le-rule" key={i}>
            {rule.if.length === 0 ? <p className="le-board-warning">This rule has no conditions — it fires every turn.</p> : null}

            {rule.if.map((c, j) => (
              <div className="le-rule-cond" key={j}>
                <div className="le-cond-top">
                  <span className="le-cond-summary"><b>{j === 0 ? 'IF' : 'and'}</b> {conditionSummary(c, factionLabel)}</span>
                  <button type="button" className="le-seg-btn danger le-cond-remove" aria-label="Remove this condition" title="Remove condition" onClick={() => removeCond(i, j)}>–</button>
                </div>

                {c.kind === 'eliminate' ? (
                  <div className="le-cond-params">
                    <div className="le-ctrlrow">
                      <span className="le-ctrllabel">Faction</span>
                      <select className="le-layer-select le-faction-select" aria-label="Faction this condition is about"
                        value={c.side} onChange={(e) => setCond(i, j, { ...c, side: e.target.value as ConditionSide })}>
                        {factions.map((f) => <option key={f.side} value={f.side}>{f.label}</option>)}
                      </select>
                    </div>
                    <div className="le-ctrlrow">
                      <span className="le-ctrllabel">King only</span>
                      <Toggle checked={c.filter?.type === 'king'} label="Toggle king-only elimination"
                        onChange={(on) => setCond(i, j, { kind: 'eliminate', side: c.side, ...(on ? { filter: { type: 'king' } } : {}) })} />
                    </div>
                  </div>
                ) : null}

                {c.kind === 'turnLimit' ? (
                  <div className="le-ctrlrow">
                    <span className="le-ctrllabel">Turn number</span>
                    <Stepper value={c.turns} suffix="" decreaseLabel="Earlier turn" increaseLabel="Later turn"
                      onDecrease={() => setCond(i, j, { ...c, turns: Math.max(1, c.turns - 1) })}
                      onIncrease={() => setCond(i, j, { ...c, turns: c.turns + 1 })} />
                  </div>
                ) : null}
              </div>
            ))}

            <div className="le-cond-add">
              <span className="le-ctrllabel le-rule-and">and…</span>
              <button type="button" className="le-seg-btn" onClick={() => addCond(i, { kind: 'eliminate', side: 'enemy' })}>+ Eliminate</button>
              <button type="button" className="le-seg-btn" onClick={() => addCond(i, { kind: 'reach', side: 'player' })}>+ Reach goal</button>
              <button type="button" className="le-seg-btn" onClick={() => addCond(i, { kind: 'turnLimit', turns: DEFAULT_SURVIVE_TURNS })}>+ Turn N</button>
            </div>

            <div className="le-rule-then">
              <span className="le-ctrllabel">THEN</span>
              <select className="le-layer-select le-faction-select" aria-label="Faction this outcome is for"
                value={action.side} onChange={(e) => patchAction(i, { side: e.target.value as ConditionSide })}>
                {factions.map((f) => <option key={f.side} value={f.side}>{f.label}</option>)}
              </select>
              <div className="le-seg le-seg-wrap le-seg-compact">
                {(['win', 'lose'] as const).map((kind) => (
                  <button type="button" key={kind} className={`le-seg-btn ${action.kind === kind ? 'active' : ''}`.trim()}
                    onClick={() => patchAction(i, { kind })}>{kind === 'win' ? 'wins' : 'loses'}</button>
                ))}
              </div>
              <button type="button" className="le-seg-btn danger le-rule-remove" onClick={() => removeRule(i)}>Remove rule</button>
            </div>
          </div>
        );
      })}

      <div className="le-cond-add le-rule-add">
        <button type="button" className="le-seg-btn" onClick={() => addRule({ if: [{ kind: 'eliminate', side: 'enemy' }], do: [{ kind: 'win', side: 'player' }] })}>+ Add win rule</button>
        <button type="button" className="le-seg-btn" onClick={() => addRule({ if: [{ kind: 'eliminate', side: 'player' }], do: [{ kind: 'lose', side: 'player' }] })}>+ Add lose rule</button>
      </div>
    </div>
  );
}
