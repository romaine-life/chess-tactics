import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import type { LipsanonId } from '../run/model';
import { LipsanonIcon } from './Lipsana';
import { SceneContinuityPortal, useSceneContinuityAvailable } from './shell/SceneContinuity';

/**
 * The lipsanon in transit — one lipsanon leaving where it was laid out and coming to rest wherever
 * it is now kept.
 *
 * Shared because there are two surfaces that need the SAME travel: Bona Vacantia, where
 * landing hands the take to either the Sectio or a target chooser, and the Studio's Lipsanon
 * Mat viewer, where landing is what the owner is judging. A second implementation for the
 * viewer would be a copy that drifts, and then the thing being tuned is not the thing that ships.
 */

/** How long a lipsanon spends travelling. */
export const LIPSANON_FLIGHT_MS = 560;

export interface LipsanonFlightPoint {
  left: number;
  top: number;
}

export interface LipsanonFlight {
  lipsanonId: LipsanonId;
  from: LipsanonFlightPoint;
  to: LipsanonFlightPoint;
}

export interface LipsanonFlightOptions {
  /** Keep the landed visual in the director-owned continuity layer until the
   * director settles the requested replacement or selection transition. */
  handoff?: 'landing' | 'scene-settled';
}

/**
 * Measure the slot a lipsanon is about to occupy. Callers render an empty placeholder at the end
 * of wherever lipsana are kept and hand it over — reading the real box beats recomputing the
 * geometry, because the layout that owns it is free to change without telling anyone.
 */
export function slotPoint(slot: Element | null): LipsanonFlightPoint | null {
  if (!slot) return null;
  const rect = slot.getBoundingClientRect();
  return { left: rect.left, top: rect.top };
}

export function useLipsanonFlight(
  onLanded: (lipsanonId: LipsanonId) => void,
  options: LipsanonFlightOptions = {},
): {
  /** The lipsanon currently travelling, or null. Callers dim the mat off this. */
  flight: LipsanonFlight | null;
  /**
   * Send a lipsanon. Returns false when there is nothing measurable to fly between, and the
   * caller should do whatever landing would have done, immediately.
   */
  launch: (lipsanonId: LipsanonId, icon: Element | null, to: LipsanonFlightPoint | null) => boolean;
  /** The travelling copy. Carried by the director, so render it at the source. */
  element: ReactElement | null;
} {
  const continuityAvailable = useSceneContinuityAvailable();
  const retainThroughSceneTransition = options.handoff === 'scene-settled';
  const [flight, setFlight] = useState<LipsanonFlight | null>(null);
  // A transition needs a frame with the start state applied before the end state arrives;
  // rendering the flight already landed would snap the lipsanon across with no travel.
  const [landed, setLanded] = useState(false);
  // Ordinary local handoffs drop the travelling copy the moment the caller owns the
  // landing. A scene-settled handoff deliberately keeps the landed copy: the incoming
  // scene's real owner is mounted but hidden during preparation, so releasing here creates
  // a visible hole until entrance begins.
  const [settled, setSettled] = useState(false);
  const settledRef = useRef(false);

  const commitRef = useRef<() => void>(() => {});
  commitRef.current = () => {
    if (settledRef.current || !flight) return;
    settledRef.current = true;
    if (!retainThroughSceneTransition) setSettled(true);
    onLanded(flight.lipsanonId);
    // A local landing clears in the same batch. A scene handoff remains at the exact
    // destination until the outgoing scene unmounts; by then the incoming strip is revealed
    // beneath it, so ownership changes without a blank frame or a perceptible duplicate.
    if (!retainThroughSceneTransition) setFlight(null);
  };
  const settle = useCallback(() => commitRef.current(), []);
  const releaseSettledHandoff = useCallback(() => {
    setSettled(true);
    setFlight(null);
  }, []);

  useEffect(() => {
    if (!flight) return undefined;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setLanded(true)));
    // transitionend is the real settle. The watchdog only guarantees the caller still hears
    // about it when the travel never completes — a backgrounded tab, an interrupted
    // transition.
    const watchdog = setTimeout(settle, LIPSANON_FLIGHT_MS + 240);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(watchdog);
    };
  }, [flight, settle]);

  const launch = useCallback((lipsanonId: LipsanonId, icon: Element | null, to: LipsanonFlightPoint | null): boolean => {
    if (flight) return true;
    if (!continuityAvailable) return false;
    const box = icon?.getBoundingClientRect();
    if (!box || !to) return false;
    settledRef.current = false;
    setLanded(false);
    setSettled(false);
    setFlight({ lipsanonId, from: { left: box.left, top: box.top }, to });
    return true;
  }, [continuityAvailable, flight]);

  const element = flight && !settled
    ? (
      <SceneContinuityPortal
        contribution={{ kind: 'shared-element', id: `lipsanon:${flight.lipsanonId}` }}
        onSceneSettled={retainThroughSceneTransition ? releaseSettledHandoff : undefined}
      >
        {/* Carried by the director so the travel is not clipped by what it leaves and
            its landed frame is not faded with either scene owner. */}
        <div
          className={`run-lipsanon-flight${landed ? ' is-landed' : ''}`}
          data-testid="run-lipsanon-flight"
          aria-hidden="true"
          style={{
            insetInlineStart: `${flight.from.left}px`,
            insetBlockStart: `${flight.from.top}px`,
            '--lipsanon-flight-x': `${flight.to.left - flight.from.left}px`,
            '--lipsanon-flight-y': `${flight.to.top - flight.from.top}px`,
            '--lipsanon-flight-duration': `${LIPSANON_FLIGHT_MS}ms`,
          } as CSSProperties}
          onTransitionEnd={(event) => {
            if (event.propertyName === 'translate') settle();
          }}
        >
          {/* The travel is one straight segment, owned entirely by the element above. This
              inner one carries only the size, shrinking out of the hover lift as it goes —
              scaling does not move the centre, so it cannot bend the line. */}
          <div className="run-lipsanon-flight-lift">
            <LipsanonIcon lipsanonId={flight.lipsanonId} />
          </div>
        </div>
      </SceneContinuityPortal>
    )
    : null;

  return { flight, launch, element };
}
