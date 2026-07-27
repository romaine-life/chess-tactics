/**
 * One visual-only highlight footprint inside a canonical board cell.
 *
 * Coordinates are integer-normalized from 0..10000 against the cell's 96×54 screen-space
 * bounding box and remain in
 * top, right, bottom, left order. The ordinary full-cell diamond is:
 * [5000, 0, 10000, 5000, 5000, 10000, 0, 5000].
 *
 * These values never define board addressing, movement, picking, dragging, or any other logical
 * geometry. The persisted profile retains its historical move-highlight name, but the footprint
 * clips every square-local visual highlight over a selected pre-drawn background.
 */
export type PredrawnMoveHighlightFootprint = readonly [
  topX: number,
  topY: number,
  rightX: number,
  rightY: number,
  bottomX: number,
  bottomY: number,
  leftX: number,
  leftY: number,
];

export const PREDRAWN_MOVE_HIGHLIGHT_PROFILE_SCHEMA =
  'predrawn-move-highlight-profile-v1' as const;
export const PREDRAWN_MOVE_HIGHLIGHT_COORDINATE_BASIS =
  'cell-diamond-10000-v1' as const;

export type PredrawnMoveHighlightCells =
  Readonly<Record<string, PredrawnMoveHighlightFootprint>>;

export interface PredrawnMoveHighlightProfile {
  schema: typeof PREDRAWN_MOVE_HIGHLIGHT_PROFILE_SCHEMA;
  backgroundVersionId: string;
  coordinateBasis: typeof PREDRAWN_MOVE_HIGHLIGHT_COORDINATE_BASIS;
  environmentGeometrySha256: string;
  /** Sparse playable-cell map. An omitted cell uses the complete canonical diamond. */
  cells: PredrawnMoveHighlightCells;
  /** Digest of the server-owned canonical profile snapshot. */
  profileSha256: string;
}

export const FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT: PredrawnMoveHighlightFootprint = [
  5000, 0,
  10000, 5000,
  5000, 10000,
  0, 5000,
];

export const FULL_CELL_MOVE_HIGHLIGHT_CLIP_PATH =
  'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
export const PREDRAWN_VISUAL_FOOTPRINT_CLIP_CSS_PROPERTY =
  '--predrawn-visual-footprint-clip' as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const CELL_KEY_PATTERN = /^(0|[1-9]\d?),(0|[1-9]\d?)$/;
const MINIMUM_VERTEX_TURN = 10000;
const MINIMUM_DOUBLED_AREA = 2_000_000;
const MAX_PROFILE_CELLS = 4096;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function comparePredrawnMoveHighlightCellKeys(a: string, b: string): number {
  const [ax, ay] = a.split(',').map(Number);
  const [bx, by] = b.split(',').map(Number);
  return ay - by || ax - bx;
}

function canonicalCoordinate(value: unknown): number | undefined {
  const coordinate = Number(value);
  if (!Number.isSafeInteger(coordinate) || coordinate < 0 || coordinate > 10000) {
    return undefined;
  }
  return coordinate;
}

function footprintPoints(
  footprint: PredrawnMoveHighlightFootprint,
): readonly (readonly [number, number])[] {
  return [
    [footprint[0], footprint[1]],
    [footprint[2], footprint[3]],
    [footprint[4], footprint[5]],
    [footprint[6], footprint[7]],
  ];
}

function signedTurn(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): number {
  return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
}

function validContainedConvexFootprint(footprint: PredrawnMoveHighlightFootprint): boolean {
  const points = footprintPoints(footprint);
  if (
    footprint[1] > 5000
    || footprint[2] < 5000
    || footprint[5] < 5000
    || footprint[6] > 5000
  ) return false;
  if (points.some(([x, y]) => Math.abs(x - 5000) + Math.abs(y - 5000) > 5000)) {
    return false;
  }
  let doubledArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    doubledArea += point[0] * next[1] - point[1] * next[0];
    const turn = signedTurn(
      point,
      next,
      points[(index + 2) % points.length],
    );
    if (turn <= MINIMUM_VERTEX_TURN) return false;
  }
  return doubledArea >= MINIMUM_DOUBLED_AREA;
}

export function isFullCellMoveHighlightFootprint(
  footprint: PredrawnMoveHighlightFootprint,
): boolean {
  return footprint.every(
    (coordinate, index) => coordinate === FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT[index],
  );
}

/** Validate and canonicalize one sparse visual footprint. */
export function normalizePredrawnMoveHighlightFootprint(
  value: unknown,
): PredrawnMoveHighlightFootprint | undefined {
  if (!Array.isArray(value) || value.length !== 8) return undefined;
  const coordinates = value.map(canonicalCoordinate);
  if (coordinates.some((coordinate) => coordinate === undefined)) return undefined;
  const footprint = coordinates as unknown as PredrawnMoveHighlightFootprint;
  return validContainedConvexFootprint(footprint) ? footprint : undefined;
}

/** Validate a complete exact profile snapshot. Invalid or non-sparse payloads fail closed. */
export function normalizePredrawnMoveHighlightProfile(
  value: unknown,
): PredrawnMoveHighlightProfile | undefined {
  if (!isRecord(value)) return undefined;
  const backgroundVersionId = typeof value.backgroundVersionId === 'string'
    ? value.backgroundVersionId.trim().toLowerCase()
    : '';
  const environmentGeometrySha256 = typeof value.environmentGeometrySha256 === 'string'
    ? value.environmentGeometrySha256.trim().toLowerCase()
    : '';
  const profileSha256 = typeof value.profileSha256 === 'string'
    ? value.profileSha256.trim().toLowerCase()
    : '';
  if (
    value.schema !== PREDRAWN_MOVE_HIGHLIGHT_PROFILE_SCHEMA
    || value.coordinateBasis !== PREDRAWN_MOVE_HIGHLIGHT_COORDINATE_BASIS
    || !UUID_PATTERN.test(backgroundVersionId)
    || !SHA256_PATTERN.test(environmentGeometrySha256)
    || !SHA256_PATTERN.test(profileSha256)
    || !isRecord(value.cells)
  ) return undefined;

  const entries = Object.entries(value.cells);
  if (entries.length > MAX_PROFILE_CELLS) return undefined;
  const cells: Record<string, PredrawnMoveHighlightFootprint> = {};
  for (const [key, candidate] of entries.sort(
    ([a], [b]) => comparePredrawnMoveHighlightCellKeys(a, b),
  )) {
    if (!CELL_KEY_PATTERN.test(key)) return undefined;
    const [x, y] = key.split(',').map(Number);
    if (x >= 64 || y >= 64) return undefined;
    const footprint = normalizePredrawnMoveHighlightFootprint(candidate);
    if (!footprint) return undefined;
    // Normalize draft input to the canonical sparse representation the backend hashes.
    if (isFullCellMoveHighlightFootprint(footprint)) continue;
    cells[key] = footprint;
  }
  return {
    schema: PREDRAWN_MOVE_HIGHLIGHT_PROFILE_SCHEMA,
    backgroundVersionId,
    coordinateBasis: PREDRAWN_MOVE_HIGHLIGHT_COORDINATE_BASIS,
    environmentGeometrySha256,
    cells,
    profileSha256,
  };
}

function percentage(value: number): string {
  return `${Number((value / 100).toFixed(4))}%`;
}

/** CSS paint mask for a footprint. The caller applies it to cyan paint, never the hit target. */
export function predrawnMoveHighlightClipPath(
  footprint: PredrawnMoveHighlightFootprint | undefined,
): string {
  if (!footprint) return FULL_CELL_MOVE_HIGHLIGHT_CLIP_PATH;
  const normalized = normalizePredrawnMoveHighlightFootprint(footprint);
  if (!normalized) return FULL_CELL_MOVE_HIGHLIGHT_CLIP_PATH;
  const points = footprintPoints(normalized);
  return `polygon(${points.map(([x, y]) => `${percentage(x)} ${percentage(y)}`).join(', ')})`;
}

export function predrawnMoveHighlightFootprintForCell(
  profile: PredrawnMoveHighlightProfile | undefined,
  cellKey: string,
  backgroundVersionId?: string,
): PredrawnMoveHighlightFootprint | undefined {
  if (
    !profile
    || (backgroundVersionId !== undefined
      && profile.backgroundVersionId !== backgroundVersionId.toLowerCase())
  ) return undefined;
  return profile.cells[cellKey];
}

export function predrawnVisualFootprintClipStyleForCell(
  surface: {
    kind?: 'predrawn';
    schemaVersion?: number;
    backgroundVersionId?: string;
    moveHighlightProfile?: PredrawnMoveHighlightProfile;
  } | undefined,
  cellKey: string,
): Readonly<Record<typeof PREDRAWN_VISUAL_FOOTPRINT_CLIP_CSS_PROPERTY, string>> | undefined {
  if (surface?.schemaVersion !== 3 || !surface.backgroundVersionId) return undefined;
  const footprint = predrawnMoveHighlightFootprintForCell(
    surface.moveHighlightProfile,
    cellKey,
    surface.backgroundVersionId,
  );
  return footprint
    ? {
        [PREDRAWN_VISUAL_FOOTPRINT_CLIP_CSS_PROPERTY]:
          predrawnMoveHighlightClipPath(footprint),
      }
    : undefined;
}
