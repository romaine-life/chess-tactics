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

  it.each(['gain', 'loss'] as const)('renders the installed %s transaction icon', (direction) => {
    const markup = renderToStaticMarkup(<RunGoldTransactionIcon direction={direction} />);
    expect(markup).toContain(`is-${direction}`);
    expect(markup).toMatch(/src="\/api\/media\/[0-9a-f]{64}"/);
    expect(markup).not.toContain('/assets/');
  });

  it.each([
    ['gain', '2.5 gold gained'],
    ['loss', '2.5 gold lost'],
  ] as const)('names a %s transaction independently of its artwork', (direction, accessibleName) => {
    const markup = renderToStaticMarkup(
      <RunGoldTransactionAmount direction={direction} valueTenths={25} />,
    );
    expect(markup).toContain(`aria-label="${accessibleName}"`);
    expect(markup).toContain('>2.5</span>');
    expect(markup).not.toContain('>gold<');
  });

  it('keeps the directional amount seat mounted while no transaction is selected', () => {
    const markup = renderToStaticMarkup(
      <RunGoldTransactionAmount
        direction="gain"
        valueTenths={null}
        pendingLabel="Select a unit to see its Alienatio return"
      />,
    );
    expect(markup).toContain('run-gold-transaction-amount is-gain is-pending');
    expect(markup).toContain('aria-label="Select a unit to see its Alienatio return"');
    expect(markup).toContain('run-gold-transaction-value');
    expect(markup).toContain('>—</span>');
    expect(markup).not.toContain('<img');
  });
});
