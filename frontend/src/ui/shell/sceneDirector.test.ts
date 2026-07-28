import { describe, expect, it } from 'vitest';
import { sceneManifest } from './sceneManifest';
import { initialSceneState, reduceScene } from './sceneDirector';

describe('scene director', () => {
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

  it('keeps only the last destination and ignores stale completion', () => {
    let state = reduceScene(initialSceneState(sceneManifest('/')), {
      type: 'navigate', destination: sceneManifest('/play'), href: '/play',
    });
    const staleGeneration = state.generation;
    state = reduceScene(state, {
      type: 'navigate', destination: sceneManifest('/settings/general'), href: '/settings/general',
    });
    expect(state.destination?.id).toBe('settings');
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

  it('prepares a cold deep-link through the same atomic scene lifecycle', () => {
    const state = initialSceneState(sceneManifest('/play/select/skirmish'), true);
    expect(state).toMatchObject({
      phase: 'loading',
      destination: { paintOwner: 'play-selector' },
      generation: 0,
    });
  });
});
