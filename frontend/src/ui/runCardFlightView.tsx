import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import type { RunCardDefinition, RunCardOffer } from '../run/model';
import { RunCard } from './RunCard';
import { SceneContinuityPortal, useSceneContinuityAvailable } from './shell/SceneContinuity';

/** The shared functional-transfer beat used by a card travelling into the Chartulary. */
export const RUN_CARD_FLIGHT_MS = 560;

/**
 * Any card face admission can send. A Sectio purchase carries its offer identity; the Run's
 * opening grant admits a core card straight from the deck, and both travel the same way.
 */
export type RunFlightCard = RunCardDefinition | RunCardOffer;

function flightCardKey(card: RunFlightCard): string {
  return 'offerId' in card ? card.offerId : card.id;
}

export interface RunCardFlightOptions {
  /**
   * Hold the landed card in the director-owned continuity layer until the director settles
   * the transition the admission requested. An admission that ends its own phase otherwise
   * releases into an incoming scene that is mounted but still hidden while it prepares, and
   * the card disappears for that interval (ADR-0385).
   */
  handoff?: 'landing' | 'scene-settled';
}

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
  offer: RunFlightCard;
  geometry: RunCardFlightGeometry;
}

/**
 * One presentation-only card flight. Its transaction is already complete, so settling
 * only removes these pixels and never gates or mutates the Run.
 */
function RunCardFlightVisual({
  flight,
  retain,
  onSettled,
}: {
  flight: RunCardFlight;
  /**
   * Let the director decide when this carry is over. A retained flight keeps painting at
   * its destination after travel ends, and the incoming scene reveals its canonical card
   * underneath before the carried copy is released.
   */
  retain: boolean;
  onSettled: (id: string) => void;
}): ReactElement {
  const [landed, setLanded] = useState(false);
  const settledRef = useRef(false);
  const settle = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    onSettled(flight.id);
  }, [flight.id, onSettled]);
  // Travel ending is the whole story only for a flight that stays in its own scene. A
  // retained carry ignores its own landing and waits for the director instead.
  const settleOnLanding = useCallback(() => {
    if (!retain) settle();
  }, [retain, settle]);

  useEffect(() => {
    let innerRaf: number | null = null;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => setLanded(true));
    });
    const watchdog = setTimeout(settleOnLanding, RUN_CARD_FLIGHT_MS + 240);
    return () => {
      cancelAnimationFrame(outerRaf);
      if (innerRaf !== null) cancelAnimationFrame(innerRaf);
      clearTimeout(watchdog);
    };
  }, [settleOnLanding]);

  return (
    <SceneContinuityPortal
      contribution={{ kind: 'shared-element', id: `card:${flight.id}` }}
      onSceneSettled={retain ? settle : undefined}
    >
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
          if (event.target === event.currentTarget && event.propertyName === 'translate') settleOnLanding();
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
export function useRunCardFlights(options: RunCardFlightOptions = {}): {
  launch: (offer: RunFlightCard, source: Element | null, target: Element | null) => boolean;
  element: ReactElement | null;
} {
  const continuityAvailable = useSceneContinuityAvailable();
  const retain = options.handoff === 'scene-settled';
  const [flights, setFlights] = useState<RunCardFlight[]>([]);
  const nextFlightSequenceRef = useRef(0);
  const settle = useCallback((id: string): void => {
    setFlights((current) => current.filter((flight) => flight.id !== id));
  }, []);

  const launch = useCallback((offer: RunFlightCard, source: Element | null, target: Element | null): boolean => {
    if (!continuityAvailable) return false;
    const sourceRect = source?.getBoundingClientRect();
    const targetRect = target?.getBoundingClientRect();
    if (!sourceRect || !targetRect) return false;
    const geometry = runCardFlightGeometry(sourceRect, targetRect);
    if (!geometry) return false;
    nextFlightSequenceRef.current += 1;
    const id = `${flightCardKey(offer)}:${nextFlightSequenceRef.current}`;
    setFlights((current) => [...current, { id, offer, geometry }]);
    return true;
  }, [continuityAvailable]);

  const element = flights.length
    ? (
      <>
        {flights.map((flight) => (
          <RunCardFlightVisual key={flight.id} flight={flight} retain={retain} onSettled={settle} />
        ))}
      </>
    )
    : null;

  return { launch, element };
}
