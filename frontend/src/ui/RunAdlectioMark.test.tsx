import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RunAdlectioMarkIcon } from './RunAdlectioMark';

describe('Adlectio mark', () => {
  it('draws nothing while its art decision is open', () => {
    // A reserved empty box would shove the coin beside it sideways for a mark that says nothing
    // yet, so this seat is absent rather than empty until a candidate is installed.
    expect(renderToStaticMarkup(<RunAdlectioMarkIcon />)).toBe('');
  });

  it('paints exact candidate bytes in the real seat', () => {
    const markup = renderToStaticMarkup(<RunAdlectioMarkIcon src="/api/admin/media/candidate" />);
    expect(markup).toContain('run-adlectio-mark-icon');
    expect(markup).toContain('src="/api/admin/media/candidate"');
    expect(markup).toContain('aria-hidden="true"');
  });
});
