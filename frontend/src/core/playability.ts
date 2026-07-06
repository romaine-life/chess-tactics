// Playability validation (ADR-0050) — the gameplay-rule gate behind the Level Editor's
// Save button, distinct from `validateLevel`'s structural checks (shapes/enums/bounds).
// The editor lets the author freely mess the board up while editing; these rules only
// decide whether the result is SAVEABLE, and every violation is a plain-language line
// the editor renders verbatim. The backend deliberately does NOT mirror these (the
// whole-workspace PUT carries legacy levels; one broken level must not brick the rest),
// so this module is the single owner of the P1–P5 rule set. Pure + deterministic.

import type { Level, Roster } from './level';
import type { PieceType } from './types';
import { PLAYABLE_PIECE_TYPES, isPlayablePieceType } from './pieces';
import { MODE_NAME, ruleOutcome } from './objectives';
import { isPassableTerrain } from './terrain';
import { propCells, propDef } from './props';
import { spawnEventsForLevel, zoneCellsByIds, zonesByIds } from './levelEvents';

export interface PlayabilityViolation {
  /** Stable machine id (P1_SIDE_EMPTY, P2_KING_ASSAULT_KINGS, P2_RIVAL_KINGS_KINGS,
   * P3_UNITS_NOT_EMPTY, P3_NO_SPAWN_ZONE, P3_ZONE_CAPACITY, P3_ZONES_OVERLAP,
   * P4_SURVIVE_TURNS, P5_TIME_CONTROL, P6_VICTORY_NO_WIN,
   * P7_EVENT_NAME_EMPTY, P7_EVENT_NAME_DUP). The editor keys on messages; tests key on these. */
  code: string;
  /** Plain language for the editor's violation list — no jargon, sides named
   * "Player side" / "Enemy side", modes named by their display names. */
  message: string;
}

export interface PlayabilityResult {
  ok: boolean;
  violations: PlayabilityViolation[];
}

const SIDES = ['player', 'enemy'] as const;
type CombatSide = (typeof SIDES)[number];

const SIDE_NAME: Record<CombatSide, string> = { player: 'Player side', enemy: 'Enemy side' };

const key = (x: number, y: number): string => `${x},${y}`;

/** Total pieces a roster fields (playable types only; junk keys are the structural
 * validator's problem and simply don't count here). */
function rosterTotal(roster: Roster | undefined): number {
  if (!roster) return 0;
  return PLAYABLE_PIECE_TYPES.reduce((sum, type) => sum + (roster[type] ?? 0), 0);
}

function spawnedRosterTotal(level: Level, side: CombatSide): number {
  const total = spawnEventsForLevel(level)
    .filter((event) => event.side === side)
    .reduce((sum, event) => sum + rosterTotal(event.roster), 0);
  return total || (level.placement === 'random' ? rosterTotal(level.roster?.[side]) : 0);
}

/** How many pieces a side fields — from `layers.units` when fixed, from `roster` when
 * random. Only playable types count as "pieces" (a painted neutral rock is scenery). */
function pieceCount(level: Level, side: CombatSide): number {
  const fixed = level.layers.units.filter((u) => u.side === side && isPlayablePieceType(u.type)).length;
  return fixed + spawnedRosterTotal(level, side);
}

/** How many Kings a side fields, placement-aware like pieceCount. */
function kingCount(level: Level, side: CombatSide): number {
  const king: PieceType = 'king';
  const fixed = level.layers.units.filter((u) => u.side === side && u.type === king).length;
  const spawnedFromEvents = spawnEventsForLevel(level).reduce((sum, event) => sum + (event.side === side ? event.roster.king ?? 0 : 0), 0);
  const spawned = spawnedFromEvents || (level.placement === 'random' ? level.roster?.[side]?.[king] ?? 0 : 0);
  return fixed + spawned;
}

/** Cells a spawned piece can never stand on: impassable terrain + blocking-prop
 * footprints. Mirrors the taken-set seeding in game/setup.ts so the capacity the
 * editor promises equals the capacity the game actually has. */
function blockedCells(level: Level): Set<string> {
  const blocked = new Set<string>();
  for (const c of level.layers.terrain) {
    if (!isPassableTerrain(c.terrain)) blocked.add(key(c.x, c.y));
  }
  for (const placed of level.layers.props ?? []) {
    const def = propDef(placed.propId);
    if (!def || !def.blocking) continue; // unknown / decorative props don't block
    for (const cell of propCells(placed.x, placed.y, def)) blocked.add(key(cell.x, cell.y));
  }
  return blocked;
}

/**
 * The P1–P4 playability rules from ADR-0050. Assumes a STRUCTURALLY valid level
 * (run `validateLevel` first); returns every violation, not just the first, so the
 * editor can show the author the complete to-fix list at once.
 */
export function validatePlayability(level: Level): PlayabilityResult {
  const violations: PlayabilityViolation[] = [];
  const random = level.placement === 'random';
  const spawnEvents = spawnEventsForLevel(level);

  // P1 — presence: each side fields at least one piece, whatever the mode. A side
  // with nothing on the board is an instant (or impossible) win.
  for (const side of SIDES) {
    if (pieceCount(level, side) < 1) {
      violations.push({
        code: 'P1_SIDE_EMPTY',
        message: `${SIDE_NAME[side]} needs at least one piece${random || spawnEvents.length ? ' in its setup' : ''}.`,
      });
    }
  }

  // P2 — kings. King Assault: exactly ONE side fields exactly one King (either side —
  // the mode is direction-aware). Rival Kings: each side exactly one. Other modes put
  // no constraint on Kings.
  const playerKings = kingCount(level, 'player');
  const enemyKings = kingCount(level, 'enemy');
  if (level.objective === 'capture-king') {
    const ok = (playerKings === 1 && enemyKings === 0) || (playerKings === 0 && enemyKings === 1);
    if (!ok) {
      violations.push({
        code: 'P2_KING_ASSAULT_KINGS',
        message: `${MODE_NAME['capture-king']} needs exactly one King on exactly one side (Player side has ${playerKings}, Enemy side has ${enemyKings}).`,
      });
    }
  }
  if (level.objective === 'rival-kings') {
    for (const side of SIDES) {
      const kings = side === 'player' ? playerKings : enemyKings;
      if (kings !== 1) {
        violations.push({
          code: 'P2_RIVAL_KINGS_KINGS',
          message: `${MODE_NAME['rival-kings']} needs exactly one King on each side (${SIDE_NAME[side]} has ${kings}).`,
        });
      }
    }
  }

  // P3 — setup spawning: zones are dumb tile groups; spawn events say which roster
  // is dealt into which zone ids. Legacy random placement expands into the same event
  // shape, preserving old levels while new editor saves make the behavior explicit.
  if (random || spawnEvents.length > 0) {
    if (level.layers.units.length > 0) {
      violations.push({
        code: 'P3_UNITS_NOT_EMPTY',
        message: 'Setup spawn events deal pieces into zones — remove the painted units or remove the setup spawn events.',
      });
    }

    const blocked = blockedCells(level);
    const used = new Set<string>();
    const poolsByEvent = spawnEvents.map((event) => ({
      event,
      hasZone: zonesByIds(level, event.zoneIds).length > 0,
      pool: new Set(zoneCellsByIds(level, event.zoneIds).map((cell) => key(cell.x, cell.y))),
    }));
    for (const side of SIDES) {
      if (!spawnEvents.some((event) => event.side === side)) {
        violations.push({
          code: 'P3_NO_SPAWN_ZONE',
          message: `${SIDE_NAME[side]} needs a setup spawn event with a painted zone.`,
        });
      }
    }
    for (const { event, hasZone, pool } of poolsByEvent) {
      if (!hasZone) {
        violations.push({
          code: 'P3_NO_SPAWN_ZONE',
          message: `${SIDE_NAME[event.side]} spawn event "${event.name?.trim() || 'Setup spawn'}" needs at least one painted zone tile.`,
        });
        continue;
      }
      let usable = 0;
      for (const tile of pool) if (!blocked.has(tile) && !used.has(tile)) usable += 1;
      const needed = rosterTotal(event.roster);
      if (usable < needed) {
        violations.push({
          code: 'P3_ZONE_CAPACITY',
          message: `${SIDE_NAME[event.side]} spawn event "${event.name?.trim() || 'Setup spawn'}" needs ${needed - usable} more usable tile${needed - usable === 1 ? '' : 's'} (${usable} usable for ${needed} pieces).`,
        });
      }
      for (const tile of pool) if (!blocked.has(tile)) used.add(tile);
    }
    // Overlapping pools would let both sides claim the same square; compared on the raw
    // pools because a shared-but-blocked tile is still an authoring mistake worth flagging.
    let overlap = 0;
    const playerPool = new Set<string>();
    const enemyPool = new Set<string>();
    for (const { event, pool } of poolsByEvent) {
      const target = event.side === 'player' ? playerPool : enemyPool;
      for (const tile of pool) target.add(tile);
    }
    for (const tile of playerPool) if (enemyPool.has(tile)) overlap += 1;
    if (overlap > 0) {
      violations.push({
        code: 'P3_ZONES_OVERLAP',
        message: `Player and enemy spawn zones overlap on ${overlap} tile${overlap === 1 ? '' : 's'} — they must not share tiles.`,
      });
    }
  }

  // P4 — survive: the authored turn target, when present, must be a whole number of
  // at least 1 (a 0-turn Survive is an instant win). validateLevel enforces the same
  // shape structurally; repeated here so the editor's violation list is complete on
  // its own.
  if (level.surviveTurns !== undefined && (!Number.isInteger(level.surviveTurns) || level.surviveTurns < 1)) {
    violations.push({
      code: 'P4_SURVIVE_TURNS',
      message: `The ${MODE_NAME.survive} turn target must be a whole number of at least 1.`,
    });
  }

  // P5 — battle clock: when present, a whole-second starting time of at least 1 and a
  // non-negative whole-second increment. Repeated from validateLevel (same both-gates
  // pattern as P4) so the editor's violation list is complete on its own.
  if (level.timeControl !== undefined) {
    const { initialSeconds, incrementSeconds } = level.timeControl;
    if (!Number.isInteger(initialSeconds) || initialSeconds < 1 || !Number.isInteger(incrementSeconds) || incrementSeconds < 0) {
      violations.push({
        code: 'P5_TIME_CONTROL',
        message: 'The battle clock needs a starting time of at least one second and a non-negative increment.',
      });
    }
  }

  // P6 — authored victory (ADR-0064): when a level overrides the preset with its own event rules,
  // EVERY faction with units on the board must have a path to WINNING. That single check also
  // guarantees a path to losing — a faction loses whenever another faction wins, and with two-plus
  // factions each able to win, everyone can also lose — so a separate "can it lose?" check is pure
  // redundancy that only double-reported the same missing rule from both seats. This generalizes:
  // the win-reachability gate is unchanged as factions grow (it's the lose side that a binary
  // player↔enemy flip couldn't express). `winners` is the outcomes the rules can actually declare
  // (ruleOutcome; win(side) ⇒ that side, lose(side) ⇒ the other). Structural SHAPE is validateLevel's
  // job; this is the gameplay gate. Assumes a structurally valid level.
  if (level.victory !== undefined) {
    const winners = new Set(level.victory.map(ruleOutcome).filter((w): w is CombatSide => w === 'player' || w === 'enemy'));
    for (const side of SIDES) {
      if (pieceCount(level, side) < 1) continue; // not an on-board faction
      if (!winners.has(side)) {
        violations.push({ code: 'P6_VICTORY_NO_WIN', message: `${SIDE_NAME[side]} has no way to win — add a rule whose outcome is ${SIDE_NAME[side]} winning.` });
      }
    }
  }

  // P7 — authored victory names (ADR-0064): the editor is a MASTER-DETAIL list keyed on each event's
  // name, and the result screen shows the fired rule's name, so every event needs a non-empty name
  // and no two may collide. The editor assigns unique defaults; this gates a hand-cleared field or a
  // rename into a duplicate. Preset rules are always name-clean, so only authored victory is checked.
  if (level.victory !== undefined) {
    const names = level.victory.map((rule) => (rule.name ?? '').trim());
    if (names.some((name) => name === '')) {
      violations.push({ code: 'P7_EVENT_NAME_EMPTY', message: 'Every victory event needs a name.' });
    }
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const name of names) {
      if (!name) continue;
      if (seen.has(name) && !dupes.includes(name)) dupes.push(name);
      seen.add(name);
    }
    if (dupes.length > 0) {
      violations.push({
        code: 'P7_EVENT_NAME_DUP',
        message: `Victory event names must be unique — rename the duplicate ${dupes.map((name) => `"${name}"`).join(', ')}.`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}
