import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RUN_RELICS } from '../run/model';
import {
  installedRunRelicArtwork,
  RunRelicIcon,
  RunRelicStrip,
  RunRelicsWorkspace,
} from './RunRelics';

describe('Run relic artwork', () => {
  it('resolves an installed relic only through its immutable drawable role', () => {
    const artwork = installedRunRelicArtwork('conscription-notice');
    expect(artwork).toEqual(expect.objectContaining({ width: 64, height: 64 }));
    expect(artwork?.src).toMatch(/^\/api\/media\/[0-9a-f]{64}$/);
    expect(artwork?.src).not.toContain('/assets/');
  });

  it('has one installed native icon for every canonical Run relic', () => {
    expect(RUN_RELICS.map(({ id }) => installedRunRelicArtwork(id))).toHaveLength(20);
    expect(RUN_RELICS.every(({ id }) => installedRunRelicArtwork(id) !== null)).toBe(true);
  });

  it('renders a newly approved offer icon and an honest unavailable state for an unknown legacy relic', () => {
    const approved = renderToStaticMarkup(<RunRelicIcon relicId="fair-scales" />);
    const unavailable = renderToStaticMarkup(<RunRelicIcon relicId={'private-quarters' as never} />);
    expect(approved).toContain('<img');
    expect(approved).toContain('data-relic-id="fair-scales"');
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

  it('ignores a retired relic id in a legacy Run instead of crashing the screen', () => {
    const markup = renderToStaticMarkup(
      <RunRelicStrip
        relicIds={['private-quarters' as never, 'conscription-notice']}
      />,
    );
    expect(markup).toContain('Conscription Notice.');
    expect(markup).not.toContain('private-quarters');
  });

  it('renders held relics as a readable fill-only self-inspection workspace', () => {
    const markup = renderToStaticMarkup(
      <RunRelicsWorkspace relicIds={['conscription-notice', 'mercenary-boat']} />,
    );
    expect(markup).toContain('data-testid="run-relics-workspace"');
    expect(markup).toContain('class="run-workspace run-self-inspection-workspace run-relics-workspace"');
    expect(markup).toContain('class="shell-workspace run-shell-workspace"');
    expect(markup).toContain('Conscription Notice');
    expect(markup).toContain('Mercenary Boat');
    expect(markup).not.toContain('data-chrome-consumer');
  });

  it('keeps the Relics self-inspection destination useful before the first acquisition', () => {
    const markup = renderToStaticMarkup(<RunRelicsWorkspace relicIds={[]} />);
    expect(markup).toContain('No relics held.');
    expect(markup).toContain('role="status"');
  });
});
