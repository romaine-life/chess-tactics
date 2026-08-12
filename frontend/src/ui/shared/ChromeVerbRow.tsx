import { type ReactElement, type ReactNode } from 'react';
import { ChromeDividedGridRow } from './ChromeDividedGrid';
import { NavButton } from './NavButton';
import { installedUiMediaIfPresent } from '../installedUiMedia';
import { CHROME_LEAF_FILL_SURFACE, leafSurfacePhase } from './chromeSurfacePolicy';

/**
 * The mark a COMMITTING verb wears, resolved HERE rather than passed in.
 *
 * "Confirm" is one fact across the whole app — this is the press the screen exists for — so it is
 * one drawing (ADR-0059). A caller that could hand its own mark could put a different glyph on the
 * same act on the next screen, which is exactly the drift the rail tab's `iconSrc` doc describes.
 *
 * Reserved rather than fail-closed (ADR-0318): the seat holds its geometry before the art decision
 * is installed, so the band is the same size with or without it.
 */
const CONFIRM_MARK_ROLE = 'ui-kit-icons-confirm-png';

/** Read during render, never at import: the drawable catalog is installed before the component
 *  tree is imported, but a module-level read would bind whatever was there at module evaluation. */
function confirmMarkUrl(): string | null {
  return installedUiMediaIfPresent(CONFIRM_MARK_ROLE);
}

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
  /**
   * The verb the screen EXISTS for — Play on a Run you are resuming, Start Run on one you are
   * about to begin. It wears the confirm mark and the main menu's own lettering, because it is
   * the same act as pressing PLAY on the menu two screens back and a player should not have to
   * find it in 16px type at the bottom of a card.
   *
   * At most one verb in a row is the commitment; the others are the answers beside it (Keep Run).
   * The whole row takes the taller band either way, so arming a question cannot make it jump.
   */
  confirm?: boolean;
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
function VerbCell({ verb, index, className, confirmMarkSrc }: {
  verb: ChromeVerb;
  index: number;
  className?: string;
  confirmMarkSrc?: string;
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
  // A committing verb is a mark and a word, seated like the main menu's own buttons. The mark is
  // aria-hidden: "confirm" is what the label already says, and a reader that announced it twice
  // would say the glyph's name in front of the verb.
  const mark = verb.confirm ? confirmMarkSrc ?? confirmMarkUrl() : null;
  const body: ReactNode = verb.confirm ? (
    <span className="chrome-verb-commit">
      <span className="chrome-verb-mark" aria-hidden="true">
        {mark ? <img src={mark} alt="" draggable={false} /> : null}
      </span>
      <span className="chrome-verb-label">{verb.label}</span>
    </span>
  ) : verb.label;
  if (verb.to !== undefined && !verb.disabled) {
    return <NavButton {...seat} to={verb.to}>{body}</NavButton>;
  }
  const inert = verb.disabled === true || (verb.to === undefined && verb.onPress === undefined);
  return (
    <button {...seat} type="button" disabled={inert} onClick={inert ? undefined : verb.onPress}>
      {body}
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
export function ChromeVerbRow({ verbs, className, cellClassName, confirmMarkSrc }: {
  verbs: readonly ChromeVerb[];
  className?: string;
  /** The consumer's own sizing for its verbs; the reset and the material stay this row's. */
  cellClassName?: string;
  /**
   * Review-only: exact candidate bytes to paint in the confirm seat, the same seam
   * `BattleLogMarks.forgedSrc` opens. The Studio's Confirm Mark surface judges a candidate in the
   * REAL band, and it must do that without installing it first. A play route never passes this
   * and resolves the installed role only — review state has no business on a player route
   * (ADR-0058).
   */
  confirmMarkSrc?: string;
}): ReactElement {
  // The BAND is the row's, derived from whether a commitment is in it — not a second thing the
  // caller states. Declared per cell, a row could be handed one verb at the menu's scale and its
  // neighbour at the card's, and arming a question would change the row's height under the cursor.
  const commits = verbs.some((verb) => verb.confirm);
  return (
    <ChromeDividedGridRow
      className={`${commits ? 'chrome-verb-row--confirm' : ''} ${className ?? ''}`.trim() || undefined}
      spans={verbs.length > 1 ? undefined : 'all'}
    >
      {verbs.map((verb, index) => (
        <VerbCell
          key={verb.id}
          verb={verb}
          index={index}
          className={cellClassName}
          confirmMarkSrc={confirmMarkSrc}
        />
      ))}
    </ChromeDividedGridRow>
  );
}
