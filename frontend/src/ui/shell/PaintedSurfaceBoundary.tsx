import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { loadingError, loadingMark, loadingMeasure } from '../../diagnostics/loadingTimeline';
import { decodeWithinBudget, loadDecodedImage, withLoadDeadline } from '../../render/imageResources';
import { useSceneParticipant } from './SceneBoundary';

type SurfacePhase = 'loading' | 'painted' | 'error';

function userFacingError(error: Error | null): string {
  if (error?.message.includes('Canonical Play content')) {
    return 'Play content could not be reached. Check your connection and try again.';
  }
  return 'Required artwork could not be reached. Check your connection and try again.';
}

export function waitForRenderedImage(image: HTMLImageElement): Promise<void> {
  // BOUNDED, because a stalled request fires neither `load` nor `error` and this promise decides
  // whether a surface is ever shown. That is the failure the mobile lab caught in the owner's
  // browser and reported as `scene startup · waiting on gameplay-hud`: the Controls panel's
  // readiness gate held on an image that never arrived, so the scene stayed in startup and the
  // screen stayed blank with nothing logged, because nothing had rejected. Past the deadline it
  // rejects, which is what puts this surface's own error and Retry on screen instead.
  const loaded = image.complete
    ? image.naturalWidth > 0
      ? Promise.resolve()
      : Promise.reject(new Error(`Image failed: ${image.currentSrc || image.src}`))
    : withLoadDeadline(new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => reject(new Error(`Image failed: ${image.currentSrc || image.src}`)), { once: true });
      }), image.currentSrc || image.src);
  return loaded.then(async () => {
    // Bounded (see decodeWithinBudget). This gate decides when a scene becomes visible, and
    // `decode()` may stay pending forever on a document the browser is not painting — which left
    // the persistent shell on screen with the scene behind it stuck in `loading`, showing a title
    // bar and nothing else, with no error anywhere because nothing had rejected. The
    // naturalWidth check below still rejects artwork that genuinely has no pixels.
    await decodeWithinBudget(image);
    if (image.naturalWidth <= 0) throw new Error(`Image has no drawable pixels: ${image.currentSrc || image.src}`);
  });
}

export function afterTwoPaintOpportunities(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export function renderedCssImageUrls(root: HTMLElement): string[] {
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
function SurfaceReadinessBoundary({
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
  ownsVisibility,
}: PaintedSurfaceBoundaryProps & { ownsVisibility: boolean }): ReactElement {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<SurfacePhase>('loading');
  const [paintError, setPaintError] = useState<Error | null>(null);
  useSceneParticipant(surface, phase, paintError);

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
    const root = contentRef.current;
    const images = [...root.querySelectorAll('img')];
    const cssImages = renderedCssImageUrls(root);
    loadingMark(surface, 'dom-compose-wait-start', { imageCount: images.length, cssImageCount: cssImages.length, signature });
    // Nested atomic frames (a Run card's scene window, the deployment level
    // preview) finish their own compose before this readiness probe reports painted.
    // Every nested surface resolves to ready or error, so this scan terminates.
    const nestedSurfacesSettled = (): Promise<void> => new Promise((resolve) => {
      const check = (): void => {
        if (cancelled || !root.querySelector('.painted-surface.is-loading')) resolve();
        else requestAnimationFrame(check);
      };
      check();
    });
    void Promise.all([
      ...images.map(waitForRenderedImage),
      ...cssImages.map((url) => loadDecodedImage(url).then(() => undefined)),
    ])
      .then(nestedSurfacesSettled)
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
    <div
      data-loading-surface={surface}
      data-surface-readiness={ownsVisibility ? 'atomic-frame' : 'scene-probe'}
      className={`${ownsVisibility ? 'painted-surface' : 'scene-surface-readiness'} ${phase === 'painted' ? 'is-ready' : phase === 'error' ? 'is-error' : 'is-loading'} ${className}`.trim()}
    >
      <div
        ref={contentRef}
        key={`${signature}:${attempt}`}
        className={ownsVisibility ? 'painted-surface-content' : 'scene-surface-readiness-content'}
        inert={ownsVisibility && phase !== 'painted' ? true : undefined}
        aria-hidden={ownsVisibility && phase !== 'painted' || undefined}
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

/** Atomic image/frame replacement. This local primitive may hide and reveal its pixels. */
export function PaintedSurfaceBoundary(props: PaintedSurfaceBoundaryProps): ReactElement {
  return <SurfaceReadinessBoundary {...props} ownsVisibility />;
}

/** Scene readiness only. Visibility and activation remain exclusively director-owned. */
export function SceneSurfaceReadiness(props: PaintedSurfaceBoundaryProps): ReactElement {
  return <SurfaceReadinessBoundary {...props} ownsVisibility={false} />;
}
