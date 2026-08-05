import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { loadingError, loadingMark } from '../../diagnostics/loadingTimeline';
import { loadDecodedImage } from '../../render/imageResources';
import type { SceneManifest } from './sceneManifest';
import type { SceneHost, SceneOverlapScope } from './sceneManifest';
import { sceneTransitionTargetSelector } from './sceneTransitionTarget';
import {
  createSceneActivityAuthority,
  SceneActivityProvider,
} from './SceneActivity';
import type { ScenePhase } from './sceneDirector';

type ParticipantPhase = 'loading' | 'painted' | 'error';
interface Participant { phase: ParticipantPhase; error: Error | null }
interface SceneRegistration {
  report: (id: string, participant: Participant | null) => void;
}

const SceneRegistrationContext = createContext<SceneRegistration | null>(null);
const SceneActivationContext = createContext(true);
const SceneRevealContext = createContext(true);
const ScenePreparingRegionContext = createContext<SceneHost | null>(null);

/** True only after the director has committed and revealed this mounted scene. */
export function useSceneActivation(): boolean {
  return useContext(SceneActivationContext);
}

/**
 * Deactivates exactly the region the director is replacing.
 *
 * Activation gates gameplay and everything a screen contributes to the persistent
 * title bar. A layer preparing a WHOLE new scene is hidden and inert, so nothing in
 * it may contribute. But a host-preserving transition replaces only one named
 * region: the chrome around it is committed and on screen the entire time. Reading
 * activation off the layer suppressed that retained chrome too, which is why the
 * Battle title bar dropped its turn, clock, and objective chips for the length of
 * every navigation while the board behind them never moved (ADR-0213 keeps the bar
 * itself; this keeps what the retained host puts in it).
 *
 * Every authored scene slot wraps its children in this, so the preparing region is
 * still the one thing that cannot contribute.
 *
 * The providers are UNCONDITIONAL. Returning a bare fragment when this region is not
 * the preparing one changes the element type at this position, and React answers a
 * changed type by destroying the subtree and mounting a fresh one. That is exactly
 * what happens the instant the director commits an entrance: the region stops being
 * the preparing one, the just-revealed destination is thrown away and rebuilt, and its
 * PaintedSurfaceBoundary re-enters `is-loading` — one blank frame in the destination
 * column at the end of every menu navigation. Suppression is a VALUE, so it composes
 * with the ancestor rather than replacing it: a nested slot inside a preparing outer
 * region stays suppressed, which a hardcoded `true` here would silently undo.
 */
export function SceneSlotActivation({ region, children }: { region: SceneHost; children: ReactNode }): ReactElement {
  const preparingRegion = useContext(ScenePreparingRegionContext);
  const inheritedActivation = useContext(SceneActivationContext);
  const inheritedReveal = useContext(SceneRevealContext);
  const suppressed = preparingRegion === region;
  return (
    <SceneActivationContext.Provider value={inheritedActivation && !suppressed}>
      <SceneRevealContext.Provider value={inheritedReveal && !suppressed}>
        {children}
      </SceneRevealContext.Provider>
    </SceneActivationContext.Provider>
  );
}

/** True once the director has begun the authored entrance reveal. */
export function useSceneReveal(): boolean {
  return useContext(SceneRevealContext);
}

export function useSceneParticipant(id: string, phase: ParticipantPhase, error: Error | null = null): void {
  const registration = useContext(SceneRegistrationContext);
  useEffect(() => {
    if (!registration) return undefined;
    registration.report(id, { phase, error });
    return () => registration.report(id, null);
  }, [error, id, phase, registration]);
}

function imageUrls(root: HTMLElement): string[] {
  const urls = new Set<string>();
  const viewportMargin = 200;
  const isCriticalViewportElement = (element: HTMLElement): boolean => {
    if (element === root) return true;
    const rect = element.getBoundingClientRect();
    return rect.width > 0
      && rect.height > 0
      && rect.right >= -viewportMargin
      && rect.left <= window.innerWidth + viewportMargin
      && rect.bottom >= -viewportMargin
      && rect.top <= window.innerHeight + viewportMargin;
  };
  for (const image of root.querySelectorAll<HTMLImageElement>('img')) {
    if (!isCriticalViewportElement(image)) continue;
    if (image.currentSrc || image.src) urls.add(image.currentSrc || image.src);
  }
  const extract = (value: string): void => {
    for (const match of value.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      if (match[1]) urls.add(match[1]);
    }
  };
  for (const element of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    if (!isCriticalViewportElement(element)) continue;
    for (const pseudo of [null, '::before', '::after'] as const) {
      const style = getComputedStyle(element, pseudo);
      extract(style.backgroundImage);
      extract(style.borderImageSource);
      extract(style.maskImage);
      extract(style.getPropertyValue('-webkit-mask-image'));
    }
  }
  return [...urls];
}

const paintFrames = (): Promise<void> => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
});

interface SceneBoundaryProps {
  manifest: SceneManifest;
  generation: number;
  directorPhase: ScenePhase;
  preserveHost: boolean;
  transitionRegion: SceneHost | null;
  mountedKey: string;
  visualRole?: 'single' | 'outgoing' | 'incoming';
  /** How much of this layer the director's overlap transition may fade. */
  overlapScope?: SceneOverlapScope;
  children: ReactNode;
  onPainted: (generation: number) => void;
  onFailed: (generation: number, error: Error) => void;
}

export function sceneBoundaryLifecycle(
  directorPhase: ScenePhase,
  visualRole: 'single' | 'outgoing' | 'incoming',
): { preparing: boolean; revealing: boolean; deactivating: boolean } {
  const destinationPreparing = directorPhase === 'startup'
    || directorPhase === 'loading'
    || directorPhase === 'entering'
    || directorPhase === 'error';
  return {
    // An incoming overlap exists during the outgoing exit so it can paint and measure.
    // Its presence is not permission: it stays preparing through the entire entrance.
    preparing: visualRole === 'incoming'
      || (visualRole === 'single' && destinationPreparing),
    revealing: directorPhase === 'entering' && visualRole !== 'outgoing',
    deactivating: directorPhase !== 'current'
      && directorPhase !== 'startup'
      && (visualRole === 'outgoing' || (visualRole === 'single' && directorPhase === 'exiting')),
  };
}

export function SceneBoundary({
  manifest,
  generation,
  directorPhase,
  preserveHost,
  transitionRegion,
  mountedKey,
  visualRole = 'single',
  overlapScope = 'scene',
  children,
  onPainted,
  onFailed,
}: SceneBoundaryProps): ReactElement {
  const { preparing, revealing, deactivating } = sceneBoundaryLifecycle(directorPhase, visualRole);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sceneActivity = useMemo(
    () => createSceneActivityAuthority(),
    // One destination authority survives preparation -> entrance -> commit so it can release
    // the exact motion it held. A new generation prevents a retained React boundary from
    // carrying yesterday's active permission into a new preparation. `deactivating` splits a
    // host-preserved outgoing scene from the destination that later reuses its boundary.
    [deactivating, generation, manifest.id, mountedKey],
  );
  const participantsRef = useRef(new Map<string, Participant>());
  const [revision, setRevision] = useState(0);
  const report = useCallback((id: string, participant: Participant | null) => {
    if (participant) {
      const current = participantsRef.current.get(id);
      if (current?.phase === participant.phase && current.error === participant.error) return;
      participantsRef.current.set(id, participant);
      loadingMark(manifest.id, `participant-${participant.phase}`, { participant: id, generation });
    } else {
      if (!participantsRef.current.has(id)) return;
      participantsRef.current.delete(id);
      loadingMark(manifest.id, 'participant-released', { participant: id, generation });
    }
    setRevision((value) => value + 1);
  }, [generation, manifest.id]);
  const registration = useMemo(() => ({ report }), [report]);
  const participantSnapshot = [...participantsRef.current.entries()]
    .map(([id, participant]) => `${id}:${participant.phase}`)
    .sort();
  const unresolvedParticipants = participantSnapshot
    .filter((entry) => !entry.endsWith(':painted'))
    .map((entry) => entry.slice(0, entry.lastIndexOf(':')));

  useLayoutEffect(() => {
    if (deactivating) {
      sceneActivity.deactivate();
      return undefined;
    }
    if (!preparing) {
      sceneActivity.activate();
      return undefined;
    }
    const root = preserveHost && transitionRegion
      ? rootRef.current?.querySelector<HTMLElement>(sceneTransitionTargetSelector(transitionRegion)) ?? null
      : rootRef.current;
    return root ? sceneActivity.holdPreparingMotion(root) : undefined;
  }, [deactivating, preparing, preserveHost, sceneActivity, transitionRegion]);

  useEffect(() => () => sceneActivity.dispose(), [sceneActivity]);

  useLayoutEffect(() => {
    if (!preserveHost || !transitionRegion || !rootRef.current) return undefined;
    const target = rootRef.current.querySelector<HTMLElement>(
      sceneTransitionTargetSelector(transitionRegion),
    );
    if (!target) return undefined;
    target.setAttribute('data-scene-transition-active', '');
    return () => target.removeAttribute('data-scene-transition-active');
  }, [generation, mountedKey, preserveHost, transitionRegion]);

  useLayoutEffect(() => {
    if (!preparing || !preserveHost || !transitionRegion || !rootRef.current) return undefined;
    const region = rootRef.current.querySelector<HTMLElement>(
      sceneTransitionTargetSelector(transitionRegion),
    );
    if (!region) return undefined;
    region.inert = true;
    region.setAttribute('aria-hidden', 'true');
    return () => {
      region.inert = false;
      region.removeAttribute('aria-hidden');
    };
  }, [mountedKey, preparing, preserveHost, transitionRegion]);

  useLayoutEffect(() => {
    if (!deactivating || !rootRef.current) return undefined;
    const target = preserveHost && transitionRegion
      ? rootRef.current.querySelector<HTMLElement>(sceneTransitionTargetSelector(transitionRegion))
      : rootRef.current;
    if (!target) return undefined;
    target.inert = true;
    target.setAttribute('aria-hidden', 'true');
    return () => {
      target.inert = false;
      target.removeAttribute('aria-hidden');
    };
  }, [deactivating, mountedKey, preserveHost, transitionRegion]);

  useEffect(() => {
    if (!preparing || !rootRef.current) return undefined;
    let cancelled = false;
    const participants = [...participantsRef.current.entries()];
    const requiredOwner = manifest.paintOwner === 'dom'
      ? null
      : participantsRef.current.get(manifest.paintOwner);
    if (manifest.paintOwner !== 'dom' && !requiredOwner) return undefined;
    const failed = participants.find(([, value]) => value.phase === 'error');
    if (failed) {
      const error = failed[1].error ?? new Error(`${failed[0]} failed`);
      loadingError(manifest.id, `scene-participant:${failed[0]}`, error);
      onFailed(generation, error);
      return undefined;
    }
    if (participants.some(([, value]) => value.phase !== 'painted')) return undefined;

    // Two frames allow every child layout effect to register its critical participant.
    // Then the boundary decodes the pixels actually referenced by this scene and waits
    // for two browser paint opportunities. A missing participant cannot be invented by
    // elapsed time; route families with async work must register an owner.
    const root = preserveHost && transitionRegion
      ? rootRef.current.querySelector<HTMLElement>(sceneTransitionTargetSelector(transitionRegion))
      : rootRef.current;
    if (!root) return undefined;
    void paintFrames()
      .then(() => {
        // A declared critical participant that never registered is a BROKEN DECLARATION,
        // not a resource to wait on: waiting hangs the scene forever, and ignoring it is
        // exactly how six declared ids decayed into comments while nothing checked them
        // (ADR-0369). Checked after two frames, so every child layout effect — including a
        // subtree that only just mounted — has had its chance to register; a registration
        // that lands later bumps `revision` and restarts this pass from the top.
        const missing = manifest.critical.filter((id) => !participantsRef.current.has(id));
        if (missing.length > 0) {
          throw new Error(
            `scene ${manifest.id} declares critical participants that never registered: ${missing.join(', ')}`,
          );
        }
      })
      .then(() => Promise.all(imageUrls(root).map((url) => loadDecodedImage(url))))
      .then(paintFrames)
      .then(() => {
        if (cancelled) return;
        loadingMark(manifest.id, 'scene-painted', {
          generation,
          participants: participants.length,
          critical: manifest.critical.length,
        });
        onPainted(generation);
      })
      .catch((value: unknown) => {
        if (cancelled) return;
        const error = value instanceof Error ? value : new Error(String(value));
        loadingError(manifest.id, 'scene-paint-failed', error);
        onFailed(generation, error);
      });
    return () => { cancelled = true; };
  }, [generation, manifest, onFailed, onPainted, preparing, preserveHost, revision, transitionRegion]);

  return (
    // A host-preserving layer keeps its retained chrome activated and revealed; only
    // the region named below stands down, through SceneSlotActivation.
    <SceneActivationContext.Provider value={!preparing || preserveHost}>
      <SceneRevealContext.Provider value={!preparing || preserveHost || revealing}>
        <ScenePreparingRegionContext.Provider value={preparing && preserveHost ? transitionRegion : null}>
        <SceneRegistrationContext.Provider value={registration}>
        <SceneActivityProvider authority={sceneActivity}>
          <div
          ref={rootRef}
          className={`scene-boundary scene-transition-target${preparing ? preserveHost ? ' is-region-preparing' : ' is-preparing' : ' is-current'}`}
          data-scene-transition-target="scene-root"
          data-scene-transition-mode="self"
          data-scene-transition-active={!preserveHost && visualRole !== 'outgoing' ? '' : undefined}
          data-scene={manifest.id}
          data-scene-generation={generation}
          data-scene-participants={participantSnapshot.join(',')}
          data-scene-unresolved={unresolvedParticipants.join(',')}
          data-transition-region={transitionRegion ?? undefined}
          data-scene-visual-role={visualRole}
          data-scene-overlap-scope={overlapScope === 'scene' ? undefined : overlapScope}
          inert={preparing && !preserveHost ? true : undefined}
          aria-hidden={preparing && !preserveHost || undefined}
          >
            {children}
          </div>
        </SceneActivityProvider>
        </SceneRegistrationContext.Provider>
        </ScenePreparingRegionContext.Provider>
      </SceneRevealContext.Provider>
    </SceneActivationContext.Provider>
  );
}
