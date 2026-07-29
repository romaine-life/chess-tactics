import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { Level } from '../../core/level';
import { levelThumbnailUrl } from '../../net/levelThumbnails';
import { LevelThumbnail } from '../../render/LevelThumbnail';
import { useSceneParticipant } from './SceneBoundary';

interface ThumbnailGateValue {
  ready: (levelId: string) => void;
  failed: (levelId: string, error: Error) => void;
}

const ThumbnailGateContext = createContext<ThumbnailGateValue | null>(null);

export interface ThumbnailSurfaceState {
  complete: boolean;
  error: Error | null;
}

export function GatedLevelThumbnail(props: ComponentProps<typeof LevelThumbnail>): ReactElement {
  const gate = useContext(ThumbnailGateContext);
  return <LevelThumbnail {...props} onReady={gate?.ready} onError={gate?.failed} />;
}

/**
 * Atomic first-viewport list primitive shared by Play and Campaign Editor.
 *
 * Only rows intersecting the clipped scroll viewport are critical. LevelThumbnail's
 * wider IntersectionObserver margin remains opportunistic prefetch and can never
 * become an impossible requirement for a row clipped by its scroll ancestor.
 */
export function ThumbnailSurface({
  levels,
  participantId,
  viewportSelector,
  loadingLabel = 'Preparing level previews…',
  errorLabel = 'Level previews could not be loaded.',
  onStateChange,
  children,
}: {
  levels: readonly Level[];
  participantId: string;
  viewportSelector: string;
  loadingLabel?: string;
  errorLabel?: string;
  onStateChange?: (state: ThumbnailSurfaceState) => void;
  children: ReactNode;
}): ReactElement {
  const signature = levels.map((level) => `${level.id}:${levelThumbnailUrl(level.id) ?? JSON.stringify(level)}`).join('|');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [painted, setPainted] = useState<ReadonlySet<string>>(() => new Set());
  const [criticalIds, setCriticalIds] = useState<ReadonlySet<string> | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  useLayoutEffect(() => {
    setPainted(new Set());
    setCriticalIds(null);
    setFailure(null);
  }, [attempt, signature]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const viewport = root.closest(viewportSelector) ?? root;
    const bounds = viewport.getBoundingClientRect();
    const nodes = [...root.querySelectorAll<HTMLElement>('[data-level-thumbnail-id]')];
    const visible = nodes
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.bottom >= bounds.top && rect.top <= bounds.bottom;
      })
      .map((node) => node.dataset.levelThumbnailId)
      .filter((id): id is string => Boolean(id));
    // A zero-row surface is complete. If layout is temporarily unmeasurable,
    // require the first row rather than declaring a populated list complete.
    setCriticalIds(new Set(visible.length || nodes.length === 0
      ? visible
      : [nodes[0].dataset.levelThumbnailId].filter((id): id is string => Boolean(id))));
  }, [signature, viewportSelector]);

  const ready = useCallback((levelId: string) => {
    setPainted((current) => current.has(levelId) ? current : new Set([...current, levelId]));
  }, []);
  const failed = useCallback((_levelId: string, error: Error) => setFailure(error), []);
  const complete = criticalIds !== null && [...criticalIds].every((levelId) => painted.has(levelId));
  const state = { complete: complete && !failure, error: failure };
  useSceneParticipant(participantId, failure ? 'error' : complete ? 'painted' : 'loading', failure);

  useEffect(() => {
    onStateChange?.(state);
    return () => onStateChange?.({ complete: false, error: null });
  }, [complete, failure, onStateChange]);

  return (
    <ThumbnailGateContext.Provider value={{ ready, failed }}>
      <div
        ref={rootRef}
        className={`thumbnail-surface ${complete && !failure ? 'is-ready' : 'is-loading'} ${failure ? 'is-error' : ''}`.trim()}
      >
        <div
          className="thumbnail-surface-content"
          key={`${signature}:${attempt}`}
          aria-hidden={complete && !failure ? undefined : true}
          inert={!complete || failure ? true : undefined}
        >
          {children}
        </div>
        {!complete && !failure ? <div className="thumbnail-surface-status" role="status">{loadingLabel}</div> : null}
        {failure ? (
          <div className="thumbnail-surface-status" role="alert">
            <strong>{errorLabel}</strong>
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry</button>
          </div>
        ) : null}
      </div>
    </ThumbnailGateContext.Provider>
  );
}
