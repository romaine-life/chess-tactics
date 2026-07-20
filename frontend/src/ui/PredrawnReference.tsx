import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import {
  predrawnGenerationFrameBoardPan,
  uniqueDrawSrcs,
  validatePredrawnGenerationFrame,
  type Level,
} from '@chess-tactics/board-render';
import { levelToEditorBoard } from '../core/levelBoard';
import {
  boardForTopSurfaceArtExport,
  StudioReadOnlyBoard,
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
  return `${safeId}-generation-reference.png`;
}

/** Composite the exact saved frame's canonical canvas layers into one downloadable PNG. */
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
  const [terrainPainted, setTerrainPainted] = useState(false);
  const [scenePainted, setScenePainted] = useState(false);
  const [downloadState, setDownloadState] = useState<'idle' | 'working' | 'error'>('idle');
  const frameRef = useRef<HTMLDivElement | null>(null);
  const acknowledgeTerrain = useCallback(() => setTerrainPainted(true), []);
  const acknowledgeScene = useCallback(() => setScenePainted(true), []);
  const failReferencePaint = useCallback((error: unknown) => {
    setLocalCaptureReady(false);
    setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
  }, []);

  useEffect(() => {
    setLocalCaptureReady(false);
    setSourcesReady(false);
    setTerrainPainted(false);
    setScenePainted(false);
    setDownloadState('idle');
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
  const frameValidation = useMemo(
    () => board ? validatePredrawnGenerationFrame(board, board.predrawnGenerationFrame) : undefined,
    [board],
  );
  const frame = frameValidation?.ok ? frameValidation.frame : undefined;
  const boardPan = useMemo(
    () => board && frame ? predrawnGenerationFrameBoardPan(board, frame) : undefined,
    [board, frame],
  );

  useEffect(() => {
    if (!board || !frame) return undefined;
    let cancelled = false;
    setSourcesReady(false);
    setLocalCaptureReady(false);
    setTerrainPainted(false);
    setScenePainted(false);
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
  }, [board, frame]);

  useEffect(() => {
    if (!sourcesReady || !terrainPainted || !scenePainted || !frame || !frameRef.current) return undefined;
    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (cancelled || !frameRef.current) return;
        try {
          const rect = frameRef.current.getBoundingClientRect();
          if (Math.abs(rect.width - frame.width) > 0.01 || Math.abs(rect.height - frame.height) > 0.01) {
            throw new Error(
              `Saved generation frame rendered at ${rect.width} × ${rect.height}, expected ${frame.width} × ${frame.height}.`,
            );
          }
          const canvases = frameRef.current.querySelectorAll('canvas');
          if (canvases.length === 0 || [...canvases].some((canvas) => canvas.width < 1 || canvas.height < 1)) {
            throw new Error('Reference renderer produced no measurable canvas layers.');
          }
          setLocalCaptureReady(true);
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
  }, [frame, scenePainted, sourcesReady, terrainPainted]);

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
      ? `${state.level.name} — generation reference`
      : 'Pre-drawn generation reference';
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
            <h1>Canonical generation reference</h1>
            <p>Loads the exact saved 16:9 scene frame at the canonical renderer’s native 1× scale. The capture removes units, ground cover, and previously installed full-scene art while preserving visible terrain, authored scenery, and exposed Subterrain inside your crop.</p>
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
                <span>origin {frame.x}, {frame.y} · native 1×</span>
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
        {state.kind === 'ready' && board && frameValidation && !frameValidation.ok ? (
          <p className="predrawn-reference-message is-error" role="alert">
            This saved level has no valid generation frame. Return to the Level Editor, choose <strong>Frame</strong>, then Save. {frameValidation.errors.join(' ')}
          </p>
        ) : null}

        {state.kind === 'ready' && board && frame ? (
          <section className="predrawn-reference-scroll" aria-label="Saved generation reference">
            <div
              ref={frameRef}
              className="predrawn-reference-export-frame"
              style={{ width: `${frame.width}px`, height: `${frame.height}px` } as CSSProperties}
              data-ready={captureReady ? 'true' : 'false'}
              data-level-id={state.level.id}
              data-columns={board.cols}
              data-rows={board.rows}
              data-frame-version={frame.version}
              data-frame-x={frame.x}
              data-frame-y={frame.y}
              data-frame-width={frame.width}
              data-frame-height={frame.height}
            >
              <StudioReadOnlyBoard
                board={board}
                boardZoom={1}
                boardPan={boardPan}
                ariaLabel={`${state.level.name} canonical generation-reference art export`}
                hidden={{ tile: false, unit: true, doodad: false }}
                topSurfacesOnly
                onTerrainFirstFrame={acknowledgeTerrain}
                onSceneFirstFrame={acknowledgeScene}
                onFrameError={failReferencePaint}
              />
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}
