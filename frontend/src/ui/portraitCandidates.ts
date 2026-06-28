// Portrait bake-off — the candidate pixel-art treatments of each unit's portrait
// master, shown side by side in the Studio (Viewer › Portrait) so the user can pick
// one. Mirrors the board-unit bake-off (see PIXEL_LIBRARIES in unitCatalog.ts):
// navy-only, held OUT of the shipped game; the live HUD keeps rendering `smooth`
// until a winner is promoted. Assets are produced by
// frontend/scripts/portraits/build-portrait-candidate.py.
import type { Piece, Palette } from './PortraitEditor';

export type PortraitMethod = 'smooth' | 'codex-stone' | 'codex-concept' | 'filter2' | 'filter3' | 'codexfilter';

export const PORTRAIT_METHODS: { key: PortraitMethod; label: string; sub: string }[] = [
  { key: 'smooth', label: 'Smooth', sub: 'current render' },
  { key: 'codex-stone', label: 'Codex · stone', sub: 'board navy-stone pixel' },
  { key: 'codex-concept', label: 'Codex · concept', sub: 'concept-art bust' },
  { key: 'filter2', label: 'Filter ×2', sub: 'pixelate + quantize' },
  { key: 'filter3', label: 'Filter ×3', sub: 'pixelate + quantize' },
  { key: 'codexfilter', label: 'Codex→Filter', sub: 'restyle then filter' },
];

// The full-body master URL for a method. `smooth` is the existing portrait-editor
// master (all palettes); every candidate method is navy-only, so the palette is
// ignored for them — they always resolve to the navy-blue candidate master, which
// the shared crop frames identically to the smooth master.
export function portraitMasterSrc(piece: Piece, palette: Palette, method: PortraitMethod = 'smooth'): string {
  if (method === 'smooth') return `/assets/portrait-editor/${piece}/${palette}.png`;
  return `/assets/portrait-candidates/${method}/${piece}/navy-blue.png`;
}
