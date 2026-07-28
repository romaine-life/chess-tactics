import { useState, type ReactElement, type ReactNode } from 'react';
import type { ConditionSide, VictoryAction, VictoryCondition, VictoryRule, VictoryRules } from '../core/level';
import { Stepper } from './shared/Stepper';
import { Toggle } from './shared/Toggle';
import { HouseSelect } from './shared/HouseSelect';
import { DEFAULT_SURVIVE_TURNS } from '../core/objectives';
import { chromeUnitClassNames } from './chromeUnitRegistry';

// The Level Editor's "Victory events" editor (ADR-0064) — a MASTER-DETAIL surface inside the
// Events workspace: a scrollable list of NAMED rules on the left, the selected rule's `IF <conditions>
// THEN <faction> wins|loses` on the right. Templates (passed in via `templates`) sit atop the list
// and append rules to it. Chrome is the editor's kit idiom only — le-seg-btn buttons, the shared Toggle /
// Stepper, and the shared HouseSelect dropdown.

/** The board's factions offered in the "IF <faction>" / "THEN <faction>" dropdowns — one per side,
 * label from the board's assigned palette (see LevelEditor). Values map to the engine's side. */
export interface FactionOption { side: ConditionSide; label: string; }

const DEFAULT_ACTION: VictoryAction = { kind: 'win', side: 'player' };

// ---- pure helpers (exported for template append / dirty-diff in LevelEditor) ------------------

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
/** Content identity (actions + conditions, NAME-independent) — for preset equality checks. */
const ruleContentKey = (r: VictoryRule, condKey: (c: VictoryCondition) => string): string =>
  `[${r.do.map(actionKey).slice().sort().join('&')}]|${r.if.map(condKey).slice().sort().join('&')}`;
/** Full identity incl. name — for the diverges-from-preset check (so a rename counts as a change). */
const ruleFullKey = (r: VictoryRule): string => `${r.name ?? ''}::${ruleContentKey(r, conditionFullKey)}`;
const displayName = (r: VictoryRule, i: number): string => (r.name && r.name.trim()) || `Event ${i + 1}`;
const idSlug = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) { const candidate = `${base} ${n}`; if (!taken.has(candidate)) return candidate; }
}
function uniqueId(base: string, taken: Set<string>): string {
  const clean = idSlug(base) || 'victory-event';
  if (!taken.has(clean)) return clean;
  for (let n = 2; ; n += 1) {
    const candidate = `${clean}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Append template rules into the current list. Templates are intentionally additive: even an
 * identical rule becomes a fresh editable event row with its own id and label. */
export function appendRules(base: VictoryRules, add: VictoryRules): VictoryRules {
  const takenNames = new Set(base.map((r, i) => displayName(r, i)));
  const takenIds = new Set(base.map((r) => r.id?.trim()).filter((id): id is string => Boolean(id)));
  const appended = add.map((rule, index) => {
    const baseName = rule.name?.trim() || `Template event ${index + 1}`;
    const name = uniqueName(baseName, takenNames);
    takenNames.add(name);
    const id = uniqueId(rule.id?.trim() || baseName, takenIds);
    takenIds.add(id);
    return { ...rule, id, name };
  });
  return [...base, ...appended];
}

/** True when two rule lists hold the same rules incl. names (order-insensitive) — keeps a level
 * that still matches its objective preset from storing `victory`. */
export function rulesEqual(a: VictoryRules, b: VictoryRules): boolean {
  if (a.length !== b.length) return false;
  const ka = a.map(ruleFullKey).sort();
  const kb = b.map(ruleFullKey).sort();
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
const outcomeLabel = (r: VictoryRule, factionLabel: (s: ConditionSide) => string): string => {
  const a = r.do[0] ?? DEFAULT_ACTION;
  return `${factionLabel(a.side)} ${a.kind === 'win' ? 'wins' : 'loses'}`;
};

// ---- component --------------------------------------------------------------------------------

export function VictoryConditionsEditor({ value, factions, onChange, templates }: {
  value: VictoryRules;
  factions: FactionOption[];
  onChange: (next: VictoryRules) => void;
  /** The templates control (dropdown + Add/Clear buttons), rendered atop the rule list. */
  templates?: ReactNode;
}): ReactElement {
  const [sel, setSel] = useState(0);
  const selected = value.length ? Math.min(sel, value.length - 1) : -1;
  const rule = selected >= 0 ? value[selected] : null;
  const action = rule?.do[0] ?? DEFAULT_ACTION;
  const factionLabel = (s: ConditionSide): string => factions.find((f) => f.side === s)?.label ?? (s === 'player' ? 'Player' : 'Enemy');

  const setRule = (i: number, r: VictoryRule): void => onChange(value.map((x, j) => (j === i ? r : x)));
  const addEvent = (): void => {
    // One "add event": a blank event with a starting condition + action, both edited in the detail.
    // Win vs lose is a property of the action (the THEN control), not a separate kind of rule.
    const taken = new Set(value.map((r, i) => displayName(r, i)));
    const takenIds = new Set(value.map((r) => r.id?.trim()).filter((id): id is string => Boolean(id)));
    const name = uniqueName('New event', taken);
    const fresh: VictoryRule = { id: uniqueId(name, takenIds), name, if: [{ kind: 'eliminate', side: 'enemy' }], do: [{ kind: 'win', side: 'player' }] };
    setSel(value.length); // focus the new event
    onChange([...value, fresh]);
  };
  const removeRule = (i: number): void => { setSel(Math.max(0, i - 1)); onChange(value.filter((_, j) => j !== i)); };

  // detail edits (operate on the selected rule)
  const addCond = (c: VictoryCondition): void => {
    if (!rule || rule.if.some((x) => conditionKey(x) === conditionKey(c))) return;
    setRule(selected, { ...rule, if: [...rule.if, c] });
  };
  const setCond = (j: number, c: VictoryCondition): void => { if (rule) setRule(selected, { ...rule, if: rule.if.map((x, k) => (k === j ? c : x)) }); };
  const removeCond = (j: number): void => { if (rule) setRule(selected, { ...rule, if: rule.if.filter((_, k) => k !== j) }); };
  const patchAction = (patch: Partial<VictoryAction>): void => { if (rule) setRule(selected, { ...rule, do: [{ ...action, ...patch }, ...rule.do.slice(1)] }); };

  return (
    <div className="le-md">
      <div className="le-md-list">
        {templates}
        <h3 className="le-victory-head">Events</h3>
        {value.length === 0 ? <p className="le-board-warning">No events yet — add a template above, or add one below.</p> : null}
        <div className="le-md-rules">
          {value.map((r, i) => (
            <button
              type="button"
              key={i}
              data-chrome-unit="inner-list-row"
              className={chromeUnitClassNames('inner-list-row', 'le-md-item', i === selected ? 'active' : '')}
              onClick={() => setSel(i)}
            >
              <span className="le-md-item-name">{displayName(r, i)}</span>
              <span className={`le-md-item-out ${r.do[0]?.kind ?? 'win'}`}>{outcomeLabel(r, factionLabel)}</span>
            </button>
          ))}
        </div>
        <div className="le-cond-add le-rule-add">
          <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'le-add-event')} onClick={addEvent}>+ Add event</button>
        </div>
      </div>

      <div className="le-md-detail">
        {rule ? (
          <div className="le-rule">
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Event name</span>
              <input className="le-text-input" value={rule.name ?? ''} placeholder={`Event ${selected + 1}`} aria-label="Event name"
                onChange={(e) => setRule(selected, { ...rule, name: e.target.value })} />
            </div>

            {rule.if.length === 0 ? <p className="le-board-warning">This event has no conditions — it fires every turn.</p> : null}
            {rule.if.map((c, j) => (
              <div className="le-rule-cond" key={j}>
                <div className="le-cond-top">
                  <span className="le-cond-summary"><b>{j === 0 ? 'IF' : 'and'}</b> {conditionSummary(c, factionLabel)}</span>
                  <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'danger', 'le-cond-remove')} aria-label="Remove this condition" title="Remove condition" onClick={() => removeCond(j)}>–</button>
                </div>
                {c.kind === 'eliminate' ? (
                  <div className="le-cond-params">
                    <div className="le-ctrlrow">
                      <span className="le-ctrllabel">Faction</span>
                      <HouseSelect
                        ariaLabel="Faction this condition is about"
                        value={c.side}
                        options={factions.map((f) => ({ value: f.side, label: f.label }))}
                        onChange={(side) => setCond(j, { ...c, side })}
                      />
                    </div>
                    <div className="le-ctrlrow">
                      <span className="le-ctrllabel">King only</span>
                      <Toggle checked={c.filter?.type === 'king'} label="Toggle king-only elimination"
                        onChange={(on) => setCond(j, { kind: 'eliminate', side: c.side, ...(on ? { filter: { type: 'king' } } : {}) })} />
                    </div>
                  </div>
                ) : null}
                {c.kind === 'turnLimit' ? (
                  <div className="le-ctrlrow">
                    <span className="le-ctrllabel">Turn number</span>
                    <Stepper value={c.turns} suffix="" decreaseLabel="Earlier turn" increaseLabel="Later turn"
                      onDecrease={() => setCond(j, { ...c, turns: Math.max(1, c.turns - 1) })}
                      onIncrease={() => setCond(j, { ...c, turns: c.turns + 1 })} />
                  </div>
                ) : null}
              </div>
            ))}

            <div className="le-cond-add">
              <span className="le-ctrllabel le-rule-and">and…</span>
              <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} onClick={() => addCond({ kind: 'eliminate', side: 'enemy' })}>+ Eliminate</button>
              <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} onClick={() => addCond({ kind: 'reach', side: 'player' })}>+ Reach goal</button>
              <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} onClick={() => addCond({ kind: 'turnLimit', turns: DEFAULT_SURVIVE_TURNS })}>+ Turn N</button>
            </div>

            <div className="le-rule-then">
              <span className="le-ctrllabel">THEN</span>
              <HouseSelect
                ariaLabel="Faction this outcome is for"
                value={action.side}
                options={factions.map((f) => ({ value: f.side, label: f.label }))}
                onChange={(side) => patchAction({ side })}
              />
              <div className="le-seg le-seg-wrap le-seg-compact">
                {(['win', 'lose'] as const).map((kind) => (
                  <button type="button" key={kind} data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', action.kind === kind ? 'active' : '')}
                    onClick={() => patchAction({ kind })}>{kind === 'win' ? 'wins' : 'loses'}</button>
                ))}
              </div>
              <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'danger', 'le-rule-remove')} onClick={() => removeRule(selected)}>Remove event</button>
            </div>
          </div>
        ) : <p className="le-board-note">No event selected — add a template or add an event on the left.</p>}
      </div>
    </div>
  );
}
