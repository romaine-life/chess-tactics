import {
  boardBackgroundMode,
  predrawnGenerationFrameBoardPan,
  validatePredrawnGenerationFrame,
  type EditorBoard,
} from '@chess-tactics/board-render';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
import {
  createPredrawnBackgroundVersion,
  listPredrawnBackgroundVersions,
  predrawnBackgroundVersionContentUrl,
  uploadPredrawnBackgroundVersionContent,
  type PredrawnBackgroundVersion,
} from '../net/predrawnBackgroundVersions';
import type { EditorDocumentEditFence } from '../net/editorDocuments';
import {
  assertDecodablePngBlob,
  predrawnEnvironmentGeometrySha256,
} from '../render/predrawnBackgroundProcessing';
import {
  boardForPredrawnSourceArtwork,
  StudioReadOnlyBoard,
} from '../render/StudioReadOnlyBoard';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { copyPredrawnPngToClipboard } from './predrawnImageClipboard';
import { predrawnGenerationReferenceLabel } from './predrawnCreationAttempts';
import { predrawnReferencePngBlob } from './PredrawnReference';
import { ChromeButton } from './shared/ChromeButton';

type StatusTone = 'info' | 'success' | 'warning' | 'error';

async function sha256Hex(value: Blob | string): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : await value.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createdLabel(version: PredrawnBackgroundVersion): string {
  const created = version.created_at ? new Date(version.created_at) : null;
  return created && !Number.isNaN(created.valueOf())
    ? new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(created)
    : 'Time unavailable';
}

function isUsableSourceArtwork(version: PredrawnBackgroundVersion): boolean {
  return version.kind === 'source'
    && version.status !== 'archived'
    && Boolean(version.content_sha256)
    && Boolean(version.content_url)
    && Number(version.frame_width) > 0
    && Number(version.frame_height) > 0;
}

export function PredrawnSourceArtworkPanel({
  documentId,
  levelId,
  workingCopyBoard,
  workingCopyLevelSignature,
  workingCopyRevision,
  canWrite,
  workingCopyReady,
  getEditFence,
  onMutationError,
  onStatus,
}: {
  documentId: string;
  levelId: string;
  workingCopyBoard: EditorBoard;
  workingCopyLevelSignature: string;
  workingCopyRevision: number;
  canWrite: boolean;
  workingCopyReady: boolean;
  getEditFence: () => EditorDocumentEditFence | null;
  onMutationError: (error: unknown) => boolean;
  onStatus: (message: string, tone?: StatusTone, detail?: string) => void;
}): ReactElement {
  const frameRef = useRef<HTMLDivElement>(null);
  const previewHostRef = useRef<HTMLDivElement>(null);
  const [versions, setVersions] = useState<PredrawnBackgroundVersion[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [terrainReady, setTerrainReady] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const [busy, setBusy] = useState<'load' | 'capture' | null>('load');
  const [copying, setCopying] = useState(false);
  const [clipboardStatus, setClipboardStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const backgroundMode = boardBackgroundMode(workingCopyBoard);
  const sourceBoard = useMemo<EditorBoard>(
    () => boardForPredrawnSourceArtwork(workingCopyBoard),
    [workingCopyBoard],
  );
  const frameValidation = useMemo(
    () => validatePredrawnGenerationFrame(sourceBoard, sourceBoard.predrawnGenerationFrame),
    [sourceBoard],
  );
  const frame = frameValidation.ok ? frameValidation.frame : undefined;
  const boardPan = useMemo(
    () => frame ? predrawnGenerationFrameBoardPan(sourceBoard, frame) : undefined,
    [frame, sourceBoard],
  );
  const sources = useMemo(
    () => versions.filter(isUsableSourceArtwork),
    [versions],
  );
  const selected = sources.find((source) => source.id === selectedId);
  const previewReady = Boolean(frame && terrainReady && sceneReady);

  const refresh = useCallback(async (): Promise<void> => {
    const loaded = await listPredrawnBackgroundVersions(documentId);
    setVersions(loaded);
    const loadedSources = loaded.filter(isUsableSourceArtwork);
    setSelectedId((current) => (
      loadedSources.some((source) => source.id === current) ? current : loadedSources[0]?.id ?? ''
    ));
  }, [documentId]);

  useEffect(() => {
    let cancelled = false;
    setBusy('load');
    void listPredrawnBackgroundVersions(documentId).then((loaded) => {
      if (cancelled) return;
      setVersions(loaded);
      const loadedSources = loaded.filter(isUsableSourceArtwork);
      setSelectedId((current) => (
        loadedSources.some((source) => source.id === current) ? current : loadedSources[0]?.id ?? ''
      ));
      setBusy(null);
    }).catch((cause) => {
      if (cancelled) return;
      setError(cause instanceof Error ? cause.message : 'Generation References could not be loaded.');
      setBusy(null);
    });
    return () => { cancelled = true; };
  }, [documentId]);

  useEffect(() => {
    setTerrainReady(false);
    setSceneReady(false);
  }, [backgroundMode, workingCopyLevelSignature]);

  useLayoutEffect(() => {
    const host = previewHostRef.current;
    if (!host || !frame) return undefined;
    const measure = (): void => {
      const availableWidth = Math.max(1, host.clientWidth - 24);
      setPreviewScale(Math.min(1, availableWidth / frame.width));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [frame]);

  const saveCurrentSource = async (): Promise<void> => {
    if (!frame || !frameRef.current || !canWrite || !workingCopyReady || !previewReady || busy) return;
    setBusy('capture');
    setError(null);
    try {
      const fence = getEditFence();
      if (!fence) throw new Error('Reload an owner editing page before saving a generation reference.');
      const blob = await predrawnReferencePngBlob(frameRef.current);
      await assertDecodablePngBlob(blob);
      const [sourceSha256, environmentGeometrySha256] = await Promise.all([
        sha256Hex(blob),
        predrawnEnvironmentGeometrySha256(workingCopyBoard),
      ]);
      const worldBounds = {
        minX: frame.x,
        minY: frame.y,
        width: frame.width,
        height: frame.height,
      };
      const identity = await sha256Hex(JSON.stringify({
        schema: 'generation-source-identity-v2',
        documentId,
        levelId,
        sourceSha256,
        workingCopyLevelSignature,
        workingCopyRevision,
        backgroundMode,
        worldBounds,
      }));
      let version = await createPredrawnBackgroundVersion(documentId, {
        kind: 'source',
        label: `Generation reference ${sources.length + 1}`,
        operation: {
          kind: 'generation-source-v2',
          captureClient: 'level-editor-source-artwork-v1',
        },
        provenance: {
          sourceSha256,
          source: 'autosaved-working-copy-background',
        },
        idempotency_key: `source:${identity}`,
      }, fence);
      if (!version.content_sha256) {
        version = await uploadPredrawnBackgroundVersionContent({
          documentId,
          versionId: version.id,
          expectedRevision: version.row_revision,
          bytes: blob,
          fence,
        });
      }
      await refresh();
      setSelectedId(version.id);
      onStatus(
        'Generation reference saved.',
        'success',
        `This exact ${backgroundMode === 'ai' ? 'AI artwork' : 'Legacy tileset'} picture can now be copied to the AI model. Add the returned image from Board Art Pipeline.`,
      );
    } catch (cause) {
      if (onMutationError(cause)) return;
      const message = cause instanceof Error ? cause.message : 'The generation reference could not be saved.';
      setError(message);
      onStatus('Generation reference capture failed.', 'error', message);
    } finally {
      setBusy(null);
    }
  };

  const copySelectedReference = async (): Promise<void> => {
    if (!selected || copying) return;
    setCopying(true);
    setClipboardStatus(null);
    setError(null);
    try {
      await copyPredrawnPngToClipboard(predrawnBackgroundVersionContentUrl(selected.id));
      const dimensions = selected.frame_width && selected.frame_height
        ? `${selected.frame_width} × ${selected.frame_height} PNG`
        : 'full-resolution PNG';
      setClipboardStatus(`Copied ${dimensions}. Paste it into the Codex conversation as the AI generation reference.`);
      onStatus(
        'Generation reference copied.',
        'success',
        `${dimensions} copied to the system clipboard. This did not create or change a pipeline slot.`,
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The generation reference could not be copied.';
      setError(message);
      onStatus('Generation reference copy failed.', 'error', message);
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="le-source-artwork-manager" data-testid="predrawn-source-artwork-manager">
      <section className="le-artwork-frame-card" aria-labelledby="source-artwork-current-title">
        <div className="le-artwork-frame-copy">
          <span className="skirmish-eyebrow">Current working copy</span>
          <h3 id="source-artwork-current-title">
            {backgroundMode === 'ai' ? 'AI artwork generation reference' : 'Legacy tileset generation reference'}
          </h3>
          <p>
            This is the exact full-resolution picture sent to the AI model. It comes from the
            autosaved working-copy background inside the viewing pane; units, Cover, grids, tactical
            overlays, and editor UI are excluded.
          </p>
        </div>
        <div className="le-artwork-frame-actions">
          <ChromeButton unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', previewReady && 'active')}
            disabled={!canWrite || !workingCopyReady || !previewReady || Boolean(busy)}
            onClick={() => { void saveCurrentSource(); }}
            title={!workingCopyReady ? 'Wait for the current working copy to finish autosaving.' : 'Create an immutable AI generation reference from this exact autosaved working-copy picture.'}
          >{busy === 'capture' ? 'Creating reference…' : 'Create reference from working copy'}</ChromeButton>
        </div>
        {!workingCopyReady ? (
          <output className="le-predrawn-version-error" role="status">
            Waiting for the current level and viewing pane to finish autosaving.
          </output>
        ) : null}
        {!frame ? (
          <output className="le-predrawn-version-error" role="alert">
            Choose and apply a valid 16:9 viewing pane before creating a generation reference.
          </output>
        ) : null}
      </section>

      {frame && boardPan ? (
        <div ref={previewHostRef} className="le-source-artwork-live-scroll" aria-label="Current AI generation reference preview">
          <div
            className="le-source-artwork-fit-stage"
            style={{
              width: `${frame.width * previewScale}px`,
              height: `${frame.height * previewScale}px`,
            }}
          >
            <div
              ref={frameRef}
              className="predrawn-reference-export-frame le-source-artwork-live-frame"
              style={{
                width: `${frame.width}px`,
                height: `${frame.height}px`,
                transform: `scale(${previewScale})`,
              } as CSSProperties}
              data-ready={previewReady ? 'true' : 'false'}
              data-background-mode={backgroundMode}
              data-capture-width={frame.width}
              data-capture-height={frame.height}
            >
              <StudioReadOnlyBoard
                board={sourceBoard}
                boardZoom={1}
                boardPan={boardPan}
                ariaLabel={`Current working-copy ${backgroundMode === 'ai' ? 'AI artwork' : 'Legacy tileset'} generation reference`}
                hidden={{ tile: false, unit: true, doodad: false }}
                topSurfacesOnly={backgroundMode === 'legacy'}
                onTerrainFirstFrame={() => setTerrainReady(true)}
                onSceneFirstFrame={() => setSceneReady(true)}
                onFrameError={(cause) => {
                  setError(cause instanceof Error ? cause.message : 'The generation-reference preview could not be painted.');
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      <section className="le-source-artwork-library" aria-labelledby="saved-source-artwork-title">
        <div className="le-predrawn-version-heading">
          <div>
            <span className="skirmish-eyebrow">Images handed to the model</span>
            <strong id="saved-source-artwork-title">Saved generation references</strong>
          </div>
          <span>{sources.length} reference{sources.length === 1 ? '' : 's'}</span>
        </div>
        <div className="le-source-artwork-grid" role="list" aria-label="Saved AI generation references">
          {sources.map((source, index) => (
            <ChromeButton unit="inner-text-button"
              role="listitem"
              key={source.id}
              className={chromeUnitClassNames(
                'inner-text-button',
                'le-source-artwork-card',
                source.id === selected?.id && 'active',
              )}
              aria-pressed={source.id === selected?.id}
              onClick={() => setSelectedId(source.id)}
            >
              <img src={predrawnBackgroundVersionContentUrl(source.id)} alt="" aria-hidden="true" />
              <span>
                <strong>{predrawnGenerationReferenceLabel(source, index)}</strong>
                <small>
                  {source.operation.backgroundMode === 'ai' ? 'Captured from AI artwork' : 'Captured from Legacy tileset'}
                  {' · '}
                  {source.frame_width} × {source.frame_height} PNG
                  {' · '}
                  {createdLabel(source)}
                </small>
              </span>
            </ChromeButton>
          ))}
          {!sources.length && busy !== 'load' ? (
            <div className="le-predrawn-artifact-empty" role="status">
              <strong>No saved generation references</strong>
              <span>Create one from the autosaved working-copy picture above, then add the returned artwork from Board Art Pipeline.</span>
            </div>
          ) : null}
        </div>
        {selected ? (
          <div className="le-predrawn-version-actions">
            <ChromeButton unit="inner-text-button"
              data-testid="copy-generation-reference"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'active')}
              disabled={copying}
              onClick={() => { void copySelectedReference(); }}
              title="Copy the exact stored full-resolution PNG to the system clipboard for the manual Codex handoff."
            >{copying ? 'Copying reference…' : 'Copy generation reference'}</ChromeButton>
            <a
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              data-chrome-unit="inner-text-button"
              href={predrawnBackgroundVersionContentUrl(selected.id)}
              download
              title="Download the exact full-resolution reference PNG. This does not create a pipeline slot."
            >Download reference PNG</a>
          </div>
        ) : null}
        {clipboardStatus ? (
          <output
            className="le-predrawn-version-ready"
            data-testid="clipboard-handoff-status"
            role="status"
          >{clipboardStatus}</output>
        ) : null}
      </section>
      {error ? <output className="le-predrawn-version-error" role="alert">{error}</output> : null}
    </div>
  );
}
