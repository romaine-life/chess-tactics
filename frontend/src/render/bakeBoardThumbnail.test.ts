import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import {
  BAKE_GEOMETRY,
  boardContentHash,
  boardDrawOps,
  uniqueDrawSrcs,
  boardBounds,
  boardSocialFramingBounds,
  drawBoardThumbnailOps,
  largestSolidRect,
  paintBoardThumbnailOp,
} from './bakeBoardThumbnail';
import { roadEdgeKey } from '../core/featureAutotile';
import { TILE_TEMPLATE } from '../art/tileTemplate';
import { fenceOverlayZIndex, wallArtOverlayZIndex, wallOverlayZIndex } from './fenceOverlayDepth';
import { CELL_DEPTH_STRIDE, fencePostZIndex, objectBaseZIndex, structureBackZIndex } from './sceneDepth';
import type { EditorBoard } from '../ui/boardCode';
import { applyLiveUnitCatalog, resetLiveUnitCatalog } from '../ui/unitCatalog';
import { testLiveUnitCatalog } from '../test/liveUnitCatalog';
import {
  applyLiveMediaCatalog,
  groundCoverSet,
  resetDrawableCatalog,
  resetPropSeats,
  resetLiveMediaCatalog,
  wallDecorAsset,
  withoutBoardDrawLayers,
  type BoardDrawOp,
} from '@chess-tactics/board-render';
import { testGroundCoverCatalog, testStructureMediaSlots, testWallDecorMediaSlots } from '../test/liveMediaCatalog';
import { applyTestPropSeats } from '../test/livePropSeats';
import { applyTestDrawableCatalog } from '../test/drawableCatalog';
import { featureFrameSrc, fenceFrameSrc, fencePostSrc, wallFrameSrc } from '../art/tileset';
import { tileFamilies } from '../art/tileset';
import { subterrainMaterialSrc } from '@chess-tactics/board-render';
import { structureArtHalfSrc } from '../core/structureArt';
import { macroTileAsset } from '../core/macroTiles';

beforeAll(() => {
  applyLiveUnitCatalog(testLiveUnitCatalog());
  applyLiveMediaCatalog(testGroundCoverCatalog([...testStructureMediaSlots(), ...testWallDecorMediaSlots()]));
  applyTestDrawableCatalog();
  applyTestPropSeats();
});
afterAll(() => {
  resetPropSeats();
  resetLiveUnitCatalog();
  resetLiveMediaCatalog();
  resetDrawableCatalog();
});

// Coverage (opaque fraction) of a rect under an opacity predicate — the property object-fit:cover
// relies on: a crop that's ~fully opaque cannot show a transparent corner as sky.
function coverage(isOpaque: (x: number, y: number) => boolean, r: { x: number; y: number; w: number; h: number }): number {
  let opaque = 0;
  for (let y = r.y; y < r.y + r.h; y += 1) for (let x = r.x; x < r.x + r.w; x += 1) if (isOpaque(x, y)) opaque += 1;
  return opaque / (r.w * r.h);
}

// No real <canvas> (jsdom has none): draw-op composition uses a recording context, while the
// remaining coverage exercises content hashes, image-src dedup, and bounds/scale math. Actual
// browser rasterisation (drawImage/toBlob) remains browser-only.

const blank = (cols = 4, rows = 4): EditorBoard => ({
  cols, rows, cells: {}, units: {}, doodads: {}, props: {}, cover: {}, features: {}, featureCuts: {}, featureExits: {},
});

// Real registry ids so boardDrawOps actually emits ops (tile family `grass-surf-0`, a
// production unit, a doodad).
const TILE = 'grass-surf-0';
const UNIT = { unitId: 'rook', direction: 'south', faction: 'navy-blue' };
const grassCoverSources = (): Set<string> => new Set(groundCoverSet('grass')!.variants.map((variant) => variant.src));

type CanvasCall = { name: string; args: unknown[]; alpha: number };

function recordingContext(initialAlpha = 1): { ctx: CanvasRenderingContext2D; calls: CanvasCall[] } {
  const calls: CanvasCall[] = [];
  let alpha = initialAlpha;
  const record = (name: string, ...args: unknown[]): void => { calls.push({ name, args, alpha }); };
  const ctx = {
    get globalAlpha() { return alpha; },
    set globalAlpha(value: number) { alpha = value; record('globalAlpha', value); },
    imageSmoothingEnabled: true,
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
    clearRect: (...args: unknown[]) => record('clearRect', ...args),
    save: () => record('save'),
    restore: () => record('restore'),
    beginPath: () => record('beginPath'),
    moveTo: (...args: unknown[]) => record('moveTo', ...args),
    lineTo: (...args: unknown[]) => record('lineTo', ...args),
    closePath: () => record('closePath'),
    clip: () => record('clip'),
    translate: (...args: unknown[]) => record('translate', ...args),
    scale: (...args: unknown[]) => record('scale', ...args),
    drawImage: (...args: unknown[]) => record('drawImage', ...args),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('paintBoardThumbnailOp — draw-op composition parity', () => {
  it('dispatches a saved registered plate through the projective raster painter', () => {
    const registration = {
      sourceWidth: 10,
      sourceHeight: 10,
      north: [0, 0] as const,
      east: [10, 0] as const,
      south: [10, 10] as const,
      west: [0, 10] as const,
      gridColumns: 1,
      gridRows: 1,
      columnGuides: [0, 1],
      rowGuides: [0, 1],
    };
    const board: EditorBoard = {
      ...blank(1, 1),
      surface: {
        kind: 'predrawn',
        slot: 'boards/test/registered.png',
        frameWidth: 10,
        frameHeight: 10,
        registration,
      },
    };
    const op = boardDrawOps(board)[0];
    const bounds = boardBounds(board);
    const image = { naturalWidth: 10, naturalHeight: 10 } as HTMLImageElement;
    const { ctx, calls } = recordingContext();
    const dispatched: unknown[][] = [];

    paintBoardThumbnailOp(ctx, image, op, bounds, 2, (...args) => {
      dispatched.push(args);
    });

    expect(op.predrawnTransform).toBeDefined();
    expect(dispatched).toEqual([[ctx, image, op, bounds, 2]]);
    expect(calls.some((call) => call.name === 'drawImage')).toBe(false);
  });

  it('clips in fixed board coordinates, flips inside the op box, and multiplies then restores alpha', () => {
    const { ctx, calls } = recordingContext(0.5);
    const image = { naturalWidth: 8, naturalHeight: 8 } as HTMLImageElement;
    const op: BoardDrawOp = {
      src: '/reflection.png',
      dx: 30,
      dy: 40,
      dw: 10,
      dh: 12,
      z: 1,
      flipX: true,
      opacity: 0.4,
      clipPolygons: [[31, 41, 39, 41, 39, 51, 31, 51]],
    };

    paintBoardThumbnailOp(ctx, image, op, { minX: 10, minY: 20, width: 60, height: 60 }, 2);

    const move = calls.find((call) => call.name === 'moveTo')!;
    const translate = calls.find((call) => call.name === 'translate')!;
    const draw = calls.find((call) => call.name === 'drawImage')!;
    expect(move.args).toEqual([42, 42]);
    expect(calls.indexOf(move)).toBeLessThan(calls.indexOf(translate));
    expect(translate.args).toEqual([60, 40]);
    expect(calls.find((call) => call.name === 'scale')?.args).toEqual([-1, 1]);
    expect(draw.args).toEqual([image, 0, 0, 20, 24]);
    expect(draw.alpha).toBeCloseTo(0.2);
    expect(calls.filter((call) => call.name === 'restore')).toHaveLength(2);
    expect(ctx.globalAlpha).toBe(0.5);
  });

  it('preserves source-rectangle drawing inside a flipped op box', () => {
    const { ctx, calls } = recordingContext();
    const image = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
    const op: BoardDrawOp = {
      src: '/sheet.png',
      dx: 12,
      dy: 18,
      dw: 32,
      dh: 40,
      z: 1,
      sx: 4,
      sy: 5,
      sw: 16,
      sh: 20,
      flipX: true,
    };

    paintBoardThumbnailOp(ctx, image, op, { minX: 2, minY: 8, width: 80, height: 80 }, 2);

    expect(calls.find((call) => call.name === 'translate')?.args).toEqual([84, 20]);
    expect(calls.find((call) => call.name === 'drawImage')?.args).toEqual([
      image, 4, 5, 16, 20, 0, 0, 64, 80,
    ]);
  });

  it('preserves contain sizing and centering inside a flipped op box', () => {
    const { ctx, calls } = recordingContext();
    const image = { naturalWidth: 156, naturalHeight: 46 } as HTMLImageElement;
    const op: BoardDrawOp = {
      src: '/piece.png',
      dx: 0,
      dy: 0,
      dw: 100,
      dh: 120,
      z: 1,
      contain: true,
      flipX: true,
    };

    paintBoardThumbnailOp(ctx, image, op, { minX: 0, minY: 0, width: 100, height: 120 }, 2);

    expect(calls.find((call) => call.name === 'translate')?.args).toEqual([200, 0]);
    expect(calls.find((call) => call.name === 'drawImage')?.args).toEqual([
      image, 22, 97, 156, 46,
    ]);
  });

  it('bounds the thumbnail scratch surface to the scaled live-op intersection on a 4K board', () => {
    const { ctx: main, calls: mainCalls } = recordingContext();
    const { ctx: scratchContext } = recordingContext();
    const scratchCanvas = { width: 20, height: 10 } as HTMLCanvasElement;
    const image = { naturalWidth: 20, naturalHeight: 20 } as HTMLImageElement;
    const op: BoardDrawOp = {
      layer: 'scene',
      src: '/unit.png',
      dx: 3990,
      dy: 3995,
      dw: 20,
      dh: 20,
      z: 1,
    };
    const mask: BoardDrawOp = {
      layer: 'scene',
      src: '/mask.png',
      dx: 3980,
      dy: 3980,
      dw: 40,
      dh: 40,
      z: 2,
    };
    const requestedSizes: Array<[number, number]> = [];

    drawBoardThumbnailOps(
      main,
      [op],
      { minX: 0, minY: 0, width: 4000, height: 4000 },
      2,
      new Map([['/unit.png', image], ['/mask.png', image]]),
      [mask],
      (width, height) => {
        requestedSizes.push([width, height]);
        return { canvas: scratchCanvas, context: scratchContext };
      },
    );

    expect(requestedSizes).toEqual([[20, 10]]);
    expect(mainCalls.find((call) => call.name === 'drawImage')?.args).toEqual([
      scratchCanvas,
      0,
      0,
      20,
      10,
      7980,
      7990,
      20,
      10,
    ]);
  });
});

describe('boardContentHash — stability + sensitivity', () => {
  it('is stable across object-key insertion order (canonicalised)', () => {
    const a: EditorBoard = { ...blank(), cells: { '0,0': TILE, '1,1': TILE } };
    const b: EditorBoard = { ...blank(), cells: { '1,1': TILE, '0,0': TILE } };
    expect(boardContentHash(a)).toBe(boardContentHash(b));
  });

  it('two structurally-identical boards share one hash (so they share one bake)', () => {
    expect(boardContentHash(blank())).toBe(boardContentHash(blank()));
  });

  it('changes when a tile changes', () => {
    const before = { ...blank(), cells: { '0,0': TILE } };
    const after = { ...blank(), cells: { '0,0': 'dirt-surf-0' } };
    expect(boardContentHash(before)).not.toBe(boardContentHash(after));
  });

  it('changes when a macrotile is added', () => {
    const before = { ...blank(), cells: { '0,0': TILE } };
    const after: EditorBoard = {
      ...before,
      macroTiles: [{ assetId: 'grass-soft-bands-3x3', x: 0, y: 0 }],
    };
    expect(boardContentHash(before)).not.toBe(boardContentHash(after));
  });

  it('changes when a unit moves', () => {
    const before = { ...blank(), units: { '0,0': UNIT } };
    const after = { ...blank(), units: { '1,0': UNIT } };
    expect(boardContentHash(before)).not.toBe(boardContentHash(after));
  });

  it('changes when board dimensions change', () => {
    expect(boardContentHash(blank(4, 4))).not.toBe(boardContentHash(blank(8, 4)));
  });

  it('changes when a prop is added, and again when it moves', () => {
    const before = blank(8, 6);
    const placed: EditorBoard = { ...blank(8, 6), props: { '3,2': { propId: 'cottage' } } };
    const moved: EditorBoard = { ...blank(8, 6), props: { '4,2': { propId: 'cottage' } } };
    expect(boardContentHash(before)).not.toBe(boardContentHash(placed));
    expect(boardContentHash(placed)).not.toBe(boardContentHash(moved));
  });

  it('changes when a feature (road) is added', () => {
    const before = blank();
    const after: EditorBoard = { ...blank(), features: { '1,1': { kind: 'road', material: 'cobble' } } };
    expect(boardContentHash(before)).not.toBe(boardContentHash(after));
  });

  it('changes when a ground-cover type override changes', () => {
    const before: EditorBoard = { ...blank(), cells: { '0,0': 'stone-surf-0' }, cover: { '0,0': 'filled' } };
    const after: EditorBoard = {
      ...blank(),
      cells: { '0,0': 'stone-surf-0' },
      cover: { '0,0': 'filled' },
      coverTypes: { '0,0': 'grass' },
    };
    expect(boardContentHash(before)).not.toBe(boardContentHash(after));
  });

  it('changes when an edge fence is added', () => {
    const before = blank();
    const after: EditorBoard = { ...blank(), fences: { [roadEdgeKey(1, 1, 2, 1)]: 'wood' } };
    expect(boardContentHash(before)).not.toBe(boardContentHash(after));
  });

  it('changes when an explicit fence post is added or changes material', () => {
    const before = blank();
    const wood: EditorBoard = { ...blank(), fencePosts: { '2,2': 'wood' } };
    const stone: EditorBoard = { ...blank(), fencePosts: { '2,2': 'stone' } };
    expect(boardContentHash(before)).not.toBe(boardContentHash(wood));
    expect(boardContentHash(wood)).not.toBe(boardContentHash(stone));
  });

  it('changes when an edge wall is added', () => {
    const before = blank();
    const after: EditorBoard = { ...blank(), walls: { [roadEdgeKey(1, 0, 1, -1)]: 'stone' } };
    expect(boardContentHash(before)).not.toBe(boardContentHash(after));
  });

  it('changes when a forced feature exit is added', () => {
    const before: EditorBoard = { ...blank(), features: { '1,1': { kind: 'road', material: 'cobble' } } };
    const after: EditorBoard = {
      ...blank(),
      features: { '1,1': { kind: 'road', material: 'cobble' } },
      featureExits: { [roadEdgeKey(1, 1, 2, 1)]: true },
    };
    expect(boardContentHash(before)).not.toBe(boardContentHash(after));
  });

  it('is an 8-char hex string', () => {
    expect(boardContentHash(blank())).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('uniqueDrawSrcs — dedup so each image decodes once', () => {
  it('collapses a board tiled with one family to a single tile src', () => {
    const board: EditorBoard = { ...blank(2, 2), cells: { '0,0': TILE, '1,0': TILE, '0,1': TILE, '1,1': TILE } };
    const srcs = uniqueDrawSrcs(board);
    // Tile-only boards decode only the top. Subterrain is opt-in and never family-derived.
    const tileSrcs = srcs.filter((s) => s === boardDrawOps(board).find((op) => op.layer === 'terrain')?.src);
    expect(tileSrcs).toHaveLength(1);
    const topSrc = tileSrcs[0];
    expect(boardDrawOps(board).filter((op) => op.src === topSrc)).toHaveLength(4);
    expect(boardDrawOps(board).filter((op) => op.src.endsWith('-side.png'))).toHaveLength(0);
    // Exact editor boards do not invent ambient cover when their authored cover map is empty.
    expect(srcs.some((src) => grassCoverSources().has(src))).toBe(false);
  });

  it('draws only explicitly authored Subterrain faces', () => {
    const board: EditorBoard = {
      ...blank(2, 2),
      cells: { '0,0': TILE, '1,0': TILE, '0,1': TILE, '1,1': TILE },
      subterrain: { '1,1:south': 'earth', '1,1:east': 'bedrock' },
    };
    const subterrainSrcs = [subterrainMaterialSrc('earth'), subterrainMaterialSrc('bedrock')];
    const sideOps = boardDrawOps(board).filter((op) => subterrainSrcs.includes(op.src));
    expect(sideOps).toHaveLength(2);
    expect(sideOps.map((op) => op.src)).toEqual([
      subterrainMaterialSrc('earth'),
      subterrainMaterialSrc('bedrock'),
    ]);
  });

  it('returns no srcs for a blank (untiled) board', () => {
    expect(uniqueDrawSrcs(blank())).toEqual([]);
    expect(boardDrawOps(blank())).toEqual([]);
  });

  it('includes ground-cover sprites only when the exact board authors cover', () => {
    const board: EditorBoard = {
      ...blank(),
      cells: { '0,0': TILE },
      cover: { '0,0': 'filled' },
    };
    expect(uniqueDrawSrcs(board).some((src) => grassCoverSources().has(src))).toBe(true);
  });

  it('deduplicates shared fence post artwork while retaining the rail frame', () => {
    const board: EditorBoard = {
      ...blank(),
      fences: { [roadEdgeKey(1, 1, 2, 1)]: 'wood' },
    };
    const srcs = uniqueDrawSrcs(board);
    expect(srcs).toContain(fenceFrameSrc('wood', 2));
    expect(srcs.filter((src) => src === fencePostSrc('wood'))).toHaveLength(1);
    expect(boardDrawOps(board).filter((op) => op.src === fencePostSrc('wood'))).toHaveLength(2);
  });

  it('includes standalone explicitly-authored posts without requiring a rail', () => {
    const board: EditorBoard = { ...blank(), fencePosts: { '2,2': 'stone' } };
    expect(uniqueDrawSrcs(board)).toEqual([fencePostSrc('stone')]);
    expect(boardDrawOps(board)).toHaveLength(1);
  });

  it('a doodad contributes its back AND front halves as distinct srcs', () => {
    const board: EditorBoard = { ...blank(), doodads: { '1,1': { doodadId: 'boulder' } } };
    const srcs = uniqueDrawSrcs(board);
    expect(srcs).toContain(structureArtHalfSrc('boulder', 'back'));
    expect(srcs).toContain(structureArtHalfSrc('boulder', 'front'));
  });

  it('a prop contributes its back AND front halves; unknown prop ids are skipped', () => {
    const board: EditorBoard = { ...blank(8, 6), props: { '3,2': { propId: 'cottage' } } };
    const srcs = uniqueDrawSrcs(board);
    expect(srcs).toContain(structureArtHalfSrc('cottage', 'back'));
    expect(srcs).toContain(structureArtHalfSrc('cottage', 'front'));
    const unknown: EditorBoard = { ...blank(8, 6), props: { '3,2': { propId: 'not-a-prop' } } };
    expect(uniqueDrawSrcs(unknown)).toEqual([]);
  });

  it('a macrotile contributes its board-space source and replaces covered top sources', () => {
    const cells = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [`${index % 3},${Math.floor(index / 3)}`, TILE]),
    );
    const board: EditorBoard = {
      ...blank(3, 3),
      cells,
      macroTiles: [{ assetId: 'grass-soft-bands-3x3', x: 0, y: 0 }],
    };
    const sources = uniqueDrawSrcs(board);
    expect(sources).toContain(macroTileAsset('grass-soft-bands-3x3')?.src);
    expect(sources.some((source) => source.endsWith('grass-0-top.png'))).toBe(false);
  });
});

describe('boardDrawOps — z-order matches the live DOM bands', () => {
  it('filters semantic layers without depending on asset URL conventions', () => {
    const op = (layer: BoardDrawOp['layer'], src: string): BoardDrawOp => ({
      layer,
      src,
      dx: 0,
      dy: 0,
      dw: 48,
      dh: 180,
      z: 0,
    });
    const profileTerrain = op('terrain', '/registered/profiles/abrupt-water-cut.png');
    const misleadingScene = op('scene', '/assets/tiles/surface/not-terrain.png');
    const feature = op('linear-feature', '/registered/features/river.png');

    expect(withoutBoardDrawLayers(
      [profileTerrain, misleadingScene, feature],
      'terrain',
      'linear-feature',
    )).toEqual([misleadingScene]);
  });

  it('keeps accepted native unit rasters at their authored dimensions', () => {
    const catalog = testLiveUnitCatalog({ scales: { pawn: 66 }, nativeScales: { pawn: 66 } });
    const pawn = catalog.assets.find((asset) => asset.family === 'pawn')!;
    pawn.footprint.sourceCanvasWidth = 51;
    pawn.footprint.sourceCanvasHeight = 61;
    pawn.footprint.sourceFootprintPx = 15;
    applyLiveUnitCatalog(catalog);
    try {
      const board: EditorBoard = {
        ...blank(),
        units: { '0,0': { unitId: 'pawn', direction: 'south', faction: 'navy-blue' } },
      };
      const unit = boardDrawOps(board).find((op) => op.contain);
      expect(unit?.dw).toBe(51);
      expect(unit?.dh).toBe(61);
    } finally {
      applyLiveUnitCatalog(testLiveUnitCatalog());
    }
  });

  it('sorts tiles by x+y, then brackets the unit/doodad in the object band', () => {
    const board: EditorBoard = {
      ...blank(),
      cells: { '0,0': TILE },
      units: { '0,0': UNIT },
      doodads: { '0,0': { doodadId: 'boulder' } },
    };
    const ops = boardDrawOps(board);
    const z = ops.map((op) => op.z);
    // Non-decreasing (sorted) and the unit/doodad sit far above the tile band.
    expect([...z].sort((a, b) => a - b)).toEqual(z);
    expect(Math.max(...z)).toBeGreaterThan(objectBaseZIndex({ x: 0, y: 0 }));
    expect(Math.min(...z)).toBeLessThan(objectBaseZIndex({ x: 0, y: 0 }));
  });

  it('brackets a prop around a unit standing on its front-most footprint cell', () => {
    // Cottage (2×2) at (3,2) → front cell (4,3): back < seated unit < front.
    const board: EditorBoard = {
      ...blank(8, 6),
      props: { '3,2': { propId: 'cottage' } },
      units: { '4,3': UNIT },
    };
    const ops = boardDrawOps(board);
    const back = ops.find((op) => op.src === structureArtHalfSrc('cottage', 'back'));
    const front = ops.find((op) => op.src === structureArtHalfSrc('cottage', 'front'));
    const unit = ops.find((op) => op.contain);
    expect(back!.z).toBeLessThan(unit!.z);
    expect(front!.z).toBeGreaterThan(unit!.z);
    // Cottage is flat-contact art: the source PNG is clipped at anchorY=110 before the halves are
    // z-sorted, so the roof/body do not get painted a second time above a nearby unit.
    expect(back!.dw).toBeCloseTo(177 * 0.62, 2);
    expect(back!.sy).toBe(0);
    expect(back!.sh).toBe(110);
    expect(back!.dh).toBeCloseTo(110 * 0.62, 2);
    expect(front!.sy).toBe(110);
    expect(front!.sh).toBe(184 - 110);
    expect(front!.dy).toBeCloseTo(back!.dy + 110 * 0.62, 2);
    expect(front!.dh).toBeCloseTo((184 - 110) * 0.62, 2);
  });

  it('keeps authored split props full-frame because their alpha already defines each half', () => {
    const board: EditorBoard = {
      ...blank(8, 6),
      props: { '3,2': { propId: 'oak' } },
    };
    const ops = boardDrawOps(board);
    const back = ops.find((op) => op.src === structureArtHalfSrc('oak', 'back'));
    const front = ops.find((op) => op.src === structureArtHalfSrc('oak', 'front'));
    expect(back).toBeDefined();
    expect(front).toBeDefined();
    expect(back!.sx).toBeUndefined();
    expect(front!.sx).toBeUndefined();
    expect(back!.dw).toBe(192);
    expect(back!.dh).toBe(300);
  });

  it('replaces every covered 1x1 top with one macrotile below feature overlays', () => {
    const cells = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [`${index % 3},${Math.floor(index / 3)}`, TILE]),
    );
    const board: EditorBoard = {
      ...blank(4, 4),
      cells: { ...cells, '3,3': TILE },
      macroTiles: [{ assetId: 'grass-soft-bands-3x3', x: 0, y: 0 }],
      features: { '1,1': { kind: 'road', material: 'cobble' } },
    };
    const ops = boardDrawOps(board);
    const tileOps = ops.filter((op) => op.src === tileFamilies.grass[0].src);
    const macroTileOp = ops.find((op) => op.src === macroTileAsset('grass-soft-bands-3x3')?.src);
    const featureOp = ops.find((op) => op.src === featureFrameSrc('road', 'cobble', 0));
    expect(tileOps).toHaveLength(1);
    expect(macroTileOp).toBeDefined();
    expect(featureOp).toBeDefined();
    expect(tileOps.every((op) => op.layer === 'terrain')).toBe(true);
    expect(macroTileOp!.layer).toBe('terrain');
    expect(featureOp!.layer).toBe('linear-feature');
    expect(macroTileOp!.z).toBeGreaterThan(tileOps[0].z);
    expect(featureOp!.z).toBeGreaterThan(macroTileOp!.z);
    expect(featureOp!.z).toBeLessThan(20000);
  });

  it('restores broken 1x1 tops and clips the composite to its remaining owned cells', () => {
    const cells = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [`${index % 3},${Math.floor(index / 3)}`, TILE]),
    );
    const board: EditorBoard = {
      ...blank(3, 3),
      cells,
      macroTiles: [{ assetId: 'grass-soft-bands-3x3', x: 0, y: 0, breaks: [4] }],
    };
    const ops = boardDrawOps(board);
    const tileOps = ops.filter((op) => op.src === tileFamilies.grass[0].src);
    const macroTileOp = ops.find((op) => op.src === macroTileAsset('grass-soft-bands-3x3')?.src);

    expect(tileOps).toHaveLength(1);
    expect(macroTileOp?.clipPolygons).toHaveLength(8);
    expect(macroTileOp?.clipPolygons?.every((polygon) => polygon.length === 8)).toBe(true);
  });

  it('keeps rear and foreground grass on opposite sides of a seated unit', () => {
    const surfaces: Array<EditorBoard['surface']> = [
      undefined,
      {
        kind: 'predrawn',
        slot: 'boards/test/grass-bracket.png',
        frameWidth: 640,
        frameHeight: 360,
      },
    ];

    for (const surface of surfaces) {
      const board: EditorBoard = {
        ...blank(3, 3),
        surface,
        cells: { '1,1': TILE },
        cover: { '1,1': 'filled' },
        units: { '1,1': UNIT },
      };
      const ops = boardDrawOps(board);
      const unit = ops.find((op) => op.contain);
      const coverSources = grassCoverSources();
      const coverOps = ops.filter((op) => coverSources.has(op.src));

      expect(unit).toBeDefined();
      expect(coverOps.some((op) => op.z < unit!.z)).toBe(true);
      expect(coverOps.some((op) => op.z > unit!.z)).toBe(true);
    }
  });

  it('draws edge fences in the barrier lane below object/unit draw order', () => {
    const board: EditorBoard = {
      ...blank(4, 4),
      cells: { '1,1': TILE, '2,1': TILE, '2,2': TILE },
      cover: { '1,1': 'filled', '2,1': 'filled', '2,2': 'filled' },
      fences: { [roadEdgeKey(1, 1, 2, 1)]: 'wood' },
      units: { '1,1': UNIT, '2,1': UNIT },
      doodads: { '1,1': { doodadId: 'boulder' } },
    };
    const ops = boardDrawOps(board);
    const fence = ops.find((op) => op.src === fenceFrameSrc('wood', 2));
    const posts = ops.filter((op) => op.src === fencePostSrc('wood'));
    const ownerUnit = ops.find((op) => op.contain && op.z === objectBaseZIndex({ x: 1, y: 1 }));
    const nearUnit = ops.find((op) => op.contain && op.z === objectBaseZIndex({ x: 2, y: 1 }));
    const coverSources = grassCoverSources();
    const coverOps = ops.filter((op) => coverSources.has(op.src));
    const doodadBack = ops.find((op) => op.src === structureArtHalfSrc('boulder', 'back'));
    const doodadFront = ops.find((op) => op.src === structureArtHalfSrc('boulder', 'front'));
    expect(fence).toBeDefined();
    expect(posts).toHaveLength(2);
    const ownerLeft = 0;
    const ownerTop = 2 * TILE_TEMPLATE.stepY;
    expect(posts.map((post) => `${post.dx},${post.dy}`).sort()).toEqual([
      `${ownerLeft},${ownerTop - BAKE_GEOMETRY.TILE_EQUATOR}`,
      `${ownerLeft - BAKE_GEOMETRY.TILE_STEP_X},${ownerTop + BAKE_GEOMETRY.TILE_STEP_Y - BAKE_GEOMETRY.TILE_EQUATOR}`,
    ].sort());
    expect(ownerUnit).toBeDefined();
    expect(nearUnit).toBeDefined();
    expect(coverOps.length).toBeGreaterThan(0);
    expect(doodadBack).toBeDefined();
    expect(doodadFront).toBeDefined();
    expect(fence!.z).toBe(fenceOverlayZIndex({ x: 1, y: 1 }));
    const rightPost = posts.find((post) => post.dx === ownerLeft);
    const frontPost = posts.find((post) => post.dx === ownerLeft - BAKE_GEOMETRY.TILE_STEP_X);
    expect(rightPost?.z).toBe(fencePostZIndex({ x: 2, y: 1 }));
    expect(frontPost?.z).toBe(fencePostZIndex({ x: 2, y: 2 }));
    expect(rightPost?.z).toBe(fence!.z + 0.5);
    expect(frontPost?.z).toBe(fence!.z + CELL_DEPTH_STRIDE + 0.5);
    expect(ops.indexOf(fence!)).toBeLessThan(ops.indexOf(rightPost!));
    expect(ops.indexOf(fence!)).toBeLessThan(ops.indexOf(frontPost!));
    expect(fence!.z).toBeLessThan(Math.min(...coverOps.map((op) => op.z)));
    expect(fence!.z).toBeLessThan(ownerUnit!.z);
    expect(fence!.z).toBeLessThan(nearUnit!.z);
    expect(fence!.z).toBeLessThan(doodadBack!.z);
    expect(fence!.z).toBeLessThan(doodadFront!.z);
    expect(doodadBack!.z).toBe(structureBackZIndex({ x: 1, y: 1 }));
  });

  it('puts both endpoints of E- and S-rails behind their capping posts', () => {
    for (const [edge, src] of [
      [roadEdgeKey(1, 1, 2, 1), fenceFrameSrc('wood', 2)],
      [roadEdgeKey(1, 1, 1, 2), fenceFrameSrc('wood', 4)],
    ] as const) {
      const ops = boardDrawOps({ ...blank(4, 4), fences: { [edge]: 'wood' } });
      const rail = ops.find((op) => op.src === src)!;
      const posts = ops.filter((op) => op.src === fencePostSrc('wood'));
      const [rear, front] = [...posts].sort((a, b) => a.z - b.z);

      expect(posts).toHaveLength(2);
      expect(rear.z).toBe(rail.z + 0.5);
      expect(front.z).toBe(rail.z + CELL_DEPTH_STRIDE + 0.5);
      expect(ops.indexOf(rail)).toBeLessThan(ops.indexOf(rear));
      expect(ops.indexOf(rail)).toBeLessThan(ops.indexOf(front));
    }
  });

  it('draws one explicit junction post in front of every incident rail', () => {
    const board: EditorBoard = {
      ...blank(5, 5),
      fences: {
        [roadEdgeKey(1, 1, 2, 1)]: 'wood',
        [roadEdgeKey(1, 1, 1, 2)]: 'wood',
        [roadEdgeKey(1, 2, 2, 2)]: 'wood',
        [roadEdgeKey(2, 1, 2, 2)]: 'wood',
      },
      fencePosts: { '2,2': 'wood' },
    };
    const ops = boardDrawOps(board);
    const postZ = fencePostZIndex({ x: 2, y: 2 });
    const post = ops.find((op) => op.src === fencePostSrc('wood') && op.z === postZ)!;
    const railSrcs = new Set([2, 4, 6].map((mask) => fenceFrameSrc('wood', mask)));
    const incidentRails = ops.filter((op) => railSrcs.has(op.src));

    expect(incidentRails).toHaveLength(3);
    expect(incidentRails.every((rail) => rail.z < post.z)).toBe(true);
    expect(Math.max(...incidentRails.map((rail) => rail.z))).toBe(post.z - 0.5);
  });

  it('draws north/west boundary fences from phantom owners and posts at canonical vertices', () => {
    const board: EditorBoard = {
      ...blank(4, 4),
      fences: {
        [roadEdgeKey(2, 0, 2, -1)]: 'wood',
        [roadEdgeKey(0, 2, -1, 2)]: 'stone',
      },
    };
    const ops = boardDrawOps(board);
    const northRail = ops.find((op) => op.src === fenceFrameSrc('wood', 4));
    const westRail = ops.find((op) => op.src === fenceFrameSrc('stone', 2));
    const woodPosts = ops.filter((op) => op.src === fencePostSrc('wood'));
    const stonePosts = ops.filter((op) => op.src === fencePostSrc('stone'));

    expect(northRail).toBeDefined();
    expect(westRail).toBeDefined();
    expect(northRail!.z).toBe(fenceOverlayZIndex({ x: 2, y: -1 }));
    expect(westRail!.z).toBe(fenceOverlayZIndex({ x: -1, y: 2 }));
    expect(woodPosts).toHaveLength(2);
    expect(stonePosts).toHaveLength(2);
    expect(woodPosts.map((post) => post.z).sort()).toEqual([
      fencePostZIndex({ x: 2, y: 0 }),
      fencePostZIndex({ x: 3, y: 0 }),
    ].sort());
    expect(stonePosts.map((post) => post.z).sort()).toEqual([
      fencePostZIndex({ x: 0, y: 2 }),
      fencePostZIndex({ x: 0, y: 3 }),
    ].sort());
    expect(woodPosts.map((post) => `${post.dx},${post.dy}`).sort()).toEqual(['48,-41', '96,-14']);
    expect(stonePosts.map((post) => `${post.dx},${post.dy}`).sort()).toEqual(['-144,-41', '-192,-14'].sort());
  });

  it('draws one explicit post at a shared junction and lets authored material win', () => {
    const board: EditorBoard = {
      ...blank(),
      fences: {
        [roadEdgeKey(0, 0, 1, 0)]: 'wood',
        [roadEdgeKey(0, 0, 0, 1)]: 'wood',
        [roadEdgeKey(0, 1, 1, 1)]: 'wood',
      },
      fencePosts: { '1,1': 'stone' },
    };
    const ops = boardDrawOps(board);
    expect(ops.filter((op) => op.src === fencePostSrc('stone'))).toHaveLength(1);
    expect(ops.filter((op) => op.src === fencePostSrc('wood'))).toHaveLength(3);
  });

  it('replaces an automatic endpoint with one explicit post instead of drawing both', () => {
    const board: EditorBoard = {
      ...blank(),
      fences: { [roadEdgeKey(1, 1, 2, 1)]: 'wood' },
      fencePosts: { '2,1': 'stone' },
    };
    const postOps = boardDrawOps(board).filter((op) => op.src === fencePostSrc('stone') || op.src === fencePostSrc('wood'));
    expect(postOps).toHaveLength(2);
    expect(postOps.filter((op) => op.src === fencePostSrc('stone'))).toHaveLength(1);
    expect(postOps.filter((op) => op.src === fencePostSrc('wood'))).toHaveLength(1);
  });

  it('draws north/west perimeter walls with the wall frame anchor', () => {
    const board: EditorBoard = {
      ...blank(3, 3),
      cells: { '1,0': TILE },
      walls: { [roadEdgeKey(1, 0, 1, -1)]: 'stone' },
      units: { '1,0': UNIT },
    };
    const ops = boardDrawOps(board);
    const wall = ops.find((op) => op.src === wallFrameSrc('stone', 1));
    const ownerUnit = ops.find((op) => op.contain && op.z === objectBaseZIndex({ x: 1, y: 0 }));
    expect(wall).toBeDefined();
    expect(ownerUnit).toBeDefined();
    expect(wall).toMatchObject({ dw: 128, dh: 336 });
    expect(wall!.dx).toBeCloseTo((1 - 0) * TILE_TEMPLATE.stepX - 64);
    expect(wall!.dy).toBeCloseTo((1 + 0) * TILE_TEMPLATE.stepY - 192);
    expect(wall!.z).toBe(wallOverlayZIndex({ x: 1, y: 0 }));
    expect(wall!.z).toBeLessThan(ownerUnit!.z);
  });

  it('keeps every half of a same-cell fieldstone in front of the wall', () => {
    const board: EditorBoard = {
      ...blank(3, 3),
      cells: { '1,0': TILE },
      walls: { [roadEdgeKey(1, 0, 1, -1)]: 'stone' },
      props: { '1,0': { propId: 'fieldstone' } },
    };
    const ops = boardDrawOps(board);
    const wall = ops.find((op) => op.src === wallFrameSrc('stone', 1));
    const structureBack = ops.find((op) => op.src === structureArtHalfSrc('fieldstone', 'back'));
    const structureFront = ops.find((op) => op.src === structureArtHalfSrc('fieldstone', 'front'));

    expect(wall).toBeDefined();
    expect(structureBack).toBeDefined();
    expect(structureFront).toBeDefined();
    expect(wall!.z).toBeLessThan(structureBack!.z);
    expect(wall!.z).toBeLessThan(structureFront!.z);
    expect(structureBack!.z).toBe(structureBackZIndex({ x: 1, y: 0 }));
  });

  it('keeps wall art in the wall display layer while drawing it after the wall frame', () => {
    const edge = roadEdgeKey(0, 0, -1, 0);
    const secondEdge = roadEdgeKey(0, 1, -1, 1);
    const board: EditorBoard = {
      ...blank(3, 3),
      walls: { [edge]: 'stone', [secondEdge]: 'stone' },
      wallArt: { [edge]: 'test-banner-pair' },
      props: { '0,0': { propId: 'fieldstone' } },
    };
    const ops = boardDrawOps(board);
    const wall = ops.find((op) => op.src === wallFrameSrc('stone', 8));
    const art = ops.find((op) => op.src === wallDecorAsset('banner-tattered')?.faces.west.src);
    const structureBack = ops.find((op) => op.src === structureArtHalfSrc('fieldstone', 'back'));

    expect(wall).toBeDefined();
    expect(art).toBeDefined();
    expect(structureBack).toBeDefined();
    expect(art!.z).toBe(wallArtOverlayZIndex({ x: 0, y: 0 }));
    expect(art!.z).toBeGreaterThan(wall!.z);
    expect(art!.z).toBeLessThan(structureBack!.z);
    expect(ops.indexOf(wall!)).toBeLessThan(ops.indexOf(art!));
  });
});

describe('boardBounds — dimension / scale math', () => {
  it('a single-tile board is exactly the 96x180 tile frame', () => {
    const board: EditorBoard = { ...blank(), cells: { '0,0': TILE } };
    const bounds = boardBounds(board);
    expect(bounds.width).toBe(96);
    expect(bounds.height).toBe(180);
  });

  it('a blank board still reports a non-zero (one-frame) box so a placeholder is sane', () => {
    const bounds = boardBounds(blank());
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  });

  it('grows with the board: a 2-tile diagonal is wider/taller than one tile', () => {
    const one: EditorBoard = { ...blank(), cells: { '0,0': TILE } };
    const two: EditorBoard = { ...blank(), cells: { '0,0': TILE, '1,1': TILE } };
    const b1 = boardBounds(one);
    const b2 = boardBounds(two);
    // (1,1) projects straight down from (0,0) (left = (x-y)*stepX = 0), so height grows, width holds.
    expect(b2.height).toBeGreaterThan(b1.height);
    expect(b2.width).toBe(b1.width);
  });

  it('integer-rounds width/height (so the bake canvas is whole pixels)', () => {
    const board: EditorBoard = { ...blank(), cells: { '0,0': TILE, '3,0': TILE, '0,3': TILE } };
    const bounds = boardBounds(board);
    expect(Number.isInteger(bounds.width)).toBe(true);
    expect(Number.isInteger(bounds.height)).toBe(true);
  });
});

describe('boardSocialFramingBounds — board-first social-card framing', () => {
  it('keeps the full board width and top headroom but stops front edge depth from owning scale', () => {
    const board: EditorBoard = { ...blank(), cells: { '0,0': TILE } };
    const draw = boardBounds(board);
    const frame = boardSocialFramingBounds(board);

    expect(frame.minX).toBe(draw.minX);
    expect(frame.minY).toBe(draw.minY);
    expect(frame.width).toBe(draw.width);
    expect(frame.height).toBeGreaterThan(0);
    expect(frame.height).toBeLessThan(draw.height);
  });
});

describe('largestSolidRect — the solid crop that fills a box without sky', () => {
  const W = 200;
  const H = 160;
  // A board-shaped alpha: a solid isometric DIAMOND (rhombus) plus a sparse column of "headroom"
  // pixels above it (grass tufts / unit-heads poking into the transparent band above the back row).
  const cx = 100;
  const cy = 95; // diamond centre sits below the image middle — the headroom lives up top
  const A = 90;
  const B = 55;
  const diamond = (x: number, y: number): boolean => Math.abs(x - cx) / A + Math.abs(y - cy) / B <= 1;
  const withHeadroom = (x: number, y: number): boolean =>
    diamond(x, y) || (y >= 4 && y <= 22 && x >= 96 && x <= 104); // thin sparse tuft column up top

  it('returns a FULLY solid rect (so cover can never show a transparent corner)', () => {
    const rect = largestSolidRect(withHeadroom, W, H)!;
    expect(rect).not.toBeNull();
    // Every pixel opaque — the guarantee that lets object-fit:cover fill a box with board and never
    // expose a transparent corner (cov defaults to 1). A partial crop is what left the empty wedges.
    expect(coverage(withHeadroom, rect)).toBe(1);
  });

  it('excludes the sparse headroom above the diamond', () => {
    const rect = largestSolidRect(withHeadroom, W, H)!;
    // The solid crop starts at/below the diamond's top vertex — never up in the tuft band (y≤22).
    expect(rect.y).toBeGreaterThanOrEqual(cy - B);
  });

  it('is a substantial view, not a sliver', () => {
    const rect = largestSolidRect(withHeadroom, W, H)!;
    // The largest solid rect inscribed in a rhombus is ~A×B; assert it's a real central view (a
    // healthy fraction of that), not the degenerate sliver the fallback would replace.
    expect(rect.w).toBeGreaterThan(A * 0.6);
    expect(rect.h).toBeGreaterThan(B * 0.6);
    expect(rect.w * rect.h).toBeGreaterThan(0.25 * A * B);
  });

  it('a fully-solid rectangle comes back fully solid', () => {
    const solid = (x: number, y: number): boolean => x >= 20 && x < 180 && y >= 20 && y < 140;
    const rect = largestSolidRect(solid, W, H)!;
    expect(coverage(solid, rect)).toBe(1);
    expect(rect.w * rect.h).toBeGreaterThan(0.9 * (160 * 120));
  });

  it('returns null when nothing is painted', () => {
    expect(largestSolidRect(() => false, W, H)).toBeNull();
  });
});
