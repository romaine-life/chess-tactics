import wallArtJson from './wallArt.json';
import {
  parseEdgeKey,
  isOrthogonalPair,
  roadEdgeKey,
} from './featureAutotile';
import { wallDecorAsset, type WallDecorAsset, type WallDecorFaceId } from './wallDecor';

export type WallArtId = string;

export interface WallArtSlot {
  id: string;
  sourceId: string;
  face: WallDecorFaceId;
  /** Target point in the 128x240 wall frame, in native pixels. */
  x: number;
  /** Target point in the 128x240 wall frame, in native pixels. */
  y: number;
  scale: number;
}

export interface WallArt {
  id: string;
  label: string;
  span: number;
  slots: WallArtSlot[];
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

function normalizeWallArt(id: string, entry: WallArtEntry): WallArt | null {
  if (!WALL_ART_ID_PATTERN.test(id)) return null;
  if (!entry || !Array.isArray(entry.slots)) return null;
  const slots = entry.slots.map((slot) => coerceSlot(slot as WallArtSlot)).filter((slot): slot is WallArtSlot => !!slot);
  const span = Number.isFinite(entry.span) ? Math.max(1, Math.min(16, Math.round(Number(entry.span)))) : 1;
  return {
    id,
    label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : id,
    span,
    slots,
  };
}

export function currentWallArt(): WallArtMap {
  return WALL_ART_MAP;
}

export function applyLiveWallArt(overrides: WallArtMap | null | undefined): boolean {
  if (!overrides || Object.keys(overrides).length === 0) return false;
  const merged = { ...BASELINE_WALL_ART, ...overrides };
  if (!Object.entries(merged).every(([id, entry]) => normalizeWallArt(id, entry))) return false;
  WALL_ART_MAP = merged;
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
  return Object.fromEntries(items.map((asset) => [asset.id, { label: asset.label, span: asset.span, slots: asset.slots }]));
}

export function wallArtSrcs(
  placements: WallArtPlacementMap | undefined,
  bounds: { cols: number; rows: number },
): string[] {
  const urls = new Set<string>();
  const faces = resolveWallArtFaces(placements, bounds);
  for (const faceMap of faces.values()) {
    for (const face of ['west', 'north'] as const) {
      for (const slot of wallArtSlotsForFace(faceMap[face], face)) urls.add(slotSource(slot).faces[face].src);
    }
  }
  return [...urls];
}
