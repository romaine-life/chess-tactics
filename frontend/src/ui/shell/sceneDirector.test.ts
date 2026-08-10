import { describe, expect, it } from 'vitest';
import { sceneManifest } from './sceneManifest';
import { initialSceneState, reduceScene } from './sceneDirector';
import { createRun, prepareDeployment } from '../../run/model';
import { completeDeploymentDeal } from '../../run/deployment';
import { createBlankLevel, LEVEL_BATTLE_CARDS_DEALT_DEFAULT, type Level } from '../../core/level';

/** A War Battle level: every one authors how many cards its Deployment deals. */
const battleLevel = (id: string, name: string): Level => ({
  ...createBlankLevel(id, name, 8, 8),
  battle: { loot: false, cardsDealt: LEVEL_BATTLE_CARDS_DEALT_DEFAULT },
});


describe('scene director', () => {
  it('declares Play as a host nested inside the persistent menu host', () => {
    expect(sceneManifest('/').host).toBe('menu-shell');
    expect(sceneManifest('/play/select/run').host).toBe('play-shell');
    expect(sceneManifest('/play').host).toBe('gameplay-shell');
  });
  it('does not restart a generation when a redirect repeats the active destination', () => {
    const home = sceneManifest('/');
    const play = sceneManifest('/play/select/run');
    const navigating = reduceScene(initialSceneState(home), {
      type: 'navigate',
      destination: play,
      href: '/play/select/run',
    });
    expect(reduceScene(navigating, {
      type: 'navigate',
      destination: play,
      href: '/play/select/run',
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

    // PlayMenu canonicalizes the hub root to the sole player-facing Run mode
    // (ADR-0514) while the destination still prepares.
    state = reduceScene(state, {
      type: 'navigate',
      destination: sceneManifest('/play/select/run'),
      href: '/play/select/run',
    });
    expect(state).toMatchObject({
      phase: 'loading',
      current: { id: 'settings:/settings/general' },
      destinationHref: '/play/select/run',
      generation: firstGeneration + 1,
    });

    state = reduceScene(state, { type: 'destination-painted', generation: state.generation });
    state = reduceScene(state, { type: 'entrance-finished', generation: state.generation });
    expect(state).toMatchObject({
      phase: 'current',
      current: { pathname: '/play/select/run' },
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
      battles: [{ level: battleLevel('battle', 'Battle'), loot: false }],
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

  it('advances the retry epoch on retry and on nothing else', () => {
    // The epoch is the mounted layer's identity, so a screen holding its own failure is rebuilt
    // rather than re-driven around the instance still reporting it. Advancing it on navigation
    // instead would remount every just-committed screen and its store.
    let state = initialSceneState(sceneManifest('/'));
    expect(state.retryEpoch).toBe(0);

    state = reduceScene(state, { type: 'navigate', destination: sceneManifest('/play'), href: '/play' });
    state = reduceScene(state, { type: 'exit-finished', generation: state.generation });
    expect(state.retryEpoch).toBe(0);

    state = reduceScene(state, { type: 'failed', generation: state.generation, error: new Error('backend down') });
    expect(state.retryEpoch).toBe(0);

    state = reduceScene(state, { type: 'retry' });
    expect(state).toMatchObject({ phase: 'loading', retryEpoch: 1, error: null });

    // A retry that the director refuses (there is nothing in error to retry) rebuilds nothing.
    expect(reduceScene(state, { type: 'retry' }).retryEpoch).toBe(1);

    state = reduceScene(state, { type: 'failed', generation: state.generation, error: new Error('still down') });
    expect(reduceScene(state, { type: 'retry' }).retryEpoch).toBe(2);

    // Committing the retried scene and navigating on leaves the epoch where it is.
    state = reduceScene(state, { type: 'retry' });
    state = reduceScene(state, { type: 'destination-painted', generation: state.generation });
    state = reduceScene(state, { type: 'entrance-finished', generation: state.generation });
    expect(state).toMatchObject({ phase: 'current', retryEpoch: 2 });
    state = reduceScene(state, { type: 'navigate', destination: sceneManifest('/'), href: '/' });
    expect(state.retryEpoch).toBe(2);
  });

  it('leaves the committed epoch alone until a destination is promoted', () => {
    // App.tsx keys the outgoing layer of a scene replacement by this, so it must be the epoch
    // the visible scene was BUILT with. A retry belongs to the destination that failed; taking
    // the live retryEpoch here would change the committed layer's key and destroy the screen
    // standing painted behind the failure — the flicker of ADR-0558, on a worse surface.
    let state = initialSceneState(sceneManifest('/'));
    expect(state.committedEpoch).toBe(0);

    state = reduceScene(state, { type: 'navigate', destination: sceneManifest('/play'), href: '/play' });
    state = reduceScene(state, { type: 'exit-finished', generation: state.generation });
    // Beginning a replacement moves nothing: the outgoing layer must keep the key it had.
    expect(state).toMatchObject({ phase: 'loading', retryEpoch: 0, committedEpoch: 0 });

    state = reduceScene(state, { type: 'failed', generation: state.generation, error: new Error('backend down') });
    state = reduceScene(state, { type: 'retry' });
    expect(state).toMatchObject({ retryEpoch: 1, committedEpoch: 0 });

    state = reduceScene(state, { type: 'destination-painted', generation: state.generation });
    state = reduceScene(state, { type: 'entrance-finished', generation: state.generation });
    // Promotion is the one moment the committed layer legitimately becomes a different mount,
    // and it lands on exactly the epoch the incoming layer was keyed by, so its key is unchanged.
    expect(state).toMatchObject({ phase: 'current', retryEpoch: 1, committedEpoch: 1 });
  });

  it('promotes the committed epoch through an empty destination slot too', () => {
    let state = initialSceneState(sceneManifest('/play/select/levels'));
    state = reduceScene(state, { type: 'retry' });
    state = reduceScene(state, {
      type: 'navigate',
      destination: sceneManifest('/play/select'),
      href: '/play/select',
    });
    state = reduceScene(state, { type: 'empty-slot-committed', generation: state.generation });
    expect(state).toMatchObject({ phase: 'current', committedEpoch: state.retryEpoch });
  });

  it('rebuilds a failed cold load as well as a failed navigation', () => {
    let state = initialSceneState(sceneManifest('/editor/level'), '/editor/level');
    state = reduceScene(state, { type: 'startup-failed', generation: 0, error: new Error('chrome failed') });
    expect(reduceScene(state, { type: 'retry' })).toMatchObject({ phase: 'startup', retryEpoch: 1 });
  });

  it.each([
    ['/play/select/run', 'play-selector'],
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
