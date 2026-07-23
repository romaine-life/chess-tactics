import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  predrawnWorldBoundsBoardPan,
  type EditorBoard,
  type PredrawnBoardCornerRegistration,
  type PredrawnGenerationFrame,
  type VersionedPredrawnBoardSurface,
} from '@chess-tactics/board-render';
import {
  archivePredrawnBackgroundVersion,
  createPredrawnBackgroundVersion,
  listPredrawnBackgroundVersions,
  predrawnBackgroundVersionContentUrl,
  uploadPredrawnBackgroundVersionContent,
  type PredrawnBackgroundVersion,
} from '../net/predrawnBackgroundVersions';
import {
  assertDecodablePngBlob,
  generatePredrawnOcclusionDepthRaster,
  generateWarpedPredrawnRaster,
  legacyPredrawnEnvironmentGeometrySha256V1,
  predrawnEnvironmentGeometrySha256,
  sourcePngBlob,
  predrawnOcclusionDepthHeatmapPixels,
  type PredrawnOcclusionDepthHeatmap,
} from '../render/predrawnBackgroundProcessing';
import { loadDecodedImage } from '../render/imageResources';
import { StudioReadOnlyBoard } from '../render/StudioReadOnlyBoard';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { PredrawnCornerPicker } from './PredrawnCornerPicker';
import {
  predrawnBackgroundCanArchive,
  predrawnBackgroundVersionIdempotencyKey,
  predrawnRegistrationForBackground,
  reusablePredrawnRawVersion,
} from './predrawnBackgroundVersionPolicy';
import {
  predrawnBoardArtifactForSurface,
  predrawnBoardArtifactStoredChildren,
  predrawnBoardArtifactWorkflow,
  predrawnBoardSurfaceForArtifact,
  type PredrawnBoardArtifact,
} from './predrawnBoardArtifacts';
import type { EditorDocumentEditFence } from '../net/editorDocuments';

type StatusTone = 'info' | 'success' | 'warning' | 'error';

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function versionLabel(version: PredrawnBackgroundVersion): string {
  const stage = version.kind === 'raw' ? 'Raw' : version.kind === 'warped' ? 'Warped' : 'Occlusion';
  return version.label || `${stage} ${version.id.slice(0, 8)}`;
}

type EnvironmentGeometryReference = {
  schema: 'predrawn-environment-geometry-v1' | 'predrawn-environment-geometry-v2';
  sha256: string;
};

function environmentGeometryFromVersion(version: PredrawnBackgroundVersion | undefined): EnvironmentGeometryReference | undefined {
  const migratedV2 = version?.environment_geometry_sha256_v2;
  if (typeof migratedV2 === 'string' && /^[0-9a-f]{64}$/.test(migratedV2)) {
    return { schema: 'predrawn-environment-geometry-v2', sha256: migratedV2 };
  }
  const digest = version?.operation.environmentGeometrySha256;
  const schema = version?.operation.environmentGeometrySchema;
  if (
    typeof digest !== 'string'
    || !/^[0-9a-f]{64}$/.test(digest)
    || (schema !== 'predrawn-environment-geometry-v1' && schema !== 'predrawn-environment-geometry-v2')
  ) return undefined;
  return { schema, sha256: digest };
}

function environmentGeometryMatches(
  reference: EnvironmentGeometryReference | undefined,
  current: { v1: string; v2: string } | null,
): boolean {
  if (!reference || !current) return false;
  return reference.sha256 === (reference.schema === 'predrawn-environment-geometry-v2' ? current.v2 : current.v1);
}

function surfaceSelectionLabel(
  artifact: PredrawnBoardArtifact | undefined,
  surface: VersionedPredrawnBoardSurface | undefined,
): string {
  if (artifact) return artifact.title;
  if (!surface) return 'No board artwork selected';
  return `Unavailable version ${surface.occlusionVersionId?.slice(0, 8) ?? surface.backgroundVersionId.slice(0, 8)}`;
}

function createdLabel(version: PredrawnBackgroundVersion): string {
  if (!version.created_at) return 'Created time unavailable';
  const created = new Date(version.created_at);
  if (Number.isNaN(created.valueOf())) return 'Created time unavailable';
  return `Created ${new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(created)}`;
}

type ArtifactPreviewState = {
  artifactId: string;
  status: 'loading' | 'ready' | 'error';
  message?: string;
};

function PredrawnArtifactBoardPreview({
  artifact,
  board,
  onStateChange,
}: {
  artifact: PredrawnBoardArtifact;
  board: EditorBoard;
  onStateChange: (state: ArtifactPreviewState) => void;
}): ReactElement {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 640, height: 360 });
  const [paintedLayers, setPaintedLayers] = useState(0);
  const [paintError, setPaintError] = useState<string>();
  const surface = artifact.surface;
  const previewBoard = useMemo<EditorBoard>(() => ({
    ...board,
    surface: predrawnBoardSurfaceForArtifact(artifact),
  }), [artifact, board]);
  const displayScale = Math.max(0.01, Math.min(
    stageSize.width / surface.worldBounds.width,
    stageSize.height / surface.worldBounds.height,
  ));
  const nativePan = predrawnWorldBoundsBoardPan(board, surface.worldBounds);
  const previewPan = {
    x: nativePan.x * displayScale,
    y: nativePan.y * displayScale,
  };
  const acknowledgeTerrain = useCallback(() => setPaintedLayers((value) => value | 1), []);
  const acknowledgeScene = useCallback(() => setPaintedLayers((value) => value | 2), []);
  const failPaint = useCallback((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : 'The live board preview could not be painted.';
    setPaintError(message);
    onStateChange({ artifactId: artifact.id, status: 'error', message });
  }, [artifact.id, onStateChange]);

  useEffect(() => {
    setPaintedLayers(0);
    setPaintError(undefined);
    onStateChange({ artifactId: artifact.id, status: 'loading' });
  }, [artifact.id, onStateChange]);

  useEffect(() => {
    if (paintedLayers !== 3 || paintError) return;
    onStateChange({ artifactId: artifact.id, status: 'ready' });
  }, [artifact.id, onStateChange, paintError, paintedLayers]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const measure = (): void => {
      const bounds = stage.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) {
        setStageSize({ width: bounds.width, height: bounds.height });
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={stageRef}
      className="le-predrawn-artifact-live-preview"
      data-stage={artifact.stage}
      aria-label={`Live board preview of ${artifact.title}`}
    >
      <StudioReadOnlyBoard
        board={previewBoard}
        boardZoom={displayScale}
        boardPan={previewPan}
        hidden={{ tile: false, unit: true, doodad: false }}
        ariaLabel={`Live board preview of ${artifact.title}`}
        onTerrainFirstFrame={acknowledgeTerrain}
        onSceneFirstFrame={acknowledgeScene}
        onFrameError={failPaint}
      />
      {paintError ? (
        <span className="le-predrawn-artifact-preview-status is-error" role="alert">Preview failed · {paintError}</span>
      ) : paintedLayers !== 3 ? (
        <span className="le-predrawn-artifact-preview-status" role="status">Painting live board preview…</span>
      ) : null}
    </div>
  );
}

type DepthPreviewState =
  | { status: 'loading' }
  | { status: 'ready'; heatmap: PredrawnOcclusionDepthHeatmap }
  | { status: 'error'; message: string };

function formatDepthLane(depth: number): string {
  return Number.isInteger(depth) ? `${depth}` : depth.toFixed(1);
}

function PredrawnOcclusionDepthPreview({
  backgroundSrc,
  maskSrc,
  maskLabel,
}: {
  backgroundSrc: string;
  maskSrc: string;
  maskLabel: string;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<DepthPreviewState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    void loadDecodedImage(maskSrc).then((image) => {
      if (cancelled) return;
      const scratch = document.createElement('canvas');
      scratch.width = image.naturalWidth;
      scratch.height = image.naturalHeight;
      const context = scratch.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('The browser could not read the selected depth mask.');
      context.drawImage(image, 0, 0);
      const source = context.getImageData(0, 0, scratch.width, scratch.height);
      const heatmap = predrawnOcclusionDepthHeatmapPixels(source.data, source.width, source.height);
      if (!cancelled) setState({ status: 'ready', heatmap });
    }).catch((cause) => {
      if (cancelled) return;
      setState({
        status: 'error',
        message: cause instanceof Error ? cause.message : 'The selected depth mask could not be decoded.',
      });
    });
    return () => { cancelled = true; };
  }, [maskSrc]);

  useEffect(() => {
    if (state.status !== 'ready') return;
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    const frame = context.createImageData(state.heatmap.width, state.heatmap.height);
    frame.data.set(state.heatmap.data);
    context.putImageData(frame, 0, 0);
  }, [state]);

  const heatmap = state.status === 'ready' ? state.heatmap : null;
  const depthRange = heatmap
    && heatmap.opaquePixelCount > 0
    && heatmap.minDepth !== null
    && heatmap.maxDepth !== null
    ? { min: heatmap.minDepth, max: heatmap.maxDepth }
    : null;
  return (
    <figure className="le-predrawn-depth-inspection" data-testid="predrawn-occlusion-depth-preview">
      <figcaption><strong>Occlusion depth</strong><span>Decoded from the immutable RGB24 mask</span></figcaption>
      <div className="le-predrawn-depth-inspection-stage">
        <img src={backgroundSrc} alt="" aria-hidden="true" />
        {state.status === 'ready' ? (
          <canvas
            ref={canvasRef}
            width={state.heatmap.width}
            height={state.heatmap.height}
            role="img"
            aria-label={`Decoded depth overlay for ${maskLabel}`}
          />
        ) : null}
        {state.status === 'loading' ? <span className="le-predrawn-depth-status">Decoding depth…</span> : null}
        {state.status === 'error' ? <span className="le-predrawn-depth-status" role="alert">{state.message}</span> : null}
      </div>
      {depthRange ? (
        <div className="le-predrawn-depth-legend" aria-label={`Far depth ${formatDepthLane(depthRange.min)} through near depth ${formatDepthLane(depthRange.max)}`}>
          <span>Far · z {formatDepthLane(depthRange.min)}</span>
          <i aria-hidden="true" />
          <span>Near · z {formatDepthLane(depthRange.max)}</span>
        </div>
      ) : state.status === 'ready' ? (
        <span className="le-predrawn-depth-empty">This mask has no occluding pixels.</span>
      ) : null}
    </figure>
  );
}

export function PredrawnBackgroundVersionsPanel({
  documentId,
  levelId,
  board,
  cells,
  generationFrame,
  initialSourceSrc,
  initialRegistration,
  currentSurface,
  canonicalSurface,
  canonicalActionLabel,
  workingCopySyncState,
  canWrite,
  getEditFence,
  onSetSurface,
  onOpenCanonicalAction,
  onMutationError,
  onStatus,
}: {
  documentId: string;
  levelId: string;
  board: EditorBoard;
  cells: readonly { x: number; y: number }[];
  generationFrame?: PredrawnGenerationFrame;
  initialSourceSrc?: string;
  initialRegistration?: PredrawnBoardCornerRegistration;
  currentSurface?: VersionedPredrawnBoardSurface;
  canonicalSurface?: VersionedPredrawnBoardSurface;
  canonicalActionLabel: 'Save' | 'Publish';
  workingCopySyncState: 'loading' | 'local' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';
  canWrite: boolean;
  getEditFence: () => EditorDocumentEditFence | null;
  onSetSurface: (surface: VersionedPredrawnBoardSurface) => void;
  onOpenCanonicalAction: () => void;
  onMutationError: (error: unknown) => boolean;
  onStatus: (message: string, tone?: StatusTone, detail?: string) => void;
}): ReactElement {
  const [versions, setVersions] = useState<PredrawnBackgroundVersion[]>([]);
  const [selectedArtifactId, setSelectedArtifactId] = useState(
    currentSurface?.occlusionVersionId ?? currentSurface?.backgroundVersionId ?? '',
  );
  const [registration, setRegistration] = useState<PredrawnBoardCornerRegistration | undefined>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [inspectMask, setInspectMask] = useState(true);
  const [busy, setBusy] = useState<'load' | 'raw' | 'warp' | 'occlusion' | 'archive' | 'archive-mask' | null>('load');
  const [error, setError] = useState<string | null>(null);
  const [currentEnvironmentGeometry, setCurrentEnvironmentGeometry] = useState<{ v1: string; v2: string } | null>(null);
  const [selectedPreviewState, setSelectedPreviewState] = useState<ArtifactPreviewState | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setCurrentEnvironmentGeometry(null);
    void Promise.all([
      legacyPredrawnEnvironmentGeometrySha256V1(board),
      predrawnEnvironmentGeometrySha256(board),
    ]).then(([v1, v2]) => {
      if (!cancelled) setCurrentEnvironmentGeometry({ v1, v2 });
    });
    return () => { cancelled = true; };
  }, [board]);

  const refresh = async (): Promise<PredrawnBackgroundVersion[]> => {
    setError(null);
    const loaded = await listPredrawnBackgroundVersions(documentId);
    setVersions(loaded);
    return loaded;
  };

  const upsertVersion = (version: PredrawnBackgroundVersion): void => {
    setVersions((current) => [version, ...current.filter((candidate) => candidate.id !== version.id)]);
  };

  const refreshAfterCompletedMutation = async (completedAction: string): Promise<PredrawnBackgroundVersion[] | null> => {
    try {
      return await refresh();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'The version list could not be reloaded.';
      setError(`${completedAction} The server confirmed the change, but the list could not be refreshed: ${detail}`);
      onStatus(completedAction, 'warning', `The durable change succeeded; list refresh failed. ${detail}`);
      return null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    setBusy('load');
    void listPredrawnBackgroundVersions(documentId).then((loaded) => {
      if (cancelled) return;
      setVersions(loaded);
      const artifacts = predrawnBoardArtifactWorkflow(loaded).artifacts;
      const preferred = predrawnBoardArtifactForSurface(artifacts, currentSurface) ?? artifacts[0];
      if (preferred) {
        setSelectedArtifactId(preferred.id);
        setRegistration(predrawnRegistrationForBackground(preferred.backgroundVersion, loaded));
      }
      setBusy(null);
    }).catch((cause) => {
      if (cancelled) return;
      setError(cause instanceof Error ? cause.message : 'Background versions could not be loaded.');
      setBusy(null);
    });
    return () => { cancelled = true; };
  }, [
    canonicalSurface?.backgroundVersionId,
    canonicalSurface?.occlusionVersionId,
    currentSurface?.backgroundVersionId,
    currentSurface?.occlusionVersionId,
    documentId,
  ]);

  const workflow = useMemo(() => predrawnBoardArtifactWorkflow(versions), [versions]);
  const artifacts = workflow.artifacts;
  const selectedArtifact = artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? artifacts[0];
  const selectedBackground = selectedArtifact?.backgroundVersion;
  const selectedMask = selectedArtifact?.occlusionVersion;
  const selectedMaskUsable = Boolean(selectedMask);
  const selectedIndex = Math.max(0, artifacts.findIndex((artifact) => artifact.id === selectedArtifact?.id));
  const workingArtifact = predrawnBoardArtifactForSurface(artifacts, currentSurface);
  const canonicalArtifact = predrawnBoardArtifactForSurface(artifacts, canonicalSurface);
  const liveStoredChildren = predrawnBoardArtifactStoredChildren(versions, selectedArtifact);
  const liveOcclusionChildren = versions.filter((version) => (
    version.kind === 'occlusion'
    && version.status !== 'archived'
    && version.source_background_version_id === selectedBackground?.id
  ));
  const selectedEnvironmentGeometry = environmentGeometryFromVersion(selectedBackground);
  const selectedMatchesCurrentGeometry = environmentGeometryMatches(
    selectedEnvironmentGeometry,
    currentEnvironmentGeometry,
  );
  const selectedPreviewReady = Boolean(
    selectedArtifact
    && selectedPreviewState?.artifactId === selectedArtifact.id
    && selectedPreviewState.status === 'ready',
  );
  const invalidStoredVersions = workflow.rejected.filter((rejection) => rejection.reason !== 'archived');

  const selectArtifact = (artifact: PredrawnBoardArtifact): void => {
    setSelectedArtifactId(artifact.id);
    setRegistration(predrawnRegistrationForBackground(artifact.backgroundVersion, versions));
    setInspectMask(artifact.stage === 'occlusion-ready');
  };

  const importRawBlob = async (
    sourceBlob: Blob,
    source: 'level-generation-output' | 'owner-upload',
    nextRegistration?: PredrawnBoardCornerRegistration,
    originalFileName?: string,
  ): Promise<void> => {
    if (!canWrite || !generationFrame || busy) return;
    setBusy('raw');
    setError(null);
    try {
      const fence = getEditFence();
      if (!fence) throw new Error('Take over editing before changing background versions.');
      await assertDecodablePngBlob(sourceBlob);
      const sha256 = await sha256Hex(sourceBlob);
      const environmentGeometrySha256 = await predrawnEnvironmentGeometrySha256(board);
      const rawWorldBounds = {
        minX: generationFrame.x,
        minY: generationFrame.y,
        width: generationFrame.width,
        height: generationFrame.height,
      };
      const rawIdentityHash = await sha256Hex(new Blob([JSON.stringify({
        schema: 'predrawn-raw-identity-v2',
        documentId,
        sha256,
        environmentGeometrySha256,
        worldBounds: rawWorldBounds,
      })]));
      const latest = await refresh();
      let version = reusablePredrawnRawVersion(latest, {
        documentId,
        sourceSha256: sha256,
        environmentGeometrySha256,
        worldBounds: rawWorldBounds,
      });
      version ??= await createPredrawnBackgroundVersion(documentId, {
          kind: 'raw',
          label: `Raw generation ${sha256.slice(0, 8)}`,
          world_bounds: rawWorldBounds,
          operation: {
            kind: 'raw-generated-v2',
            untouched: true,
            outputSha256: sha256,
            coordinateBasis: 'board-world-pixels-v1',
            viewingPane: rawWorldBounds,
            environmentGeometrySha256,
            environmentGeometrySchema: 'predrawn-environment-geometry-v2',
          },
          provenance: {
            sourceSha256: sha256,
            outputSha256: sha256,
            source,
            levelId,
            environmentGeometrySha256,
            ...(originalFileName ? { originalFileName: originalFileName.slice(0, 240) } : {}),
          },
          idempotency_key: predrawnBackgroundVersionIdempotencyKey(
            'raw',
            rawIdentityHash,
            crypto.randomUUID(),
          ),
        }, fence);
      upsertVersion(version);
      setSelectedArtifactId(version.id);
      if (!version.content_sha256) {
        version = await uploadPredrawnBackgroundVersionContent({
          documentId,
          versionId: version.id,
          expectedRevision: version.row_revision,
          bytes: sourceBlob,
          fence,
        });
      }
      upsertVersion(version);
      setSelectedArtifactId(version.id);
      setRegistration(nextRegistration);
      const refreshed = await refreshAfterCompletedMutation('The generated board was saved as an untouched artwork version.');
      if (refreshed) onStatus('Generated board added.', 'success', 'Its pixels are untouched and ready for grid adjustment.');
    } catch (cause) {
      if (onMutationError(cause)) {
        void refresh().catch(() => {});
        return;
      }
      void refresh().catch(() => {});
      const message = cause instanceof Error ? cause.message : 'The generated board could not be added.';
      setError(message);
      onStatus('Generated board import failed.', 'error', message);
    } finally {
      setBusy(null);
    }
  };

  const importMountedRaw = async (): Promise<void> => {
    if (!initialSourceSrc) return;
    try {
      const source = await sourcePngBlob(initialSourceSrc);
      await importRawBlob(source.blob, 'level-generation-output', initialRegistration);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The mounted background could not be loaded.';
      setError(message);
      onStatus('Generated board import failed.', 'error', message);
    }
  };

  const importUploadedRaw = async (file: File): Promise<void> => {
    await importRawBlob(file, 'owner-upload', undefined, file.name);
  };

  const generateWarp = async (): Promise<void> => {
    if (!canWrite || selectedBackground?.kind !== 'raw' || !selectedBackground.content_url || !registration || busy) return;
    setBusy('warp');
    setError(null);
    try {
      const fence = getEditFence();
      if (!fence) throw new Error('Take over editing before changing background versions.');
      const [currentLegacyGeometrySha256, currentGeometrySha256] = await Promise.all([
        legacyPredrawnEnvironmentGeometrySha256V1(board),
        predrawnEnvironmentGeometrySha256(board),
      ]);
      const sourceGeometry = environmentGeometryFromVersion(selectedBackground);
      if (!environmentGeometryMatches(sourceGeometry, { v1: currentLegacyGeometrySha256, v2: currentGeometrySha256 })) {
        throw new Error('This generated board belongs to an earlier environment layout. Add current generated art before fitting its grid.');
      }
      const generated = await generateWarpedPredrawnRaster({
        src: selectedBackground.content_url,
        registration,
        cells,
        environmentGeometrySha256: currentGeometrySha256,
      });
      const outputSha256 = await sha256Hex(generated.blob);
      const operation: Record<string, unknown> = { ...generated.operation, outputSha256 };
      const operationHash = await sha256Hex(new Blob([
        selectedBackground.id,
        JSON.stringify(operation),
      ]));
      const latest = await refresh();
      let version = latest.find((candidate) => (
        candidate.kind === 'warped'
        && candidate.status !== 'archived'
        && candidate.parent_version_id === selectedBackground.id
        && candidate.source_background_version_id === selectedBackground.id
        && candidate.operation.kind === operation.kind
        && candidate.operation.registration === operation.registration
        && candidate.operation.outputSha256 === outputSha256
        && candidate.operation.environmentGeometrySha256 === currentGeometrySha256
      ));
      version ??= await createPredrawnBackgroundVersion(documentId, {
        kind: 'warped',
        label: `Warped from ${versionLabel(selectedBackground)}`,
        parent_version_id: selectedBackground.id,
        source_background_version_id: selectedBackground.id,
        world_bounds: generated.worldBounds,
        operation,
        provenance: {
          processor: 'shared-predrawn-rasterizer-v1',
          parentVersionId: selectedBackground.id,
          environmentGeometrySha256: currentGeometrySha256,
          outputSha256,
        },
        idempotency_key: predrawnBackgroundVersionIdempotencyKey(
          'warp',
          operationHash,
          crypto.randomUUID(),
        ),
      }, fence);
      upsertVersion(version);
      if (!version.content_sha256) {
        version = await uploadPredrawnBackgroundVersionContent({
          documentId,
          versionId: version.id,
          expectedRevision: version.row_revision,
          bytes: generated.blob,
          fence,
        });
      }
      upsertVersion(version);
      setSelectedArtifactId(version.id);
      setRegistration(undefined);
      const refreshed = await refreshAfterCompletedMutation('The warped background version was saved.');
      if (refreshed) onStatus('The exact warped background version is ready.', 'success');
    } catch (cause) {
      if (onMutationError(cause)) {
        void refresh().catch(() => {});
        return;
      }
      void refresh().catch(() => {});
      const message = cause instanceof Error ? cause.message : 'The warped background could not be generated.';
      setError(message);
      onStatus('Background warp failed.', 'error', message);
    } finally {
      setBusy(null);
    }
  };

  const generateOcclusion = async (): Promise<void> => {
    if (
      !canWrite
      || selectedArtifact?.stage !== 'warped'
      || !selectedBackground?.content_url
      || !selectedBackground.frame_width
      || !selectedBackground.frame_height
      || busy
    ) return;
    setBusy('occlusion');
    setError(null);
    try {
      const fence = getEditFence();
      if (!fence) throw new Error('Take over editing before changing background versions.');
      const [currentLegacyGeometrySha256, currentGeometrySha256] = await Promise.all([
        legacyPredrawnEnvironmentGeometrySha256V1(board),
        predrawnEnvironmentGeometrySha256(board),
      ]);
      if (!environmentGeometryMatches(
        environmentGeometryFromVersion(selectedBackground),
        { v1: currentLegacyGeometrySha256, v2: currentGeometrySha256 },
      )) {
        throw new Error('This background belongs to an earlier environment layout. Generate or choose art for the current board before creating its mask.');
      }
      const generated = await generatePredrawnOcclusionDepthRaster({
        board,
        sourceSrc: selectedBackground.content_url,
        frameWidth: selectedBackground.frame_width,
        frameHeight: selectedBackground.frame_height,
        worldBounds: selectedBackground.world_bounds,
        sourceBackgroundVersionId: selectedBackground.id,
      });
      const outputSha256 = await sha256Hex(generated.blob);
      const operation: Record<string, unknown> = { ...generated.operation, outputSha256 };
      const operationHash = await sha256Hex(new Blob([
        selectedBackground.id,
        JSON.stringify(operation),
      ]));
      const latest = await refresh();
      let version = latest.find((candidate) => (
        candidate.kind === 'occlusion'
        && candidate.status !== 'archived'
        && candidate.source_background_version_id === selectedBackground.id
        && candidate.operation.kind === operation.kind
        && candidate.operation.outputSha256 === outputSha256
        && candidate.operation.environmentGeometrySha256 === generated.operation.environmentGeometrySha256
      ));
      version ??= await createPredrawnBackgroundVersion(documentId, {
        kind: 'occlusion',
        label: `Occlusion for ${versionLabel(selectedBackground)}`,
        source_background_version_id: selectedBackground.id,
        world_bounds: generated.worldBounds,
        operation,
        provenance: {
          processor: 'canonical-depth-mask-v1',
          sourceBackgroundVersionId: selectedBackground.id,
          environmentGeometrySha256: generated.operation.environmentGeometrySha256,
          outputSha256,
        },
        idempotency_key: predrawnBackgroundVersionIdempotencyKey(
          'occlusion',
          operationHash,
          crypto.randomUUID(),
        ),
      }, fence);
      upsertVersion(version);
      if (!version.content_sha256) {
        version = await uploadPredrawnBackgroundVersionContent({
          documentId,
          versionId: version.id,
          expectedRevision: version.row_revision,
          bytes: generated.blob,
          fence,
        });
      }
      upsertVersion(version);
      setSelectedArtifactId(version.id);
      setInspectMask(true);
      const refreshed = await refreshAfterCompletedMutation('The occlusion-ready board was saved.');
      if (refreshed) onStatus('The occlusion-ready board is ready.', 'success');
    } catch (cause) {
      if (onMutationError(cause)) {
        void refresh().catch(() => {});
        return;
      }
      void refresh().catch(() => {});
      const message = cause instanceof Error ? cause.message : 'The occlusion mask could not be generated.';
      setError(message);
      onStatus('Occlusion generation failed.', 'error', message);
    } finally {
      setBusy(null);
    }
  };

  const setSelected = (): void => {
    if (
      !selectedArtifact
      || !selectedBackground?.frame_width
      || !selectedBackground.frame_height
      || !selectedMatchesCurrentGeometry
    ) return;
    const surface = predrawnBoardSurfaceForArtifact(selectedArtifact);
    onSetSurface(surface);
    onStatus(
      `${selectedArtifact.title} selected in this tab.`,
      'info',
      `Waiting for fenced cloud autosave. ${canonicalActionLabel} remains a separate canonical action.`,
    );
  };

  const archiveSelected = async (): Promise<void> => {
    if (
      !canWrite
      || selectedArtifact?.version.kind === 'occlusion'
      || !selectedBackground
      || busy
      || selectedBackground.status === 'published'
      || currentSurface?.backgroundVersionId === selectedBackground.id
      || canonicalSurface?.backgroundVersionId === selectedBackground.id
      || liveStoredChildren.length > 0
    ) return;
    setBusy('archive');
    try {
      const fence = getEditFence();
      if (!fence) throw new Error('Take over editing before changing background versions.');
      const archived = await archivePredrawnBackgroundVersion({
        documentId,
        versionId: selectedBackground.id,
        expectedRevision: selectedBackground.row_revision,
        fence,
      });
      upsertVersion(archived);
      const loaded = await refreshAfterCompletedMutation('The background version was archived.');
      const loadedArtifacts = loaded ? predrawnBoardArtifactWorkflow(loaded).artifacts : [];
      const next = loadedArtifacts.find((artifact) => artifact.id === selectedArtifact?.parentArtifactId)
        ?? loadedArtifacts[0];
      setSelectedArtifactId(next?.id ?? '');
      setRegistration(next && loaded ? predrawnRegistrationForBackground(next.backgroundVersion, loaded) : undefined);
      if (loaded) onStatus('Background version archived.', 'success');
    } catch (cause) {
      if (onMutationError(cause)) return;
      const message = cause instanceof Error ? cause.message : 'The background version could not be archived.';
      setError(message);
      onStatus('Background archive failed.', 'error', message);
    } finally {
      setBusy(null);
    }
  };

  const archiveSelectedMask = async (): Promise<void> => {
    if (
      !canWrite
      || !selectedMask
      || selectedMask.document_id !== documentId
      || busy
      || selectedMask.status === 'published'
      || currentSurface?.occlusionVersionId === selectedMask.id
      || canonicalSurface?.occlusionVersionId === selectedMask.id
      || liveStoredChildren.length > 0
    ) return;
    setBusy('archive-mask');
    try {
      const fence = getEditFence();
      if (!fence) throw new Error('Take over editing before changing background versions.');
      const archived = await archivePredrawnBackgroundVersion({
        documentId,
        versionId: selectedMask.id,
        expectedRevision: selectedMask.row_revision,
        fence,
      });
      upsertVersion(archived);
      const refreshed = await refreshAfterCompletedMutation('The occlusion version was archived.');
      const refreshedArtifacts = refreshed ? predrawnBoardArtifactWorkflow(refreshed).artifacts : [];
      const next = refreshedArtifacts.find((artifact) => artifact.id === selectedArtifact?.parentArtifactId)
        ?? refreshedArtifacts[0];
      setSelectedArtifactId(next?.id ?? '');
      setRegistration(next && refreshed ? predrawnRegistrationForBackground(next.backgroundVersion, refreshed) : undefined);
      if (refreshed) onStatus('Occlusion version archived.', 'success');
    } catch (cause) {
      if (onMutationError(cause)) return;
      const message = cause instanceof Error ? cause.message : 'The occlusion version could not be archived.';
      setError(message);
      onStatus('Occlusion archive failed.', 'error', message);
    } finally {
      setBusy(null);
    }
  };

  const selectedOwned = selectedArtifact?.version.document_id === documentId;
  const previewSrc = selectedBackground?.content_url
    ? predrawnBackgroundVersionContentUrl(selectedBackground.id)
    : undefined;
  const selectedMaskSrc = selectedMask?.content_url
    ? predrawnBackgroundVersionContentUrl(selectedMask.id)
    : undefined;
  const active = Boolean(selectedArtifact && selectedArtifact.id === workingArtifact?.id);
  const canonicalActive = Boolean(selectedArtifact && selectedArtifact.id === canonicalArtifact?.id);
  const selectedBackgroundArchivable = predrawnBackgroundCanArchive({
    background: selectedBackground,
    documentId,
    currentSurface,
    canonicalSurface,
    liveMaskCount: liveOcclusionChildren.length,
  });
  const selectedArtifactArchivable = selectedMask
    ? selectedMask.document_id === documentId
      && selectedMask.status !== 'published'
      && currentSurface?.occlusionVersionId !== selectedMask.id
      && canonicalSurface?.occlusionVersionId !== selectedMask.id
      && liveStoredChildren.length === 0
    : selectedBackgroundArchivable && liveStoredChildren.length === 0;
  const canonicalStateLabel = canonicalActionLabel === 'Publish' ? 'Published' : 'Saved';
  const selectedParentArtifact = artifacts.find((artifact) => artifact.id === selectedArtifact?.parentArtifactId);
  const workingSelectionState = workingCopySyncState === 'saved'
    ? 'Cloud working copy synced'
    : workingCopySyncState === 'pending' || workingCopySyncState === 'saving'
      ? 'Cloud autosave pending'
      : workingCopySyncState === 'error' || workingCopySyncState === 'conflict'
        ? 'Cloud autosave blocked'
        : 'This tab only';

  return (
    <div className="le-predrawn-version-manager" data-testid="predrawn-background-version-manager">
      <div className="le-predrawn-version-heading">
        <div>
          <span className="skirmish-eyebrow">Board artwork</span>
          <strong>Artwork history</strong>
        </div>
        <span>{artifacts.length} version{artifacts.length === 1 ? '' : 's'}</span>
      </div>
      <div className="le-predrawn-version-state" data-testid="predrawn-background-version-state">
        <span><strong>Working:</strong> {surfaceSelectionLabel(workingArtifact, currentSurface)} · {workingSelectionState}</span>
        <span><strong>{canonicalStateLabel}:</strong> {surfaceSelectionLabel(canonicalArtifact, canonicalSurface)}</span>
      </div>
      <div className="le-predrawn-artifact-browser">
        <div className="le-predrawn-artifact-track" role="list" aria-label="Board artwork versions">
          {artifacts.map((artifact, index) => {
            const artifactPreviewSrc = predrawnBackgroundVersionContentUrl(artifact.backgroundVersion.id);
            const isSelected = artifact.id === selectedArtifact?.id;
            const isWorking = artifact.id === workingArtifact?.id;
            const isCanonical = artifact.id === canonicalArtifact?.id;
            const previousArtifact = index > 0 ? artifacts[index - 1] : undefined;
            const parentArtifact = artifacts.find((candidate) => candidate.id === artifact.parentArtifactId);
            const followsPrevious = Boolean(parentArtifact && parentArtifact.id === previousArtifact?.id);
            return (
              <div className="le-predrawn-artifact-track-item" role="listitem" key={artifact.id}>
                {index > 0 ? (
                  <span
                    className={`le-predrawn-artifact-connector${followsPrevious ? '' : ' is-branch'}`}
                    aria-hidden="true"
                    title={parentArtifact ? `Alternative created from ${parentArtifact.title}` : 'Separate artwork run'}
                  >{followsPrevious ? '→' : parentArtifact ? '↳' : '•'}</span>
                ) : null}
                <button
                  type="button"
                  data-chrome-unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-predrawn-artifact-card', isSelected && 'active')}
                  aria-pressed={isSelected}
                  data-stage={artifact.stage}
                  onClick={() => selectArtifact(artifact)}
                >
                  <img src={artifactPreviewSrc} alt="" aria-hidden="true" loading="lazy" decoding="async" fetchPriority="low" />
                  <span className="le-predrawn-artifact-card-copy">
                    <small>{parentArtifact ? `From ${parentArtifact.title}` : 'New artwork run'}</small>
                    <strong>{artifact.title}</strong>
                    <span>{isWorking ? 'Working' : ''}{isWorking && isCanonical ? ' · ' : ''}{isCanonical ? canonicalStateLabel : ''}{!isWorking && !isCanonical ? createdLabel(artifact.version) : ''}</span>
                  </span>
                </button>
              </div>
            );
          })}
          {!artifacts.length ? (
            <div className="le-predrawn-artifact-empty" role="status">
              <strong>No artwork versions yet</strong>
              <span>Add the untouched generated PNG to start this board’s artwork history.</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="le-predrawn-version-nav" aria-label="Browse artwork versions">
        <button
          type="button"
          data-chrome-unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
          disabled={selectedIndex <= 0}
          onClick={() => { const artifact = artifacts[selectedIndex - 1]; if (artifact) selectArtifact(artifact); }}
          aria-label="Previous artwork version"
        >‹</button>
        <span>{artifacts.length ? `${selectedIndex + 1} / ${artifacts.length}` : '0 / 0'}</span>
        <button
          type="button"
          data-chrome-unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
          disabled={selectedIndex >= artifacts.length - 1}
          onClick={() => { const artifact = artifacts[selectedIndex + 1]; if (artifact) selectArtifact(artifact); }}
          aria-label="Next artwork version"
        >›</button>
      </div>

      {selectedArtifact && selectedBackground ? (
        <section className="le-predrawn-artifact-detail" data-stage={selectedArtifact.stage} aria-labelledby="predrawn-selected-artifact-title">
          <div className="le-predrawn-artifact-preview">
            <PredrawnArtifactBoardPreview
              key={selectedArtifact.id}
              artifact={selectedArtifact}
              board={board}
              onStateChange={setSelectedPreviewState}
            />
            <span className="le-predrawn-artifact-stage-pill">{selectedArtifact.title}</span>
          </div>
          <div className="le-predrawn-version-meta">
            <span className="skirmish-eyebrow">Selected version</span>
            <h3 id="predrawn-selected-artifact-title">{selectedArtifact.title}</h3>

            {selectedArtifact.stage === 'generated' ? (
              <div className="le-predrawn-workflow-action-group is-next-step">
                <span className="skirmish-eyebrow">Next: fit the board grid</span>
                <p>Adjust the grid on this untouched board, then create its separate warped version.</p>
                <div className="le-predrawn-version-actions">
                  <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} disabled={!canWrite || !selectedOwned || !selectedBackground.content_url || !selectedMatchesCurrentGeometry || Boolean(busy)} onClick={() => setPickerOpen(true)} title="Visually fit the board grid over this generated board. This stages alignment; it does not change the art yet.">
                    Adjust grid
                  </button>
                  <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'active')} disabled={!canWrite || !selectedOwned || !selectedBackground.content_url || !registration || !selectedMatchesCurrentGeometry || Boolean(busy)} onClick={() => { void generateWarp(); }} title="Apply the staged grid once and save the result as a new immutable board version.">
                    {busy === 'warp' ? 'Generating warped board…' : 'Generate warped board'}
                  </button>
                </div>
              </div>
            ) : null}

            {selectedArtifact.stage === 'warped' ? (
              <div className="le-predrawn-workflow-action-group is-next-step">
                <span className="skirmish-eyebrow">Next: apply unit occlusion</span>
                <p>Create a separate version that lets scenery pass in front of live units.</p>
                <div className="le-predrawn-version-actions">
                  <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'active')} disabled={!canWrite || !selectedOwned || !selectedBackground.content_url || !selectedBackground.frame_width || !selectedBackground.frame_height || !selectedMatchesCurrentGeometry || Boolean(busy)} onClick={() => { void generateOcclusion(); }} title="Generate the depth data for this exact warped board and save both as one selectable artwork version.">
                    {busy === 'occlusion' ? 'Generating occlusion-ready board…' : 'Generate occlusion-ready board'}
                  </button>
                </div>
              </div>
            ) : null}

            {selectedArtifact.stage === 'occlusion-ready' ? (
              <div className="le-predrawn-workflow-action-group is-finished">
                <span className="skirmish-eyebrow">Occlusion applied</span>
                <p>This version carries depth data for live units after it is Set on the board. Artifact previews stay unit-free.</p>
                <button
                  type="button"
                  data-chrome-unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  disabled={!selectedMaskUsable}
                  aria-pressed={inspectMask}
                  title="Inspect the attached depth data as a far-to-near heatmap."
                  onClick={() => setInspectMask((value) => !value)}
                >{inspectMask ? 'Hide depth inspection' : 'Inspect depth'}</button>
              </div>
            ) : null}

            <div className="le-predrawn-version-actions le-predrawn-selection-actions">
              <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', active && 'active')} disabled={!canWrite || !selectedBackground.content_url || !selectedBackground.frame_width || !selectedBackground.frame_height || !selectedMatchesCurrentGeometry || !selectedPreviewReady || Boolean(busy) || active} onClick={setSelected} title={selectedPreviewReady ? `Use this exact artwork version in the editor working copy. ${canonicalActionLabel} is still required to make it canonical.` : 'Wait for the exact live board preview to paint successfully before setting this version.'}>
                {active
                  ? workingCopySyncState === 'saved'
                    ? 'Set · cloud synced'
                    : workingCopySyncState === 'pending' || workingCopySyncState === 'saving'
                      ? 'Set · autosave pending'
                      : workingCopySyncState === 'error' || workingCopySyncState === 'conflict'
                        ? 'Set · autosave blocked'
                        : 'Set in this tab'
                  : 'Set this board version'}
              </button>
              <button
                type="button"
                data-chrome-unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                disabled={!active || !selectedPreviewReady || workingCopySyncState !== 'saved' || Boolean(busy)}
                onClick={onOpenCanonicalAction}
                title={`Open Status to review and ${canonicalActionLabel.toLowerCase()} this cloud-synced working selection.`}
              >{canonicalActionLabel === 'Publish' ? 'Review & publish' : 'Review & save'}</button>
            </div>
            <span>{selectedBackground.frame_width ?? '—'} × {selectedBackground.frame_height ?? '—'} px · {createdLabel(selectedArtifact.version)}</span>
            <span>{selectedParentArtifact ? `Created from ${selectedParentArtifact.title}` : 'Untouched generated source'}</span>
            <span>{active ? `Working · ${workingSelectionState}` : 'Not set on the working copy'}</span>
            <span>{canonicalActive ? `${canonicalStateLabel} canonical version` : `${canonicalActionLabel} has not made this version canonical`}</span>
          </div>
        </section>
      ) : null}

      <section className="le-predrawn-workflow-actions" aria-label="Artwork workflow actions">
        <div className="le-predrawn-workflow-action-group">
          <span className="skirmish-eyebrow">{artifacts.length ? 'Add another generated board' : 'Start from generated art'}</span>
          <p>{artifacts.length ? 'Begin a separate artwork run without changing the selected history.' : 'Add the untouched generated board to begin.'}</p>
          <div className="le-predrawn-version-actions">
        <input
          ref={uploadInputRef}
          className="le-predrawn-raw-file-input"
          data-testid="predrawn-raw-file-input"
          type="file"
          accept="image/png,.png"
          disabled={!canWrite || !generationFrame || Boolean(busy)}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void importUploadedRaw(file);
          }}
        />
        <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} disabled={!canWrite || !generationFrame || Boolean(busy)} onClick={() => uploadInputRef.current?.click()} title={generationFrame ? 'Add an untouched generated PNG as a new board version.' : 'Choose the generation frame before adding art.'}>
          {busy === 'raw' ? 'Adding generated board…' : 'Add generated PNG'}
        </button>
        {initialSourceSrc ? (
          <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} disabled={!canWrite || !generationFrame || Boolean(busy)} onClick={() => { void importMountedRaw(); }} title="Save the mounted AI generation as a new immutable root version.">
            {busy === 'raw' ? 'Adding generated board…' : 'Add mounted generation'}
          </button>
        ) : null}
          </div>
        </div>
      </section>

      {inspectMask && selectedMask && selectedMaskSrc && previewSrc ? (
        <PredrawnOcclusionDepthPreview
          backgroundSrc={previewSrc}
          maskSrc={selectedMaskSrc}
          maskLabel={versionLabel(selectedMask)}
        />
      ) : null}
      <div className="le-predrawn-version-actions le-predrawn-maintenance-actions">
        <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} disabled={!canWrite || !selectedArtifactArchivable || Boolean(busy)} onClick={() => { if (selectedMask) void archiveSelectedMask(); else void archiveSelected(); }} title={liveStoredChildren.length ? 'Archive its later board versions first, including any unfinished uploads.' : selectedMask ? 'Archive this unused occlusion-ready board version.' : 'Archive this unused artwork version. Canonical or working versions remain protected.'}>
          {busy === 'archive' || busy === 'archive-mask' ? 'Archiving…' : 'Archive version'}
        </button>
      </div>
      {selectedBackground?.kind === 'raw' && registration && selectedMatchesCurrentGeometry ? <output className="le-predrawn-version-ready">Grid ready — generate a warped child when the preview looks right.</output> : null}
      {selectedBackground && currentEnvironmentGeometry && !selectedMatchesCurrentGeometry ? <output className="le-predrawn-version-error" role="alert">This version belongs to an earlier environment layout and cannot be derived or Set on the current board.</output> : null}
      {invalidStoredVersions.length ? <output className="le-predrawn-version-error" role="alert">{invalidStoredVersions.length} incomplete or invalid stored version{invalidStoredVersions.length === 1 ? ' is' : 's are'} hidden from this workflow.</output> : null}
      <output className="le-predrawn-version-help">Set changes the editor working copy. {canonicalActionLabel} makes that exact board version canonical.</output>
      {error ? <output className="le-predrawn-version-error" role="alert">{error}</output> : null}
      {pickerOpen && selectedBackground?.content_url && selectedOwned ? (
        <PredrawnCornerPicker
          src={predrawnBackgroundVersionContentUrl(selectedBackground.id)}
          initialRegistration={registration ?? predrawnRegistrationForBackground(selectedBackground, versions)}
          columns={board.cols}
          rows={board.rows}
          onChange={setRegistration}
          onSaveRegistration={(next) => {
            setRegistration(next);
            setPickerOpen(false);
            onStatus(
              'Grid adjustment staged.',
              'success',
              'No art changed yet. Choose Generate warped board to create the next immutable version.',
            );
          }}
          saveLabel="USE THIS GRID"
          showCodexHandoff={false}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}
