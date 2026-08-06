import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import type { RunCardOffer } from '../run/model';
import { RunCard } from './RunCard';
import { SceneContinuityPortal, useSceneContinuityAvailable } from './shell/SceneContinuity';

/** The shared functional-transfer beat used by a card travelling into the Chartulary. */
export const RUN_CARD_FLIGHT_MS = 560;

export interface RunCardFlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RunCardFlightGeometry {
  from: RunCardFlightRect;
  x: number;
  y: number;
  scale: number;
}

/** Reads a CSS duration token for the Web Animations API without duplicating its value in JS. */
export function runCardMotionDurationMs(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(value.trim());
  if (!match) return null;
  const duration = Number(match[1]) * (match[2] === 's' ? 1000 : 1);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

export function runCardFlightGeometry(
  from: RunCardFlightRect,
  to: RunCardFlightRect,
): RunCardFlightGeometry | null {
  if (from.width <= 0 || from.height <= 0 || to.width <= 0 || to.height <= 0) return null;
  const fromCenterX = from.left + from.width / 2;
  const fromCenterY = from.top + from.height / 2;
  const toCenterX = to.left + to.width / 2;
  const toCenterY = to.top + to.height / 2;
  return {
    from,
    x: toCenterX - fromCenterX,
    y: toCenterY - fromCenterY,
    // Leave a sliver of the destination mark visible around the arriving card.
    scale: Math.min(to.width / from.width, to.height / from.height) * 0.82,
  };
}

interface RunCardFlight {
  id: string;
  offer: RunCardOffer;
  geometry: RunCardFlightGeometry;
}

/**
 * One presentation-only card flight. Its transaction is already complete, so settling
 * only removes these pixels and never gates or mutates the Run.
 */
function RunCardFlightVisual({
  flight,
  onSettled,
}: {
  flight: RunCardFlight;
  onSettled: (id: string) => void;
}): ReactElement {
  const [landed, setLanded] = useState(false);
  const settledRef = useRef(false);
  const settle = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    onSettled(flight.id);
  }, [flight.id, onSettled]);

  useEffect(() => {
    let innerRaf: number | null = null;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => setLanded(true));
    });
    const watchdog = setTimeout(settle, RUN_CARD_FLIGHT_MS + 240);
    return () => {
      cancelAnimationFrame(outerRaf);
      if (innerRaf !== null) cancelAnimationFrame(innerRaf);
      clearTimeout(watchdog);
    };
  }, [settle]);

  return (
    <SceneContinuityPortal contribution={{ kind: 'shared-element', id: `card:${flight.id}` }}>
      <div
        className={`run-card-flight${landed ? ' is-landed' : ''}`}
        data-testid="run-card-flight"
        aria-hidden="true"
        style={{
          insetInlineStart: `${flight.geometry.from.left}px`,
          insetBlockStart: `${flight.geometry.from.top}px`,
          inlineSize: `${flight.geometry.from.width}px`,
          blockSize: `${flight.geometry.from.height}px`,
          '--run-card-flight-x': `${flight.geometry.x}px`,
          '--run-card-flight-y': `${flight.geometry.y}px`,
          '--run-card-flight-scale': flight.geometry.scale,
        } as CSSProperties}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === 'translate') settle();
        }}
      >
        <RunCard card={flight.offer} mode="reference" />
      </div>
    </SceneContinuityPortal>
  );
}

/**
 * Sends canonical live card faces from their measured Sectio seats to the measured
 * Chartulary shortcut. Each launch is independent: presentation from an earlier
 * Adlectio keeps running while later interactions and flights proceed.
 */
export function useRunCardFlights(): {
  launch: (offer: RunCardOffer, source: Element | null, target: Element | null) => boolean;
  element: ReactElement | null;
} {
  const continuityAvailable = useSceneContinuityAvailable();
  const [flights, setFlights] = useState<RunCardFlight[]>([]);
  const nextFlightSequenceRef = useRef(0);
  const settle = useCallback((id: string): void => {
    setFlights((current) => current.filter((flight) => flight.id !== id));
  }, []);

  const launch = useCallback((offer: RunCardOffer, source: Element | null, target: Element | null): boolean => {
    if (!continuityAvailable) return false;
    const sourceRect = source?.getBoundingClientRect();
    const targetRect = target?.getBoundingClientRect();
    if (!sourceRect || !targetRect) return false;
    const geometry = runCardFlightGeometry(sourceRect, targetRect);
    if (!geometry) return false;
    nextFlightSequenceRef.current += 1;
    const id = `${offer.offerId}:${nextFlightSequenceRef.current}`;
    setFlights((current) => [...current, { id, offer, geometry }]);
    return true;
  }, [continuityAvailable]);

  const element = flights.length
    ? (
      <>
        {flights.map((flight) => (
          <RunCardFlightVisual key={flight.id} flight={flight} onSettled={settle} />
        ))}
      </>
    )
    : null;

  return { launch, element };
}
