import { useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import {
  RUN_CARD_ROW_SIZING_DEFAULTS,
  runCardRowCardHeight,
  runCardRowFit,
  runCardRowSizingFromStyle,
  sameRunCardRowSizing,
  type RunCardRowBox,
  type RunCardRowSizing,
} from './runCardRowSizing';

/**
 * The tuning this row prints at: the Git-owned baseline, overridden by any
 * audition custom properties currently set on the row. The Studio's Card Size
 * instrument injects a stylesheet into the live Run route it previews, so this
 * re-reads whenever a stylesheet is added or rewritten — the same same-origin
 * handshake the other dressing rooms use, with no runtime seam of its own.
 *
 * Unchanged numbers cost a computed-style read and nothing else, so ordinary
 * head churn (a dev-server style swap) never re-renders the row.
 */
function useAuditionedSizing(host: HTMLElement | null): RunCardRowSizing {
  const [tuning, setTuning] = useState<RunCardRowSizing>({ ...RUN_CARD_ROW_SIZING_DEFAULTS });
  useEffect(() => {
    const read = (): void => {
      const next = runCardRowSizingFromStyle(
        host && typeof getComputedStyle === 'function' ? getComputedStyle(host) : null,
      );
      setTuning((current) => (sameRunCardRowSizing(current, next) ? current : next));
    };
    read();
    if (typeof MutationObserver === 'undefined' || !document.head) return undefined;
    const observer = new MutationObserver(read);
    observer.observe(document.head, { characterData: true, childList: true, subtree: true });
    return () => observer.disconnect();
  }, [host]);
  return tuning;
}

/**
 * The Run's card row, shared by the Bona Vacantia grant and the Sectio offers.
 *
 * Both screens exist to be decided on, so the row measures the lane it was given
 * and prints the tuned share of the largest 5:7 face that fits it in both axes.
 * Until the box is measured — and anywhere ResizeObserver is absent — the shared
 * `.run-card-grid` ladder still lays the row out, so a card is never missing,
 * only unsized.
 */
export function RunCardRow({
  count,
  testId,
  sizing,
  children,
}: {
  count: number;
  testId?: string;
  /** Fixed tuning, for a surface that is auditioning one directly rather than through CSS. */
  sizing?: RunCardRowSizing;
  children: ReactNode;
}): ReactElement {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState<RunCardRowBox>({ width: 0, height: 0 });
  const boxRef = useRef(box);
  boxRef.current = box;

  useEffect(() => {
    if (!host || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const next = {
        width: Math.max(0, Math.floor(entry.contentRect.width)),
        height: Math.max(0, Math.floor(entry.contentRect.height)),
      };
      if (next.width !== boxRef.current.width || next.height !== boxRef.current.height) setBox(next);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [host]);

  const audition = useAuditionedSizing(host);
  const tuning = sizing ?? audition;
  const fit = runCardRowFit({ count, box, sizing: tuning });
  // The row's own box never depends on the track width — the lane owns both
  // axes — so sizing the tracks from the measured box cannot feed back.
  const style = fit.cardWidth > 0
    ? { gap: `${tuning.gap}px`, gridTemplateColumns: `repeat(${count}, ${fit.cardWidth}px)` } as CSSProperties
    : undefined;

  return (
    <div
      className="run-card-grid run-card-row"
      data-testid={testId}
      data-run-card-width={fit.cardWidth > 0 ? fit.cardWidth : undefined}
      data-run-card-height={fit.cardWidth > 0 ? runCardRowCardHeight(fit.cardWidth) : undefined}
      data-run-card-bound-by={fit.cardWidth > 0 ? fit.boundBy : undefined}
      ref={setHost}
      style={style}
    >
      {children}
    </div>
  );
}
