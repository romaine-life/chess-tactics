import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import {
  buildPredrawnGenerationArtifacts,
  buildPredrawnGenerationPrompt,
  normalizePredrawnGenerationDefinition,
} from './build-predrawn-generation-run.mjs';

function syntheticPng(width = 160, height = 90) {
  const png = new PNG({ width, height });
  png.data.fill(255);
  return PNG.sync.write(png);
}

const referenceViewport = {
  version: 1,
  coordinateSpace: 'canonical-board-render-px-1x',
  x: -80,
  y: -45,
  width: 160,
  height: 90,
};

const fortressGateSurfaceRows = [
  ['S', 'S', 'S', 'S', 'S'],
  ['S', 'S', 'S', 'S', 'S'],
  ['S', 'S', 'S', 'S', 'S'],
  ['S', 'S', 'S', 'S', 'S'],
  ['S', 'S', 'S', 'S', 'S'],
  ['T', 'T', 'T', 'T', 'T'],
  ['S', 'S', 'S', 'S', 'S'],
  ['S', 'S', 'S', 'S', 'S'],
  ['S', 'S', 'S', 'S', 'S'],
  ['S', 'S', 'S', 'S', 'S'],
  ['S', 'S', 'S', 'S', 'S'],
];
const fortressGateRoads = [
  { id: 'A', cells: [[1, 5], [1, 4], [1, 3], [2, 3], [3, 3], [4, 3]], exit: [[4, 3], [5, 3]] },
  { id: 'B', cells: [[3, 5], [3, 6], [3, 7], [3, 8], [4, 8], [4, 9], [4, 10]], exit: [[4, 10], [4, 11]] },
];
const fortressGateBarrierEdges = [
  [[0, 5], [0, 6]], [[1, 5], [1, 6]], [[1, 5], [2, 5]], [[0, 4], [0, 5]],
  [[4, 5], [4, 6]], [[4, 4], [4, 5]], [[3, 4], [3, 5]], [[2, 5], [3, 5]],
];

const fortressGate = {
  schemaVersion: 3,
  runId: 'fortress-gate-generic-builder-test',
  levelId: 'off-l-fortress-gate',
  reference: {
    sourceSlot: 'canonical-level-export/off-l-fortress-gate/authored-surface-no-cover',
    viewport: referenceViewport,
  },
  request: {
    provider: 'openai', model: 'imagegen-current', mode: 'isolated-top-only', referenceCount: 1,
    aspectRatio: '16:9',
  },
  board: {
    columns: 5,
    rows: 11,
    projection: {
      kind: 'the canonical parallel orthographic board plane',
      axisX: 'down-right following the canonical x axis',
      axisY: 'down-left following the canonical y axis',
      stepLengthRule: 'preserve the exact canonical x and y step vectors',
    },
    coordinateConvention: {
      order: '(x,y)',
      xAxis: 'x follows the down-right screen axis',
      yAxis: 'y follows the down-left screen axis',
    },
    surfaceDefinitions: {
      S: 'flat passable ordinary terrain whose appearance comes from Image 1',
      T: 'flat passable fortified surface at the authored elevation',
    },
    cells: fortressGateSurfaceRows.map((row) => row.map((surface) => ({
      surface,
      elevation: 0,
      playable: true,
    }))),
  },
  linearFeatures: fortressGateRoads.map((road) => ({
    id: road.id,
    kind: 'road',
    cells: road.cells,
    connections: road.cells.slice(1).map((cell, index) => [road.cells[index], cell]),
    exits: [road.exit],
  })),
  barriers: fortressGateBarrierEdges.map(([a, b], index) => ({
    id: `fence-${index + 1}`,
    kind: 'fence',
    a,
    b,
    blocksCrossing: true,
  })),
  footprints: [
    { id: 'fieldstone', kind: 'prop', sourceId: 'fieldstone', cells: [[0, 5]], traversal: 'impassable' },
    { id: 'cottage-small', kind: 'prop', sourceId: 'cottage-small', cells: [[4, 5]], traversal: 'impassable' },
  ],
  outerPerimeter: { edges: rectangularEnvelope(5, 11), openings: [] },
  impassableTransitions: [],
};

const holdBridgeSurfaceRows = [
  ['road', 'road', 'road', 'road', 'road', 'void', 'void', 'road', 'sand', 'sand', 'grass', 'road'],
  ['road', 'grass', 'grass', 'sand', 'road', 'void', 'grass', 'road', 'grass', 'grass', 'grass', 'road'],
  ['road', 'grass', 'grass', 'grass', 'road', 'void', 'void', 'road', 'grass', 'grass', 'grass', 'road'],
  ['road', 'grass', 'grass', 'grass', 'road', 'stone', 'stone', 'road', 'grass', 'grass', 'grass', 'road'],
  ['road', 'grass', 'grass', 'grass', 'road', 'stone', 'stone', 'road', 'grass', 'grass', 'grass', 'road'],
  ['road', 'grass', 'grass', 'grass', 'road', 'void', 'void', 'road', 'grass', 'grass', 'grass', 'road'],
  ['road', 'grass', 'grass', 'grass', 'road', 'grass', 'void', 'road', 'grass', 'grass', 'stone', 'road'],
  ['road', 'stone', 'sand', 'grass', 'road', 'void', 'void', 'road', 'road', 'road', 'road', 'road'],
];

const holdBridgeRoadCells = holdBridgeSurfaceRows.flatMap((row, y) => (
  row.flatMap((surface, x) => surface === 'road' ? [[x, y]] : [])
));

const key = ([x, y]) => `${x},${y}`;
const pairKey = (a, b) => [key(a), key(b)].sort().join('|');

function holdBridgeConnections() {
  const present = new Set(holdBridgeRoadCells.map(key));
  const cuts = new Set([
    pairKey([4, 2], [4, 3]),
    pairKey([7, 4], [7, 5]),
  ]);
  return holdBridgeRoadCells.flatMap(([x, y]) => (
    [[x + 1, y], [x, y + 1]].flatMap((neighbor) => (
      present.has(key(neighbor)) && !cuts.has(pairKey([x, y], neighbor)) ? [[ [x, y], neighbor ]] : []
    ))
  ));
}

function rectangularEnvelope(columns, rows) {
  const edges = [];
  for (let x = 0; x < columns; x += 1) {
    edges.push({ cell: [x, 0], neighbor: [x, -1] });
    edges.push({ cell: [x, rows - 1], neighbor: [x, rows] });
  }
  for (let y = 0; y < rows; y += 1) {
    edges.push({ cell: [0, y], neighbor: [-1, y] });
    edges.push({ cell: [columns - 1, y], neighbor: [columns, y] });
  }
  return edges;
}

function playableVoidTransitions(rows) {
  const edges = [];
  for (let y = 0; y < rows.length; y += 1) {
    for (let x = 0; x < rows[y].length; x += 1) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (ny >= rows.length || nx >= rows[y].length) continue;
        if ((rows[y][x] === 'void') !== (rows[ny][nx] === 'void')) edges.push({ a: [x, y], b: [nx, ny] });
      }
    }
  }
  return edges;
}

function holdBridgeDefinition() {
  return {
    schemaVersion: 3,
    runId: 'hold-bridge-generic-builder-test',
    levelId: 'off-l-hold-bridge',
    reference: {
      sourceSlot: 'canonical-level-export/off-l-hold-bridge/authored-surface-no-cover',
      viewport: referenceViewport,
    },
    request: {
      provider: 'openai', model: 'imagegen-current', mode: 'isolated-top-only', referenceCount: 1,
      aspectRatio: '16:9',
    },
    board: {
      columns: 12,
      rows: 8,
      projection: {
        kind: 'parallel-orthographic-isometric',
        axisX: { screenDx: 48, screenDy: 27 },
        axisY: { screenDx: -48, screenDy: 27 },
        stepLengthRule: 'equal-projected-step-lengths',
      },
      coordinateConvention: {
        order: '(x,y)',
        xAxis: 'x follows the down-right screen axis',
        yAxis: 'y follows the down-left screen axis',
      },
      surfaceDefinitions: {
        grass: 'playable grass terrain',
        road: 'playable terrain carrying the authored road feature',
        sand: 'playable sand terrain',
        stone: 'playable stone terrain',
        void: 'non-playable void terrain',
      },
      cells: holdBridgeSurfaceRows.map((row) => row.map((surface) => ({
        surface,
        elevation: 0,
        playable: surface !== 'void',
      }))),
    },
    linearFeatures: [{
      id: 'authored-road-network',
      kind: 'road',
      // Deliberately reverse the set. List order must not be treated as a path.
      cells: [...holdBridgeRoadCells].reverse(),
      connections: holdBridgeConnections().reverse(),
      exits: [
        [[7, 4], [6, 4]],
        [[7, 3], [6, 3]],
        [[4, 3], [5, 3]],
        [[4, 4], [5, 4]],
      ],
    }],
    barriers: [],
    footprints: [],
    outerPerimeter: { edges: rectangularEnvelope(12, 8), openings: [] },
    impassableTransitions: playableVoidTransitions(holdBridgeSurfaceRows),
  };
}

describe('pre-drawn generation run builder', () => {
  it('builds Fortress Gate from its definition without Fortress-specific prose or fixed output pixels', () => {
    const artifacts = buildPredrawnGenerationArtifacts(fortressGate, syntheticPng());

    expect(artifacts.prompt).toContain('exact authored 5-column by 11-row battlefield');
    expect(artifacts.prompt).toContain('exactly 5 columns (4 center-to-center x+ steps) and exactly 11 rows (10 center-to-center y+ steps)');
    expect(artifacts.prompt).toContain('EXACT BLOCKING EDGE OBJECTS (8)');
    expect(artifacts.prompt).toContain('EXACT OUTER GRID ENVELOPE (32 edges)');
    expect(artifacts.prompt).not.toMatch(/sixth column|3840|2160|stone-fence|fortified crossing|desert environment/i);
    expect(artifacts.manifest.output).toEqual({
      sizing: 'model-native', aspectRatio: '16:9', mimeType: 'image/png',
    });
    expect(artifacts.manifest.status).toBe('ready-for-generation');
    expect(artifacts.manifest.levelId).toBe('off-l-fortress-gate');
    expect(artifacts.manifest.referenceViewportSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(artifacts.references.references[0]).toMatchObject({
      width: 160,
      height: 90,
      viewport: referenceViewport,
    });
    expect(artifacts.references.references[0].role).toBe(
      'canonical-unit-free-ground-cover-free-authored-surface-art-authority',
    );
  });

  it('uses Hold Bridge canonical dimensions, voids, graph edges, exits, and the complete envelope', () => {
    const definition = holdBridgeDefinition();
    const normalized = normalizePredrawnGenerationDefinition(definition);
    const prompt = buildPredrawnGenerationPrompt(normalized);

    expect(normalized.board.columns).toBe(12);
    expect(normalized.board.rows).toBe(8);
    expect(normalized.board.cells.flat().filter(({ playable }) => !playable)).toHaveLength(10);
    expect(normalized.outerPerimeter.edges).toHaveLength(40);
    expect(normalized.impassableTransitions).toHaveLength(20);
    expect(normalized.linearFeatures[0].cells).toHaveLength(38);
    expect(normalized.linearFeatures[0].exits).toHaveLength(4);
    expect(prompt).toContain('exact authored 12-column by 8-row battlefield');
    expect(prompt).toContain('EXACT 96-CELL CONTENT (86 playable, 10 non-playable)');
    expect(prompt).toContain('EXACT OUTER GRID ENVELOPE (40 edges)');
    expect(prompt).toContain('EXACT INTERNAL PLAYABLE/NON-PLAYABLE TRANSITIONS (20 edges)');
    expect(prompt).toContain('Coordinate set (38 cells; list order has no path meaning)');
    expect(prompt).toContain('(7,4)|(6,4)');
    expect(prompt).toContain('Grid x+: screen vector (48,27) per grid step');
    expect(prompt).toContain('Grid y+: screen vector (-48,27) per grid step');
    expect(prompt).toContain('the x+ and y+ projected step vectors have equal screen length');
    expect(prompt).toContain('terrain tops plus only the explicitly authored Subterrain faces');
    expect(prompt).toContain('do not extrapolate them into a vertical board skirt');
    expect(prompt).toContain("clipped to the owner's saved 16:9 generation frame");
    expect(prompt).toContain('The rectangular Image 1 edge is not the gameplay perimeter');
    expect(prompt).toContain('Do not zoom outward merely to reconstruct omitted scenic margins');
    expect(prompt).not.toMatch(/5-column by 11-row|sixth column|stone-fence|fortified crossing|3840|2160/i);
  });

  it('accepts generated anonymous footprints without leaking their source art id into the prompt', () => {
    const definition = holdBridgeDefinition();
    definition.footprints = [{
      id: 'footprint-1',
      kind: 'prop',
      sourceId: 'internal-prop-source-that-is-not-art-direction',
      cells: [[1, 1], [2, 1]],
      traversal: 'impassable',
    }];
    const artifacts = buildPredrawnGenerationArtifacts(definition, syntheticPng());

    expect(artifacts.prompt).toContain('prop footprint footprint-1 occupies exactly 2 cell(s): (1,1), (2,1)');
    expect(artifacts.prompt).not.toContain('internal-prop-source-that-is-not-art-direction');
    expect(artifacts.packet.footprints[0].sourceId).toBe('internal-prop-source-that-is-not-art-direction');
  });

  it('fails closed when emitted geometry omits an envelope edge or invents a feature connection', () => {
    const missingEnvelopeEdge = holdBridgeDefinition();
    missingEnvelopeEdge.outerPerimeter.edges.pop();
    expect(() => normalizePredrawnGenerationDefinition(missingEnvelopeEdge))
      .toThrow(/outerPerimeter\.edges does not exactly match the 40-edge board-derived set/);

    const inventedConnection = holdBridgeDefinition();
    inventedConnection.linearFeatures[0].connections.push([[0, 0], [0, 1]]);
    expect(() => normalizePredrawnGenerationDefinition(inventedConnection))
      .toThrow(/repeats connection|must join two adjacent cells/);
  });

  it('fails closed when the canonical saved viewport is missing, malformed, or not 16:9', () => {
    const missing = holdBridgeDefinition();
    delete missing.reference.viewport;
    expect(() => normalizePredrawnGenerationDefinition(missing))
      .toThrow(/reference\.viewport is required/);

    const fractional = holdBridgeDefinition();
    fractional.reference.viewport = { ...referenceViewport, x: 0.5 };
    expect(() => normalizePredrawnGenerationDefinition(fractional))
      .toThrow(/reference\.viewport\.x must be a safe integer/);

    const wrongRatio = holdBridgeDefinition();
    wrongRatio.reference.viewport = { ...referenceViewport, width: 161 };
    expect(() => normalizePredrawnGenerationDefinition(wrongRatio))
      .toThrow(/exact 16:9 aspect ratio/);
  });

  it('fails closed when captured PNG bytes do not exactly match the saved viewport', () => {
    expect(() => buildPredrawnGenerationArtifacts(holdBridgeDefinition(), syntheticPng(320, 180)))
      .toThrow(/reference PNG is 320x180, expected the saved generation frame 160x90/);
    expect(() => buildPredrawnGenerationArtifacts(holdBridgeDefinition(), syntheticPng().subarray(0, 32)))
      .toThrow(/reference PNG could not be decoded/);
  });

  it('rejects the retired schema-v2 request path', () => {
    const retired = holdBridgeDefinition();
    retired.schemaVersion = 2;
    expect(() => normalizePredrawnGenerationDefinition(retired))
      .toThrow(/unsupported definition schemaVersion 2/);
  });

  it('rejects an unversioned legacy definition', () => {
    const retired = holdBridgeDefinition();
    delete retired.schemaVersion;
    expect(() => normalizePredrawnGenerationDefinition(retired))
      .toThrow(/unsupported definition schemaVersion <missing>/);
  });
});
