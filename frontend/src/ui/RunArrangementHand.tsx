import type { CSSProperties, ReactElement } from 'react';
import { runCardDefinition, type RunDocument } from '../run/model';
import type { RunArrangedCardSummary } from '../run/deployment';
import { RunCard } from './RunCard';
import { ChromeButton } from './shared/ChromeButton';
import { CHROME_LEAF_FILL_SURFACE } from './shared/chromeSurfacePolicy';
import { chromeUnitClassNames } from './chromeUnitRegistry';

function admittedCards(cards: readonly RunArrangedCardSummary[]): RunArrangedCardSummary[] {
  return cards.filter(({ admitted }) => admitted);
}

/**
 * The dealt hand, one card at a time.
 *
 * Laying the whole hand out at once squeezed every card down to a thumbnail, and a formation card
 * is read by its shape — the thing being made too small was the only information on it. The card
 * takes the panel's whole width and its steppers sit UNDER it rather than either side, which is
 * what buys that width.
 *
 * The card is PINNED: it is the subject of the whole panel, so it stays put while the controls
 * beneath it scroll. That is why it is a component of its own rather than the head of the strip.
 */
export function RunArrangementCard({
  cards,
  selectedCardId,
}: {
  run: RunDocument;
  cards: readonly RunArrangedCardSummary[];
  selectedCardId: string | null;
}): ReactElement {
  const admitted = admittedCards(cards);
  const current = admitted.find(({ card }) => card.id === selectedCardId) ?? null;
  const definition = current ? runCardDefinition(current.card.coreId) : null;
  const placed = admitted.filter(({ placed: seated }) => seated).length;
  const complete = admitted.length > 0 && placed === admitted.length;
  return (
    <section className="run-arrangement-hand" aria-label="Dealt formation cards">
      <span className="skirmish-eyebrow">Dealt formations</span>
      <div className="run-arrangement-hand-card" data-testid="arrangement-hand-card">
        {definition && current ? (
          <>
            <RunCard card={definition} identityCard={definition} mode="reference" />
            <span className="run-arrangement-card-state">
              {current.placed ? 'Placed' : 'Place'}
            </span>
          </>
        ) : (
          <p className="skirmish-grid-hint">No formation is available to place this Battle.</p>
        )}
      </div>
      {/* Begin Battle asks only for His Grace, and the hand shows one card at a time, so nothing
          else on screen answers "have I put everyone down?". It is pinned with the card and
          always present — a line that appeared only on completion would re-lay the panel at the
          exact moment the player is reading it. */}
      <p
        className={`run-arrangement-progress${complete ? ' is-complete' : ''}`}
        data-testid="arrangement-progress"
        data-complete={complete ? 'true' : 'false'}
        aria-live="polite"
      >
        <span className="run-arrangement-progress-mark" aria-hidden="true">{complete ? '✓' : '·'}</span>
        {complete
          ? `All ${admitted.length} on the board`
          : `${placed} of ${admitted.length} on the board`}
      </p>
    </section>
  );
}

/**
 * Choosing which dealt formation is in hand.
 *
 * Each stepper wears the key that does the same thing, in the shared shortcut cap the in-match
 * grid uses, so the keyboard is discovered from the control rather than from a hint. The whole
 * dealt hand, reserves included, is read in the Chartulary.
 */
export function RunArrangementSteppers({
  cards,
  selectedCardId,
  onStep,
}: {
  cards: readonly RunArrangedCardSummary[];
  selectedCardId: string | null;
  onStep: (step: 1 | -1) => void;
}): ReactElement {
  const admitted = admittedCards(cards);
  const reserves = cards.length - admitted.length;
  const index = admitted.findIndex(({ card }) => card.id === selectedCardId);
  return (
    <div className="skirmish-view-group run-deployment-control">
      <div className="run-arrangement-steppers" role="group" aria-label="Choose a formation">
        <ChromeButton
          unit="inner-text-button"
          data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
          className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'run-arrangement-step')}
          style={{ ['--run-leaf-control-index' as string]: 0 } as CSSProperties}
          disabled={admitted.length < 2}
          onClick={() => onStep(-1)}
          aria-label="Previous formation"
        >
          <kbd className="skirmish-grid-cap">W</kbd>
          <span className="skirmish-grid-label">Back</span>
        </ChromeButton>
        <span className="run-arrangement-hand-position" data-testid="arrangement-hand-position">
          {admitted.length ? `${Math.max(index, 0) + 1} / ${admitted.length}` : '0 / 0'}
        </span>
        <ChromeButton
          unit="inner-text-button"
          data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
          className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'run-arrangement-step')}
          style={{ ['--run-leaf-control-index' as string]: 1 } as CSSProperties}
          disabled={admitted.length < 2}
          onClick={() => onStep(1)}
          aria-label="Next formation"
        >
          <kbd className="skirmish-grid-cap">S</kbd>
          <span className="skirmish-grid-label">Next</span>
        </ChromeButton>
      </div>
      {reserves ? (
        <p className="skirmish-grid-hint">
          {reserves} held back: the hand exceeded this Battle&rsquo;s capacity. Read them in the
          Chartulary.
        </p>
      ) : null}
    </div>
  );
}
