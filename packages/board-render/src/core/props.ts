// Multi-cell board PROPS (trees, houses) — a gameplay-side data model, distinct from
// unitCatalog's sprite `footprint`. A prop occupies a W×H block of cells, anchored at its
// min-(x,y) corner, and (when `blocking`) is realised in the live game as N single-cell
// neutral `rock` collider pieces stamped at game-build time (see game/setup.ts). That keeps
// the rules engine untouched: a prop is "just rocks" to movement/capture/victory, and the
// renderer draws ONE tall sprite over the whole footprint (see render/BoardStructure.tsx).
//
// Anchor convention: (x,y) is the min-(x,y) cell of the footprint (smallest x AND smallest y).
// No rotation in v1, so a prop serialises as a single entry at its anchor.

import { STRUCTURE_ART_ASSETS, structureArtAsset, structureRasterDimensions } from './structureArt';

export type PropKind = 'tree' | 'house' | 'rock';
export type StructurePlacement = 'prop' | 'doodad';
export type StructureSourceKind = 'asset' | 'prop' | 'doodad';
export interface StructureSourceRef { kind: StructureSourceKind; id: string }
export interface StructurePart {
  source: StructureSourceRef;
  anchorX: number;
  anchorY: number;
  scale: number;
}

/** The sprite frame geometry for a prop (pixel dims + the ground-contact anchor pixel). */
export interface PropSprite {
  /** Frame width in px. */
  w: number;
  /** Frame height in px. */
  h: number;
  /** X of the contact pixel within the frame (the ground centre column). */
  anchorX: number;
  /** Y of the contact pixel within the frame (where the prop meets the ground). */
  anchorY: number;
  /** Render scale multiplier (1 = native frame px). The contact anchor is in FRAME px —
   *  the seat transform is a percentage of the element, so it holds at any scale. */
  scale: number;
}

// Per-prop seat tuning (contact anchor + render scale) — eye-tuned in /prop-lab, whose
// Save replaces the complete live DB document. The original anchors were
// alpha-bbox measurements of the cropped renders (bbox bottom = the base's FRONT corner,
// which the renderer then seats on the footprint's ground CENTRE — hence props that
// floated until tuned). `prop_seats/default` is the single source of truth.
//
// A live seat entry with a `base` is a SIZE VARIANT (ADR-0059 "share base"): it reuses the
// base prop's PNG + gameplay footprint and differs ONLY by its own seat (scale + anchor). A
// variant is a distinct prop id, so placement/serialisation need no change; it just gets its own
// PROP_DEFS entry synthesized from the base. Authored by eye in /prop-lab.
// A prop-config entry: the seat (anchor + render scale), an optional gameplay FOOTPRINT override
// (w × h cells — absent means the default/base footprint), and, for a size variant, its `base`.
export type PropSeatEntry = {
  anchorX: number;
  anchorY: number;
  scale: number;
  w?: number;
  h?: number;
  base?: string;
  label?: string;
  placement?: StructurePlacement;
  source?: StructureSourceRef;
  parts?: StructurePart[];
  kind?: PropKind;
  terrains?: string[];
  blocking?: boolean;
};
export type PropSeatMap = Record<string, PropSeatEntry>;

const DEFAULT_FOOTPRINT = 2;

// There is intentionally no packaged seed or last-good fallback. Application
// startup and server thumbnails hydrate this before importing/rendering a board.
let SEATS: PropSeatMap | null = null;

/** The complete live map that PROP_DEFS is derived from. */
export function currentSeats(): PropSeatMap {
  if (!SEATS) throw new Error('prop seats are not hydrated');
  return SEATS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSource(value: unknown): value is StructureSourceRef {
  return isRecord(value)
    && (value.kind === 'asset' || value.kind === 'prop' || value.kind === 'doodad')
    && typeof value.id === 'string'
    && value.id.length > 0;
}

/** Reject a partial or malformed DB snapshot before it can replace renderer state. */
export function assertPropSeatMap(value: unknown): asserts value is PropSeatMap {
  if (!isRecord(value)) throw new Error('invalid prop seats: document must be an object map');
  const baseIds = STRUCTURE_ART_ASSETS.filter((asset) => asset.kind !== 'doodad').map((asset) => asset.id);
  for (const id of baseIds) {
    if (!Object.hasOwn(value, id)) throw new Error(`invalid prop seats: required prop "${id}" is missing`);
  }
  for (const [id, raw] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`invalid prop seats: prop id "${id}" is not a lowercase slug`);
    if (!isRecord(raw)) throw new Error(`invalid prop seats: seat "${id}" must be an object`);
    if (!Number.isFinite(raw.anchorX) || !Number.isFinite(raw.anchorY)) {
      throw new Error(`invalid prop seats: seat "${id}" needs numeric anchorX/anchorY`);
    }
    if (!(Number.isFinite(raw.scale) && Number(raw.scale) > 0)) {
      throw new Error(`invalid prop seats: seat "${id}" needs a positive scale`);
    }
    for (const dim of ['w', 'h'] as const) {
      if (Object.hasOwn(raw, dim) && !(Number.isInteger(raw[dim]) && Number(raw[dim]) >= 1)) {
        throw new Error(`invalid prop seats: seat "${id}" ${dim} must be a positive integer`);
      }
    }
    if (Object.hasOwn(raw, 'base')) {
      if (typeof raw.base !== 'string' || !Object.hasOwn(value, raw.base)) {
        throw new Error(`invalid prop seats: seat "${id}" base must reference this document`);
      }
      if (!baseIds.includes(raw.base)) {
        throw new Error(`invalid prop seats: seat "${id}" base must reference an installed base prop`);
      }
      if (baseIds.includes(id)) {
        throw new Error(`invalid prop seats: required prop "${id}" cannot be a variant`);
      }
    }
    if (Object.hasOwn(raw, 'placement') && raw.placement !== 'prop' && raw.placement !== 'doodad') {
      throw new Error(`invalid prop seats: seat "${id}" placement is invalid`);
    }
    if (Object.hasOwn(raw, 'base') && Object.hasOwn(raw, 'placement')) {
      throw new Error(`invalid prop seats: seat "${id}" cannot be both a variant and authored placement`);
    }
    if (Object.hasOwn(raw, 'source') && !isSource(raw.source)) {
      throw new Error(`invalid prop seats: seat "${id}" source is invalid`);
    }
    if (Object.hasOwn(raw, 'parts')) {
      if (!Array.isArray(raw.parts) || raw.parts.length === 0 || raw.parts.some((part) => !isStructurePart(part))) {
        throw new Error(`invalid prop seats: seat "${id}" parts are invalid`);
      }
    }
    if (raw.placement && !Object.hasOwn(raw, 'source') && !Object.hasOwn(raw, 'parts')) {
      throw new Error(`invalid prop seats: seat "${id}" authored placement needs source or parts`);
    }
    if (!baseIds.includes(id) && !raw.base && !raw.placement) {
      throw new Error(`invalid prop seats: seat "${id}" must be a variant or authored placement`);
    }
    if (Object.hasOwn(raw, 'kind') && raw.kind !== 'tree' && raw.kind !== 'house' && raw.kind !== 'rock') {
      throw new Error(`invalid prop seats: seat "${id}" kind is invalid`);
    }
    if (Object.hasOwn(raw, 'terrains') && (!Array.isArray(raw.terrains) || raw.terrains.some((terrain) => typeof terrain !== 'string' || !terrain))) {
      throw new Error(`invalid prop seats: seat "${id}" terrains are invalid`);
    }
    if (Object.hasOwn(raw, 'blocking') && typeof raw.blocking !== 'boolean') {
      throw new Error(`invalid prop seats: seat "${id}" blocking must be boolean`);
    }
    if (Object.hasOwn(raw, 'label') && typeof raw.label !== 'string') {
      throw new Error(`invalid prop seats: seat "${id}" label must be a string`);
    }
  }
}

function seat(seats: PropSeatMap, id: string): { anchorX: number; anchorY: number; scale: number } {
  const s = seats[id];
  if (!s) throw new Error(`prop seats document has no seat for prop "${id}"`);
  return { anchorX: s.anchorX, anchorY: s.anchorY, scale: s.scale };
}
const footW = (seats: PropSeatMap, id: string): number => seats[id]?.w ?? DEFAULT_FOOTPRINT;
const footH = (seats: PropSeatMap, id: string): number => seats[id]?.h ?? DEFAULT_FOOTPRINT;

export interface PropDef {
  id: string;
  label: string;
  kind: PropKind;
  /** Gameplay occupancy width (cells). */
  w: number;
  /** Gameplay occupancy height (cells). */
  h: number;
  /** When true, the prop stamps a neutral rock collider on every footprint cell. */
  blocking: boolean;
  /** Terrain/family ids ('grass' | 'dirt' | 'stone' | …) the prop may be placed on. */
  terrains: string[];
  /** Sprite frame geometry + contact anchor (NOT the gameplay dims above). */
  sprite: PropSprite;
  /** The asset folder to load (/assets/props/<spriteId>/…). Size variants SHARE the base's
   *  PNG, so their spriteId is the base's id, not their own. Base props: spriteId === id. */
  spriteId: string;
  /** Optional source artwork override. Authored structures can share prop OR doodad art. */
  spriteSource?: StructureSourceRef;
  /** Optional placed artwork slots. When present, render each slot over the same footprint. */
  spriteParts?: StructurePart[];
  /** Catalog grouping — a base and its size variants share one family. Base props: family === id. */
  family: string;
}

/** One placed prop: (x,y) is the ANCHOR = the min-(x,y) cell of its footprint. */
export interface PlacedProp {
  x: number;
  y: number;
  propId: string;
}

function baseDefs(seats: PropSeatMap): PropDef[] {
  const sprite = (id: string) => {
    const art = structureArtAsset(id);
    if (!art) throw new Error(`required structure art definition "${id}" is missing`);
    return { w: art.sprite.w, h: art.sprite.h, ...seat(seats, id) };
  };
  return STRUCTURE_ART_ASSETS.filter((asset) => asset.kind !== 'doodad').map((asset) => ({
    id: asset.id,
    label: asset.label,
    kind: asset.propKind ?? (asset.kind === 'tree' || asset.kind === 'rock' ? asset.kind : 'house'),
    w: seats[asset.id]?.w ?? asset.footprint?.w ?? DEFAULT_FOOTPRINT,
    h: seats[asset.id]?.h ?? asset.footprint?.h ?? DEFAULT_FOOTPRINT,
    blocking: asset.blocking,
    terrains: asset.terrains,
    spriteId: asset.id,
    spriteSource: { kind: 'asset', id: asset.id },
    family: asset.id,
    sprite: sprite(asset.id),
  }));
}

// Size variants: any seat entry with a `base` synthesizes a prop that SHARES the base's PNG +
// gameplay footprint, differing only by its own seat (scale + anchor). It inherits the base's
// spriteId (so it loads the base's asset) and family (so the catalog groups them).
function variantDefs(seats: PropSeatMap, bases: readonly PropDef[]): PropDef[] {
  const byId = new Map(bases.map((d) => [d.id, d]));
  const out: PropDef[] = [];
  for (const [id, s] of Object.entries(seats)) {
    if (s.placement) continue;
    if (!s.base) continue;
    const base = byId.get(s.base);
    if (!base) throw new Error(`prop variant "${id}" references unknown base "${s.base}"`);
    out.push({
      ...base, // inherit kind/blocking/terrains/spriteId/family from the base
      id,
      label: s.label ?? `${base.label} (${id})`,
      // Footprint: a variant inherits the base's cells unless its entry overrides w/h.
      w: s.w ?? base.w,
      h: s.h ?? base.h,
      sprite: { w: base.sprite.w, h: base.sprite.h, anchorX: s.anchorX, anchorY: s.anchorY, scale: s.scale },
    });
  }
  return out;
}

const isStructureSource = (value: unknown): value is StructureSourceRef =>
  !!value
  && typeof value === 'object'
  && ((value as StructureSourceRef).kind === 'asset' || (value as StructureSourceRef).kind === 'prop' || (value as StructureSourceRef).kind === 'doodad')
  && typeof (value as StructureSourceRef).id === 'string'
  && (value as StructureSourceRef).id.length > 0;

const isStructurePart = (value: unknown): value is StructurePart =>
  !!value
  && typeof value === 'object'
  && isStructureSource((value as StructurePart).source)
  && Number.isFinite((value as StructurePart).anchorX)
  && Number.isFinite((value as StructurePart).anchorY)
  && Number.isFinite((value as StructurePart).scale)
  && (value as StructurePart).scale > 0;

export function structurePartsFromSeat(seat: PropSeatEntry): StructurePart[] {
  const authoredParts = Array.isArray(seat.parts) ? seat.parts.filter(isStructurePart) : [];
  if (authoredParts.length) {
    return authoredParts.map((part) => ({
      source: part.source,
      anchorX: part.anchorX,
      anchorY: part.anchorY,
      scale: part.scale,
    }));
  }
  if (!seat.source) return [];
  return [{ source: seat.source, anchorX: seat.anchorX, anchorY: seat.anchorY, scale: seat.scale }];
}

function authoredPropDefs(seats: PropSeatMap, sourceProps: readonly PropDef[]): PropDef[] {
  const byId = new Map(sourceProps.map((d) => [d.id, d]));
  const out: PropDef[] = [];
  for (const [id, s] of Object.entries(seats)) {
    if (s.placement !== 'prop') continue;
    const parts = structurePartsFromSeat(s);
    if (!parts.length) continue;
    const source = parts[0].source;
    const sourceProp = source.kind === 'prop' ? byId.get(source.id) : undefined;
    const sourceArt = source.kind === 'asset' ? structureArtAsset(source.id) : undefined;
    const sourceSprite = source.kind === 'asset'
      ? sourceArt?.sprite
      : source.kind === 'prop'
        ? sourceProp?.sprite
        : { ...structureRasterDimensions(`/assets/doodads/${source.id}`), anchorX: s.anchorX, anchorY: s.anchorY };
    if (!sourceSprite) throw new Error(`authored prop "${id}" source "${source.id}" is unavailable`);
    const sourceTerrains = sourceArt?.terrains ?? sourceProp?.terrains ?? ['grass', 'dirt', 'stone'];
    const sourceKind = sourceProp?.kind ?? sourceArt?.propKind ?? (sourceArt?.kind === 'tree' || sourceArt?.kind === 'rock' ? sourceArt.kind : 'house');
    out.push({
      id,
      label: s.label ?? id,
      kind: s.kind ?? sourceKind,
      w: s.w ?? sourceProp?.w ?? 1,
      h: s.h ?? sourceProp?.h ?? 1,
      blocking: s.blocking ?? true,
      terrains: s.terrains ?? sourceTerrains,
      spriteId: source.kind === 'prop' ? (sourceProp?.spriteId ?? source.id) : source.id,
      spriteSource: source,
      spriteParts: parts,
      family: id,
      sprite: { w: sourceSprite.w, h: sourceSprite.h, anchorX: parts[0].anchorX, anchorY: parts[0].anchorY, scale: parts[0].scale },
    });
  }
  return out;
}

function deriveDefs(seats: PropSeatMap): PropDef[] {
  const bases = baseDefs(seats);
  const variants = variantDefs(seats, bases);
  return [...bases, ...variants, ...authoredPropDefs(seats, [...bases, ...variants])];
}

// Consumers import this live binding. It remains empty until one complete DB
// document is validated and applied; there is no implicit production fixture.
export let PROP_DEFS: readonly PropDef[] = [];

export function applyPropSeats(value: unknown): boolean {
  assertPropSeatMap(value);
  const seats = value as PropSeatMap;
  const derived = deriveDefs(seats);
  SEATS = seats;
  PROP_DEFS = derived;
  return true;
}

/** Test/process reset only: returns the renderer to its explicit unhydrated state. */
export function resetPropSeats(): boolean {
  if (!SEATS) return false;
  SEATS = null;
  PROP_DEFS = [];
  return true;
}

/**
 * Resolve a prop id to its definition, or `undefined` for an unknown id. Callers (the
 * collision bridge, the renderer) SKIP unknown ids rather than falling back to a default —
 * a forward-compat prop saved by a newer client must not silently become an oak.
 */
export function propDef(id: string): PropDef | undefined {
  if (!SEATS) throw new Error('prop seats are not hydrated');
  return PROP_DEFS.find((def) => def.id === id);
}

/**
 * The cells a prop occupies, anchored at (anchorX, anchorY): every (ax+dx, ay+dy) for
 * 0 ≤ dx < def.w and 0 ≤ dy < def.h. THE single footprint-expansion helper — reused by the
 * editor (placement/erase/hover), the collision bridge, and the renderer so they can't drift.
 */
export function propCells(anchorX: number, anchorY: number, def: PropDef): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];
  for (let dy = 0; dy < def.h; dy += 1) {
    for (let dx = 0; dx < def.w; dx += 1) {
      cells.push({ x: anchorX + dx, y: anchorY + dy });
    }
  }
  return cells;
}
