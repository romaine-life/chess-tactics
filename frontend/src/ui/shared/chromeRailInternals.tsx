import type { HTMLAttributes, ReactElement } from 'react';
import type { ChromeRole } from '../chromeCandidateSources';

/**
 * Rail parts only a BOUNDARY OWNER may draw.
 *
 * A rail's ends are junctions with the frame it meets, and only the element that owns that frame
 * knows where those meetings are. So the two pieces that let a rail be drawn with its caps decided
 * elsewhere — a junctionless rail, and a free-standing junction — live here rather than beside the
 * public chrome, and `check-chrome-rails.mjs` fails the build if anything but the divided grid
 * imports this module.
 *
 * This exists because it was possible to hand-place a `ChromeDivider junctions="none"` inside a box
 * and ship a rail that just stopped at both ends with nothing capping it. The public
 * `ChromeDivider` no longer takes `junctions` at all: every divider a call site can write draws its
 * own endpoints. Suppressing them is not a thing an ordinary consumer can say.
 */

export type ChromeJunctionSides = 'nes' | 'nsw' | 'esw' | 'new' | 'nesw';

/** A rail whose ends are capped by its host's topology rather than by itself. */
export function ChromeGridRail({
  role,
  orientation = 'horizontal',
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  role: ChromeRole;
  orientation?: 'horizontal' | 'vertical';
}): ReactElement {
  return (
    <div
      {...props}
      data-chrome-divider-role={role}
      data-chrome-divider-orientation={orientation}
      data-chrome-divider-junctions="none"
      className={`kit-divider chrome-divider ${className}`.trim()}
      aria-hidden="true"
    />
  );
}

/** One cap, seated on a grid line by the topology that owns it. */
export function ChromeJunction({
  role,
  sides,
  className = '',
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  role: ChromeRole;
  sides: ChromeJunctionSides;
}): ReactElement {
  return (
    <span
      {...props}
      data-chrome-junction-role={role}
      data-chrome-junction-sides={sides}
      className={`chrome-junction ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
