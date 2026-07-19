// Portrait bake-off — the candidate pixel-art treatments of each unit's portrait
// master, shown side by side in the Studio (Viewer › Portrait) so the user can pick
// one. Mirrors the retired board-unit bake-off treatments:
// Review methods are not publication authority. The live HUD resolves the
// canonical unit portrait slot selected by the backend. Assets are produced by
// frontend/scripts/portraits/build-portrait-candidate.py.
import type { Piece, Palette } from './PortraitEditor';
import { portraitPath } from '../core/pieces';
import { drawableAssets } from '@chess-tactics/board-render';

export type PortraitMethod = string;

// The six pieces, for the Portraits catalog's Unit filter (single source of truth).
export const PORTRAIT_PIECES: readonly Piece[] = new Proxy([] as Piece[], {
  get: (_target, property) => {
    const values = [...new Set(drawableAssets('portrait-treatment').map((asset) => asset.behavior.piece as Piece))];
    const value = Reflect.get(values, property);
    return typeof value === 'function' ? value.bind(values) : value;
  },
});

// Review-only method vocabulary. Accepted state lives in backend media versions,
// never in this registry.
export const PORTRAIT_METHODS: { key: PortraitMethod; label: string; sub: string }[] = new Proxy([], {
  get: (_target, property) => {
    const byMethod = new Map<string, { key: string; label: string; sub: string }>();
    for (const asset of drawableAssets('portrait-treatment')) {
      const key = String(asset.behavior.method ?? '');
      if (key && !byMethod.has(key)) byMethod.set(key, {
        key,
        label: typeof asset.metadata.methodLabel === 'string' ? asset.metadata.methodLabel : key,
        sub: typeof asset.metadata.methodDescription === 'string' ? asset.metadata.methodDescription : '',
      });
    }
    const values = [...byMethod.values()];
    const value = Reflect.get(values, property);
    return typeof value === 'function' ? value.bind(values) : value;
  },
});

// The full-body master URL for a method. `smooth` is the existing portrait-editor
// master (all palettes); every candidate method is navy-only, so the palette is
// ignored for them — they always resolve to the navy-blue candidate master, which
// the shared crop frames identically to the smooth master.
export function defaultPortraitMethod(): PortraitMethod {
  const rows = drawableAssets('portrait-treatment');
  const preferred = rows.find((asset) => asset.behavior.default === true) ?? rows[0];
  if (!preferred || typeof preferred.behavior.method !== 'string') throw new Error('drawable catalog has no default portrait treatment');
  return preferred.behavior.method;
}

export function portraitMethodSupportsPalette(piece: Piece, method: PortraitMethod, palette: Palette): boolean {
  return Boolean(drawableAssets('portrait-treatment').find((asset) => (
    asset.behavior.piece === piece && asset.behavior.method === method
  ))?.media[palette]);
}

export function portraitMasterSrc(piece: Piece, palette: Palette, method: PortraitMethod = defaultPortraitMethod()): string {
  const asset = drawableAssets('portrait-treatment').find((candidate) => (
    candidate.behavior.piece === piece && candidate.behavior.method === method
  ));
  if (!asset) throw new Error(`drawable catalog has no ${piece}/${method} portrait treatment`);
  const fallbackRole = typeof asset.behavior.defaultPalette === 'string' ? asset.behavior.defaultPalette : palette;
  const media = asset.media[palette]?.media ?? asset.media[fallbackRole]?.media;
  if (!media) throw new Error(`portrait treatment ${asset.id} has no ${palette} media`);
  return media.immutableUrl;
}

/** Stable runtime slot. The backend's active version is the sole art choice. */
export function runtimePortraitMasterSrc(piece: Piece, palette: Palette): string {
  return portraitPath(piece, palette);
}
