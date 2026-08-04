import { describe, expect, it } from 'vitest';
import { sceneManifest } from './sceneManifest';
import { initialSceneState, reduceScene } from './sceneDirector';
import { createRun, prepareDeployment } from '../../run/model';
import { completeDeploymentDeal } from '../../run/deployment';
import { createBlankLevel } from '../../core/level';

describe('scene director', () => {
  it('declares Play as a host nested inside the persistent menu host', () => {
    expect(sceneManifest('/').host).toBe('menu-shell');
    expect(sceneManifest('/play/select/skirmish').host).toBe('play-shell');
    expect(sceneManifest('/play').host).toBe('gameplay-shell');
  });
  it('does not restart a generation when a redirect repeats the active destination', () => {
    const home = sceneManifest('/');
    const play = sceneManifest('/play/select/skirmish');
    const navigating = reduceScene(initialSceneState(home), {
      type: 'navigate',
      destination: play,
      href: '/play/select/skirmish',
    });
    expect(reduceScene(navigating, {
      type: 'navigate',
      destination: play,
      href: '/play/select/skirmish',
    })).toBe(navigating);
  });

  it('retargets a preparing destination without replaying the outgoing exit', () => {
    const editor = sceneManifest('/editor/wars');
    const levelEditor = sceneManifest('/editor/level');
    let state = reduceScene(initialSceneState(editor), {
      type: 'navigate',
      destination: levelEditor,
      href: '/editor/level?levelId=off-l-battle&warId=off-w-war',
    });
    state = reduceScene(state, { type: 'exit-finished', generation: state.generation });
    expect(state.phase).toBe('loading');
    const firstGeneration = state.generation;

    state = reduceScene(state, {
      type: 'navigate',
      destination: levelEditor,
      href: '/editor/level?levelId=off-l-battle&warId=off-w-war&document=doc-1',
    });

    expect(state).toMatchObject({
      phase: 'loading',
      current: { id: 'campaign-editor:wars' },
      destination: { id: 'level-editor' },
      destinationHref: '/editor/level?levelId=off-l-battle&warId=off-w-war&document=doc-1',
      generation: firstGeneration + 1,
    });
  });

  it('retargets Play hub canonicalization without replaying the outgoing menu exit', () => {
    const settings = sceneManifest('/settings/general');
    let state = reduceScene(initialSceneState(settings), {
      type: 'navigate',
      destination: sceneManifest('/play/select'),
      href: '/play/select',
    });
    expect(state.phase).toBe('exiting');
    state = reduceScene(state, { type: 'exit-finished', generation: state.generation });
    expect(state.phase).toBe('loading');
    const firstGeneration = state.generation;

    // PlayMenu resolves resume authority and canonicalizes the hub root to the
    // most recent Continue choice (ADR-0260) while the destination still prepares.
    state = reduceScene(state, {
      type: 'navigate',
      destination: sceneManifest('/play/select/continue/skirmish'),
      href: '/play/select/continue/skirmish',
    });
    expect(state).toMatchObject({
      phase: 'loading',
      current: { id: 'settings:/settings/general' },
      destinationHref: '/play/select/continue/skirmish',
      generation: firstGeneration + 1,
    });

    state = reduceScene(state, { type: 'destination-painted', generation: state.generation });
    state = reduceScene(state, { type: 'entrance-finished', generation: state.generation });
    expect(state).toMatchObject({
      phase: 'current',
      current: { pathname: '/play/select/continue/skirmish' },
      destination: null,
    });
  });

  it('permits only the canonical scene lifecycle', () => {
    let state = initialSceneState(sceneManifest('/'));
    state = reduceScene(state, { type: 'navigate', destination: sceneManifest('/play'), href: '/play' });
    expect(state.phase).toBe('exiting');
    state = reduceScene(state, { type: 'exit-finished', generation: state.generation });
    expect(state.phase).toBe('loading');
    state = reduceScene(state, { type: 'destination-painted', generation: state.generation });
    expect(state.phase).toBe('entering');
    state = reduceScene(state, { type: 'entrance-finished', generation: state.generation });
    expect(state).toMatchObject({ phase: 'current', current: { id: 'gameplay' }, destination: null });
  });

  it('keeps the deal, Deployment, and Battle on the canonical battlefield scene', () => {
    const run = createRun({
      id: 'war',
      name: 'War',
      description: 'War',
      battles: [{ level: createBlankLevel('battle', 'Battle', 8, 8), loot: false }],
    }, 19, '2026-08-01T00:00:00.000Z');
    const deal = prepareDeployment({ ...run, phase: 'deployment' as const });
    const deployment = completeDeploymentDeal(deal, run.war.battles[0].level);
    const battle = { ...deployment, phase: 'battle' as const };
    const dealScene = sceneManifest('/run', '', {
      run: { hydrated: true, document: deal },
    });
    const deploymentScene = sceneManifest('/run', '', {
      run: { hydrated: true, document: deployment },
    });
    const battleScene = sceneManifest('/run', '', {
      run: { hydrated: true, document: battle },
    });
    let state = reduceScene(initialSceneState(dealScene), {
      type: 'navigate',
      destination: deploymentScene,
      href: '/run',
    });
    expect(state).toMatchObject({
      phase: 'current',
      current: { snapshot: { kind: 'run', run: deployment } },
      destination: null,
    });

    state = reduceScene(initialSceneState(deploymentScene), {
      type: 'navigate',
      destination: battleScene,
      href: '/run',
    });

    expect(state).toMatchObject({
      phase: 'current',
      current: { snapshot: { kind: 'run', phase: 'battle', run: battle } },
      destination: null,
    });
    expect(state.current.snapshot).toBe(battleScene.snapshot);
    expect(state.current.id).toBe(deploymentScene.id);
  });

  it('commits a removed child slot directly after exit without loading or entrance', () => {
    let state = initialSceneState(sceneManifest('/play/select/levels'));
    state = reduceScene(state, {
      type: 'navigate',
      destination: sceneManifest('/'),
      href: '/',
    });
    expect(state.phase).toBe('exiting');
    state = reduceScene(state, {
      type: 'empty-slot-committed',
      generation: state.generation,
    });
    expect(state).toMatchObject({
      phase: 'current',
      current: { pathname: '/', leaf: { key: 'main-menu' } },
      destination: null,
    });
  });

  it('keeps only the last destination and ignores stale completion', () => {
    let state = reduceScene(initialSceneState(sceneManifest('/')), {
      type: 'navigate', destination: sceneManifest('/play'), href: '/play',
    });
    const staleGeneration = state.generation;
    state = reduceScene(state, {
      type: 'navigate', destination: sceneManifest('/settings/general'), href: '/settings/general',
    });
    expect(state.destination?.id).toBe('settings:/settings/general');
    expect(reduceScene(state, { type: 'destination-painted', generation: staleGeneration })).toBe(state);
  });

  it('never converts failure or elapsed time into painted readiness', () => {
    let state = reduceScene(initialSceneState(sceneManifest('/')), {
      type: 'navigate', destination: sceneManifest('/play'), href: '/play',
    });
    state = reduceScene(state, { type: 'exit-finished', generation: state.generation });
    state = reduceScene(state, { type: 'failed', generation: state.generation, error: new Error('asset failed') });
    expect(state.phase).toBe('error');
    expect(reduceScene(state, { type: 'entrance-finished', generation: state.generation }).phase).toBe('error');
    expect(reduceScene(state, { type: 'retry' })).toMatchObject({ phase: 'loading', error: null });
  });

  it.each([
    ['/play/select/skirmish', 'play-selector'],
    ['/editor/level', 'level-editor'],
    ['/', 'dom'],
  ])('cold-loads %s through the one shell ladder', (href, paintOwner) => {
    // Every route, not just the menu: there is no second cold-start branch (ADR-0369).
    expect(initialSceneState(sceneManifest(href), href)).toMatchObject({
      phase: 'startup',
      startupActive: true,
      startupStage: -1,
      destination: { paintOwner },
      destinationHref: href,
      generation: 0,
    });
  });

  it('climbs background, then chrome, then the scene, and hands off to the ordinary entrance', () => {
    let state = initialSceneState(sceneManifest('/editor/level'), '/editor/level');

    // A rung cannot open before the rung beneath it, whatever order readiness arrives in.
    state = reduceScene(state, { type: 'startup-ready', generation: 0, layer: 'chrome' });
    expect(reduceScene(state, { type: 'startup-reveal', generation: 0, layer: 'chrome' })).toBe(state);

    state = reduceScene(state, { type: 'startup-ready', generation: 0, layer: 'background' });
    state = reduceScene(state, { type: 'startup-reveal', generation: 0, layer: 'background' });
    expect(state.startupStage).toBe(0);
    state = reduceScene(state, { type: 'startup-reveal', generation: 0, layer: 'chrome' });
    expect(state).toMatchObject({ phase: 'startup', startupStage: 1 });

    // The final rung is the ORDINARY painted contract, and opening it enters normally.
    expect(reduceScene(state, { type: 'startup-reveal', generation: 0, layer: 'scene' })).toBe(state);
    state = reduceScene(state, { type: 'destination-painted', generation: 0 });
    expect(state).toMatchObject({ phase: 'startup', startupReady: ['chrome', 'background', 'scene'] });
    state = reduceScene(state, { type: 'startup-reveal', generation: 0, layer: 'scene' });
    expect(state).toMatchObject({ phase: 'entering', startupActive: true });
    state = reduceScene(state, { type: 'entrance-finished', generation: 0 });
    expect(state).toMatchObject({
      phase: 'current',
      startupActive: false,
      current: { id: 'level-editor' },
      destination: null,
    });
  });

  it('retargets a canonicalizing cold load without losing the shell rungs it has climbed', () => {
    // The Level Editor resolves levelId -> opaque document while the cold load prepares.
    // Swallowing that would strand the ladder on a stale address.
    let state = initialSceneState(sceneManifest('/editor/level'), '/editor/level?levelId=off-l-battle');
    state = reduceScene(state, { type: 'startup-ready', generation: 0, layer: 'background' });
    state = reduceScene(state, { type: 'startup-reveal', generation: 0, layer: 'background' });
    state = reduceScene(state, { type: 'startup-ready', generation: 0, layer: 'chrome' });
    state = reduceScene(state, { type: 'startup-reveal', generation: 0, layer: 'chrome' });
    state = reduceScene(state, { type: 'destination-painted', generation: 0 });
    expect(state.startupReady).toContain('scene');

    state = reduceScene(state, {
      type: 'navigate',
      destination: sceneManifest('/editor/level'),
      href: '/editor/level?levelId=off-l-battle&document=doc-1',
    });
    expect(state).toMatchObject({
      phase: 'startup',
      startupStage: 1,
      destinationHref: '/editor/level?levelId=off-l-battle&document=doc-1',
      generation: 1,
    });
    expect(state.startupReady).not.toContain('scene');
    expect(state.startupReady).toEqual(['background', 'chrome']);
  });

  it('retries failed startup as a fresh generation with every stage closed', () => {
    let state = initialSceneState(sceneManifest('/'), '/');
    state = reduceScene(state, {
      type: 'startup-failed',
      generation: 0,
      error: new Error('background failed'),
    });
    expect(state.phase).toBe('error');
    state = reduceScene(state, { type: 'retry' });
    expect(state).toMatchObject({
      phase: 'startup',
      generation: 1,
      startupStage: -1,
      startupReady: [],
      error: null,
    });
    expect(reduceScene(state, {
      type: 'startup-ready',
      generation: 0,
      layer: 'background',
    })).toBe(state);
  });
});
