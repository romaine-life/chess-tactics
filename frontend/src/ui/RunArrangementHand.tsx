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
 *
 * It wears no eyebrow. The card IS the panel's subject and reads as one at a glance, so a label
 * over it only spent the height the card wanted — and that height is the seat the dealt stack
 * lands in, which must be the SAME box or the deal ends somewhere the card does not live.
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
  return (
    <section className="run-arrangement-hand" aria-label="Dealt formation cards">
      <div className="run-arrangement-hand-card" data-testid="arrangement-hand-card">
        {definition && current ? (
          <RunCard card={definition} identityCard={definition} mode="reference" />
        ) : (
          <p className="skirmish-grid-hint">No formation is available to place this Battle.</p>
        )}
      </div>
    </section>
  );
}

/**
 * Choosing which dealt formation is in hand.
 *
 * Each stepper wears the key that does the same thing, in the shared shortcut cap the in-match
 * grid uses, so the keyboard is discovered from the control rather than from a hint. The whole
 * dealt hand, reserves included, is read in the Chartulary.
 *
 * Between them stands the hand itself, one mark per admitted formation in deal order. It replaced
 * a bare `2 / 4`, which said where the player was standing and NOTHING about what they had already
 * done — the card shows one formation at a time, so stepping through a hand gave no way to tell an
 * unplaced formation from one already seated without visiting every card and reading the board.
 * A mark is filled once its formation is on the board, so the whole hand's state is one glance,
 * and each is pressable: seeing the one you want is the same act as going to it.
 */
export function RunArrangementSteppers({
  cards,
  selectedCardId,
  onStep,
  onSelect,
  disabled = false,
}: {
  cards: readonly RunArrangedCardSummary[];
  selectedCardId: string | null;
  onStep: (step: 1 | -1) => void;
  onSelect: (cardId: string) => void;
  /** The hand is dealt but not yet in the player's hands: dressed, and not yet answering. */
  disabled?: boolean;
}): ReactElement {
  const admitted = admittedCards(cards);
  const reserves = cards.length - admitted.length;
  return (
    <div className="skirmish-view-group run-deployment-control">
      <div className="run-arrangement-steppers" role="group" aria-label="Choose a formation">
        <ChromeButton
          unit="inner-text-button"
          data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
          className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'run-arrangement-step')}
          style={{ ['--run-leaf-control-index' as string]: 0 } as CSSProperties}
          disabled={disabled || admitted.length < 2}
          onClick={() => onStep(-1)}
          aria-label="Previous formation"
        >
          <kbd className="skirmish-grid-cap">W</kbd>
          <span className="skirmish-grid-label">Back</span>
        </ChromeButton>
        <span className="run-arrangement-hand-marks" data-testid="arrangement-hand-position">
          {admitted.map(({ card, placed }, position) => {
            const current = card.id === selectedCardId;
            return (
              <button
                type="button"
                className="run-arrangement-hand-mark"
                data-placed={placed ? 'true' : 'false'}
                data-current={current ? 'true' : 'false'}
                aria-current={current ? 'true' : undefined}
                aria-label={`Formation ${position + 1} of ${admitted.length}, ${
                  placed ? 'on the board' : 'not yet placed'
                }`}
                disabled={disabled}
                key={card.id}
                onClick={() => onSelect(card.id)}
              >
                <span aria-hidden="true">{placed ? '●' : '○'}</span>
              </button>
            );
          })}
        </span>
        <ChromeButton
          unit="inner-text-button"
          data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
          className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'run-arrangement-step')}
          style={{ ['--run-leaf-control-index' as string]: 1 } as CSSProperties}
          disabled={disabled || admitted.length < 2}
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
