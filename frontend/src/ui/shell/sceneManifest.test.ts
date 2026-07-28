import { describe, expect, it } from 'vitest';
import { sceneManifest } from './sceneManifest';

describe('scene manifests', () => {
  it('treats a destination as a complete visual scene', () => {
    expect(sceneManifest('/play/select/skirmish')).toMatchObject({
      background: 'homepage',
      paintOwner: 'play-selector',
      critical: expect.arrayContaining(['selector-chrome', 'visible-level-thumbnails']),
      opportunistic: ['below-fold-level-thumbnails'],
    });
    expect(sceneManifest('/play')).toMatchObject({
      background: 'battlefield',
      paintOwner: 'gameplay-hud',
      critical: expect.arrayContaining(['board-compositors', 'gameplay-hud', 'title-controls']),
    });
  });

  it('requires declarations for expensive editor and Studio first viewports', () => {
    expect(sceneManifest('/editor/level').critical).toContain('visible-palette-slice');
    expect(sceneManifest('/studio')).toMatchObject({
      paintOwner: 'studio',
      opportunistic: ['below-fold-catalog'],
    });
  });

  it('makes synchronous and unmatched routes explicit rather than optional', () => {
    expect(sceneManifest('/settings/general').critical).toContain('visible-controls');
    expect(sceneManifest('/unknown')).toMatchObject({ id: 'main-menu', paintOwner: 'dom' });
  });
});
