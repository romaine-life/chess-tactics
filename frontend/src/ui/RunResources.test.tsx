import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  RunGoldAmount,
  RunGoldIcon,
  RunGoldTransactionAmount,
  RunGoldTransactionIcon,
} from './RunResources';

describe('Run resource artwork', () => {
  it('renders the installed gold icon through its immutable drawable media', () => {
    const markup = renderToStaticMarkup(<RunGoldIcon />);
    expect(markup).toContain('<img');
    expect(markup).toMatch(/src="\/api\/media\/[0-9a-f]{64}"/);
    expect(markup).not.toContain('/assets/');
  });

  it('keeps the live currency value accessible without rendering the word gold', () => {
    const markup = renderToStaticMarkup(<RunGoldAmount valueTenths={25} />);
    expect(markup).toContain('aria-label="2.5 gold"');
    expect(markup).toContain('>2.5</span>');
    expect(markup).not.toContain('>gold<');
  });

  it('renders the installed loss transaction icon', () => {
    const markup = renderToStaticMarkup(<RunGoldTransactionIcon direction="loss" />);
    expect(markup).toContain('is-loss');
    expect(markup).toMatch(/src="\/api\/media\/[0-9a-f]{64}"/);
    expect(markup).not.toContain('/assets/');
  });

  it('names a loss transaction independently of its artwork', () => {
    const markup = renderToStaticMarkup(
      <RunGoldTransactionAmount direction="loss" valueTenths={25} />,
    );
    expect(markup).toContain('aria-label="2.5 gold lost"');
    expect(markup).toContain('>2.5</span>');
    expect(markup).not.toContain('>gold<');
  });

  it('keeps the loss amount seat mounted while its value is pending', () => {
    const markup = renderToStaticMarkup(
      <RunGoldTransactionAmount
        direction="loss"
        valueTenths={null}
        pendingLabel="Choose a card to see its Expunctio fee"
      />,
    );
    expect(markup).toContain('run-gold-transaction-amount is-loss is-pending');
    expect(markup).toContain('aria-label="Choose a card to see its Expunctio fee"');
    expect(markup).toContain('run-gold-transaction-value');
    expect(markup).toContain('>—</span>');
    expect(markup).not.toContain('<img');
  });
});
