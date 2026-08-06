import { describe, expect, it } from 'vitest';
import {
  deepestSharedSceneRegion,
  isEmptySlotDestination,
  isEmptySlotOrigin,
  sceneLayerKey,
  sceneManifest,
  sceneTransitionRelationship,
} from './sceneManifest';
import { createRun, prepareDeployment } from '../../run/model';
import { completeDeploymentDeal } from '../../run/deployment';
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
      ['/play/strategikon'], ['/play/strategikon/enchiridion'],
      ['/play/strategikon/enchiridion/units'], ['/play/strategikon/enchiridion/terrain'],
      ['/play/strategikon/enchiridion/cards'], ['/play/strategikon/enchiridion/card-types'],
      ['/play/strategikon/enchiridion/lipsana'], ['/play/strategikon/enchiridion/abilities'],
      ['/play/strategikon/enchiridion/ataraxia'],
      ['/play/strategikon/prosopography'], ['/play/strategikon/chartulary'],
      ['/play/strategikon/lipsanotheca'],
      ['/play/strategikon/unknown'], ['/play/strategikon/enchiridion/unknown'],
      ['/run/strategikon', '', { run: { hydrated: true, document: run } }],
      ['/run/strategikon/enchiridion', '', { run: { hydrated: true, document: run } }],
      ['/run/strategikon/enchiridion/units', '', { run: { hydrated: true, document: run } }],
      ['/run/strategikon/enchiridion/lipsana', '', { run: { hydrated: true, document: run } }],
      ['/run/strategikon/prosopography', '', { run: { hydrated: true, document: run } }],
      ['/run/strategikon/chartulary', '', { run: { hydrated: true, document: run } }],
      ['/run/strategikon/lipsanotheca', '', { run: { hydrated: true, document: run } }],
      ['/run'], ['/run', '', { run: { hydrated: false, document: null } }],
      ['/run', '', { run: { hydrated: true, document: null } }],
      ['/run', '', { run: { hydrated: true, document: run } }],
      ['/run', '?view=army', { run: { hydrated: true, document: run } }],
      ['/run', '?view=expunctio', { run: { hydrated: true, document: run } }],
      ['/run', '?view=battle-preview', { run: { hydrated: true, document: run } }],
      ['/play/select'], ['/play/select/continue'], ['/play/select/continue/campaign'],
      ['/play/select/continue/skirmish'], ['/play/select/continue/run'], ['/play/select/continue/levels'],
      ['/play/select/unknown'], ['/play/select/skirmish'], ['/play/select/levels'],
      ['/play/select/run'], ['/play/select/run/current'], ['/play/select/run/new'],
      ['/play/select/campaign/a'], ['/play/select/campaign/b'],
      ['/settings'], ['/settings/general'], ['/settings/unknown'], ['/settings/audio'],
      ['/settings/audio/tracks'], ['/settings/gameplay'], ['/settings/creator-tools'],
      ['/settings/admin'], ['/party'],
      ['/enchiridion'], ['/enchiridion/units'], ['/enchiridion/terrain'], ['/enchiridion/cards'],
      ['/enchiridion/card-types'], ['/enchiridion/lipsana'], ['/enchiridion/lipsana/some-lipsanon'],
      ['/enchiridion/abilities'], ['/enchiridion/ataraxia'], ['/enchiridion/unknown'],
      ['/lobbies'], ['/lobbies/room-1'],
      ['/editor'], ['/campaigns'], ['/campaigns-next'], ['/editor/wars'],
      ['/editor', '?campaign=camp-a'], ['/editor', '?campaign=camp-b'],
      ['/editor', '?collection=skirmish-profiles'], ['/editor', '?collection=unassigned'],
      ['/editor/level'], ['/editor/level', '?document=doc-1'], ['/edit'], ['/level-editor'],
      ['/studio'], ['/studio', '?lipsanonReview=1'], ['/studio/drawables'], ['/unit-studio'],
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
      critical: ['play-selector'],
      opportunistic: ['below-fold-level-thumbnails'],
    });
    expect(sceneManifest('/play')).toMatchObject({
      host: 'gameplay-shell',
      background: 'battlefield',
      paintOwner: 'gameplay-hud',
      critical: ['gameplay-hud'],
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
    )).toBe('gameplay-workspace');
    expect(isEmptySlotOrigin(
      play,
      playStrategikon,
    )).toBe(true);
    expect(isEmptySlotDestination(
      playStrategikon,
      play,
    )).toBe(true);
    // Opening the Strategikon changes a selection inside the same Run phase. The
    // gameplay viewport may pass through its deselected state while the Controls
    // panel and the rest of the owning scene stay painted.
    expect(isEmptySlotOrigin(run, runStrategikon)).toBe(true);
    expect(isEmptySlotDestination(runStrategikon, run)).toBe(true);
    expect(sceneTransitionRelationship(run, runStrategikon)).toEqual({
      kind: 'selection-change',
      region: 'gameplay-workspace',
    });
    // Travel BETWEEN Strategikon sections leaves the Run's own state identity
    // untouched, so it takes the ordinary region-preserving path and fades only the
    // pane its rail replaces.
    const runReference = sceneManifest('/run/strategikon/enchiridion/units');
    const runReferenceOther = sceneManifest('/run/strategikon/enchiridion/lipsana');
    expect(deepestSharedSceneRegion(runStrategikon, runReference)).toBe('strategikon-shell');
    expect(sceneTransitionRelationship(runStrategikon, runReference)).toEqual({
      kind: 'selection-change',
      region: 'strategikon-shell',
    });
    expect(deepestSharedSceneRegion(runReference, runReferenceOther)).toBe('strategikon-reference-shell');
    expect(sceneManifest('/run/strategikon').instances.map((entry) => entry.definition.id)).toEqual([
      'run', 'run/phase', 'run/workspace', 'strategikon',
    ]);
    expect(sceneManifest('/run/strategikon/enchiridion').instances.map((entry) => entry.definition.id)).toEqual([
      'run', 'run/phase', 'run/workspace', 'strategikon', 'strategikon/enchiridion',
    ]);
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
      sceneManifest('/enchiridion/lipsana'),
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
    const deal = prepareDeployment({ ...draft, phase: 'deployment' as const });
    const deployment = completeDeploymentDeal(deal, level);
    const battle = { ...deployment, phase: 'battle' as const };
    const source = (document: typeof draft) => ({ run: { hydrated: true, document } });

    const dealScene = sceneManifest('/run', '', source(deal));
    const deploymentScene = sceneManifest('/run', '', source(deployment));
    const battleScene = sceneManifest('/run', '', source(battle));
    const armyScene = sceneManifest('/run', '?view=army', source(battle));
    const hiddenBattlePreviewScene = sceneManifest('/run', '?view=battle-preview', source(battle));
    const sectioBattlePreviewScene = sceneManifest('/run', '?view=battle-preview', source(draft));
    const sectioExpunctioScene = sceneManifest('/run', '?view=expunctio', source(draft));

    expect(dealScene.snapshot).toMatchObject({
      kind: 'run',
      phase: 'deployment',
      workspace: { view: 'primary' },
      run: deal,
    });
    expect(dealScene.instances.map((entry) => entry.definition.slot)).toEqual([
      'root',
      'run-phase',
      'run-workspace',
    ]);
    // The empty battlefield is already mounted while the face-down deal animates.
    expect(deploymentScene.id).toBe(dealScene.id);
    expect(sceneLayerKey(deploymentScene)).toBe(sceneLayerKey(dealScene));
    expect(battleScene.id).toBe(deploymentScene.id);
    expect(sceneLayerKey(battleScene)).toBe(sceneLayerKey(deploymentScene));
    expect(armyScene.id).not.toBe(battleScene.id);
    expect(sectioBattlePreviewScene.snapshot).toMatchObject({
      kind: 'run',
      phase: 'sectio',
      workspace: { view: 'battle-preview' },
    });
    expect(sectioExpunctioScene.snapshot).toMatchObject({
      kind: 'run',
      phase: 'sectio',
      workspace: { view: 'expunctio' },
    });
    expect(hiddenBattlePreviewScene.snapshot).toMatchObject({
      kind: 'run',
      phase: 'battle',
      workspace: { view: 'primary' },
    });
    expect(deepestSharedSceneRegion(dealScene, deploymentScene)).toBe('gameplay-workspace');
    expect(deepestSharedSceneRegion(deploymentScene, battleScene)).toBe('gameplay-workspace');
    expect(deepestSharedSceneRegion(battleScene, armyScene)).toBe('gameplay-workspace');
    expect(sceneTransitionRelationship(battleScene, armyScene)).toEqual({
      kind: 'selection-change',
      region: 'gameplay-workspace',
    });
  });

  it('authors Bona targeting and unit inspection as distinct Run workspace scenes', () => {
    const level = createBlankLevel('run-battle', 'Run Battle', 8, 8);
    const base = createRun({
      id: 'run-war',
      name: 'Run War',
      description: 'A test War',
      battles: [{ level, loot: false }],
    }, 17, '2026-08-01T00:00:00.000Z');
    const document = {
      ...base,
      phase: 'bona-vacantia' as const,
      vacantia: {
        kind: 'opening' as const,
        conflictIndex: 0,
        afterBattleIndex: 0,
        victoryGoldTenths: 0,
        offers: ['conscription-notice' as const, 'royal-decree' as const, 'training-linens' as const],
      },
    };
    const source = { run: { hydrated: true, document } };
    const unitId = document.army[0].id;
    const mat = sceneManifest('/run', '', source);
    const ledger = sceneManifest('/run', '?view=bona-target&lipsanon=conscription-notice', source);
    const profile = sceneManifest(
      '/run',
      `?view=bona-target&lipsanon=conscription-notice&unit=${encodeURIComponent(unitId)}`,
      source,
    );

    expect(ledger.snapshot).toMatchObject({
      workspace: { view: 'bona-target', lipsanonId: 'conscription-notice', unitId: null },
    });
    expect(profile.snapshot).toMatchObject({
      workspace: { view: 'bona-target', lipsanonId: 'conscription-notice', unitId },
    });
    expect(new Set([mat.id, ledger.id, profile.id]).size).toBe(3);
    expect(sceneLayerKey(mat)).toBe(sceneLayerKey(ledger));
    expect(sceneLayerKey(ledger)).toBe(sceneLayerKey(profile));
    expect(sceneTransitionRelationship(mat, ledger)).toEqual({
      kind: 'selection-change',
      region: 'gameplay-workspace',
    });
    expect(sceneTransitionRelationship(ledger, profile)).toEqual({
      kind: 'selection-change',
      region: 'gameplay-workspace',
    });

    const armyLedger = sceneManifest('/run', '?view=army', source);
    const armyProfile = sceneManifest('/run', `?view=army&unit=${encodeURIComponent(unitId)}`, source);
    expect(armyLedger.snapshot).toMatchObject({ workspace: { view: 'army', unitId: null } });
    expect(armyProfile.snapshot).toMatchObject({ workspace: { view: 'army', unitId } });
    expect(armyProfile.id).not.toBe(armyLedger.id);
    expect(sceneLayerKey(armyProfile)).toBe(sceneLayerKey(armyLedger));
    expect(sceneTransitionRelationship(armyLedger, armyProfile)).toEqual({
      kind: 'selection-change',
      region: 'gameplay-workspace',
    });

    // Unknown, untargeted, or out-of-phase requests do not gain viewport authority.
    expect(sceneManifest('/run', '?view=bona-target&lipsanon=royal-decree', source).id).toBe(mat.id);
    expect(sceneManifest('/run', '?view=bona-target&lipsanon=conscription-notice&unit=missing', source).id)
      .toBe(ledger.id);
    expect(sceneManifest('/run', '?view=bona-target&lipsanon=conscription-notice', {
      run: { hydrated: true, document: base },
    }).snapshot).toMatchObject({ workspace: { view: 'primary' } });
  });

  it('addresses individual lipsana inside the one retained lipsanon-reference scene (ADR-0256)', () => {
    const base = sceneManifest('/enchiridion/lipsana');
    const addressed = sceneManifest('/enchiridion/lipsana/royal-decree');
    // Same manifest id + instance keys ⇒ lipsanon selection is an address-only update:
    // App's same-scene path applies and no exit/enter choreography runs per lipsanon.
    expect(addressed.id).toBe(base.id);
    expect(addressed.instances.map((entry) => entry.key)).toEqual(base.instances.map((entry) => entry.key));
    expect(addressed.leaf.definition.id).toBe('enchiridion/lipsana');
    expect(addressed).toMatchObject({
      host: 'enchiridion-shell',
      background: 'homepage',
      paintOwner: 'dom',
    });
    // Section changes remain real scene transitions.
    expect(sceneManifest('/enchiridion/units').id).not.toBe(base.id);
    // The bare root retains the shell while leaving its content slot empty.
    expect(sceneManifest('/enchiridion').id).not.toBe(sceneManifest('/enchiridion/units').id);
    expect(sceneManifest('/enchiridion').instances.map((entry) => entry.definition.id)).toEqual([
      'main-menu', 'enchiridion',
    ]);
    expect(isEmptySlotOrigin(sceneManifest('/enchiridion'), sceneManifest('/enchiridion/units'))).toBe(true);
    expect(isEmptySlotDestination(sceneManifest('/enchiridion/units'), sceneManifest('/enchiridion'))).toBe(true);
  });

  it('addresses individual cards inside the one retained card-reference scene', () => {
    const base = sceneManifest('/enchiridion/cards');
    const addressed = sceneManifest('/enchiridion/cards/country-parish');
    expect(addressed.id).toBe(base.id);
    expect(addressed.instances.map((entry) => entry.key)).toEqual(base.instances.map((entry) => entry.key));
    expect(addressed.leaf.definition.id).toBe('enchiridion/cards');
    expect(sceneManifest('/enchiridion/units').id).not.toBe(base.id);
  });

  it('addresses individual card properties inside the one retained card-types scene', () => {
    const base = sceneManifest('/enchiridion/card-types');
    const addressed = sceneManifest('/enchiridion/card-types/hieratic');
    expect(addressed.id).toBe(base.id);
    expect(addressed.instances.map((entry) => entry.key)).toEqual(base.instances.map((entry) => entry.key));
    expect(addressed.leaf.definition.id).toBe('enchiridion/card-types');
    expect(sceneManifest('/enchiridion/units').id).not.toBe(base.id);
  });

  it('decomposes the editor into the authorities it actually registers', () => {
    // Not one collapsed participant, and not a vocabulary nothing registers: these are the
    // ids LevelEditor reports separately, so each can fail on its own (ADR-0369).
    expect(sceneManifest('/editor/level').critical).toEqual([
      'chrome:skirmish-screen level-editor-screen',
      'document',
      'board-compositors',
      'visible-editor-chrome',
      'level-editor',
    ]);
    expect(sceneManifest('/studio')).toMatchObject({
      paintOwner: 'studio',
      critical: ['studio'],
      opportunistic: ['below-fold-catalog'],
    });
  });

  it('makes synchronous and unmatched routes explicit rather than optional', () => {
    expect(sceneManifest('/settings/general').critical).toEqual(['chrome:settings-shell']);
    expect(sceneManifest('/unknown')).toMatchObject({ id: 'main-menu', host: 'menu-shell', paintOwner: 'dom' });
  });

  it('never declares the shell as a scene participant', () => {
    // The persistent bar and the shared backdrop are rendered OUTSIDE every boundary, so
    // they could never register there. They are the director's first two ladder rungs now;
    // naming them here is how six declared ids decayed into comments (ADR-0369).
    const routes = [
      '/', '/unknown', '/settings/general', '/settings/audio/tracks', '/enchiridion', '/enchiridion/units',
      '/play/select/skirmish', '/play', '/play/strategikon', '/editor', '/editor/level', '/studio', '/lobbies',
      '/party', '/portrait-editor', '/predrawn-reference', '/run', '/run/strategikon',
    ];
    for (const route of routes) {
      const { critical } = sceneManifest(route);
      expect(critical, route).not.toContain('title-bar');
      expect(critical, route).not.toContain('homepage-background');
    }
  });

  it('derives scene replacement versus within-scene selection from Run ownership', () => {
    const war = {
      id: 'war',
      name: 'War',
      description: 'War',
      battles: [{ level: createBlankLevel('battle', 'Battle', 8, 8), loot: false }],
    };
    const document = createRun(war, 19, '2026-08-01T00:00:00.000Z');
    const source = { run: { hydrated: true, document } };
    const sectio = sceneManifest('/run', '', source);
    const expunctio = sceneManifest('/run', '?view=expunctio', source);
    const army = sceneManifest('/run', '?view=army', source);
    const battlePreview = sceneManifest('/run', '?view=battle-preview', source);
    const strategikon = sceneManifest('/run/strategikon/prosopography', '', source);

    for (const [current, destination] of [
      [sectio, expunctio],
      [expunctio, sectio],
      [sectio, army],
      [sectio, battlePreview],
      [battlePreview, sectio],
      [sectio, strategikon],
      [strategikon, sectio],
    ] as const) {
      expect(sceneTransitionRelationship(current, destination)).toEqual({
        kind: 'selection-change',
        region: 'gameplay-workspace',
      });
      expect(sceneLayerKey(current)).toBe(sceneLayerKey(destination));
    }

    // A phase change replaces the owning scene and therefore must prepare and
    // crossfade two complete compositions without a deselected midpoint.
    const battle = sceneManifest('/run', '', {
      run: { hydrated: true, document: { ...document, phase: 'battle' } },
    });
    expect(sceneTransitionRelationship(sectio, battle)).toEqual({ kind: 'scene-replacement', region: null });
    expect(sceneTransitionRelationship(
      sectio,
      sceneManifest('/run', '', { run: { hydrated: false, document: null } }),
    )).toEqual({ kind: 'scene-replacement', region: null });
    expect(sceneTransitionRelationship(sectio, sceneManifest('/play/select/run')))
      .toEqual({ kind: 'scene-replacement', region: null });
    expect(sceneLayerKey(sectio)).not.toBe(sceneLayerKey(battle));

    const aftermathDocument = {
      ...document,
      phase: 'aftermath' as const,
      aftermath: {
        battleIndex: 0,
        turns: 4,
        elapsedMs: 1000,
        goldTenths: 10,
        bonusGoldTenths: 0,
        survivingUnitIds: [],
        fallenUnits: [],
      },
    };
    const aftermath = sceneManifest('/run', '', { run: { hydrated: true, document: aftermathDocument } });
    const battleReview = sceneManifest('/run', '?view=battle-review', {
      run: { hydrated: true, document: aftermathDocument },
    });
    expect(battleReview.snapshot).toMatchObject({ workspace: { view: 'battle-review' } });
    expect(sceneTransitionRelationship(battle, aftermath)).toEqual({ kind: 'scene-replacement', region: null });
    expect(sceneTransitionRelationship(aftermath, battleReview)).toEqual({ kind: 'scene-replacement', region: null });
    expect(sceneTransitionRelationship(battleReview, aftermath)).toEqual({ kind: 'scene-replacement', region: null });
    expect(sceneLayerKey(aftermath)).not.toBe(sceneLayerKey(battleReview));
  });
});
