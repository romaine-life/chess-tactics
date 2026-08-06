import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { SceneContinuityPortal, useSceneContinuityAvailable } from './shell/SceneContinuity';

interface RunUnitDeparture {
  id: string;
  unitId: string;
  src: string;
  filter: string;
  rect: Readonly<{ left: number; top: number; width: number; height: number }>;
}

function RunUnitDepartureVisual({
  departure,
  onSettled,
}: {
  departure: RunUnitDeparture;
  onSettled: (id: string) => void;
}): ReactElement {
  const [departed, setDeparted] = useState(false);
  const settledRef = useRef(false);
  const settle = useCallback((): void => {
    if (settledRef.current) return;
    settledRef.current = true;
    onSettled(departure.id);
  }, [departure.id, onSettled]);

  useEffect(() => {
    let innerFrame: number | null = null;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => setDeparted(true));
    });
    const watchdog = window.setTimeout(settle, 800);
    return () => {
      cancelAnimationFrame(outerFrame);
      if (innerFrame !== null) cancelAnimationFrame(innerFrame);
      window.clearTimeout(watchdog);
    };
  }, [settle]);

  return (
    <SceneContinuityPortal contribution={{ kind: 'shared-element', id: `alienatio-unit:${departure.id}` }}>
      <img
        className={`run-unit-departure${departed ? ' is-departed' : ''}`}
        data-run-unit-departure={departure.unitId}
        src={departure.src}
        alt=""
        draggable={false}
        aria-hidden="true"
        style={{
          insetInlineStart: `${departure.rect.left}px`,
          insetBlockStart: `${departure.rect.top}px`,
          inlineSize: `${departure.rect.width}px`,
          blockSize: `${departure.rect.height}px`,
          filter: departure.filter,
        } as CSSProperties}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === 'opacity') settle();
        }}
      />
    </SceneContinuityPortal>
  );
}

/** Presentation-only Alienatio departures; gameplay commits before these pixels settle. */
export function useRunUnitDepartures(): {
  launch: (unitId: string, source: HTMLImageElement | null) => boolean;
  element: ReactElement | null;
} {
  const continuityAvailable = useSceneContinuityAvailable();
  const [departures, setDepartures] = useState<RunUnitDeparture[]>([]);
  const sequenceRef = useRef(0);
  const settle = useCallback((id: string): void => {
    setDepartures((current) => current.filter((departure) => departure.id !== id));
  }, []);

  const launch = useCallback((unitId: string, source: HTMLImageElement | null): boolean => {
    if (!continuityAvailable || !source) return false;
    const rect = source.getBoundingClientRect();
    const src = source.currentSrc || source.src;
    if (!src || rect.width <= 0 || rect.height <= 0) return false;
    sequenceRef.current += 1;
    const id = `${unitId}:${sequenceRef.current}`;
    const filter = getComputedStyle(source).filter;
    setDepartures((current) => [...current, {
      id,
      unitId,
      src,
      filter,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    }]);
    return true;
  }, [continuityAvailable]);

  const element = departures.length ? (
    <>
      {departures.map((departure) => (
        <RunUnitDepartureVisual key={departure.id} departure={departure} onSettled={settle} />
      ))}
    </>
  ) : null;

  return { launch, element };
}
