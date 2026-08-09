import type { ScenePath } from './sceneManifest';
import { SHELL_LADDER, type ShellLayer } from './startupScene';

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
  /**
   * How many times a failed scene has been asked to try again. It advances ONLY on `retry`, and
   * the mounted layer key carries it, so retrying rebuilds the screen that failed instead of
   * re-running the director around the same instance.
   *
   * A failure is usually held in the failed screen's own state — the Level Editor's resolved
   * document error is the canonical one — and a resolve effect that has already run does not run
   * again just because the phase moved back to `loading`. Retry therefore did nothing at all for
   * those scenes: the participant re-reported the error it still held and the director failed
   * straight back, whichever button was pressed and however many times (ADR-0548). Generation
   * cannot serve here: it advances on every navigation, and remounting on that would destroy and
   * rebuild every just-committed screen and its store.
   */
  retryEpoch: number;
  /** True while a cold load is walking the shell ladder in front of the scene rung. */
  startupActive: boolean;
  /** Index into SHELL_LADDER of the deepest rung already revealed; -1 before the first. */
  startupStage: number;
  startupReady: readonly ShellLayer[];
}

export type SceneAction =
  | { type: 'navigate'; destination: ScenePath; href: string }
  | { type: 'refresh-source'; scene: ScenePath }
  | { type: 'exit-finished'; generation: number }
  | { type: 'empty-slot-committed'; generation: number }
  | { type: 'destination-painted'; generation: number }
  | { type: 'entrance-finished'; generation: number }
  | { type: 'failed'; generation: number; error: Error }
  | { type: 'startup-ready'; generation: number; layer: ShellLayer }
  | { type: 'startup-reveal'; generation: number; layer: ShellLayer }
  | { type: 'startup-failed'; generation: number; error: Error }
  | { type: 'retry' };

const SETTLED_STAGE = SHELL_LADDER.length - 1;

/**
 * There is ONE cold-load lifecycle (ADR-0369).
 *
 * Passing `coldLoadHref` starts the shell ladder for whatever route the browser opened —
 * every route, not just the main menu, and not a separate branch from preparing the
 * initial scene. Omitting it means "already committed here", which is what the reducer's
 * own tests and any already-settled state want.
 */
export function initialSceneState(
  current: ScenePath,
  coldLoadHref: string | null = null,
): SceneState {
  const cold = coldLoadHref !== null;
  return {
    phase: cold ? 'startup' : 'current',
    current,
    destination: cold ? current : null,
    destinationHref: cold ? coldLoadHref : null,
    generation: 0,
    error: null,
    retryEpoch: 0,
    startupActive: cold,
    startupStage: cold ? -1 : SETTLED_STAGE,
    startupReady: [],
  };
}

/**
 * Pure authority for navigation loading. Timers and React commits may request
 * lifecycle actions, but only this reducer decides whether an action still belongs
 * to the latest destination generation.
 */
export function reduceScene(state: SceneState, action: SceneAction): SceneState {
  if (action.type === 'refresh-source') {
    if (state.phase === 'current' && action.scene.id === state.current.id) {
      return { ...state, current: action.scene };
    }
    if (state.destination && action.scene.id === state.destination.id) {
      return { ...state, destination: action.scene };
    }
    return state;
  }
  if (action.type === 'startup-ready') {
    if (!state.startupActive || action.generation !== state.generation || state.startupReady.includes(action.layer)) return state;
    return { ...state, startupReady: [...state.startupReady, action.layer] };
  }
  if (action.type === 'startup-reveal') {
    if (!state.startupActive || action.generation !== state.generation) return state;
    const next = SHELL_LADDER[state.startupStage + 1];
    if (action.layer !== next || !state.startupReady.includes(action.layer)) return state;
    const startupStage = state.startupStage + 1;
    // Opening the final rung hands the cold load to the ORDINARY entrance: the scene
    // body is painted and inert, and `entering` runs the same transition every
    // navigation runs. There is no separate startup completion.
    return startupStage === SETTLED_STAGE
      ? { ...state, startupStage, phase: 'entering' }
      : { ...state, startupStage };
  }
  if (action.type === 'startup-failed') {
    if (!state.startupActive || action.generation !== state.generation) return state;
    return { ...state, phase: 'error', error: action.error };
  }
  if (action.type === 'navigate') {
    // A cold load still owns a destination, and screens canonicalize their own address
    // while it prepares (the Level Editor resolves levelId -> opaque document; PlayMenu
    // resolves the hub root to a Continue choice). Swallowing those would strand the
    // ladder on a stale address, so a startup retarget re-runs the SCENE rung only and
    // leaves the shell rungs it has already climbed alone.
    if (state.startupActive) {
      if (!state.destination) return state;
      if (action.destination.id === state.destination.id && action.href === state.destinationHref) {
        return action.destination === state.destination
          ? state
          : { ...state, destination: action.destination };
      }
      return {
        ...state,
        phase: 'startup',
        destination: action.destination,
        destinationHref: action.href,
        generation: state.generation + 1,
        startupReady: state.startupReady.filter((layer) => layer !== 'scene'),
        startupStage: Math.min(state.startupStage, SETTLED_STAGE - 1),
        error: null,
      };
    }
    if (action.destination.id === state.current.id && state.phase === 'current') {
      return { ...state, current: action.destination };
    }
    if (state.destination && action.destination.id === state.destination.id) {
      if (action.href === state.destinationHref) {
        if (action.destination === state.destination) return state;
        return { ...state, destination: action.destination };
      }
      // A preparing scene may canonicalize its own address after resolving durable identity
      // (Level Editor: levelId -> opaque document; PlayMenu: hub root -> resumable Continue
      // choice). Keep the already-faded outgoing scene and retarget acquisition in place;
      // returning to `exiting` would visibly replay backwards.
      return {
        ...state,
        phase: state.phase === 'exiting' ? 'exiting' : 'loading',
        destination: action.destination,
        destinationHref: action.href,
        generation: state.generation + 1,
        error: null,
      };
    }
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
        retryEpoch: state.retryEpoch + 1,
        error: null,
        startupStage: -1,
        startupReady: [],
      };
    }
    if (!state.destination || !state.destinationHref || state.phase !== 'error') return state;
    return {
      ...state,
      phase: 'loading',
      generation: state.generation + 1,
      retryEpoch: state.retryEpoch + 1,
      error: null,
    };
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
  // On a cold load the same painted contract satisfies the ladder's final rung instead
  // of entering directly: the shell rungs in front of it must open first.
  if (action.type === 'destination-painted' && state.phase === 'startup' && state.startupActive) {
    if (state.startupReady.includes('scene')) return state;
    return { ...state, startupReady: [...state.startupReady, 'scene'] };
  }
  if (action.type === 'entrance-finished' && state.phase === 'entering' && state.destination) {
    return {
      ...state,
      phase: 'current',
      current: state.destination,
      destination: null,
      destinationHref: null,
      error: null,
      startupActive: false,
      startupStage: SETTLED_STAGE,
    };
  }
  if (action.type === 'failed' && (state.phase === 'loading' || state.phase === 'entering' || state.phase === 'startup')) {
    return { ...state, phase: 'error', error: action.error };
  }
  return state;
}
