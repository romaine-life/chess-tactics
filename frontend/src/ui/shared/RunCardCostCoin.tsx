import { resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import type { ReactElement } from 'react';

export const RUN_CARD_COST_COIN_SLOT = 'ui/run/card-prototypes/cost-coin-v1.png';

/**
 * The exact transparent extraction of the Run card's blank gold coin. The
 * visible label is only the live value; accessibility retains the currency name.
 */
export function RunCardCostCoin({
  value,
  className = '',
  sourceUrl = resolvedLiveMediaUrl(RUN_CARD_COST_COIN_SLOT),
}: {
  value: number;
  className?: string;
  sourceUrl?: string;
}): ReactElement {
  return (
    <span className={`run-card-cost-coin ${className}`.trim()} aria-label={`${value} gold`}>
      <img
        className="run-card-cost-coin-art"
        src={sourceUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <span className="run-card-cost-coin-value" aria-hidden="true">{value}</span>
    </span>
  );
}
