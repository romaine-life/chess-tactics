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

export interface RunCardReflowOffset {
  x: number;
  y: number;
}

/**
 * FLIP's inverse step: after layout commits the destination seat, translate a
 * surviving card back over its previous seat and let the UI settle it to zero.
 */
export function runCardReflowOffset(
  from: RunCardFlightRect,
  to: RunCardFlightRect,
): RunCardReflowOffset | null {
  if (from.width <= 0 || from.height <= 0 || to.width <= 0 || to.height <= 0) return null;
  return {
    x: from.left - to.left,
    y: from.top - to.top,
  };
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
  offer: RunCardOffer;
  geometry: RunCardFlightGeometry;
}

/**
 * Sends the canonical live card face from its measured Shop seat to the measured
 * Chartulary shortcut. The portal escapes the Shop scroller and the flight commits
 * only on landing, so the source cannot disappear before the player sees where it went.
 */
export function useRunCardFlight(onLanded: (offer: RunCardOffer) => void): {
  flight: RunCardFlight | null;
  launch: (offer: RunCardOffer, source: Element | null, target: Element | null) => boolean;
  element: ReactElement | null;
} {
  const continuityAvailable = useSceneContinuityAvailable();
  const [flight, setFlight] = useState<RunCardFlight | null>(null);
  const [landed, setLanded] = useState(false);
  const settledRef = useRef(false);
  const flightRef = useRef<RunCardFlight | null>(null);
  flightRef.current = flight;
  const onLandedRef = useRef(onLanded);
  onLandedRef.current = onLanded;

  const settle = useCallback(() => {
    const current = flightRef.current;
    if (!current || settledRef.current) return;
    settledRef.current = true;
    onLandedRef.current(current.offer);
    setFlight(null);
  }, []);

  useEffect(() => {
    if (!flight) return undefined;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setLanded(true)));
    const watchdog = setTimeout(settle, RUN_CARD_FLIGHT_MS + 240);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(watchdog);
    };
  }, [flight, settle]);

  const launch = useCallback((offer: RunCardOffer, source: Element | null, target: Element | null): boolean => {
    if (flightRef.current) return true;
    if (!continuityAvailable) return false;
    const sourceRect = source?.getBoundingClientRect();
    const targetRect = target?.getBoundingClientRect();
    if (!sourceRect || !targetRect) return false;
    const geometry = runCardFlightGeometry(sourceRect, targetRect);
    if (!geometry) return false;
    settledRef.current = false;
    setLanded(false);
    setFlight({ offer, geometry });
    return true;
  }, [continuityAvailable]);

  const element = flight
    ? (
      <SceneContinuityPortal contribution={{ kind: 'shared-element', id: `card:${flight.offer.offerId}` }}>
      <>
        <div className="run-card-flight-shield" aria-hidden="true" />
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
            if (event.propertyName === 'translate') settle();
          }}
        >
          <RunCard card={flight.offer} mode="reference" />
        </div>
      </>
      </SceneContinuityPortal>
    )
    : null;

  return { flight, launch, element };
}
