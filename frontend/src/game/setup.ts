// Deterministic skirmish assembly: builds the initial GameState (player party,
// enemy force, scattered rocks) from a seed. Pure — no DOM, no Math.random.
// Replaces the legacy startGame() placement with a seeded, testable version.

import type { BoardSize, GameState, Piece, PieceType, Side, TerrainCell, TerrainType } from '../core/types';
import type { Level } from '../core/level';
import { createRng, type Rng } from '../core/rng';
import { isPassableTerrain } from '../core/terrain';
import { tileAssets, tileFamilies } from '../art/tileset';
import { generateSocketBoard } from '../core/tileBoardGenerator';
import type { TileFamilyId } from '../core/tileSockets';
import { PLAYABLE_PIECE_TYPES, defaultFacingForSide } from '../core/pieces';
import { propCells, propDef } from '../core/props';

const DEFAULT_SIZE: BoardSize = { cols: 8, rows: 12 };
const ENEMY_CHOICES: readonly PieceType[] = ['knight', 'bishop', 'rook', 'queen'];

const FAMILY_TO_TERRAIN: Record<TileFamilyId, TerrainType> = {
  grass: 'grass',
  stone: 'stone',
  water: 'water',
  dirt: 'dirt',
  pebble: 'pebble',
  sand: 'sand',
};

function buildTerrain(size: BoardSize, seed: number): TerrainCell[] {
  const board = generateSocketBoard({
    assets: tileAssets,
    seed,
    columns: size.cols,
    rows: size.rows,
    familyAssets: tileFamilies,
  });
  return board.cells.map((cell) => ({
    x: cell.x,
    y: cell.y,
    terrain: FAMILY_TO_TERRAIN[cell.terrain],
    elevation: 0,
  }));
}

export interface SkirmishOptions {
  seed: number;
  size?: BoardSize;
  /** Player party (a pawn is always also fielded). */
  party?: PieceType[];
  /** Authored campaign level to test play. */
  level?: Level;
}

function pawnForwardFields(type: PieceType, facing: Piece['facing']): Pick<Piece, 'pawnForward'> {
  return type === 'pawn' && facing ? { pawnForward: facing } : {};
}

function createFromLevel(level: Level, seed: number): GameState {
  const pieces: Piece[] = level.layers.units.map((unit, index) => {
    // Honor the authored facing so test-play shows the painted direction; fall back to
    // the side's default when a level (legacy / facing-free) doesn't carry one. Pawns
    // also snapshot this as their immutable forward direction for the whole fight.
    const facing = unit.facing ?? defaultFacingForSide(unit.side);
    return {
      id: `${unit.side}-${unit.type}-${index}`,
      side: unit.side,
      type: unit.type,
      x: unit.x,
      y: unit.y,
      facing,
      alive: true,
      // Fixed campaign levels author the battle's initial position directly, so a pawn's
      // double-step belongs to the cell it was placed on, matching random/free setup.
      startX: unit.x,
      startY: unit.y,
      ...pawnForwardFields(unit.type, facing),
    };
  });

  // Realise multi-cell BLOCKING props as single-cell neutral `rock` colliders — one per
  // footprint cell. This is why blocking needs ZERO rules.ts changes: a rock is already an
  // obstacle (legalMoves returns [], rays break on it, it's never an enemy/capture target, and
  // victory counts only player/enemy living pieces). An unknown prop id is SKIPPED (no
  // collider, no crash). A cell already taken by an authored unit/piece keeps the unit — the
  // collider for that one cell is dropped so we never double-occupy a square.
  const props = level.layers.props ?? [];
  const occupied = new Set(pieces.map((p) => `${p.x},${p.y}`));
  for (const placed of props) {
    const def = propDef(placed.propId);
    if (!def || !def.blocking) continue;
    propCells(placed.x, placed.y, def).forEach((cell, cellIndex) => {
      const key = `${cell.x},${cell.y}`;
      if (occupied.has(key)) return; // authored unit wins this cell
      occupied.add(key);
      pieces.push({
        id: `prop-${placed.propId}-${placed.x}-${placed.y}-${cellIndex}`,
        side: 'neutral',
        type: 'rock',
        x: cell.x,
        y: cell.y,
        alive: true,
        startX: -1,
        startY: -1,
      });
    });
  }

  // Random placement (ADR-0050): deal the authored roster onto seeded-random free cells
  // of each side's pooled spawn zones instead of reading authored positions (a playable
  // random level has `layers.units` empty — the editor's playability gate enforces it).
  // Order of operations matters: terrain + the blocking-prop colliders above joined the
  // taken set FIRST, so no piece is ever dealt inside a tree footprint or onto impassable
  // ground. Restarting with a new seed reshuffles the deal — that's the mode's point.
  if (level.placement === 'random') {
    const rng = createRng(seed);
    const taken = new Set(occupied);
    for (const c of level.layers.terrain) if (!isPassableTerrain(c.terrain)) taken.add(`${c.x},${c.y}`);
    for (const side of ['player', 'enemy'] as const) {
      const zoneType = side === 'player' ? 'player-spawn' : 'enemy-spawn';
      // Pool the side's spawn tiles (multiple zones of a type pool), deduped, in-bounds,
      // minus taken cells — the same usable-tile math validatePlayability promised on.
      const free: Array<{ x: number; y: number }> = [];
      const seen = new Set<string>();
      for (const zone of level.layers.zones) {
        if (zone.type !== zoneType) continue;
        for (const [x, y] of zone.tiles) {
          const k = `${x},${y}`;
          if (seen.has(k)) continue;
          seen.add(k);
          if (taken.has(k)) continue;
          if (x < 0 || x >= level.board.cols || y < 0 || y >= level.board.rows) continue;
          free.push({ x, y });
        }
      }
      const roster = level.roster?.[side] ?? {};
      // Iterate piece types in the canonical order, never Object.keys — object key order
      // is authoring-insertion order, which would silently change the deal between two
      // otherwise identical levels. Same seed must always mean the same layout.
      for (const type of PLAYABLE_PIECE_TYPES) {
        const count = roster[type] ?? 0;
        for (let i = 0; i < count && free.length; i += 1) {
          const cell = free.splice(rng.int(free.length), 1)[0];
          taken.add(`${cell.x},${cell.y}`);
          pieces.push({
            id: `${side}-${type}-${i}`,
            side,
            type,
            x: cell.x,
            y: cell.y,
            facing: defaultFacingForSide(side),
            alive: true,
            // The dealt cell is the piece's home rank, so a dealt pawn keeps its
            // double-step — matching the free-skirmish spawn behavior.
            startX: cell.x,
            startY: cell.y,
            ...pawnForwardFields(type, defaultFacingForSide(side)),
          });
        }
      }
    }
  }

  return {
    size: { cols: level.board.cols, rows: level.board.rows },
    pieces,
    terrain: level.layers.terrain,
    boardCode: level.boardCode,
    // The render channel: the board draws the tall prop sprite from this list, while the
    // colliders above do the blocking. Defaults to [] so a prop-free level stays prop-free.
    props,
    turn: 'player',
    winner: null,
  };
}

function pickEmptyCell(taken: Set<string>, cols: number, ys: readonly number[], rng: Rng): { x: number; y: number } | null {
  const cells: Array<{ x: number; y: number }> = [];
  for (const y of ys) {
    for (let x = 0; x < cols; x += 1) {
      if (!taken.has(`${x},${y}`)) cells.push({ x, y });
    }
  }
  return cells.length ? rng.pick(cells) : null;
}

export function createSkirmish(opts: SkirmishOptions): GameState {
  if (opts.level) return createFromLevel(opts.level, opts.seed);
  const size = opts.size ?? DEFAULT_SIZE;
  const party = opts.party ?? ['knight', 'bishop'];
  const rng = createRng(opts.seed);
  const terrain = buildTerrain(size, opts.seed);
  const pieces: Piece[] = [];
  // Seed `taken` with impassable terrain so no piece spawns on blocking cliffs/rocks.
  const taken = new Set<string>();
  for (const c of terrain) if (!isPassableTerrain(c.terrain)) taken.add(`${c.x},${c.y}`);

  const place = (side: Side, types: readonly PieceType[], ys: readonly number[]): void => {
    types.forEach((type, i) => {
      const cell = pickEmptyCell(taken, size.cols, ys, rng);
      if (!cell) return;
      taken.add(`${cell.x},${cell.y}`);
      pieces.push({
        id: `${side}-${type}-${i}`,
        side,
        type,
        x: cell.x,
        y: cell.y,
        facing: defaultFacingForSide(side),
        alive: true,
        startX: cell.x,
        startY: cell.y,
        ...pawnForwardFields(type, defaultFacingForSide(side)),
      });
    });
  };

  place('player', ['pawn', ...party], [size.rows - 1, size.rows - 2]);
  place('enemy', ['king', rng.pick(ENEMY_CHOICES), rng.pick(ENEMY_CHOICES)], [0, 1]);

  const midYs: number[] = [];
  for (let y = 2; y <= size.rows - 3; y += 1) midYs.push(y);
  const rockCount = 3 + rng.int(4);
  for (let i = 0; i < rockCount; i += 1) {
    const cell = pickEmptyCell(taken, size.cols, midYs, rng);
    if (!cell) break;
    taken.add(`${cell.x},${cell.y}`);
    pieces.push({ id: `rock-${i}`, side: 'neutral', type: 'rock', x: cell.x, y: cell.y, alive: true, startX: -1, startY: -1 });
  }

  return { size, pieces, terrain, turn: 'player', winner: null };
}
