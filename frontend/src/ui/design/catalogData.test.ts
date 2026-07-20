import { describe, expect, it } from 'vitest';
import { imageCssValue } from './catalogData';

describe('imageCssValue', () => {
  it('uses the immutable media selected by the drawable projection', () => {
    const immutable = `/api/media/${'a'.repeat(64)}`;
    expect(imageCssValue(immutable)).toBe(`url(${immutable})`);
  });

  it('emits a plain url() for non-optimized paths (other catalog surfaces unchanged)', () => {
    expect(imageCssValue('/assets/ui/level-editor/panel-frame.png')).toBe(
      'url(/assets/ui/level-editor/panel-frame.png)',
    );
  });

  it('strips CSS-injection characters from the url', () => {
    expect(imageCssValue('/assets/ui/x".png)evil')).toBe('url(/assets/ui/x.png)evil)');
  });

  it('returns none for an empty image url', () => {
    expect(imageCssValue('')).toBe('none');
  });

});
