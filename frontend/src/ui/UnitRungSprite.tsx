import { useEffect, useRef, type ReactElement } from 'react';

/**
 * One unit drawn at exactly the size a zoom tier puts on screen, two ways.
 *
 * `rung` cuts a sprite for this zoom out of the high-resolution master by repeated
 * halving — supersampling, so every sub-pixel feature of the model contributes to
 * the result (ADR-0549). It is what an authored rung would look like.
 *
 * `magnified` is what ships today: one authored size, scaled to the tier. Above 1:1
 * that is whole-pixel magnification, so detail the master had but the authored size
 * never sampled cannot come back — the gap between the two columns IS the argument
 * for rungs, and it widens the further in you go.
 *
 * Both draw into a canvas sized in real pixels rather than a scaled `img`, so what
 * you are looking at is the actual pixel count that zoom would put on the board.
 */
export function UnitRungSprite({
  src,
  authoredSrc,
  baseWidth,
  baseHeight,
  zoom,
  mode,
  alt,
}: {
  src: string;
  /**
   * The REAL authored rung for this tier, once one exists in the catalog. When present
   * the `rung` column stops simulating and draws the sprite Blender actually rendered
   * at this size — which is the whole point, and the only version that can be judged.
   * Nearest sampling, because an authored rung lands one source pixel on one screen
   * pixel and smoothing would throw that away.
   */
  authoredSrc?: string;
  /** The unit's 1x draw rect — the single authored size the board uses today. */
  baseWidth: number;
  baseHeight: number;
  zoom: number;
  mode: 'rung' | 'magnified';
  alt: string;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /**
   * The backing store is sized in DEVICE pixels, not CSS pixels.
   *
   * A 150% display runs at devicePixelRatio 1.5, so a canvas sized in CSS pixels is
   * resampled by 1.5 on its way to the panel: some source columns land on two device
   * pixels and some on one. On pixel art that is not softness, it is a shape change —
   * parts of a silhouette physically widen — and it is worst on whichever piece
   * carries the most internal detail. Sizing the store in device pixels means one
   * stored pixel is one screen pixel and the browser resamples nothing.
   */
  const dpr = typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(baseWidth * zoom * dpr));
  const height = Math.max(1, Math.round(baseHeight * zoom * dpr));

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (cancelled) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);

      /** Halve until within 2:1 of the target, so every source pixel is averaged in. */
      const reduceTo = (targetW: number, targetH: number): CanvasImageSource => {
        let source: CanvasImageSource = image;
        let w = image.naturalWidth;
        let h = image.naturalHeight;
        while (w > targetW * 2 && h > targetH * 2) {
          w = Math.max(1, Math.floor(w / 2));
          h = Math.max(1, Math.floor(h / 2));
          const step = document.createElement('canvas');
          step.width = w;
          step.height = h;
          const stepContext = step.getContext('2d');
          if (!stepContext) break;
          stepContext.imageSmoothingEnabled = true;
          stepContext.imageSmoothingQuality = 'high';
          stepContext.drawImage(source, 0, 0, w, h);
          source = step;
        }
        return source;
      };

      if (mode === 'rung') {
        if (authoredSrc) {
          // A real authored rung: draw it as-is. Its own size is within one integer
          // magnification of the target by construction, so nothing is resampled.
          context.imageSmoothingEnabled = false;
          context.drawImage(image, 0, 0, width, height);
          return;
        }
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(reduceTo(width, height), 0, 0, width, height);
        return;
      }

      // Today's path: reduce to the ONE authored size first, then scale that to the
      // tier. Whole-pixel above 1:1, filtered below, matching what the board does.
      const authored = document.createElement('canvas');
      authored.width = baseWidth;
      authored.height = baseHeight;
      const authoredContext = authored.getContext('2d');
      if (!authoredContext) return;
      authoredContext.imageSmoothingEnabled = true;
      authoredContext.imageSmoothingQuality = 'high';
      authoredContext.drawImage(reduceTo(baseWidth, baseHeight), 0, 0, baseWidth, baseHeight);
      context.imageSmoothingEnabled = zoom < 1;
      context.imageSmoothingQuality = 'high';
      context.drawImage(authored, 0, 0, width, height);
    };
    image.src = mode === 'rung' && authoredSrc ? authoredSrc : src;
    return () => { cancelled = true; };
  }, [src, authoredSrc, baseWidth, baseHeight, width, height, zoom, mode, dpr]);

  // Backing store in REAL tier pixels so an authored rung lands 1:1; laid out at the 1x
  // rect, because the grid box scales everything by the tier already. Without the CSS
  // size the element occupied its backing store and was scaled a second time, so the
  // unit and the ground it stands on disagreed by a whole tier zoom.
  return (
    <canvas
      ref={canvasRef}
      className="unit-roster-unit"
      width={width}
      height={height}
      style={{ width: `${baseWidth}px`, height: `${baseHeight}px` }}
      aria-label={alt}
      role="img"
    />
  );
}
