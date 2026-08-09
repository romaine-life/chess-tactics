import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RunCardBack, RUN_CARD_BACK_REVIEW_SLOT, RUN_CARD_BACK_SLOT } from './RunCardBack';
import { RUN_CARD_STANDARD_FRAME_GEOMETRY, runCardPrintBoxVariables } from './runCardFrameGeometry';

describe('RunCardBack', () => {
  it('is one universal complete card object with paired review and runtime identities', () => {
    expect(RUN_CARD_BACK_REVIEW_SLOT).toBe('review/run-card-back/standard.png');
    expect(RUN_CARD_BACK_SLOT).toBe('ui/run/card-back/standard.png');
    const html = renderToStaticMarkup(<RunCardBack mediaUrl="/candidate.png" width="360px" />);
    expect(html).toContain('src="/candidate.png"');
    expect(html).toContain('aria-label="Face-down card"');
    expect(html).toContain('class="run-card-back"');
    expect(html).toContain('inline-size:360px');
  });

  // The bug this locks: the back rasters are painted corner to corner and every frame is die-cut
  // to a smaller box inside the same canvas, so a back given the whole card box printed a visibly
  // larger card than the face beside it. The box a host sizes is still the whole card; the RASTER
  // is what sits in the frames' opening.
  it('prints its raster in the same die-cut box every card face occupies', () => {
    const html = renderToStaticMarkup(<RunCardBack mediaUrl="/candidate.png" />);
    const print = runCardPrintBoxVariables();
    expect(html).toContain('class="run-card-back-print"');
    for (const [name, value] of Object.entries(print)) expect(html).toContain(`${name}:${value}`);
    // Stated against the frames' own measured paint bounds, so re-cutting a frame moves both.
    expect(RUN_CARD_STANDARD_FRAME_GEOMETRY.paintBounds).toEqual({ x: 26, y: 42, width: 1009, height: 1402 });
    expect(print['--run-card-print-inline-size']).toBe('95.1887%');
    expect(print['--run-card-print-block-size']).toBe('94.4744%');
  });
});
