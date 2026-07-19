import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const PREDRAWN_GENERATION_SCHEMA_VERSION = 2;
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
  if (bytes.length < 24 || bytes.toString('ascii', 1, 4) !== 'PNG') fail('reference is not a PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function gcd(a, b) {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right !== 0) [left, right] = [right, left % right];
  return left;
}

function aspectRatio(request) {
  let ratio = request?.aspectRatio;
  const hasWidth = request?.width !== undefined;
  const hasHeight = request?.height !== undefined;
  if (hasWidth !== hasHeight) fail('legacy request width and height must be supplied together');
  if (hasWidth) {
    if (!Number.isInteger(request.width) || request.width <= 0 || !Number.isInteger(request.height) || request.height <= 0) {
      fail('legacy request width and height must be positive integers');
    }
    const divisor = gcd(request.width, request.height);
    const legacyRatio = `${request.width / divisor}:${request.height / divisor}`;
    if (ratio && ratio !== legacyRatio) fail(`request aspectRatio ${ratio} disagrees with legacy dimensions ${legacyRatio}`);
    ratio = legacyRatio;
  }
  ratio ??= '16:9';
  if (!/^\d+:[1-9]\d*$/.test(ratio)) fail('request aspectRatio must use positive W:H integers');
  const [width, height] = ratio.split(':').map(Number);
  const divisor = gcd(width, height);
  ratio = `${width / divisor}:${height / divisor}`;
  if (ratio !== '16:9') fail('pre-drawn full-scene requests use the canonical 16:9 frame');
  return ratio;
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

function normalizedCoordinateConvention(board, columns, rows) {
  const source = isRecord(board.coordinateConvention) ? board.coordinateConvention : {};
  if (source.order !== undefined && source.order !== '(x,y)') fail('board.coordinateConvention.order must be (x,y)');
  return {
    order: '(x,y)',
    xAxis: typeof source.xAxis === 'string' && source.xAxis.trim()
      ? source.xAxis.trim()
      : `x increases from 0 to ${columns - 1} along the x+ direction in Image 1`,
    yAxis: typeof source.yAxis === 'string' && source.yAxis.trim()
      ? source.yAxis.trim()
      : `y increases from 0 to ${rows - 1} along the y+ direction in Image 1`,
  };
}

function normalizeCells(board, columns, rows) {
  if (Array.isArray(board.cells)) {
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
    if (board.surfaceDefinitions !== undefined) {
      if (!isRecord(board.surfaceDefinitions)) fail('board.surfaceDefinitions must be an object');
      for (const [surface, meaning] of Object.entries(board.surfaceDefinitions)) {
        definitions[nonEmptyText(surface, 'surface id')] = nonEmptyText(meaning, `surface definition ${surface}`);
      }
      for (const surface of surfaces) {
        if (!(surface in definitions)) fail(`surface ${surface} has no board.surfaceDefinitions entry`);
      }
    }
    return { cells, surfaceDefinitions: definitions, source: 'cells' };
  }

  if (!Array.isArray(board.matrix)) fail('board.cells is required (legacy board.matrix is also accepted)');
  if (!isRecord(board.tokens)) fail('legacy board.tokens is required with board.matrix');
  if (board.matrix.length !== rows) fail(`board.matrix has ${board.matrix.length} rows, expected ${rows}`);
  const tokenDefinitions = {};
  for (const [token, meaning] of Object.entries(board.tokens)) {
    if (!token || token.includes('+')) fail(`legacy token ${token || '<empty>'} is invalid`);
    tokenDefinitions[token] = nonEmptyText(meaning, `token definition ${token}`);
  }
  const nonPlayableTokens = new Set(board.nonPlayableTokens ?? []);
  for (const token of nonPlayableTokens) {
    if (!(token in tokenDefinitions)) fail(`non-playable token ${token} has no definition`);
  }
  const elevations = board.elevations;
  if (elevations !== undefined && (!Array.isArray(elevations) || elevations.length !== rows)) {
    fail(`legacy board.elevations must have ${rows} rows`);
  }
  const cells = board.matrix.map((row, y) => {
    if (!Array.isArray(row) || row.length !== columns) {
      fail(`board.matrix row ${y} has ${Array.isArray(row) ? row.length : 0} cells, expected ${columns}`);
    }
    if (elevations !== undefined && (!Array.isArray(elevations[y]) || elevations[y].length !== columns)) {
      fail(`board.elevations row ${y} must have ${columns} cells`);
    }
    return row.map((raw, x) => {
      const tokens = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split('+') : [];
      if (tokens.length === 0) fail(`board.matrix[${y}][${x}] must contain at least one token`);
      for (const token of tokens) {
        if (!(token in tokenDefinitions)) fail(`board.matrix[${y}][${x}] uses undefined token ${token}`);
      }
      const elevation = elevations === undefined ? null : elevations[y][x];
      if (elevation !== null && (!Number.isInteger(elevation) || elevation < 0)) {
        fail(`board.elevations[${y}][${x}] must be a non-negative integer`);
      }
      return {
        surface: tokens.join('+'),
        elevation,
        playable: !tokens.some((token) => nonPlayableTokens.has(token)),
        semanticTokens: tokens,
      };
    });
  });
  return { cells, surfaceDefinitions: tokenDefinitions, source: 'legacy-matrix' };
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

function normalizeLinearFeatures(definition, cells, columns, rows) {
  if (definition.linearFeatures !== undefined && definition.roads !== undefined) {
    fail('use linearFeatures or legacy roads, not both');
  }
  const source = definition.linearFeatures ?? definition.roads ?? [];
  if (!Array.isArray(source)) fail('linearFeatures must be an array');
  const ids = new Set();
  const isV2 = definition.schemaVersion === PREDRAWN_GENERATION_SCHEMA_VERSION;
  const normalized = source.map((raw, index) => {
    if (!isRecord(raw)) fail(`linearFeatures[${index}] must be an object`);
    const id = nonEmptyText(raw.id, `linearFeatures[${index}].id`);
    if (ids.has(id)) fail(`linear feature id ${id} occurs more than once`);
    ids.add(id);
    const kind = nonEmptyText(raw.kind ?? (definition.roads ? 'road' : undefined), `linearFeatures[${index}].kind`);
    if (!Array.isArray(raw.cells) || raw.cells.length === 0) fail(`linear feature ${id} has no cells`);
    if (isV2 && !Array.isArray(raw.connections)) fail(`linear feature ${id} must serialize exact connections`);
    if (isV2 && !Array.isArray(raw.exits)) fail(`linear feature ${id} must serialize exact exits`);
    const cellSet = new Set();
    const featureCells = raw.cells.map((value, cellIndex) => {
      const cell = coordinate(value, `linear feature ${id} cell ${cellIndex}`);
      if (!inBoard(cell, columns, rows)) fail(`linear feature ${id} contains out-of-board cell ${coordinateKey(cell)}`);
      const key = coordinateKey(cell);
      if (cellSet.has(key)) fail(`linear feature ${id} repeats cell ${key}`);
      cellSet.add(key);
      return cell;
    });
    const cuts = new Set();
    for (const [cutIndex, rawCut] of (raw.cuts ?? []).entries()) {
      const parsed = edge(rawCut, `linear feature ${id} cut ${cutIndex}`);
      if (!adjacent(parsed.a, parsed.b) || !cellSet.has(coordinateKey(parsed.a)) || !cellSet.has(coordinateKey(parsed.b))) {
        fail(`linear feature ${id} cut ${edgeKey(parsed.a, parsed.b)} must join two of its adjacent cells`);
      }
      const key = edgeKey(parsed.a, parsed.b);
      if (cuts.has(key)) fail(`linear feature ${id} repeats cut ${key}`);
      cuts.add(key);
    }
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
    if (raw.connections !== undefined) {
      if (!Array.isArray(raw.connections)) fail(`linear feature ${id} connections must be an array`);
      raw.connections.forEach((value, connectionIndex) => {
        const parsed = edge(value, `linear feature ${id} connection ${connectionIndex}`);
        addConnection(parsed.a, parsed.b, `linear feature ${id} connection ${connectionIndex}`);
      });
      for (const cut of cuts) {
        if (connectionKeys.has(cut)) fail(`linear feature ${id} connection ${cut} is also declared cut`);
      }
    } else {
      for (const [x, y] of featureCells) {
        for (const neighbor of [[x + 1, y], [x, y + 1]]) {
          const key = edgeKey([x, y], neighbor);
          if (cellSet.has(coordinateKey(neighbor)) && !cuts.has(key)) addConnection([x, y], neighbor, `derived connection ${key}`);
        }
      }
    }
    const exits = [];
    const exitKeys = new Set();
    for (const [exitIndex, rawExit] of (Array.isArray(raw.exits) ? raw.exits : []).entries()) {
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
    const token = raw.token ?? raw.featureToken;
    if (token !== undefined) {
      nonEmptyText(token, `linear feature ${id} token`);
      for (const [x, y] of featureCells) {
        const semanticTokens = cells[y][x].semanticTokens;
        if (!semanticTokens?.includes(token)) fail(`linear feature ${id} token ${token} is absent at (${x},${y})`);
      }
    }
    const note = typeof raw.note === 'string' && raw.note.trim()
      ? raw.note.trim()
      : typeof raw.exit === 'string' && raw.exit.trim() ? `Legacy threshold description: ${raw.exit.trim()}` : undefined;
    return { id, kind, cells: featureCells, connections, exits, ...(note ? { note } : {}) };
  });

  const declaredTokens = new Map();
  source.forEach((raw, index) => {
    const token = raw.token ?? raw.featureToken;
    if (!token) return;
    const present = declaredTokens.get(token) ?? new Set();
    normalized[index].cells.forEach((cell) => present.add(coordinateKey(cell)));
    declaredTokens.set(token, present);
  });
  for (const [token, present] of declaredTokens) {
    const matrixCells = new Set();
    cells.forEach((row, y) => row.forEach((cell, x) => {
      if (cell.semanticTokens?.includes(token)) matrixCells.add(`${x},${y}`);
    }));
    if ([...matrixCells].sort().join('|') !== [...present].sort().join('|')) {
      fail(`linear feature cells disagree with ${token} tokens in the tile matrix`);
    }
  }
  return normalized;
}

function normalizeBarriers(definition, columns, rows) {
  if (definition.barriers !== undefined && definition.blockingEdges !== undefined) {
    fail('use barriers or legacy blockingEdges, not both');
  }
  const source = definition.barriers ?? definition.blockingEdges ?? [];
  if (!Array.isArray(source)) fail('barriers must be an array');
  const isV2 = definition.schemaVersion === PREDRAWN_GENERATION_SCHEMA_VERSION;
  const seen = new Set();
  return source.map((raw, index) => {
    const legacy = Array.isArray(raw);
    const parsed = edge(raw, `barrier ${index}`);
    if (!adjacent(parsed.a, parsed.b)) fail(`barrier ${edgeKey(parsed.a, parsed.b)} endpoints are not adjacent`);
    if (!inBoard(parsed.a, columns, rows) && !inBoard(parsed.b, columns, rows)) {
      fail(`barrier ${edgeKey(parsed.a, parsed.b)} does not touch the board`);
    }
    const key = edgeKey(parsed.a, parsed.b);
    if (seen.has(key)) fail(`barrier ${key} occurs more than once`);
    seen.add(key);
    const object = legacy ? {} : raw;
    if (isV2) {
      nonEmptyText(object.id, `barriers[${index}].id`);
      nonEmptyText(object.kind, `barriers[${index}].kind`);
      if (object.blocksCrossing !== true) fail(`barriers[${index}].blocksCrossing must be true`);
    }
    if (object.blocksCrossing === false) fail(`barrier ${key} is listed as non-blocking`);
    return {
      id: typeof object.id === 'string' && object.id.trim() ? object.id.trim() : `barrier-${index + 1}`,
      kind: typeof object.kind === 'string' && object.kind.trim() ? object.kind.trim() : 'edge barrier shown by Image 1',
      a: parsed.a,
      b: parsed.b,
      blocksCrossing: true,
    };
  });
}

function normalizeFootprints(definition, cells, columns, rows) {
  if (definition.footprints !== undefined && definition.props !== undefined) {
    fail('use footprints or legacy props, not both');
  }
  const source = definition.footprints ?? definition.props ?? [];
  if (!Array.isArray(source)) fail('footprints must be an array');
  const isV2 = definition.schemaVersion === PREDRAWN_GENERATION_SCHEMA_VERSION;
  const ids = new Set();
  const occupied = new Set();
  return source.map((raw, index) => {
    if (!isRecord(raw)) fail(`footprints[${index}] must be an object`);
    const id = nonEmptyText(raw.id, `footprints[${index}].id`);
    if (ids.has(id)) fail(`footprint id ${id} occurs more than once`);
    ids.add(id);
    if (isV2) {
      nonEmptyText(raw.kind, `footprints[${index}].kind`);
      nonEmptyText(raw.sourceId, `footprints[${index}].sourceId`);
      nonEmptyText(raw.traversal, `footprints[${index}].traversal`);
    }
    const rawCells = raw.cells ?? (raw.cell ? [raw.cell] : undefined);
    if (!Array.isArray(rawCells) || rawCells.length === 0) fail(`footprint ${id} has no cells`);
    const footprintCells = rawCells.map((value, cellIndex) => {
      const cell = coordinate(value, `footprint ${id} cell ${cellIndex}`);
      if (!inBoard(cell, columns, rows)) fail(`footprint ${id} leaves the board at ${coordinateKey(cell)}`);
      const key = coordinateKey(cell);
      if (occupied.has(key)) fail(`footprints overlap at ${key}`);
      occupied.add(key);
      if (raw.token && !cells[cell[1]][cell[0]].semanticTokens?.includes(raw.token)) {
        fail(`footprint ${id} token ${raw.token} is absent at ${key}`);
      }
      return cell;
    });
    return {
      id,
      kind: typeof raw.kind === 'string' && raw.kind.trim() ? raw.kind.trim() : 'fixed footprint shown by Image 1',
      sourceId: typeof raw.sourceId === 'string' && raw.sourceId.trim() ? raw.sourceId.trim() : id,
      cells: footprintCells,
      traversal: typeof raw.traversal === 'string' && raw.traversal.trim()
        ? raw.traversal.trim()
        : raw.cell ? 'impassable' : 'preserve the gameplay behavior declared by the canonical level',
    };
  });
}

export function normalizePredrawnGenerationDefinition(definition) {
  if (!isRecord(definition)) fail('definition must be a JSON object');
  if (definition.schemaVersion !== undefined && definition.schemaVersion !== PREDRAWN_GENERATION_SCHEMA_VERSION) {
    fail(`unsupported definition schemaVersion ${definition.schemaVersion}`);
  }
  const isV2 = definition.schemaVersion === PREDRAWN_GENERATION_SCHEMA_VERSION;
  for (const prohibited of ['art', 'artDirection', 'biome', 'environment', 'palette', 'lighting', 'style', 'theme', 'atmosphere', 'finish']) {
    if (prohibited in definition) fail(`appearance must come from Image 1; top-level ${prohibited} is prohibited`);
  }
  const runId = nonEmptyText(definition.runId, 'runId');
  const levelId = nonEmptyText(definition.levelId, 'levelId');
  if (!isRecord(definition.reference)) fail('reference is required');
  const sourceSlot = nonEmptyText(definition.reference.sourceSlot, 'reference.sourceSlot');
  if (!isRecord(definition.request)) fail('request is required');
  if (isV2 && (definition.request.width !== undefined || definition.request.height !== undefined)) {
    fail('schema v2 uses model-native sizing and must not specify fixed output width or height');
  }
  const provider = nonEmptyText(definition.request.provider, 'request.provider');
  const model = nonEmptyText(definition.request.model, 'request.model');
  if (definition.request.referenceCount !== 1) fail('isolated mode requires exactly one reference');
  if (definition.request.mode !== 'isolated-top-only') fail('request mode must be isolated-top-only');
  const outputAspectRatio = aspectRatio(definition.request);
  if (!isRecord(definition.board)) fail('board is required');
  if (isV2) {
    if (!Array.isArray(definition.board.cells)) fail('schema v2 requires board.cells');
    if (!isRecord(definition.board.projection)) fail('schema v2 requires board.projection');
    if (definition.board.projection.axisX === undefined || definition.board.projection.axisY === undefined) {
      fail('schema v2 requires both projected axis vectors');
    }
    nonEmptyText(definition.board.projection.kind, 'board.projection.kind');
    nonEmptyText(definition.board.projection.stepLengthRule, 'board.projection.stepLengthRule');
    if (!isRecord(definition.board.coordinateConvention)) fail('schema v2 requires board.coordinateConvention');
    if (!isRecord(definition.board.surfaceDefinitions)) fail('schema v2 requires board.surfaceDefinitions');
    for (const collection of ['linearFeatures', 'barriers', 'footprints']) {
      if (!Array.isArray(definition[collection])) fail(`schema v2 requires ${collection}`);
    }
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
    coordinateConvention: normalizedCoordinateConvention(definition.board, columns, rows),
    surfaceDefinitions: normalizedCells.surfaceDefinitions,
    cells: normalizedCells.cells,
  };
  if (isV2) {
    if (!isRecord(definition.outerPerimeter) || !Array.isArray(definition.outerPerimeter.edges)) {
      fail('schema v2 requires outerPerimeter.edges');
    }
    if (!Array.isArray(definition.outerPerimeter.openings)) fail('schema v2 requires outerPerimeter.openings');
    if (!Array.isArray(definition.impassableTransitions)) fail('schema v2 requires impassableTransitions');
  }
  const outerPerimeter = normalizeOuterPerimeter(definition.outerPerimeter, columns, rows);
  const impassableTransitions = normalizeImpassableTransitions(
    definition.impassableTransitions,
    board.cells,
    columns,
    rows,
  );
  const linearFeatures = normalizeLinearFeatures(definition, board.cells, columns, rows);
  const barriers = normalizeBarriers(definition, columns, rows);
  const footprints = normalizeFootprints(definition, board.cells, columns, rows);
  const normalized = {
    schemaVersion: PREDRAWN_GENERATION_SCHEMA_VERSION,
    runId,
    levelId,
    reference: { sourceSlot },
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
  if (footprints.length === 0) return 'None. Do not add any fixed prop or structure footprint.';
  return footprints.map((footprint) => (
    `${footprint.kind} footprint ${footprint.id} occupies exactly ${footprint.cells.length} cell(s): ${formatCoordinates(footprint.cells)}. Traversal: ${footprint.traversal}.`
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

export function buildPredrawnGenerationPrompt(inputDefinition) {
  const definition = inputDefinition?.[NORMALIZED_DEFINITION]
    ? inputDefinition
    : normalizePredrawnGenerationDefinition(inputDefinition);
  const { board, request } = definition;
  const totalCells = board.columns * board.rows;
  const playableCells = board.cells.flat().filter((cell) => cell.playable).length;
  const nonPlayableCells = totalCells - playableCells;
  const openings = definition.outerPerimeter.openings.length === 0
    ? 'No separate outer-envelope opening is declared. Preserve any authored crossing only where the exact feature graph and Image 1 show it.'
    : `Outer-envelope openings are exactly:\n${formatEdges(definition.outerPerimeter.openings, 'cell', 'neighbor')}`;
  return `Use case: stylized-concept
Asset type: full-screen ${request.aspectRatio} tactical-game battlefield art at the model's native output size

PRIMARY REQUEST
Paint one continuous, polished environment containing the exact authored ${board.columns}-column by ${board.rows}-row battlefield described below. Make the outer grid envelope unmistakable through a coherent in-world environmental boundary, while the surrounding environment continues naturally to every edge of the frame. Derive environment, materials, palette, lighting, texture language, and finish only from Image 1; do not assign a named biome or independent style in text.

CAMERA-ROOM FRAME
Use the model's native ${request.aspectRatio} output dimensions. Do not resize or upscale solely to reach a fixed pixel count. Keep the complete grid envelope and immediate boundary near the center with generous continuous, meaningful scenery on every edge for camera roaming. This is composition guidance, not permission to change the grid and not a numeric acceptance threshold. The surrounding scene is not padding or crop allowance. Do not enlarge, compact, distort, or redesign the grid to fill the frame.

REFERENCE ROLES — STRICT AUTHORITY ORDER
Image 1 is the only image input. It is the canonical unit-free, ground-cover-free, top-surfaces-only render of this exact level. Its complete ${board.columns}x${board.rows} grid, projection, cell count, linear features, barriers, footprints, materials, elevations, and landmark positions are authoritative. Remove visible address seams from continuous regions in the final painting. Do not invent a vertical board skirt, attached side strip, extra row, or extra column.
No prior generated candidate, accepted whole-level plate, beauty render, or unrelated board image is supplied. The semantic packet below resolves exact gameplay meaning; Image 1 supplies appearance and finish.

PROJECTION CONTRACT
Use ${formatProjectionKind(board.projection.kind)}, not perspective convergence.
Grid x+: ${formatProjectionAxis(board.projection.axisX)}.
Grid y+: ${formatProjectionAxis(board.projection.axisY)}.
Projected-step rule: ${formatStepLengthRule(board.projection.stepLengthRule)}.
There are exactly ${board.columns} columns (${Math.max(0, board.columns - 1)} center-to-center x+ steps) and exactly ${board.rows} rows (${Math.max(0, board.rows - 1)} center-to-center y+ steps). The outer envelope spans ${board.columns} complete cell widths along x+ and ${board.rows} complete cell widths along y+.
Preserve the exact projected outline, angles, cell aspect, and proportions in Image 1. Do not turn it into a square, symmetric diamond, trapezoid, perspective wedge, or another projection. The grid may be uniformly scaled and translated to fit the composition, but its cell structure must not change.

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
${formatCells(board)}

SURFACE CONTINUITY CONTRACT
Coordinates are semantic addresses, not visible square texture swatches. Do not preserve, redraw, or imply address boundaries inside continuous regions of the same authored surface. Natural variation may cross many hidden cell edges and must not reveal the grid. Preserve real authored transitions between unlike surfaces, elevations, playable and non-playable cells, linear features, footprints, barriers, and the outer envelope. Do not convert the matrix into a checkerboard or patchwork quilt.

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

EXACT OUTER GRID ENVELOPE (${definition.outerPerimeter.edges.length} edges)
This is the full rectangular envelope of the exact ${board.columns}x${board.rows} coordinate grid, including edges owned by boundary cells marked non-playable. It is not inferred from linear features, non-playable regions, footprints, barriers, vegetation, or texture bands.
${formatOuterPerimeter(definition.outerPerimeter)}
${openings}

EXACT INTERNAL PLAYABLE/NON-PLAYABLE TRANSITIONS (${definition.impassableTransitions.length} edges)
These internal edges are separate from the outer grid envelope. They preserve non-playable gaps and regions without shrinking or redefining the ${board.columns}x${board.rows} grid.
${formatEdges(definition.impassableTransitions)}

BOUNDARY APPEARANCE
Outer-envelope LOCATION is fixed; its APPEARANCE is creative and must be derived from Image 1. Carry one coherent in-world treatment around the exact envelope while preserving declared openings and feature crossings. The outside world remains continuous yet clearly outside the grid. The boundary is a top-surface transition, not a vertical side wall, second strip of cells, extra row, or extra column. Internal playable/non-playable transitions remain distinct semantic features and do not replace the outer envelope.

SCENE AND STYLE
Extend only the visual language already present in Image 1 into a seamless full-screen scene. Do not substitute a separately named biome, palette, lighting scheme, material vocabulary, or style. Preserve every declared cell elevation. Seam surfaces, linear features, footprints, edge objects, the envelope, and surrounding environment into one professional continuous painting.

CONSTRAINTS
No units, chess pieces, people, creatures, UI, coordinate labels, text, watermark, or baked grid lines.
No black box, black void around the scene, floating board, vignette frame, or hard crop.
No unstated ramps, cliffs, elevation tiers, pits, buildings, blockers, barriers, or feature branches.
No vertical board skirt, attached side strip, extra row, extra column, or grid continuation in surrounding scenery.
No checkerboard, patchwork quilt, square terrain swatches, cell-by-cell tinting, or terrain seams that reveal hidden address boundaries.
Geometry and semantics above override all artistic discretion.
`;
}

export function buildPredrawnGenerationArtifacts(inputDefinition, referenceBytes) {
  const definition = normalizePredrawnGenerationDefinition(inputDefinition);
  const dimensions = pngSize(referenceBytes);
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
    outerPerimeter: definition.outerPerimeter,
    impassableTransitions: definition.impassableTransitions,
  };
  const references = {
    schemaVersion: PREDRAWN_GENERATION_SCHEMA_VERSION,
    runId: definition.runId,
    references: [{
      index: 1,
      role: 'canonical-unit-free-ground-cover-free-top-surfaces-only-art-authority',
      sourceSlot: definition.reference.sourceSlot,
      sha256: sha256(referenceBytes),
      ...dimensions,
    }],
  };
  const manifest = {
    schemaVersion: PREDRAWN_GENERATION_SCHEMA_VERSION,
    runId: definition.runId,
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
  };
  return { definition, prompt, packet, references, manifest };
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

export async function runPredrawnGenerationCli(argv = process.argv.slice(2)) {
  const args = parsePredrawnGenerationArgs(argv);
  const definitionPath = path.resolve(args.definition);
  const referencePath = path.resolve(args.reference);
  const outputPath = path.resolve(args.out);
  const definition = JSON.parse(await readFile(definitionPath, 'utf8'));
  const referenceBytes = await readFile(referencePath);
  const artifacts = await writePredrawnGenerationRun({ definition, referenceBytes, outputPath });
  process.stdout.write(`${outputPath}\n${artifacts.manifest.promptSha256}\n`);
}

const isCli = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
  await runPredrawnGenerationCli();
}
