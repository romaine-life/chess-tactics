import { type ReactElement } from 'react';
import { chromeUnitClassNames } from '../chromeUnitRegistry';
import { ChromeButton } from './ChromeButton';
import { CHROME_LEAF_FILL_SURFACE, leafSurfacePhase } from './chromeSurfacePolicy';
import {
  ReviewFirstGlyph,
  ReviewLastGlyph,
  ReviewNextGlyph,
  ReviewPrevGlyph,
} from './actionGlyphs';
import { useSkirmish } from '../../game/SkirmishStoreContext';
import { moveNumberFor } from '../../game/moveReview';

// The analysis controls — the transport for reading a game back one half-move at a time, the
// same first / back / forward / live row chess.com and lichess put under a move list.
//
// ONE component, rendered in two places: on the battlefield while a review is open (so the
// board itself is the surface you steer from, without opening a panel) and permanently under
// the Event Log (so the controls are findable in the first place, and the score sheet you are
// stepping through is right there). Two rows that could drift is exactly the failure this
// avoids — the arrow keys, the panel and the plate all drive the same two store actions.

/** The name of the position the review is sitting on, for the readout. */
function reviewedMoveLabel(
  notation: string | null,
  ply: number,
): string {
  if (ply === 0) return 'Opening position';
  return notation ? `${moveNumberFor(ply - 1)} ${notation}` : `Half-move ${ply}`;
}

export function MoveReviewControls({
  variant,
}: {
  /** `panel` is the row under the Event Log; `board` is the plate over the battlefield. */
  variant: 'panel' | 'board';
}): ReactElement | null {
  const positions = useSkirmish((s) => s.positions);
  const reviewIndex = useSkirmish((s) => s.reviewIndex);
  const log = useSkirmish((s) => s.log);
  const reviewPosition = useSkirmish((s) => s.reviewPosition);
  const stepReview = useSkirmish((s) => s.stepReview);

  // Nothing to walk: a match with a single recorded board (a fresh game, or one resumed from a
  // save written before review existed) has no earlier position to offer. The panel row still
  // renders, disabled, so the controls stay where the player learned they are; the board plate
  // shows only while a review is actually open and so is simply absent.
  const reviewing = reviewIndex !== null;
  if (variant === 'board' && !reviewing) return null;

  const last = positions.length - 1;
  const current = reviewIndex ?? last;
  const entry = positions[current];
  const atStart = current <= 0;
  const notation = entry
    ? log.find((row) => row.ply === entry.ply - 1)?.text ?? null
    : null;
  const label = reviewing && entry
    ? reviewedMoveLabel(notation, entry.ply)
    : 'Live';

  const key = (
    name: string,
    glyph: ReactElement,
    onClick: () => void,
    disabled: boolean,
    phase: number,
  ): ReactElement => (
    <ChromeButton
      unit="inner-text-button"
      className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'move-review-key')}
      // A transport key ENDS the interaction tree, so it takes the leaf oak, phased by its
      // place in the row so four identical keys are cut from one plank run (ADR-0433).
      data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
      style={leafSurfacePhase(phase)}
      aria-label={name}
      title={name}
      disabled={disabled}
      onClick={onClick}
    >
      {glyph}
    </ChromeButton>
  );

  return (
    <div
      className={`move-review-controls is-${variant}${reviewing ? ' is-reviewing' : ''}`}
      role="group"
      aria-label="Move review"
      data-testid="move-review-controls"
    >
      <div className="move-review-keys">
        {key('Opening position', <ReviewFirstGlyph className="move-review-glyph" />, () => reviewPosition(0), atStart, 0)}
        {key('Back a move', <ReviewPrevGlyph className="move-review-glyph" />, () => stepReview(-1), atStart, 1)}
        {key('Forward a move', <ReviewNextGlyph className="move-review-glyph" />, () => stepReview(1), !reviewing, 2)}
        {key('Back to the live board', <ReviewLastGlyph className="move-review-glyph" />, () => reviewPosition(null), !reviewing, 3)}
      </div>
      <output className="move-review-readout" data-testid="move-review-readout">{label}</output>
      {reviewing ? (
        <ChromeButton
          unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active', 'move-review-live')}
          data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
          style={leafSurfacePhase(4)}
          onClick={() => reviewPosition(null)}
        >
          Live
        </ChromeButton>
      ) : null}
    </div>
  );
}
