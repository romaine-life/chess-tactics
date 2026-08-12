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
  baseWidth,
  baseHeight,
  zoom,
  mode,
  alt,
}: {
  src: string;
  /** The unit's 1x draw rect — the single authored size the board uses today. */
  baseWidth: number;
  baseHeight: number;
  zoom: number;
  mode: 'rung' | 'magnified';
  alt: string;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const width = Math.max(1, Math.round(baseWidth * zoom));
  const height = Math.max(1, Math.round(baseHeight * zoom));

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
    image.src = src;
    return () => { cancelled = true; };
  }, [src, baseWidth, baseHeight, width, height, zoom, mode]);

  return <canvas ref={canvasRef} className="unit-roster-unit" width={width} height={height} aria-label={alt} role="img" />;
}
