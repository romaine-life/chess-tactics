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

  it('strikes the starter coin blank, drawing the same coin with no numeral', () => {
    const struck = renderToStaticMarkup(<RunCardCostCoin value={2} sourceUrl="/coin.png" />);
    const blank = renderToStaticMarkup(<RunCardCostCoin value="starter" sourceUrl="/coin.png" crownUrl={null} />);
    // Same coin art, so the band is marked by the ornament every other band uses.
    expect(blank).toContain('src="/coin.png"');
    expect(blank).toContain('class="run-card-cost-coin-art"');
    // No numeral, and in particular not the 2 gold His Grace is nominally worth.
    expect(blank).not.toContain('run-card-cost-coin-value');
    expect(struck).toContain('>2</span>');
    expect(blank).not.toContain('>2</span>');
    expect(blank).toContain('aria-label="Starter"');
  });

  it('strikes a priceless coin with its mark, in the numeral seat and never beside a price', () => {
    const marked = renderToStaticMarkup(
      <RunCardCostCoin value="starter" sourceUrl="/coin.png" crownUrl="/crown.png" />,
    );
    expect(marked).toContain('class="run-card-cost-coin-crown"');
    expect(marked).toContain('src="/crown.png"');
    // The mark is decoration over a named coin, so it adds no second accessible name.
    expect(marked).toContain('aria-label="Starter"');
    expect(marked).not.toContain('run-card-cost-coin-value');

    // A priced coin never takes the mark, whatever it is handed.
    const priced = renderToStaticMarkup(<RunCardCostCoin value={9} sourceUrl="/coin.png" crownUrl="/crown.png" />);
    expect(priced).not.toContain('run-card-cost-coin-crown');
    expect(priced).toContain('>9</span>');
  });

  it('prints the coin bare while no mark is installed, rather than failing the band', () => {
    const uninstalled = renderToStaticMarkup(
      <RunCardCostCoin value="starter" sourceUrl="/coin.png" crownUrl={null} />,
    );
    expect(uninstalled).toContain('class="run-card-cost-coin-art"');
    expect(uninstalled).not.toContain('run-card-cost-coin-crown');
  });
});
