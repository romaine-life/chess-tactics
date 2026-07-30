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
      host: 'gameplay-shell',
      background: 'battlefield',
      paintOwner: 'gameplay-hud',
      critical: expect.arrayContaining(['board-compositors', 'gameplay-hud', 'title-controls']),
    });
  });

  it('retains Battle and the main-menu Enchiridion while their reference children change', () => {
    expect(sceneManifest('/play/strategikon/enchiridion/units')).toMatchObject({
      host: 'gameplay-shell',
      background: 'battlefield',
      paintOwner: 'gameplay-hud',
    });
    expect(sceneManifest('/run/strategikon/lipsanotheca').instances.map((entry) => entry.definition.id)).toEqual([
      'run',
      'run/strategikon',
    ]);
    expect(deepestSharedSceneRegion(
      sceneManifest('/run'),
      sceneManifest('/run/strategikon/prosopography'),
    )).toBe('gameplay-shell');
    expect(sceneManifest('/enchiridion/abilities').instances.map((entry) => entry.definition.id)).toEqual([
      'main-menu',
      'enchiridion',
      'enchiridion/abilities',
    ]);
    expect(sceneManifest('/enchiridion/abilities')).toMatchObject({
      host: 'enchiridion-shell',
      background: 'homepage',
      paintOwner: 'dom',
    });
    expect(deepestSharedSceneRegion(
      sceneManifest('/enchiridion/units'),
      sceneManifest('/enchiridion/relics'),
    )).toBe('enchiridion-shell');
  });

  it('addresses individual relics inside the one retained relic-reference scene (ADR-0256)', () => {
    const base = sceneManifest('/enchiridion/relics');
    const addressed = sceneManifest('/enchiridion/relics/royal-decree');
    // Same manifest id + instance keys ⇒ relic selection is an address-only update:
    // App's same-scene path applies and no exit/enter choreography runs per relic.
    expect(addressed.id).toBe(base.id);
    expect(addressed.instances.map((entry) => entry.key)).toEqual(base.instances.map((entry) => entry.key));
    expect(addressed.leaf.definition.id).toBe('enchiridion/relics');
    expect(addressed).toMatchObject({
      host: 'enchiridion-shell',
      background: 'homepage',
      paintOwner: 'dom',
    });
    // Section changes remain real scene transitions.
    expect(sceneManifest('/enchiridion/units').id).not.toBe(base.id);
    // The bare and unknown fallbacks share the units scene they already render.
    expect(sceneManifest('/enchiridion').id).toBe(sceneManifest('/enchiridion/units').id);
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
