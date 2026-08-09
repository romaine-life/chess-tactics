import { describe, expect, it } from 'vitest';
import { encodeBoard, decodeBoard, type EditorBoard } from './boardCode';

const encodeWire = (wire: unknown): string => btoa(JSON.stringify(wire))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

const decodeWire = (code: string): Record<string, unknown> => JSON.parse(atob(
  code.replace(/-/g, '+').replace(/_/g, '/'),
)) as Record<string, unknown>;

const emptyBoard = (over: Partial<EditorBoard> = {}): EditorBoard => ({
  cols: 6,
  rows: 5,
  cells: {},
  units: {},
  doodads: {},
  cover: {},
  props: {},
  features: {},
  featureCuts: {},
  featureExits: {},
  ...over,
});

describe('boardCode round-trip', () => {
  it('round-trips an authored camera boundary and leaves old codes on the derived default path', () => {
    const cameraBounds = { minX: -420, minY: -260, width: 900, height: 620 };
    const code = encodeBoard(emptyBoard({ cameraBounds }));
    expect(decodeWire(code).cam).toEqual([-420, -260, 900, 620]);
    expect(decodeBoard(code)?.cameraBounds).toEqual(cameraBounds);
    expect(decodeBoard(encodeWire({ c: 6, r: 5 }))?.cameraBounds).toBeUndefined();
  });

  it('preserves a mixed board of tiles, a river, a road, and edge fences', () => {
    const board = emptyBoard({
      cells: { '0,0': 'grass-surf-0', '2,2': 'water-surf-0' },
      features: {
        '2,1': { kind: 'river', material: 'water' },
        '4,4': { kind: 'road', material: 'cobble' },
      },
      fences: { '1,1|2,1': 'wood', '3,3|3,4': 'stone' },
    });
    const decoded = decodeBoard(encodeBoard(board));
    expect(decoded).not.toBeNull();
    expect(decoded!.features).toEqual(board.features);
    expect(decoded!.fences).toEqual(board.fences);
  });

  it('round-trips the decoration-only terrain apron without changing legacy boards', () => {
    const decorativeApron = { top: 2, right: 5, bottom: 1, left: 3 };
    const decorativeCells = { '-1,0': 'grass-surf-0', '6,2': 'stone-surf-0' };
    const decoded = decodeBoard(encodeBoard(emptyBoard({ decorativeApron, decorativeCells })));
    expect(decoded?.decorativeApron).toEqual(decorativeApron);
    expect(decoded?.decorativeCells).toEqual(decorativeCells);
    expect(decodeBoard(encodeBoard(emptyBoard()))?.decorativeApron).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('round-trips a sparse scenic footprint as a sorted, deduplicated wire list', () => {
    const code = encodeBoard(emptyBoard({
      decorativeFootprint: ['-1,2', '6,1', '0,-2', '6,1', '2,2', '1.5,2', '01,2', '9007199254740992,0'],
    }));

    expect(decodeWire(code).df).toEqual(['0,-2', '6,1', '-1,2']);
    expect(decodeBoard(code)?.decorativeFootprint).toEqual(['0,-2', '6,1', '-1,2']);
    expect(decodeBoard(code)?.decorativeCells).toEqual({});
  });

  it('drops malformed and playable sparse-footprint keys on decode', () => {
    const decoded = decodeBoard(encodeWire({
      c: 6,
      r: 5,
      df: [
        '-1,0',
        '6,4',
        '0,5',
        '0,0',
        '5,4',
        '1.5,2',
        '01,2',
        '1, 2',
        '-0,5',
        '1e2,5',
        '9007199254740992,0',
        '0,-9007199254740991',
        '-1,0',
        7,
        null,
      ],
    }));

    expect(decoded?.decorativeFootprint).toEqual(['0,-9007199254740991', '-1,0', '6,4', '0,5']);
  });

  it('omits an empty sparse footprint and decodes old board codes to an empty footprint', () => {
    expect(encodeBoard(emptyBoard({ decorativeFootprint: [] }))).toBe(encodeBoard(emptyBoard()));
    expect(decodeBoard(encodeBoard(emptyBoard()))?.decorativeFootprint).toEqual([]);
  });

  it('round-trips decorative roads, fences, posts, and walls separately from gameplay channels', () => {
    const board = emptyBoard({
      decorativeFeatures: { '-1,0': { kind: 'road', material: 'cobble' } },
      decorativeFences: { '-1,0|-1,1': 'wood' },
      decorativeFencePosts: { '-1,0': 'stone' },
      decorativeWalls: { '-1,0|-2,0': 'brick' },
    });
    const decoded = decodeBoard(encodeBoard(board));
    expect(decoded?.decorativeFeatures).toEqual(board.decorativeFeatures);
    expect(decoded?.decorativeFences).toEqual(board.decorativeFences);
    expect(decoded?.decorativeFencePosts).toEqual(board.decorativeFencePosts);
    expect(decoded?.decorativeWalls).toEqual(board.decorativeWalls);
    expect(decoded?.features).toEqual({});
    expect(decoded?.fences).toEqual({});
    expect(decoded?.walls).toEqual({});
  });

  it('round-trips saved generated-region selections across the scenic boundary', () => {
    const generatedRegions: EditorBoard['generatedRegions'] = [{
      id: 'scenic-region', name: 'North scenery', cells: ['0,-1', '1,-1'],
      sections: [{ terrain: 'grass', share: 100 }], buffer: 0, wiggle: 0.5,
    }];
    const decoded = decodeBoard(encodeBoard(emptyBoard({
      decorativeApron: { top: 2, right: 0, bottom: 0, left: 0 },
      generatedRegions,
    })));
    expect(decoded?.generatedRegions?.[0].cells).toEqual(['0,-1', '1,-1']);
  });

  it('preserves perimeter walls independently from fences', () => {
    const board = emptyBoard({
      fences: { '1,1|2,1': 'wood' },
      walls: { '0,0|0,-1': 'stone', '0,2|-1,2': 'brick' },
    });
    const decoded = decodeBoard(encodeBoard(board));
    expect(decoded).not.toBeNull();
    expect(decoded!.fences).toEqual(board.fences);
    expect(decoded!.walls).toEqual(board.walls);
  });

  it('preserves wall art independently from wall materials', () => {
    const board = emptyBoard({
      walls: { '0,0|0,-1': 'stone', '0,1|-1,1': 'stone' },
      wallArt: { '0,0|-1,0': 'test-banner-pair' },
    });
    const decoded = decodeBoard(encodeBoard(board));
    expect(decoded).not.toBeNull();
    expect(decoded!.walls).toEqual(board.walls);
    expect(decoded!.wallArt).toEqual(board.wallArt);
  });

  it('encodes a fence-free board byte-identically to a code that predates fences', () => {
    expect(encodeBoard(emptyBoard({ fences: {} }))).toBe(encodeBoard(emptyBoard()));
    // an old code with no `fe` decodes fences to an empty map (back-compat contract).
    expect(decodeBoard(encodeBoard(emptyBoard()))!.fences).toEqual({});
  });

  it('round-trips standalone and boundary fence posts independently from fence rails', () => {
    const board = emptyBoard({
      fencePosts: {
        '0,0': 'wood',
        '3,2': 'stone',
        '6,5': 'stone',
      },
    });
    const decoded = decodeBoard(encodeBoard(board));
    expect(decoded?.fencePosts).toEqual(board.fencePosts);
    expect(decoded?.fences).toEqual({});
  });

  it('omits an empty post map and decodes a pre-post code to an empty map', () => {
    expect(encodeBoard(emptyBoard({ fencePosts: {} }))).toBe(encodeBoard(emptyBoard()));
    expect(decodeBoard(encodeBoard(emptyBoard()))?.fencePosts).toEqual({});
  });

  it('sanitizes post material and exact inclusive vertex keys on decode', () => {
    const decoded = decodeBoard(encodeWire({
      c: 6,
      r: 5,
      fp: {
        '0,0': 'wood',
        '6,5': 'stone',
        '3,2': 'wood',
        '-1,0': 'wood',
        '7,5': 'stone',
        '1,6': 'wood',
        '1.5,2': 'wood',
        '01,2': 'wood',
        '1, 2': 'wood',
        '1,2,3': 'wood',
        '2,2': 'iron',
        '4,4': 1,
      },
    }));
    expect(decoded?.fencePosts).toEqual({
      '0,0': 'wood',
      '6,5': 'stone',
      '3,2': 'wood',
    });
  });

  it('encodes a wall-free board byte-identically to a code that predates walls', () => {
    expect(encodeBoard(emptyBoard({ walls: {} }))).toBe(encodeBoard(emptyBoard()));
    expect(decodeBoard(encodeBoard(emptyBoard()))!.walls).toEqual({});
  });

  it('encodes a wall-art-free board byte-identically to a code that predates wall art', () => {
    expect(encodeBoard(emptyBoard({ wallArt: {} }))).toBe(encodeBoard(emptyBoard()));
    expect(decodeBoard(encodeBoard(emptyBoard()))!.wallArt).toEqual({});
  });

  it('round-trips Subterrain on playable and scenic terrain and drops interior or unsupported faces', () => {
    const board = emptyBoard({
      cols: 2,
      rows: 1,
      cells: { '0,0': 'grass-surf-0', '1,0': 'grass-surf-0' },
      decorativeApron: { top: 0, right: 1, bottom: 0, left: 0 },
      decorativeFootprint: ['-1,0'],
      subterrain: {
        '0,0:east': 'earth',
        '0,0:south': 'roots',
        '1,0:east': 'bedrock',
        '4,4:south': 'sand',
        '2,0:south': 'sand',
        '-1,0:south': 'earth',
      },
    });
    expect(decodeBoard(encodeBoard(board))!.subterrain).toEqual({
      '0,0:south': 'roots',
      '2,0:south': 'sand',
      '-1,0:south': 'earth',
    });
  });

  it('round-trips faction default directions', () => {
    const board = emptyBoard({
      factionDirections: { 'navy-blue': 'north', crimson: 'south-east' },
    });
    expect(decodeBoard(encodeBoard(board))!.factionDirections).toEqual(board.factionDirections);
  });

  it('encodes a direction-default-free board byte-identically to a code that predates faction directions', () => {
    expect(encodeBoard(emptyBoard({ factionDirections: {} }))).toBe(encodeBoard(emptyBoard()));
    expect(decodeBoard(encodeBoard(emptyBoard()))!.factionDirections).toEqual({});
  });

  it('round-trips generated-region units and their rerun settings', () => {
    const generatedRegions: EditorBoard['generatedRegions'] = [{
      id: 'region-1',
      name: 'North pond',
      cells: ['1,1', '2,1', '1,2'],
      buffer: 12,
      wiggle: 0.35,
      macroTileDensity: 0.65,
      sections: [
        {
          terrain: 'water',
          share: 70,
          locked: true,
          covers: [{ type: 'water', knobs: { amount: 0.8, amountRandom: 0.1, density: 0.5, densityRandom: 0.2 } }],
          macroTileDensity: 0,
          macroTileBreakup: 0,
        },
        { terrain: 'sand', share: 30, covers: [], macroTileDensity: 0.8, macroTileBreakup: 0.25 },
      ],
    }];
    expect(decodeBoard(encodeBoard(emptyBoard({ generatedRegions })))!.generatedRegions).toEqual(generatedRegions);
  });

  it('round-trips saved Forest instances with their area, weighted recipe, and rerun settings', () => {
    const forests: EditorBoard['forests'] = [{
      id: 'forest-1',
      name: 'North woods',
      bounds: { minX: -2, minY: -1, maxX: 5, maxY: 6 },
      sections: [{
        id: 'section-1',
        relationship: 'distinct',
        trees: [
          { id: 'tree-1', sourceArtId: 'oak-tree', weight: 3.5 },
          { id: 'tree-2', sourceArtId: 'fern', weight: 1 },
        ],
        density: 2.4,
        jitter: 0.7,
        scaleMin: 0.65,
        scaleMax: 1.45,
        randomFacing: false,
        facing: 'north-east',
        spacing: 34,
        clumping: 0.6,
        falloff: 0.25,
      }],
      fixedSeed: true,
      seed: 7331,
    }];
    expect(decodeBoard(encodeBoard(emptyBoard({ forests })))!.forests).toEqual(forests);
  });

  it('round-trips the explicit fixed-seed opt-in for saved Towns', () => {
    const towns: EditorBoard['towns'] = [{
      id: 'town-1',
      name: 'Crossroads',
      bounds: { minX: 1, minY: 1, maxX: 8, maxY: 8 },
      sections: [{
        id: 'section-1',
        relationship: 'distinct',
        plan: 'linear',
        size: 12,
        buildings: [{ id: 'building-1', sourceArtId: 'cottage', weight: 1 }],
        scaleMean: 1,
        scaleMin: 0.75,
        scaleMax: 1.35,
        plotWidth: 110,
        landmarkIds: [],
        setback: 78,
        looseness: 0.45,
        facingWobble: 0.2,
        spacing: 10,
        fit: 'shrink',
      }],
      fixedSeed: true,
      seed: 4217,
    }];
    expect(decodeBoard(encodeBoard(emptyBoard({ towns })))!.towns).toEqual(towns);
  });

  it('round-trips zero-Section Town and Forest recipes as valid unfinished authoring state', () => {
    const towns: EditorBoard['towns'] = [{
      id: 'town-empty',
      name: 'Empty town',
      bounds: { minX: 1, minY: 1, maxX: 5, maxY: 5 },
      sections: [],
      seed: 10,
    }];
    const forests: EditorBoard['forests'] = [{
      id: 'forest-empty',
      name: 'Empty forest',
      bounds: { minX: 0, minY: 0, maxX: 4, maxY: 4 },
      sections: [],
      seed: 11,
    }];
    const decoded = decodeBoard(encodeBoard(emptyBoard({ towns, forests })))!;
    expect(decoded.towns).toEqual(towns);
    expect(decoded.forests).toEqual(forests);
  });

  it('normalizes previously saved global Forest settings into one explicit Section', () => {
    const legacyForest = {
      id: 'forest-old', name: 'Old woods', bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
      trees: [{ id: 'tree-1', sourceArtId: 'oak-tree', weight: 2 }],
      density: 2.1, jitter: 0.7, scaleMin: 0.8, scaleMax: 1.4, randomFacing: true,
      facing: 'south', spacing: 30, clumping: 0.6, falloff: 0.2, seed: 8,
    };
    const decoded = decodeBoard(encodeBoard(emptyBoard({ forests: [legacyForest] as never })))!;
    expect(decoded.forests).toEqual([expect.objectContaining({
      id: 'forest-old',
      sections: [expect.objectContaining({
        relationship: 'distinct', density: 2.1, trees: legacyForest.trees,
      })],
    })]);
  });

  it('normalizes a global Town Plan into complete Section-local approaches', () => {
    const legacyTown = {
      id: 'town-old', name: 'Old town', bounds: { minX: 0, minY: 0, maxX: 10, maxY: 8 },
      plan: 'green', size: 12, blend: 0.8, landmarkIds: ['windmill'], setback: 70,
      looseness: 0.3, facingWobble: 0.1, spacing: 12, fit: 'shrink', seed: 9,
      sections: [
        { id: 'homes', buildings: [{ id: 'home', sourceArtId: 'cottage', weight: 1 }], share: 3, scaleMean: 1, scaleMin: 0.8, scaleMax: 1.2, plotWidth: 100 },
        { id: 'mills', buildings: [{ id: 'mill', sourceArtId: 'windmill', weight: 1 }], share: 1, scaleMean: 1.2, scaleMin: 1, scaleMax: 1.5, plotWidth: 130 },
      ],
    };
    const decoded = decodeBoard(encodeBoard(emptyBoard({ towns: [legacyTown] as never })))!;
    expect(decoded.towns?.[0].sections).toEqual([
      expect.objectContaining({ id: 'homes', relationship: 'distinct', plan: 'green', size: 9, landmarkIds: ['windmill'] }),
      expect.objectContaining({ id: 'mills', relationship: 'mixed', plan: 'green', size: 3, landmarkIds: [] }),
    ]);
  });

  it('round-trips macrotile placements', () => {
    const macroTiles = [
      { assetId: 'grass-soft-bands-3x3', x: 1, y: 1, breaks: [1, 4, 7] },
      { assetId: 'future-macrotile', x: 4, y: 3, breaks: [2, 8] },
    ];
    const decoded = decodeBoard(encodeBoard(emptyBoard({ macroTiles })))!;
    expect(decoded.macroTiles).toEqual(macroTiles);
  });

  it('encodes a macrotile-free board byte-identically to a code that predates macrotiles', () => {
    expect(encodeBoard(emptyBoard({ macroTiles: [] }))).toBe(encodeBoard(emptyBoard()));
    expect(decodeBoard(encodeBoard(emptyBoard()))!.macroTiles).toEqual([]);
  });

  it('round-trips cover type overrides for grass painted on non-grass tiles', () => {
    const board = emptyBoard({
      cells: { '0,0': 'stone-surf-0' },
      cover: { '0,0': 'filled' },
      coverTypes: { '0,0': 'grass' },
    });

    expect(decodeBoard(encodeBoard(board))!.coverTypes).toEqual(board.coverTypes);
  });

  it('encodes a generated-region-free board byte-identically to a code that predates region units', () => {
    expect(encodeBoard(emptyBoard({ generatedRegions: [] }))).toBe(encodeBoard(emptyBoard()));
    expect(decodeBoard(encodeBoard(emptyBoard()))!.generatedRegions).toEqual([]);
  });

  it('omits an empty saved-Forest channel and decodes it as an empty list', () => {
    expect(encodeBoard(emptyBoard({ forests: [] }))).toBe(encodeBoard(emptyBoard()));
    expect(decodeBoard(encodeBoard(emptyBoard()))!.forests).toEqual([]);
  });

  it('round-trips a pre-drawn board as a semantic media slot plus canonical review frame', () => {
    const surface: NonNullable<EditorBoard['surface']> = {
      kind: 'predrawn',
      slot: 'boards/fortress-gate/plate.png',
      frameWidth: 950,
      frameHeight: 565,
    };
    const code = encodeBoard(emptyBoard({ surface }));
    expect(decodeWire(code).pd).toEqual(['boards/fortress-gate/plate.png', 950, 565]);
    expect(decodeBoard(code)?.surface).toEqual(surface);
  });

  it('round-trips an exact immutable background and optional occlusion version', () => {
    const surface: NonNullable<EditorBoard['surface']> = {
      kind: 'predrawn',
      schemaVersion: 2,
      backgroundVersionId: '11111111-1111-4111-8111-111111111111',
      occlusionVersionId: '22222222-2222-4222-8222-222222222222',
      frameWidth: 1240,
      frameHeight: 700,
      worldBounds: { minX: -620, minY: -350, width: 1240, height: 700 },
    };
    const code = encodeBoard(emptyBoard({ backgroundMode: 'ai', surface }));
    expect(decodeWire(code).bm).toBe('ai');
    expect(decodeWire(code).pd).toEqual([
      2,
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      1240,
      700,
      -620,
      -350,
      1240,
      700,
    ]);
    expect(decodeBoard(code)).toMatchObject({ backgroundMode: 'ai', surface });
  });

  it('round-trips an exact schema-v3 background with its sparse cyan move-highlight profile', () => {
    const surface: NonNullable<EditorBoard['surface']> = {
      kind: 'predrawn',
      schemaVersion: 3,
      backgroundVersionId: '11111111-1111-4111-8111-111111111111',
      occlusionVersionId: '22222222-2222-4222-8222-222222222222',
      frameWidth: 1240,
      frameHeight: 700,
      worldBounds: { minX: -620, minY: -350, width: 1240, height: 700 },
      moveHighlightProfile: {
        schema: 'predrawn-move-highlight-profile-v1',
        backgroundVersionId: '11111111-1111-4111-8111-111111111111',
        coordinateBasis: 'cell-diamond-10000-v1',
        environmentGeometrySha256: 'a'.repeat(64),
        profileSha256: 'b'.repeat(64),
        cells: {
          '3,2': [5000, 500, 9500, 5000, 5000, 9500, 500, 5000],
          '1,2': [5000, 1000, 9000, 5000, 5000, 9000, 1000, 5000],
        },
      },
    };
    const code = encodeBoard(emptyBoard({ backgroundMode: 'ai', surface }));

    expect(decodeWire(code).pd).toEqual([
      3,
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      1240,
      700,
      -620,
      -350,
      1240,
      700,
      [
        'a'.repeat(64),
        'b'.repeat(64),
        [
          ['1,2', 5000, 1000, 9000, 5000, 5000, 9000, 1000, 5000],
          ['3,2', 5000, 500, 9500, 5000, 5000, 9500, 500, 5000],
        ],
      ],
    ]);
    expect(decodeBoard(code)).toMatchObject({ backgroundMode: 'ai', surface });
  });

  it('fails a schema-v3 surface closed when its move-highlight profile targets another raster', () => {
    const code = encodeBoard(emptyBoard({
      backgroundMode: 'ai',
      surface: {
        kind: 'predrawn',
        schemaVersion: 3,
        backgroundVersionId: '11111111-1111-4111-8111-111111111111',
        frameWidth: 1240,
        frameHeight: 700,
        worldBounds: { minX: -620, minY: -350, width: 1240, height: 700 },
        moveHighlightProfile: {
          schema: 'predrawn-move-highlight-profile-v1',
          backgroundVersionId: '22222222-2222-4222-8222-222222222222',
          coordinateBasis: 'cell-diamond-10000-v1',
          environmentGeometrySha256: 'a'.repeat(64),
          profileSha256: 'b'.repeat(64),
          cells: {
            '1,2': [5000, 1000, 9000, 5000, 5000, 9000, 1000, 5000],
          },
        },
      },
    }));

    expect(decodeBoard(code)).toMatchObject({ backgroundMode: 'ai', surface: undefined });
  });

  it('retains a remembered immutable AI selection while legacy tiles remain active', () => {
    const surface: NonNullable<EditorBoard['surface']> = {
      kind: 'predrawn',
      schemaVersion: 2,
      backgroundVersionId: '11111111-1111-4111-8111-111111111111',
      occlusionVersionId: '22222222-2222-4222-8222-222222222222',
      frameWidth: 1240,
      frameHeight: 700,
      worldBounds: { minX: -620, minY: -350, width: 1240, height: 700 },
    };
    const code = encodeBoard(emptyBoard({ backgroundMode: 'legacy', surface }));

    expect(decodeWire(code).bm).toBe('legacy');
    expect(decodeBoard(code)).toMatchObject({ backgroundMode: 'legacy', surface });
  });

  it('round-trips the persisted Fortress Gate v4 whole-plate registration', () => {
    const surface: NonNullable<EditorBoard['surface']> = {
      kind: 'predrawn',
      slot: 'boards/fortress-gate/plate.png',
      frameWidth: 1672,
      frameHeight: 941,
      registration: {
        sourceWidth: 1672,
        sourceHeight: 941,
        north: [1034.223, 96.015],
        east: [1375.402, 300.134],
        south: [611.986, 723.847],
        west: [281.123, 532.992],
        gridColumns: 5,
        gridRows: 11,
        columnGuides: [0, 0.2, 0.4, 0.6, 0.8, 1],
        rowGuides: [0, 0.090909, 0.181818, 0.272727, 0.363636, 0.454545, 0.545455, 0.636364, 0.727273, 0.818182, 0.909091, 1],
        boundaryReference: {
          north: [1020.229, 112.223],
          east: [1346.622, 295.818],
          south: [628.558, 699.729],
          west: [302.166, 516.133],
        },
      },
    };

    const code = encodeBoard(emptyBoard({ surface }));
    expect(decodeWire(code).pd).toEqual([
      'boards/fortress-gate/plate.png',
      1672,
      941,
      'v4;1672,941,1034.223,96.015,1375.402,300.134,611.986,723.847,281.123,532.992;5,11;0,0.2,0.4,0.6,0.8,1;0,0.090909,0.181818,0.272727,0.363636,0.454545,0.545455,0.636364,0.727273,0.818182,0.909091,1;1020.229,112.223,1346.622,295.818,628.558,699.729,302.166,516.133',
    ]);
    expect(decodeBoard(code)?.surface).toEqual(surface);
  });

  it('migrates a mode-less pre-drawn record to explicit AI mode without changing its surface', () => {
    const legacyCode = encodeWire({
      c: 6,
      r: 5,
      pd: ['boards/fortress-gate/plate.png', 950, 565],
    });
    const decoded = decodeBoard(legacyCode)!;

    expect(decoded.surface).toEqual({
      kind: 'predrawn',
      slot: 'boards/fortress-gate/plate.png',
      frameWidth: 950,
      frameHeight: 565,
    });
    expect(decoded.backgroundMode).toBe('ai');
    expect(decodeWire(encodeBoard(decoded))).toMatchObject({
      bm: 'ai',
      pd: ['boards/fortress-gate/plate.png', 950, 565],
    });
  });

  it('persists explicit legacy mode for an ordinary board without a remembered surface', () => {
    const code = encodeBoard(emptyBoard());

    expect(decodeWire(code).bm).toBe('legacy');
    expect(decodeBoard(code)?.backgroundMode).toBe('legacy');
  });

  it('preserves an explicit unavailable AI mode instead of falling back to legacy pixels', () => {
    const missingSurfaceCode = encodeBoard(emptyBoard({ backgroundMode: 'ai' }));
    expect(decodeWire(missingSurfaceCode).bm).toBe('ai');
    expect(decodeBoard(missingSurfaceCode)).toMatchObject({
      backgroundMode: 'ai',
      surface: undefined,
    });

    const malformedSurfaceCode = encodeWire({
      c: 6,
      r: 5,
      bm: 'ai',
      pd: [2, 'not-a-version-id', null, 1240, 700, -620, -350, 1240, 700],
    });
    expect(decodeBoard(malformedSurfaceCode)).toMatchObject({
      backgroundMode: 'ai',
      surface: undefined,
    });
    expect(decodeWire(encodeBoard(decodeBoard(malformedSurfaceCode)!)).bm).toBe('ai');
  });

  it('drops malformed persisted alignment while retaining a valid plate surface', () => {
    const decoded = decodeBoard(encodeWire({
      c: 6,
      r: 5,
      pd: ['boards/fortress-gate/plate.png', 950, 565, 'v4;not-valid'],
    }));

    expect(decoded?.surface).toEqual({
      kind: 'predrawn',
      slot: 'boards/fortress-gate/plate.png',
      frameWidth: 950,
      frameHeight: 565,
    });
  });

  it('drops malformed pre-drawn surface records instead of persisting arbitrary URLs', () => {
    const decoded = decodeBoard(encodeWire({
      c: 6,
      r: 5,
      pd: ['https://example.com/board.png', 950, 565],
    }));
    expect(decoded?.surface).toBeUndefined();
  });

  it('round-trips a hand-placed grid without changing the code of a board that never moved one', () => {
    const placed = emptyBoard({
      predrawnGridDetached: true,
      predrawnPlateOffset: { left: -96, top: 48 },
    });
    const decoded = decodeBoard(encodeBoard(placed));
    expect(decoded?.predrawnGridDetached).toBe(true);
    expect(decoded?.predrawnPlateOffset).toEqual({ left: -96, top: 48 });

    // Every existing level keeps byte-identical code: the fields are written only when set, and a
    // zero offset is the same statement as no offset at all.
    expect(encodeBoard(emptyBoard({ predrawnPlateOffset: { left: 0, top: 0 } })))
      .toBe(encodeBoard(emptyBoard()));
    expect(encodeBoard(emptyBoard({ predrawnGridDetached: false })))
      .toBe(encodeBoard(emptyBoard()));
    expect(decodeWire(encodeBoard(emptyBoard())).ppo).toBeUndefined();
    expect(decodeBoard(encodeBoard(emptyBoard()))?.predrawnGridDetached).toBe(false);
  });
});

describe('live obstacles standing on a plate (ADR-0534)', () => {
  const withRocks = (over: Partial<EditorBoard> = {}): EditorBoard => emptyBoard({
    props: { '1,1': { propId: 'oak' }, '3,3': { propId: 'rock' } },
    ...over,
  });

  it('round-trips the anchors marked as standing on the artwork', () => {
    const decoded = decodeBoard(encodeBoard(withRocks({ liveProps: ['3,3'] })));
    expect(decoded?.props).toEqual({ '1,1': { propId: 'oak' }, '3,3': { propId: 'rock' } });
    expect(decoded?.liveProps).toEqual(['3,3']);
  });

  it('encodes a board with no live obstacle byte-identically to a code that predates them', () => {
    // The field is additive: every level authored before it keeps its exact bytes, which is what
    // makes this a no-migration change.
    expect(encodeBoard(withRocks())).toBe(encodeBoard(withRocks({ liveProps: [] })));
    expect(encodeBoard(emptyBoard())).toBe(encodeBoard(emptyBoard({ liveProps: [] })));
    expect(decodeWire(encodeBoard(withRocks()))).not.toHaveProperty('lp');
  });

  it('normalizes the marker set so the same board always encodes the same bytes', () => {
    expect(encodeBoard(withRocks({ liveProps: ['3,3', '3,3'] })))
      .toBe(encodeBoard(withRocks({ liveProps: ['3,3'] })));
    // A marker for a prop that is no longer placed is dropped rather than carried.
    expect(decodeBoard(encodeBoard(withRocks({ liveProps: ['3,3', '4,4'] })))?.liveProps)
      .toEqual(['3,3']);
    expect(decodeBoard(encodeBoard(emptyBoard({ liveProps: ['3,3'] })))?.liveProps).toBeUndefined();
  });
});
