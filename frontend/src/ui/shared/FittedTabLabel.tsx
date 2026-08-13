import { useLayoutEffect, useRef, type ReactElement } from 'react';

const FIT_ITERATIONS = 8;
const DEFAULT_MIN_FONT_SIZE = 8;

/**
 * Read ONCE, at import time, when the document is small and nothing is waiting to paint.
 *
 * `document.fonts.ready` is not a free property read: it makes the font set settle its state,
 * which forces a style recalc over the whole document. Reading it inside each label's layout
 * effect meant every mount paid that recalc against whatever had just been inserted — and a
 * label mounts alongside destinations like the Enchiridion's 284-card gallery, inside a commit
 * the browser cannot paint through. It measured ~500ms there, on a call whose only purpose is
 * "refit after webfonts land". Fonts become ready once per document, not once per label.
 */
const FONTS_READY: Promise<unknown> = typeof document !== 'undefined' && document.fonts
  ? document.fonts.ready
  : Promise.resolve();

/**
 * `className` is for a surface that mounts this box OUTSIDE a rail tab — the committing verb's
 * band (ADR-0638), which wants the same fitter and the same box and states its own type. The
 * `settings-tab-label` class stays either way: it is what the box IS, and the fitter's geometry
 * comes from it.
 */
export function FittedTabLabel({ children, className }: {
  children: string;
  className?: string;
}): ReactElement {
  const boxRef = useRef<HTMLSpanElement | null>(null);
  const textRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;

    let frame = 0;
    let cancelled = false;

    const fit = (): void => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (cancelled) return;

        text.style.fontSize = '';
        const computed = window.getComputedStyle(text);
        const max = Number.parseFloat(computed.fontSize);
        const minProp = Number.parseFloat(computed.getPropertyValue('--settings-tab-label-min-font-size'));
        const min = Number.isFinite(minProp) && minProp > 0 ? minProp : DEFAULT_MIN_FONT_SIZE;
        const boxWidth = box.clientWidth;
        const boxHeight = box.clientHeight;

        if (!boxWidth || !boxHeight || !Number.isFinite(max) || max <= 0) return;

        const fits = (size: number): boolean => {
          text.style.fontSize = `${size}px`;
          return text.scrollWidth <= boxWidth + 0.5 && text.scrollHeight <= boxHeight + 0.5;
        };

        if (fits(max)) {
          text.style.fontSize = '';
          return;
        }

        let low = Math.min(min, max);
        let high = max;
        let best = low;
        for (let i = 0; i < FIT_ITERATIONS; i += 1) {
          const mid = (low + high) / 2;
          if (fits(mid)) {
            best = mid;
            low = mid;
          } else {
            high = mid;
          }
        }
        let finalSize = best;
        for (let i = 0; i < 6; i += 1) {
          text.style.fontSize = `${finalSize.toFixed(2)}px`;
          if (text.scrollWidth <= boxWidth && text.scrollHeight <= boxHeight) return;
          finalSize = Math.max(min, finalSize - 0.5);
        }
      });
    };

    fit();
    window.addEventListener('resize', fit);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(box);
    void FONTS_READY.then(() => {
      if (!cancelled) fit();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', fit);
      observer?.disconnect();
    };
  }, [children]);

  return (
    <span ref={boxRef} className={`settings-tab-label ${className ?? ''}`.trim()}>
      <strong ref={textRef}>{children}</strong>
    </span>
  );
}
