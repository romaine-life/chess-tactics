import type { ReactElement } from 'react';
import type { VictoryCondition, VictoryRules } from '../core/level';
import { Stepper } from './shared/Stepper';
import { Toggle } from './shared/Toggle';
import { DEFAULT_SURVIVE_TURNS } from '../core/objectives';

// The Level Editor's authoring surface for ADR-0055 victory conditions — THE place a level's
// win/lose is set (always visible in the RULES panel, not a mode you toggle). Two editable lists:
// the player wins the instant ANY win condition holds and loses the instant ANY lose condition
// holds (defeat-first). Presets load their conditions in as ADDITIVE helpers (see `mergeRules`),
// and every add is idempotent (see `addUnique`) so re-clicking or layering presets never dupes.
//
// Chrome is the editor's kit idiom only — `le-seg-btn` segmented buttons, the shared Toggle and
// Stepper, `le-ctrlrow`/`le-board-note` layout. Leaf conditions (eliminate / reach / turnLimit)
// are fully editable; a compound `all` condition (authored in raw data) renders read-only so a
// re-save never silently drops it.

type ListKey = 'win' | 'lose';

/** De-dupe identity: two conditions collide when they are the same kind + params. `turnLimit`
 * collides on kind ALONE (one deadline per list — its turn count is edited in place, so re-adding
 * never makes a second), while `eliminate`/`reach` distinguish by side/filter. */
export function conditionKey(c: VictoryCondition): string {
  switch (c.kind) {
    case 'eliminate': return `eliminate:${c.side}:${c.filter?.type ?? ''}`;
    case 'reach': return `reach:${c.side}`;
    case 'turnLimit': return 'turnLimit';
    case 'all': return `all:${c.of.map(conditionKey).sort().join('|')}`;
  }
}

/** Append a condition unless one with the same key is already present — the idempotent add. */
function addUnique(list: VictoryCondition[], c: VictoryCondition): VictoryCondition[] {
  return new Set(list.map(conditionKey)).has(conditionKey(c)) ? list : [...list, c];
}

/** Merge a preset's rules into existing lists — each condition added only if not already there.
 * Presets are additive helpers, so loading two composes their conditions without duplicates. */
export function mergeRules(base: VictoryRules, add: VictoryRules): VictoryRules {
  return { win: add.win.reduce(addUnique, base.win), lose: add.lose.reduce(addUnique, base.lose) };
}

/** Full-equality key — like conditionKey but the turn count MATTERS — for deciding whether the
 * authored lists still exactly match a preset expansion (if so, the level stores no `victory` and
 * the `objective` preset drives it, preserving e.g. capture-king's runtime kingSide direction). */
function conditionFullKey(c: VictoryCondition): string {
  return c.kind === 'turnLimit' ? `turnLimit:${c.turns}` : conditionKey(c);
}

/** True when two rule sets hold the same conditions (order-insensitive). */
export function rulesEqual(a: VictoryRules, b: VictoryRules): boolean {
  const same = (x: VictoryCondition[], y: VictoryCondition[]): boolean =>
    x.length === y.length && x.map(conditionFullKey).sort().join(',') === y.map(conditionFullKey).sort().join(',');
  return same(a.win, b.win) && same(a.lose, b.lose);
}

/** Live plain-language summary of a condition — the row's identity, updates as its params change. */
function conditionSummary(c: VictoryCondition): string {
  switch (c.kind) {
    case 'eliminate': {
      const whose = c.side === 'player' ? 'Your' : 'Enemy';
      return c.filter?.type === 'king' ? `${whose} King is captured` : `${whose} force is wiped out`;
    }
    case 'reach':
      return 'A pawn reaches the Goal zone';
    case 'turnLimit':
      return `Turn ${c.turns} is reached`;
    case 'all':
      return `All of ${c.of.length} condition${c.of.length === 1 ? '' : 's'}`;
  }
}

export function VictoryConditionsEditor({ value, onChange }: {
  value: VictoryRules;
  onChange: (next: VictoryRules) => void;
}): ReactElement {
  const update = (key: ListKey, next: VictoryCondition[]): void => onChange({ ...value, [key]: next });
  const setAt = (key: ListKey, i: number, c: VictoryCondition): void => update(key, value[key].map((x, j) => (j === i ? c : x)));
  const removeAt = (key: ListKey, i: number): void => update(key, value[key].filter((_, j) => j !== i));
  const add = (key: ListKey, c: VictoryCondition): void => update(key, addUnique(value[key], c));

  return (
    <>
      {(['win', 'lose'] as const).map((key) => (
        <div className="le-victory-list" key={key}>
          <h3 className="le-victory-head">{key === 'win' ? 'Win if any' : 'Lose if any'}</h3>
          {value[key].length === 0
            ? <p className="le-board-warning">Add at least one {key} condition.</p>
            : null}

          {value[key].map((c, i) => (
            <div className="le-cond" key={i}>
              <div className="le-cond-top">
                <span className="le-cond-summary">{conditionSummary(c)}</span>
                <button
                  type="button"
                  className="le-seg-btn danger le-cond-remove"
                  aria-label={`Remove this ${key} condition`}
                  title="Remove"
                  onClick={() => removeAt(key, i)}
                >Remove</button>
              </div>

              {c.kind === 'eliminate' ? (
                <div className="le-cond-params">
                  <div className="le-ctrlrow">
                    <span className="le-ctrllabel">Side</span>
                    <div className="le-seg le-seg-wrap le-seg-compact">
                      {(['player', 'enemy'] as const).map((side) => (
                        <button
                          type="button"
                          key={side}
                          className={`le-seg-btn ${c.side === side ? 'active' : ''}`.trim()}
                          onClick={() => setAt(key, i, { ...c, side })}
                        >{side === 'player' ? 'Player' : 'Enemy'}</button>
                      ))}
                    </div>
                  </div>
                  <div className="le-ctrlrow">
                    <span className="le-ctrllabel">King only</span>
                    <Toggle
                      checked={c.filter?.type === 'king'}
                      label="Toggle king-only elimination"
                      onChange={(on) => setAt(key, i, { kind: 'eliminate', side: c.side, ...(on ? { filter: { type: 'king' } } : {}) })}
                    />
                  </div>
                </div>
              ) : null}

              {c.kind === 'turnLimit' ? (
                <div className="le-ctrlrow">
                  <span className="le-ctrllabel">Turn number</span>
                  <Stepper
                    value={c.turns}
                    suffix=""
                    decreaseLabel="Earlier turn"
                    increaseLabel="Later turn"
                    onDecrease={() => setAt(key, i, { ...c, turns: Math.max(1, c.turns - 1) })}
                    onIncrease={() => setAt(key, i, { ...c, turns: c.turns + 1 })}
                  />
                </div>
              ) : null}

              {c.kind === 'all'
                ? <p className="le-board-note">Compound condition — edit in the level data.</p>
                : null}
            </div>
          ))}

          <div className="le-cond-add">
            <button type="button" className="le-seg-btn" onClick={() => add(key, { kind: 'eliminate', side: key === 'win' ? 'enemy' : 'player' })}>+ Eliminate</button>
            {key === 'win'
              ? <button type="button" className="le-seg-btn" onClick={() => add(key, { kind: 'reach', side: 'player' })}>+ Reach goal</button>
              : null}
            <button type="button" className="le-seg-btn" onClick={() => add(key, { kind: 'turnLimit', turns: DEFAULT_SURVIVE_TURNS })}>
              + {key === 'win' ? 'Survive to turn' : 'Deadline turn'}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
