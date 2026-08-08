import type { ReactElement } from 'react';
import { runCardDefinition, type RunDocument } from '../run/model';
import type { RunArrangedCardSummary } from '../run/deployment';
import { RunCard } from './RunCard';
import { ChromeButton } from './shared/ChromeButton';
import { chromeUnitClassNames } from './chromeUnitRegistry';

/**
 * The dealt hand, one card at a time.
 *
 * Laying the whole hand out at once squeezed every card down to a thumbnail, and a formation
 * card is read by its shape — the thing being made too small was the only information on it.
 * The card takes the panel's whole width and its steppers sit UNDER it rather than either side,
 * which is what buys that width. The whole dealt hand, reserves included, is read in the
 * Chartulary.
 *
 * Each stepper wears the key that does the same thing, in the shared shortcut cap the in-match
 * grid uses, so the keyboard is discovered from the control rather than from a hint.
 */
export function RunArrangementHand({
  cards,
  selectedCardId,
  onStep,
}: {
  run: RunDocument;
  cards: readonly RunArrangedCardSummary[];
  selectedCardId: string | null;
  onStep: (step: 1 | -1) => void;
}): ReactElement {
  const admitted = cards.filter(({ admitted: allowed }) => allowed);
  const reserves = cards.length - admitted.length;
  const index = admitted.findIndex(({ card }) => card.id === selectedCardId);
  const current = index >= 0 ? admitted[index] : null;
  const definition = current ? runCardDefinition(current.card.coreId) : null;
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
      <div className="run-arrangement-steppers" role="group" aria-label="Choose a formation">
        <ChromeButton
          unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'run-arrangement-step')}
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
          className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'run-arrangement-step')}
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
    </section>
  );
}
