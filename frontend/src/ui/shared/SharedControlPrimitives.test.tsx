import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionList } from './ActionList';
import { AssetSwatchList } from './AssetSwatchList';
import { ChromeButton } from './ChromeButton';
import { ChoiceGroup } from './ChoiceGroup';
import { StudioCatalogCard } from '../studio/StudioCatalogCard';

describe('shared control primitives', () => {
  it('owns registered chrome and selected semantics for buttons', () => {
    const markup = renderToStaticMarkup(<ChromeButton unit="inner-text-button" selected className="local-layout">Go</ChromeButton>);
    expect(markup).toContain('data-chrome-unit="inner-text-button"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('active is-active is-selected');
    expect(markup).toContain('local-layout');
  });

  it('renders a choice group entirely from definitions', () => {
    const markup = renderToStaticMarkup(
      <ChoiceGroup value="b" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} onChange={() => {}} ariaLabel="Letters" />,
    );
    expect(markup.match(/<button/g)).toHaveLength(2);
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-pressed="true"');
  });

  it('does not encode first/middle/last position into action-row construction', () => {
    const items = ['first', 'middle', 'last'].map((id) => ({ id, title: id, description: <p>same shape</p> }));
    const markup = renderToStaticMarkup(<ActionList items={items} />);
    expect(markup.match(/action-list-row/g)).toHaveLength(3);
    expect(markup).not.toContain('first-child');
    expect(markup).not.toContain('last-child');
  });

  it('renders swatches and Studio cards through their canonical DOM', () => {
    const swatches = renderToStaticMarkup(
      <AssetSwatchList items={[{ id: 'stone', label: 'Stone', content: <span>stone</span>, selected: true, onSelect: () => {} }]} />,
    );
    expect(swatches).toContain('data-chrome-unit="inner-asset-swatch"');
    expect(swatches).toContain('aria-pressed="true"');

    const card = renderToStaticMarkup(<StudioCatalogCard title="Stone" badge="terrain" selected onSelect={() => {}} image="/stone.png" />);
    expect(card).toContain('tileset-studio-card is-selected');
    expect(card).toContain('tileset-studio-card-image');
    expect(card).toContain('tileset-studio-card-meta');
  });
});
