import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { installedRunRelicArtwork, RunRelicIcon, RunRelicStrip } from './RunRelics';

describe('Run relic artwork', () => {
  it('resolves an installed relic only through its immutable drawable role', () => {
    const artwork = installedRunRelicArtwork('conscription-notice');
    expect(artwork).toEqual(expect.objectContaining({ width: 64, height: 64 }));
    expect(artwork?.src).toMatch(/^\/api\/media\/[0-9a-f]{64}$/);
    expect(artwork?.src).not.toContain('/assets/');
  });

  it('renders the approved offer icon and an honest unavailable state for relics without approved art', () => {
    const approved = renderToStaticMarkup(<RunRelicIcon relicId="royal-decree" />);
    const unavailable = renderToStaticMarkup(<RunRelicIcon relicId="fair-scales" />);
    expect(approved).toContain('<img');
    expect(approved).toContain('data-relic-id="royal-decree"');
    expect(unavailable).toContain('Art unavailable');
    expect(unavailable).not.toContain('<img');
  });

  it('keeps acquired relics in a frameless persistent strip with their full descriptions', () => {
    const markup = renderToStaticMarkup(
      <RunRelicStrip
        relicIds={['conscription-notice', 'mercenary-boat']}
      />,
    );
    expect(markup).toContain('aria-label="Held relics"');
    expect(markup).toContain('data-testid="run-relic-strip"');
    expect(markup).toContain('class="run-relic-strip"');
    expect(markup).not.toContain('data-chrome-unit');
    expect(markup).toContain('Conscription Notice.');
    expect(markup).toContain('Mercenary Boat.');
    expect(markup).toContain('run-relic-inventory-trigger');
    expect(markup).not.toContain('title=');
    expect(markup.match(/<img/g)).toHaveLength(2);
  });
});
