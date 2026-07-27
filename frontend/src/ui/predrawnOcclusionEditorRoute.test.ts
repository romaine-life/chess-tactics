import { describe, expect, it } from 'vitest';
import {
  predrawnOcclusionEditorArtifactId,
  predrawnOcclusionEditorHref,
} from './predrawnOcclusionEditorRoute';

describe('pre-drawn occlusion editor route', () => {
  it('round trips the exact warped-artifact identity without disturbing the editor route', () => {
    const href = predrawnOcclusionEditorHref(
      'http://127.0.0.1:5173/editor/level?document=document-a&layer=level-artwork&levelArtworkEditor=pipeline',
      'warped-version-a',
    );

    expect(href).toBe(
      '/editor/level?document=document-a&layer=level-artwork&levelArtworkEditor=pipeline&predrawnOcclusionEditor=warped-version-a',
    );
    expect(predrawnOcclusionEditorArtifactId(new URL(href, 'http://localhost').search))
      .toBe('warped-version-a');
  });

  it('removes only the nested mask workspace identity when closing', () => {
    expect(predrawnOcclusionEditorHref(
      'http://localhost/editor/level?document=document-a&predrawnOcclusionEditor=warped-version-a#proof',
      null,
    )).toBe('/editor/level?document=document-a#proof');
    expect(predrawnOcclusionEditorArtifactId('?predrawnOcclusionEditor=%20')).toBeNull();
  });
});
