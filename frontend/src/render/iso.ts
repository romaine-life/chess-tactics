// Isometric projection math (2:1 diamond) with elevation. Engine-agnostic;
// PixiJS draws using these. Depth sorting uses elevation bands so a unit on a
// raised tile never draws behind a lower one (the canonical iso pitfall).

export interface IsoConfig {
  /** Full diamond width in px. */
  tileW: number;
  /** Full diamond height in px (tileW / 2 for classic 2:1). */
  tileH: number;
  originX: number;
  originY: number;
  /** px a tile lifts per elevation level. */
  elevationStep: number;
}

export const DEFAULT_ISO: IsoConfig = { tileW: 64, tileH: 32, originX: 0, originY: 0, elevationStep: 16 };

/** Tile (grid) coordinate -> screen pixel (tile centre), with elevation lift. */
export function tileToScreen(x: number, y: number, elevation: number, cfg: IsoConfig): { x: number; y: number } {
  return {
    x: cfg.originX + (x - y) * (cfg.tileW / 2),
    y: cfg.originY + (x + y) * (cfg.tileH / 2) - elevation * cfg.elevationStep,
  };
}

/** Screen pixel -> nearest tile on the ground plane (elevation 0), for picking. */
export function screenToTile(sx: number, sy: number, cfg: IsoConfig): { x: number; y: number } {
  const dx = sx - cfg.originX;
  const dy = sy - cfg.originY;
  const hx = cfg.tileW / 2;
  const hy = cfg.tileH / 2;
  return {
    x: Math.round((dx / hx + dy / hy) / 2),
    y: Math.round((dy / hy - dx / hx) / 2),
  };
}

/**
 * Painter's-algorithm sort key: elevation dominates (own band), then row+col.
 * Sort ascending and draw back-to-front.
 */
export function depthKey(x: number, y: number, elevation: number): number {
  return elevation * 100000 + (x + y);
}
