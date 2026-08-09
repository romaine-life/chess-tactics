import { describe, expect, it } from 'vitest';
import {
  predrawnGridFitterArtifactId,
  predrawnGridFitterHref,
} from './predrawnGridFitterRoute';

describe('pre-drawn grid fitter route', () => {
  it('round trips the exact pipeline-source identity without disturbing the editor route', () => {
    const href = predrawnGridFitterHref(
      'http://127.0.0.1:5173/editor/level?document=document-a&layer=level-artwork&levelArtworkEditor=pipeline',
      'raw-version-a',
    );

    expect(href).toBe(
      '/editor/level?document=document-a&layer=level-artwork&levelArtworkEditor=pipeline&predrawnGridFitter=raw-version-a',
    );
    expect(predrawnGridFitterArtifactId(new URL(href, 'http://localhost').search))
      .toBe('raw-version-a');
  });

  it('removes only the nested fitter identity when closing', () => {
    expect(predrawnGridFitterHref(
      'http://localhost/editor/level?document=document-a&predrawnGridFitter=raw-version-a#proof',
      null,
    )).toBe('/editor/level?document=document-a#proof');
    expect(predrawnGridFitterArtifactId('?predrawnGridFitter=%20')).toBeNull();
  });
});
