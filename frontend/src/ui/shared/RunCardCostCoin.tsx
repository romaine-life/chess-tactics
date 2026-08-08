import { resolvedLiveMediaUrl, type RunCardTier } from '@chess-tactics/board-render';
import type { ReactElement } from 'react';

export const RUN_CARD_COST_COIN_SLOT = 'ui/run/card-prototypes/cost-coin-v1.png';

/**
 * The exact transparent extraction of the Run card's blank gold coin. The
 * visible label is only the live value; accessibility retains the currency name.
 *
 * A starter tier strikes the coin blank. That is the card face's own rule -- His Grace draws
 * the same coin with no numeral on it (see runCardFaceContent's showsCost) -- so a gallery band
 * of starter cards is marked the same way rather than by a second kind of ornament.
 */
export function RunCardCostCoin({
  value,
  className = '',
  sourceUrl = resolvedLiveMediaUrl(RUN_CARD_COST_COIN_SLOT),
}: {
  value: RunCardTier;
  className?: string;
  sourceUrl?: string;
}): ReactElement {
  const struck = value !== 'starter';
  return (
    <span
      className={`run-card-cost-coin ${className}`.trim()}
      aria-label={struck ? `${value} gold` : 'Starter'}
    >
      <img
        className="run-card-cost-coin-art"
        src={sourceUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      {struck ? <span className="run-card-cost-coin-value" aria-hidden="true">{value}</span> : null}
    </span>
  );
}
