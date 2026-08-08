import { resolvedLiveMediaUrl, type RunCardTier } from '@chess-tactics/board-render';
import type { ReactElement } from 'react';
import { runCardCostCrownUrl } from './runCardCostCrown';

export const RUN_CARD_COST_COIN_SLOT = 'ui/run/card-prototypes/cost-coin-v1.png';

/**
 * The exact transparent extraction of the Run card's blank gold coin. The
 * visible label is only the live value; accessibility retains the currency name.
 *
 * A starter tier strikes the crown instead of a numeral. That is the card face's own rule --
 * His Grace draws the same coin with the same mark on it (see runCardFaceContent's showsCost)
 * -- so a gallery band of starter cards is marked the same way rather than by a second kind of
 * ornament. Until that mark is installed the coin prints blank, exactly as it used to.
 */
export function RunCardCostCoin({
  value,
  className = '',
  sourceUrl = resolvedLiveMediaUrl(RUN_CARD_COST_COIN_SLOT),
  crownUrl = runCardCostCrownUrl(),
}: {
  value: RunCardTier;
  className?: string;
  sourceUrl?: string;
  /** The mark struck where the numeral would go. Null prints the coin bare. */
  crownUrl?: string | null;
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
      {!struck && crownUrl ? (
        <img
          className="run-card-cost-coin-crown"
          src={crownUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      ) : null}
    </span>
  );
}
