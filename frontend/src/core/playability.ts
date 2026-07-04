// Playability validation (ADR-0050) — the gameplay-rule gate behind the Level Editor's
// Save button, distinct from `validateLevel`'s structural checks (shapes/enums/bounds).
// The editor lets the author freely mess the board up while editing; these rules only
// decide whether the result is SAVEABLE, and every violation is a plain-language line
// the editor renders verbatim. The backend deliberately does NOT mirror these (the
// whole-workspace PUT carries legacy levels; one broken level must not brick the rest),
// so this module is the single owner of the P1–P5 rule set. Pure + deterministic.

import type { Level, Roster, ZoneType } from './level';
import type { PieceType } from './types';
import { PLAYABLE_PIECE_TYPES, isPlayablePieceType } from './pieces';
import { MODE_NAME, ruleOutcome } from './objectives';
import { isPassableTerrain } from './terrain';
import { propCells, propDef } from './props';

export interface PlayabilityViolation {
  /** Stable machine id (P1_SIDE_EMPTY, P2_KING_ASSAULT_KINGS, P2_RIVAL_KINGS_KINGS,
   * P3_UNITS_NOT_EMPTY, P3_NO_SPAWN_ZONE, P3_ZONE_CAPACITY, P3_ZONES_OVERLAP,
   * P4_SURVIVE_TURNS, P5_TIME_CONTROL, P6_VICTORY_NO_WIN, P6_VICTORY_NO_LOSE). The editor keys on
   * messages; tests key on these. */
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
const SPAWN_ZONE: Record<CombatSide, ZoneType> = { player: 'player-spawn', enemy: 'enemy-spawn' };

const key = (x: number, y: number): string => `${x},${y}`;

/** Total pieces a roster fields (playable types only; junk keys are the structural
 * validator's problem and simply don't count here). */
function rosterTotal(roster: Roster | undefined): number {
  if (!roster) return 0;
  return PLAYABLE_PIECE_TYPES.reduce((sum, type) => sum + (roster[type] ?? 0), 0);
}

/** How many pieces a side fields — from `layers.units` when fixed, from `roster` when
 * random. Only playable types count as "pieces" (a painted neutral rock is scenery). */
function pieceCount(level: Level, side: CombatSide): number {
  if (level.placement === 'random') return rosterTotal(level.roster?.[side]);
  return level.layers.units.filter((u) => u.side === side && isPlayablePieceType(u.type)).length;
}

/** How many Kings a side fields, placement-aware like pieceCount. */
function kingCount(level: Level, side: CombatSide): number {
  const king: PieceType = 'king';
  if (level.placement === 'random') return level.roster?.[side]?.[king] ?? 0;
  return level.layers.units.filter((u) => u.side === side && u.type === king).length;
}

/**
 * A side's pooled spawn tiles: every tile of every zone of its spawn type (multiple
 * zones pool), deduped, in-bounds. This is the RAW pool — usability (terrain/props)
 * is filtered separately so the overlap check can compare authored intent directly.
 */
function pooledSpawnTiles(level: Level, side: CombatSide): Set<string> {
  const pool = new Set<string>();
  for (const zone of level.layers.zones) {
    if (zone.type !== SPAWN_ZONE[side]) continue;
    for (const [x, y] of zone.tiles) {
      if (x < 0 || x >= level.board.cols || y < 0 || y >= level.board.rows) continue;
      pool.add(key(x, y));
    }
  }
  return pool;
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

  // P1 — presence: each side fields at least one piece, whatever the mode. A side
  // with nothing on the board is an instant (or impossible) win.
  for (const side of SIDES) {
    if (pieceCount(level, side) < 1) {
      violations.push({
        code: 'P1_SIDE_EMPTY',
        message: `${SIDE_NAME[side]} needs at least one piece${random ? ' in its roster' : ''}.`,
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

  // P3 — random placement: units are authored as a roster + spawn zones, never as
  // painted positions, and each side's pool must actually hold its force.
  if (random) {
    if (level.layers.units.length > 0) {
      violations.push({
        code: 'P3_UNITS_NOT_EMPTY',
        message: 'Random placement uses the roster — remove the placed units (or switch placement to fixed).',
      });
    }

    const blocked = blockedCells(level);
    const pools: Record<CombatSide, Set<string>> = {
      player: pooledSpawnTiles(level, 'player'),
      enemy: pooledSpawnTiles(level, 'enemy'),
    };
    for (const side of SIDES) {
      // Zone presence is checked on the authored zones (not the pool) so an authored-
      // but-empty zone reads as a capacity problem, not a missing-zone one.
      if (!level.layers.zones.some((z) => z.type === SPAWN_ZONE[side])) {
        violations.push({
          code: 'P3_NO_SPAWN_ZONE',
          message: `${SIDE_NAME[side]} needs at least one spawn zone painted for random placement.`,
        });
        continue;
      }
      // Usable = pooled tiles a piece can actually be dealt onto (in-bounds and deduped
      // already, minus impassable terrain and blocking-prop footprints).
      let usable = 0;
      for (const tile of pools[side]) if (!blocked.has(tile)) usable += 1;
      const needed = rosterTotal(level.roster?.[side]);
      if (usable < needed) {
        violations.push({
          code: 'P3_ZONE_CAPACITY',
          message: `${SIDE_NAME[side]} spawn zones need ${needed - usable} more usable tile${needed - usable === 1 ? '' : 's'} (${usable} usable for ${needed} pieces).`,
        });
      }
    }
    // Overlapping pools would let both sides claim the same square; compared on the raw
    // pools because a shared-but-blocked tile is still an authoring mistake worth flagging.
    let overlap = 0;
    for (const tile of pools.player) if (pools.enemy.has(tile)) overlap += 1;
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
  // EVERY faction with units on the board must be able to win AND to lose — no player left in an
  // unwinnable or unloseable state. A faction can win if some rule's outcome makes it the winner,
  // and can lose if some rule makes the OTHER side win (in the 2-player game a win for one is a loss
  // for the other, so player-perspective rules cover both). Structural SHAPE is validateLevel's job;
  // this is the gameplay gate. Assumes a structurally valid level.
  if (level.victory !== undefined) {
    const winners = new Set(level.victory.map(ruleOutcome).filter((w): w is CombatSide => w === 'player' || w === 'enemy'));
    const otherSide: Record<CombatSide, CombatSide> = { player: 'enemy', enemy: 'player' };
    for (const side of SIDES) {
      if (pieceCount(level, side) < 1) continue; // not an on-board player
      if (!winners.has(side)) {
        violations.push({ code: 'P6_VICTORY_NO_WIN', message: `${SIDE_NAME[side]} has no way to win — add a rule whose outcome is ${SIDE_NAME[side]} winning.` });
      }
      if (!winners.has(otherSide[side])) {
        violations.push({ code: 'P6_VICTORY_NO_LOSE', message: `${SIDE_NAME[side]} has no way to lose — add a rule whose outcome is ${SIDE_NAME[side]} losing.` });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
