import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { loadingError, loadingMark } from '../../diagnostics/loadingTimeline';
import { loadDecodedImage } from '../../render/imageResources';
import type { SceneManifest } from './sceneManifest';

type ParticipantPhase = 'loading' | 'painted' | 'error';
interface Participant { phase: ParticipantPhase; error: Error | null }
interface SceneRegistration {
  report: (id: string, participant: Participant | null) => void;
}

const SceneRegistrationContext = createContext<SceneRegistration | null>(null);

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
  preparing: boolean;
  preserveHost: boolean;
  children: ReactNode;
  onPainted: (generation: number) => void;
  onFailed: (generation: number, error: Error) => void;
}

export function SceneBoundary({
  manifest,
  generation,
  preparing,
  preserveHost,
  children,
  onPainted,
  onFailed,
}: SceneBoundaryProps): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null);
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
    const root = preserveHost
      ? rootRef.current.querySelector<HTMLElement>('[data-scene-region]')
      : rootRef.current;
    if (!root) return undefined;
    void paintFrames()
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
  }, [generation, manifest, onFailed, onPainted, preparing, preserveHost, revision]);

  return (
    <SceneRegistrationContext.Provider value={registration}>
      <div
        ref={rootRef}
        className={`scene-boundary${preparing ? preserveHost ? ' is-region-preparing' : ' is-preparing' : ' is-current'}`}
        data-scene={manifest.id}
        data-scene-generation={generation}
        data-scene-participants={participantSnapshot.join(',')}
        data-scene-unresolved={unresolvedParticipants.join(',')}
        inert={preparing ? true : undefined}
        aria-hidden={preparing && !preserveHost || undefined}
      >
        {children}
      </div>
    </SceneRegistrationContext.Provider>
  );
}
