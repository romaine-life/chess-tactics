import {
  createContext,
  useContext,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

const SceneContinuityHostContext = createContext<HTMLElement | null>(null);

/**
 * The director-owned visual layer for a shared element crossing scene ownership.
 *
 * It is deliberately outside every SceneBoundary, so the director's outgoing and
 * incoming opacity never touches a carried visual. The layer is inert and may host
 * only transient, non-interactive continuity; it is not another viewport or a way
 * for feature code to escape scene authority.
 */
export function SceneContinuityHost({ children }: { children: ReactNode }): ReactElement {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return (
    <SceneContinuityHostContext.Provider value={host}>
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
  return useContext(SceneContinuityHostContext) !== null;
}

export interface SceneContinuityContribution {
  kind: 'shared-element';
  id: string;
}

/** The sole capability for contributing a visual to the director's continuity layer. */
export function SceneContinuityPortal({
  contribution,
  children,
}: {
  contribution: SceneContinuityContribution;
  children: ReactNode;
}): ReactElement | null {
  const host = useContext(SceneContinuityHostContext);
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
