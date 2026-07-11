// Portrait bake-off — the candidate pixel-art treatments of each unit's portrait
// master, shown side by side in the Studio (Viewer › Portrait) so the user can pick
// one. Mirrors the retired board-unit bake-off treatments:
// Review methods are not publication authority. The live HUD resolves the
// canonical unit portrait slot selected by the backend. Assets are produced by
// frontend/scripts/portraits/build-portrait-candidate.py.
import type { Piece, Palette } from './PortraitEditor';
import { portraitPath } from '../core/pieces';

export type PortraitMethod = 'smooth' | 'codex-stone' | 'codex-concept' | 'filter2' | 'filter3' | 'codexfilter';

// The six pieces, for the Portraits catalog's Unit filter (single source of truth).
export const PORTRAIT_PIECES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'] as const satisfies readonly Piece[];

// Review-only method vocabulary. Accepted state lives in backend media versions,
// never in this registry.
export const PORTRAIT_METHODS: { key: PortraitMethod; label: string; sub: string }[] = [
  { key: 'codex-stone', label: 'Codex · stone', sub: 'stone treatment' },
  { key: 'smooth', label: 'Smooth', sub: 'original 3D render' },
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
  // codex-stone has team-palette review candidates; other treatments are navy-only.
  if (method === 'codex-stone') return `/assets/portrait-candidates/codex-stone/${piece}/${palette}.png`;
  return `/assets/portrait-candidates/${method}/${piece}/navy-blue.png`;
}

/** Stable runtime slot. The backend's active version is the sole art choice. */
export function runtimePortraitMasterSrc(piece: Piece, palette: Palette): string {
  return portraitPath(piece, palette);
}
