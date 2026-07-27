import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';

export const PREDRAWN_GENERATION_SCHEMA_VERSION = 3;
export const PREDRAWN_REFINEMENT_KIND = 'coplanar-de-tiling';
export const PREDRAWN_SCENERY_REFINEMENT_KIND = 'restore-source-scenery';
const PREDRAWN_REFINEMENT_KINDS = new Set([
  PREDRAWN_REFINEMENT_KIND,
  PREDRAWN_SCENERY_REFINEMENT_KIND,
]);
const NORMALIZED_DEFINITION = Symbol('normalized-predrawn-generation-definition');

function fail(message) {
  throw new Error(`predrawn generation preflight: ${message}`);
}

function nonEmptyText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} is required`);
  return value.trim();
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parsePredrawnGenerationArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) fail(`expected --name value, received ${key ?? '<nothing>'}`);
    args[key.slice(2)] = value;
  }
  for (const required of ['definition', 'reference', 'out']) {
    if (!args[required]) fail(`missing --${required}`);
  }
  if (Boolean(args.candidate) !== Boolean(args.refinement)) {
    fail('--candidate and --refinement must be supplied together');
  }
  if (args.refinement && !PREDRAWN_REFINEMENT_KINDS.has(args.refinement)) {
    fail(`unsupported --refinement ${args.refinement}`);
  }
  if (args.refinement) {
    for (const required of ['parent', 'branch']) {
      if (!args[required]) fail(`refinement requests require --${required}`);
    }
  } else if (args.parent || args.branch) {
    fail('--parent and --branch are valid only with --candidate and --refinement');
  }
  return args;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

const json = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function pngSize(bytes) {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  if (!Buffer.isBuffer(bytes) || bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) {
    fail('reference is not a PNG');
  }
  const header = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (
    header.width < 1
    || header.height < 1
    || header.width > 8192
    || header.height > 8192
  ) {
    fail('reference PNG dimensions must be integers from 1 through 8192');
  }
  let decoded;
  try {
    decoded = PNG.sync.read(bytes, { checkCRC: true });
  } catch (error) {
    fail(`reference PNG could not be decoded: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (decoded.width !== header.width || decoded.height !== header.height) {
    fail('reference PNG decoded dimensions disagree with its IHDR');
  }
  return header;
}

function gcd(a, b) {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right !== 0) [left, right] = [right, left % right];
  return left;
}

function aspectRatio(request) {
  let ratio = nonEmptyText(request?.aspectRatio, 'request.aspectRatio');
  if (!/^\d+:[1-9]\d*$/.test(ratio)) fail('request aspectRatio must use positive W:H integers');
  const [width, height] = ratio.split(':').map(Number);
  const divisor = gcd(width, height);
  ratio = `${width / divisor}:${height / divisor}`;
  if (ratio !== '16:9') fail('pre-drawn full-scene requests use the canonical 16:9 frame');
  return ratio;
}

function canvasMatchesAspectRatio(dimensions, ratio) {
  const [ratioWidth, ratioHeight] = ratio.split(':').map(Number);
  const left = dimensions.width * ratioHeight;
  const right = dimensions.height * ratioWidth;
  return Math.abs(left - right) / Math.max(left, right) <= 0.001;
}

function normalizedReferenceViewport(value) {
  if (!isRecord(value)) fail('reference.viewport is required');
  if (value.version !== 1) fail('reference.viewport.version must be 1');
  if (value.coordinateSpace !== 'canonical-board-render-px-1x') {
    fail('reference.viewport.coordinateSpace must be canonical-board-render-px-1x');
  }
  for (const field of ['x', 'y', 'width', 'height']) {
    if (!Number.isSafeInteger(value[field])) fail(`reference.viewport.${field} must be a safe integer`);
  }
  if (value.width < 1 || value.height < 1 || value.width > 8192 || value.height > 8192) {
    fail('reference.viewport width and height must be integers from 1 through 8192');
  }
  if (value.width * 9 !== value.height * 16) {
    fail('reference.viewport must use the exact 16:9 aspect ratio');
  }
  return {
    version: 1,
    coordinateSpace: 'canonical-board-render-px-1x',
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
  };
}

function coordinate(value, label) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isInteger)) {
    fail(`${label} must be an integer [x,y] coordinate`);
  }
  return [value[0], value[1]];
}

const coordinateKey = ([x, y]) => `${x},${y}`;
const edgeKey = (a, b) => [coordinateKey(a), coordinateKey(b)].sort().join('|');

function adjacent(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}

function edge(value, label) {
  if (Array.isArray(value) && value.length === 2) {
    return { a: coordinate(value[0], `${label} first endpoint`), b: coordinate(value[1], `${label} second endpoint`) };
  }
  if (!isRecord(value)) fail(`${label} must be an edge object or coordinate pair`);
  const a = coordinate(value.a ?? value.cell, `${label} first endpoint`);
  const b = coordinate(value.b ?? value.neighbor, `${label} second endpoint`);
  return { a, b };
}

function normalizedProjectionAxis(value, label, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (isRecord(value) && Number.isFinite(value.screenDx) && Number.isFinite(value.screenDy)) {
    return { screenDx: value.screenDx, screenDy: value.screenDy };
  }
  fail(`${label} must be descriptive text or a {screenDx,screenDy} vector`);
}

function normalizedProjection(board) {
  const source = isRecord(board.projection) ? board.projection : {};
  return {
    kind: typeof source.kind === 'string' && source.kind.trim() ? source.kind.trim() : 'parallel orthographic board plane',
    axisX: normalizedProjectionAxis(source.axisX, 'board.projection.axisX', "the x+ grid direction shown by Image 1"),
    axisY: normalizedProjectionAxis(source.axisY, 'board.projection.axisY', "the y+ grid direction shown by Image 1"),
    stepLengthRule: typeof source.stepLengthRule === 'string' && source.stepLengthRule.trim()
      ? source.stepLengthRule.trim()
      : 'match both projected step vectors in Image 1 exactly',
  };
}

function normalizedCoordinateConvention(board) {
  const source = board.coordinateConvention;
  if (source.order !== '(x,y)') fail('board.coordinateConvention.order must be (x,y)');
  return {
    order: '(x,y)',
    xAxis: nonEmptyText(source.xAxis, 'board.coordinateConvention.xAxis'),
    yAxis: nonEmptyText(source.yAxis, 'board.coordinateConvention.yAxis'),
  };
}

function normalizeCells(board, columns, rows) {
  if (board.cells.length !== rows) fail(`board.cells has ${board.cells.length} rows, expected ${rows}`);
  const surfaces = new Set();
  const cells = board.cells.map((row, y) => {
    if (!Array.isArray(row) || row.length !== columns) {
      fail(`board.cells row ${y} has ${Array.isArray(row) ? row.length : 0} cells, expected ${columns}`);
    }
    return row.map((raw, x) => {
      if (!isRecord(raw)) fail(`board.cells[${y}][${x}] must be an object`);
      const surface = nonEmptyText(raw.surface, `board.cells[${y}][${x}].surface`);
      if (!Number.isInteger(raw.elevation) || raw.elevation < 0) {
        fail(`board.cells[${y}][${x}].elevation must be a non-negative integer`);
      }
      if (typeof raw.playable !== 'boolean') fail(`board.cells[${y}][${x}].playable must be boolean`);
      surfaces.add(surface);
      return { surface, elevation: raw.elevation, playable: raw.playable };
    });
  });
  const definitions = {};
  for (const [surface, meaning] of Object.entries(board.surfaceDefinitions)) {
    definitions[nonEmptyText(surface, 'surface id')] = nonEmptyText(meaning, `surface definition ${surface}`);
  }
  for (const surface of surfaces) {
    if (!(surface in definitions)) fail(`surface ${surface} has no board.surfaceDefinitions entry`);
  }
  return { cells, surfaceDefinitions: definitions };
}

function inBoard([x, y], columns, rows) {
  return x >= 0 && x < columns && y >= 0 && y < rows;
}

export function deriveOuterPerimeterEdges(columns, rows) {
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

export function deriveImpassableTransitions(cells) {
  const rows = cells.length;
  const columns = cells[0]?.length ?? 0;
  const transitions = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= columns || ny >= rows) continue;
        if (cells[y][x].playable !== cells[ny][nx].playable) {
          transitions.push({ a: [x, y], b: [nx, ny] });
        }
      }
    }
  }
  return transitions;
}

function exactEdgeSet(rawEdges, expectedEdges, label, columns, rows, endpointRule) {
  if (rawEdges === undefined) return expectedEdges;
  if (!Array.isArray(rawEdges)) fail(`${label} must be an array`);
  const seen = new Set();
  const normalized = rawEdges.map((raw, index) => {
    const parsed = edge(raw, `${label}[${index}]`);
    if (!adjacent(parsed.a, parsed.b)) fail(`${label}[${index}] endpoints are not adjacent`);
    const oriented = endpointRule(parsed.a, parsed.b, columns, rows);
    if (!oriented) fail(`${label}[${index}] does not satisfy its board-edge contract`);
    const key = edgeKey(oriented.a ?? oriented.cell, oriented.b ?? oriented.neighbor);
    if (seen.has(key)) fail(`${label} repeats edge ${key}`);
    seen.add(key);
    return oriented;
  });
  const expectedKeys = expectedEdges.map((item) => edgeKey(item.cell ?? item.a, item.neighbor ?? item.b)).sort();
  const actualKeys = [...seen].sort();
  if (actualKeys.join('|') !== expectedKeys.join('|')) {
    fail(`${label} does not exactly match the ${expectedKeys.length}-edge board-derived set`);
  }
  return normalized;
}

function normalizeOuterPerimeter(raw, columns, rows) {
  const expected = deriveOuterPerimeterEdges(columns, rows);
  const sourceEdges = raw?.edges;
  const edges = exactEdgeSet(sourceEdges, expected, 'outerPerimeter.edges', columns, rows, (a, b, cols, rowCount) => {
    if (inBoard(a, cols, rowCount) && !inBoard(b, cols, rowCount)) return { cell: a, neighbor: b };
    if (inBoard(b, cols, rowCount) && !inBoard(a, cols, rowCount)) return { cell: b, neighbor: a };
    return null;
  });
  const expectedKeys = new Set(expected.map(({ cell, neighbor }) => edgeKey(cell, neighbor)));
  if (raw?.openings !== undefined && !Array.isArray(raw.openings)) fail('outerPerimeter.openings must be an array');
  const openings = [];
  for (const [index, rawOpening] of (raw?.openings ?? []).entries()) {
    const parsed = edge(rawOpening, `outerPerimeter.openings[${index}]`);
    const key = edgeKey(parsed.a, parsed.b);
    if (!expectedKeys.has(key)) fail(`outerPerimeter opening ${key} is not on the grid envelope`);
    if (openings.some((item) => edgeKey(item.cell, item.neighbor) === key)) fail(`outerPerimeter repeats opening ${key}`);
    const cell = inBoard(parsed.a, columns, rows) ? parsed.a : parsed.b;
    const neighbor = cell === parsed.a ? parsed.b : parsed.a;
    openings.push({ cell, neighbor });
  }
  return { edges, openings };
}

function normalizeImpassableTransitions(raw, cells, columns, rows) {
  const expected = deriveImpassableTransitions(cells);
  return exactEdgeSet(raw, expected, 'impassableTransitions', columns, rows, (a, b, cols, rowCount) => {
    if (!inBoard(a, cols, rowCount) || !inBoard(b, cols, rowCount)) return null;
    if (cells[a[1]][a[0]].playable === cells[b[1]][b[0]].playable) return null;
    return { a, b };
  });
}

function normalizeLinearFeatures(definition, columns, rows) {
  const source = definition.linearFeatures;
  if (!Array.isArray(source)) fail('linearFeatures must be an array');
  const ids = new Set();
  return source.map((raw, index) => {
    if (!isRecord(raw)) fail(`linearFeatures[${index}] must be an object`);
    const id = nonEmptyText(raw.id, `linearFeatures[${index}].id`);
    if (ids.has(id)) fail(`linear feature id ${id} occurs more than once`);
    ids.add(id);
    const kind = nonEmptyText(raw.kind, `linearFeatures[${index}].kind`);
    if (!Array.isArray(raw.cells) || raw.cells.length === 0) fail(`linear feature ${id} has no cells`);
    if (!Array.isArray(raw.connections)) fail(`linear feature ${id} must serialize exact connections`);
    if (!Array.isArray(raw.exits)) fail(`linear feature ${id} must serialize exact exits`);
    const cellSet = new Set();
    const featureCells = raw.cells.map((value, cellIndex) => {
      const cell = coordinate(value, `linear feature ${id} cell ${cellIndex}`);
      if (!inBoard(cell, columns, rows)) fail(`linear feature ${id} contains out-of-board cell ${coordinateKey(cell)}`);
      const key = coordinateKey(cell);
      if (cellSet.has(key)) fail(`linear feature ${id} repeats cell ${key}`);
      cellSet.add(key);
      return cell;
    });
    const connections = [];
    const connectionKeys = new Set();
    const addConnection = (a, b, label) => {
      if (!adjacent(a, b) || !cellSet.has(coordinateKey(a)) || !cellSet.has(coordinateKey(b))) {
        fail(`${label} must join two adjacent cells in linear feature ${id}`);
      }
      const key = edgeKey(a, b);
      if (connectionKeys.has(key)) fail(`linear feature ${id} repeats connection ${key}`);
      connectionKeys.add(key);
      connections.push({ a, b });
    };
    raw.connections.forEach((value, connectionIndex) => {
      const parsed = edge(value, `linear feature ${id} connection ${connectionIndex}`);
      addConnection(parsed.a, parsed.b, `linear feature ${id} connection ${connectionIndex}`);
    });
    const exits = [];
    const exitKeys = new Set();
    for (const [exitIndex, rawExit] of raw.exits.entries()) {
      const parsed = edge(rawExit, `linear feature ${id} exit ${exitIndex}`);
      if (!adjacent(parsed.a, parsed.b)) fail(`linear feature ${id} exit endpoints are not adjacent`);
      const aPresent = cellSet.has(coordinateKey(parsed.a));
      const bPresent = cellSet.has(coordinateKey(parsed.b));
      if (aPresent === bPresent) fail(`linear feature ${id} exit must join one feature cell to one non-feature coordinate`);
      const cell = aPresent ? parsed.a : parsed.b;
      const neighbor = aPresent ? parsed.b : parsed.a;
      const key = edgeKey(cell, neighbor);
      if (exitKeys.has(key)) fail(`linear feature ${id} repeats exit ${key}`);
      exitKeys.add(key);
      exits.push({ cell, neighbor });
    }
    return { id, kind, cells: featureCells, connections, exits };
  });
}

function normalizeBarriers(definition, columns, rows) {
  const source = definition.barriers;
  if (!Array.isArray(source)) fail('barriers must be an array');
  const seen = new Set();
  return source.map((raw, index) => {
    if (!isRecord(raw)) fail(`barriers[${index}] must be an object`);
    const parsed = edge(raw, `barrier ${index}`);
    if (!adjacent(parsed.a, parsed.b)) fail(`barrier ${edgeKey(parsed.a, parsed.b)} endpoints are not adjacent`);
    if (!inBoard(parsed.a, columns, rows) && !inBoard(parsed.b, columns, rows)) {
      fail(`barrier ${edgeKey(parsed.a, parsed.b)} does not touch the board`);
    }
    const key = edgeKey(parsed.a, parsed.b);
    if (seen.has(key)) fail(`barrier ${key} occurs more than once`);
    seen.add(key);
    const id = nonEmptyText(raw.id, `barriers[${index}].id`);
    const kind = nonEmptyText(raw.kind, `barriers[${index}].kind`);
    if (raw.blocksCrossing !== true) fail(`barriers[${index}].blocksCrossing must be true`);
    return {
      id,
      kind,
      a: parsed.a,
      b: parsed.b,
      blocksCrossing: true,
    };
  });
}

function normalizeFootprints(definition, columns, rows) {
  const source = definition.footprints;
  if (!Array.isArray(source)) fail('footprints must be an array');
  const ids = new Set();
  const occupied = new Set();
  return source.map((raw, index) => {
    if (!isRecord(raw)) fail(`footprints[${index}] must be an object`);
    const id = nonEmptyText(raw.id, `footprints[${index}].id`);
    if (ids.has(id)) fail(`footprint id ${id} occurs more than once`);
    ids.add(id);
    const kind = nonEmptyText(raw.kind, `footprints[${index}].kind`);
    const sourceId = nonEmptyText(raw.sourceId, `footprints[${index}].sourceId`);
    const traversal = nonEmptyText(raw.traversal, `footprints[${index}].traversal`);
    const rawCells = raw.cells;
    if (!Array.isArray(rawCells) || rawCells.length === 0) fail(`footprint ${id} has no cells`);
    const footprintCells = rawCells.map((value, cellIndex) => {
      const cell = coordinate(value, `footprint ${id} cell ${cellIndex}`);
      if (!inBoard(cell, columns, rows)) fail(`footprint ${id} leaves the board at ${coordinateKey(cell)}`);
      const key = coordinateKey(cell);
      if (occupied.has(key)) fail(`footprints overlap at ${key}`);
      occupied.add(key);
      return cell;
    });
    return {
      id,
      kind,
      sourceId,
      cells: footprintCells,
      traversal,
    };
  });
}

function normalizeVisualArtwork(definition) {
  const source = definition.visualArtwork ?? [];
  if (!Array.isArray(source)) fail('visualArtwork must be an array');
  const ids = new Set();
  const directions = new Set(['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']);
  return source.map((raw, index) => {
    if (!isRecord(raw)) fail(`visualArtwork[${index}] must be an object`);
    const id = nonEmptyText(raw.id, `visualArtwork[${index}].id`);
    if (ids.has(id)) fail(`visual artwork id ${id} occurs more than once`);
    ids.add(id);
    const sourceId = nonEmptyText(raw.sourceId, `visualArtwork[${index}].sourceId`);
    if (!Array.isArray(raw.positionPx) || raw.positionPx.length !== 2) {
      fail(`visualArtwork[${index}].positionPx must be [pixelX,pixelY]`);
    }
    const positionPx = raw.positionPx.map(Number);
    if (positionPx.some((value) => !Number.isSafeInteger(value))) {
      fail(`visualArtwork[${index}].positionPx must contain safe integer scene pixels`);
    }
    const direction = nonEmptyText(raw.direction, `visualArtwork[${index}].direction`);
    if (!directions.has(direction)) fail(`visualArtwork[${index}].direction is invalid`);
    const scale = Number(raw.scale);
    if (!Number.isFinite(scale) || scale < 0.1 || scale > 8) {
      fail(`visualArtwork[${index}].scale must be from 0.1 through 8`);
    }
    if (raw.gameplay !== 'none') fail(`visualArtwork[${index}].gameplay must be none`);
    return { id, sourceId, positionPx, direction, scale, gameplay: 'none' };
  });
}

export function normalizePredrawnGenerationDefinition(definition) {
  if (!isRecord(definition)) fail('definition must be a JSON object');
  if (definition.schemaVersion !== PREDRAWN_GENERATION_SCHEMA_VERSION) {
    fail(`unsupported definition schemaVersion ${definition.schemaVersion ?? '<missing>'}`);
  }
  for (const prohibited of ['art', 'artDirection', 'biome', 'environment', 'palette', 'lighting', 'style', 'theme', 'atmosphere', 'finish']) {
    if (prohibited in definition) fail(`appearance must come from Image 1; top-level ${prohibited} is prohibited`);
  }
  const runId = nonEmptyText(definition.runId, 'runId');
  const levelId = nonEmptyText(definition.levelId, 'levelId');
  if (!isRecord(definition.reference)) fail('reference is required');
  const sourceSlot = nonEmptyText(definition.reference.sourceSlot, 'reference.sourceSlot');
  const viewport = normalizedReferenceViewport(definition.reference.viewport);
  if (!isRecord(definition.request)) fail('request is required');
  if (definition.request.width !== undefined || definition.request.height !== undefined) {
    fail('schema v3 uses model-native sizing and must not specify fixed output width or height');
  }
  const provider = nonEmptyText(definition.request.provider, 'request.provider');
  const model = nonEmptyText(definition.request.model, 'request.model');
  if (definition.request.referenceCount !== 1) fail('isolated mode requires exactly one reference');
  if (definition.request.mode !== 'isolated-top-only') fail('request mode must be isolated-top-only');
  const outputAspectRatio = aspectRatio(definition.request);
  if (!isRecord(definition.board)) fail('board is required');
  if (!Array.isArray(definition.board.cells)) fail('schema v3 requires board.cells');
  if (!isRecord(definition.board.projection)) fail('schema v3 requires board.projection');
  if (definition.board.projection.axisX === undefined || definition.board.projection.axisY === undefined) {
    fail('schema v3 requires both projected axis vectors');
  }
  nonEmptyText(definition.board.projection.kind, 'board.projection.kind');
  nonEmptyText(definition.board.projection.stepLengthRule, 'board.projection.stepLengthRule');
  if (!isRecord(definition.board.coordinateConvention)) fail('schema v3 requires board.coordinateConvention');
  if (!isRecord(definition.board.surfaceDefinitions)) fail('schema v3 requires board.surfaceDefinitions');
  for (const collection of ['linearFeatures', 'barriers', 'footprints']) {
    if (!Array.isArray(definition[collection])) fail(`schema v3 requires ${collection}`);
  }
  const columns = definition.board.columns;
  const rows = definition.board.rows;
  if (!Number.isInteger(columns) || columns < 1 || columns > 64 || !Number.isInteger(rows) || rows < 1 || rows > 64) {
    fail('board columns and rows must be integers from 1 through 64');
  }
  const normalizedCells = normalizeCells(definition.board, columns, rows);
  const board = {
    columns,
    rows,
    projection: normalizedProjection(definition.board),
    coordinateConvention: normalizedCoordinateConvention(definition.board),
    surfaceDefinitions: normalizedCells.surfaceDefinitions,
    cells: normalizedCells.cells,
  };
  if (!isRecord(definition.outerPerimeter) || !Array.isArray(definition.outerPerimeter.edges)) {
    fail('schema v3 requires outerPerimeter.edges');
  }
  if (!Array.isArray(definition.outerPerimeter.openings)) fail('schema v3 requires outerPerimeter.openings');
  if (!Array.isArray(definition.impassableTransitions)) fail('schema v3 requires impassableTransitions');
  const outerPerimeter = normalizeOuterPerimeter(definition.outerPerimeter, columns, rows);
  const impassableTransitions = normalizeImpassableTransitions(
    definition.impassableTransitions,
    board.cells,
    columns,
    rows,
  );
  const linearFeatures = normalizeLinearFeatures(definition, columns, rows);
  const barriers = normalizeBarriers(definition, columns, rows);
  const footprints = normalizeFootprints(definition, columns, rows);
  const visualArtwork = normalizeVisualArtwork(definition);
  const normalized = {
    schemaVersion: PREDRAWN_GENERATION_SCHEMA_VERSION,
    runId,
    levelId,
    reference: { sourceSlot, viewport },
    request: {
      provider,
      model,
      mode: 'isolated-top-only',
      referenceCount: 1,
      aspectRatio: outputAspectRatio,
    },
    board,
    linearFeatures,
    barriers,
    footprints,
    visualArtwork,
    outerPerimeter,
    impassableTransitions,
  };
  Object.defineProperty(normalized, NORMALIZED_DEFINITION, { value: true });
  return normalized;
}

const formatCoordinates = (coordinates) => coordinates.map((cell) => `(${coordinateKey(cell)})`).join(', ');
const formatEdges = (edges, first = 'a', second = 'b') => edges.length === 0
  ? 'None.'
  : edges.map((item) => `(${coordinateKey(item[first])})|(${coordinateKey(item[second])})`).join('\n');

function formatCells(board) {
  return board.cells.map((row, y) => {
    const cells = row.map((cell) => {
      const semantic = cell.semanticTokens?.join('+') ?? cell.surface;
      const elevation = cell.elevation === null ? '' : `@z${cell.elevation}`;
      return `${semantic}${elevation}${cell.playable ? '' : '[NON-PLAYABLE]'}`;
    });
    return `y=${y}: ${cells.join(', ')}`;
  }).join('\n');
}

function formatSurfaceDefinitions(board) {
  const entries = Object.entries(board.surfaceDefinitions);
  if (entries.length === 0) {
    return 'Surface ids in the matrix are canonical gameplay ids. Their visible treatment comes only from Image 1.';
  }
  return entries.map(([token, meaning]) => `${token} = ${meaning}`).join('\n');
}

function formatLinearFeatures(features) {
  if (features.length === 0) return 'None. Do not add a road, river, or other linear feature.';
  return features.map((feature) => {
    const exits = feature.exits.length === 0
      ? 'No forced edge exits or stubs.'
      : `Forced edge exits/stubs:\n${formatEdges(feature.exits, 'cell', 'neighbor')}`;
    return `${feature.kind} feature (id: ${feature.id})
Coordinate set (${feature.cells.length} cells; list order has no path meaning):
${formatCoordinates(feature.cells)}
Exact connected shared edges (${feature.connections.length}):
${formatEdges(feature.connections)}
${exits}${feature.note ? `\n${feature.note}` : ''}`;
  }).join('\n\n');
}

function formatBarriers(barriers) {
  if (barriers.length === 0) return 'None. Do not add a fence, wall, gate, or other blocking edge object.';
  return barriers.map((barrier) => (
    `${barrier.id}: ${barrier.kind} at (${coordinateKey(barrier.a)})|(${coordinateKey(barrier.b)}); crossing is blocked.`
  )).join('\n');
}

function formatFootprints(footprints) {
  if (footprints.length === 0) {
    return 'No gameplay-authoritative fixed footprint is declared. Do not invent one. Scenic-only objects visibly authored in Image 1 are appearance, not gameplay footprints; preserve them rather than removing them.';
  }
  return footprints.map((footprint) => (
    `${footprint.kind} footprint ${footprint.id} occupies exactly ${footprint.cells.length} cell(s): ${formatCoordinates(footprint.cells)}. Traversal: ${footprint.traversal}.`
  )).join('\n');
}

function formatVisualArtwork(artwork) {
  if (artwork.length === 0) return 'None.';
  return artwork.map((placement) => (
    `${placement.id}: visible landmark centered at scene pixel (${placement.positionPx[0]},${placement.positionPx[1]}), rendered view ${placement.direction}, source scale ${placement.scale}; gameplay: none.`
  )).join('\n');
}

function formatOuterPerimeter(perimeter) {
  const byCell = new Map();
  for (const { cell, neighbor } of perimeter.edges) {
    const key = coordinateKey(cell);
    const values = byCell.get(key) ?? [];
    values.push(`toward (${coordinateKey(neighbor)})`);
    byCell.set(key, values);
  }
  return [...byCell.entries()].map(([cell, directions]) => `(${cell}): ${directions.join(', ')}`).join('\n');
}

function formatProjectionKind(kind) {
  return kind === 'parallel-orthographic-isometric'
    ? 'a parallel orthographic isometric board plane'
    : kind;
}

function formatProjectionAxis(axis) {
  return typeof axis === 'string'
    ? axis
    : `screen vector (${axis.screenDx},${axis.screenDy}) per grid step`;
}

function formatStepLengthRule(rule) {
  return rule === 'equal-projected-step-lengths'
    ? 'the x+ and y+ projected step vectors have equal screen length'
    : rule;
}

export function buildPredrawnGenerationPrompt(inputDefinition, options = {}) {
  const definition = inputDefinition?.[NORMALIZED_DEFINITION]
    ? inputDefinition
    : normalizePredrawnGenerationDefinition(inputDefinition);
  const { board, request } = definition;
  const promptMode = options.mode ?? 'isolated';
  if (promptMode !== 'isolated' && !PREDRAWN_REFINEMENT_KINDS.has(promptMode)) {
    fail(`unsupported prompt mode ${promptMode}`);
  }
  const isRefinement = PREDRAWN_REFINEMENT_KINDS.has(promptMode);
  const isDetilingRefinement = promptMode === PREDRAWN_REFINEMENT_KIND;
  const isSceneryRefinement = promptMode === PREDRAWN_SCENERY_REFINEMENT_KIND;
  const totalCells = board.columns * board.rows;
  const playableCells = board.cells.flat().filter((cell) => cell.playable).length;
  const nonPlayableCells = totalCells - playableCells;
  const openings = definition.outerPerimeter.openings.length === 0
    ? 'No separate outer-envelope opening is declared. Preserve any authored crossing only where the exact feature graph and Image 1 show it.'
    : `Outer-envelope openings are exactly:\n${formatEdges(definition.outerPerimeter.openings, 'cell', 'neighbor')}`;
  const opening = isDetilingRefinement
    ? `Use case: precise-object-edit
Asset type: surgical refinement of a full-screen ${request.aspectRatio} tactical-game battlefield candidate

NAMED COMPARATIVE REFINEMENT BRANCH
This is a coplanar-de-tiling refinement of an owner-reviewed candidate. It is not an isolated-pipeline result. Change only the rejected flat-terrain tile boundaries; do not regenerate or recompose the scene.

PRIMARY EDIT
Paint through the cell-shaped boundaries on coplanar terrain so every flat material reads as part of one continuous landscape. Restrict changes to those hard polygonal transitions and the narrow blend zones around them. Keep local texture crisp; do not blur the whole image.

FRAME AND COMPOSITION
Preserve Image 2's exact canvas, framing, camera, projection, board scale, outer boundary, and camera room. Do not crop, resize, zoom, pan, rotate, or move any scene element.`
    : isSceneryRefinement
      ? `Use case: precise-object-edit
Asset type: surgical restoration of source-authored scenery in a full-screen ${request.aspectRatio} tactical-game battlefield candidate

NAMED COMPARATIVE REFINEMENT BRANCH
This is a restore-source-scenery refinement of an owner-reviewed candidate. It is not an isolated-pipeline result. Restore only scenic buildings, structures, and props that are visibly authored in Image 1 but missing from Image 2. Do not regenerate or recompose the scene.

PRIMARY EDIT
At the corresponding source-authored positions and scales, restore the missing houses, buildings, and other discrete scenic props from Image 1, rendered coherently in Image 2's existing finish. Add only objects actually visible in Image 1. Preserve all of Image 2's terrain painting, roads, waterways, vegetation, cliffs, lighting, palette, and composition.

FRAME AND COMPOSITION
Preserve Image 2's exact canvas, framing, camera, projection, board scale, outer boundary, and camera room. Do not crop, resize, zoom, pan, rotate, or move any existing scene element.`
    : `Use case: stylized-concept
Asset type: full-screen ${request.aspectRatio} tactical-game battlefield art at the model's native output size

PRIMARY REQUEST
Paint one continuous, polished environment containing the exact authored ${board.columns}-column by ${board.rows}-row battlefield described below. Make the complete outer grid envelope—but not its internal cell tessellation—unmistakable through a coherent in-world environmental boundary, while the surrounding environment continues naturally to every edge of the frame. Derive environment, materials, palette, lighting, texture language, and finish only from Image 1; do not assign a named biome or independent style in text.

CAMERA-ROOM FRAME
Use the model's native ${request.aspectRatio} output dimensions. Do not resize or upscale solely to reach a fixed pixel count. Keep the complete grid envelope and immediate boundary near the center with generous continuous, meaningful scenery on every edge for camera roaming. This is composition guidance, not permission to change the grid and not a numeric acceptance threshold. The surrounding scene is not padding or crop allowance. Do not enlarge, compact, distort, or redesign the grid to fill the frame.`;

  const referenceRoles = isRefinement
    ? `REFERENCE ROLES — STRICT AUTHORITY ORDER
Image 1 is the canonical unit-free, ground-cover-free authored-surface render of this exact level inside the owner's saved generation frame. It owns board geometry, projection, cell count, topology, material identity, elevations, explicit Subterrain, and landmark placement. It is a guardrail, not the edit target.
Image 2 is the owner-reviewed generated candidate and the only edit target. Preserve all of its accepted appearance and composition. It may not override Image 1 or the semantic packet on geometry.
The semantic packet below resolves exact gameplay meaning. Image 2 supplies the existing full-scene pixels to preserve; Image 1 guards canonical geometry and source material identity.`
    : `REFERENCE ROLES — STRICT AUTHORITY ORDER
Image 1 is the only image input. It is the canonical unit-free, ground-cover-free authored-surface render of this exact level, clipped to the owner's saved 16:9 generation frame: terrain tops plus only the explicitly authored Subterrain faces visible on exposed edges inside that frame. Its complete ${board.columns}x${board.rows} grid, projection, cell count, required linear features, barriers, gameplay footprints, materials, elevations, authored Subterrain, landmark positions, and all scenic-only objects visible inside the crop are authoritative. A scenic building or prop can be visually authoritative without being a gameplay footprint; preserve it exactly where Image 1 shows it. Scenic-only art outside this deliberate source crop is not an input. The rectangular Image 1 edge is not the gameplay perimeter and must not become a frame, cliff, void, or boundary in the output. Do not zoom outward merely to reconstruct omitted scenic margins. Remove visible address seams from continuous regions in the final painting. Preserve the local authored Subterrain faces exactly where Image 1 shows them, but do not extrapolate them into a vertical board skirt, attached side strip, extra row, or extra column.
No prior generated candidate, accepted whole-level plate, beauty render, or unrelated board image is supplied. The semantic packet below resolves exact gameplay meaning; Image 1 supplies appearance and finish.`;

  const boundaryAppearance = isRefinement
    ? `Outer-envelope LOCATION is fixed by Image 1 and the packet. Preserve Image 2's complete existing outer-envelope appearance, openings, feature crossings, and continuous outside world exactly. The boundary is not a new vertical side wall, second strip of cells, extra row, or extra column; any local exposed face visible in Image 1 is explicitly authored Subterrain and must remain local to that exact edge. Internal playable/non-playable transitions remain distinct semantic features and do not replace the outer envelope.`
    : `Outer-envelope LOCATION is fixed; its APPEARANCE is creative and must be derived from Image 1. Carry one coherent in-world treatment around the exact envelope while preserving declared openings and feature crossings. The outside world remains continuous yet clearly outside the grid. Do not infer, move, or reshape the outer envelope from the rectangular source-crop edge. The boundary is not a new vertical side wall, second strip of cells, extra row, or extra column; any local exposed face visible in Image 1 is explicitly authored Subterrain and must remain local to that exact edge. Internal playable/non-playable transitions remain distinct semantic features and do not replace the outer envelope.`;

  const sceneAndStyle = isDetilingRefinement
    ? `Preserve Image 2's palette, lighting, texture language, finish, and every non-target scene element exactly. Keep all existing exterior scenery, waterways, continuous roads and paths, buildings, trees, vegetation, northern stone field, props, bridges, fences, and actual vertical cliff/Subterrain geometry wherever present. Do not add, remove, move, resize, redesign, or restyle anything. Only de-tile coplanar terrain transitions.`
    : isSceneryRefinement
      ? `Preserve Image 2's palette, lighting, texture language, finish, terrain painting, and every existing scene element exactly. Restore only the discrete scenic buildings, structures, and props visible in Image 1 but omitted from Image 2, at their corresponding positions and scale. Match Image 2's established rendering. Do not alter the terrain underneath except for the minimal contact shadow and grounding needed by each restored object.`
    : `Extend only the visual language already present in Image 1 into a seamless full-screen scene. Do not substitute a separately named biome, palette, lighting scheme, material vocabulary, or style. Preserve every declared cell elevation. Seam surfaces, linear features, footprints, edge objects, the envelope, and surrounding environment into one professional continuous painting.`;

  const extraConstraints = isDetilingRefinement
    ? '\nDo not alter Image 2 outside the narrow coplanar blend zones. Do not remove or soften actual vertical cliff/Subterrain silhouettes.'
    : isSceneryRefinement
      ? '\nDo not alter Image 2 outside the localized restored-object regions. Do not repaint its coplanar terrain or change any actual vertical cliff/Subterrain silhouette.'
    : '';

  const surfaceContinuity = isSceneryRefinement
    ? `COPLANAR TERRAIN LOCK — DO NOT CHANGE
Image 2's existing flat-terrain painting is an invariant for this edit. Do not repaint, re-tile, blur, recolor, or recompose it. Restored scenic objects may add only their localized footprint contact and natural shadow. Hard grid-aligned terrain edges remain permitted only at actual, explicitly authored vertical Subterrain/cliff drop-offs visible in Image 1.`
    : `NON-NEGOTIABLE OUTPUT TEST — DETILE ALL COPLANAR GROUND
The output is unusable if any horizontal terrain contains a cell-sized square, isometric diamond, rhombus, repeated grid module, or four-sided material island—even when no outline stroke is present. An abrupt cell-shaped change in color, value, texture, density, wear, vegetation, or material counts as a visible tile boundary and must be dissolved. Image 1 necessarily exposes flat tile-shaped authoring patches${isRefinement ? ', and Image 2 may reproduce some of them' : ''}; preserve their material identity and approximate placement, but erase their polygonal contours rather than polishing or reproducing them.
Fuse adjacent coplanar terrain into continuous material fields across the entire frame, inside and outside the playable area, including surrounding scenery. This applies both within one surface id and between different surface ids or playable states at the same elevation. Replace cell-stepped interfaces with broad, blended, irregular, non-grid-aligned transitions. Preserve topology without preserving the square contour. Render every connected linear feature as one continuous feature with no per-cell segmentation. Broad variation and surface detail should cross many hidden cell edges.
The only terrain edges allowed to retain a hard grid-aligned contour are the lips of actual, explicitly authored vertical Subterrain/cliff drop-offs visible in Image 1. That narrow exception applies only to real vertical drop geometry; it never permits a square patch, slab, panel, or border on an adjacent horizontal top. Declared barriers and the complete outer envelope keep their geometry, but they do not divide neighboring flat terrain into tiles.`;

  const continuityReminder = isSceneryRefinement
    ? `COPLANAR TERRAIN LOCK REMINDER
The matrix below is geometry evidence only. Do not use it to repaint Image 2's approved terrain during this source-scenery restoration.`
    : `COPLANAR DE-TILING REMINDER
The matrix above is not a visible mosaic. Before finalizing, mentally ignore roads, barriers, objects, the outer envelope, and actual vertical cliff faces. If the remaining flat-ground color or texture changes let a viewer reconstruct any individual cell, repeated cell size, or the x+/y+ grid axes, repaint those changes as continuous terrain.`;

  const projectionPlacement = isRefinement
    ? `Preserve Image 2's exact grid scale and placement. Do not scale or translate the grid.`
    : `The grid may be uniformly scaled and translated to fit the composition, but its latent placement structure must not change or become visible terrain edging.`;

  return `${opening}

${referenceRoles}

${surfaceContinuity}

PROJECTION CONTRACT
Use ${formatProjectionKind(board.projection.kind)}, not perspective convergence.
Grid x+: ${formatProjectionAxis(board.projection.axisX)}.
Grid y+: ${formatProjectionAxis(board.projection.axisY)}.
Projected-step rule: ${formatStepLengthRule(board.projection.stepLengthRule)}.
There are exactly ${board.columns} columns (${Math.max(0, board.columns - 1)} center-to-center x+ steps) and exactly ${board.rows} rows (${Math.max(0, board.rows - 1)} center-to-center y+ steps). The outer envelope spans ${board.columns} complete cell widths along x+ and ${board.rows} complete cell widths along y+.
Preserve the exact projected outline, angles, cell aspect, and proportions in Image 1. Do not turn it into a square, symmetric diamond, trapezoid, perspective wedge, or another projection. ${projectionPlacement}

COORDINATE CONVENTION
Coordinates are (x,y), x=0..${board.columns - 1}, y=0..${board.rows - 1}.
Grid x-address direction: ${board.coordinateConvention.xAxis}.
Grid y-address direction: ${board.coordinateConvention.yAxis}.
No grid coordinate exists beyond those ranges. The ${nonPlayableCells} non-playable addresses below remain part of this exact ${board.columns}x${board.rows} address space; do not remove them, close their gaps, or reindex neighboring cells.

SURFACE DEFINITIONS
These are gameplay semantics, not independent art direction. Visible treatment comes only from Image 1.
${formatSurfaceDefinitions(board)}

EXACT ${totalCells}-CELL CONTENT (${playableCells} playable, ${nonPlayableCells} non-playable)
Cell format is surface@zElevation; [NON-PLAYABLE] is explicit gameplay status.
This matrix fixes semantic occupancy and topology only. It is not a pixel-exact mask for flat terrain edges.
${formatCells(board)}

${continuityReminder}

EXACT LINEAR-FEATURE GRAPH
Each coordinate list is an unordered set, never a path. Only the explicit shared-edge connections establish topology; branches and disconnected components are intentional. An exit/stub crosses exactly its declared edge and does not create another cell.
${formatLinearFeatures(definition.linearFeatures)}
Do not add, remove, reorder, reconnect, or extend a feature beyond this graph.

EXACT BLOCKING EDGE OBJECTS (${definition.barriers.length})
${formatBarriers(definition.barriers)}
Each barrier is centered on its declared shared edge. Its appearance comes from Image 1. It does not consume either neighboring cell unless a footprint separately says so.

EXACT FIXED FOOTPRINTS (${definition.footprints.length})
${formatFootprints(definition.footprints)}
Do not add, move, enlarge, shrink, or reinterpret a footprint.
This gameplay-footprint list does not enumerate scenic-only appearance. Preserve every scenic building, structure, and prop visibly authored in Image 1 without promoting it to a gameplay footprint.

VISUAL-ONLY SOURCE ARTWORK (${definition.visualArtwork.length})
${formatVisualArtwork(definition.visualArtwork)}
These landmarks are already visible in Image 1. Preserve their visible position, rendered orientation, and relative size as appearance evidence, but do not turn them into blockers, traversable footprints, cells, elevations, or other gameplay semantics.

EXACT OUTER GRID ENVELOPE (${definition.outerPerimeter.edges.length} edges)
This is the full rectangular envelope of the exact ${board.columns}x${board.rows} coordinate grid, including edges owned by boundary cells marked non-playable. It is not inferred from linear features, non-playable regions, footprints, barriers, vegetation, or texture bands.
${formatOuterPerimeter(definition.outerPerimeter)}
${openings}

EXACT INTERNAL PLAYABLE/NON-PLAYABLE TRANSITIONS (${definition.impassableTransitions.length} edges)
These internal edges are separate from the outer grid envelope. They preserve non-playable gaps and regions without shrinking or redefining the ${board.columns}x${board.rows} grid.
${formatEdges(definition.impassableTransitions)}

BOUNDARY APPEARANCE
${boundaryAppearance}

SCENE AND STYLE
${sceneAndStyle}

CONSTRAINTS
No units, chess pieces, people, creatures, UI, coordinate labels, text, watermark, or baked grid lines.
No black box, black void around the scene, floating board, vignette frame, or hard crop.
Do not reproduce the rectangular Image 1 crop edge as an environmental boundary or output frame.
No unstated gameplay ramps, cliffs, elevation tiers, pits, footprint buildings, blockers, barriers, or feature branches. Preserve scenic-only buildings, structures, and props visibly authored in Image 1.
No synthesized or extended vertical board skirt, attached side strip, extra row, extra column, or grid continuation in surrounding scenery. Preserve only the explicit local Subterrain faces visible in Image 1.
No checkerboard, patchwork quilt, square terrain swatches, isolated slabs, rectangular beds, inset panels, cell-by-cell tinting, or flat-terrain seams that reveal hidden address boundaries. Hard cell-aligned terrain edges are permitted only at actual authored vertical Subterrain/cliff drop-offs.
${extraConstraints}
Geometry and semantics above override all artistic discretion.
`;
}

export function buildPredrawnGenerationArtifacts(inputDefinition, referenceBytes) {
  const definition = normalizePredrawnGenerationDefinition(inputDefinition);
  const dimensions = pngSize(referenceBytes);
  const viewport = definition.reference.viewport;
  if (dimensions.width !== viewport.width || dimensions.height !== viewport.height) {
    fail(
      `reference PNG is ${dimensions.width}x${dimensions.height}, expected the saved generation frame ${viewport.width}x${viewport.height}`,
    );
  }
  const prompt = buildPredrawnGenerationPrompt(definition);
  if (/\{\{[^}]+\}\}/.test(prompt)) fail('prompt contains an unresolved placeholder');
  for (const required of [
    `${definition.board.columns}-column by ${definition.board.rows}-row`,
    `exactly ${definition.board.columns} columns (${Math.max(0, definition.board.columns - 1)} center-to-center x+ steps)`,
    `exactly ${definition.board.rows} rows (${Math.max(0, definition.board.rows - 1)} center-to-center y+ steps)`,
    'Image 1 is the only image input',
    "model's native output size",
  ]) {
    if (!prompt.toLowerCase().includes(required.toLowerCase())) fail(`prompt is missing required clause: ${required}`);
  }
  const packet = {
    schemaVersion: PREDRAWN_GENERATION_SCHEMA_VERSION,
    runId: definition.runId,
    levelId: definition.levelId,
    board: definition.board,
    linearFeatures: definition.linearFeatures,
    barriers: definition.barriers,
    footprints: definition.footprints,
    visualArtwork: definition.visualArtwork,
    outerPerimeter: definition.outerPerimeter,
    impassableTransitions: definition.impassableTransitions,
  };
  const references = {
    schemaVersion: PREDRAWN_GENERATION_SCHEMA_VERSION,
    runId: definition.runId,
    references: [{
      index: 1,
      role: 'canonical-unit-free-ground-cover-free-authored-surface-art-authority',
      sourceSlot: definition.reference.sourceSlot,
      sha256: sha256(referenceBytes),
      viewport,
      ...dimensions,
    }],
  };
  const manifest = {
    schemaVersion: PREDRAWN_GENERATION_SCHEMA_VERSION,
    runId: definition.runId,
    levelId: definition.levelId,
    status: 'ready-for-generation',
    provider: definition.request.provider,
    model: definition.request.model,
    mode: definition.request.mode,
    output: {
      sizing: 'model-native',
      aspectRatio: definition.request.aspectRatio,
      mimeType: 'image/png',
    },
    promptSha256: sha256(Buffer.from(prompt)),
    packetSha256: sha256(Buffer.from(json(packet))),
    referencesSha256: sha256(Buffer.from(json(references))),
    referenceViewportSha256: sha256(Buffer.from(JSON.stringify(stable(viewport)))),
  };
  return { definition, prompt, packet, references, manifest };
}

function parsedJsonBytes(bytes, label) {
  if (!Buffer.isBuffer(bytes)) fail(`${label} must be bytes`);
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requireHash(bytes, expected, label) {
  const actual = sha256(bytes);
  if (actual !== expected) fail(`${label} sha256 mismatch: expected ${expected}, received ${actual}`);
}

function stableValuesMatch(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

export function buildPredrawnComparativeRefinementArtifacts({
  inputDefinition,
  referenceBytes,
  candidateBytes,
  parentPromptBytes,
  parentPacketBytes,
  parentReferencesBytes,
  parentManifestBytes,
  branch,
  operation,
}) {
  const branchName = nonEmptyText(branch, 'refinement branch');
  if (!/^[a-z0-9][a-z0-9-]{2,127}$/.test(branchName)) {
    fail('refinement branch must be 3-128 lowercase letters, digits, or hyphens');
  }
  if (!PREDRAWN_REFINEMENT_KINDS.has(operation)) fail(`unsupported refinement operation ${operation}`);

  const base = buildPredrawnGenerationArtifacts(inputDefinition, referenceBytes);
  const parentManifest = parsedJsonBytes(parentManifestBytes, 'parent request manifest');
  const parentPacket = parsedJsonBytes(parentPacketBytes, 'parent packet');
  const parentReferences = parsedJsonBytes(parentReferencesBytes, 'parent references');
  if (!isRecord(parentManifest)) fail('parent request manifest must be an object');
  if (parentManifest.schemaVersion !== PREDRAWN_GENERATION_SCHEMA_VERSION) {
    fail(`parent request schemaVersion must be ${PREDRAWN_GENERATION_SCHEMA_VERSION}`);
  }
  if (parentManifest.status !== 'ready-for-generation') fail('parent request must be ready-for-generation');
  if (parentManifest.mode !== 'isolated-top-only') fail('parent request must be an isolated-top-only run');
  if (parentManifest.levelId !== base.definition.levelId) fail('parent request levelId does not match the definition');
  if (parentManifest.runId !== base.definition.runId) fail('parent request runId does not match the definition');
  if (branchName === parentManifest.runId) fail('refinement branch must differ from the parent runId');
  if (!isRecord(parentManifest.output)) fail('parent request output must be an object');
  if (parentManifest.output.aspectRatio !== base.definition.request.aspectRatio) {
    fail('parent request output aspect ratio does not match the definition');
  }
  requireHash(parentPromptBytes, parentManifest.promptSha256, 'parent prompt');
  requireHash(parentPacketBytes, parentManifest.packetSha256, 'parent packet');
  requireHash(parentReferencesBytes, parentManifest.referencesSha256, 'parent references');
  if (sha256(Buffer.from(JSON.stringify(stable(base.definition.reference.viewport)))) !== parentManifest.referenceViewportSha256) {
    fail('parent reference viewport hash does not match the definition');
  }
  if (sha256(Buffer.from(json(base.packet))) !== parentManifest.packetSha256) {
    fail('parent packet does not match the current canonical semantic packet');
  }
  if (!isRecord(parentReferences)) fail('parent references must be an object');
  if (parentReferences.schemaVersion !== PREDRAWN_GENERATION_SCHEMA_VERSION) {
    fail(`parent references schemaVersion must be ${PREDRAWN_GENERATION_SCHEMA_VERSION}`);
  }
  if (parentReferences.runId !== parentManifest.runId) {
    fail('parent references runId does not match the parent request');
  }
  if (!Array.isArray(parentReferences.references) || parentReferences.references.length !== 1) {
    fail('isolated parent must contain exactly one reference');
  }
  const parentCanonicalReference = parentReferences.references[0];
  const expectedCanonicalReference = base.references.references[0];
  if (!isRecord(parentCanonicalReference)) fail('parent Image 1 reference must be an object');
  if (parentCanonicalReference.index !== 1) fail('parent Image 1 index must be 1');
  if (parentCanonicalReference.role !== expectedCanonicalReference.role) {
    fail('parent Image 1 role is not the canonical isolated-source role');
  }
  if (parentCanonicalReference.sourceSlot !== expectedCanonicalReference.sourceSlot) {
    fail('parent Image 1 sourceSlot does not match the definition');
  }
  if (parentCanonicalReference.sha256 !== expectedCanonicalReference.sha256) {
    fail('parent Image 1 does not match the supplied canonical reference bytes');
  }
  if (!stableValuesMatch(parentCanonicalReference.viewport, expectedCanonicalReference.viewport)) {
    fail('parent Image 1 viewport does not match the definition');
  }
  if (
    parentCanonicalReference.width !== expectedCanonicalReference.width
    || parentCanonicalReference.height !== expectedCanonicalReference.height
  ) {
    fail('parent Image 1 dimensions do not match the canonical reference');
  }
  if (!stableValuesMatch(parentReferences, base.references)) {
    fail('parent references contain unexpected or mismatched fields');
  }

  const candidateDimensions = pngSize(candidateBytes);
  if (!canvasMatchesAspectRatio(candidateDimensions, parentManifest.output.aspectRatio)) {
    fail(
      `candidate PNG is ${candidateDimensions.width}x${candidateDimensions.height}, which is not compatible with parent output aspect ratio ${parentManifest.output.aspectRatio}`,
    );
  }
  const candidateSha256 = sha256(candidateBytes);
  const prompt = buildPredrawnGenerationPrompt(base.definition, { mode: operation });
  if (prompt.includes('Image 1 is the only image input') || !prompt.includes('Image 2 is the owner-reviewed generated candidate')) {
    fail('comparative refinement prompt has invalid reference roles');
  }
  const references = {
    kind: 'predrawn-comparative-refinement-references',
    schemaVersion: 1,
    runId: branchName,
    references: [
      {
        index: 1,
        role: 'canonical-authored-surface-geometry-and-appearance-authority',
        sourceSlot: base.definition.reference.sourceSlot,
        sha256: sha256(referenceBytes),
        viewport: base.definition.reference.viewport,
        width: base.definition.reference.viewport.width,
        height: base.definition.reference.viewport.height,
      },
      {
        index: 2,
        role: 'owner-reviewed-prior-candidate-subordinate-appearance-edit-target',
        sourceSlot: `review-candidate/sha256-${candidateSha256}`,
        sha256: candidateSha256,
        ...candidateDimensions,
      },
    ],
  };
  const manifest = {
    kind: 'predrawn-comparative-refinement-request',
    schemaVersion: 1,
    runId: branchName,
    levelId: base.definition.levelId,
    status: 'ready-for-generation',
    provider: base.definition.request.provider,
    model: base.definition.request.model,
    mode: 'comparative-refinement',
    isolatedPipelineEvidence: false,
    reviewBranch: {
      name: branchName,
      parentRunId: parentManifest.runId,
      parentRequestManifestSha256: sha256(parentManifestBytes),
      parentCandidateSha256: candidateSha256,
      operation,
    },
    output: {
      sizing: 'preserve-edit-target-native',
      aspectRatio: base.definition.request.aspectRatio,
      mimeType: 'image/png',
      sourceWidth: candidateDimensions.width,
      sourceHeight: candidateDimensions.height,
    },
    promptSha256: sha256(Buffer.from(prompt)),
    packetSha256: sha256(parentPacketBytes),
    referencesSha256: sha256(Buffer.from(json(references))),
    referenceViewportSha256: parentManifest.referenceViewportSha256,
  };
  return {
    definition: base.definition,
    prompt,
    packet: parentPacket,
    packetBytes: parentPacketBytes,
    references,
    manifest,
  };
}

export async function writePredrawnGenerationRun({ definition, referenceBytes, outputPath }) {
  const artifacts = buildPredrawnGenerationArtifacts(definition, referenceBytes);
  await mkdir(outputPath, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputPath, 'prompt.txt'), artifacts.prompt),
    writeFile(path.join(outputPath, 'packet.json'), json(artifacts.packet)),
    writeFile(path.join(outputPath, 'references.json'), json(artifacts.references)),
    writeFile(path.join(outputPath, 'request-manifest.json'), json(artifacts.manifest)),
  ]);
  return artifacts;
}

export async function writePredrawnComparativeRefinementRun(options) {
  const artifacts = buildPredrawnComparativeRefinementArtifacts(options);
  await mkdir(path.dirname(options.outputPath), { recursive: true });
  try {
    await mkdir(options.outputPath);
  } catch (error) {
    if (error?.code === 'EEXIST') fail(`refinement output already exists: ${options.outputPath}`);
    throw error;
  }
  await Promise.all([
    writeFile(path.join(options.outputPath, 'prompt.txt'), artifacts.prompt),
    writeFile(path.join(options.outputPath, 'packet.json'), artifacts.packetBytes),
    writeFile(path.join(options.outputPath, 'references.json'), json(artifacts.references)),
    writeFile(path.join(options.outputPath, 'request-manifest.json'), json(artifacts.manifest)),
  ]);
  return artifacts;
}

export async function runPredrawnGenerationCli(argv = process.argv.slice(2)) {
  const args = parsePredrawnGenerationArgs(argv);
  const definitionPath = path.resolve(args.definition);
  const referencePath = path.resolve(args.reference);
  const outputPath = path.resolve(args.out);
  const definition = JSON.parse(await readFile(definitionPath, 'utf8'));
  const referenceBytes = await readFile(referencePath);
  let artifacts;
  if (args.refinement) {
    const parentPath = path.resolve(args.parent);
    if (parentPath === outputPath) fail('refinement output must differ from the parent request directory');
    const [
      candidateBytes,
      parentPromptBytes,
      parentPacketBytes,
      parentReferencesBytes,
      parentManifestBytes,
    ] = await Promise.all([
      readFile(path.resolve(args.candidate)),
      readFile(path.join(parentPath, 'prompt.txt')),
      readFile(path.join(parentPath, 'packet.json')),
      readFile(path.join(parentPath, 'references.json')),
      readFile(path.join(parentPath, 'request-manifest.json')),
    ]);
    artifacts = await writePredrawnComparativeRefinementRun({
      inputDefinition: definition,
      referenceBytes,
      candidateBytes,
      parentPromptBytes,
      parentPacketBytes,
      parentReferencesBytes,
      parentManifestBytes,
      branch: args.branch,
      operation: args.refinement,
      outputPath,
    });
  } else {
    artifacts = await writePredrawnGenerationRun({ definition, referenceBytes, outputPath });
  }
  process.stdout.write(`${outputPath}\n${artifacts.manifest.promptSha256}\n`);
}

const isCli = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
  await runPredrawnGenerationCli();
}
