// Multi-cell board PROPS (trees, houses) — a gameplay-side data model, distinct from
// unitCatalog's sprite `footprint`. A prop occupies a W×H block of cells, anchored at its
// min-(x,y) corner, and (when `blocking`) is realised in the live game as N single-cell
// neutral `rock` collider pieces stamped at game-build time (see game/setup.ts). That keeps
// the rules engine untouched: a prop is "just rocks" to movement/capture/victory, and the
// renderer draws ONE tall sprite over the whole footprint (see render/BoardStructure.tsx).
//
// Anchor convention: (x,y) is the min-(x,y) cell of the footprint (smallest x AND smallest y).
// No rotation in v1, so a prop serialises as a single entry at its anchor.

import propSeats from './propSeats.json';
import { structureArtAsset } from './structureArt';

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
// Save writes propSeats.json back through the dev server. The original anchors were
// alpha-bbox measurements of the cropped renders (bbox bottom = the base's FRONT corner,
// which the renderer then seats on the footprint's ground CENTRE — hence props that
// floated until tuned). The JSON is the single source of truth for these values.
//
// A propSeats.json entry with a `base` is a SIZE VARIANT (ADR-0059 "share base"): it reuses the
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

// The committed baseline — the always-render seed (ADR-0061). Live DB overrides (loaded async by
// net/propSeats loadLiveSeats) are layered ON TOP per propId via {...baseline, ...dbSeats}; the
// baseline stays authoritative for presence so props always compose, even with zero DB.
const BASELINE_SEATS = propSeats as PropSeatMap;
const DEFAULT_FOOTPRINT = 2;

// The CURRENT seat map — starts as the baseline, replaced in place by applyLiveSeats when the DB
// overlay arrives. `let` so the derivation below always reads the live map.
let SEATS: PropSeatMap = BASELINE_SEATS;

/** The CURRENT (baseline ∪ live-override) seat map that PROP_DEFS is derived from. Read this — not
 *  the static propSeats.json import — anywhere that must agree with the live PROP_DEFS (e.g. the
 *  /prop-lab "saved" baseline), or a DB-overridden / DB-only prop reads back its stale committed
 *  value (or is absent entirely, and indexing it throws). Returns the live map by reference. */
export function currentSeats(): PropSeatMap {
  return SEATS;
}

function seat(seats: PropSeatMap, id: string): { anchorX: number; anchorY: number; scale: number } {
  const s = seats[id];
  if (!s) throw new Error(`propSeats.json has no seat for prop "${id}"`);
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

// The BASE props. All ship at a 2×2 gameplay footprint; each frame's w/h are facts of the
// shipped PNGs (assets/props/<id>/{back,front}.png) while the contact anchor + scale come from
// the seat map (baseline propSeats.json, eye-tuned in /prop-lab, plus live DB overrides). Each
// base is its own sprite asset + catalog family.
function baseDefs(seats: PropSeatMap): PropDef[] {
  return [
    {
      id: 'oak',
      label: 'Oak tree',
      kind: 'tree',
      w: footW(seats, 'oak'),
      h: footH(seats, 'oak'),
      blocking: true,
      terrains: ['grass', 'dirt'],
      spriteId: 'oak',
      spriteSource: { kind: 'asset', id: 'oak' },
      family: 'oak',
      sprite: { w: 192, h: 300, ...seat(seats, 'oak') },
    },
    {
      id: 'cottage',
      label: 'Cottage',
      kind: 'house',
      w: footW(seats, 'cottage'),
      h: footH(seats, 'cottage'),
      blocking: true,
      terrains: ['grass', 'dirt', 'stone'],
      spriteId: 'cottage',
      spriteSource: { kind: 'asset', id: 'cottage' },
      family: 'cottage',
      sprite: { w: 177, h: 184, ...seat(seats, 'cottage') },
    },
    // Houses — the stylized keeper set. `cottage` above is the low-poly mesh render; these two are
    // gated Codex img2img RESTYLES of real Blender captures (photoreal meshes read "too realistic"
    // raw, so the cabin/green-roof shapes are kept but re-skinned to pixel-art). Method-verified via
    // imageGenVerdict (rollout image_generation_call), NOT code-drawn.
    { id: 'cabin', label: 'Log cabin', kind: 'house', w: footW(seats, 'cabin'), h: footH(seats, 'cabin'), blocking: true, terrains: ['grass', 'dirt', 'stone'], spriteId: 'cabin', spriteSource: { kind: 'asset', id: 'cabin' }, family: 'cabin', sprite: { w: 220, h: 176, ...seat(seats, 'cabin') } },
    { id: 'lodge', label: 'Green-roof house', kind: 'house', w: footW(seats, 'lodge'), h: footH(seats, 'lodge'), blocking: true, terrains: ['grass', 'dirt', 'stone'], spriteId: 'lodge', spriteSource: { kind: 'asset', id: 'lodge' }, family: 'lodge', sprite: { w: 210, h: 177, ...seat(seats, 'lodge') } },
    // Rocks — 1×1 blocking boulders: the placeable impassable-cell obstacle (the old editor's rock
    // terrain swatch, reborn as a prop so the rules engine stays untouched). Same gated Codex restyle
    // pipeline as cabin/lodge, from the two staged /rocks meshes (see SOURCES.md). Native-res PNGs;
    // tile-fit is the `scale` in propSeats.json (eye-tunable in /prop-lab), not a baked-small sprite.
    { id: 'rock', label: 'Rock', kind: 'rock', w: footW(seats, 'rock'), h: footH(seats, 'rock'), blocking: true, terrains: ['grass', 'dirt', 'stone', 'pebble', 'sand'], spriteId: 'rock', spriteSource: { kind: 'asset', id: 'rock' }, family: 'rock', sprite: { w: 40, h: 45, ...seat(seats, 'rock') } },
    // Named 'fieldstone' (not 'granite') to avoid colliding with the obstacle-piece sprite variant
    // ROCK_VARIANTS=['boulder','granite'] under /assets/units/rock/ (render/SkirmishBoard.tsx) — a
    // separate system from these placeable props. Both derive from the same round-boulder mesh.
    { id: 'fieldstone', label: 'Fieldstone', kind: 'rock', w: footW(seats, 'fieldstone'), h: footH(seats, 'fieldstone'), blocking: true, terrains: ['grass', 'dirt', 'stone', 'pebble', 'sand'], spriteId: 'fieldstone', spriteSource: { kind: 'asset', id: 'fieldstone' }, family: 'fieldstone', sprite: { w: 51, h: 47, ...seat(seats, 'fieldstone') } },
  ];
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
    if (!base) throw new Error(`prop variant "${id}" in propSeats.json references unknown base "${s.base}"`);
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

const DOODAD_SOURCE_SPRITE = { w: 96, h: 180, anchorX: 48, anchorY: 69 } as const;

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
    const sourceSprite = sourceArt?.sprite ?? sourceProp?.sprite ?? DOODAD_SOURCE_SPRITE;
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

// `let`, not `const`: applyLiveSeats re-derives this in place when the DB overlay arrives. Consumers
// import the live binding, so a re-render after hydrate picks up the overridden seats. Baseline-only
// at module load, so props render immediately with zero DB.
export let PROP_DEFS: readonly PropDef[] = deriveDefs(SEATS);

// Overlay live DB seats on the committed baseline, per propId ({...baseline, ...overrides} so
// newly-added baseline props still appear even if the DB row predates them), then re-derive
// PROP_DEFS. Called once at boot from net/propSeats before the first board render. Ignores a
// nullish/empty overlay (leaves the baseline in place). Returns whether anything changed.
export function applyLiveSeats(overrides: PropSeatMap | null | undefined): boolean {
  if (!overrides || Object.keys(overrides).length === 0) return false;
  const merged = { ...BASELINE_SEATS, ...overrides };
  // Never throw at this boundary (ADR-0061): the DB can hold a map the client can't derive — e.g. a
  // hand-authored variant whose base is itself another variant, which deriveDefs rejects. On any
  // such failure keep the last-good SEATS/PROP_DEFS (the baseline at boot) rather than half-applying.
  let derived: readonly PropDef[];
  try {
    derived = deriveDefs(merged);
  } catch {
    return false;
  }
  SEATS = merged;
  PROP_DEFS = derived;
  return true;
}

/**
 * Resolve a prop id to its definition, or `undefined` for an unknown id. Callers (the
 * collision bridge, the renderer) SKIP unknown ids rather than falling back to a default —
 * a forward-compat prop saved by a newer client must not silently become an oak.
 */
export function propDef(id: string): PropDef | undefined {
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
