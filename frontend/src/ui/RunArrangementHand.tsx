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
 * One card at full size with arrows either side keeps the card legible; the whole dealt hand,
 * reserves included, is read in the Chartulary.
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
      <div className="run-arrangement-hand-strip">
        <ChromeButton
          unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'run-arrangement-step')}
          disabled={admitted.length < 2}
          onClick={() => onStep(-1)}
          aria-label="Previous formation"
        >
          ‹
        </ChromeButton>
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
        <ChromeButton
          unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'run-arrangement-step')}
          disabled={admitted.length < 2}
          onClick={() => onStep(1)}
          aria-label="Next formation"
        >
          ›
        </ChromeButton>
      </div>
      <p className="skirmish-grid-hint" data-testid="arrangement-hand-position">
        {admitted.length ? `${Math.max(index, 0) + 1} / ${admitted.length}` : '0 / 0'}
        {admitted.length > 1 ? ' — W and S step through them.' : ''}
        {reserves
          ? ` ${reserves} held back: the hand exceeded this Battle's capacity. Read them in the Chartulary.`
          : ''}
      </p>
    </section>
  );
}
