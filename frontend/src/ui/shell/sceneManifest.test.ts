import { describe, expect, it } from 'vitest';
import {
  deepestSharedSceneRegion,
  isEmptySlotDestination,
  sceneManifest,
} from './sceneManifest';

describe('scene manifests', () => {
  it('resolves route intent into an authored nested scene path', () => {
    const campaign = sceneManifest('/play/select/campaign/crown-of-valoria');
    expect(campaign.instances.map((entry) => entry.definition.id)).toEqual([
      'main-menu',
      'play',
      'play/campaign',
    ]);
    expect(campaign.leaf).toMatchObject({
      key: 'play/campaign:campaignId=crown-of-valoria',
      params: { campaignId: 'crown-of-valoria' },
      definition: { slot: 'play-content', view: 'play-campaign' },
    });
  });

  it('derives retained regions from authored ancestry', () => {
    expect(deepestSharedSceneRegion(
      sceneManifest('/play/select/skirmish'),
      sceneManifest('/play/select/levels'),
    )).toBe('play-shell');
    expect(deepestSharedSceneRegion(
      sceneManifest('/play/select/skirmish'),
      sceneManifest('/settings/general'),
    )).toBe('menu-shell');
    expect(deepestSharedSceneRegion(
      sceneManifest('/play/select/skirmish'),
      sceneManifest('/play'),
    )).toBeNull();
    expect(deepestSharedSceneRegion(
      sceneManifest('/settings/general'),
      sceneManifest('/settings/audio'),
    )).toBe('settings-shell');
  });

  it('authors every Settings panel and nested tracks view as a settings-content scene', () => {
    expect(sceneManifest('/settings/audio').instances.map((entry) => entry.definition.id)).toEqual([
      'main-menu',
      'settings',
      'settings/audio',
    ]);
    expect(sceneManifest('/settings/audio/tracks').leaf).toMatchObject({
      key: 'settings/audio/tracks',
      definition: { slot: 'settings-content', view: 'settings-tracks' },
    });
    expect(sceneManifest('/settings/audio').waitPresentation).toBe('transition-only');
    expect(sceneManifest('/settings/audio/tracks').waitPresentation).toBe('loading');
  });

  it('recognizes removing a retained host child as an empty-slot destination', () => {
    expect(isEmptySlotDestination(
      sceneManifest('/play/select/levels'),
      sceneManifest('/'),
    )).toBe(true);
    expect(isEmptySlotDestination(
      sceneManifest('/play/select/levels'),
      sceneManifest('/settings/general'),
    )).toBe(false);
    expect(isEmptySlotDestination(
      sceneManifest('/settings/general'),
      sceneManifest('/play/select/levels'),
    )).toBe(false);
  });

  it('treats a destination as a complete visual scene', () => {
    expect(sceneManifest('/play/select/skirmish')).toMatchObject({
      host: 'play-shell',
      background: 'homepage',
      paintOwner: 'play-selector',
      critical: expect.arrayContaining(['selector-chrome', 'visible-level-thumbnails']),
      opportunistic: ['below-fold-level-thumbnails'],
    });
    expect(sceneManifest('/play')).toMatchObject({
      host: 'standalone',
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
    expect(sceneManifest('/unknown')).toMatchObject({ id: 'main-menu', host: 'menu-shell', paintOwner: 'dom' });
  });
});
