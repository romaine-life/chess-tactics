import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { rookDirections } from './unitCatalog';
import { FacingCompass } from './studioBoard';

describe('FacingCompass', () => {
  it('renders a semantically named eight-way artwork control with the current direction pressed', () => {
    const markup = renderToStaticMarkup(
      <FacingCompass
        direction="north-east"
        onSelect={vi.fn()}
        onRotate={vi.fn()}
        available={() => true}
        ariaLabel="Artwork direction (8-way)"
      />,
    );

    expect(markup).toContain('aria-label="Artwork direction (8-way)"');
    expect(markup.match(/aria-label="Face /g)).toHaveLength(rookDirections.length);
    expect(markup).toMatch(/aria-label="Face north-east"[^>]*aria-pressed="true"/);
    expect(markup.match(/aria-pressed="false"/g)).toHaveLength(rookDirections.length - 1);
    expect(markup).not.toContain('disabled=""');
  });

  it('disables directions that the installed artwork does not actually provide', () => {
    const markup = renderToStaticMarkup(
      <FacingCompass
        direction="south"
        onSelect={vi.fn()}
        onRotate={vi.fn()}
        available={(direction) => direction === 'south' || direction === 'east'}
        ariaLabel="Artwork direction (8-way)"
      />,
    );

    expect(markup.match(/disabled=""/g)).toHaveLength(rookDirections.length - 2);
    expect(markup).toMatch(/aria-label="Face east"[^>]*aria-pressed="false"/);
    expect(markup).toMatch(/aria-label="Face south"[^>]*aria-pressed="true"/);
  });
});
