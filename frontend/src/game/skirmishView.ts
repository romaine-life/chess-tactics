// Skirmish VIEW state — one instance per mounted battlefield presentation. It stays
// separate from the game store because it is visual state, but it follows the same
// provider lifetime: overlapping outgoing/incoming scenes must never share zoom, pan,
// opening framing, or overlays (ADR-0307/ADR-0353).

import { createStore, type StoreApi } from 'zustand/vanilla';
import { PLAYER_MAXIMUM_ZOOM, PLAYER_TECHNICAL_MINIMUM_ZOOM } from './boardCameraPolicy';

const DEFAULT_ZOOM = 0.9;
const DEFAULT_PAN = { x: 0, y: -12 };

export type OverlayKey =
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
  /** Level-specific floor derived from the live viewport and effective camera coverage polygon. */
  minZoom: number;
  /** Human zoom-in cap, raised when camera coverage or opening geometry needs it. */
  maxZoom: number;
  pan: { x: number; y: number };
  openingZoom: number;
  openingPan: { x: number; y: number };
  cameraResetRevision: number;
  toggle: (key: OverlayKey) => void;
  setZoom: (zoom: number) => void;
  setMinZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setOpeningView: (camera: { zoom: number; pan: { x: number; y: number } }) => void;
  /** Hide every board information layer without changing camera position. */
  clearOverlays: () => void;
  resetView: () => void;
}

export type SkirmishViewStore = StoreApi<SkirmishViewState>;

/** Construct the closed view state for one mounted battlefield activity. */
export function createSkirmishViewStore(): SkirmishViewStore {
  return createStore<SkirmishViewState>((set) => ({
    showMoves: true,
    showEnemyAttacks: true,
    showBlocked: false,
    showEnemyMoves: false,
    showPlayerAttacks: false,
    showPlayerMoves: false,
    showPromotionZones: false,
    showGrid: false,
    zoom: DEFAULT_ZOOM,
    minZoom: PLAYER_TECHNICAL_MINIMUM_ZOOM,
    maxZoom: PLAYER_MAXIMUM_ZOOM,
    pan: DEFAULT_PAN,
    openingZoom: DEFAULT_ZOOM,
    openingPan: DEFAULT_PAN,
    cameraResetRevision: 0,
    toggle: (key) => set((s) => ({ [key]: !s[key] })),
    setZoom: (zoom) => set((state) => ({
      // Inputs may arrive on human-friendly increments, but a geometry-derived art floor can sit
      // between them. Preserve that exact clamp so gameplay cannot round back below accepted art.
      zoom: Math.min(state.maxZoom, Math.max(state.minZoom, zoom)),
    })),
    setMinZoom: (zoom) => set((state) => {
      const minZoom = Math.max(PLAYER_TECHNICAL_MINIMUM_ZOOM, zoom);
      const maxZoom = Math.max(PLAYER_MAXIMUM_ZOOM, minZoom, state.openingZoom);
      return { minZoom, maxZoom, zoom: Math.min(maxZoom, Math.max(state.zoom, minZoom)) };
    }),
    setPan: (pan) => set({ pan }),
    setOpeningView: (camera) => set((state) => ({
      openingZoom: camera.zoom,
      openingPan: camera.pan,
      // Opening composition is geometry, not a suggestion subject to the ordinary control cap.
      // Raising the ceiling first lets the framing hook apply the exact camera on large viewports.
      maxZoom: Math.max(PLAYER_MAXIMUM_ZOOM, state.minZoom, camera.zoom, state.zoom),
    })),
    clearOverlays: () => set({
      showMoves: false,
      showEnemyAttacks: false,
      showBlocked: false,
      showEnemyMoves: false,
      showPlayerAttacks: false,
      showPlayerMoves: false,
      showPromotionZones: false,
      showGrid: false,
    }),
    resetView: () => set((state) => ({
      zoom: Math.min(state.maxZoom, Math.max(state.openingZoom, state.minZoom)),
      pan: state.openingPan,
      cameraResetRevision: state.cameraResetRevision + 1,
    })),
  }));
}
