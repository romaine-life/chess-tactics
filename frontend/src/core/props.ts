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

export type PropKind = 'tree' | 'house';

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
type PropSeatEntry = { anchorX: number; anchorY: number; scale: number; base?: string; label?: string };
const SEATS = propSeats as Record<string, PropSeatEntry>;

function seat(id: string): { anchorX: number; anchorY: number; scale: number } {
  const s = SEATS[id];
  if (!s) throw new Error(`propSeats.json has no seat for prop "${id}"`);
  return { anchorX: s.anchorX, anchorY: s.anchorY, scale: s.scale };
}

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
// propSeats.json (eye-tuned in /prop-lab). Each base is its own sprite asset + catalog family.
const BASE_PROP_DEFS: readonly PropDef[] = [
  {
    id: 'oak',
    label: 'Oak tree',
    kind: 'tree',
    w: 2,
    h: 2,
    blocking: true,
    terrains: ['grass', 'dirt'],
    spriteId: 'oak',
    family: 'oak',
    sprite: { w: 192, h: 300, ...seat('oak') },
  },
  {
    id: 'cottage',
    label: 'Cottage',
    kind: 'house',
    w: 2,
    h: 2,
    blocking: true,
    terrains: ['grass', 'dirt', 'stone'],
    spriteId: 'cottage',
    family: 'cottage',
    sprite: { w: 177, h: 184, ...seat('cottage') },
  },
  // Houses — the stylized keeper set. `cottage` above is the low-poly mesh render; these two are
  // gated Codex img2img RESTYLES of real Blender captures (photoreal meshes read "too realistic"
  // raw, so the cabin/green-roof shapes are kept but re-skinned to pixel-art). Method-verified via
  // imageGenVerdict (rollout image_generation_call), NOT code-drawn.
  { id: 'cabin', label: 'Log cabin', kind: 'house', w: 2, h: 2, blocking: true, terrains: ['grass', 'dirt', 'stone'], spriteId: 'cabin', family: 'cabin', sprite: { w: 220, h: 176, ...seat('cabin') } },
  { id: 'lodge', label: 'Green-roof house', kind: 'house', w: 2, h: 2, blocking: true, terrains: ['grass', 'dirt', 'stone'], spriteId: 'lodge', family: 'lodge', sprite: { w: 210, h: 177, ...seat('lodge') } },
];

// Size variants: any propSeats.json entry with a `base` synthesizes a prop that SHARES the base's
// PNG + gameplay footprint, differing only by its own seat (scale + anchor). It inherits the
// base's spriteId (so it loads the base's asset) and family (so the catalog groups them).
function variantDefs(bases: readonly PropDef[]): PropDef[] {
  const byId = new Map(bases.map((d) => [d.id, d]));
  const out: PropDef[] = [];
  for (const [id, s] of Object.entries(SEATS)) {
    if (!s.base) continue;
    const base = byId.get(s.base);
    if (!base) throw new Error(`prop variant "${id}" in propSeats.json references unknown base "${s.base}"`);
    out.push({
      ...base, // inherit kind/w/h/blocking/terrains/spriteId/family from the base
      id,
      label: s.label ?? `${base.label} (${id})`,
      sprite: { w: base.sprite.w, h: base.sprite.h, anchorX: s.anchorX, anchorY: s.anchorY, scale: s.scale },
    });
  }
  return out;
}

export const PROP_DEFS: readonly PropDef[] = [...BASE_PROP_DEFS, ...variantDefs(BASE_PROP_DEFS)];

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
