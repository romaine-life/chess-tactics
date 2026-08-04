import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RunCardBack, RUN_CARD_BACK_REVIEW_SLOT, RUN_CARD_BACK_SLOT } from './RunCardBack';

describe('RunCardBack', () => {
  it('is one universal complete card object with paired review and runtime identities', () => {
    expect(RUN_CARD_BACK_REVIEW_SLOT).toBe('review/run-card-back/standard.png');
    expect(RUN_CARD_BACK_SLOT).toBe('ui/run/card-back/standard.png');
    const html = renderToStaticMarkup(<RunCardBack mediaUrl="/candidate.png" width="360px" />);
    expect(html).toContain('src="/candidate.png"');
    expect(html).toContain('alt="Face-down card"');
    expect(html).toContain('class="run-card-back"');
    expect(html).toContain('inline-size:360px');
  });
});
