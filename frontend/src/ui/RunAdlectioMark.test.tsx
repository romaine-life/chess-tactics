import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RunAdlectioMarkIcon, RunAdlectioMarkLine } from './RunAdlectioMark';

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

  it('is the words alone when no mark is installed, never a coin standing in', () => {
    // The coin said only that gold was involved, which the fee under this line already says.
    const markup = renderToStaticMarkup(<RunAdlectioMarkLine />);
    expect(markup).toContain('run-expunctio-visit-mark');
    expect(markup).toContain('Adlected this Sectio');
    expect(markup).not.toContain('run-gold-icon');
    expect(markup).not.toContain('run-adlectio-mark-icon');
  });

  it('mounts a candidate in the same line the tile prints, which is what review means', () => {
    const markup = renderToStaticMarkup(<RunAdlectioMarkLine src="/api/admin/media/candidate" />);
    expect(markup).toContain('run-adlectio-mark-icon');
    expect(markup).toContain('src="/api/admin/media/candidate"');
    expect(markup).toContain('Adlected this Sectio');
  });
});
