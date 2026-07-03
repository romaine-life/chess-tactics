import type { ReactElement } from 'react';
import type { VictoryCondition, VictoryRules } from '../core/level';
import { Stepper } from './shared/Stepper';
import { Toggle } from './shared/Toggle';
import { DEFAULT_SURVIVE_TURNS } from '../core/objectives';

// The Level Editor's authoring surface for ADR-0054 victory conditions: two editable lists (win /
// lose) of VictoryConditions. The player wins the instant ANY win condition holds and loses the
// instant ANY lose condition holds (defeat-first). Rendered inside the RULES panel only when the
// author turns on "Custom win/lose"; otherwise the `objective` preset defines the outcome.
//
// Chrome is the editor's kit idiom only — `le-seg-btn` segmented buttons, the shared Toggle and
// Stepper, `le-ctrlrow`/`le-board-note` layout. Leaf conditions (eliminate / reach / turnLimit)
// are fully editable; a compound `all` condition (authored in raw data) renders read-only so a
// re-save never silently drops it.

type ListKey = 'win' | 'lose';

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
  const add = (key: ListKey, c: VictoryCondition): void => update(key, [...value[key], c]);

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
