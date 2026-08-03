import { describe, expect, it } from 'vitest';
import {
  deepestSharedSceneRegion,
  isEmptySlotDestination,
  isEmptySlotOrigin,
  overlapsStateDrivenRunScene,
  sceneLayerKey,
  sceneManifest,
  sceneOverlapScope,
} from './sceneManifest';
import { createRun } from '../../run/model';
import { createBlankLevel } from '../../core/level';

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

  it('identifies every Continue-presenting address as one committed scene', () => {
    // PlayMenu canonicalizes these addresses in place (ADR-0260); one shared id keeps
    // that canonicalization a retarget, never a second exit of the outgoing scene.
    const continueId = sceneManifest('/play/select/continue').id;
    expect(sceneManifest('/play/select').id).toBe(continueId);
    expect(sceneManifest('/play/select/continue/skirmish').id).toBe(continueId);
    expect(sceneManifest('/play/select/unknown').id).toBe(continueId);
    // Distinct selector scenes keep distinct identities so tab travel still transitions.
    expect(sceneManifest('/play/select/skirmish').id).not.toBe(continueId);
    expect(sceneManifest('/play/select/run').id).not.toBe(sceneManifest('/play/select/run/current').id);
    expect(sceneManifest('/play/select/campaign/a').id).not.toBe(sceneManifest('/play/select/campaign/b').id);
  });

  it('identifies the settings root and unknown sections as the General scene', () => {
    const generalId = sceneManifest('/settings/general').id;
    expect(sceneManifest('/settings').id).toBe(generalId);
    expect(sceneManifest('/settings/unknown').id).toBe(generalId);
    expect(sceneManifest('/settings/audio').id).not.toBe(generalId);
    expect(sceneManifest('/party').id).not.toBe(generalId);
  });

  it('gives addresses that author identical scene trees identical identities', () => {
    // Chain-equal ⇒ id-equal. An id may stay COARSER than its instance chain (a Run
    // battle advance re-keys its slots without a scene transition; /play board
    // addresses share one gameplay identity across search strings), but an id FINER
    // than the chain re-runs the full lifecycle for an unchanged committed tree —
    // the double-exit bug class (play hub canonicalization, bare /settings).
    // Add every new route family and its canonicalizing address variants here.
    const run = createRun({
      id: 'war',
      name: 'War',
      description: 'War',
      battles: [{ level: createBlankLevel('battle', 'Battle', 8, 8), loot: false }],
    }, 19, '2026-08-01T00:00:00.000Z');
    const addresses: ReadonlyArray<[string, string?, Parameters<typeof sceneManifest>[2]?]> = [
      ['/'], ['/menu-next'], ['/main-menu'], ['/unknown-route'],
      ['/play'], ['/play', '?campaignId=a&levelId=b'],
      // Every Strategikon address, on BOTH hosts. The old list carried one — and a
      // malformed one at that — so no pair of its sections was ever compared, which
      // is why the family could resolve every section to one identity unnoticed.
      ['/play/strategikon/enchiridion/units'], ['/play/strategikon/enchiridion/terrain'],
      ['/play/strategikon/enchiridion/cards'], ['/play/strategikon/enchiridion/card-types'],
      ['/play/strategikon/enchiridion/relics'], ['/play/strategikon/enchiridion/abilities'],
      ['/play/strategikon/enchiridion/ataraxia'],
      ['/play/strategikon/prosopography'], ['/play/strategikon/lipsanotheca'],
      ['/play/strategikon/unknown'], ['/play/strategikon/enchiridion/unknown'],
      ['/run/strategikon/enchiridion/units', '', { run: { hydrated: true, document: run } }],
      ['/run/strategikon/enchiridion/relics', '', { run: { hydrated: true, document: run } }],
      ['/run/strategikon/prosopography', '', { run: { hydrated: true, document: run } }],
      ['/run/strategikon/lipsanotheca', '', { run: { hydrated: true, document: run } }],
      ['/run'], ['/run', '', { run: { hydrated: false, document: null } }],
      ['/run', '', { run: { hydrated: true, document: null } }],
      ['/run', '', { run: { hydrated: true, document: run } }],
      ['/run', '?view=army', { run: { hydrated: true, document: run } }],
      ['/run', '?view=sell', { run: { hydrated: true, document: run } }],
      ['/play/select'], ['/play/select/continue'], ['/play/select/continue/campaign'],
      ['/play/select/continue/skirmish'], ['/play/select/continue/run'], ['/play/select/continue/levels'],
      ['/play/select/unknown'], ['/play/select/skirmish'], ['/play/select/levels'],
      ['/play/select/run'], ['/play/select/run/current'], ['/play/select/run/new'],
      ['/play/select/campaign/a'], ['/play/select/campaign/b'],
      ['/settings'], ['/settings/general'], ['/settings/unknown'], ['/settings/audio'],
      ['/settings/audio/tracks'], ['/settings/gameplay'], ['/settings/creator-tools'],
      ['/settings/admin'], ['/party'],
      ['/enchiridion'], ['/enchiridion/units'], ['/enchiridion/terrain'], ['/enchiridion/cards'],
      ['/enchiridion/card-types'], ['/enchiridion/relics'], ['/enchiridion/relics/some-relic'],
      ['/enchiridion/abilities'], ['/enchiridion/ataraxia'], ['/enchiridion/unknown'],
      ['/lobbies'], ['/lobbies/room-1'],
      ['/editor'], ['/campaigns'], ['/campaigns-next'], ['/editor/wars'],
      ['/editor', '?campaign=camp-a'], ['/editor', '?campaign=camp-b'],
      ['/editor', '?collection=skirmish-profiles'], ['/editor', '?collection=unassigned'],
      ['/editor/level'], ['/editor/level', '?document=doc-1'], ['/edit'], ['/level-editor'],
      ['/studio'], ['/studio', '?relicReview=1'], ['/studio/drawables'], ['/unit-studio'],
      ['/prop-lab'], ['/surface-lab'],
      ['/predrawn-reference'], ['/portrait-editor'],
    ];
    const scenes = addresses.map(([pathname, search, sources]) => ({
      address: `${pathname}${search ?? ''}`,
      scene: sceneManifest(pathname, search ?? '', sources ?? {}),
    }));
    for (const left of scenes) {
      for (const right of scenes) {
        const chain = left.scene.instances.map((entry) => entry.key).join(' > ');
        if (chain !== right.scene.instances.map((entry) => entry.key).join(' > ')) continue;
        expect({ addresses: [left.address, right.address], chain, id: left.scene.id })
          .toEqual({ addresses: [left.address, right.address], chain, id: right.scene.id });
      }
    }
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

  it('keeps Run choices in a nested detail slot while the action column remains mounted', () => {
    const run = sceneManifest('/play/select/run');
    const current = sceneManifest('/play/select/run/current');
    const next = sceneManifest('/play/select/run/new');

    expect(run.instances.map((entry) => entry.definition.id)).toEqual([
      'main-menu',
      'play',
      'play/run',
    ]);
    expect(current.leaf.definition).toMatchObject({
      id: 'play/run/current',
      slot: 'run-detail-content',
      view: 'play-run-current',
    });
    expect(next.leaf.definition).toMatchObject({
      id: 'play/run/new',
      slot: 'run-detail-content',
      view: 'play-run-new',
    });
    expect(deepestSharedSceneRegion(run, next)).toBe('run-detail');
    expect(deepestSharedSceneRegion(current, next)).toBe('run-detail');
    expect(isEmptySlotOrigin(run, next)).toBe(true);

    // One React mount identity across choice selection: the scene layer key ignores
    // the nested detail leaf, so App re-renders the retained action column instead of
    // remounting PlayMenu (a remount re-veils the painted surface — the row flicker).
    expect(sceneLayerKey(run)).toBe('play/run');
    expect(sceneLayerKey(current)).toBe('play/run');
    expect(sceneLayerKey(next)).toBe('play/run');
    // Everything outside a nested detail slot keeps its leaf identity.
    expect(sceneLayerKey(sceneManifest('/play/select/skirmish'))).toBe('play/skirmish');
    expect(sceneLayerKey(sceneManifest('/play/select/campaign/crown-of-valoria')))
      .toBe('play/campaign:campaignId=crown-of-valoria');
    expect(sceneLayerKey(sceneManifest('/settings/audio'))).toBe('settings/audio');
    expect(sceneLayerKey(sceneManifest('/'))).toBe('main-menu');
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
    expect(run.instances.map((entry) => entry.definition.id)).toEqual(['run', 'run/phase', 'run/workspace']);
    // The Strategikon is an authored shell with its own sections in their own slot,
    // on BOTH hosts. Its sections were previously invisible to the scene graph —
    // collapsed onto one workspace value under /run and keyed on the raw pathname
    // under /play — so its rail navigated without a director transition at all.
    expect(sceneManifest('/run/strategikon/lipsanotheca').instances.map((entry) => entry.definition.id)).toEqual([
      'run',
      'run/phase',
      'run/workspace',
      'strategikon',
      'strategikon/lipsanotheca',
    ]);
    expect(sceneManifest('/run/strategikon/enchiridion/terrain').instances.map((entry) => entry.definition.id)).toEqual([
      'run',
      'run/phase',
      'run/workspace',
      'strategikon',
      'strategikon/enchiridion',
      'strategikon/enchiridion/terrain',
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
    // Opening the Strategikon fills the same empty gameplay slot on the Run host,
    // but App never consults that: the Run workspace value itself changes, so the
    // pair takes the state-driven overlap path and its narrowed viewport scope
    // instead — the Controls plank must not ride a whole-screen crossfade.
    expect(isEmptySlotOrigin(run, runStrategikon)).toBe(true);
    expect(isEmptySlotDestination(runStrategikon, run)).toBe(true);
    expect(overlapsStateDrivenRunScene(run, runStrategikon)).toBe(true);
    expect(sceneOverlapScope(run, runStrategikon)).toBe('shell-viewport');
    // Travel BETWEEN Strategikon sections leaves the Run's own state identity
    // untouched, so it takes the ordinary region-preserving path and fades only the
    // pane its rail replaces.
    const runReference = sceneManifest('/run/strategikon/enchiridion/units');
    const runReferenceOther = sceneManifest('/run/strategikon/enchiridion/relics');
    expect(overlapsStateDrivenRunScene(runStrategikon, runReference)).toBe(false);
    expect(deepestSharedSceneRegion(runStrategikon, runReference)).toBe('strategikon-shell');
    expect(deepestSharedSceneRegion(runReference, runReferenceOther)).toBe('strategikon-reference-shell');
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
    expect(sceneManifest('/enchiridion/card-types').instances.map((entry) => entry.definition.id)).toEqual([
      'main-menu',
      'enchiridion',
      'enchiridion/card-types',
    ]);
    expect(deepestSharedSceneRegion(
      sceneManifest('/enchiridion/units'),
      sceneManifest('/enchiridion/relics'),
    )).toBe('enchiridion-shell');
  });

  it('projects active Run state into authored phase and workspace slots', () => {
    const level = createBlankLevel('run-battle', 'Run Battle', 8, 8);
    const draft = createRun({
      id: 'run-war',
      name: 'Run War',
      description: 'A test War',
      battles: [{ level, loot: false }],
    }, 17, '2026-08-01T00:00:00.000Z');
    const deployment = { ...draft, phase: 'deployment' as const };
    const battle = { ...draft, phase: 'battle' as const };
    const source = (document: typeof draft) => ({ run: { hydrated: true, document } });

    const deploymentScene = sceneManifest('/run', '', source(deployment));
    const battleScene = sceneManifest('/run', '', source(battle));
    const armyScene = sceneManifest('/run', '?view=army', source(battle));

    expect(deploymentScene.snapshot).toMatchObject({
      kind: 'run',
      phase: 'deployment',
      workspace: 'primary',
      run: deployment,
    });
    expect(deploymentScene.instances.map((entry) => entry.definition.slot)).toEqual([
      'root',
      'run-phase',
      'run-workspace',
    ]);
    // Deployment is a state of this Battle's already-mounted battlefield, not a scene
    // before it. Phase promotion must therefore preserve both director and React keys.
    expect(battleScene.id).toBe(deploymentScene.id);
    expect(sceneLayerKey(battleScene)).toBe(sceneLayerKey(deploymentScene));
    expect(armyScene.id).not.toBe(battleScene.id);
    expect(deepestSharedSceneRegion(deploymentScene, battleScene)).toBe('gameplay-shell');
    expect(deepestSharedSceneRegion(battleScene, armyScene)).toBe('gameplay-shell');
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

  it('narrows an overlapping fade to the shell viewport when only the Run workspace changes', () => {
    // Overlapping layers both paint the retained Run shell — the Controls panel and its
    // title plank, the relic rail, the shell fill. Fading the whole boundary blends that
    // retained chrome toward the backdrop at the crossfade midpoint, which is what made
    // the Controls title bar visibly dim on every Shop/Sell Units switch.
    const war = {
      id: 'war',
      name: 'War',
      description: 'War',
      battles: [{ level: createBlankLevel('battle', 'Battle', 8, 8), loot: false }],
    };
    const document = createRun(war, 19, '2026-08-01T00:00:00.000Z');
    const source = { run: { hydrated: true, document } };
    const shop = sceneManifest('/run', '', source);
    const sell = sceneManifest('/run', '?view=sell', source);
    const army = sceneManifest('/run', '?view=army', source);
    const strategikon = sceneManifest('/run/strategikon/prosopography', '', source);

    expect(sceneOverlapScope(shop, sell)).toBe('shell-viewport');
    expect(sceneOverlapScope(sell, shop)).toBe('shell-viewport');
    expect(sceneOverlapScope(shop, army)).toBe('shell-viewport');
    expect(sceneOverlapScope(shop, strategikon)).toBe('shell-viewport');
    expect(sceneOverlapScope(strategikon, shop)).toBe('shell-viewport');

    // A phase change replaces the Controls contents too, so it keeps the whole-scene
    // crossfade, and so does any pair that is not one authored slot apart.
    const battle = sceneManifest('/run', '', {
      run: { hydrated: true, document: { ...document, phase: 'battle' } },
    });
    expect(sceneOverlapScope(shop, battle)).toBe('scene');
    expect(sceneOverlapScope(shop, sceneManifest('/run', '', { run: { hydrated: false, document: null } })))
      .toBe('scene');
    expect(sceneOverlapScope(shop, sceneManifest('/play/select/run'))).toBe('scene');
    expect(sceneOverlapScope(shop, shop)).toBe('scene');
  });
});
