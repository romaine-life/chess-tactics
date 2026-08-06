import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RUN_LIPSANA } from '../run/model';
import {
  installedLipsanonArtwork,
  LipsanonIcon,
  LipsanonStrip,
  LipsanaWorkspace,
} from './Lipsana';

describe('Run lipsanon artwork', () => {
  it('resolves an installed lipsanon only through its immutable drawable role', () => {
    const artwork = installedLipsanonArtwork('fair-scales');
    expect(artwork).toEqual(expect.objectContaining({ width: 64, height: 64 }));
    expect(artwork?.src).toMatch(/^\/api\/media\/[0-9a-f]{64}$/);
    expect(artwork?.src).not.toContain('/assets/');
  });

  it('resolves installed artwork for the complete lipsanon registry', () => {
    expect(RUN_LIPSANA).toHaveLength(9);
    expect(RUN_LIPSANA.every(({ id }) => installedLipsanonArtwork(id) !== null)).toBe(true);
  });

  it('renders the installed replacement art while an unknown legacy lipsanon remains unavailable', () => {
    const approved = renderToStaticMarkup(<LipsanonIcon lipsanonId="fair-scales" />);
    const replacement = renderToStaticMarkup(<LipsanonIcon lipsanonId="congressional-approval" />);
    const unavailable = renderToStaticMarkup(<LipsanonIcon lipsanonId={'private-quarters' as never} />);
    expect(approved).toContain('<img');
    expect(approved).toContain('data-lipsanon-id="fair-scales"');
    expect(replacement).toContain('<img');
    expect(replacement).toContain('data-lipsanon-id="congressional-approval"');
    expect(unavailable).toContain('Art unavailable');
    expect(unavailable).not.toContain('<img');
  });

  it('keeps acquired lipsana in a frameless persistent strip with their full descriptions', () => {
    const markup = renderToStaticMarkup(
      <LipsanonStrip
        lipsanonIds={['fair-scales', 'mercenary-boat']}
      />,
    );
    expect(markup).toContain('aria-label="Held lipsana"');
    expect(markup).toContain('data-testid="run-lipsanon-strip"');
    expect(markup).toContain('class="run-lipsanon-strip"');
    expect(markup).not.toContain('data-chrome-unit');
    expect(markup).toContain('Fair Scales.');
    expect(markup).toContain('The Paid Crossing.');
    expect(markup).not.toContain('Art unavailable');
    expect(markup).toContain('run-lipsanon-inventory-trigger');
    expect(markup).not.toContain('title=');
    expect(markup.match(/<img/g)).toHaveLength(2);
  });

  it('ignores a retired lipsanon id in a legacy Run instead of crashing the screen', () => {
    const markup = renderToStaticMarkup(
      <LipsanonStrip
        lipsanonIds={['private-quarters' as never, 'fair-scales']}
      />,
    );
    expect(markup).toContain('Fair Scales.');
    expect(markup).not.toContain('private-quarters');
  });

  it('renders held lipsana as a readable fill-only self-inspection workspace', () => {
    const markup = renderToStaticMarkup(
      <LipsanaWorkspace lipsanonIds={['fair-scales', 'mercenary-boat']} />,
    );
    expect(markup).toContain('data-testid="run-lipsana-workspace"');
    expect(markup).toContain('class="run-workspace run-self-inspection-workspace run-lipsana-workspace"');
    expect(markup).toContain('class="shell-workspace run-shell-workspace"');
    expect(markup).toContain('Fair Scales');
    expect(markup).toContain('The Paid Crossing');
    expect(markup).not.toContain('Art unavailable');
    expect(markup).not.toContain('data-chrome-consumer');
  });

  it('keeps the Lipsana self-inspection destination useful before the first acquisition', () => {
    const markup = renderToStaticMarkup(<LipsanaWorkspace lipsanonIds={[]} />);
    expect(markup).toContain('No lipsana held.');
    expect(markup).toContain('role="status"');
  });
});
