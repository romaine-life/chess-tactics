// How a baked bridge sprite SEATS on the board — a small runtime transform (scale + screen offset)
// applied to every bridge feature overlay of a given material. The sprites tile by construction
// (render-continuous-then-slice), but the exact width/height on the tile and its vertical seating
// are eye-tuned per the /bridge-tuner Studio lab, committed here, and read back by every board
// renderer. Mirrors propSeats.json: committed baseline = what ships; the lab's Reset derives from it.
//
// Tiling note: the transform is applied IDENTICALLY to every bridge cell about its own tile-equator
// centre, so a uniform translate keeps the run seamless, and a scale >= 1 keeps the deck OVERLAPPING
// across the seam (never a gap). Scaling UP is the "make it wider/bigger" knob; the deck art already
// bleeds to the cell edge, so growth just deepens the overlap.
import COMMITTED from './bridgeTune.json';
import type { CSSProperties } from 'react';
import { TILE_STEP_X } from '../art/projectionContract';

/** Seating transform for one bridge material (all its thru/cap/single sprites share it). */
export interface BridgeTune {
  /** Uniform scale about the tile-equator centre. 1 = the baked sprite; >1 widens (safe: overlaps). */
  scale: number;
  /** Screen-x nudge in px (align the span across its tiles). */
  offsetX: number;
  /** Screen-y nudge in px (seat the deck higher/lower on the water). */
  offsetY: number;
}

export const DEFAULT_BRIDGE_TUNE: BridgeTune = { scale: 1, offsetX: 0, offsetY: 0 };

// The tile-equator centre inside the 96x180 feature frame — the transform origin so scaling grows
// the deck symmetrically about the tile it sits on (see projectionContract: apex y41, equator y68).
const EQUATOR_Y = 68;
export const BRIDGE_TUNE_ORIGIN = `${TILE_STEP_X}px ${EQUATOR_Y}px`;

const TABLE = COMMITTED as Record<string, Partial<BridgeTune>>;

/** The committed (shipped) seating for a bridge material — the baseline the lab resets to. */
export function committedBridgeTune(material: string): BridgeTune {
  return { ...DEFAULT_BRIDGE_TUNE, ...TABLE[material] };
}

/** The CSS a bridge feature overlay `<img>` gets so it seats per its tune. */
export function bridgeTuneStyle(tune: BridgeTune): CSSProperties {
  const t = tune.offsetX || tune.offsetY ? `translate(${tune.offsetX}px, ${tune.offsetY}px) ` : '';
  return { transform: `${t}scale(${tune.scale})`, transformOrigin: BRIDGE_TUNE_ORIGIN };
}
