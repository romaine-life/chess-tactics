import wallArtJson from './wallArt.json';
import {
  parseEdgeKey,
  isOrthogonalPair,
  roadEdgeKey,
} from './featureAutotile';
import { wallDecorAsset, type WallDecorAsset, type WallDecorFaceId } from './wallDecor';

export type WallArtId = string;

/** Wall-art slots use a stable base-relative mounting datum. Growing the canonical wall upward
 * must not move existing persisted or live-authored art; the datum remains 96px above the seat. */
export const WALL_ART_SLOT_DATUM = {
  anchorX: 64,
  anchorY: 96,
} as const;

export interface WallArtSlot {
  id: string;
  sourceId: string;
  face: WallDecorFaceId;
  /** Target point from the canonical base-relative wall-art datum, in native pixels. */
  x: number;
  /** Target point from the canonical base-relative wall-art datum, in native pixels. */
  y: number;
  scale: number;
}

export interface WallArtReflectionConfig {
  /** Final alpha multiplier for reflected subjects. */
  opacity: number;
}

export const DEFAULT_WALL_ART_REFLECTION: Readonly<WallArtReflectionConfig> = {
  opacity: 0.72,
};

export interface WallArt {
  id: string;
  label: string;
  span: number;
  slots: WallArtSlot[];
  /** Present whenever at least one slot is a mirror. There is deliberately no off/none mode:
   * mirror artwork always resolves to live optics. */
  reflection?: WallArtReflectionConfig;
}

export type WallArtEntry = Omit<WallArt, 'id' | 'span'> & { span?: number };
export type WallArtMap = Record<string, WallArtEntry>;
export type WallArtPlacementMap = Record<string, WallArtId>;
export type WallArtFaceMap = Partial<Record<WallDecorFaceId, WallArtId>>;

const BASELINE_WALL_ART = wallArtJson as WallArtMap;
let WALL_ART_MAP: WallArtMap = BASELINE_WALL_ART;

const WALL_ART_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

function coerceSlot(slot: WallArtSlot): WallArtSlot | null {
  if (!slot || !WALL_ART_ID_PATTERN.test(slot.sourceId)) return null;
  if (slot.face !== 'west' && slot.face !== 'north') return null;
  if (!Number.isFinite(slot.x) || !Number.isFinite(slot.y) || !(Number.isFinite(slot.scale) && slot.scale > 0)) return null;
  return {
    id: WALL_ART_ID_PATTERN.test(slot.id) ? slot.id : `${slot.sourceId}-${slot.face}`,
    sourceId: slot.sourceId,
    face: slot.face,
    x: slot.x,
    y: slot.y,
    scale: slot.scale,
  };
}

const clamp = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

/** Normalize persisted/editor optics into the one live contract. Geometry and sprite scale are
 * intentionally not configurable: every mirror is an exact board-grid, 1:1 reflection. */
export function normalizeWallArtReflection(value: unknown): WallArtReflectionConfig {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<Record<keyof WallArtReflectionConfig, unknown>>
    : {};
  return {
    opacity: clamp(record.opacity, DEFAULT_WALL_ART_REFLECTION.opacity, 0.05, 1),
  };
}

function normalizeWallArt(id: string, entry: WallArtEntry): WallArt | null {
  if (!WALL_ART_ID_PATTERN.test(id)) return null;
  if (!entry || !Array.isArray(entry.slots)) return null;
  const slots = entry.slots.map((slot) => coerceSlot(slot as WallArtSlot)).filter((slot): slot is WallArtSlot => !!slot);
  const span = Number.isFinite(entry.span) ? Math.max(1, Math.min(16, Math.round(Number(entry.span)))) : 1;
  const hasMirrorSlot = slots.some((slot) => wallDecorAsset(slot.sourceId).kind === 'mirror');
  const reflection = hasMirrorSlot || entry.reflection ? normalizeWallArtReflection(entry.reflection) : undefined;
  return {
    id,
    label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : id,
    span,
    slots,
    ...(reflection ? { reflection } : {}),
  };
}

export function currentWallArt(): WallArtMap {
  return WALL_ART_MAP;
}

export function applyLiveWallArt(overrides: WallArtMap | null | undefined): boolean {
  if (!overrides || Object.keys(overrides).length === 0) return false;
  const merged = { ...BASELINE_WALL_ART, ...overrides };
  const normalized = Object.entries(merged).map(([id, entry]) => normalizeWallArt(id, entry));
  if (normalized.some((entry) => !entry)) return false;
  // Persist only the current contract shape in memory. This retires stale mode/FOV/scale keys
  // from older live rows instead of carrying them back through Studio on the next save.
  WALL_ART_MAP = wallArtMapFromItems(normalized as WallArt[]);
  return true;
}

export function wallArtItems(): WallArt[] {
  return Object.entries(WALL_ART_MAP)
    .map(([id, entry]) => normalizeWallArt(id, entry))
    .filter((asset): asset is WallArt => !!asset);
}

export function wallArt(id: string | undefined): WallArt | undefined {
  if (!id) return undefined;
  const entry = WALL_ART_MAP[id];
  return entry ? normalizeWallArt(id, entry) ?? undefined : undefined;
}

/** The stable catalog fallback shared by editor mount and later route synchronization. */
export function wallArtIdOrDefault(id: string | undefined): WallArtId {
  return wallArt(id)?.id ?? wallArtItems()[0]?.id ?? 'banner-stone-wall';
}

export function wallArtLabel(artId: string | undefined): string {
  return wallArt(artId)?.label ?? 'Wall Art';
}

export function wallArtBadge(artId: string | undefined): string {
  const art = wallArt(artId);
  return art ? `${art.span} wall${art.span === 1 ? '' : 's'} · ${art.slots.length} art${art.slots.length === 1 ? '' : 's'}` : 'wall art';
}

export function wallFaceTarget(
  edge: string,
  bounds: { cols: number; rows: number },
): { key: string; face: WallDecorFaceId; x: number; y: number; edge: string } | null {
  const cells = parseEdgeKey(edge);
  if (!cells) return null;
  const { ax, ay, bx, by } = cells;
  if (!isOrthogonalPair(ax, ay, bx, by)) return null;
  if (ay === by) {
    if (ay < 0 || ay >= bounds.rows) return null;
    return [ax, bx].includes(-1) && [ax, bx].includes(0) ? { key: `0,${ay}`, face: 'west', x: 0, y: ay, edge: roadEdgeKey(0, ay, -1, ay) } : null;
  }
  if (ax !== bx || ax < 0 || ax >= bounds.cols) return null;
  return [ay, by].includes(-1) && [ay, by].includes(0) ? { key: `${ax},0`, face: 'north', x: ax, y: 0, edge: roadEdgeKey(ax, 0, ax, -1) } : null;
}

export function wallArtSpanForId(artId: string | undefined): number {
  return wallArt(artId)?.span ?? 1;
}

export function wallArtSpanEdges(
  anchorEdge: string,
  artId: string | undefined,
  bounds: { cols: number; rows: number },
): string[] {
  const target = wallFaceTarget(anchorEdge, bounds);
  if (!target) return [];
  const out: string[] = [];
  const span = wallArtSpanForId(artId);
  for (let i = 0; i < span; i += 1) {
    if (target.face === 'west') {
      const y = target.y + i;
      if (y >= bounds.rows) break;
      out.push(roadEdgeKey(0, y, -1, y));
    } else {
      const x = target.x + i;
      if (x >= bounds.cols) break;
      out.push(roadEdgeKey(x, 0, x, -1));
    }
  }
  return out;
}

export interface WallArtPlacementSpan {
  anchorEdge: string;
  edges: string[];
}

/** Resolve a multi-wall stamp from any supporting edge the user clicked.
 *
 * The persisted placement still owns one canonical leading edge, but the editor must not require
 * an author to know which end of an isometric wall run that is. Preserve the old clicked-as-anchor
 * behavior whenever its forward span is supported; otherwise scan toward the leading end one edge
 * at a time until the nearest complete span containing the click is found. */
export function wallArtPlacementSpanAtEdge(
  clickedEdge: string,
  artId: string | undefined,
  bounds: { cols: number; rows: number },
  hasSupportingWall: (edge: string) => boolean,
): WallArtPlacementSpan | null {
  const art = wallArt(artId);
  const clicked = wallFaceTarget(clickedEdge, bounds);
  if (!art || !clicked) return null;

  for (let clickedOffset = 0; clickedOffset < art.span; clickedOffset += 1) {
    const tangent = (clicked.face === 'west' ? clicked.y : clicked.x) - clickedOffset;
    if (tangent < 0) continue;
    const anchorEdge = clicked.face === 'west'
      ? roadEdgeKey(0, tangent, -1, tangent)
      : roadEdgeKey(tangent, 0, tangent, -1);
    const edges = wallArtSpanEdges(anchorEdge, art.id, bounds);
    if (edges.length !== art.span || !edges.includes(clicked.edge)) continue;
    if (edges.every(hasSupportingWall)) return { anchorEdge, edges };
  }
  return null;
}

export function wallArtAtEdge(
  edge: string,
  placements: WallArtPlacementMap | undefined,
  bounds: { cols: number; rows: number },
): { anchorEdge: string; artId: WallArtId; edges: string[] } | null {
  for (const [anchorEdge, artId] of Object.entries(placements ?? {})) {
    const edges = wallArtSpanEdges(anchorEdge, artId, bounds);
    if (edges.includes(edge)) return { anchorEdge, artId, edges };
  }
  return null;
}

export function resolveWallArtFaces(
  placements: WallArtPlacementMap | undefined,
  bounds: { cols: number; rows: number },
): Map<string, WallArtFaceMap> {
  const out = new Map<string, WallArtFaceMap>();
  for (const [anchorEdge, artId] of Object.entries(placements ?? {})) {
    const target = wallFaceTarget(anchorEdge, bounds);
    if (!target || !wallArt(artId)) continue;
    const current = out.get(target.key) ?? {};
    current[target.face] = artId;
    out.set(target.key, current);
  }
  return out;
}

export function wallArtSlotsForFace(artId: string | undefined, face: WallDecorFaceId): WallArtSlot[] {
  return wallArt(artId)?.slots.filter((slot) => slot.face === face) ?? [];
}

export function slotSource(slot: WallArtSlot): WallDecorAsset {
  return wallDecorAsset(slot.sourceId);
}

export function wallArtMapFromItems(items: readonly WallArt[]): WallArtMap {
  return Object.fromEntries(items.map((asset) => [asset.id, {
    label: asset.label,
    span: asset.span,
    slots: asset.slots,
    ...(asset.reflection ? { reflection: asset.reflection } : {}),
  }]));
}

export function wallArtSrcs(
  placements: WallArtPlacementMap | undefined,
  bounds: { cols: number; rows: number },
): string[] {
  const urls = new Set<string>();
  const faces = resolveWallArtFaces(placements, bounds);
  for (const faceMap of faces.values()) {
    for (const face of ['west', 'north'] as const) {
      for (const slot of wallArtSlotsForFace(faceMap[face], face)) {
        const source = slotSource(slot);
        urls.add(source.faces[face].src);
        if (source.kind === 'mirror') urls.add(source.faces[face].glassSrc);
      }
    }
  }
  return [...urls];
}
