import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { uiFadeTiming } from './motionTokens';

export interface SceneMotion {
  animate(
    element: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options?: number | KeyframeAnimationOptions,
  ): Animation | null;
}

export interface SceneEnteredActionScope extends SceneMotion {
  nextFrame(callback: () => void): () => void;
  after(delayMs: number, callback: () => void): () => void;
}

type SceneEnteredAction = (scope: SceneEnteredActionScope) => void | (() => void);
type SceneEntryMotion = (motion: SceneMotion) => void | (() => void);

interface EnteredActionRecord {
  action: SceneEnteredAction;
  cleanup: (() => void) | null;
  started: boolean;
}

export interface SceneActivityAuthority {
  readonly motion: SceneMotion;
  registerEntryMotion(id: string, motion: SceneEntryMotion): () => void;
  registerEnteredAction(id: string, action: SceneEnteredAction): () => void;
  holdPreparingMotion(root: HTMLElement): () => void;
  activate(): void;
  deactivate(): void;
  dispose(): void;
}

function animationTarget(animation: Animation): Element | null {
  const effect = animation.effect;
  return typeof KeyframeEffect !== 'undefined'
    && effect instanceof KeyframeEffect
    && effect.target instanceof Element
      ? effect.target
      : null;
}

function descendantAnimations(root: HTMLElement): Animation[] {
  if (typeof root.getAnimations !== 'function') return [];
  return root.getAnimations({ subtree: true }).filter((animation) => animationTarget(animation) !== root);
}

/**
 * One scene-owned authority for functional time.
 *
 * A destination is mounted while it is still only being painted and measured. That mount is not
 * permission to spend animation time. Entry actions remain registered but dormant, Web Animations
 * are held at their first frame, and descendant CSS motion is paused until the director commits
 * the scene as current.
 */
export function createSceneActivityAuthority(): SceneActivityAuthority {
  let active = false;
  let deactivated = false;
  let disposed = false;
  const enteredActions = new Map<string, EnteredActionRecord>();
  const entryMotions = new Map<string, () => void>();
  const heldAnimations = new Set<Animation>();
  const ownedAnimations = new Set<Animation>();

  const hold = (animation: Animation): void => {
    if (active || deactivated || disposed || animation.playState === 'finished' || animation.playState === 'idle') return;
    try {
      animation.pause();
      try {
        animation.currentTime = 0;
      } catch {
        // A timeline may be unresolved before its first sampled frame. Pause still
        // prevents it from spending time; its fill-backwards keyframe owns presentation.
      }
      heldAnimations.add(animation);
    } catch {
      // A browser may retire a transition between discovery and pause. It no longer has time to spend.
    }
  };

  const motion: SceneMotion = {
    animate(element, keyframes, options) {
      if (deactivated || disposed || typeof element.animate !== 'function') return null;
      const animation = element.animate(keyframes, options);
      ownedAnimations.add(animation);
      if (!active) hold(animation);
      void animation.finished
        .catch(() => undefined)
        .then(() => {
          heldAnimations.delete(animation);
          ownedAnimations.delete(animation);
        });
      return animation;
    },
  };

  const actionScope = (): { scope: SceneEnteredActionScope; cleanup: () => void } => {
    const animations = new Set<Animation>();
    const frames = new Set<number>();
    const timers = new Set<number>();
    const scope: SceneEnteredActionScope = {
      animate(element, keyframes, options) {
        const animation = motion.animate(element, keyframes, options);
        if (animation) animations.add(animation);
        return animation;
      },
      nextFrame(callback) {
        const frame = window.requestAnimationFrame(() => {
          frames.delete(frame);
          callback();
        });
        frames.add(frame);
        return () => {
          window.cancelAnimationFrame(frame);
          frames.delete(frame);
        };
      },
      after(delayMs, callback) {
        const timer = window.setTimeout(() => {
          timers.delete(timer);
          callback();
        }, delayMs);
        timers.add(timer);
        return () => {
          window.clearTimeout(timer);
          timers.delete(timer);
        };
      },
    };
    return {
      scope,
      cleanup: () => {
        animations.forEach((animation) => animation.cancel());
        frames.forEach((frame) => window.cancelAnimationFrame(frame));
        timers.forEach((timer) => window.clearTimeout(timer));
        animations.clear();
        frames.clear();
        timers.clear();
      },
    };
  };

  const start = (record: EnteredActionRecord): void => {
    if (!active || deactivated || disposed || record.started) return;
    record.started = true;
    const owned = actionScope();
    const suppliedCleanup = record.action(owned.scope);
    record.cleanup = () => {
      if (typeof suppliedCleanup === 'function') suppliedCleanup();
      owned.cleanup();
    };
  };

  return {
    motion,
    registerEntryMotion(id, prepare) {
      if (disposed) throw new Error('Cannot register motion with a disposed scene activity.');
      if (entryMotions.has(id) || enteredActions.has(id)) {
        throw new Error(`Scene activity "${id}" is already registered.`);
      }
      // Entry motion is constructed during preparation so its first keyframe owns the
      // element before reveal. SceneMotion freezes that animation at time zero; activation
      // releases the same animation instead of creating it after the scene is visible.
      const owned = actionScope();
      const suppliedCleanup = prepare(owned.scope);
      const cleanup = () => {
        if (typeof suppliedCleanup === 'function') suppliedCleanup();
        owned.cleanup();
      };
      entryMotions.set(id, cleanup);
      return () => {
        if (entryMotions.get(id) !== cleanup) return;
        cleanup();
        entryMotions.delete(id);
      };
    },
    registerEnteredAction(id, action) {
      if (disposed) throw new Error('Cannot register an action with a disposed scene activity.');
      if (enteredActions.has(id) || entryMotions.has(id)) {
        throw new Error(`Scene activity "${id}" is already registered.`);
      }
      const record: EnteredActionRecord = { action, cleanup: null, started: false };
      enteredActions.set(id, record);
      start(record);
      return () => {
        const current = enteredActions.get(id);
        if (current !== record) return;
        current.cleanup?.();
        current.cleanup = null;
        enteredActions.delete(id);
      };
    },
    holdPreparingMotion(root) {
      descendantAnimations(root).forEach(hold);
      const holdStartedMotion = (event: Event): void => {
        const target = event.target;
        if (!(target instanceof Element) || target === root || typeof target.getAnimations !== 'function') return;
        target.getAnimations().forEach(hold);
      };
      root.addEventListener('animationstart', holdStartedMotion, true);
      root.addEventListener('transitionrun', holdStartedMotion, true);
      return () => {
        root.removeEventListener('animationstart', holdStartedMotion, true);
        root.removeEventListener('transitionrun', holdStartedMotion, true);
      };
    },
    activate() {
      if (disposed || deactivated || active) return;
      active = true;
      heldAnimations.forEach((animation) => {
        try {
          animation.play();
        } catch {
          // A removed destination owns no visible motion to resume.
        }
      });
      heldAnimations.clear();
      enteredActions.forEach(start);
    },
    deactivate() {
      if (disposed || deactivated) return;
      active = false;
      deactivated = true;
      enteredActions.forEach((record) => {
        record.cleanup?.();
        record.cleanup = null;
      });
      entryMotions.forEach((cleanup) => cleanup());
      entryMotions.clear();
      ownedAnimations.forEach((animation) => animation.cancel());
      heldAnimations.clear();
      ownedAnimations.clear();
    },
    dispose() {
      if (disposed) return;
      enteredActions.forEach((record) => {
        record.cleanup?.();
        record.cleanup = null;
      });
      entryMotions.forEach((cleanup) => cleanup());
      ownedAnimations.forEach((animation) => animation.cancel());
      enteredActions.clear();
      entryMotions.clear();
      heldAnimations.clear();
      ownedAnimations.clear();
      active = false;
      disposed = true;
    },
  };
}

const SceneActivityContext = createContext<SceneActivityAuthority | null>(null);

export function SceneActivityProvider({
  authority,
  children,
}: {
  authority: SceneActivityAuthority;
  children: ReactNode;
}): ReactElement {
  return <SceneActivityContext.Provider value={authority}>{children}</SceneActivityContext.Provider>;
}

function useSceneActivityAuthority(): SceneActivityAuthority {
  const authority = useContext(SceneActivityContext);
  if (!authority) throw new Error('Scene activity requires a director-owned SceneBoundary.');
  return authority;
}

/** Register functional choreography; the director invokes it only after entrance has finished. */
export function useSceneEnteredAction(
  id: string,
  enabled: boolean,
  action: SceneEnteredAction,
): void {
  const authority = useSceneActivityAuthority();
  const actionRef = useRef(action);
  actionRef.current = action;
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    return authority.registerEnteredAction(id, (scope) => actionRef.current(scope));
  }, [authority, enabled, id]);
}

/** Build entry motion while hidden; the director holds its first frame and releases it at commit. */
export function useSceneEntryMotion(
  id: string,
  enabled: boolean,
  prepare: SceneEntryMotion,
): void {
  const authority = useSceneActivityAuthority();
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    return authority.registerEntryMotion(id, (motion) => prepareRef.current(motion));
  }, [authority, enabled, id]);
}

/** A tokenized, opacity-only entrance that survives the OS movement-reduction reset. */
export function useSceneOpacityEntrance(
  id: string,
  enabled: boolean,
  elementRef: RefObject<Element | null>,
): void {
  useSceneEntryMotion(id, enabled, (motion) => {
    const element = elementRef.current;
    if (!element) return undefined;
    const animation = motion.animate(
      element,
      [{ opacity: 0 }, { opacity: 1 }],
      uiFadeTiming(document.documentElement),
    );
    return () => animation?.cancel();
  });
}

/** The only application-facing owner of imperative Web Animations. */
export function useSceneMotion(): SceneMotion {
  return useSceneActivityAuthority().motion;
}
