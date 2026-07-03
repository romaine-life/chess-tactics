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
type PropSeat = { anchorX: number; anchorY: number; scale: number };

function seat(id: string): PropSeat {
  const s = (propSeats as Record<string, PropSeat>)[id];
  if (!s) throw new Error(`propSeats.json has no seat for prop "${id}"`);
  return s;
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
}

/** One placed prop: (x,y) is the ANCHOR = the min-(x,y) cell of its footprint. */
export interface PlacedProp {
  x: number;
  y: number;
  propId: string;
}

// The seed catalogue. All ship at a 2×2 gameplay footprint; each frame's w/h are facts of
// the shipped PNGs (assets/props/<id>/{back,front}.png) while the contact anchor + scale
// come from propSeats.json (eye-tuned in /prop-lab).
export const PROP_DEFS: readonly PropDef[] = [
  {
    id: 'oak',
    label: 'Oak tree',
    kind: 'tree',
    w: 2,
    h: 2,
    blocking: true,
    terrains: ['grass', 'dirt'],
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
    sprite: { w: 177, h: 184, ...seat('cottage') },
  },
  // Houses — the stylized keeper set. `cottage` above is the low-poly mesh render; these two are
  // gated Codex img2img RESTYLES of real Blender captures (photoreal meshes read "too realistic"
  // raw, so the cabin/green-roof shapes are kept but re-skinned to pixel-art). Method-verified via
  // imageGenVerdict (rollout image_generation_call), NOT code-drawn.
  { id: 'cabin', label: 'Log cabin', kind: 'house', w: 2, h: 2, blocking: true, terrains: ['grass', 'dirt', 'stone'], sprite: { w: 220, h: 176, ...seat('cabin') } },
  { id: 'lodge', label: 'Green-roof house', kind: 'house', w: 2, h: 2, blocking: true, terrains: ['grass', 'dirt', 'stone'], sprite: { w: 210, h: 177, ...seat('lodge') } },
];

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
