/**
 * The zoom ladder: every zoom the camera can ever hold.
 *
 * The camera used to derive its floor from geometry — the smallest float at which
 * the board art still covered the viewport — and then clamp the default up to meet
 * it. Nobody chose the resulting number, it differed per level AND per window size,
 * and it read as a cramped camera that says "no you can't" (a level opening at
 * 121% is that rule, not a decision).
 *
 * Instead there is one global ladder. A level's reachable range is a CONTIGUOUS
 * SLICE of it: in to the closest tier worth having, out to the first tier that
 * contains the whole level box. Window size decides which tiers a level can reach;
 * it never invents a zoom that is not on the ladder.
 *
 * That last property is the one the art depends on. Because the ladder is finite
 * and global, the set of sizes a unit is ever drawn at is finite and known, so unit
 * art can be authored for real sizes instead of resampled toward a guess. The art
 * does NOT need one size per tier — a rung per octave is enough, because within an
 * octave the gap is at most 2:1 and a single filtered sample is still honest there.
 * Past 2:1 it is not, which is what the 512px unit renders looked like.
 */

/**
 * Steps are multiplicative. An additive 0.05 is an enormous jump when zoomed out
 * and imperceptible when zoomed in; a constant RATIO is the same apparent
 * increment everywhere, which is what a wheel notch should feel like.
 */
export const ZOOM_TIER_RATIO = 1.05;

/**
 * How many board cells the closest tier shows across the viewport's narrow axis.
 * Two is the point past which zooming in stops telling you anything — you have
 * lost the neighbouring squares that make a position readable.
 */
export const CLOSEST_TIER_CELLS = 2;

/**
 * The furthest out any level may go, as a hard backstop rather than a target. The
 * per-level outer limit is normally the tier containing that level's box; this only
 * catches a pathologically large board on a tiny window.
 */
export const WIDEST_TIER = 0.05;

/** Tier index 0 is 1.0, so an unfitted board still opens somewhere sensible. */
export function zoomForTier(index: number): number {
  return ZOOM_TIER_RATIO ** index;
}

export function tierForZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 0;
  return Math.round(Math.log(zoom) / Math.log(ZOOM_TIER_RATIO));
}

/** The nearest zoom on the ladder. Every zoom the camera holds passes through here. */
export function snapToTier(zoom: number): number {
  return zoomForTier(tierForZoom(zoom));
}

/**
 * One wheel notch. `direction` is +1 to zoom in, -1 to zoom out; the result is
 * clamped to the level's slice so a notch at either end is a no-op rather than a
 * silently ignored input.
 */
export function stepTier(zoom: number, direction: number, range: ZoomTierRange): number {
  const step = direction > 0 ? 1 : -1;
  return clampToRange(zoomForTier(tierForZoom(zoom) + step), range);
}

export interface ZoomTierRange {
  /** Closest tier, as a zoom. */
  readonly inner: number;
  /** Furthest-out tier, as a zoom — the first that contains the whole level box. */
  readonly outer: number;
}

export function clampToRange(zoom: number, range: ZoomTierRange): number {
  return Math.min(range.inner, Math.max(range.outer, snapToTier(zoom)));
}

/**
 * The slice of the ladder a level offers.
 *
 * `outer` is the first tier at which the entire level box fits inside the viewport,
 * so zooming out always ends with the whole level visible and never further — the
 * old floor asked the opposite question ("is the viewport still COVERED by art"),
 * which is why it clamped inward and produced a cramped range on exactly the levels
 * whose art stopped at the board edge.
 *
 * `inner` is the tier showing `CLOSEST_TIER_CELLS` across the narrow axis. A level
 * smaller than that gets a degenerate slice, so the inner tier is never allowed
 * past the outer one.
 */
export function zoomTierRange({
  viewport,
  levelBox,
  cell,
}: {
  viewport: { width: number; height: number };
  levelBox: { width: number; height: number };
  cell: { width: number; height: number };
}): ZoomTierRange {
  const safe = (value: number) => (Number.isFinite(value) && value > 0 ? value : 1);
  const viewW = safe(viewport.width);
  const viewH = safe(viewport.height);

  // Largest tier that still fits the whole box on BOTH axes, rounded DOWN a tier so
  // rounding never crops the level the tier is supposed to contain.
  const containRatio = Math.min(viewW / safe(levelBox.width), viewH / safe(levelBox.height));
  const outer = Math.max(WIDEST_TIER, zoomForTier(Math.floor(
    Math.log(containRatio) / Math.log(ZOOM_TIER_RATIO),
  )));

  const closeRatio = Math.min(viewW / (safe(cell.width) * CLOSEST_TIER_CELLS),
    viewH / (safe(cell.height) * CLOSEST_TIER_CELLS));
  const inner = Math.max(outer, zoomForTier(Math.floor(
    Math.log(closeRatio) / Math.log(ZOOM_TIER_RATIO),
  )));

  return { inner, outer };
}

/**
 * Where a level opens. The whole level visible is the honest default for a tactics
 * board — you are choosing a move against the whole position — and it is a tier, so
 * it is a zoom the ladder actually holds rather than a number derived per window.
 */
export function openingTier(range: ZoomTierRange): number {
  return range.outer;
}
