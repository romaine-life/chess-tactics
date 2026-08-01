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

  it('withholds superseded pixels while renamed relic artwork is pending', () => {
    const pending = RUN_RELICS.filter((relic) => relic.replacementArtworkPending);
    const unchanged = RUN_RELICS.filter((relic) => !relic.replacementArtworkPending);
    expect(pending).toHaveLength(8);
    expect(pending.every(({ id }) => installedRunRelicArtwork(id) === null)).toBe(true);
    expect(unchanged.every(({ id }) => installedRunRelicArtwork(id) !== null)).toBe(true);
  });

  it('distinguishes not-yet-generated replacement art from an unknown legacy relic', () => {
    const approved = renderToStaticMarkup(<RunRelicIcon relicId="fair-scales" />);
    const pending = renderToStaticMarkup(<RunRelicIcon relicId="congressional-approval" />);
    const unavailable = renderToStaticMarkup(<RunRelicIcon relicId={'private-quarters' as never} />);
    expect(approved).toContain('<img');
    expect(approved).toContain('data-relic-id="fair-scales"');
    expect(pending).toContain('Art not generated');
    expect(pending).not.toContain('<img');
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
    expect(markup).toContain('The Paid Crossing.');
    expect(markup).toContain('Art not generated');
    expect(markup).toContain('run-relic-inventory-trigger');
    expect(markup).not.toContain('title=');
    expect(markup.match(/<img/g)).toHaveLength(1);
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
    expect(markup).toContain('The Paid Crossing');
    expect(markup).toContain('Art not generated');
    expect(markup).not.toContain('data-chrome-consumer');
  });

  it('keeps the Relics self-inspection destination useful before the first acquisition', () => {
    const markup = renderToStaticMarkup(<RunRelicsWorkspace relicIds={[]} />);
    expect(markup).toContain('No relics held.');
    expect(markup).toContain('role="status"');
  });
});
