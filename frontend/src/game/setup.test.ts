import { describe, it, expect } from 'vitest';
import { createSkirmish } from './setup';
import { legalMoves, livingPieces } from '../core/rules';
import { isPassableTerrain } from '../core/terrain';
import { createBlankLevel, type Level } from '../core/level';
import { tileAssets, tileFamilies } from '../art/tileset';
import { solveSocketBoard } from '../core/tileBoardGenerator';
import type { TerrainType } from '../core/types';
import type { TileFamilyId } from '../core/tileSockets';

const terrainToFamily: Record<Exclude<TerrainType, 'void'>, TileFamilyId> = {
  grass: 'grass',
  road: 'stone',
  stone: 'stone',
  bridge: 'stone',
  cliff: 'stone',
  rock: 'stone',
  water: 'water',
  dirt: 'dirt',
  pebble: 'pebble',
  sand: 'sand',
};
const hasMove = (moves: ReadonlyArray<{ x: number; y: number }>, x: number, y: number): boolean =>
  moves.some((move) => move.x === x && move.y === y);

describe('createSkirmish', () => {
  it('is deterministic for a given seed', () => {
    expect(createSkirmish({ seed: 42 })).toEqual(createSkirmish({ seed: 42 }));
  });
  it('differs across seeds', () => {
    const a = JSON.stringify(createSkirmish({ seed: 1 }).pieces.map((p) => [p.x, p.y]));
    const b = JSON.stringify(createSkirmish({ seed: 2 }).pieces.map((p) => [p.x, p.y]));
    expect(a).not.toBe(b);
  });
  it('fields the player party + a pawn, three enemies, and 3-6 rocks', () => {
    const s = createSkirmish({ seed: 7, party: ['knight', 'bishop'] });
    expect(livingPieces(s.pieces, 'player')).toHaveLength(3);
    expect(livingPieces(s.pieces, 'enemy')).toHaveLength(3);
    const rocks = s.pieces.filter((p) => p.type === 'rock');
    expect(rocks.length).toBeGreaterThanOrEqual(3);
    expect(rocks.length).toBeLessThanOrEqual(6);
    expect(s.turn).toBe('player');
    expect(s.winner).toBeNull();
  });
  it('places every piece in-bounds with no overlaps', () => {
    const s = createSkirmish({ seed: 99 });
    const seen = new Set<string>();
    for (const p of s.pieces) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(s.size.cols);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(s.size.rows);
      const key = `${p.x},${p.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
  it('spawns players near the bottom and enemies near the top', () => {
    const s = createSkirmish({ seed: 5 });
    for (const p of livingPieces(s.pieces, 'player')) expect(p.y).toBeGreaterThanOrEqual(s.size.rows - 2);
    for (const p of livingPieces(s.pieces, 'enemy')) expect(p.y).toBeLessThanOrEqual(1);
  });

  it('spawns opposing sides facing each other across the board', () => {
    const s = createSkirmish({ seed: 5 });
    for (const p of livingPieces(s.pieces, 'player')) expect(p.facing).toBe('north');
    for (const p of livingPieces(s.pieces, 'enemy')) expect(p.facing).toBe('south');
  });

  it('marks spawned pawns as being on their home rank', () => {
    for (const seed of [1, 2, 5, 7, 13, 42, 99]) {
      const s = createSkirmish({ seed });
      for (const pawn of s.pieces.filter((p) => p.type === 'pawn')) {
        expect(pawn.startY).toBe(pawn.y);
      }
    }
  });

  it('authors a full terrain grid (one cell per tile)', () => {
    const s = createSkirmish({ seed: 7 });
    expect(s.terrain).toBeDefined();
    expect(s.terrain).toHaveLength(s.size.cols * s.size.rows);
    const keys = new Set(s.terrain!.map((c) => `${c.x},${c.y}`));
    expect(keys.size).toBe(s.size.cols * s.size.rows); // no duplicate/missing tiles
    for (const c of s.terrain!) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(s.size.cols);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(s.size.rows);
    }
  });

  it('never spawns a piece on impassable terrain', () => {
    for (const seed of [1, 2, 7, 42, 99]) {
      const s = createSkirmish({ seed });
      const impassable = new Set(
        s.terrain!.filter((c) => !isPassableTerrain(c.terrain)).map((c) => `${c.x},${c.y}`),
      );
      for (const p of s.pieces) expect(impassable.has(`${p.x},${p.y}`)).toBe(false);
    }
  });

  it('authors terrain that resolves to a legal socket board', () => {
    for (const seed of [1, 7, 13, 42, 99]) {
      const s = createSkirmish({ seed });
      const terrainMap = s.terrain!.map((cell) => cell.terrain === 'void' ? 'grass' : terrainToFamily[cell.terrain]);
      const board = solveSocketBoard({
        assets: tileAssets,
        terrainMap,
        seed,
        columns: s.size.cols,
        rows: s.size.rows,
        familyAssets: tileFamilies,
      });
      expect(board.stats.illegalEdges).toBe(0);
      expect(board.stats.missingPlacements).toBe(0);
    }
  });
});

// ADR-0050 random placement: a level with placement 'random' deals its roster onto
// seeded-random free cells of the pooled spawn zones instead of reading layers.units.
describe('createFromLevel — random placement', () => {
  const PLAYER_TILES: Array<[number, number]> = [[0, 7], [1, 7], [2, 7], [3, 7], [0, 6], [1, 6], [2, 6], [3, 6]];
  const ENEMY_TILES: Array<[number, number]> = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0]];

  function randomLevel(mutate?: (level: Level) => void): Level {
    const level = createBlankLevel('rl', 'Random', 8, 8);
    level.placement = 'random';
    level.roster = { player: { pawn: 2, knight: 1 }, enemy: { king: 1, pawn: 1 } };
    level.layers.zones = [
      { id: 'ps', type: 'player-spawn', tiles: PLAYER_TILES },
      { id: 'es', type: 'enemy-spawn', tiles: ENEMY_TILES },
    ];
    mutate?.(level);
    return level;
  }

  const tileSet = (tiles: Array<[number, number]>) => new Set(tiles.map(([x, y]) => `${x},${y}`));

  it('is deterministic: the same seed deals the identical layout', () => {
    expect(createSkirmish({ seed: 11, level: randomLevel() })).toEqual(createSkirmish({ seed: 11, level: randomLevel() }));
  });

  it('reshuffles across seeds (the point of the mode: restart = new deal)', () => {
    const layout = (seed: number) =>
      JSON.stringify(createSkirmish({ seed, level: randomLevel() }).pieces.map((p) => [p.id, p.x, p.y]));
    expect(layout(1)).not.toBe(layout(2));
  });

  it('fields exactly the roster, each side only on its own spawn tiles', () => {
    const game = createSkirmish({ seed: 3, level: randomLevel() });
    const players = livingPieces(game.pieces, 'player');
    const enemies = livingPieces(game.pieces, 'enemy');
    expect(players.map((p) => p.type).sort()).toEqual(['knight', 'pawn', 'pawn']);
    expect(enemies.map((p) => p.type).sort()).toEqual(['king', 'pawn']);
    const playerPool = tileSet(PLAYER_TILES);
    const enemyPool = tileSet(ENEMY_TILES);
    for (const p of players) expect(playerPool.has(`${p.x},${p.y}`)).toBe(true);
    for (const e of enemies) expect(enemyPool.has(`${e.x},${e.y}`)).toBe(true);
    // No two pieces share a cell.
    const cells = game.pieces.map((p) => `${p.x},${p.y}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('dealt pieces get unique ids, default facing and startY = their spawn row (pawn double-step)', () => {
    const game = createSkirmish({ seed: 3, level: randomLevel() });
    const ids = game.pieces.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of livingPieces(game.pieces, 'player')) {
      expect(p.facing).toBe('north');
      expect(p.startY).toBe(p.y);
    }
    for (const e of livingPieces(game.pieces, 'enemy')) {
      expect(e.facing).toBe('south');
      expect(e.startY).toBe(e.y);
    }
  });

  it('never deals onto impassable terrain inside the pool', () => {
    const level = randomLevel((l) => {
      // Rock out two of the player pool tiles; the deal must route around them.
      for (const c of l.layers.terrain) {
        if ((c.x === 0 && c.y === 7) || (c.x === 1 && c.y === 7)) c.terrain = 'rock';
      }
    });
    for (const seed of [1, 2, 3, 4, 5]) {
      const game = createSkirmish({ seed, level });
      for (const p of livingPieces(game.pieces, 'player')) {
        expect(`${p.x},${p.y}`).not.toBe('0,7');
        expect(`${p.x},${p.y}`).not.toBe('1,7');
      }
    }
  });

  it('never deals inside a blocking-prop footprint (colliders were stamped first)', () => {
    const level = randomLevel((l) => {
      // 2×2 oak anchored at (0,6) covers (0,6),(1,6),(0,7),(1,7) — four pool tiles.
      l.layers.props = [{ x: 0, y: 6, propId: 'oak' }];
    });
    const blocked = new Set(['0,6', '1,6', '0,7', '1,7']);
    for (const seed of [1, 2, 3, 4, 5]) {
      const game = createSkirmish({ seed, level });
      // The colliders themselves sit on the footprint…
      expect(game.pieces.filter((p) => p.id.startsWith('prop-oak-'))).toHaveLength(4);
      // …and no dealt piece shares a cell with them.
      for (const p of livingPieces(game.pieces, 'player')) {
        expect(blocked.has(`${p.x},${p.y}`)).toBe(false);
      }
    }
  });

  it('fixed placement (absent field) still reads authored unit positions verbatim', () => {
    const level = createBlankLevel('fx', 'Fixed', 8, 8);
    level.layers.units = [
      { x: 2, y: 6, type: 'knight', side: 'player' },
      { x: 5, y: 1, type: 'king', side: 'enemy' },
    ];
    const game = createSkirmish({ seed: 9, level });
    expect(game.pieces.map((p) => [p.type, p.x, p.y])).toEqual([
      ['knight', 2, 6],
      ['king', 5, 1],
    ]);
  });

  it('fixed placement gives pawns their double-step from the authored starting row', () => {
    const level = createBlankLevel('fx-pawns', 'Fixed Pawns', 8, 8);
    level.layers.units = [
      { x: 2, y: 6, type: 'pawn', side: 'player' },
      { x: 5, y: 1, type: 'pawn', side: 'enemy' },
      { x: 0, y: 4, type: 'pawn', side: 'player' },
    ];

    const game = createSkirmish({ seed: 9, level });
    const playerHome = game.pieces.find((p) => p.side === 'player' && p.x === 2)!;
    const enemyHome = game.pieces.find((p) => p.side === 'enemy')!;
    const advanced = game.pieces.find((p) => p.side === 'player' && p.x === 0)!;

    expect(playerHome.startX).toBe(2);
    expect(playerHome.startY).toBe(6);
    expect(hasMove(legalMoves(playerHome, game.pieces, game.size), 2, 4)).toBe(true);
    expect(enemyHome.startX).toBe(5);
    expect(enemyHome.startY).toBe(1);
    expect(hasMove(legalMoves(enemyHome, game.pieces, game.size), 5, 3)).toBe(true);
    expect(advanced.startX).toBe(0);
    expect(advanced.startY).toBe(4);
    expect(hasMove(legalMoves(advanced, game.pieces, game.size), 0, 2)).toBe(true);
  });

  it('fixed placement uses the authored pawn facing as immutable forward', () => {
    const level = createBlankLevel('fx-facing-pawn', 'Fixed Pawn Facing', 8, 8);
    level.layers.units = [
      { x: 2, y: 4, type: 'pawn', side: 'player', facing: 'east' },
      { x: 6, y: 4, type: 'king', side: 'enemy' },
    ];

    const game = createSkirmish({ seed: 9, level });
    const pawn = game.pieces.find((p) => p.type === 'pawn')!;
    expect(pawn.facing).toBe('east');
    expect(pawn.pawnForward).toBe('east');
    expect(hasMove(legalMoves(pawn, game.pieces, game.size), 3, 4)).toBe(true);
    expect(hasMove(legalMoves(pawn, game.pieces, game.size), 4, 4)).toBe(true);
    expect(hasMove(legalMoves(pawn, game.pieces, game.size), 2, 3)).toBe(false);
  });
});
