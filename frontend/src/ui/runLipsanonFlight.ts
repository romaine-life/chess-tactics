/**
 * Where a lipsanon the player has just taken comes to rest.
 *
 * The held-lipsanon strip is the destination, but the slot the lipsanon lands in does not exist
 * until the take is committed — and the take is what ends this screen, so it cannot be
 * committed before the flight without swapping the workspace out from under it. The
 * landing place is therefore MEASURED rather than committed to: a hidden probe built from
 * the strip's own classes is laid out where the real strip lives, and the slot after the
 * last held lipsanon is read off it.
 *
 * Reading the position out of a probe rather than recomputing it in JS keeps one owner for
 * the strip's geometry: style.css positions the strip, and this only asks the browser where
 * that ended up. A Run holding no lipsana yet has no strip in the DOM at all, and the probe
 * answers for that case with exactly the same code.
 */

const STRIP_CLASS = 'run-lipsanon-strip';
const LIST_CLASS = 'run-lipsanon-inventory-list';
const ITEM_CLASS = 'run-lipsanon-inventory-item';

export interface LipsanonLandingPoint {
  left: number;
  top: number;
}

/**
 * The viewport position of the strip slot the next lipsanon will occupy.
 *
 * `heldCount` is the number of lipsana already VISIBLE in the strip — retired ids the strip
 * drops must not be counted, or the lipsanon flies one slot too far right.
 */
export function lipsanonStripLandingPoint(heldCount: number): LipsanonLandingPoint | null {
  if (typeof document === 'undefined') return null;
  const screen = document.querySelector('.run-screen');
  if (!screen) return null;

  const probe = document.createElement('section');
  probe.className = STRIP_CLASS;
  probe.setAttribute('aria-hidden', 'true');
  // Laid out (so it can be measured) but never painted: the probe exists for one
  // synchronous measurement inside a single frame and is removed before the next paint.
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';

  const list = document.createElement('div');
  list.className = LIST_CLASS;
  for (let index = 0; index <= Math.max(0, heldCount); index += 1) {
    const item = document.createElement('span');
    item.className = ITEM_CLASS;
    list.append(item);
  }
  probe.append(list);
  screen.append(probe);

  const slot = list.lastElementChild as HTMLElement | null;
  const slotRect = slot?.getBoundingClientRect() ?? null;
  const listRect = list.getBoundingClientRect();
  probe.remove();
  if (!slotRect) return null;

  // A full strip scrolls rather than growing, so the measured slot can sit past the
  // visible end of the list. Land on the last visible slot instead of off-screen.
  const overflow = Math.max(0, slotRect.right - listRect.right);
  return { left: slotRect.left - overflow, top: slotRect.top };
}
