import { useState, type CSSProperties, type ImgHTMLAttributes, type ReactElement } from 'react';

type AlphaBounds = Readonly<{
  canvasWidth: number;
  canvasHeight: number;
  left: number;
  top: number;
  width: number;
  height: number;
}>;

type AlphaBoundLayout = Readonly<{
  blockSize: string;
  inlineSize: string;
  insetBlockStart: string;
  insetInlineStart: string;
}>;

const alphaBoundsBySource = new Map<string, AlphaBounds>();

function measureAlphaBounds(image: HTMLImageElement): AlphaBounds {
  const source = image.currentSrc || image.src;
  const cached = alphaBoundsBySource.get(source);
  if (cached) return cached;
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('icon has no native dimensions');

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('icon alpha measurement is unavailable');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (pixels[((y * canvas.width + x) * 4) + 3] <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) throw new Error('icon contains no visible pixels');
  const measured = Object.freeze({
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  });
  alphaBoundsBySource.set(source, measured);
  return measured;
}

/**
 * Fit the opaque bounds—not the transparent source canvas—inside a square seat.
 * The longest visible axis occupies `fill` of the seat and the visible-pixel
 * center lands at the seat center.
 */
export function alphaBoundIconLayout(bounds: AlphaBounds, fill = .82): AlphaBoundLayout {
  const visibleLongAxis = Math.max(bounds.width, bounds.height);
  if (visibleLongAxis <= 0 || fill <= 0 || fill > 1) throw new Error('invalid alpha-bound icon geometry');
  const sourcePixelAsSeatFraction = fill / visibleLongAxis;
  const visibleCenterX = bounds.left + (bounds.width / 2);
  const visibleCenterY = bounds.top + (bounds.height / 2);
  const percent = (value: number): string => `${(value * 100).toFixed(4)}%`;
  return Object.freeze({
    inlineSize: percent(bounds.canvasWidth * sourcePixelAsSeatFraction),
    blockSize: percent(bounds.canvasHeight * sourcePixelAsSeatFraction),
    insetInlineStart: percent(.5 - (visibleCenterX * sourcePixelAsSeatFraction)),
    insetBlockStart: percent(.5 - (visibleCenterY * sourcePixelAsSeatFraction)),
  });
}

export function AlphaBoundIcon({
  className = '',
  onLoad,
  ...imageProps
}: ImgHTMLAttributes<HTMLImageElement>): ReactElement {
  const source = String(imageProps.src ?? '');
  const [fitted, setFitted] = useState<Readonly<{ source: string; layout: AlphaBoundLayout }> | null>(null);
  const layout = fitted?.source === source ? fitted.layout : null;
  return (
    <span
      className={`alpha-bound-icon ${className}`.trim()}
      data-alpha-fit={layout ? 'ready' : 'pending'}
      aria-hidden="true"
    >
      <img
        {...imageProps}
        className="alpha-bound-icon-image"
        aria-hidden="true"
        alt=""
        style={layout as CSSProperties | undefined}
        onLoad={(event) => {
          try {
            setFitted({ source, layout: alphaBoundIconLayout(measureAlphaBounds(event.currentTarget)) });
          } catch {
            setFitted(null);
          }
          onLoad?.(event);
        }}
      />
    </span>
  );
}
