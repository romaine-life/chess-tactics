import { describe, expect, it } from 'vitest';
import {
  deepestSharedSceneRegion,
  isEmptySlotDestination,
  isEmptySlotOrigin,
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

  it('authors the installed Play root and Continue routes as complete Continue scenes', () => {
    expect(sceneManifest('/play/select').instances.map((entry) => entry.definition.id)).toEqual([
      'main-menu',
      'play',
      'play/continue',
    ]);
    expect(sceneManifest('/play/select')).toMatchObject({
      host: 'play-shell',
      background: 'homepage',
      paintOwner: 'play-selector',
    });
    expect(sceneManifest('/play/select/continue/run').leaf).toMatchObject({
      definition: { id: 'play/continue', slot: 'play-content', view: 'play-continue' },
    });
    // A malformed selector path canonicalizes through the same complete scene.
    expect(sceneManifest('/play/select/unknown').instances.map((entry) => entry.definition.id)).toEqual([
      'main-menu',
      'play',
      'play/continue',
    ]);
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

  it('authors every Editor collection and campaign as transition-only editor content', () => {
    const campaign = sceneManifest('/editor', '?campaign=crown-of-valoria');
    const wars = sceneManifest('/editor/wars');
    const profiles = sceneManifest('/editor', '?collection=skirmish-profiles');
    const unassigned = sceneManifest('/editor', '?collection=unassigned');

    expect(campaign.instances.map((entry) => entry.definition.id)).toEqual([
      'main-menu',
      'campaign-editor',
      'campaign-editor/campaign',
    ]);
    expect(campaign.leaf).toMatchObject({
      key: 'campaign-editor/campaign:campaignId=crown-of-valoria',
      params: { campaignId: 'crown-of-valoria' },
      definition: { slot: 'editor-content', view: 'editor-campaign' },
    });
    expect(wars.leaf.definition.id).toBe('campaign-editor/wars');
    expect(profiles.leaf.definition.id).toBe('campaign-editor/skirmish-profiles');
    expect(unassigned.leaf.definition.id).toBe('campaign-editor/unassigned');
    expect(wars.waitPresentation).toBe('transition-only');
    expect(deepestSharedSceneRegion(wars, profiles)).toBe('editor-shell');
    expect(deepestSharedSceneRegion(profiles, campaign)).toBe('editor-shell');
    expect(new Set([campaign.id, wars.id, profiles.id, unassigned.id]).size).toBe(4);
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
    const play = sceneManifest('/play');
    const playStrategikon = sceneManifest('/play/strategikon/enchiridion/units');
    const run = sceneManifest('/run');
    const runStrategikon = sceneManifest('/run/strategikon/prosopography');

    expect(play.instances.map((entry) => entry.definition.id)).toEqual(['gameplay']);
    expect(playStrategikon).toMatchObject({
      id: 'gameplay:/play/strategikon/enchiridion/units',
      host: 'gameplay-shell',
      background: 'battlefield',
      paintOwner: 'gameplay-hud',
    });
    expect(playStrategikon.id).not.toBe(play.id);
    expect(run.instances.map((entry) => entry.definition.id)).toEqual(['run']);
    expect(sceneManifest('/run/strategikon/lipsanotheca').instances.map((entry) => entry.definition.id)).toEqual([
      'run',
      'run/strategikon',
    ]);
    expect(runStrategikon.id).not.toBe(run.id);
    expect(deepestSharedSceneRegion(
      run,
      runStrategikon,
    )).toBe('gameplay-shell');
    expect(isEmptySlotOrigin(
      play,
      playStrategikon,
    )).toBe(true);
    expect(isEmptySlotDestination(
      playStrategikon,
      play,
    )).toBe(true);
    expect(isEmptySlotOrigin(
      run,
      runStrategikon,
    )).toBe(true);
    expect(isEmptySlotDestination(
      runStrategikon,
      run,
    )).toBe(true);
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

  it('addresses individual cards inside the one retained card-reference scene', () => {
    const base = sceneManifest('/enchiridion/cards');
    const addressed = sceneManifest('/enchiridion/cards/ppb');
    expect(addressed.id).toBe(base.id);
    expect(addressed.instances.map((entry) => entry.key)).toEqual(base.instances.map((entry) => entry.key));
    expect(addressed.leaf.definition.id).toBe('enchiridion/cards');
    expect(sceneManifest('/enchiridion/units').id).not.toBe(base.id);
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
