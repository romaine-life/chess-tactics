import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { ScenePhase } from './sceneDirector';

interface SceneContinuityHostValue {
  host: HTMLElement | null;
  phase: ScenePhase;
  generation: number;
}

const SceneContinuityHostContext = createContext<SceneContinuityHostValue>({
  host: null,
  phase: 'current',
  generation: 0,
});

/**
 * The director-owned visual layer for a shared element crossing scene ownership.
 *
 * It is deliberately outside every SceneBoundary, so the director's outgoing and
 * incoming opacity never touches a carried visual. The layer is inert and may host
 * only transient, non-interactive continuity; it is not another viewport or a way
 * for feature code to escape scene authority.
 */
export function SceneContinuityHost({
  children,
  phase,
  generation,
}: {
  children: ReactNode;
  phase: ScenePhase;
  generation: number;
}): ReactElement {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return (
    <SceneContinuityHostContext.Provider value={{ host, phase, generation }}>
      {children}
      <div
        ref={setHost}
        className="scene-continuity-layer"
        data-scene-continuity-host=""
        aria-hidden="true"
      />
    </SceneContinuityHostContext.Provider>
  );
}

export function useSceneContinuityAvailable(): boolean {
  return useContext(SceneContinuityHostContext).host !== null;
}

export interface SceneContinuityContribution {
  kind: 'shared-element';
  id: string;
}

/** The sole capability for contributing a visual to the director's continuity layer. */
export function SceneContinuityPortal({
  contribution,
  children,
  onSceneSettled,
}: {
  contribution: SceneContinuityContribution;
  children: ReactNode;
  /** Release retained carry paint only after a director transition has returned to current. */
  onSceneSettled?: () => void;
}): ReactElement | null {
  const { host, phase, generation } = useContext(SceneContinuityHostContext);
  const awaitingSettlement = useRef<number | null>(null);

  useEffect(() => {
    if (!onSceneSettled) return;
    if (phase !== 'current') {
      awaitingSettlement.current = generation;
      return;
    }
    if (awaitingSettlement.current === null) return;
    awaitingSettlement.current = null;
    onSceneSettled();
  }, [generation, onSceneSettled, phase]);

  return host ? createPortal(
    <div
      data-scene-continuity-contribution={contribution.id}
      data-scene-continuity-kind={contribution.kind}
    >
      {children}
    </div>,
    host,
  ) : null;
}
