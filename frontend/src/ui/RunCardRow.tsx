import { useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import {
  RUN_CARD_ROW_SIZING_DEFAULTS,
  runCardRowCardHeight,
  runCardRowCardWidth,
  type RunCardRowBox,
  type RunCardRowSizing,
} from './runCardRowSizing';

/**
 * The Run's card row, shared by the Bona Vacantia grant and the Sectio offers.
 *
 * Both screens exist to be decided on, so the row measures the lane it was given
 * and prints the largest 5:7 face that fits it in both axes, up to the tuned
 * maximum (Studio → Card Size). Until the box is measured — and anywhere
 * ResizeObserver is absent — the shared `.run-card-grid` ladder still lays the
 * row out, so a card is never missing, only unsized.
 */
export function RunCardRow({
  count,
  testId,
  sizing = RUN_CARD_ROW_SIZING_DEFAULTS,
  children,
}: {
  count: number;
  testId?: string;
  sizing?: RunCardRowSizing;
  children: ReactNode;
}): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<RunCardRowBox>({ width: 0, height: 0 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setBox({
        width: Math.max(0, Math.floor(entry.contentRect.width)),
        height: Math.max(0, Math.floor(entry.contentRect.height)),
      });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const cardWidth = runCardRowCardWidth({ count, box, sizing });
  // The row's own box never depends on the track width — the lane owns both
  // axes — so sizing the tracks from the measured box cannot feed back.
  const style = cardWidth > 0
    ? { gap: `${sizing.gap}px`, gridTemplateColumns: `repeat(${count}, ${cardWidth}px)` } as CSSProperties
    : undefined;

  return (
    <div
      className="run-card-grid run-card-row"
      data-testid={testId}
      data-run-card-width={cardWidth > 0 ? cardWidth : undefined}
      data-run-card-height={cardWidth > 0 ? runCardRowCardHeight(cardWidth) : undefined}
      ref={hostRef}
      style={style}
    >
      {children}
    </div>
  );
}
