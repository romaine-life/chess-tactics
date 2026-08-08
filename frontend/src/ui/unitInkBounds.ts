import { defaultFacingForSide, paletteForSide, pieceSpritePath } from '../core/pieces';
import { UNIT_SIZE_PIECES } from './unitSizeTuning';

/**
 * Where a unit's PAINTED pixels sit inside the sprite it is drawn from.
 *
 * Every unit sprite is authored on a canvas larger than the figure, with the feet on a shared
 * baseline — a pawn's opaque pixels start 18% down its canvas, a rook's 7.5%. On the battlefield
 * that costs nothing: the anchor puts the feet on the tile and the empty part is simply air above
 * the piece. On a card it costs the composition, because the card CENTRES the drawing, and a
 * drawing measured to the sprite's box is measured partly to air. The lone pawn was landing about
 * 1.5cqw low for exactly that reason.
 *
 * These bounds cannot be committed constants: unit sprites are accepted live media, so a new
 * figure would silently leave the numbers describing the old one. They are measured off the
 * pixels actually being served and published as custom properties, the same channel the scales and
 * anchors already ride (see unitSizeTuning). Until they land — or if the pixels cannot be read —
 * every consumer's fallback is the whole sprite, which is exactly the pre-measurement behaviour.
 */
export type UnitInkBounds = Readonly<{ top: number; bottom: number; left: number; right: number }>;

export const UNIT_INK_WHOLE_SPRITE: UnitInkBounds = Object.freeze({ top: 0, bottom: 1, left: 0, right: 1 });

/** Alpha at or below this is air. Sprites are hard-edged pixel art; this only skips stray fringe. */
const INK_ALPHA_FLOOR = 8;

export function unitInkBoundsFromAlpha(
  alpha: Readonly<{ data: Uint8ClampedArray; width: number; height: number }>,
): UnitInkBounds {
  let left = alpha.width;
  let right = -1;
  let top = alpha.height;
  let bottom = -1;
  for (let y = 0; y < alpha.height; y += 1) {
    for (let x = 0; x < alpha.width; x += 1) {
      if (alpha.data[(y * alpha.width + x) * 4 + 3] <= INK_ALPHA_FLOOR) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  // A sprite with no opaque pixel at all is a broken figure, not a zero-sized one.
  if (right < 0 || bottom < 0) return UNIT_INK_WHOLE_SPRITE;
  return Object.freeze({
    top: top / alpha.height,
    bottom: (bottom + 1) / alpha.height,
    left: left / alpha.width,
    right: (right + 1) / alpha.width,
  });
}

async function measureSprite(src: string): Promise<UnitInkBounds> {
  try {
    const image = new Image();
    // Live media may be served from another origin; without this the canvas taints and the read
    // throws, which is a fallback rather than a failure.
    image.crossOrigin = 'anonymous';
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    if (!canvas.width || !canvas.height) return UNIT_INK_WHOLE_SPRITE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return UNIT_INK_WHOLE_SPRITE;
    context.drawImage(image, 0, 0);
    return unitInkBoundsFromAlpha(context.getImageData(0, 0, canvas.width, canvas.height));
  } catch {
    return UNIT_INK_WHOLE_SPRITE;
  }
}

export function unitInkBoundsStyle(piece: string, bounds: UnitInkBounds): Readonly<Record<string, string>> {
  return {
    [`--unit-ink-top-${piece}`]: bounds.top.toFixed(4),
    [`--unit-ink-bottom-${piece}`]: bounds.bottom.toFixed(4),
    [`--unit-ink-left-${piece}`]: bounds.left.toFixed(4),
    [`--unit-ink-right-${piece}`]: bounds.right.toFixed(4),
  };
}

/**
 * Measure the player's own figures and publish them. The card draws the player set at one facing,
 * so that is what is measured; nothing else reads these yet, and measuring every palette and
 * heading would be six times the work for pixels no surface centres on.
 */
export async function publishUnitInkBounds(): Promise<void> {
  if (typeof document === 'undefined') return;
  const palette = paletteForSide('player');
  const facing = defaultFacingForSide('player');
  await Promise.all(UNIT_SIZE_PIECES.map(async (piece) => {
    const bounds = await measureSprite(pieceSpritePath(piece, palette, facing));
    for (const [property, value] of Object.entries(unitInkBoundsStyle(piece, bounds))) {
      document.documentElement.style.setProperty(property, value);
    }
  }));
}
