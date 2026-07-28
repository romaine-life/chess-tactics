import type { SceneManifest } from './sceneManifest';

export type ScenePhase = 'current' | 'exiting' | 'loading' | 'entering' | 'error';

export interface SceneState {
  phase: ScenePhase;
  current: SceneManifest;
  destination: SceneManifest | null;
  destinationHref: string | null;
  generation: number;
  error: Error | null;
}

export type SceneAction =
  | { type: 'navigate'; destination: SceneManifest; href: string }
  | { type: 'exit-finished'; generation: number }
  | { type: 'destination-painted'; generation: number }
  | { type: 'entrance-finished'; generation: number }
  | { type: 'failed'; generation: number; error: Error }
  | { type: 'retry' };

export function initialSceneState(
  current: SceneManifest,
  prepareInitialScene = false,
  initialHref = '',
): SceneState {
  return {
    phase: prepareInitialScene ? 'loading' : 'current',
    current,
    destination: prepareInitialScene ? current : null,
    destinationHref: prepareInitialScene ? initialHref : null,
    generation: 0,
    error: null,
  };
}

/**
 * Pure authority for navigation loading. Timers and React commits may request
 * lifecycle actions, but only this reducer decides whether an action still belongs
 * to the latest destination generation.
 */
export function reduceScene(state: SceneState, action: SceneAction): SceneState {
  if (action.type === 'navigate') {
    if (action.destination.id === state.current.id && state.phase === 'current') return state;
    if (
      state.destination
      && action.destination.id === state.destination.id
      && action.href === state.destinationHref
    ) return state;
    return {
      ...state,
      phase: 'exiting',
      destination: action.destination,
      destinationHref: action.href,
      generation: state.generation + 1,
      error: null,
    };
  }
  if (action.type === 'retry') {
    if (!state.destination || !state.destinationHref || state.phase !== 'error') return state;
    return { ...state, phase: 'loading', generation: state.generation + 1, error: null };
  }
  if (action.generation !== state.generation) return state;
  if (action.type === 'exit-finished' && state.phase === 'exiting') {
    return { ...state, phase: 'loading' };
  }
  if (action.type === 'destination-painted' && state.phase === 'loading') {
    return { ...state, phase: 'entering' };
  }
  if (action.type === 'entrance-finished' && state.phase === 'entering' && state.destination) {
    return {
      ...state,
      phase: 'current',
      current: state.destination,
      destination: null,
      destinationHref: null,
      error: null,
    };
  }
  if (action.type === 'failed' && (state.phase === 'loading' || state.phase === 'entering')) {
    return { ...state, phase: 'error', error: action.error };
  }
  return state;
}
