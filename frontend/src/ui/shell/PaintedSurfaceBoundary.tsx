import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { loadingError, loadingMark, loadingMeasure } from '../../diagnostics/loadingTimeline';
import { loadDecodedImage } from '../../render/imageResources';

type SurfacePhase = 'loading' | 'painted' | 'error';

function userFacingError(error: Error | null): string {
  if (error?.message.includes('Canonical Play content')) {
    return 'Play content could not be reached. Check your connection and try again.';
  }
  return 'Required artwork could not be reached. Check your connection and try again.';
}

function waitForRenderedImage(image: HTMLImageElement): Promise<void> {
  const loaded = image.complete
    ? image.naturalWidth > 0
      ? Promise.resolve()
      : Promise.reject(new Error(`Image failed: ${image.currentSrc || image.src}`))
    : new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => reject(new Error(`Image failed: ${image.currentSrc || image.src}`)), { once: true });
      });
  return loaded.then(async () => {
    if (typeof image.decode === 'function') await image.decode();
    if (image.naturalWidth <= 0) throw new Error(`Image has no drawable pixels: ${image.currentSrc || image.src}`);
  });
}

function afterTwoPaintOpportunities(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function renderedCssImageUrls(root: HTMLElement): string[] {
  const urls = new Set<string>();
  const extract = (value: string): void => {
    for (const match of value.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      if (match[1]) urls.add(match[1]);
    }
  };
  for (const element of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    for (const pseudo of [null, '::before', '::after'] as const) {
      const style = getComputedStyle(element, pseudo);
      extract(style.backgroundImage);
      extract(style.borderImageSource);
      extract(style.maskImage);
      extract(style.getPropertyValue('-webkit-mask-image'));
    }
  }
  return [...urls];
}

interface PaintedSurfaceBoundaryProps {
  surface: string;
  signature: string;
  readyToCompose: boolean;
  error?: Error | null;
  loadingLabel: string;
  onRetry: () => void;
  children: ReactNode;
  className?: string;
  showStatus?: boolean;
  onPaintedChange?: (painted: boolean) => void;
}

/**
 * DOM surface counterpart to the board compositor gate.
 *
 * Data readiness only permits composition to begin. The boundary then waits for
 * every rendered image consumer below it to load/decode and gives the browser two
 * paint opportunities before exposing the complete, inert-until-ready visual unit.
 */
export function PaintedSurfaceBoundary({
  surface,
  signature,
  readyToCompose,
  error,
  loadingLabel,
  onRetry,
  children,
  className = '',
  showStatus = true,
  onPaintedChange,
}: PaintedSurfaceBoundaryProps): ReactElement {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<SurfacePhase>('loading');
  const [paintError, setPaintError] = useState<Error | null>(null);

  useEffect(() => {
    setPhase(error ? 'error' : 'loading');
    setPaintError(error ?? null);
    onPaintedChange?.(false);
  }, [error, signature, attempt]);

  useEffect(() => {
    onPaintedChange?.(phase === 'painted');
    return () => onPaintedChange?.(false);
  }, [onPaintedChange, phase]);

  useEffect(() => {
    if (!readyToCompose || error || !contentRef.current) return undefined;
    let cancelled = false;
    const startedAt = performance.now();
    const images = [...contentRef.current.querySelectorAll('img')];
    const cssImages = renderedCssImageUrls(contentRef.current);
    loadingMark(surface, 'dom-compose-wait-start', { imageCount: images.length, cssImageCount: cssImages.length, signature });
    void Promise.all([
      ...images.map(waitForRenderedImage),
      ...cssImages.map((url) => loadDecodedImage(url).then(() => undefined)),
    ])
      .then(afterTwoPaintOpportunities)
      .then(() => {
        if (cancelled) return;
        setPhase('painted');
        loadingMeasure(surface, 'complete-dom-frame', startedAt, { imageCount: images.length, cssImageCount: cssImages.length, signature });
      })
      .catch((nextError: unknown) => {
        if (cancelled) return;
        const normalized = nextError instanceof Error ? nextError : new Error(String(nextError));
        setPaintError(normalized);
        setPhase('error');
        loadingError(surface, 'critical-dom-frame-failed', normalized);
      });
    return () => { cancelled = true; };
  }, [attempt, error, readyToCompose, signature, surface]);

  const retry = (): void => {
    setAttempt((value) => value + 1);
    setPaintError(null);
    setPhase('loading');
    onRetry();
  };

  return (
    <div data-loading-surface={surface} className={`painted-surface ${phase === 'painted' ? 'is-ready' : phase === 'error' ? 'is-error' : 'is-loading'} ${className}`.trim()}>
      <div
        ref={contentRef}
        key={`${signature}:${attempt}`}
        className="painted-surface-content"
        inert={phase !== 'painted' ? true : undefined}
        aria-hidden={phase !== 'painted' || undefined}
      >
        {children}
      </div>
      {showStatus && phase === 'loading' ? <div className="painted-surface-status" role="status">{loadingLabel}</div> : null}
      {showStatus && phase === 'error' ? (
        <div className="painted-surface-status" role="alert">
          <strong>This surface could not be loaded.</strong>
          <small>{userFacingError(paintError)}</small>
          <button type="button" onClick={retry}>Retry</button>
        </div>
      ) : null}
    </div>
  );
}
