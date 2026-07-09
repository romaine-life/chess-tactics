// Deterministic skirmish assembly: builds the initial GameState (player party,
// enemy force, scattered rocks) from a seed. Pure — no DOM, no Math.random.
// Replaces the legacy startGame() placement with a seeded, testable version.

import type { BoardSize, GameState, Piece, PieceType, Side, TerrainCell, TerrainType } from '../core/types';
import type { Level, TimeControl } from '../core/level';
import { createRng, type Rng } from '../core/rng';
import { isPassableTerrain } from '../core/terrain';
import { tileAssets, tileFamilies } from '../art/tileset';
import { generateSocketBoard } from '../core/tileBoardGenerator';
import type { TileFamilyId } from '../core/tileSockets';
import { PLAYABLE_PIECE_TYPES, defaultFacingForSide } from '../core/pieces';
import { propCells, propDef } from '../core/props';
import { castleRulesForLevel, drawRulesForLevel, promotionRulesForLevel, spawnEventsForLevel, zoneCellsByIds } from '../core/levelEvents';
import { recordPosition } from '../core/rules';

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
  /** Enemy decision policy (consumed by the store, not by setup): 'search' is the
   * objective-aware search AI; 'greedy' keeps the legacy policy as an A/B lever. */
  ai?: 'search' | 'greedy';
  /** Battle clock for a FREE skirmish (consumed by the store, not by setup). A
   * TimeControl arms the player's clock; `null` forces an untimed game; omitting it
   * lets the store fall back to the level's authored control, or — for a free
   * skirmish with no level — the 5:00 default (DEFAULT_TIME_CONTROL). */
  timeControl?: TimeControl | null;
}

function pawnForwardFields(type: PieceType, facing: Piece['facing']): Pick<Piece, 'pawnForward'> {
  return type === 'pawn' && facing ? { pawnForward: facing } : {};
}

/** Build the initial GameState for an authored level. Exported for headless
 * self-play (game/selfplay.ts) — the store path reaches it via createSkirmish. */
export function createFromLevel(level: Level, seed: number): GameState {
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
      palette: unit.palette,
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

  // Setup spawn events: zones are dumb named tile groups; the event says which side and
  // roster to deal onto which zone ids. Legacy random-placement levels are expanded into
  // equivalent spawn events by spawnEventsForLevel, so old content still plays.
  const spawnEvents = spawnEventsForLevel(level);
  if (spawnEvents.length > 0) {
    const rng = createRng(seed);
    const taken = new Set(occupied);
    for (const c of level.layers.terrain) if (!isPassableTerrain(c.terrain)) taken.add(`${c.x},${c.y}`);
    const nextId = (() => {
      const counts = new Map<string, number>();
      return (side: 'player' | 'enemy', type: PieceType): string => {
        const prefix = `spawn-${side}-${type}`;
        const count = counts.get(prefix) ?? 0;
        counts.set(prefix, count + 1);
        return `${prefix}-${count}`;
      };
    })();
    for (const event of spawnEvents) {
      const free: Array<{ x: number; y: number }> = [];
      for (const cell of zoneCellsByIds(level, event.zoneIds)) {
        const k = `${cell.x},${cell.y}`;
        if (taken.has(k)) continue;
        free.push(cell);
      }
      const roster = event.roster ?? {};
      // Iterate piece types in the canonical order, never Object.keys — object key order
      // is authoring-insertion order, which would silently change the deal between two
      // otherwise identical levels. Same seed must always mean the same layout.
      for (const type of PLAYABLE_PIECE_TYPES) {
        const count = roster[type] ?? 0;
        for (let i = 0; i < count && free.length; i += 1) {
          const cell = free.splice(rng.int(free.length), 1)[0];
          taken.add(`${cell.x},${cell.y}`);
          pieces.push({
            id: nextId(event.side, type),
            side: event.side,
            type,
            x: cell.x,
            y: cell.y,
            facing: defaultFacingForSide(event.side),
            alive: true,
            // The dealt cell is the piece's home rank, so a dealt pawn keeps its
            // double-step — matching the free-skirmish spawn behavior.
            startX: cell.x,
            startY: cell.y,
            ...pawnForwardFields(type, defaultFacingForSide(event.side)),
          });
        }
      }
    }
  }

  const promotionRules = promotionRulesForLevel(level);
  const promotionZones = promotionRules.flatMap((rule) => rule.cells);
  const castleRules = castleRulesForLevel(level);
  const drawRules = drawRulesForLevel(level);

  const state: GameState = {
    size: { cols: level.board.cols, rows: level.board.rows },
    pieces,
    terrain: level.layers.terrain,
    // Edge fences the game blocks crossing (knights hop). Undefined when the level has none, so a
    // fence-free level's movement is byte-identical to before (see MoveEnv.fences in the store).
    fences: level.layers.fences && level.layers.fences.length ? level.layers.fences : undefined,
    boardCode: level.boardCode,
    // The render channel: the board draws the tall prop sprite from this list, while the
    // colliders above do the blocking. Defaults to [] so a prop-free level stays prop-free.
    props,
    promotionZones: promotionZones.length ? promotionZones : undefined,
    promotionRules: promotionRules.length ? promotionRules : undefined,
    castleRules: castleRules.length ? castleRules : undefined,
    drawRules,
    turn: 'player',
    winner: null,
  };
  // Threefold counts the STARTING position as its first occurrence (a no-op without
  // the threefold rule, so every other level's initial state is unchanged).
  return recordPosition(state);
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
