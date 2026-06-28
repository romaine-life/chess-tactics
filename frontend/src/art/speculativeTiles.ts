import type { TileFamilyId } from '../core/tileSockets';
import { terrainLabels } from '../core/tileSockets';
import type { TileAsset } from './tileset';

// ─────────────────────────────────────────────────────────────────────────────
// SPECULATIVE / TENTATIVE TILE SET — "pixel-art bake-off" (added 2026-06-27)
//
// One base tile per terrain family was run through several Blender→pixel-art
// conversion methods so the look can be judged in-context (catalog + Lab board)
// before committing to any direction. These are NOT shipped tiles: they are kept
// out of `tileFamilies`, board generation, coverage, and the real skirmish board.
// They only appear in the Studio catalog (flagged "speculative") and can be painted
// onto the Lab board.
//
// TO REMOVE THE WHOLE SET later: delete this file, the wiring lines in
// frontend/src/ui/TilePreview.tsx that import `speculativeTileAssets`, and the
// PNGs under frontend/public/assets/tiles/speculative/.
// ─────────────────────────────────────────────────────────────────────────────

export interface SpeculativeMethod {
  /** Stable key, also the PNG filename suffix and search token. */
  key: string;
  /** Short label shown on the card badge and the Method filter. */
  label: string;
  /** One-line description of how the tile was produced. */
  blurb: string;
}

// Ordered most-faithful-to-source → most-fresh-generation.
export const SPECULATIVE_TILE_METHODS: readonly SpeculativeMethod[] = [
  { key: 'filter3', label: 'Filter ×3', blurb: 'Deterministic downscale ×3 + palette quantize of the Blender tile (chunky).' },
  { key: 'filter2', label: 'Filter ×2', blurb: 'Deterministic downscale ×2 + palette quantize of the Blender tile (finer).' },
  { key: 'codex', label: 'Codex', blurb: 'Codex (gpt-image) img2img redraw of the actual tile; keeps block + angle, corrects material.' },
  { key: 'codexfilter', label: 'Codex → Filter', blurb: 'Codex redraw, then snapped to a true pixel grid by the filter.' },
  { key: 'pixellab', label: 'PixelLab', blurb: 'PixelLab native iso-tile generation from a material prompt. Geometry is approximate (shorter block).' },
];

const SPECULATIVE_FAMILIES: readonly TileFamilyId[] = ['grass', 'dirt', 'stone', 'pebble', 'sand', 'water'];

const REMOVAL_NOTE = 'Speculative pixel-art bake-off candidate — not shipped; remove with the speculative set.';

const speculativeTile = (family: TileFamilyId, method: SpeculativeMethod): TileAsset => ({
  id: `spec-${family}-${method.key}`,
  label: `${terrainLabels[family]} · ${method.label}`,
  src: `/assets/tiles/speculative/${family}-${method.key}.png`,
  role: 'speculative',
  kind: 'tile',
  // Searchable tokens: "bakeoff", "speculative", the method key, and the family.
  source: `bakeoff:${method.key}`,
  method: method.label,
  probability: 0,
  speculative: true,
  notes: `${terrainLabels[family]} terrain, ${method.blurb} ${REMOVAL_NOTE}`,
});

export const speculativeTileAssets: readonly TileAsset[] = SPECULATIVE_FAMILIES.flatMap((family) =>
  SPECULATIVE_TILE_METHODS.map((method) => speculativeTile(family, method)),
);

/** Family lookup for the catalog filter (the assets aren't in `tileFamilies`). */
export const speculativeTileFamilyOf = new Map<string, TileFamilyId>(
  SPECULATIVE_FAMILIES.flatMap((family) =>
    SPECULATIVE_TILE_METHODS.map((method) => [`spec-${family}-${method.key}`, family] as const),
  ),
);
