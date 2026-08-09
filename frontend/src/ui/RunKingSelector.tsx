import type { CSSProperties, ReactElement } from 'react';
import {
  RUN_STARTER_CARDS,
  RUN_STARTER_CARD_BY_ID,
  formatGold,
  type RunStarterCardId,
} from '../run/model';
import { RunCard } from './RunCard';
import { ChromeButton } from './shared/ChromeButton';
import { CHROME_LEAF_FILL_SURFACE } from './shared/chromeSurfacePolicy';
import { chromeUnitClassNames } from './chromeUnitRegistry';

/**
 * Choosing the King a Run opens on.
 *
 * One card at a time, at full panel width, for the reason RunArrangementHand already records: a
 * formation card is READ BY ITS SHAPE, and laying fifteen out at once would shrink the only
 * information on them to a thumbnail. Where the crown stands inside its own formation is the whole
 * substance of the choice here, so it is the one thing that must not be made small.
 *
 * The gold sits ABOVE the card rather than on its face. The card face suppresses its cost corner
 * for starter cards, which leaves that corner free, but the corner means PRICE everywhere else in
 * the game and a number you RECEIVE would invert that grammar. It is also not a property of the
 * card: it is paid once, here, for taking a thin King, and never applies again.
 */
export function RunKingSelector({
  kingId,
  onSelect,
  disabled = false,
}: {
  kingId: RunStarterCardId;
  onSelect: (kingId: RunStarterCardId) => void;
  disabled?: boolean;
}): ReactElement {
  const position = Math.max(0, RUN_STARTER_CARDS.findIndex((king) => king.id === kingId));
  const king = RUN_STARTER_CARD_BY_ID[kingId] ?? RUN_STARTER_CARDS[0];
  const step = (delta: 1 | -1): void => {
    const next = (position + delta + RUN_STARTER_CARDS.length) % RUN_STARTER_CARDS.length;
    onSelect(RUN_STARTER_CARDS[next].id);
  };

  return (
    <section className="run-king-selector" aria-label="Choose your King">
      <p
        className="run-king-selector-bonus"
        data-testid="king-gold-bonus"
        data-empty={king.goldBonusTenths > 0 ? 'false' : 'true'}
      >
        {king.goldBonusTenths > 0
          ? `Opens with ${formatGold(king.goldBonusTenths)} more gold`
          : 'Opens with no extra gold'}
      </p>
      <div className="run-king-selector-card" data-testid="king-selector-card">
        <RunCard card={king} identityCard={king} mode="reference" />
      </div>
      <div className="skirmish-view-group run-deployment-control">
        <div className="run-arrangement-steppers" role="group" aria-label="Choose a King">
          <ChromeButton
            unit="inner-text-button"
            data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
            className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'run-arrangement-step')}
            style={{ ['--run-leaf-control-index' as string]: 0 } as CSSProperties}
            disabled={disabled}
            onClick={() => step(-1)}
            aria-label="Previous King"
          >
            <kbd className="skirmish-grid-cap">W</kbd>
            <span className="skirmish-grid-label">Back</span>
          </ChromeButton>
          <span className="run-arrangement-hand-marks" data-testid="king-selector-position">
            {RUN_STARTER_CARDS.map((candidate, index) => (
              <button
                type="button"
                className="run-arrangement-hand-mark"
                data-current={candidate.id === king.id ? 'true' : 'false'}
                aria-current={candidate.id === king.id ? 'true' : undefined}
                aria-label={`${candidate.name}, King ${index + 1} of ${RUN_STARTER_CARDS.length}`}
                disabled={disabled}
                key={candidate.id}
                onClick={() => onSelect(candidate.id)}
              >
                <span aria-hidden="true">{candidate.id === king.id ? '●' : '○'}</span>
              </button>
            ))}
          </span>
          <ChromeButton
            unit="inner-text-button"
            data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
            className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'run-arrangement-step')}
            style={{ ['--run-leaf-control-index' as string]: 1 } as CSSProperties}
            disabled={disabled}
            onClick={() => step(1)}
            aria-label="Next King"
          >
            <kbd className="skirmish-grid-cap">S</kbd>
            <span className="skirmish-grid-label">Next</span>
          </ChromeButton>
        </div>
      </div>
    </section>
  );
}
