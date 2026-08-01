import { afterEach, describe, expect, it } from 'vitest';
import { editorBoardToLevel } from '../core/levelBoard';
import type { Piece } from '../core/types';
import type { EditorBoard } from '../ui/boardCode';
import { tileFamilies } from '../art/tileset';
import { createSkirmish } from '../game/setup';
import { testLiveUnitCatalog } from '../test/liveUnitCatalog';
import { applyLiveUnitCatalog, resetLiveUnitCatalog } from '../ui/unitCatalog';
import type { PredrawnOcclusionDepthMap } from '@chess-tactics/board-render';
import {
  buildSkirmishBoard,
  commitSkirmishSceneFirstFrame,
  pieceRuntimeSpriteSources,
  pieceOp,
  sceneBoardForSkirmish,
  skirmishArmyOverlaySet,
  skirmishTileClickIntent,
  skirmishVisualTerrainCells,
} from './SkirmishBoard';

afterEach(() => resetLiveUnitCatalog());

const exactBoard = (): EditorBoard => {
  const grass0 = tileFamilies.grass[0].id;
  const grass3 = tileFamilies.grass[3].id;
  const stone2 = tileFamilies.stone[2].id;
  const water5 = tileFamilies.water[5].id;
  return {
    cols: 3,
    rows: 2,
    playerFaction: 'navy-blue',
    cells: {
      '0,0': grass0,
      '1,0': stone2,
      '2,0': grass3,
      '0,1': water5,
      '1,1': grass3,
      '2,1': grass0,
    },
    units: {},
    doodads: {},
    props: {},
    cover: {},
    features: {
      '1,0': { kind: 'road', material: 'cobble' },
      '1,1': { kind: 'road', material: 'cobble' },
    },
    featureCuts: {},
    featureExits: {},
    zones: {},
  };
};

describe('buildSkirmishBoard', () => {
  it('does not synthesize subterrain for generated gameplay perimeter faces', () => {
    const generated = createSkirmish({ seed: 1, size: { cols: 3, rows: 4 } });
    const game = {
      ...generated,
      terrain: Array.from({ length: 12 }, (_, index) => ({
        x: index % 3,
        y: Math.floor(index / 3),
        terrain: 'grass' as const,
        elevation: 0,
      })),
    };
    const board = buildSkirmishBoard(game, 1);
    expect(board.cells).toHaveLength(12);
    expect(board.cells.every((cell) => !('sideAssets' in cell))).toBe(true);
  });

  it('uses exact tile ids from saved boardCode instead of seed-picked variants', () => {
    const painted = exactBoard();
    const level = editorBoardToLevel(painted, { id: 'saved-map', name: 'Saved Map' });
    const game = createSkirmish({ seed: 1, level });

    expect(game.boardCode).toBe(level.boardCode);

    const boardA = buildSkirmishBoard(game, 11);
    const boardB = buildSkirmishBoard(game, 99999);

    for (const cell of boardA.cells) {
      const key = `${cell.x},${cell.y}`;
      expect(cell.asset?.id).toBe(painted.cells[key]);
      expect(boardB.cells.find((other) => other.x === cell.x && other.y === cell.y)?.asset?.id).toBe(painted.cells[key]);
    }
    expect(boardA.cells.find((cell) => cell.x === 1 && cell.y === 0)?.feature?.mask).toBe(4);
    expect(boardA.cells.find((cell) => cell.x === 1 && cell.y === 1)?.feature?.mask).toBe(1);
    expect(boardA.cells.every((cell) => !cell.groundCover)).toBe(true);
  });

  it('renders the complete authored visual scene without adding scenic gameplay cells', () => {
    const painted = exactBoard();
    const scenic: EditorBoard = {
      ...painted,
      decorativeApron: { top: 0, right: 1, bottom: 0, left: 0 },
      decorativeCells: { '3,0': tileFamilies.water[5].id },
      decorativeFeatures: { '3,0': { kind: 'road', material: 'cobble' } },
      decorativeFences: { '3,0|3,1': 'wood' },
      decorativeFencePosts: { '3,0': 'wood' },
      decorativeWalls: { '3,0|4,0': 'stone' },
      cover: { '3,0': 'sparse' },
      coverTypes: { '3,0': 'water' },
      doodads: { '3,0': { doodadId: 'retained-off-grid-doodad' } },
      props: { '3,1': { propId: 'retained-off-grid-prop' } },
    };
    const level = editorBoardToLevel(scenic, { id: 'scenic-map', name: 'Scenic Map' });
    const game = createSkirmish({ seed: 2, level });
    const board = buildSkirmishBoard(game, 2);
    const terrain = skirmishVisualTerrainCells(scenic)!;
    const scene = sceneBoardForSkirmish(game, board, scenic);

    expect(board.cells).toHaveLength(scenic.cols * scenic.rows);
    expect(board.cells.every((cell) => cell.x < scenic.cols && cell.y < scenic.rows)).toBe(true);
    expect(terrain).toHaveLength(scenic.cols * scenic.rows + scenic.rows);
    expect(terrain.find((cell) => cell.x === 3 && cell.y === 0)).toEqual(expect.objectContaining({
      topSrc: expect.stringMatching(/^\/api\/media\/[0-9a-f]{64}$/),
      featureSrc: expect.stringMatching(/^\/api\/media\/[0-9a-f]{64}$/),
      animate: false,
    }));
    expect(terrain.every((cell) => cell.animate === false)).toBe(true);
    expect(scene.decorativeApron).toEqual(scenic.decorativeApron);
    expect(scene.decorativeCells).toEqual(scenic.decorativeCells);
    expect(scene.decorativeFeatures).toEqual(scenic.decorativeFeatures);
    expect(scene.decorativeFences).toEqual(scenic.decorativeFences);
    expect(scene.decorativeFencePosts).toEqual(scenic.decorativeFencePosts);
    expect(scene.decorativeWalls).toEqual(scenic.decorativeWalls);
    expect(scene.doodads).toEqual(scenic.doodads);
    expect(scene.props?.['3,1']).toEqual(scenic.props?.['3,1']);
    expect(scene.cover['3,0']).toBe('sparse');
  });
});

describe('Skirmish scene immutable depth guard', () => {
  const depthMap: PredrawnOcclusionDepthMap = {
    src: '/api/background-versions/depth-v1/content',
    frameWidth: 320,
    frameHeight: 180,
    worldBounds: { minX: -40, minY: -20, width: 320, height: 180 },
  };

  it('rejects a mismatched persisted mask before compositing or acknowledging the scene', () => {
    let composites = 0;
    let acknowledgements = 0;
    const images = new Map([
      [depthMap.src, { naturalWidth: 320, naturalHeight: 179 }],
    ]);

    expect(() => commitSkirmishSceneFirstFrame(
      depthMap,
      images,
      () => { composites += 1; },
      () => { acknowledgements += 1; },
    )).toThrow(/expected 320×180, decoded 320×179/);
    expect(composites).toBe(0);
    expect(acknowledgements).toBe(0);
  });

  it('composites and acknowledges a persisted mask with the exact selected surface dimensions', () => {
    let composites = 0;
    let acknowledgements = 0;
    const images = new Map([
      [depthMap.src, { naturalWidth: 320, naturalHeight: 180 }],
    ]);

    expect(() => commitSkirmishSceneFirstFrame(
      depthMap,
      images,
      () => { composites += 1; },
      () => { acknowledgements += 1; },
    )).not.toThrow();
    expect(composites).toBe(1);
    expect(acknowledgements).toBe(1);
  });
});

describe('pieceOp', () => {
  it('warms one persistent eight-direction resource set regardless of a unit move or facing', () => {
    applyLiveUnitCatalog(testLiveUnitCatalog());
    const before: Piece = {
      id: 'pawn-1',
      side: 'player',
      type: 'pawn',
      x: 0,
      y: 1,
      startY: 1,
      facing: 'north',
      alive: true,
    };
    const after: Piece = { ...before, x: 1, y: 0, facing: 'north-east' };

    expect(pieceRuntimeSpriteSources(before)).toHaveLength(8);
    expect(pieceRuntimeSpriteSources(after)).toEqual(pieceRuntimeSpriteSources(before));
  });

  it.each(['rock', 'random-rock'] as const)('renders %s obstacle art without live unit metadata', (type) => {
    const rock: Piece = { id: `${type}-1`, side: 'neutral', type, x: 0, y: 0, startY: 0, alive: true };
    const op = pieceOp(rock, { left: 36, top: 86 * 0.78 });

    expect(op?.src).toMatch(/^\/api\/media\/[0-9a-f]{64}$/);
    expect(op?.layer).toBe('scene');
    expect(op?.dx).toBe(0);
    expect(op?.dy).toBe(0);
  });

  it('paints accepted native art at its exact authored dimensions', () => {
    const catalog = testLiveUnitCatalog({ scales: { pawn: 66 }, nativeScales: { pawn: 66 } });
    const pawnAsset = catalog.assets.find((asset) => asset.family === 'pawn')!;
    pawnAsset.footprint.sourceCanvasWidth = 51;
    pawnAsset.footprint.sourceCanvasHeight = 61;
    pawnAsset.footprint.sourceFootprintPx = 15;
    applyLiveUnitCatalog(catalog);
    const pawn: Piece = { id: 'pawn-1', side: 'player', type: 'pawn', x: 0, y: 0, startY: 0, alive: true };

    const op = pieceOp(pawn, { left: 36, top: 70 });

    expect(op?.dw).toBe(51);
    expect(op?.dh).toBe(61);
  });
});

describe('skirmishTileClickIntent', () => {
  it('clears the current selection when the player clicks an unrelated board tile', () => {
    expect(skirmishTileClickIntent(4, 3, [{ x: 2, y: 2 }], undefined, 'player')).toEqual({
      kind: 'clear-selection',
    });

    expect(skirmishTileClickIntent(4, 3, [{ x: 2, y: 2 }], { id: 'rock-1', side: 'neutral' }, 'player')).toEqual({
      kind: 'clear-selection',
    });
  });

  it.each([
    ['player', 'enemy'],
    ['enemy', 'player'],
  ] as const)('keeps moves, own-side selection, and opponent focus ahead of cancellation for the %s seat', (localSide, opponent) => {
    expect(skirmishTileClickIntent(2, 2, [{ x: 2, y: 2 }], { id: 'opponent-1', side: opponent }, localSide)).toEqual({ kind: 'move' });
    expect(skirmishTileClickIntent(1, 1, [], { id: 'own-2', side: localSide }, localSide)).toEqual({
      kind: 'select',
      pieceId: 'own-2',
    });
    expect(skirmishTileClickIntent(6, 6, [], { id: 'opponent-1', side: opponent }, localSide)).toEqual({
      kind: 'focus',
      pieceId: 'opponent-1',
    });
  });
});

describe('skirmishArmyOverlaySet', () => {
  const pieces: Piece[] = [
    { id: 'player-rook', side: 'player', type: 'rook', x: 1, y: 2, startY: 2, alive: true },
    { id: 'enemy-rook', side: 'enemy', type: 'rook', x: 6, y: 5, startY: 5, alive: true },
  ];

  it.each([
    ['player', 'enemy', '1,2', '6,5'],
    ['enemy', 'player', '6,5', '1,2'],
  ] as const)('keeps Your/Opponent overlay ownership correct for the %s seat', (localSide, opponent, ownCell, opponentCell) => {
    const own = skirmishArmyOverlaySet(pieces, localSide, (piece) => [{ x: piece.x, y: piece.y }]);
    const remote = skirmishArmyOverlaySet(pieces, opponent, (piece) => [{ x: piece.x, y: piece.y }]);

    expect([...own]).toEqual([ownCell]);
    expect([...remote]).toEqual([opponentCell]);
  });
});
