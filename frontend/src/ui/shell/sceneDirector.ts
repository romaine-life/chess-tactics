import type { ScenePath } from './sceneManifest';
import type { StartupLayer } from './startupScene';

export type ScenePhase = 'startup' | 'current' | 'exiting' | 'loading' | 'entering' | 'error';

export interface SceneState {
  phase: ScenePhase;
  /** The authored scene path whose lifecycle has completed. */
  current: ScenePath;
  /** The authored scene path being prepared; it is never visible authority. */
  destination: ScenePath | null;
  destinationHref: string | null;
  generation: number;
  error: Error | null;
  startupActive: boolean;
  startupStage: number;
  startupReady: readonly StartupLayer[];
}

export type SceneAction =
  | { type: 'navigate'; destination: ScenePath; href: string }
  | { type: 'exit-finished'; generation: number }
  | { type: 'empty-slot-committed'; generation: number }
  | { type: 'destination-painted'; generation: number }
  | { type: 'entrance-finished'; generation: number }
  | { type: 'failed'; generation: number; error: Error }
  | { type: 'startup-ready'; generation: number; layer: StartupLayer }
  | { type: 'startup-reveal'; generation: number; layer: StartupLayer }
  | { type: 'startup-failed'; generation: number; error: Error }
  | { type: 'startup-finished'; generation: number }
  | { type: 'retry' };

export function initialSceneState(
  current: ScenePath,
  prepareInitialScene = false,
  initialHref = '',
  prepareStartup = false,
): SceneState {
  return {
    phase: prepareStartup ? 'startup' : prepareInitialScene ? 'loading' : 'current',
    current,
    destination: prepareInitialScene ? current : null,
    destinationHref: prepareInitialScene ? initialHref : null,
    generation: 0,
    error: null,
    startupActive: prepareStartup,
    startupStage: prepareStartup ? -1 : 2,
    startupReady: [],
  };
}

/**
 * Pure authority for navigation loading. Timers and React commits may request
 * lifecycle actions, but only this reducer decides whether an action still belongs
 * to the latest destination generation.
 */
export function reduceScene(state: SceneState, action: SceneAction): SceneState {
  if (action.type === 'startup-ready') {
    if (!state.startupActive || action.generation !== state.generation || state.startupReady.includes(action.layer)) return state;
    return { ...state, startupReady: [...state.startupReady, action.layer] };
  }
  if (action.type === 'startup-reveal') {
    if (!state.startupActive || action.generation !== state.generation) return state;
    const ladder: readonly StartupLayer[] = ['background', 'title', 'controls'];
    const next = ladder[state.startupStage + 1];
    if (action.layer !== next || !state.startupReady.includes(action.layer)) return state;
    return { ...state, startupStage: state.startupStage + 1 };
  }
  if (action.type === 'startup-failed') {
    if (!state.startupActive || action.generation !== state.generation) return state;
    return { ...state, phase: 'error', error: action.error };
  }
  if (action.type === 'startup-finished') {
    if (!state.startupActive || action.generation !== state.generation || state.startupStage < 2) return state;
    return { ...state, phase: 'current', startupActive: false, error: null };
  }
  if (action.type === 'navigate') {
    if (state.startupActive) return state;
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
    if (state.startupActive && state.phase === 'error') {
      return {
        ...state,
        phase: 'startup',
        generation: state.generation + 1,
        error: null,
        startupStage: -1,
        startupReady: [],
      };
    }
    if (!state.destination || !state.destinationHref || state.phase !== 'error') return state;
    return { ...state, phase: 'loading', generation: state.generation + 1, error: null };
  }
  if (action.generation !== state.generation) return state;
  if (action.type === 'empty-slot-committed' && state.phase === 'exiting' && state.destination) {
    return {
      ...state,
      phase: 'current',
      current: state.destination,
      destination: null,
      destinationHref: null,
      error: null,
    };
  }
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
