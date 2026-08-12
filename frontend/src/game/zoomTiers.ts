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
 * and global, the set of sizes a unit is ever drawn at is finite and known, so art
 * is AUTHORED at those sizes rather than resampled toward a guess.
 *
 * A rung per octave was tried first and is not enough. The units are block-quantised
 * pixel art, so a sprite is only clean when one source pixel lands on one screen
 * pixel; resampling by any ratio that is not an integer smears the block grid the
 * whole look is made of. An authored 26px pawn differs from the 51px sprite scaled
 * to 26 in 53% of its pixels.
 *
 * But authoring EVERY tier is not affordable either, because a sprite's bytes go as
 * the square of its size: the top rungs alone are most of the ladder (a 220px pawn
 * is 23KB against 2.3KB at 56px). So art is authored up to a cap and drawn from one
 * octave down at exactly 2x above it — an integer upscale, so still crisp, just
 * chunkier. What that trades is what a player sees on zooming past the cap: bigger
 * pixels rather than finer detail, which is what pixel art does anyway. It cuts a
 * 1080p battle from ~21MB of authored sizes to ~11MB.
 *
 * Either way a level's asset manifest is a DERIVATION, not a guess: `zoomTierRange`
 * answers it the moment the viewport is measured, before the player can zoom. The
 * scene loads that slice up front and zoom never touches I/O again — no warm set,
 * no neighbour prediction, no eviction policy.
 */

/**
 * Steps are multiplicative. An additive 0.05 is an enormous jump when zoomed out
 * and imperceptible when zoomed in; a constant RATIO is the same apparent
 * increment everywhere, which is what a wheel notch should feel like.
 *
 * The exact value is the fourteenth root of two rather than a round 1.05, so that
 * fourteen steps is EXACTLY a doubling. That is what lets the art stop being
 * authored at the top of the range: past `ART_AUTHORED_TO_TIER` a sprite is drawn
 * from the rung one octave down at 2x, and an exact integer upscale of block art is
 * still crisp. At a round 1.05 an octave comes to 1.98, and that 1% is a resample —
 * a dropped pixel row every hundred, straight through the block grid. The two
 * numbers are indistinguishable on a wheel notch; what they permit is not.
 */
export const ZOOM_TIER_RATIO = Math.pow(2, 1 / 14);

/** Tiers in one doubling. Exact, by construction of the ratio above. */
export const ZOOM_TIERS_PER_OCTAVE = 14;

/**
 * Slack for the rounding that picks a tier index.
 *
 * Now that an octave is an exact doubling, ordinary geometry lands exactly ON tier
 * boundaries — a 500x300 viewport in a 1000x600 box is precisely fourteen tiers out —
 * and `Math.log(0.5) / Math.log(ratio)` comes back as -13.999999999999998 rather than
 * -14. Rounding that up yields the tier INSIDE the one the geometry asked for, and a
 * floor that should have been the containing tier crops the thing it contains. The
 * epsilon is far smaller than any real difference between tiers and far larger than
 * the error in a log division.
 */
const TIER_INDEX_EPSILON = 1e-9;

function tierIndexBelow(ratio: number): number {
  return Math.floor(Math.log(ratio) / Math.log(ZOOM_TIER_RATIO) + TIER_INDEX_EPSILON);
}

function tierIndexAbove(ratio: number): number {
  return Math.ceil(Math.log(ratio) / Math.log(ZOOM_TIER_RATIO) - TIER_INDEX_EPSILON);
}

/**
 * How many board cells the closest tier shows across the viewport's narrow axis.
 * Three keeps a piece and the ring of squares around it in frame, which is the
 * closest view that still says anything about a position.
 *
 * This number also sets what the unit art has to cover, and it is expensive in a
 * way that is easy to miss: a sprite's bytes go as the SQUARE of its drawn size, so
 * the last few rungs are most of the ladder. At two cells a 1920-wide viewport draws
 * a pawn 505px tall and a battle's authored sizes come to ~178MB; at three it is
 * 326px and ~66MB. Moving this closer means authoring — and loading — the rungs
 * above, so it is a decision about cost as much as about framing.
 */
export const CLOSEST_TIER_CELLS = 3;

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
 * The slice of the ladder a level offers, on USEFULNESS alone.
 *
 * `outer` is the first tier at which the entire level box fits inside the viewport, so
 * zooming out ends with the whole level visible and never further. That is the right
 * question for "is there any point going further out", and it is the only question this
 * answers — it says nothing about whether the world it reveals has been painted.
 *
 * Safety is the separate, harder limit: `coverageTier` below. A camera obeys BOTH, and
 * the floor is whichever binds. Collapsing the two into this one is what let a player
 * zoom out into unpainted world, because a box that FITS INSIDE the viewport is by
 * definition surrounded by whatever lies beyond it (ADR-0301).
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
  const outer = Math.max(WIDEST_TIER, zoomForTier(tierIndexBelow(containRatio)));

  const closeRatio = Math.min(viewW / (safe(cell.width) * CLOSEST_TIER_CELLS),
    viewH / (safe(cell.height) * CLOSEST_TIER_CELLS));
  const inner = Math.max(outer, zoomForTier(tierIndexBelow(closeRatio)));

  return { inner, outer };
}

/**
 * The SAFETY floor: the furthest-out tier at which the visible rectangle is still
 * entirely inside `boundary`, so no zoom can reach world the level never promised to
 * paint (ADR-0301).
 *
 * Where `zoomTierRange.outer` asks whether the level fits in the viewport, this asks the
 * opposite — whether the viewport fits in the boundary — and the two are not
 * interchangeable. Rounding goes UP for the same reason contain rounds down: the chosen
 * rung has to land on the safe side of the constraint, and safe here means further IN. A
 * single rung of slack outside the boundary is exposed black at the screen edge.
 *
 * A boundary is only meaningful when coverage is FINITE. A level whose backdrop is locked
 * to the viewport paints wherever the camera goes and has no such limit; it passes no
 * boundary and is governed by usefulness alone.
 */
export function coverageTier({
  viewport,
  boundary,
}: {
  viewport: { width: number; height: number };
  boundary: { width: number; height: number };
}): number {
  const safe = (value: number) => (Number.isFinite(value) && value > 0 ? value : 1);
  const coverRatio = Math.max(
    safe(viewport.width) / safe(boundary.width),
    safe(viewport.height) / safe(boundary.height),
  );
  return Math.max(WIDEST_TIER, zoomForTier(tierIndexAbove(coverRatio)));
}

/**
 * Where a level opens. The whole level visible is the honest default for a tactics
 * board — you are choosing a move against the whole position — and it is a tier, so
 * it is a zoom the ladder actually holds rather than a number derived per window.
 * A level whose coverage cannot reach that far opens at its safety floor instead.
 */
export function openingTier(range: ZoomTierRange): number {
  return range.outer;
}

/**
 * Which authored sprite to draw an asset from, and at what integer magnification.
 *
 * `authored` is the asset's rung list exactly as the catalog states it — the widths it
 * was actually rendered at. Below the top of that list every tier has its own sprite
 * and `magnify` is 1. Above it, the sprite one octave down is drawn at 2x (two octaves
 * at 4x, and so on), which is exact rather than approximate: the ladder's ratio makes
 * fourteen tiers a doubling, and the renderer builds each rung as exactly double the
 * one fourteen below, so the doubling survives integer rounding.
 *
 * TWO RULES BIND THE CALLER, and breaking either puts the smear straight back:
 *
 * 1. Draw at `rung * magnify` — NOT at `targetWidth`. Authored widths are integers and
 *    an octave is built by doubling a rounded one, so a rung sits up to ~1% off the
 *    geometric size the zoom implies (tier 13 of a 51px pawn is an authored 96 against
 *    an ideal 97.06). One percent of a unit's size is invisible; resampling to close
 *    that gap is not, because it lands the source grid between screen pixels.
 * 2. Sample NEAREST. Smoothing an integer upscale loses exactly what it bought.
 */
export function spriteRungForWidth(
  targetWidth: number,
  authored: readonly number[],
): { rung: number; magnify: number } | null {
  if (!authored.length || !Number.isFinite(targetWidth) || targetWidth <= 0) return null;
  const sorted = [...authored].filter((w) => w > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const largest = sorted[sorted.length - 1];
  let want = targetWidth;
  let magnify = 1;
  // Halve until the wanted size sits inside the authored range. The slack keeps a target
  // a hair over the top rung — integer rounding, not a real octave — from jumping one.
  while (want > largest * 1.02 && magnify < 16) {
    want /= 2;
    magnify *= 2;
  }
  let rung = sorted[0];
  for (const candidate of sorted) {
    if (Math.abs(candidate - want) < Math.abs(rung - want)) rung = candidate;
  }
  return { rung, magnify };
}
