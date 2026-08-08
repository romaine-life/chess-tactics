import { afterEach, describe, expect, it } from 'vitest';
import { editorBoardToLevel } from '../core/levelBoard';
import type { Piece } from '../core/types';
import type { EditorBoard } from '../ui/boardCode';
import { tileFamilies } from '../art/tileset';
import { createSkirmish } from '../game/setup';
import { testLiveUnitCatalog } from '../test/liveUnitCatalog';
import { applyLiveUnitCatalog, resetLiveUnitCatalog } from '../ui/unitCatalog';
import type { BoardDrawOp, PredrawnOcclusionDepthMap } from '@chess-tactics/board-render';
import {
  arrivalOffset,
  arrivingStructures,
  buildSkirmishBoard,
  commitSkirmishSceneFirstFrame,
  computeArrivalDelays,
  computeStructureArrivalDelays,
  newlyVisibleArrivalPieces,
  structureArrivalOp,
  structureArrives,
  pieceRuntimeSpriteSources,
  pieceOp,
  sceneBoardForSkirmish,
  skirmishArmyOverlaySet,
  skirmishTileClickIntent,
  skirmishVisualTerrainCells,
  unitArrivalPlan,
  unitDepartureDestination,
  unitDeparturePose,
  unitDepartureTrack,
} from './SkirmishBoard';

afterEach(() => resetLiveUnitCatalog());

describe('retained-board unit arrivals', () => {
  const pieces: Piece[] = [
    { id: 'placed-king', side: 'player', type: 'king', x: 0, y: 4, startY: 4, alive: true },
    { id: 'new-pawn', side: 'player', type: 'pawn', x: 1, y: 4, startY: 4, alive: true },
    { id: 'new-enemy', side: 'enemy', type: 'rook', x: 4, y: 0, startY: 0, alive: true },
    { id: 'scenery', side: 'neutral', type: 'rock', x: 2, y: 2, startY: 2, alive: true },
  ];

  it('animates only units newly introduced to an already-visible battlefield', () => {
    const additions = newlyVisibleArrivalPieces(new Set(['placed-king']), pieces);

    expect(additions.map((piece) => piece.id)).toEqual(['new-pawn', 'new-enemy']);
    expect([...computeArrivalDelays(additions, 0)]).toEqual([
      ['new-pawn', 0],
      ['new-enemy', 240],
    ]);
  });

  it('treats a removed and later reintroduced unit as a new arrival', () => {
    const visible = new Set(['placed-king', 'new-pawn']);
    visible.delete('new-pawn');

    expect(newlyVisibleArrivalPieces(visible, [pieces[1]]).map((piece) => piece.id)).toEqual(['new-pawn']);
  });

  // A battlefield is revealed during its scene entrance but activated only when that entrance
  // completes. A unit staged for arrival must therefore already be OFF the board while it waits,
  // or the reveal shows the whole army seated and the entrance then takes it away again.
  it('holds a staged unit off the board until its entrance is released', () => {
    expect(arrivalOffset(1_000, { startMs: null, delayMs: 400 })).toEqual({ dx: 0, dy: -60, opacity: 0 });
  });

  it('seats a unit that has no entrance to play', () => {
    expect(arrivalOffset(1_000, undefined)).toEqual({ dx: 0, dy: 0, opacity: 1 });
  });

  it('gives a terminal review no arrival plan, so its existing position stays seated', () => {
    expect(unitArrivalPlan('settled', 1_000, 400)).toBeUndefined();
    expect(arrivalOffset(1_000, unitArrivalPlan('settled', 1_000, 400))).toEqual({ dx: 0, dy: 0, opacity: 1 });
  });

  it('keeps ordinary entrances staged until activation and releases them afterward', () => {
    expect(unitArrivalPlan('pending', 1_000, 400)).toEqual({ startMs: null, delayMs: 400 });
    expect(unitArrivalPlan('active', 1_000, 400)).toEqual({ startMs: 1_000, delayMs: 400 });
  });

  it('runs a released entrance from off the board down to its seat', () => {
    const plan = { startMs: 1_000, delayMs: 400 };

    expect(arrivalOffset(1_200, plan)).toEqual({ dx: 0, dy: -60, opacity: 0 });
    expect(arrivalOffset(1_400, plan).opacity).toBe(0);
    expect(arrivalOffset(1_650, plan)).toEqual({ dx: 0, dy: -60, opacity: 1 });
    expect(arrivalOffset(2_400, plan)).toEqual({ dx: 0, dy: 0, opacity: 1 });
  });

  it('summons onto off-board seats and waits for the final drop before sliding', () => {
    const early = {
      startMs: 1_000,
      delayMs: 0,
      summonWaveDelayMs: 100,
      startOffset: { dx: 240, dy: 135 },
    };
    const last = { ...early, delayMs: 100 };

    expect(arrivalOffset(1_000, early, 'slide-from-right')).toEqual({ dx: 240, dy: 75, opacity: 0 });
    expect(arrivalOffset(1_000, last, 'slide-from-right')).toEqual({ dx: 240, dy: 75, opacity: 0 });
    expect(arrivalOffset(1_200, early, 'slide-from-right')).toEqual({ dx: 240, dy: 75, opacity: 1 });
    expect(arrivalOffset(1_200, last, 'slide-from-right').opacity).toBeGreaterThan(0);
    expect(arrivalOffset(1_550, early, 'slide-from-right')).toEqual({ dx: 240, dy: 135, opacity: 1 });
    expect(arrivalOffset(1_550, last, 'slide-from-right').dy).toBeLessThan(135);
    expect(arrivalOffset(1_720, early, 'slide-from-right')).toEqual({ dx: 240, dy: 135, opacity: 1 });
    expect(arrivalOffset(1_720, last, 'slide-from-right')).toEqual({ dx: 240, dy: 135, opacity: 1 });
    const sliding = arrivalOffset(2_000, early, 'slide-from-right');
    expect(sliding.dx).toBeGreaterThan(0);
    expect(sliding.dx).toBeLessThan(240);
    expect(sliding.dy).toBeGreaterThan(0);
    expect(sliding.dy).toBeLessThan(135);
    expect(sliding.opacity).toBe(1);
    expect(arrivalOffset(2_280, early, 'slide-from-right')).toEqual({ dx: 0, dy: 0, opacity: 1 });
  });
});

describe('board-assembly structure arrivals', () => {
  const structureOp = (
    key: string,
    kind: 'rock' | 'tree' | 'house',
    x: number,
    y: number,
    half: 'back' | 'front',
  ): BoardDrawOp => ({
    layer: 'scene',
    src: `${key}-${half}`,
    dx: 10,
    dy: half === 'back' ? 20 : 44,
    dw: 40,
    dh: 45,
    z: half === 'back' ? 1 : 2,
    structure: { key, kind, x, y },
  });

  it('admits rocks to the assembly and leaves other props as standing scenery', () => {
    expect(structureArrives({ key: '1,1', kind: 'rock', x: 1, y: 1 })).toBe(true);
    expect(structureArrives({ key: '2,2', kind: 'tree', x: 2, y: 2 })).toBe(false);
    expect(structureArrives({ key: '3,3', kind: 'house', x: 3, y: 3 })).toBe(false);
  });

  // A prop draws several ops (two depth halves per authored part). The choreography is keyed by
  // anchor, so a five-op prop still gets exactly one entrance rather than five staggered ones.
  it('collapses a prop\'s several draw ops into one arriving anchor', () => {
    const ops = [
      structureOp('4,2', 'rock', 4, 2, 'back'),
      structureOp('4,2', 'rock', 4, 2, 'front'),
      structureOp('1,1', 'tree', 1, 1, 'back'),
      { src: 'terrain', dx: 0, dy: 0, dw: 1, dh: 1, z: 0 } satisfies BoardDrawOp,
    ];

    expect([...arrivingStructures(ops).keys()]).toEqual(['4,2']);
  });

  it('lands the far corner first so the position lays itself down toward the player', () => {
    const delays = computeStructureArrivalDelays([
      { key: '5,4', kind: 'rock', x: 5, y: 4 },
      { key: '0,1', kind: 'rock', x: 0, y: 1 },
      { key: '2,2', kind: 'rock', x: 2, y: 2 },
    ], 0);

    expect([...delays]).toEqual([['0,1', 0], ['2,2', 55], ['5,4', 110]]);
  });

  // Both halves of a flat-contact prop must take the SAME offset, or the clipped top and bottom
  // of one rock separate in mid-air.
  it('moves every op of one prop by the same offset', () => {
    const plan = { startMs: 1_000, delayMs: 0 };
    const back = structureArrivalOp(structureOp('4,2', 'rock', 4, 2, 'back'), plan, 1_100);
    const front = structureArrivalOp(structureOp('4,2', 'rock', 4, 2, 'front'), plan, 1_100);

    expect(back.dy - 20).toBe(front.dy - 44);
    expect(back.dy).toBeLessThan(20);
  });

  it('holds a staged prop off the board and seats an unplanned one untouched', () => {
    const op = structureOp('4,2', 'rock', 4, 2, 'front');

    expect(structureArrivalOp(op, { startMs: null, delayMs: 0 }, 1_000)).toMatchObject({ dy: -16, opacity: 0 });
    expect(structureArrivalOp(op, undefined, 1_000)).toBe(op);
  });

  it('returns the op unchanged once its entrance has finished', () => {
    const op = structureOp('4,2', 'rock', 4, 2, 'front');

    expect(structureArrivalOp(op, { startMs: 1_000, delayMs: 0 }, 3_000)).toBe(op);
  });
});

describe('closed unit-departure tracks', () => {
  const player: Piece = { id: 'player-rook', side: 'player', type: 'rook', x: 2, y: 4, startY: 6, alive: true };
  const enemy: Piece = { id: 'enemy-bishop', side: 'enemy', type: 'bishop', x: 5, y: 3, startY: 1, alive: true };
  const board = { cols: 8, rows: 8 };

  it('defaults a deployment reroll to each side withdrawing through its home edge', () => {
    const track = unitDepartureTrack({ id: 'reroll-1', reason: 'deployment-reroll' });

    expect(track).toBe('withdraw-home');
    expect(unitDepartureDestination(player, board, track)).toMatchObject({ facing: 'south' });
    expect(unitDepartureDestination(enemy, board, track)).toMatchObject({ facing: 'north' });
  });

  it('keeps the unit visible while it travels and fades only after clearing the edge', () => {
    const plan = {
      requestId: 'reroll-1',
      track: 'withdraw-home' as const,
      startMs: 1_000,
      delayMs: 100,
      durationMs: 800,
      startLeft: 10,
      startTop: 20,
      endLeft: 110,
      endTop: 220,
      startOpacity: 1,
      facing: 'south' as const,
    };

    expect(unitDeparturePose(1_050, plan)).toEqual({ left: 10, top: 20, opacity: 1, active: true });
    expect(unitDeparturePose(1_500, plan).opacity).toBe(1);
    expect(unitDeparturePose(1_900, plan)).toEqual({ left: 110, top: 220, opacity: 0, active: false });
  });
});

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
