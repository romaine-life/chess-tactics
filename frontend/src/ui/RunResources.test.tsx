import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RunGoldAmount, RunGoldIcon } from './RunResources';

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
});
