import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RunCardPile } from './RunCardPile';

describe('RunCardPile', () => {
  it('registers the face over one shared face-down card', () => {
    const html = renderToStaticMarkup(
      <RunCardPile backMediaUrl="/card-back.png">
        <button type="button">Offer face</button>
      </RunCardPile>,
    );
    expect(html).toContain('class="run-card-pile is-covered"');
    expect(html).toContain('data-run-card-pile="covered"');
    expect(html).toContain('class="run-card-pile-back" aria-hidden="true"');
    expect(html).toContain('class="run-card-back"');
    expect(html).toContain('Offer face');
  });

  it('keeps the face-down card in the same pile when the face is absent', () => {
    const html = renderToStaticMarkup(<RunCardPile backMediaUrl="/card-back.png" />);
    expect(html).toContain('class="run-card-pile is-revealed"');
    expect(html).toContain('data-run-card-pile="revealed"');
    expect(html).toContain('class="run-card-pile-back" aria-hidden="true"');
    expect(html).not.toContain('<button');
  });
});
