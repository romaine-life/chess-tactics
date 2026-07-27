import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DirectionArrowIcon } from './DirectionArrowIcon';

describe('DirectionArrowIcon', () => {
  it('reuses one solid arrow shape and rotates it in screen-space degrees', () => {
    const markup = renderToStaticMarkup(
      <DirectionArrowIcon degrees={90} />,
    );

    expect(markup).toContain('class="direction-arrow-icon"');
    expect(markup).toContain('transform:rotate(90deg)');
    expect(markup).toContain(
      'd="M12 4 L19 13 L14.5 13 L14.5 20 L9.5 20 L9.5 13 L5 13 Z"',
    );
    expect(markup).toContain('aria-hidden="true"');
  });
});
