import { type ReactElement } from 'react';
import { ChromeDividedGridRow } from './ChromeDividedGrid';
import { NavButton } from './NavButton';
import { CHROME_LEAF_FILL_SURFACE, leafSurfacePhase } from './chromeSurfacePolicy';

/**
 * The verbs that CLOSE a divided box — the level preview's Edit Board / Test Play, the Aftermath's
 * Back / Continue — seated as CELLS of its bottom row rather than as controls parked beneath it.
 *
 * Every surface that grew a pair of these built the same thing twice and got the same thing wrong:
 * two registered buttons in a flex row under the box, so the page showed through between them and
 * each one drew a second frame a few pixels inside the one the box already had. The verbs are
 * DECLARED here instead, because a caller that could pass its own markup could wrap them in a box
 * of its own — which is exactly how they came to sit outside the frame. Given as data, the row
 * seats each one in a compartment the box's own column line divides, and a caller cannot author
 * the space between them.
 */
export type ChromeVerb = {
  /** Stable identity for the cell, so React keeps it across content changes. */
  id: string;
  label: string;
  /** Same-origin app target. Game controls are buttons, never hyperlinks (ADR-0052). */
  to?: string;
  /** What the verb does when it is not a navigation. */
  onPress?: () => void;
  /** Present but unavailable — a locked level's Play. A verb with neither target is inert anyway. */
  disabled?: boolean;
  title?: string;
  testId?: string;
  ariaLabel?: string;
};

/**
 * The box's columns when its closing row is these verbs: ONE compartment each, so the rail between
 * them is the box's own column line and every crossing it makes with a row boundary is a junction
 * the grid places. A single verb declares one column — there is nothing divided there for a rail
 * to be, and the row spans instead.
 */
export function verbColumns(verbs: readonly ChromeVerb[]): readonly string[] {
  return verbs.length > 1 ? verbs.map(() => 'minmax(0, 1fr)') : ['minmax(0, 1fr)'];
}

/**
 * A verb IS its compartment: pressable edge to edge, wearing the leaf oak over the box's marble
 * (ADR-0433), with the box's own frame and rail as its edges. Not a registered unit — that brings
 * its own frame, which would draw a control sitting INSIDE the cell a few pixels in from the rail
 * that already bounds it. Same reset the section box's full-width verbs use.
 */
function VerbCell({ verb, index, className }: {
  verb: ChromeVerb;
  index: number;
  className?: string;
}): ReactElement {
  const seat = {
    className: `section-box-member-verb ${className ?? ''}`.trim(),
    // A row of identical controls is cut from one plank run rather than stamping one grain twice.
    style: leafSurfacePhase(index),
    'data-chrome-fill-surface': CHROME_LEAF_FILL_SURFACE,
    'data-testid': verb.testId,
    'aria-label': verb.ariaLabel,
    title: verb.title,
  };
  if (verb.to !== undefined && !verb.disabled) {
    return <NavButton {...seat} to={verb.to}>{verb.label}</NavButton>;
  }
  const inert = verb.disabled === true || (verb.to === undefined && verb.onPress === undefined);
  return (
    <button {...seat} type="button" disabled={inert} onClick={inert ? undefined : verb.onPress}>
      {verb.label}
    </button>
  );
}

/**
 * The verb row itself. It declares its own `spans`, so a box cannot be handed a divided row of one
 * verb — a rail down a compartment that has no neighbour — and the columns it is seated in come
 * from `verbColumns` above rather than from a count the consumer restates.
 *
 * A box with no verbs must not render this row AT ALL. An element is a row of the grid whether or
 * not it renders anything, so an empty one would put a boundary rail above nothing.
 */
export function ChromeVerbRow({ verbs, className, cellClassName }: {
  verbs: readonly ChromeVerb[];
  className?: string;
  /** The consumer's own sizing for its verbs; the reset and the material stay this row's. */
  cellClassName?: string;
}): ReactElement {
  return (
    <ChromeDividedGridRow className={className} spans={verbs.length > 1 ? undefined : 'all'}>
      {verbs.map((verb, index) => (
        <VerbCell key={verb.id} verb={verb} index={index} className={cellClassName} />
      ))}
    </ChromeDividedGridRow>
  );
}
