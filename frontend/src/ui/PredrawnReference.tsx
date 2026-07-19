import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { uniqueDrawSrcs, type Level } from '@chess-tactics/board-render';
import { levelToEditorBoard } from '../core/levelBoard';
import {
  boardForTopSurfaceArtExport,
  StudioReadOnlyBoard,
  topSurfaceArtExportFrame,
  type TopSurfaceArtExportFrame,
} from '../render/StudioReadOnlyBoard';
import {
  loadOfficialCampaignsResult,
  loadWorkspace,
  type RevisionedWorkspace,
} from '../net/campaignWorkspace';
import { readValidatedReturnTo } from './navigation';
import { TitleBarControlContribution } from './shell/TitleBarControls';

export const PREDRAWN_REFERENCE_ROUTE = '/predrawn-reference';
export const PREDRAWN_REFERENCE_CAPTURE_SELECTOR = '.predrawn-reference-export-frame';

type ReferenceState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; level: Level }
  | { kind: 'error'; message: string };

export function predrawnReferenceLevelId(search: string): string {
  return new URLSearchParams(search).get('levelId')?.trim() ?? '';
}

export function predrawnReferenceHref(levelId: string, returnTo?: string): string {
  const query = new URLSearchParams({ levelId: levelId.trim() });
  if (returnTo) query.set('returnTo', returnTo);
  return `${PREDRAWN_REFERENCE_ROUTE}?${query.toString()}`;
}

/** Official ids can never be shadowed by a same-named private draft. */
export function predrawnReferenceLevelFromWorkspaces(
  levelId: string,
  official: RevisionedWorkspace | undefined,
  user: RevisionedWorkspace | undefined,
): Level | undefined {
  if (levelId.startsWith('off-')) return official?.levels[levelId];
  return user?.levels[levelId] ?? official?.levels[levelId];
}

export async function loadPredrawnReferenceLevel(levelId: string): Promise<Level> {
  const officialResult = await loadOfficialCampaignsResult();
  const officialLevel = predrawnReferenceLevelFromWorkspaces(levelId, officialResult.workspace, undefined);
  if (officialLevel) return officialLevel;
  if (levelId.startsWith('off-')) {
    throw new Error(officialResult.available
      ? `Official level “${levelId}” does not exist.`
      : 'The official level collection is unavailable.');
  }

  let userWorkspace: RevisionedWorkspace | undefined;
  try {
    userWorkspace = await loadWorkspace();
  } catch {
    // The final message below distinguishes an unavailable private collection from a missing id
    // without letting it replace an already-resolved official level.
  }
  const level = predrawnReferenceLevelFromWorkspaces(levelId, officialResult.workspace, userWorkspace);
  if (level) return level;
  throw new Error(userWorkspace
    ? `Level “${levelId}” does not exist.`
    : 'The private level collection is unavailable.');
}

export function decodePredrawnReferenceImage(
  src: string,
  createImage: () => HTMLImageElement = () => new Image(),
): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = createImage();
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
    image.decoding = 'async';
    image.onload = () => finish();
    image.onerror = () => finish(new Error(`Reference source failed to load: ${src}`));
    image.src = src;
    image.decode?.().then(() => finish()).catch(() => {
      // `decode()` may reject while the ordinary load event still succeeds. `onerror` remains the
      // fail-closed authority so a broken source can never advertise screenshot readiness.
    });
  });
}

export function predrawnReferenceFilename(levelId: string): string {
  const safeId = levelId.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'level';
  return `${safeId}-top-only.png`;
}

export interface RenderedReferencePaintBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/** Measure actual alpha-bearing pixels from the canonical renderer, not sprite rectangles. */
export function measurePredrawnReferencePaint(frame: HTMLElement): RenderedReferencePaintBounds {
  const frameRect = frame.getBoundingClientRect();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const canvas of frame.querySelectorAll('canvas')) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context || canvas.width < 1 || canvas.height < 1) continue;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let sourceMinX = canvas.width;
    let sourceMinY = canvas.height;
    let sourceMaxX = -1;
    let sourceMaxY = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3] === 0) continue;
        sourceMinX = Math.min(sourceMinX, x);
        sourceMinY = Math.min(sourceMinY, y);
        sourceMaxX = Math.max(sourceMaxX, x);
        sourceMaxY = Math.max(sourceMaxY, y);
      }
    }
    if (sourceMaxX < sourceMinX || sourceMaxY < sourceMinY) continue;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    minX = Math.min(minX, Math.floor(rect.left - frameRect.left + sourceMinX * scaleX));
    minY = Math.min(minY, Math.floor(rect.top - frameRect.top + sourceMinY * scaleY));
    maxX = Math.max(maxX, Math.ceil(rect.left - frameRect.left + (sourceMaxX + 1) * scaleX));
    maxY = Math.max(maxY, Math.ceil(rect.top - frameRect.top + (sourceMaxY + 1) * scaleY));
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    throw new Error('Reference renderer produced no visible pixels.');
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function tightenTopSurfaceArtExportFrame(
  frame: ReturnType<typeof topSurfaceArtExportFrame>,
  paint: RenderedReferencePaintBounds,
): ReturnType<typeof topSurfaceArtExportFrame> {
  const width = Math.ceil(paint.width) + frame.padding * 2;
  const height = Math.ceil(paint.height) + frame.padding * 2;
  return {
    ...frame,
    width,
    height,
    boardPan: {
      x: frame.boardPan.x + (frame.padding - paint.minX) - (width - frame.width) / 2,
      y: frame.boardPan.y + (frame.padding - paint.minY) - (height - frame.height) / 2,
    },
  };
}

function hasExactReferenceClearance(
  frame: ReturnType<typeof topSurfaceArtExportFrame>,
  paint: RenderedReferencePaintBounds,
): boolean {
  return paint.minX === frame.padding
    && paint.minY === frame.padding
    && paint.maxX === frame.width - frame.padding
    && paint.maxY === frame.height - frame.padding;
}

/** Composite the exact measured frame's two canonical canvas layers into one downloadable PNG. */
export async function predrawnReferencePngBlob(frame: HTMLElement): Promise<Blob> {
  const width = Math.round(frame.getBoundingClientRect().width);
  const height = Math.round(frame.getBoundingClientRect().height);
  if (width < 1 || height < 1) throw new Error('Reference frame has no measurable size.');
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d');
  if (!context) throw new Error('This browser cannot create the reference PNG.');
  context.imageSmoothingEnabled = false;
  context.fillStyle = getComputedStyle(frame).backgroundColor || '#0c0d11';
  context.fillRect(0, 0, width, height);

  const frameRect = frame.getBoundingClientRect();
  const layers = [...frame.querySelectorAll('canvas')].sort((left, right) => {
    const leftZ = Number.parseInt(getComputedStyle(left).zIndex, 10) || 0;
    const rightZ = Number.parseInt(getComputedStyle(right).zIndex, 10) || 0;
    return leftZ - rightZ;
  });
  if (layers.length === 0) throw new Error('Reference renderer produced no canvas layers.');
  for (const layer of layers) {
    const rect = layer.getBoundingClientRect();
    context.drawImage(
      layer,
      Math.round(rect.left - frameRect.left),
      Math.round(rect.top - frameRect.top),
      Math.round(rect.width),
      Math.round(rect.height),
    );
  }

  return new Promise<Blob>((resolve, reject) => {
    try {
      output.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('The browser returned an empty reference PNG.'));
      }, 'image/png');
    } catch (error) {
      reject(new Error(`Reference PNG export failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  });
}

/**
 * Development owner tool for the one allowed visual input to a pre-drawn generation run.
 * It loads canonical saved content from `levelId`; the route itself never mutates that content.
 */
export function PredrawnReference(): ReactElement {
  const routeParams = new URLSearchParams(window.location.search);
  const levelId = predrawnReferenceLevelId(window.location.search);
  const captureMode = routeParams.get('capture') === '1';
  const requestedReturnHref = readValidatedReturnTo(window.location.search);
  const returnHref = requestedReturnHref
    ?? (levelId ? `/editor/level?levelId=${encodeURIComponent(levelId)}` : '/editor/level');
  const [state, setState] = useState<ReferenceState>(() => levelId ? { kind: 'loading' } : { kind: 'idle' });
  const [captureReady, setLocalCaptureReady] = useState(false);
  const [sourcesReady, setSourcesReady] = useState(false);
  const [measuredFrame, setMeasuredFrame] = useState<TopSurfaceArtExportFrame>();
  const [downloadState, setDownloadState] = useState<'idle' | 'working' | 'error'>('idle');
  const frameRef = useRef<HTMLDivElement | null>(null);
  const measurementPassRef = useRef(0);

  useEffect(() => {
    setLocalCaptureReady(false);
    setSourcesReady(false);
    setMeasuredFrame(undefined);
    setDownloadState('idle');
    measurementPassRef.current = 0;
    if (!levelId) {
      setState({ kind: 'idle' });
      return undefined;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    void loadPredrawnReferenceLevel(levelId)
      .then((level) => {
        if (!cancelled) setState({ kind: 'ready', level });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => { cancelled = true; };
  }, [levelId]);

  const board = useMemo(() => state.kind === 'ready'
    ? boardForTopSurfaceArtExport(levelToEditorBoard(state.level))
    : undefined, [state]);
  const initialFrame = useMemo(() => board ? topSurfaceArtExportFrame(board) : undefined, [board]);
  const frame = measuredFrame ?? initialFrame;

  useEffect(() => {
    if (!board) return undefined;
    let cancelled = false;
    setSourcesReady(false);
    setMeasuredFrame(undefined);
    setLocalCaptureReady(false);
    measurementPassRef.current = 0;
    const sources = uniqueDrawSrcs(board, { ambientCover: false, topSurfacesOnly: true });
    if (sources.length === 0) {
      setState({ kind: 'error', message: 'This saved level has no renderable reference art.' });
      return undefined;
    }
    void Promise.all(sources.map((src) => decodePredrawnReferenceImage(src))).then(() => {
      if (!cancelled) setSourcesReady(true);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setLocalCaptureReady(false);
      setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    });
    return () => { cancelled = true; };
  }, [board]);

  useEffect(() => {
    if (!sourcesReady || !frame || !frameRef.current) return undefined;
    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (cancelled || !frameRef.current) return;
        try {
          const paint = measurePredrawnReferencePaint(frameRef.current);
          if (hasExactReferenceClearance(frame, paint)) {
            setLocalCaptureReady(true);
            return;
          }
          measurementPassRef.current += 1;
          if (measurementPassRef.current > 4) {
            throw new Error('Reference framing did not converge to exact edge clearance.');
          }
          setMeasuredFrame(tightenTopSurfaceArtExportFrame(frame, paint));
        } catch (error) {
          setLocalCaptureReady(false);
          setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [frame, sourcesReady]);

  const downloadReference = async (): Promise<void> => {
    if (!frameRef.current || state.kind !== 'ready' || !captureReady) return;
    setDownloadState('working');
    try {
      const blob = await predrawnReferencePngBlob(frameRef.current);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = predrawnReferenceFilename(state.level.id);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setDownloadState('idle');
    } catch {
      setDownloadState('error');
    }
  };

  useEffect(() => {
    document.title = state.kind === 'ready'
      ? `${state.level.name} — top-only reference`
      : 'Pre-drawn top-only reference';
  }, [state]);

  useEffect(() => {
    document.documentElement.classList.toggle('predrawn-reference-capture-mode', captureMode);
    return () => document.documentElement.classList.remove('predrawn-reference-capture-mode');
  }, [captureMode]);

  return (
    <>
      {!captureMode ? (
        <TitleBarControlContribution
          ariaLabel="Pre-drawn reference navigation"
          controls={[{
            id: 'predrawn-reference-back',
            kind: 'navigation',
            presentation: 'return',
            label: '‹ Back to editor',
            destination: returnHref,
            title: 'Return to the level editor',
            testId: 'predrawn-reference-back',
          }]}
        />
      ) : null}
      <main className={`predrawn-reference-tool${captureMode ? ' is-capture-mode' : ''}`}>
        <section className="predrawn-reference-toolbar" aria-label="Pre-drawn reference controls">
          <div>
            <h1>Top-only generation reference</h1>
            <p>Loads saved level geometry directly. The capture removes units, ground cover, terrain sides, and any previously installed full-scene art.</p>
          </div>
          <form action={PREDRAWN_REFERENCE_ROUTE} method="get">
            <label htmlFor="predrawn-reference-level-id">Level ID</label>
            <input id="predrawn-reference-level-id" name="levelId" defaultValue={levelId} required spellCheck={false} />
            {requestedReturnHref ? <input type="hidden" name="returnTo" value={requestedReturnHref} /> : null}
            <button type="submit">Load level</button>
          </form>
          {state.kind === 'ready' && board && frame ? (
            <div className="predrawn-reference-ready-row">
              <p className="predrawn-reference-meta" role="status">
                <strong>{state.level.name}</strong>
                <span>{board.cols} × {board.rows} saved grid</span>
                <span>{frame.width} × {frame.height} capture</span>
                <span>{frame.padding}px measured clearance on every side</span>
              </p>
              <button
                type="button"
                className="predrawn-reference-download"
                disabled={!captureReady || downloadState === 'working'}
                onClick={() => { void downloadReference(); }}
              >{downloadState === 'working' ? 'Preparing PNG…' : downloadState === 'error' ? 'Download failed — retry' : 'Download reference PNG'}</button>
            </div>
          ) : null}
        </section>

        {state.kind === 'idle' ? <p className="predrawn-reference-message">Enter any saved level ID to prepare its reference.</p> : null}
        {state.kind === 'loading' ? <p className="predrawn-reference-message" role="status">Loading saved level…</p> : null}
        {state.kind === 'error' ? <p className="predrawn-reference-message is-error" role="alert">{state.message}</p> : null}

        {state.kind === 'ready' && board && frame ? (
          <section className="predrawn-reference-scroll" aria-label="Measured top-only reference">
            <div
              ref={frameRef}
              className="predrawn-reference-export-frame"
              style={{ width: `${frame.width}px`, height: `${frame.height}px` } as CSSProperties}
              data-ready={captureReady ? 'true' : 'false'}
              data-level-id={state.level.id}
              data-columns={board.cols}
              data-rows={board.rows}
              data-padding={frame.padding}
            >
              <StudioReadOnlyBoard
                board={board}
                boardPan={frame.boardPan}
                ariaLabel={`${state.level.name} canonical top-only art export`}
                hidden={{ tile: false, unit: true, doodad: false }}
                topSurfacesOnly
              />
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}
