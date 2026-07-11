// Seed-vs-author arbitration for the Level Editor's rules state (objective preset,
// victory events, other events, battle clock, level name, template choice).
//
// The editor's canonical and durable-working-copy loads resolve ASYNCHRONOUSLY, and the
// ADR-0046 entrance failsafe reveals a still-loading editor after 4s rather than strand it
// on a slow fetch. So the user can author rules BEFORE a load resolves, and a blind
// `setVictory(level.victory ?? preset)` on resolve silently replaces what they authored
// (the "applied Rival Kings, workspace persisted King Assault" bug; the reproduced
// ordering lives in levelEditorRulesSeed.test.ts). The arbitration rule:
//
//   - a SEED (deferred mount initialization) never overwrites a field the user
//     explicitly authored first — both orderings converge on "loaded document + the
//     user's edit";
//   - an explicit document LOAD (opening another level or discarding to canonical) is the
//     user asking for that document: it replaces everything and resets authorship.
//
// When a seed does withhold authored fields, the editor's clean baseline must still be
// the SEEDED document's signature (not the merged on-screen state), so the user's edit
// reads dirty and flows into drafts/saves — `seededBaselineLevel` reconstructs it.

import type { Level, LevelEvents, ObjectiveType, TimeControl, VictoryRules } from '../core/level';
import { DEFAULT_SURVIVE_TURNS, victoryRulesForObjective } from '../core/objectives';
import { effectiveLevelEvents } from '../core/levelEvents';
import { DEFAULT_TIME_CONTROL } from '../core/clock';
import { rulesEqual } from './VictoryConditionsEditor';

/** Rules-state fields with a direct user-authoring surface in the editor UI. `objective`
 * and `surviveTurns` are absent on purpose: they have no user-facing setter (ADR-0064
 * replaced the objective dropdown with victory templates), so a seed always writes them. */
export type AuthoredRulesField = 'victory' | 'events' | 'name' | 'clock' | 'templateChoice';

export interface LevelRulesSeed {
  objective: ObjectiveType;
  surviveTurns: number;
  clock: { enabled: boolean; initialSeconds: number; incrementSeconds: number };
  /** Working victory list — the objective preset materialized when the level stores none. */
  victory: VictoryRules;
  events: LevelEvents;
  name: string;
  /** The for-save forms of the rules fields — what an untouched save of this document
   * would persist (victory collapses back to `undefined` when it matches the objective
   * preset, mirroring victoryForSave). Used by seededBaselineLevel. */
  save: {
    surviveTurns: number | undefined;
    timeControl: TimeControl | undefined;
    victory: VictoryRules | undefined;
    events: LevelEvents | undefined;
  };
}

/** The rules state a level document seeds into the editor — the single derivation both
 * document-apply paths (canonical hydrate and working-copy load) share. Pure. */
export function levelRulesSeed(level: Level): LevelRulesSeed {
  const surviveTurns = level.surviveTurns ?? DEFAULT_SURVIVE_TURNS;
  const preset = victoryRulesForObjective(level.objective, { surviveTurns });
  const victory = level.victory ?? preset;
  const events = effectiveLevelEvents(level);
  return {
    objective: level.objective,
    surviveTurns,
    clock: {
      enabled: level.timeControl !== undefined,
      initialSeconds: level.timeControl?.initialSeconds ?? DEFAULT_TIME_CONTROL.initialSeconds,
      incrementSeconds: level.timeControl?.incrementSeconds ?? DEFAULT_TIME_CONTROL.incrementSeconds,
    },
    victory,
    events,
    name: level.name,
    save: {
      surviveTurns: level.objective === 'survive' ? surviveTurns : undefined,
      timeControl: level.timeControl,
      victory: rulesEqual(victory, preset) ? undefined : victory,
      events: events.length ? events : undefined,
    },
  };
}

export interface GuardedRulesSeed {
  seed: LevelRulesSeed;
  /** Per-field verdict: may the seed write this field? False iff the user authored it first. */
  apply: Record<AuthoredRulesField, boolean>;
  /** True when a withheld field skews the on-screen state away from the seeded document —
   * the clean baseline must then come from seededBaselineLevel, not the settled state.
   * templateChoice is excluded: it is not part of the persisted document. */
  skippedAuthored: boolean;
}

/** Arbitrate a document seed against the fields the user has already authored. Pure. */
export function guardRulesSeed(seed: LevelRulesSeed, authored: ReadonlySet<AuthoredRulesField>): GuardedRulesSeed {
  const apply: Record<AuthoredRulesField, boolean> = {
    victory: !authored.has('victory'),
    events: !authored.has('events'),
    name: !authored.has('name'),
    clock: !authored.has('clock'),
    templateChoice: !authored.has('templateChoice'),
  };
  return { seed, apply, skippedAuthored: !apply.victory || !apply.events || !apply.name || !apply.clock };
}

/** The Level whose signature is the CLEAN baseline after a seed skipped authored fields:
 * the settled candidate (its boardCode/placement/roster normalization is the point of the
 * post-hydrate capture) with the seeded document's rules fields restored — the state the
 * editor WOULD show had the user not intervened. Diffing the live state against it makes
 * exactly the user's authored delta read dirty. Pure. */
export function seededBaselineLevel(candidate: Level, seed: LevelRulesSeed): Level {
  return {
    ...candidate,
    name: seed.name,
    objective: seed.objective,
    surviveTurns: seed.save.surviveTurns,
    timeControl: seed.save.timeControl,
    victory: seed.save.victory,
    events: seed.save.events,
  };
}
