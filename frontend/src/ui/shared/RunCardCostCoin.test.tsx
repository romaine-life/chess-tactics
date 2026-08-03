import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RUN_CARD_COST_COIN_SLOT, RunCardCostCoin } from './RunCardCostCoin';

describe('Run card cost coin', () => {
  it('uses the accepted shared card coin slot', () => {
    expect(RUN_CARD_COST_COIN_SLOT).toBe('ui/run/card-prototypes/cost-coin-v1.png');
  });

  it('overlays the live value while keeping gold in the accessible name only', () => {
    const markup = renderToStaticMarkup(<RunCardCostCoin value={3} sourceUrl="/coin.png" />);
    expect(markup).toContain('aria-label="3 gold"');
    expect(markup).toContain('src="/coin.png"');
    expect(markup).toContain('>3</span>');
    expect(markup).not.toContain('>gold<');
  });
});
