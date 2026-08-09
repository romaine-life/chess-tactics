import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  RunGoldAmount,
  RunGoldIcon,
  RunGoldOfferedIcon,
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

  it('draws nothing in the gold-offered seat while its art decision is open', () => {
    // A reserved empty box would shove the coin beside it sideways for a mark that says nothing
    // yet, so this seat is absent rather than empty until a candidate is installed.
    expect(renderToStaticMarkup(<RunGoldOfferedIcon />)).toBe('');
  });

  it('paints exact gold-offered candidate bytes in the real seat', () => {
    const markup = renderToStaticMarkup(<RunGoldOfferedIcon src="/api/admin/media/candidate" />);
    expect(markup).toContain('run-gold-offered-icon');
    expect(markup).toContain('src="/api/admin/media/candidate"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('keeps the live currency value accessible without rendering the word gold', () => {
    const markup = renderToStaticMarkup(<RunGoldAmount valueTenths={25} />);
    expect(markup).toContain('aria-label="25 gold"');
    expect(markup).toContain('>25</span>');
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
    expect(markup).toContain('aria-label="25 gold lost"');
    expect(markup).toContain('>25</span>');
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
