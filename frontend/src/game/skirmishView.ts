// Skirmish VIEW state (Zustand) — board-view preferences only, kept OUT of the
// game store (which is the single source of truth for game state, per store.ts).
// Both the board renderer and the HUD subscribe to this: the board reads it to
// render overlays / drive zoom+pan; the HUD's "View" tab is where the controls
// live, so the playfield itself stays free of floating buttons (ADR-0006 lean +
// the tactics-UI convention: tactical info renders on the board, controls dock).

import { create } from 'zustand';

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.45;
const DEFAULT_ZOOM = 0.9;
const DEFAULT_PAN = { x: 0, y: -12 };

type OverlayKey =
  | 'showMoves'
  | 'showEnemyAttacks'
  | 'showBlocked'
  | 'showEnemyMoves'
  | 'showPlayerAttacks'
  | 'showPlayerMoves'
  | 'showPromotionZones'
  | 'showGrid';

export interface SkirmishViewState {
  /** Highlight the focused piece's legal moves. Default on. */
  showMoves: boolean;
  /** Highlight enemy threat squares (danger zone). Default on. */
  showEnemyAttacks: boolean;
  /** Highlight squares the focused piece is blocked from. Opt-in (default off). */
  showBlocked: boolean;
  /** Army-wide display layers driven by the in-match shortcut grid (SkirmishHud
   *  "Controls" tab). Each is the union over one side of that kind of square, and
   *  is independent of which piece is focused. All opt-in (default off) so the
   *  board stays clean until the player calls a layer up. */
  showEnemyMoves: boolean;
  showPlayerAttacks: boolean;
  showPlayerMoves: boolean;
  /** Highlight authored pawn-promotion cells. Opt-in so gameplay stays visually clean. */
  showPromotionZones: boolean;
  /** Draw a deliberate board grid overlay. Default off so terrain can flow naturally. */
  showGrid: boolean;
  zoom: number;
  /** Dynamic floor reported by the live board viewport (higher for full-scene pre-drawn art). */
  minZoom: number;
  /** Ordinary cap, raised only when a pre-drawn scene needs a higher coverage floor. */
  maxZoom: number;
  pan: { x: number; y: number };
  toggle: (key: OverlayKey) => void;
  setZoom: (zoom: number) => void;
  setMinZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  resetView: () => void;
}

export const useSkirmishView = create<SkirmishViewState>((set) => ({
  showMoves: true,
  showEnemyAttacks: true,
  showBlocked: false,
  showEnemyMoves: false,
  showPlayerAttacks: false,
  showPlayerMoves: false,
  showPromotionZones: false,
  showGrid: false,
  zoom: DEFAULT_ZOOM,
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
  pan: DEFAULT_PAN,
  toggle: (key) => set((s) => ({ [key]: !s[key] })),
  setZoom: (zoom) => set((state) => ({
    zoom: Math.min(state.maxZoom, Math.max(state.minZoom, Number(zoom.toFixed(2)))),
  })),
  setMinZoom: (zoom) => set((state) => {
    const minZoom = Math.max(MIN_ZOOM, Number(zoom.toFixed(2)));
    const maxZoom = Math.max(MAX_ZOOM, minZoom);
    return { minZoom, maxZoom, zoom: Math.min(maxZoom, Math.max(state.zoom, minZoom)) };
  }),
  setPan: (pan) => set({ pan }),
  resetView: () => set((state) => ({ zoom: Math.max(DEFAULT_ZOOM, state.minZoom), pan: DEFAULT_PAN })),
}));
