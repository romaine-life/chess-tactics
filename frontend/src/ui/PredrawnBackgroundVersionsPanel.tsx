import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  predrawnWorldBoundsBoardPan,
  type BoardBackgroundMode,
  type EditorBoard,
  type PredrawnBoardCornerRegistration,
  type PredrawnGenerationFrame,
  type PredrawnMoveHighlightCells,
  type VersionedPredrawnBoardSurface,
} from '@chess-tactics/board-render';
import {
  archivePredrawnGenerationAttempt,
  createPredrawnBackgroundVersion,
  createPredrawnGenerationAttempt,
  discardPredrawnGenerationAttemptOcclusion,
  discardPredrawnGenerationAttemptWarp,
  listPredrawnBackgroundVersions,
  listPredrawnGenerationAttempts,
  predrawnBackgroundVersionContentUrl,
  updatePredrawnGenerationAttemptMoveHighlightProfile,
  uploadPredrawnBackgroundVersionContent,
  type PredrawnBackgroundVersion,
  type PredrawnGenerationAttempt,
  type PredrawnGenerationAttemptWorkspaceMutationResult,
} from '../net/predrawnBackgroundVersions';
import {
  assertDecodablePngBlob,
  generateWarpedPredrawnRaster,
  legacyPredrawnEnvironmentGeometrySha256V1,
  predrawnEnvironmentGeometrySha256,
  sourcePngBlob,
  predrawnOcclusionDepthHeatmapPixels,
  type PredrawnOcclusionDepthHeatmap,
} from '../render/predrawnBackgroundProcessing';
import {
  generatePredrawnRasterSelectionOcclusion,
} from '../render/predrawnRasterOcclusion';
import { loadDecodedImage } from '../render/imageResources';
import { StudioReadOnlyBoard } from '../render/StudioReadOnlyBoard';
import {
  storedPredrawnBoardRegistration,
  storePredrawnBoardRegistration,
} from '../render/PredrawnBoardLayer';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { PredrawnCornerPicker } from './PredrawnCornerPicker';
import { PredrawnMoveHighlightEditor } from './PredrawnMoveHighlightEditor';
import {
  PredrawnOcclusionEditor,
  type PredrawnOcclusionMaskDraft,
} from './PredrawnOcclusionEditor';
import { PredrawnWarpInspector } from './PredrawnWarpInspector';
import {
  predrawnDirectRegistrationForBackground,
  predrawnBackgroundVersionIdempotencyKey,
  predrawnRegistrationForBackground,
} from './predrawnBackgroundVersionPolicy';
import {
  predrawnBoardArtifactForSurface,
  predrawnBoardSurfaceForBackgroundVersion,
  predrawnBoardSurfacesEqual,
  predrawnBoardSurfaceForArtifact,
  type PredrawnBoardArtifact,
} from './predrawnBoardArtifacts';
import {
  nextPredrawnPipelineSourceAttemptCreationIntent,
  predrawnAttemptArchiveAction,
  predrawnAttemptArchivePolicy,
  predrawnAttemptCanProcess,
  predrawnAttemptForSurface,
  predrawnCreationAttemptModels,
  predrawnLatestCommittedArtifact,
  type PredrawnCreationAttemptModel,
  type PredrawnPipelineSourceAttemptCreationIntent,
} from './predrawnCreationAttempts';
import {
  copyPredrawnPngToClipboard,
  createPredrawnPngIngressGuard,
  predrawnPngFromPasteEvent,
  readPredrawnPngFromClipboard,
  type PredrawnPngIngressGuard,
  type PredrawnPngIngressOperation,
} from './predrawnImageClipboard';
import type { EditorDocumentEditFence } from '../net/editorDocuments';
import { HouseSelect } from './shared/HouseSelect';
import { useConfirm } from './shared/ConfirmDialog';
import { navigateApp } from './navigation';
import {
  predrawnOcclusionEditorArtifactId,
  predrawnOcclusionEditorHref,
} from './predrawnOcclusionEditorRoute';
import { ChromeButton } from './shared/ChromeButton';

type StatusTone = 'info' | 'success' | 'warning' | 'error';
type AttemptCreationFeedback = {
  tone: 'info' | 'success' | 'error';
  message: string;
};
type ArchiveActionSnapshot = {
  attemptId: string | null;
  attemptRevision: number | null;
  documentRevision: number;
  action: ReturnType<typeof predrawnAttemptArchiveAction>;
  confirmationTitle: string;
  confirmationMessage: string;
};
type OcclusionDiscardTargetSnapshot = {
  attemptId: string;
  attemptRevision: number;
  occlusionVersionId: string;
  warpedArtifactId: string;
  documentRevision: number;
  disabledReason?: string;
};

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function versionLabel(version: PredrawnBackgroundVersion): string {
  const stage = version.kind === 'raw'
    ? 'Raw'
    : version.kind === 'warped'
      ? 'Warped'
      : 'Board with occlusion mask';
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
  profileSha256: string | null;
  status: 'loading' | 'ready' | 'error';
  message?: string;
};

function moveHighlightProfileSha256(
  surface: VersionedPredrawnBoardSurface,
): string | null {
  return surface.schemaVersion === 3
    ? surface.moveHighlightProfile.profileSha256
    : null;
}

type StagedPipelineSource = {
  attemptId: string;
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
  source: 'owner-upload' | 'manual-clipboard-handoff';
  originalFileName?: string;
};

const NEW_AI_ARTWORK_INTAKE_ID = 'new-ai-artwork-intake';

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
  const profileSha256 = moveHighlightProfileSha256(surface);
  const previewBoard = useMemo<EditorBoard>(() => ({
    ...board,
    backgroundMode: 'ai',
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
    onStateChange({
      artifactId: artifact.id,
      profileSha256,
      status: 'error',
      message,
    });
  }, [artifact.id, onStateChange, profileSha256]);

  useEffect(() => {
    onStateChange({ artifactId: artifact.id, profileSha256, status: 'loading' });
  }, [artifact.id, onStateChange, profileSha256]);

  useEffect(() => {
    if (paintedLayers !== 3 || paintError) return;
    onStateChange({ artifactId: artifact.id, profileSha256, status: 'ready' });
  }, [artifact.id, onStateChange, paintError, paintedLayers, profileSha256]);

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

  const previewStatus = paintError ? (
    <span className="le-predrawn-artifact-preview-status is-error" role="alert">Preview failed · {paintError}</span>
  ) : paintedLayers !== 3 ? (
    <span className="le-predrawn-artifact-preview-status" role="status">Painting live board preview…</span>
  ) : null;

  return (
    <div
      ref={stageRef}
      className="le-predrawn-artifact-live-preview"
      data-stage={artifact.stage}
      data-painted-layers={paintedLayers}
      aria-label={`Live board preview of ${artifact.title}`}
    >
      <StudioReadOnlyBoard
        key={`${artifact.id}:${profileSha256 ?? 'uncalibrated'}`}
        board={previewBoard}
        boardZoom={displayScale}
        boardPan={previewPan}
        hidden={{ tile: false, unit: true, doodad: false }}
        ariaLabel={`Live board preview of ${artifact.title}`}
        onTerrainFirstFrame={acknowledgeTerrain}
        onSceneFirstFrame={acknowledgeScene}
        onFrameError={failPaint}
      />
      {previewStatus}
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
  initialSourceSrc,
  initialRegistration,
  documentRevision,
  workingBackgroundMode,
  currentSurface,
  canonicalBackgroundMode,
  canonicalSurface,
  canonicalActionLabel,
  workingCopySyncState,
  canWrite,
  getEditFence,
  onSetSurface,
  onDocumentUpdated,
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
  documentRevision: number;
  workingBackgroundMode: BoardBackgroundMode;
  currentSurface?: VersionedPredrawnBoardSurface;
  canonicalBackgroundMode?: BoardBackgroundMode;
  canonicalSurface?: VersionedPredrawnBoardSurface;
  canonicalActionLabel: 'Save' | 'Publish';
  workingCopySyncState: 'loading' | 'local' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict' | 'signed-out';
  canWrite: boolean;
  getEditFence: () => EditorDocumentEditFence | null;
  onSetSurface: (surface: VersionedPredrawnBoardSurface) => void;
  onDocumentUpdated: (result: PredrawnGenerationAttemptWorkspaceMutationResult) => void;
  onOpenCanonicalAction: () => void;
  onMutationError: (error: unknown) => boolean;
  onStatus: (message: string, tone?: StatusTone, detail?: string) => void;
}): ReactElement {
  const [versions, setVersions] = useState<PredrawnBackgroundVersion[]>([]);
  const [attempts, setAttempts] = useState<PredrawnGenerationAttempt[]>([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState('');
  const [newPipelineSourceId, setNewPipelineSourceId] = useState('');
  const [attemptCreationFeedback, setAttemptCreationFeedback] = useState<AttemptCreationFeedback | null>(null);
  const [archiveActionFeedback, setArchiveActionFeedback] = useState<AttemptCreationFeedback | null>(null);
  const [warpDiscardFeedback, setWarpDiscardFeedback] = useState<AttemptCreationFeedback | null>(null);
  const [occlusionDiscardFeedback, setOcclusionDiscardFeedback] = useState<AttemptCreationFeedback | null>(null);
  const [occlusionEditorNotice, setOcclusionEditorNotice] = useState<string | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState(
    currentSurface?.occlusionVersionId ?? currentSurface?.backgroundVersionId ?? '',
  );
  const pngIngressGuardRef = useRef<PredrawnPngIngressGuard | null>(null);
  if (!pngIngressGuardRef.current) {
    pngIngressGuardRef.current = createPredrawnPngIngressGuard(selectedAttemptId);
  }
  const pngIngressGuard = pngIngressGuardRef.current;
  const selectAttemptId = (attemptId: string): void => {
    pngIngressGuard.selectAttempt(attemptId);
    setSelectedAttemptId(attemptId);
  };
  const [registration, setRegistration] = useState<PredrawnBoardCornerRegistration | undefined>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [inspectedArtifactId, setInspectedArtifactId] = useState<string | null>(null);
  const [moveHighlightEditorArtifactId, setMoveHighlightEditorArtifactId] = useState<string | null>(null);
  const [occlusionEditorArtifactId, setOcclusionEditorArtifactId] = useState<string | null>(
    () => predrawnOcclusionEditorArtifactId(window.location.search),
  );
  const [inspectMask, setInspectMask] = useState(true);
  const [busy, setBusy] = useState<
    'load'
    | 'pipeline-attempt'
    | 'raw'
    | 'warp'
    | 'move-highlight'
    | 'occlusion'
    | 'discard-occlusion'
    | 'discard-warp'
    | 'archive'
    | null
  >('load');
  const [handoffBusy, setHandoffBusy] = useState<'copy' | 'paste' | 'file' | null>(null);
  const [clipboardStatus, setClipboardStatus] = useState<string | null>(null);
  const [clipboardStatusTone, setClipboardStatusTone] = useState<'success' | 'error'>('success');
  const setOcclusionEditorRoute = useCallback((artifactId: string | null): void => {
    setOcclusionEditorArtifactId(artifactId);
    navigateApp(predrawnOcclusionEditorHref(window.location.href, artifactId), {
      replace: true,
      scroll: false,
    });
  }, []);
  const [stagedPipelineSource, setStagedPipelineSource] = useState<StagedPipelineSource>();
  const stagedPipelineSourceUrlRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentEnvironmentGeometry, setCurrentEnvironmentGeometry] = useState<{ v1: string; v2: string } | null>(null);
  const [selectedPreviewState, setSelectedPreviewState] = useState<ArtifactPreviewState | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const newArtworkInputRef = useRef<HTMLInputElement>(null);
  const { ask: askArchiveConfirmation, dialog: archiveConfirmDialog } = useConfirm();
  const { ask: askDiscardWarpConfirmation, dialog: discardWarpConfirmDialog } = useConfirm();
  const {
    ask: askDiscardOcclusionConfirmation,
    dialog: discardOcclusionConfirmDialog,
  } = useConfirm();
  const pipelineSourceAttemptCreationIntentRef = useRef<
    PredrawnPipelineSourceAttemptCreationIntent | undefined
  >(undefined);
  const archiveActionSnapshotRef = useRef<ArchiveActionSnapshot | null>(null);
  const occlusionDiscardTargetsRef = useRef<{
    selected?: OcclusionDiscardTargetSnapshot;
    inspected?: OcclusionDiscardTargetSnapshot;
  }>({});

  const clearStagedPipelineSource = useCallback((): void => {
    const previewUrl = stagedPipelineSourceUrlRef.current;
    stagedPipelineSourceUrlRef.current = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setStagedPipelineSource(undefined);
  }, []);

  const replaceStagedPipelineSource = useCallback((source: StagedPipelineSource): void => {
    const previousPreviewUrl = stagedPipelineSourceUrlRef.current;
    stagedPipelineSourceUrlRef.current = source.previewUrl;
    if (previousPreviewUrl) URL.revokeObjectURL(previousPreviewUrl);
    setStagedPipelineSource(source);
  }, []);

  useEffect(() => {
    pngIngressGuard.activate();
    return () => {
      pngIngressGuard.dispose();
      const previewUrl = stagedPipelineSourceUrlRef.current;
      stagedPipelineSourceUrlRef.current = null;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [pngIngressGuard]);

  useEffect(() => {
    if (
      !stagedPipelineSource
      || stagedPipelineSource.attemptId === NEW_AI_ARTWORK_INTAKE_ID
      || stagedPipelineSource?.attemptId === selectedAttemptId
    ) return;
    clearStagedPipelineSource();
    setHandoffBusy((current) => current === 'paste' || current === 'file' ? null : current);
    setClipboardStatus(null);
    setClipboardStatusTone('success');
  }, [clearStagedPipelineSource, selectedAttemptId, stagedPipelineSource?.attemptId]);

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

  const refresh = async (): Promise<{
    versions: PredrawnBackgroundVersion[];
    attempts: PredrawnGenerationAttempt[];
  }> => {
    setError(null);
    const [loadedVersions, loadedAttempts] = await Promise.all([
      listPredrawnBackgroundVersions(documentId),
      listPredrawnGenerationAttempts(documentId),
    ]);
    setVersions(loadedVersions);
    setAttempts(loadedAttempts);
    return { versions: loadedVersions, attempts: loadedAttempts };
  };

  const upsertVersion = (version: PredrawnBackgroundVersion): void => {
    setVersions((current) => [version, ...current.filter((candidate) => candidate.id !== version.id)]);
  };

  const refreshAfterCompletedMutation = async (
    completedAction: string,
  ): Promise<{ versions: PredrawnBackgroundVersion[]; attempts: PredrawnGenerationAttempt[] } | null> => {
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
    void Promise.all([
      listPredrawnBackgroundVersions(documentId),
      listPredrawnGenerationAttempts(documentId),
    ]).then(([loaded, loadedAttempts]) => {
      if (cancelled) return;
      setVersions(loaded);
      setAttempts(loadedAttempts);
      const models = predrawnCreationAttemptModels(loadedAttempts, loaded);
      const preferredAttempt = predrawnAttemptForSurface(models, currentSurface)
        ?? models[0];
      const artifacts = preferredAttempt?.artifacts ?? [];
      const preferred = predrawnBoardArtifactForSurface(artifacts, currentSurface)
        ?? predrawnLatestCommittedArtifact(preferredAttempt);
      selectAttemptId(preferredAttempt?.attempt.id ?? '');
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
    canonicalSurface?.schemaVersion === 3
      ? canonicalSurface.moveHighlightProfile.profileSha256
      : null,
    currentSurface?.backgroundVersionId,
    currentSurface?.occlusionVersionId,
    currentSurface?.schemaVersion === 3
      ? currentSurface.moveHighlightProfile.profileSha256
      : null,
    documentId,
  ]);

  const attemptModels = useMemo(
    () => predrawnCreationAttemptModels(attempts, versions),
    [attempts, versions],
  );
  const selectedAttempt = attemptModels.find((model) => model.attempt.id === selectedAttemptId)
    ?? predrawnAttemptForSurface(attemptModels, currentSurface)
    ?? attemptModels[0];
  const artifacts = selectedAttempt?.artifacts ?? [];
  const selectedArtifact = artifacts.find((artifact) => artifact.id === selectedArtifactId)
    ?? predrawnLatestCommittedArtifact(selectedAttempt);
  const selectedBackground = selectedArtifact?.backgroundVersion;
  const selectedMask = selectedArtifact?.occlusionVersion;
  const selectedMaskUsable = Boolean(selectedMask);
  const selectedIndex = Math.max(0, artifacts.findIndex((artifact) => artifact.id === selectedArtifact?.id));
  const selectedAttemptIndex = Math.max(
    0,
    attemptModels.findIndex((model) => model.attempt.id === selectedAttempt?.attempt.id),
  );
  const allArtifacts = attemptModels.flatMap((model) => model.artifacts);
  const inspectedAttempt = inspectedArtifactId
    ? attemptModels.find((model) => model.artifacts.some((artifact) => artifact.id === inspectedArtifactId))
    : undefined;
  const inspectedArtifact = inspectedAttempt?.artifacts.find(
    (artifact) => artifact.id === inspectedArtifactId,
  );
  const moveHighlightEditorAttempt = moveHighlightEditorArtifactId
    ? attemptModels.find((model) => model.warped?.id === moveHighlightEditorArtifactId)
    : undefined;
  const moveHighlightEditorArtifact = moveHighlightEditorAttempt?.warped?.id
    === moveHighlightEditorArtifactId
    ? moveHighlightEditorAttempt.warped
    : undefined;
  const occlusionEditorAttempt = occlusionEditorArtifactId
    ? attemptModels.find((model) => model.warped?.id === occlusionEditorArtifactId)
    : undefined;
  const occlusionEditorArtifact = occlusionEditorAttempt?.warped?.id
    === occlusionEditorArtifactId
    ? occlusionEditorAttempt.warped
    : undefined;
  useEffect(() => {
    if (!occlusionEditorAttempt || !occlusionEditorArtifact) return;
    if (
      selectedAttemptId === occlusionEditorAttempt.attempt.id
      && selectedArtifactId === occlusionEditorArtifact.id
    ) return;
    selectAttemptId(occlusionEditorAttempt.attempt.id);
    setSelectedArtifactId(occlusionEditorArtifact.id);
    setRegistration(predrawnRegistrationForBackground(
      occlusionEditorArtifact.backgroundVersion,
      versions,
    ));
    setInspectMask(false);
  }, [
    occlusionEditorArtifact?.id,
    occlusionEditorAttempt?.attempt.id,
    selectedArtifactId,
    selectedAttemptId,
    versions,
  ]);
  const inspectedRegistration = inspectedArtifact
    ? predrawnDirectRegistrationForBackground(inspectedArtifact.backgroundVersion)
    : undefined;
  const workingArtifact = predrawnBoardArtifactForSurface(allArtifacts, currentSurface);
  const canonicalArtifact = predrawnBoardArtifactForSurface(allArtifacts, canonicalSurface);
  const selectedEnvironmentGeometry = environmentGeometryFromVersion(selectedBackground);
  const selectedMatchesCurrentGeometry = environmentGeometryMatches(
    selectedEnvironmentGeometry,
    currentEnvironmentGeometry,
  );
  const selectedPreviewMatchesArtifact = Boolean(
    selectedArtifact
    && selectedPreviewState?.artifactId === selectedArtifact.id
    && selectedPreviewState.profileSha256
      === moveHighlightProfileSha256(selectedArtifact.surface),
  );
  const selectedPreviewReady = Boolean(
    selectedPreviewMatchesArtifact
    && selectedPreviewState?.status === 'ready',
  );
  const invalidAttempts = attemptModels.filter((model) => model.issue);
  const selectedAttemptCanProcess = predrawnAttemptCanProcess(selectedAttempt);
  const generatedSlotOccupied = Boolean(selectedAttempt?.attempt.generated_version_id);
  const warpedSlotOccupied = Boolean(selectedAttempt?.attempt.warped_version_id);
  const occlusionSlotOccupied = Boolean(selectedAttempt?.attempt.occlusion_version_id);
  const generatedSlotResumable = !generatedSlotOccupied || Boolean(selectedAttempt?.generatedPending);
  const warpedSlotResumable = !warpedSlotOccupied || Boolean(selectedAttempt?.warpedPending);
  const occlusionSlotResumable = !occlusionSlotOccupied || Boolean(selectedAttempt?.occlusionPending);
  const selectedMoveHighlightCalibrationReady = Boolean(selectedAttempt?.moveHighlightProfile);
  const moveHighlightCalibrationDisabledReason = !canWrite
    ? 'Reload an owner editing page before fitting tile highlights.'
    : busy
      ? 'Wait for the current pipeline action to finish.'
      : selectedArtifact?.stage !== 'warped' || !selectedAttempt?.warped
        ? 'Select the completed warped board before fitting tile highlights.'
        : selectedArtifact.version.document_id !== documentId
          ? 'This exact warped board does not belong to this level document.'
          : !selectedAttempt.processing
            ? selectedAttempt.issue ?? 'This slot does not carry the exact board geometry needed for visual-footprint fitting.'
            : undefined;
  const openOcclusionEditorDisabledReason = busy
    ? 'Wait for the current pipeline action to finish.'
    : selectedArtifact?.stage !== 'warped'
      ? 'Select the completed warped board first.'
      : selectedArtifact.version.document_id !== documentId
        ? 'This exact warped board does not belong to this level document.'
        : !selectedAttemptCanProcess
          ? selectedAttempt?.issue ?? 'This slot cannot process its warped board.'
          : !occlusionSlotResumable
            ? 'This slot already has a committed board with an occlusion mask.'
            : !selectedBackground?.content_url
              || !selectedBackground.frame_width
              || !selectedBackground.frame_height
              ? 'This exact warped board is unavailable.'
              : undefined;
  const generateOcclusionDisabledReason = !canWrite
    ? 'Reload an owner editing page before creating a board with an occlusion mask.'
    : !selectedMoveHighlightCalibrationReady
      ? 'Fit and save the tile-highlight footprints for this warped board before creating a board with an occlusion mask.'
      : openOcclusionEditorDisabledReason;
  const adjustGridDisabledReason = !canWrite
    ? 'Reload an owner editing page before adjusting this grid.'
    : busy
      ? 'Wait for the current pipeline action to finish.'
      : selectedBackground?.document_id !== documentId
        ? 'This exact Raw Pipeline Source does not belong to this level document.'
        : !selectedBackground?.content_url || !selectedBackground.content_sha256
          ? 'This exact Raw Pipeline Source is unavailable.'
          : !selectedAttemptCanProcess
            ? selectedAttempt?.issue ?? 'This slot cannot process its Raw Pipeline Source.'
            : warpedSlotOccupied
              ? 'This slot already has a warped board. Inspect that board or use another slot for a different fit.'
              : undefined;
  const generateWarpDisabledReason = !canWrite
    ? 'Reload an owner editing page before generating a warped board.'
    : busy
      ? 'Wait for the current pipeline action to finish.'
      : !selectedAttemptCanProcess
        ? selectedAttempt?.issue ?? 'This slot cannot process its Raw Pipeline Source.'
        : !warpedSlotResumable
          ? 'This slot already has a committed warped board.'
          : !selectedBackground?.content_url
            ? 'This exact Raw Pipeline Source is unavailable.'
            : !registration && !selectedAttempt?.warpedPending
              ? 'Adjust the grid and choose Use this grid before generating the warped board.'
              : undefined;
  const pipelineSources = versions.filter((version) => (
    version.kind === 'raw'
    && version.status !== 'archived'
    && version.pipeline_source_eligible
    && version.content_sha256
    && version.content_url
    && Number(version.frame_width) > 0
    && Number(version.frame_height) > 0
    && environmentGeometryMatches(environmentGeometryFromVersion(version), currentEnvironmentGeometry)
    && Boolean(board.predrawnGenerationFrame)
    && version.world_bounds.minX === board.predrawnGenerationFrame?.x
    && version.world_bounds.minY === board.predrawnGenerationFrame?.y
    && version.world_bounds.width === board.predrawnGenerationFrame?.width
    && version.world_bounds.height === board.predrawnGenerationFrame?.height
  ));
  const selectedNewPipelineSource = pipelineSources.find(
    (version) => version.id === newPipelineSourceId,
  );
  const unavailablePipelineSourceIssue = versions.find((version) => (
    version.kind === 'raw'
    && version.status !== 'archived'
    && version.content_sha256
    && version.pipeline_source_eligible === false
    && version.pipeline_source_issue
  ))?.pipeline_source_issue;
  const warpSelectionProtectionReason = (
    warp: PredrawnBackgroundVersion | undefined,
  ): string | undefined => {
    if (!warp) return undefined;
    if (warp.status === 'published') {
      return 'This warped board is published history and cannot be discarded.';
    }
    const workingUsesWarp = currentSurface?.backgroundVersionId === warp.id;
    const canonicalUsesWarp = canonicalSurface?.backgroundVersionId === warp.id;
    if (workingUsesWarp && canonicalUsesWarp) {
      return `This warped board is selected by both the working copy and the ${canonicalActionLabel === 'Publish' ? 'published' : 'saved'} Level. Select another board version in both before discarding it.`;
    }
    if (workingUsesWarp) {
      return 'This warped board is selected by the working copy. Select another board version before discarding it.';
    }
    if (canonicalUsesWarp) {
      return `This warped board is selected by the ${canonicalActionLabel === 'Publish' ? 'published' : 'saved'} Level and cannot be discarded.`;
    }
    return undefined;
  };
  const selectedWarpSelectionProtection = warpSelectionProtectionReason(
    selectedAttempt?.warped?.backgroundVersion,
  );
  const inspectedWarpSelectionProtection = warpSelectionProtectionReason(
    inspectedAttempt?.warped?.backgroundVersion,
  );
  const selectedWarpRegistration = selectedAttempt?.warped
    ? predrawnDirectRegistrationForBackground(selectedAttempt.warped.backgroundVersion)
    : undefined;
  const refitSelectedWarpDisabledReason = !canWrite
    ? 'Reload an owner editing page before refitting this board.'
    : busy
      ? 'Wait for the current pipeline action to finish.'
      : !selectedAttempt?.generated
        ? 'This corrected board has no available Raw Pipeline Source.'
        : !selectedWarpRegistration
          ? 'This corrected board does not carry its saved grid placement.'
          : !pipelineSources.some((source) => source.id === selectedAttempt.generated?.backgroundVersion.id)
            ? 'The original Raw Pipeline Source no longer matches the current level geometry.'
            : undefined;
  const warpDiscardDisabledReason = !canWrite
    ? 'Reload an owner editing page before discarding this warped board.'
    : busy
      ? 'Wait for the current pipeline action to finish.'
      : !selectedAttemptCanProcess
        ? selectedAttempt?.issue ?? 'This slot cannot process its Raw Pipeline Source.'
        : !selectedAttempt?.warped
          ? 'This slot does not have a completed warped board to discard.'
        : selectedAttempt.occlusionReady || selectedAttempt.occlusionPending
            ? 'This slot already has a board with an occlusion mask. Discard its mask before discarding the warped board.'
            : !selectedWarpRegistration
              ? 'This warped board does not carry its saved grid registration.'
            : selectedWarpSelectionProtection;
  const inspectedWarpDiscardDisabledReason = !canWrite
    ? 'Reload an owner editing page before discarding this warped board.'
    : busy
      ? 'Wait for the current pipeline action to finish.'
      : !inspectedAttempt || !predrawnAttemptCanProcess(inspectedAttempt)
        ? inspectedAttempt?.issue ?? 'This slot cannot process its Raw Pipeline Source.'
        : inspectedArtifact?.stage !== 'warped' || !inspectedAttempt.warped
          ? 'Only a warped board without an occlusion mask can be discarded here.'
          : inspectedAttempt.occlusionReady || inspectedAttempt.occlusionPending
            ? 'This slot already has a board with an occlusion mask. Discard its mask before discarding the warped board.'
            : !inspectedRegistration
              ? 'This warped board does not carry its saved grid registration.'
              : inspectedWarpSelectionProtection;
  const inspectedMoveHighlightCalibrationDisabledReason = !canWrite
    ? 'Reload an owner editing page before fitting tile highlights.'
    : busy
      ? 'Wait for the current pipeline action to finish.'
      : inspectedArtifact?.stage !== 'warped' || !inspectedAttempt?.warped
        ? 'Only a completed warped board can open tile-highlight fitting.'
        : inspectedArtifact.version.document_id !== documentId
          ? 'This exact warped board does not belong to this level document.'
          : !inspectedAttempt.processing
            ? inspectedAttempt.issue
              ?? 'This slot does not carry the exact board geometry needed for visual-footprint fitting.'
            : undefined;
  const workingCopyOcclusionDiscardDisabledReason = workingCopySyncState === 'saved'
    ? undefined
    : workingCopySyncState === 'loading'
      ? 'Wait for the working copy to load before discarding this mask.'
      : workingCopySyncState === 'pending' || workingCopySyncState === 'saving'
        ? 'Wait for cloud autosave to finish before discarding this mask.'
        : workingCopySyncState === 'signed-out'
          ? 'Sign in again before discarding this mask; cloud autosave is paused.'
          : workingCopySyncState === 'error' || workingCopySyncState === 'conflict'
            ? 'Resolve the cloud autosave interruption before discarding this mask.'
            : 'Wait for the working copy to sync before discarding this mask.';
  const occlusionDiscardDisabledReasonFor = (
    attempt: PredrawnCreationAttemptModel | undefined,
    artifact: PredrawnBoardArtifact | undefined,
  ): string | undefined => !canWrite
    ? 'Reload an owner editing page before discarding this mask.'
    : workingCopyOcclusionDiscardDisabledReason
      ?? (busy
        ? 'Wait for the current pipeline action to finish.'
        : !attempt || !predrawnAttemptCanProcess(attempt)
          ? attempt?.issue ?? 'This pipeline slot cannot discard its mask.'
          : artifact?.stage !== 'occlusion-ready'
            || !artifact.occlusionVersion
            || !attempt.occlusionReady
            ? 'Select the Board with occlusion mask that you want to replace.'
            : attempt.attempt.occlusion_version_id !== artifact.occlusionVersion.id
              || attempt.occlusionReady.id !== artifact.id
              ? 'This mask is no longer the terminal result of its pipeline slot. Refresh Level Artwork and try again.'
              : !attempt.warped
                ? 'The warped board beneath this mask is unavailable.'
                : artifact.version.document_id !== documentId
                  ? 'This board with an occlusion mask does not belong to this level document.'
                  : undefined);
  const selectedOcclusionDiscardDisabledReason = occlusionDiscardDisabledReasonFor(
    selectedAttempt,
    selectedArtifact,
  );
  const inspectedOcclusionDiscardDisabledReason = occlusionDiscardDisabledReasonFor(
    inspectedAttempt,
    inspectedArtifact,
  );
  const occlusionDiscardTargetSnapshot = (
    attempt: PredrawnCreationAttemptModel | undefined,
    artifact: PredrawnBoardArtifact | undefined,
    disabledReason: string | undefined,
  ): OcclusionDiscardTargetSnapshot | undefined => {
    const occlusionVersionId = artifact?.occlusionVersion?.id;
    const warpedArtifactId = attempt?.warped?.id;
    if (!attempt || artifact?.stage !== 'occlusion-ready' || !occlusionVersionId || !warpedArtifactId) {
      return undefined;
    }
    return {
      attemptId: attempt.attempt.id,
      attemptRevision: attempt.attempt.row_revision,
      occlusionVersionId,
      warpedArtifactId,
      documentRevision,
      disabledReason,
    };
  };
  occlusionDiscardTargetsRef.current = {
    selected: occlusionDiscardTargetSnapshot(
      selectedAttempt,
      selectedArtifact,
      selectedOcclusionDiscardDisabledReason,
    ),
    inspected: occlusionDiscardTargetSnapshot(
      inspectedAttempt,
      inspectedArtifact,
      inspectedOcclusionDiscardDisabledReason,
    ),
  };

  useEffect(() => {
    setNewPipelineSourceId((current) => (
      pipelineSources.some((version) => version.id === current)
        ? current
        : pipelineSources[0]?.id ?? ''
    ));
  }, [currentEnvironmentGeometry, versions]);

  const selectArtifact = (artifact: PredrawnBoardArtifact): void => {
    setSelectedArtifactId(artifact.id);
    setRegistration(predrawnRegistrationForBackground(artifact.backgroundVersion, versions));
    setInspectMask(artifact.stage === 'occlusion-ready');
  };

  const selectAttempt = (attemptId: string): void => {
    const model = attemptModels.find((candidate) => candidate.attempt.id === attemptId);
    selectAttemptId(attemptId);
    setArchiveActionFeedback(null);
    setOcclusionDiscardFeedback(null);
    setOcclusionEditorNotice(null);
    const artifact = predrawnLatestCommittedArtifact(model);
    setSelectedArtifactId(artifact?.id ?? '');
    setRegistration(
      artifact ? predrawnRegistrationForBackground(artifact.backgroundVersion, versions) : undefined,
    );
    setInspectMask(artifact?.stage === 'occlusion-ready');
  };

  const createAttemptFromPipelineSource = async (
    pipelineSource: PredrawnBackgroundVersion | undefined = selectedNewPipelineSource,
  ): Promise<boolean> => {
    if (
      !canWrite
      || busy
      || !pipelineSource
    ) return false;
    setBusy('pipeline-attempt');
    setError(null);
    setAttemptCreationFeedback({
      tone: 'info',
      message: 'Starting a new processing attempt with this exact saved Pipeline Source…',
    });
    try {
      const fence = getEditFence();
      if (!fence) throw new Error('Reload an owner editing page before starting a pipeline slot.');
      const intent = nextPredrawnPipelineSourceAttemptCreationIntent(
        pipelineSourceAttemptCreationIntentRef.current,
        pipelineSource.id,
        `Pipeline slot ${attemptModels.length + 1}`,
      );
      pipelineSourceAttemptCreationIntentRef.current = intent;
      const attempt = await createPredrawnGenerationAttempt({
        documentId,
        pipelineSourceVersionId: intent.pipelineSourceVersionId,
        label: intent.label,
        idempotencyKey: intent.idempotencyKey,
        fence,
      });
      pipelineSourceAttemptCreationIntentRef.current = undefined;
      setAttempts((current) => [
        attempt,
        ...current.filter((candidate) => candidate.id !== attempt.id),
      ]);
      const loaded = await refreshAfterCompletedMutation(
        'The new pipeline slot was created with the saved Pipeline Source.',
      );
      selectAttemptId(attempt.id);
      setSelectedArtifactId(attempt.generated_version_id ?? pipelineSource.id);
      setRegistration(
        predrawnRegistrationForBackground(pipelineSource, loaded?.versions ?? versions),
      );
      onStatus(
        'New pipeline attempt started.',
        'success',
        'The exact saved Pipeline Source is already in place. Adjust its grid to continue; no copy or upload is needed.',
      );
      setAttemptCreationFeedback({
        tone: 'success',
        message: 'Attempt created. The saved Pipeline Source is attached; adjust its grid to continue.',
      });
      return true;
    } catch (cause) {
      const mutationHandled = onMutationError(cause);
      const message = mutationHandled
        ? 'Live sync disconnected. Reload the editor, then click Start new attempt again.'
        : cause instanceof Error
          ? cause.message
          : 'The new attempt could not be started with this Pipeline Source.';
      setError(message);
      setAttemptCreationFeedback({ tone: 'error', message });
      onStatus('Pipeline attempt failed.', 'error', message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const adjustSelectedGrid = (): void => {
    if (adjustGridDisabledReason) return;
    setPickerOpen(true);
  };

  const openMoveHighlightEditor = (
    artifact: PredrawnBoardArtifact | undefined,
    disabledReason?: string,
  ): void => {
    if (!artifact || disabledReason) {
      if (disabledReason) setError(disabledReason);
      return;
    }
    setError(null);
    setMoveHighlightEditorArtifactId(artifact.id);
  };

  const openOcclusionEditor = (
    artifact: PredrawnBoardArtifact | undefined,
    disabledReason?: string,
  ): void => {
    if (!artifact || disabledReason) {
      if (disabledReason) setError(disabledReason);
      return;
    }
    setError(null);
    setOcclusionEditorNotice(null);
    setOcclusionEditorRoute(artifact.id);
  };

  const saveMoveHighlightCalibration = async (
    cells: PredrawnMoveHighlightCells,
  ): Promise<void> => {
    const targetAttempt = moveHighlightEditorAttempt;
    const targetWarp = moveHighlightEditorArtifact;
    if (
      !canWrite
      || busy
      || !targetAttempt
      || !targetWarp
      || !targetAttempt.processing
    ) {
      setError(
        !canWrite
          ? 'Reload an owner editing page before saving tile highlights.'
          : busy
            ? 'Wait for the current pipeline action to finish.'
            : 'The exact warped board for this tile-highlight edit is no longer available.',
      );
      return;
    }
    setBusy('move-highlight');
    setError(null);
    try {
      const fence = getEditFence();
      if (!fence) throw new Error('Reload an owner editing page before saving tile highlights.');
      const result = await updatePredrawnGenerationAttemptMoveHighlightProfile({
        documentId,
        attemptId: targetAttempt.attempt.id,
        expectedRevision: targetAttempt.attempt.row_revision,
        expectedWarpedVersionId: targetWarp.backgroundVersion.id,
        cells,
        fence,
      });
      setAttempts((current) => [
        result.attempt,
        ...current.filter((attempt) => attempt.id !== result.attempt.id),
      ]);
      setSelectedPreviewState(null);
      const refreshed = await refreshAfterCompletedMutation(
        'The visual highlight calibration was saved.',
      );
      const customCellCount = Object.keys(cells).length;
      if (refreshed) {
        onStatus(
          'Tile highlight footprints saved.',
          'success',
          customCellCount
            ? `${customCellCount} painted-cell ${customCellCount === 1 ? 'footprint is' : 'footprints are'} now bound to this exact warped board.`
            : 'The explicit full-cell visual calibration is now bound to this exact warped board.',
        );
      }
    } catch (cause) {
      const mutationHandled = onMutationError(cause);
      const message = mutationHandled
        ? 'Live sync disconnected. Reload the editor, then save the tile highlights again.'
        : cause instanceof Error
          ? cause.message
          : 'The visual highlight calibration could not be saved.';
      setError(message);
      if (!mutationHandled) onStatus('Tile highlight save failed.', 'error', message);
      void refresh().catch(() => {});
    } finally {
      setBusy(null);
    }
  };

  const discardWarp = async (source: 'selected' | 'inspected'): Promise<void> => {
    const targetAttempt = source === 'inspected' ? inspectedAttempt : selectedAttempt;
    const targetWarp = targetAttempt?.warped?.backgroundVersion;
    const disabledReason = source === 'inspected'
      ? inspectedWarpDiscardDisabledReason
      : warpDiscardDisabledReason;
    const rejectedRegistration = targetWarp
      ? predrawnDirectRegistrationForBackground(targetWarp)
      : undefined;
    if (
      disabledReason
      || !targetAttempt
      || !targetWarp
      || !rejectedRegistration
    ) {
      const message = disabledReason
        ?? 'This warped board does not carry the saved grid needed for another pass.';
      setError(message);
      setWarpDiscardFeedback({ tone: 'error', message });
      return;
    }
    setError(null);
    setWarpDiscardFeedback(null);
    const confirmed = await askDiscardWarpConfirmation({
      title: 'Discard this warped board?',
      message: 'The Raw Pipeline Source and this slot will stay. You will return to this exact grid fit so you can adjust it and generate another warped board.',
      confirmLabel: 'Discard & adjust grid',
      cancelLabel: 'Keep warped board',
      tone: 'danger',
    });
    if (!confirmed) return;
    setBusy('discard-warp');
    setWarpDiscardFeedback({ tone: 'info', message: 'Discarding this warped board…' });
    try {
      const fence = getEditFence();
      if (!fence) throw new Error('Reload an owner editing page before discarding this warped board.');
      const result = await discardPredrawnGenerationAttemptWarp({
        documentId,
        attemptId: targetAttempt.attempt.id,
        expectedRevision: targetAttempt.attempt.row_revision,
        expectedWarpedVersionId: targetWarp.id,
        fence,
      });
      setAttempts((current) => [
        result.attempt,
        ...current.filter((attempt) => attempt.id !== result.attempt.id),
      ]);
      upsertVersion(result.discarded_version);
      await refreshAfterCompletedMutation('The warped board was discarded.');
      selectAttemptId(result.attempt.id);
      setSelectedArtifactId(result.attempt.generated_version_id ?? targetAttempt.generated?.id ?? '');
      setSelectedPreviewState(null);
      setRegistration(rejectedRegistration);
      setInspectedArtifactId(null);
      setPickerOpen(true);
      setWarpDiscardFeedback({
        tone: 'success',
        message: 'Warped board discarded. Adjust the preserved grid, then generate another warped board in this slot.',
      });
      onStatus(
        'Warped board discarded.',
        'success',
        'The same slot and Raw Pipeline Source are open with the rejected fit preserved for adjustment.',
      );
    } catch (cause) {
      const mutationHandled = onMutationError(cause);
      const message = mutationHandled
        ? 'Live sync disconnected. Reload the editor, then discard the warped board again.'
        : cause instanceof Error
          ? cause.message
          : 'The warped board could not be discarded.';
      setError(message);
      setWarpDiscardFeedback({ tone: 'error', message });
      if (!mutationHandled) onStatus('Warped board discard failed.', 'error', message);
      void refresh().catch(() => {});
    } finally {
      setBusy(null);
    }
  };

  const discardOcclusion = async (source: 'selected' | 'inspected'): Promise<void> => {
    const requested = occlusionDiscardTargetsRef.current[source];
    if (!requested || requested.disabledReason) {
      const message = requested?.disabledReason
        ?? 'Select the Board with occlusion mask that you want to replace.';
      setError(message);
      setOcclusionDiscardFeedback({ tone: 'error', message });
      return;
    }
    setError(null);
    setOcclusionDiscardFeedback({
      tone: 'info',
      message: 'Discard confirmation is open. Nothing has changed yet.',
    });
    let confirmed: boolean;
    try {
      confirmed = await askDiscardOcclusionConfirmation({
        title: 'Discard this mask and edit again?',
        message: `The warped board, its saved grid, and its visual-highlight calibration will stay. The old mask will be removed from this slot, and the mask editor will reopen for another pass. If the working copy uses this mask, it will fall back to the same warped board without a mask. The ${canonicalActionLabel === 'Publish' ? 'published' : 'saved'} Level will not change.`,
        confirmLabel: 'Discard mask & edit again',
        cancelLabel: 'Keep mask',
        tone: 'danger',
      });
    } catch (cause) {
      const message = cause instanceof Error
        ? cause.message
        : 'The discard confirmation could not be opened.';
      setError(message);
      setOcclusionDiscardFeedback({ tone: 'error', message });
      return;
    }
    if (!confirmed) {
      setOcclusionDiscardFeedback({
        tone: 'info',
        message: 'Discard canceled. The mask and pipeline slot were not changed.',
      });
      return;
    }
    const current = occlusionDiscardTargetsRef.current[source];
    if (
      !current
      || current.disabledReason
      || current.attemptId !== requested.attemptId
      || current.attemptRevision !== requested.attemptRevision
      || current.occlusionVersionId !== requested.occlusionVersionId
      || current.warpedArtifactId !== requested.warpedArtifactId
      || current.documentRevision !== requested.documentRevision
    ) {
      const message = current?.disabledReason
        ?? 'The selected mask or working copy changed while confirmation was open. Nothing was discarded.';
      setError(message);
      setOcclusionDiscardFeedback({ tone: 'error', message });
      return;
    }
    setBusy('discard-occlusion');
    setOcclusionDiscardFeedback({ tone: 'info', message: 'Discarding this mask…' });
    try {
      const fence = getEditFence();
      if (!fence) throw new Error('Reload an owner editing page before discarding this mask.');
      const result = await discardPredrawnGenerationAttemptOcclusion({
        documentId,
        attemptId: current.attemptId,
        expectedRevision: current.attemptRevision,
        expectedOcclusionVersionId: current.occlusionVersionId,
        documentRevision: current.documentRevision,
        fence,
      });
      onDocumentUpdated(result);
      setAttempts((currentAttempts) => [
        result.attempt,
        ...currentAttempts.filter((attempt) => attempt.id !== result.attempt.id),
      ]);
      upsertVersion(result.detached_version);
      await refreshAfterCompletedMutation('The mask was removed from this pipeline slot.');
      selectAttemptId(result.attempt.id);
      setSelectedArtifactId(current.warpedArtifactId);
      setSelectedPreviewState(null);
      const retainedWarp = versions.find((version) => version.id === current.warpedArtifactId)
        ?? attemptModels.find((model) => model.attempt.id === current.attemptId)
          ?.warped?.backgroundVersion;
      setRegistration(
        retainedWarp ? predrawnDirectRegistrationForBackground(retainedWarp) : undefined,
      );
      setInspectMask(false);
      setInspectedArtifactId(null);
      const retentionDetail = result.detached_version_archived
        ? 'The old mask was archived.'
        : result.retained_reason === 'published-history'
          ? 'The old mask remains retained as published history, but it is no longer attached to this slot.'
          : 'The old mask remains retained by the saved Level, but it is no longer attached to this slot.';
      const fallbackDetail = result.selection.working_copy_fell_back
        ? ' The working copy now uses the same warped board without a mask.'
        : '';
      const replayDetail = result.idempotent_replay
        ? ' The server confirmed the earlier discard.'
        : '';
      const notice = `Mask discarded. The warped board, saved grid, and tile highlights remain.${fallbackDetail} ${retentionDetail}${replayDetail}`;
      setOcclusionDiscardFeedback({ tone: 'success', message: notice });
      setOcclusionEditorNotice(notice);
      onStatus(
        'Mask discarded; editor reopened.',
        'success',
        `The same warped board, saved grid, and visual-highlight calibration remain. ${retentionDetail}${replayDetail}`,
      );
      setOcclusionEditorRoute(current.warpedArtifactId);
    } catch (cause) {
      const mutationHandled = onMutationError(cause);
      const message = mutationHandled
        ? 'Live sync disconnected. Reload the editor, then discard the mask again.'
        : cause instanceof Error
          ? cause.message
          : 'The mask could not be discarded.';
      setError(message);
      setOcclusionDiscardFeedback({ tone: 'error', message });
      if (!mutationHandled) onStatus('Mask discard failed.', 'error', message);
      void refresh().catch(() => {});
    } finally {
      setBusy(null);
    }
  };

  const importRawBlob = async (
    sourceBlob: Blob,
    source: 'level-generation-output' | 'owner-upload' | 'manual-clipboard-handoff',
    nextRegistration?: PredrawnBoardCornerRegistration,
    originalFileName?: string,
  ): Promise<boolean> => {
    if (
      !canWrite
      || !selectedAttempt
      || !selectedAttemptCanProcess
      || !generatedSlotResumable
      || !selectedAttempt.sourceArtwork
      || !selectedAttempt.processing
      || busy
    ) return false;
    setBusy('raw');
    setError(null);
    try {
      const fence = getEditFence();
      if (!fence) throw new Error('Reload an owner editing page before changing background versions.');
      await assertDecodablePngBlob(sourceBlob);
      const sha256 = await sha256Hex(sourceBlob);
      const pendingGenerated = selectedAttempt.generatedPending;
      if (
        pendingGenerated
        && pendingGenerated.provenance.sourceSha256 !== sha256
      ) {
        throw new Error('This generated slot is already reserved. Choose the same exact PNG to resume its interrupted upload.');
      }
      const processing = selectedAttempt.processing;
      const environmentGeometrySha256 = processing.environmentGeometrySha256;
      const sourceArtwork = selectedAttempt.sourceArtwork;
      const rawWorldBounds = { ...processing.worldBounds };
      const rawIdentityHash = await sha256Hex(new Blob([JSON.stringify({
        schema: 'predrawn-raw-identity-v2',
        documentId,
        attemptId: selectedAttempt.attempt.id,
        sha256,
        semanticRequestSha256: processing.semanticRequestSha256,
        worldBounds: rawWorldBounds,
      })]));
      let version = pendingGenerated ?? await createPredrawnBackgroundVersion(documentId, {
          kind: 'raw',
          attempt_id: selectedAttempt.attempt.id,
          label: `Raw pipeline source ${sha256.slice(0, 8)}`,
          world_bounds: rawWorldBounds,
          operation: {
            kind: 'raw-generated-v2',
            untouched: true,
            outputSha256: sha256,
            coordinateBasis: 'board-world-pixels-v1',
            viewingPane: rawWorldBounds,
            sourceArtworkVersionId: sourceArtwork.id,
            sourceArtworkSha256: sourceArtwork.content_sha256,
            environmentGeometrySha256,
            environmentGeometrySchema: 'predrawn-environment-geometry-v2',
          },
          provenance: {
            sourceSha256: sha256,
            outputSha256: sha256,
            source,
            levelId,
            sourceArtworkVersionId: sourceArtwork.id,
            sourceArtworkSha256: sourceArtwork.content_sha256,
            environmentGeometrySha256,
            ...(originalFileName ? { originalFileName: originalFileName.slice(0, 240) } : {}),
          },
          idempotency_key: predrawnBackgroundVersionIdempotencyKey(
            'raw',
            rawIdentityHash,
            selectedAttempt.attempt.id,
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
      const refreshed = await refreshAfterCompletedMutation('The raw AI-painted board was committed to this pipeline slot.');
      if (refreshed) onStatus('AI artwork added.', 'success', 'Its exact pixels are ready to use unchanged. Grid correction and occlusion remain optional.');
      return true;
    } catch (cause) {
      if (onMutationError(cause)) {
        void refresh().catch(() => {});
        return false;
      }
      void refresh().catch(() => {});
      const message = cause instanceof Error ? cause.message : 'The raw AI-painted board could not be added.';
      setError(message);
      onStatus('Pipeline source import failed.', 'error', message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const importNewAiArtwork = async (): Promise<void> => {
    if (
      !stagedPipelineSource
      || stagedPipelineSource.attemptId !== NEW_AI_ARTWORK_INTAKE_ID
      || !canWrite
      || busy
      || handoffBusy
    ) return;
    const generationFrame = board.predrawnGenerationFrame;
    if (!generationFrame || !currentEnvironmentGeometry) {
      setClipboardStatusTone('error');
      setClipboardStatus('Save a valid 16:9 viewing pane before importing AI artwork.');
      return;
    }
    setBusy('raw');
    setError(null);
    try {
      const fence = getEditFence();
      if (!fence) throw new Error('Reload an owner editing page before adding AI artwork.');
      await assertDecodablePngBlob(stagedPipelineSource.blob);
      const sha256 = await sha256Hex(stagedPipelineSource.blob);
      const rawWorldBounds = {
        minX: generationFrame.x,
        minY: generationFrame.y,
        width: generationFrame.width,
        height: generationFrame.height,
      };
      const rawIdentityHash = await sha256Hex(new Blob([JSON.stringify({
        schema: 'predrawn-ai-artwork-intake-identity-v1',
        documentId,
        sha256,
        worldBounds: rawWorldBounds,
        environmentGeometrySha256: currentEnvironmentGeometry.v2,
        source: stagedPipelineSource.source,
        originalFileName: stagedPipelineSource.originalFileName ?? null,
      })]));
      let version = await createPredrawnBackgroundVersion(documentId, {
        kind: 'raw',
        label: `AI artwork ${sha256.slice(0, 8)}`,
        world_bounds: rawWorldBounds,
        operation: {
          kind: 'raw-generated-v2',
          intakeSchema: 'predrawn-ai-artwork-intake-v1',
          untouched: true,
          outputSha256: sha256,
          coordinateBasis: 'board-world-pixels-v1',
          viewingPane: rawWorldBounds,
          environmentGeometrySha256: currentEnvironmentGeometry.v2,
          environmentGeometrySchema: 'predrawn-environment-geometry-v2',
        },
        provenance: {
          sourceSha256: sha256,
          outputSha256: sha256,
          source: stagedPipelineSource.source,
          levelId,
          environmentGeometrySha256: currentEnvironmentGeometry.v2,
          ...(stagedPipelineSource.originalFileName
            ? { originalFileName: stagedPipelineSource.originalFileName.slice(0, 240) }
            : {}),
        },
        idempotency_key: predrawnBackgroundVersionIdempotencyKey(
          'raw',
          rawIdentityHash,
          'ai-intake',
        ),
      }, fence);
      upsertVersion(version);
      if (!version.content_sha256) {
        version = await uploadPredrawnBackgroundVersionContent({
          documentId,
          versionId: version.id,
          expectedRevision: version.row_revision,
          bytes: stagedPipelineSource.blob,
          fence,
        });
        upsertVersion(version);
      }
      const attempt = await createPredrawnGenerationAttempt({
        documentId,
        intakeSourceVersionId: version.id,
        label: `Pipeline slot ${attemptModels.length + 1}`,
        idempotencyKey: `attempt:intake:${version.id}:${documentRevision}`,
        fence,
      });
      setAttempts((current) => [
        attempt,
        ...current.filter((candidate) => candidate.id !== attempt.id),
      ]);
      selectAttemptId(attempt.id);
      setSelectedArtifactId(version.id);
      setRegistration(undefined);
      clearStagedPipelineSource();
      const refreshed = await refreshAfterCompletedMutation('The AI artwork was added to a new pipeline slot.');
      if (refreshed) {
        setClipboardStatusTone('success');
        setClipboardStatus('AI artwork added. Adjust its grid to continue.');
        onStatus('AI artwork added.', 'success', 'Its exact pixels are now ready for board-art processing.');
      }
    } catch (cause) {
      if (onMutationError(cause)) {
        void refresh().catch(() => {});
        return;
      }
      void refresh().catch(() => {});
      const message = cause instanceof Error ? cause.message : 'The AI artwork could not be added.';
      setError(message);
      setClipboardStatusTone('error');
      setClipboardStatus(message);
      onStatus('AI artwork intake failed.', 'error', message);
    } finally {
      setBusy(null);
    }
  };

  const refitSelectedWarp = async (): Promise<void> => {
    const pipelineSource = selectedAttempt?.generated?.backgroundVersion;
    const savedRegistration = selectedWarpRegistration;
    if (!pipelineSource || !savedRegistration || refitSelectedWarpDisabledReason) return;
    const created = await createAttemptFromPipelineSource(pipelineSource);
    if (!created) return;
    setRegistration(savedRegistration);
    setPickerOpen(true);
    onStatus(
      'The saved grid is open in a new slot.',
      'success',
      'Its exact prior placement is restored. Adjust it, then choose Use fitted board.',
    );
  };

  const importMountedRaw = async (): Promise<void> => {
    if (!initialSourceSrc) return;
    try {
      const source = await sourcePngBlob(initialSourceSrc);
      await importRawBlob(source.blob, 'level-generation-output', initialRegistration);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The existing Codex-painted board could not be loaded.';
      setError(message);
      onStatus('Pipeline source import failed.', 'error', message);
    }
  };

  const reportClipboardFailure = useCallback((cause: unknown, action: 'copy' | 'paste'): void => {
    const message = cause instanceof Error
      ? cause.message
      : action === 'copy'
        ? 'The selected AI input could not be copied.'
        : 'The AI-painted board could not be read from the clipboard.';
    setClipboardStatus(message);
    setClipboardStatusTone('error');
    onStatus(
      action === 'copy' ? 'AI input copy failed.' : 'AI-painted board paste failed.',
      'error',
      message,
    );
  }, [onStatus]);

  const reportFilePreviewFailure = useCallback((cause: unknown): void => {
    const message = cause instanceof Error
      ? cause.message
      : 'The chosen PNG file could not be previewed.';
    setClipboardStatus(message);
    setClipboardStatusTone('error');
    onStatus('PNG file preview failed.', 'error', message);
  }, [onStatus]);

  const copyAttemptInput = async (): Promise<void> => {
    const sourceArtwork = selectedAttempt?.sourceArtwork;
    if (!sourceArtwork || selectedAttempt?.attempt.origin !== 'source' || handoffBusy) return;
    setHandoffBusy('copy');
    setClipboardStatus(null);
    setClipboardStatusTone('success');
    setError(null);
    try {
      await copyPredrawnPngToClipboard(predrawnBackgroundVersionContentUrl(sourceArtwork.id));
      const dimensions = sourceArtwork.frame_width && sourceArtwork.frame_height
        ? `${sourceArtwork.frame_width} × ${sourceArtwork.frame_height} PNG`
        : 'full-resolution PNG';
      const message = `Copied ${dimensions} Generation Reference. Paste it into the Codex conversation, then copy the AI-painted result and return here.`;
      setClipboardStatus(message);
      onStatus('Generation reference copied.', 'success', message);
    } catch (cause) {
      reportClipboardFailure(cause, 'copy');
    } finally {
      setHandoffBusy(null);
    }
  };

  const previewPipelineSource = useCallback(async (
    blob: Blob,
    operation: PredrawnPngIngressOperation,
    source: StagedPipelineSource['source'],
    originalFileName?: string,
  ): Promise<void> => {
    const dimensions = await assertDecodablePngBlob(blob);
    if (!pngIngressGuard.isCurrent(operation)) return;
    const previewUrl = URL.createObjectURL(blob);
    if (!pngIngressGuard.isCurrent(operation)) {
      URL.revokeObjectURL(previewUrl);
      return;
    }
    replaceStagedPipelineSource({
      attemptId: operation.attemptId,
      blob,
      previewUrl,
      width: dimensions.width,
      height: dimensions.height,
      source,
      ...(originalFileName ? { originalFileName } : {}),
    });
    setError(null);
    setClipboardStatusTone('success');
    const ingressLabel = source === 'owner-upload' ? 'Chosen' : 'Pasted';
    setClipboardStatus(
      `${ingressLabel} ${dimensions.width} × ${dimensions.height} PNG. Review it below, then save it as a reusable Pipeline Source.`,
    );
  }, [pngIngressGuard, replaceStagedPipelineSource]);

  const stageNewAiArtwork = async (
    blob: Blob,
    source: StagedPipelineSource['source'],
    originalFileName?: string,
  ): Promise<void> => {
    if (!canWrite || busy) return;
    pngIngressGuard.selectAttempt(NEW_AI_ARTWORK_INTAKE_ID);
    const operation = pngIngressGuard.begin(NEW_AI_ARTWORK_INTAKE_ID);
    await previewPipelineSource(blob, operation, source, originalFileName);
  };

  const pasteNewAiArtworkFromClipboard = async (): Promise<void> => {
    if (!canWrite || busy || handoffBusy) return;
    setHandoffBusy('paste');
    setClipboardStatus(null);
    setClipboardStatusTone('success');
    setError(null);
    try {
      const blob = await readPredrawnPngFromClipboard();
      await stageNewAiArtwork(blob, 'manual-clipboard-handoff');
    } catch (cause) {
      reportClipboardFailure(cause, 'paste');
    } finally {
      setHandoffBusy(null);
    }
  };

  const previewNewAiArtworkFromFile = async (file: File): Promise<void> => {
    if (!canWrite || busy || handoffBusy) return;
    setHandoffBusy('file');
    setClipboardStatus(null);
    setClipboardStatusTone('success');
    setError(null);
    try {
      await stageNewAiArtwork(file, 'owner-upload', file.name);
    } catch (cause) {
      reportFilePreviewFailure(cause);
    } finally {
      setHandoffBusy(null);
    }
  };

  const pastePipelineSourceFromClipboard = async (): Promise<void> => {
    const attemptId = selectedAttempt?.attempt.id;
    if (
      !attemptId
      || !canWrite
      || !selectedAttemptCanProcess
      || !generatedSlotResumable
      || busy
      || handoffBusy
    ) return;
    const operation = pngIngressGuard.begin(attemptId);
    setHandoffBusy('paste');
    setClipboardStatus(null);
    setClipboardStatusTone('success');
    setError(null);
    try {
      await previewPipelineSource(
        await readPredrawnPngFromClipboard(),
        operation,
        'manual-clipboard-handoff',
      );
    } catch (cause) {
      if (pngIngressGuard.isCurrent(operation)) reportClipboardFailure(cause, 'paste');
    } finally {
      if (pngIngressGuard.isCurrent(operation)) setHandoffBusy(null);
    }
  };

  const previewPipelineSourceFromFile = async (file: File): Promise<void> => {
    const attemptId = selectedAttempt?.attempt.id;
    if (
      !attemptId
      || !canWrite
      || !selectedAttemptCanProcess
      || !generatedSlotResumable
      || busy
      || handoffBusy
    ) return;
    const operation = pngIngressGuard.begin(attemptId);
    setHandoffBusy('file');
    setClipboardStatus(null);
    setClipboardStatusTone('success');
    setError(null);
    try {
      await previewPipelineSource(file, operation, 'owner-upload', file.name);
    } catch (cause) {
      if (pngIngressGuard.isCurrent(operation)) reportFilePreviewFailure(cause);
    } finally {
      if (pngIngressGuard.isCurrent(operation)) setHandoffBusy(null);
    }
  };

  const commitStagedPipelineSource = async (): Promise<void> => {
    if (
      !stagedPipelineSource
      || stagedPipelineSource.attemptId !== selectedAttempt?.attempt.id
      || !canWrite
      || !selectedAttemptCanProcess
      || !generatedSlotResumable
      || busy
      || handoffBusy
    ) return;
    const committed = await importRawBlob(
      stagedPipelineSource.blob,
      stagedPipelineSource.source,
      undefined,
      stagedPipelineSource.originalFileName,
    );
    if (committed) {
      const ingressLabel = stagedPipelineSource.source === 'owner-upload' ? 'chosen' : 'pasted';
      clearStagedPipelineSource();
      setClipboardStatusTone('success');
      setClipboardStatus(`The ${ingressLabel} PNG is now a saved Pipeline Source for this and future attempts.`);
    }
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      const hasPngItem = Array.from(event.clipboardData?.items ?? []).some((item) => (
        item.kind === 'file' && item.type.split(';', 1)[0]?.trim().toLowerCase() === 'image/png'
      ));
      const hasPngFile = Array.from(event.clipboardData?.files ?? []).some((file) => (
        file.type.split(';', 1)[0]?.trim().toLowerCase() === 'image/png'
      ));
      if (
        (!hasPngItem && !hasPngFile)
        || !canWrite
        || busy
        || handoffBusy
      ) return;
      event.preventDefault();
      pngIngressGuard.selectAttempt(NEW_AI_ARTWORK_INTAKE_ID);
      const operation = pngIngressGuard.begin(NEW_AI_ARTWORK_INTAKE_ID);
      setHandoffBusy('paste');
      setClipboardStatus(null);
      setClipboardStatusTone('success');
      setError(null);
      void predrawnPngFromPasteEvent(event)
        .then((blob) => previewPipelineSource(blob, operation, 'manual-clipboard-handoff'))
        .catch((cause) => {
          if (pngIngressGuard.isCurrent(operation)) reportClipboardFailure(cause, 'paste');
        })
        .finally(() => {
          if (pngIngressGuard.isCurrent(operation)) setHandoffBusy(null);
        });
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [
    busy,
    canWrite,
    handoffBusy,
    pngIngressGuard,
    previewPipelineSource,
    reportClipboardFailure,
  ]);

  const generateWarp = async ({
    registrationOverride,
    setWorkingCopy = false,
    inspectAfterSave = true,
  }: {
    registrationOverride?: PredrawnBoardCornerRegistration;
    setWorkingCopy?: boolean;
    inspectAfterSave?: boolean;
  } = {}): Promise<void> => {
    if (
      !canWrite
      || !selectedAttempt
      || !selectedAttemptCanProcess
      || !warpedSlotResumable
      || selectedBackground?.kind !== 'raw'
      || !selectedBackground.content_url
      || !selectedAttempt.processing
      || busy
    ) return;
    setBusy('warp');
    setError(null);
    try {
      const fence = getEditFence();
      if (!fence) throw new Error('Reload an owner editing page before changing background versions.');
      const processing = selectedAttempt.processing;
      const pendingRegistration = selectedAttempt.warpedPending
        ? predrawnRegistrationForBackground(selectedAttempt.warpedPending, versions)
        : undefined;
      const effectiveRegistration = pendingRegistration ?? registrationOverride ?? registration;
      if (!effectiveRegistration) throw new Error('Adjust the grid before generating the warped board.');
      const currentGeometrySha256 = processing.environmentGeometrySha256;
      const generated = await generateWarpedPredrawnRaster({
        src: selectedBackground.content_url,
        registration: effectiveRegistration,
        cells: processing.cells,
        environmentGeometrySha256: currentGeometrySha256,
      });
      const outputSha256 = await sha256Hex(generated.blob);
      const pendingAttemptProcessingRevision =
        selectedAttempt.warpedPending?.operation.attemptProcessingRevision;
      const attemptProcessingRevision = (
        typeof pendingAttemptProcessingRevision === 'number'
        && Number.isSafeInteger(pendingAttemptProcessingRevision)
        && pendingAttemptProcessingRevision >= 0
      )
        ? pendingAttemptProcessingRevision
        : Number.isSafeInteger(selectedAttempt.attempt.processing_revision)
          && selectedAttempt.attempt.processing_revision >= 0
          ? selectedAttempt.attempt.processing_revision
          : 0;
      const operation: Record<string, unknown> = {
        ...generated.operation,
        outputSha256,
        attemptProcessingRevision,
      };
      const operationHash = await sha256Hex(new Blob([
        selectedBackground.id,
        JSON.stringify(operation),
      ]));
      let version = await createPredrawnBackgroundVersion(documentId, {
        kind: 'warped',
        attempt_id: selectedAttempt.attempt.id,
        label: `Warped from ${versionLabel(selectedBackground)}`,
        parent_version_id: selectedBackground.id,
        source_background_version_id: selectedBackground.id,
        world_bounds: generated.worldBounds,
        operation,
        provenance: {
          processor: generated.processor,
          parentVersionId: selectedBackground.id,
          environmentGeometrySha256: currentGeometrySha256,
          outputSha256,
          attemptProcessingRevision,
        },
        idempotency_key: predrawnBackgroundVersionIdempotencyKey(
          'warp',
          operationHash,
          `${selectedAttempt.attempt.id}:${attemptProcessingRevision}`,
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
      if (setWorkingCopy) {
        onSetSurface(predrawnBoardSurfaceForBackgroundVersion(version));
      }
      if (refreshed) {
        if (inspectAfterSave) setInspectedArtifactId(version.id);
        if (setWorkingCopy) {
          onStatus(
            'Your fitted board is selected.',
            'success',
            'The exact grid placement is saved with this corrected board. The working copy is autosaving; occlusion remains optional.',
          );
        } else {
          onStatus(
            'The exact warped background version is ready for full-size inspection.',
            'success',
            'Review the saved grid, tile highlights, and camera travel before applying occlusion.',
          );
        }
      }
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

  const generateOcclusion = async (
    draft: PredrawnOcclusionMaskDraft,
  ): Promise<void> => {
    const targetAttempt = occlusionEditorAttempt;
    const targetBackground = occlusionEditorArtifact?.backgroundVersion;
    const targetSlotResumable = Boolean(
      targetAttempt
      && (!targetAttempt.attempt.occlusion_version_id || targetAttempt.occlusionPending),
    );
    if (
      !canWrite
      || !targetAttempt
      || !predrawnAttemptCanProcess(targetAttempt)
      || !targetAttempt.moveHighlightProfile
      || !targetSlotResumable
      || !targetAttempt.processing
      || !targetBackground?.content_url
      || !targetBackground.frame_width
      || !targetBackground.frame_height
      || busy
    ) {
      throw new Error(
        !canWrite
          ? 'Reload an owner editing page before creating a board with an occlusion mask.'
          : 'This exact warped board can no longer accept an occlusion mask. Close the editor and refresh the pipeline.',
      );
    }
    if (
      draft.imageId !== targetBackground.id
      || draft.width !== targetBackground.frame_width
      || draft.height !== targetBackground.frame_height
      || draft.acceptedAlpha.length !== draft.width * draft.height
    ) {
      throw new Error('The submitted mask does not match the exact warped artwork that opened this editor.');
    }
    setBusy('occlusion');
    setError(null);
    try {
      const fence = getEditFence();
      if (!fence) throw new Error('Reload an owner editing page before changing background versions.');
      const generated = await generatePredrawnRasterSelectionOcclusion({
        board: targetAttempt.processing.board,
        alpha: draft.acceptedAlpha,
        frameWidth: targetBackground.frame_width,
        frameHeight: targetBackground.frame_height,
        worldBounds: targetBackground.world_bounds,
        sourceBackgroundVersionId: targetBackground.id,
        selection: {
          modelId: draft.modelId ?? 'manual-raster-selection',
          modelRevision: draft.modelRevision ?? 'manual-raster-selection-v1',
          backend: draft.backend ?? 'manual',
          positivePointCount: draft.positivePromptCount,
          negativePointCount: draft.negativePromptCount,
          manualEditCount: draft.manualEditCount,
        },
      });
      const outputSha256 = await sha256Hex(generated.blob);
      const operation: Record<string, unknown> = { ...generated.operation, outputSha256 };
      const operationHash = await sha256Hex(new Blob([
        targetBackground.id,
        JSON.stringify(operation),
      ]));
      let version = await createPredrawnBackgroundVersion(documentId, {
        kind: 'occlusion',
        attempt_id: targetAttempt.attempt.id,
        label: `Board with occlusion mask for ${versionLabel(targetBackground)}`,
        source_background_version_id: targetBackground.id,
        world_bounds: generated.worldBounds,
        operation,
        provenance: {
          processor: 'canonical-depth-mask-v1',
          sourceBackgroundVersionId: targetBackground.id,
          environmentGeometrySha256: generated.operation.environmentGeometrySha256,
          outputSha256,
          selectionProcessor: 'owner-raster-selection-v1',
          selectionModelId: draft.modelId ?? null,
          selectionModelRevision: draft.modelRevision ?? null,
          selectionBackend: draft.backend ?? null,
        },
        idempotency_key: predrawnBackgroundVersionIdempotencyKey(
          'occlusion',
          operationHash,
          targetAttempt.attempt.id,
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
      const refreshed = await refreshAfterCompletedMutation('The board with an occlusion mask was saved.');
      if (refreshed) {
        setOcclusionEditorRoute(null);
        setInspectedArtifactId(version.id);
        onStatus(
          'The Board with occlusion mask is ready.',
          'success',
          `${draft.selectedPixelCount.toLocaleString()} owner-approved pixels came from the exact warped artwork; legacy artwork was not sampled.`,
        );
      }
    } catch (cause) {
      if (onMutationError(cause)) {
        void refresh().catch(() => {});
        throw cause;
      }
      void refresh().catch(() => {});
      const message = cause instanceof Error ? cause.message : 'The occlusion mask could not be generated.';
      setError(message);
      onStatus('Occlusion generation failed.', 'error', message);
      throw cause instanceof Error ? cause : new Error(message);
    } finally {
      setBusy(null);
    }
  };

  const setSelected = (): void => {
    if (
      !canWrite
      || busy
      || !selectedPreviewReady
      || !selectedArtifact
      || !selectedBackground?.content_url
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

  const selectedAttemptArchivePolicy = predrawnAttemptArchivePolicy({
    attempt: selectedAttempt?.attempt,
    versions,
    workingBackgroundMode,
    workingSurface: currentSurface,
    canonicalBackgroundMode,
    canonicalSurface,
  });
  const selectedAttemptForgetsDormantSelection = (
    selectedAttemptArchivePolicy.dormantWorkingSelection
    || selectedAttemptArchivePolicy.dormantCanonicalSelection
  );
  const dormantSelectionScope = selectedAttemptArchivePolicy.dormantWorkingSelection
    && selectedAttemptArchivePolicy.dormantCanonicalSelection
    ? `the working copy and the ${canonicalActionLabel === 'Publish' ? 'published' : 'saved'} level`
    : selectedAttemptArchivePolicy.dormantWorkingSelection
      ? 'the working copy'
      : `${canonicalActionLabel === 'Publish' ? 'the published' : 'the saved'} level`;
  const selectedAttemptArchiveAction = predrawnAttemptArchiveAction({
    attemptSelected: Boolean(selectedAttempt),
    canWrite,
    workingCopySyncState,
    busy: Boolean(busy),
    policy: selectedAttemptArchivePolicy,
    canonicalActionLabel,
  });
  const archiveConfirmationTitle = selectedAttemptForgetsDormantSelection
    ? 'Archive slot and forget its AI selection?'
    : 'Archive this pipeline slot?';
  const archiveConfirmationMessage = selectedAttemptForgetsDormantSelection
    ? `This archives the slot and forgets its remembered AI artwork from ${dormantSelectionScope}. The visible Legacy tileset will not change. The immutable artwork remains retained in history.`
    : 'This removes the slot from the active pipeline list. Its immutable artwork remains retained in history.';
  archiveActionSnapshotRef.current = {
    attemptId: selectedAttempt?.attempt.id ?? null,
    attemptRevision: selectedAttempt?.attempt.row_revision ?? null,
    documentRevision,
    action: selectedAttemptArchiveAction,
    confirmationTitle: archiveConfirmationTitle,
    confirmationMessage: archiveConfirmationMessage,
  };

  const archiveSelectedAttempt = async (): Promise<void> => {
    const requested = archiveActionSnapshotRef.current;
    if (
      !requested
      || !requested.action.ready
      || !requested.attemptId
      || requested.attemptRevision === null
    ) {
      setArchiveActionFeedback({
        tone: 'error',
        message: requested?.action.explanation ?? 'Select a pipeline slot to archive.',
      });
      return;
    }
    setError(null);
    setArchiveActionFeedback({
      tone: 'info',
      message: 'Archive confirmation is open. The slot has not changed.',
    });
    let confirmed: boolean;
    try {
      confirmed = await askArchiveConfirmation({
        title: requested.confirmationTitle,
        message: requested.confirmationMessage,
        confirmLabel: 'Archive slot',
        cancelLabel: 'Keep slot',
        tone: 'danger',
      });
    } catch (cause) {
      const message = cause instanceof Error
        ? cause.message
        : 'The archive confirmation could not be opened.';
      setArchiveActionFeedback({ tone: 'error', message });
      return;
    }
    if (!confirmed) {
      setArchiveActionFeedback({
        tone: 'info',
        message: 'Archive canceled. The pipeline slot was not changed.',
      });
      return;
    }
    const current = archiveActionSnapshotRef.current;
    if (
      !current
      || !current.attemptId
      || current.attemptRevision === null
      || current.attemptId !== requested.attemptId
    ) {
      setArchiveActionFeedback({
        tone: 'error',
        message: 'The selected pipeline slot changed while confirmation was open. Nothing was archived.',
      });
      return;
    }
    if (!current.action.ready) {
      setArchiveActionFeedback({
        tone: 'error',
        message: `${current.action.explanation} Nothing was archived.`,
      });
      return;
    }
    if (
      current.confirmationTitle !== requested.confirmationTitle
      || current.confirmationMessage !== requested.confirmationMessage
    ) {
      setArchiveActionFeedback({
        tone: 'error',
        message: 'This slot’s usage changed while confirmation was open. Nothing was archived; review its current state and try again.',
      });
      return;
    }
    setBusy('archive');
    setArchiveActionFeedback({ tone: 'info', message: 'Archiving this pipeline slot…' });
    try {
      const fence = getEditFence();
      if (!fence) throw new Error('Reload an owner editing page before archiving a pipeline slot.');
      const archived = await archivePredrawnGenerationAttempt({
        documentId,
        attemptId: current.attemptId,
        expectedRevision: current.attemptRevision,
        documentRevision: current.documentRevision,
        fence,
      });
      onDocumentUpdated(archived);
      setAttempts((currentAttempts) => currentAttempts.filter(
        (attempt) => attempt.id !== archived.attempt.id,
      ));
      const refreshed = await refreshAfterCompletedMutation('The pipeline slot was archived.');
      if (!refreshed) {
        setArchiveActionFeedback({
          tone: 'error',
          message: 'The server archived the slot, but the active slot list could not be refreshed. Reload Level Artwork to reconcile the list.',
        });
        return;
      }
      const nextModels = predrawnCreationAttemptModels(refreshed.attempts, refreshed.versions);
      const next = nextModels[0];
      selectAttemptId(next?.attempt.id ?? '');
      const nextArtifact = predrawnLatestCommittedArtifact(next);
      setSelectedArtifactId(nextArtifact?.id ?? '');
      setRegistration(
        nextArtifact
          ? predrawnRegistrationForBackground(nextArtifact.backgroundVersion, refreshed.versions)
          : undefined,
      );
      const forgotSelection = archived.forgotten_selection.working_copy
        || archived.forgotten_selection.canonical;
      const successDetail = forgotSelection
        ? 'Its remembered AI selection was forgotten. The visible Legacy tileset did not change.'
        : 'The slot is no longer shown in the active pipeline list.';
      setArchiveActionFeedback({
        tone: 'success',
        message: `Pipeline slot archived. ${successDetail}`,
      });
      onStatus('Pipeline slot archived.', 'success', successDetail);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The pipeline slot could not be archived.';
      setError(message);
      setArchiveActionFeedback({ tone: 'error', message: `Pipeline slot archive failed. ${message}` });
      const mutationHandled = onMutationError(cause);
      if (!mutationHandled) onStatus('Pipeline slot archive failed.', 'error', message);
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
  const active = Boolean(
    selectedArtifact
    && predrawnBoardSurfacesEqual(selectedArtifact.surface, currentSurface),
  );
  const selectedSetDisabledReason = active
    ? undefined
    : !canWrite
      ? 'Reload an owner editing page before setting this board version.'
      : busy
        ? 'Wait for the current pipeline action to finish.'
        : !selectedBackground?.content_url
          || !selectedBackground.frame_width
          || !selectedBackground.frame_height
          ? 'This exact board artwork is unavailable and cannot be set.'
          : !currentEnvironmentGeometry
            ? 'Checking this artwork against the level’s current terrain and scenery layout.'
            : !selectedMatchesCurrentGeometry
              ? 'This artwork no longer matches the level’s current terrain or scenery layout.'
              : !selectedPreviewReady
                ? selectedPreviewMatchesArtifact && selectedPreviewState?.status === 'error'
                  ? `The exact board preview failed: ${selectedPreviewState.message ?? 'The renderer did not produce a complete frame.'}`
                  : 'Preparing the exact board preview. Set will unlock automatically when its artwork and live-scene layers have painted.'
                : undefined;
  const selectedSetBlockerIsError = Boolean(
    selectedPreviewMatchesArtifact && selectedPreviewState?.status === 'error',
  );
  const canonicalActive = Boolean(
    selectedArtifact
    && predrawnBoardSurfacesEqual(selectedArtifact.surface, canonicalSurface),
  );
  const selectedAttemptArchiveState = selectedAttemptArchiveAction.state;
  const selectedAttemptArchiveExplanation = selectedAttemptArchiveAction.explanation;
  const canonicalStateLabel = canonicalActionLabel === 'Publish' ? 'Published' : 'Saved';
  const selectedParentArtifact = artifacts.find((artifact) => artifact.id === selectedArtifact?.parentArtifactId);
  const workingSelectionState = workingCopySyncState === 'saved'
    ? 'Cloud working copy synced'
    : workingCopySyncState === 'pending' || workingCopySyncState === 'saving'
      ? 'Cloud autosave pending'
      : workingCopySyncState === 'signed-out'
        ? 'Signed out · autosave paused'
        : workingCopySyncState === 'error' || workingCopySyncState === 'conflict'
          ? 'Cloud autosave blocked'
          : 'This tab only';
  const moveHighlightEditorPortal = moveHighlightEditorArtifact
    && moveHighlightEditorAttempt?.processing ? (
        <PredrawnMoveHighlightEditor
          artifact={moveHighlightEditorArtifact}
          board={moveHighlightEditorAttempt.processing.board}
          initialCells={moveHighlightEditorAttempt.moveHighlightProfile?.cells ?? {}}
          saving={busy === 'move-highlight'}
          error={error ?? undefined}
          onSave={(cells) => { void saveMoveHighlightCalibration(cells); }}
          onClose={() => {
            setMoveHighlightEditorArtifactId(null);
            setError(null);
          }}
        />
      ) : null;

  if (
    occlusionEditorArtifact
    && occlusionEditorAttempt?.processing
    && occlusionEditorArtifact.backgroundVersion.frame_width
    && occlusionEditorArtifact.backgroundVersion.frame_height
  ) {
    const editorBackground = occlusionEditorArtifact.backgroundVersion;
    return (
      <div
        className="le-predrawn-version-manager is-inspecting"
        data-testid="predrawn-background-version-manager"
      >
        <PredrawnOcclusionEditor
          imageId={editorBackground.id}
          imageUrl={predrawnBackgroundVersionContentUrl(editorBackground.id)}
          imageWidth={editorBackground.frame_width!}
          imageHeight={editorBackground.frame_height!}
          title={`Select foreground pixels on ${occlusionEditorArtifact.title}`}
          notice={occlusionEditorNotice ?? undefined}
          submitLabel="Create board with occlusion mask"
          submitDisabledReason={generateOcclusionDisabledReason}
          onSubmit={generateOcclusion}
          onClose={() => {
            setOcclusionEditorRoute(null);
            setError(null);
          }}
        />
      </div>
    );
  }

  if (
    inspectedArtifact
    && inspectedAttempt?.processing
    && (inspectedArtifact.stage === 'warped' || inspectedArtifact.stage === 'occlusion-ready')
  ) {
    return (
      <div
        className="le-predrawn-version-manager is-inspecting"
        data-testid="predrawn-background-version-manager"
      >
        <PredrawnWarpInspector
          key={`${inspectedArtifact.id}:${moveHighlightProfileSha256(inspectedArtifact.surface) ?? 'uncalibrated'}`}
          artifact={inspectedArtifact}
          board={inspectedAttempt.processing.board}
          reviewGridRegistration={inspectedRegistration}
          canCalibrateMoveHighlights={!inspectedMoveHighlightCalibrationDisabledReason}
          calibrateMoveHighlightsDisabledReason={inspectedMoveHighlightCalibrationDisabledReason}
          canDiscard={!(inspectedArtifact.stage === 'occlusion-ready'
            ? inspectedOcclusionDiscardDisabledReason
            : inspectedWarpDiscardDisabledReason)}
          discarding={busy === (inspectedArtifact.stage === 'occlusion-ready'
            ? 'discard-occlusion'
            : 'discard-warp')}
          discardDisabledReason={inspectedArtifact.stage === 'occlusion-ready'
            ? inspectedOcclusionDiscardDisabledReason
            : inspectedWarpDiscardDisabledReason}
          error={error ?? undefined}
          onCalibrateMoveHighlights={() => openMoveHighlightEditor(
            inspectedArtifact,
            inspectedMoveHighlightCalibrationDisabledReason,
          )}
          onDiscard={() => {
            if (inspectedArtifact.stage === 'occlusion-ready') {
              void discardOcclusion('inspected');
            } else {
              void discardWarp('inspected');
            }
          }}
          onClose={() => {
            setInspectedArtifactId(null);
            setError(null);
          }}
        />
        {moveHighlightEditorPortal}
        {discardWarpConfirmDialog}
        {discardOcclusionConfirmDialog}
      </div>
    );
  }

  return (
    <div className="le-predrawn-version-manager" data-testid="predrawn-background-version-manager">
      <div className="le-predrawn-version-heading">
        <div>
          <span className="skirmish-eyebrow">Board-art processing</span>
          <strong>Pipeline slots</strong>
        </div>
        <span>{attemptModels.length} slot{attemptModels.length === 1 ? '' : 's'}</span>
      </div>
      <div className="le-predrawn-version-state" data-testid="predrawn-background-version-state">
        <span><strong>Working:</strong> {surfaceSelectionLabel(workingArtifact, currentSurface)} · {workingSelectionState}</span>
        <span><strong>{canonicalStateLabel}:</strong> {surfaceSelectionLabel(canonicalArtifact, canonicalSurface)}</span>
      </div>
      <section
        className="le-predrawn-attempt-create is-artwork-ingress"
        data-testid="add-ai-artwork"
        aria-label="Add AI artwork"
      >
        <div className="le-predrawn-attempt-source">
          <span>Add AI artwork</span>
          <small>Paste or choose any full-resolution PNG.</small>
        </div>
        <input
          ref={newArtworkInputRef}
          className="le-predrawn-raw-file-input"
          data-testid="new-ai-artwork-file-input"
          type="file"
          accept="image/png,.png"
          disabled={!canWrite || Boolean(busy) || Boolean(handoffBusy)}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void previewNewAiArtworkFromFile(file);
          }}
        />
        <div className="le-predrawn-version-actions">
          <ChromeButton unit="inner-text-button"
            data-testid="paste-new-ai-artwork"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'active')}
            disabled={!canWrite || Boolean(busy) || Boolean(handoffBusy)}
            onClick={() => { void pasteNewAiArtworkFromClipboard(); }}
            title="Paste any AI artwork PNG and review it before adding it to the board-art pipeline."
          >{handoffBusy === 'paste' ? 'Reading clipboard…' : 'Paste AI artwork'}</ChromeButton>
          <ChromeButton unit="inner-text-button"
            data-testid="choose-new-ai-artwork-file"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            disabled={!canWrite || Boolean(busy) || Boolean(handoffBusy)}
            onClick={() => newArtworkInputRef.current?.click()}
            title="Choose any full-resolution AI artwork PNG and review it before adding it to the board-art pipeline."
          >{handoffBusy === 'file' ? 'Reading PNG…' : 'Choose PNG file'}</ChromeButton>
        </div>
        {stagedPipelineSource?.attemptId === NEW_AI_ARTWORK_INTAKE_ID ? (
          <div className="le-predrawn-pasted-source-review" data-testid="new-ai-artwork-review">
            <img src={stagedPipelineSource.previewUrl} alt="AI artwork awaiting intake" />
            <div>
              <span className="skirmish-eyebrow">
                {stagedPipelineSource.source === 'owner-upload' ? 'Chosen PNG file' : 'Pasted from clipboard'}
              </span>
              <strong>Review AI artwork</strong>
              <span>
                {stagedPipelineSource.width} × {stagedPipelineSource.height} PNG · exact source bytes
                {stagedPipelineSource.originalFileName ? ` · ${stagedPipelineSource.originalFileName}` : ''}
              </span>
              <div className="le-predrawn-version-actions">
                <ChromeButton unit="inner-text-button"
                  data-testid="commit-new-ai-artwork"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'active')}
                  disabled={!canWrite || Boolean(busy) || Boolean(handoffBusy)}
                  onClick={() => { void importNewAiArtwork(); }}
                >{busy === 'raw' ? 'Adding artwork…' : 'Use this board'}</ChromeButton>
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  disabled={Boolean(busy) || Boolean(handoffBusy)}
                  onClick={() => {
                    clearStagedPipelineSource();
                    setClipboardStatus(null);
                  }}
                >Discard image</ChromeButton>
              </div>
            </div>
          </div>
        ) : null}
        {clipboardStatus ? (
          <output
            className={clipboardStatusTone === 'error' ? 'le-predrawn-version-error' : 'le-predrawn-version-ready'}
            data-testid="new-ai-artwork-status"
            role="status"
          >{clipboardStatus}</output>
        ) : null}
      </section>
      <section className="le-predrawn-attempt-create" aria-label="Create pipeline attempt from a saved Pipeline Source">
        <div className="le-predrawn-attempt-source">
          <span>Pipeline Source for a new attempt</span>
          <HouseSelect<string>
            value={newPipelineSourceId}
            disabled={!pipelineSources.length || Boolean(busy)}
            onChange={(versionId) => {
              setNewPipelineSourceId(versionId);
              setAttemptCreationFeedback(null);
            }}
            ariaLabel="Saved Pipeline Source for a new processing attempt"
            options={[
              { value: '', label: 'Choose saved Pipeline Source…', disabled: true },
              ...pipelineSources.map((source) => ({
                value: source.id,
                label: `${createdLabel(source)} · ${source.frame_width} × ${source.frame_height}`,
              })),
            ]}
          />
        </div>
        <ChromeButton unit="inner-text-button"
          data-testid="start-attempt-from-pipeline-source"
          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'active')}
          disabled={!canWrite || !selectedNewPipelineSource || Boolean(busy)}
          onClick={() => { void createAttemptFromPipelineSource(); }}
          title="Create a separate processing attempt with this exact saved Pipeline Source already in place. No image is copied or uploaded."
        >{busy === 'pipeline-attempt' ? 'Starting attempt…' : 'Start new attempt'}</ChromeButton>
        {attemptCreationFeedback ? (
          <output
            className={`le-predrawn-attempt-feedback ${
              attemptCreationFeedback.tone === 'error'
                ? 'le-predrawn-version-error'
                : attemptCreationFeedback.tone === 'success'
                  ? 'le-predrawn-version-ready'
                  : 'le-predrawn-version-help'
            }`}
            role={attemptCreationFeedback.tone === 'error' ? 'alert' : 'status'}
            aria-live={attemptCreationFeedback.tone === 'error' ? 'assertive' : 'polite'}
            data-testid="pipeline-attempt-feedback"
          >
            {attemptCreationFeedback.message}
          </output>
        ) : null}
      </section>
      {!pipelineSources.length && busy !== 'load' ? (
        <output className="le-predrawn-version-help">
          {unavailablePipelineSourceIssue
            ? `A saved Pipeline Source is unavailable: ${unavailablePipelineSourceIssue}`
            : 'No saved Pipeline Source matches this viewing pane and board layout. Add AI artwork above.'}
        </output>
      ) : null}
      <div className="le-predrawn-attempt-tabs" role="list" aria-label="Pipeline slots">
        {attemptModels.map((model, index) => {
          const isSelected = model.attempt.id === selectedAttempt?.attempt.id;
          const stage = model.occlusionReady ? 'Using optional occlusion'
            : model.warped ? 'Using optional grid correction'
              : model.generated ? 'Unchanged board ready'
                : 'Legacy empty slot';
          return (
            <ChromeButton unit="inner-text-button"
              role="listitem"
              key={model.attempt.id}
              className={chromeUnitClassNames('inner-text-button', 'le-predrawn-attempt-tab', isSelected && 'active')}
              aria-pressed={isSelected}
              onClick={() => selectAttempt(model.attempt.id)}
            >
              <small>Slot {attemptModels.length - index}</small>
              <strong>{model.attempt.label}</strong>
              <span>{model.issue ?? stage}</span>
            </ChromeButton>
          );
        })}
      </div>
      <div className="le-predrawn-version-nav" aria-label="Browse pipeline slots">
        <ChromeButton unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
          disabled={selectedAttemptIndex <= 0}
          onClick={() => {
            const attempt = attemptModels[selectedAttemptIndex - 1];
            if (attempt) selectAttempt(attempt.attempt.id);
          }}
          aria-label="Previous pipeline slot"
        >‹</ChromeButton>
        <span>{attemptModels.length ? `${selectedAttemptIndex + 1} / ${attemptModels.length}` : '0 / 0'}</span>
        <ChromeButton unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
          disabled={selectedAttemptIndex >= attemptModels.length - 1}
          onClick={() => {
            const attempt = attemptModels[selectedAttemptIndex + 1];
            if (attempt) selectAttempt(attempt.attempt.id);
          }}
          aria-label="Next pipeline slot"
        >›</ChromeButton>
      </div>
      <div className="le-predrawn-artifact-browser">
        <div className="le-predrawn-artifact-track" role="list" aria-label="Selected pipeline slot stages">
          {selectedAttempt?.attempt.origin === 'migrated-history' ? (
            <div className="le-predrawn-artifact-track-item" role="listitem">
              <div className="le-predrawn-artifact-card is-empty">
                <span className="le-predrawn-artifact-card-copy">
                  <small>Historical handoff</small>
                  <strong>Generation reference not recorded</strong>
                  <span>The raw Codex-painted pipeline source remains preserved below.</span>
                </span>
              </div>
            </div>
          ) : null}
          {(['generated', 'warped', 'occlusion-ready'] as const).map((stage) => {
            const artifact = artifacts.find((candidate) => candidate.stage === stage);
            const pendingVersion = stage === 'generated'
              ? selectedAttempt?.generatedPending
              : stage === 'warped'
                ? selectedAttempt?.warpedPending
                : selectedAttempt?.occlusionPending;
            const title = stage === 'generated'
              ? 'Raw pipeline source'
              : stage === 'warped'
                ? 'Warped board'
                : 'Board with occlusion mask';
            if (!artifact) {
              return (
                <div className="le-predrawn-artifact-track-item" role="listitem" key={stage}>
                  <span className="le-predrawn-artifact-connector" aria-hidden="true">→</span>
                  <div className="le-predrawn-artifact-card is-empty" data-stage={stage}>
                    <span className="le-predrawn-artifact-card-copy">
                      <small>{pendingVersion ? 'Upload interrupted' : stage === 'generated' ? 'Not added' : 'Optional'}</small>
                      <strong>{title}</strong>
                      <span>
                        {pendingVersion
                          ? 'Resume this exact reserved stage below'
                          : stage === 'generated'
                            ? 'Add AI artwork above to create a new slot'
                            : stage === 'warped'
                              ? 'Only if the painted grid needs correction'
                              : 'Only if live units should pass behind painted scenery'}
                      </span>
                    </span>
                  </div>
                </div>
              );
            }
            const artifactPreviewSrc = predrawnBackgroundVersionContentUrl(artifact.backgroundVersion.id);
            const isSelected = artifact.id === selectedArtifact?.id;
            const isWorking = artifact.id === workingArtifact?.id;
            const isCanonical = artifact.id === canonicalArtifact?.id;
            return (
              <div className="le-predrawn-artifact-track-item" role="listitem" key={artifact.id}>
                <span className="le-predrawn-artifact-connector" aria-hidden="true">→</span>
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-predrawn-artifact-card', isSelected && 'active')}
                  aria-pressed={isSelected}
                  data-stage={artifact.stage}
                  onClick={() => selectArtifact(artifact)}
                >
                  <img src={artifactPreviewSrc} alt="" aria-hidden="true" loading="lazy" decoding="async" fetchPriority="low" />
                  <span className="le-predrawn-artifact-card-copy">
                    <small>Committed once</small>
                    <strong>{artifact.title}</strong>
                    <span>{isWorking ? 'Working' : ''}{isWorking && isCanonical ? ' · ' : ''}{isCanonical ? canonicalStateLabel : ''}{!isWorking && !isCanonical ? createdLabel(artifact.version) : ''}</span>
                  </span>
                </ChromeButton>
              </div>
            );
          })}
          {!selectedAttempt ? (
            <div className="le-predrawn-artifact-empty" role="status">
              <strong>No pipeline slot selected</strong>
              <span>Paste AI artwork or choose a PNG file above.</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="le-predrawn-version-nav" aria-label="Browse committed stages">
        <ChromeButton unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
          disabled={selectedIndex <= 0}
          onClick={() => { const artifact = artifacts[selectedIndex - 1]; if (artifact) selectArtifact(artifact); }}
          aria-label="Previous artwork version"
        >‹</ChromeButton>
        <span>{artifacts.length ? `${selectedIndex + 1} / ${artifacts.length}` : '0 / 0'}</span>
        <ChromeButton unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
          disabled={selectedIndex >= artifacts.length - 1}
          onClick={() => { const artifact = artifacts[selectedIndex + 1]; if (artifact) selectArtifact(artifact); }}
          aria-label="Next artwork version"
        >›</ChromeButton>
      </div>

      {selectedArtifact && selectedBackground ? (
        <section className="le-predrawn-artifact-detail" data-stage={selectedArtifact.stage} aria-labelledby="predrawn-selected-artifact-title">
          <div className="le-predrawn-artifact-preview">
            <PredrawnArtifactBoardPreview
              key={`${selectedArtifact.id}:${moveHighlightProfileSha256(selectedArtifact.surface) ?? 'uncalibrated'}`}
              artifact={selectedArtifact}
              board={selectedAttempt?.processing?.board ?? board}
              onStateChange={setSelectedPreviewState}
            />
            <span className="le-predrawn-artifact-stage-pill">{selectedArtifact.title}</span>
          </div>
          <div className="le-predrawn-version-meta">
            <span className="skirmish-eyebrow">Selected version</span>
            <h3 id="predrawn-selected-artifact-title">{selectedArtifact.title}</h3>

            {selectedArtifact.stage === 'generated' ? (
              <div className="le-predrawn-workflow-action-group is-finished">
                <span className="skirmish-eyebrow">Ready to use unchanged</span>
                <p>Use these exact pixels as the board now. Grid correction and occlusion are optional tools, not acceptance steps.</p>
                <div className="le-predrawn-version-actions">
                  <ChromeButton unit="inner-text-button"
                    data-testid="use-unchanged-predrawn-board"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', active && 'active')}
                    disabled={active || Boolean(selectedSetDisabledReason)}
                    onClick={setSelected}
                    title={active
                      ? 'The unchanged AI artwork is already set in the working copy.'
                      : selectedSetDisabledReason
                        ?? `Use these exact pixels in the editor working copy. ${canonicalActionLabel} remains a separate action.`}
                  >{active ? 'Using unchanged board' : 'Use unchanged board'}</ChromeButton>
                  <ChromeButton unit="inner-text-button"
                    data-testid="adjust-predrawn-grid"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                    disabled={Boolean(adjustGridDisabledReason)}
                    onClick={adjustSelectedGrid}
                    title={adjustGridDisabledReason
                      ?? 'Visually fit the board grid over this raw AI-painted source. This stages alignment; it does not change the art yet.'}
                  >
                    Adjust grid (optional)
                  </ChromeButton>
                  {selectedAttempt?.warpedPending ? (
                    <ChromeButton unit="inner-text-button"
                      data-testid="generate-predrawn-warp"
                      className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                      disabled={Boolean(generateWarpDisabledReason)}
                      onClick={() => { void generateWarp({ setWorkingCopy: true, inspectAfterSave: false }); }}
                      title={generateWarpDisabledReason
                        ?? 'Resume saving and selecting the fitted board from its exact reserved grid placement.'}
                    >
                      {busy === 'warp'
                        ? 'Creating corrected copy…'
                        : 'Resume saving fitted board'}
                    </ChromeButton>
                  ) : null}
                </div>
                <small className="le-predrawn-version-help">
                  {selectedSetDisabledReason
                    ?? 'Use unchanged board keeps the original viewing-pane placement and ignores grid fitting. Adjust grid if the painted cells need a different placement.'}
                </small>
              </div>
            ) : null}

            {selectedArtifact.stage === 'warped' ? (
              <div className="le-predrawn-workflow-action-group">
                <span className="skirmish-eyebrow">Optional processing</span>
                <p>
                  {selectedMoveHighlightCalibrationReady
                    ? 'This corrected board is ready to use. Its optional highlight fit is saved, so you may add occlusion if live units should pass behind painted scenery.'
                    : 'This corrected board is ready to use. Fit tile highlights only if you later choose to add an occlusion mask.'}
                </p>
                <div className="le-predrawn-version-actions">
                  <ChromeButton unit="inner-text-button"
                    data-testid="inspect-predrawn-board-full-size"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                    onClick={() => setInspectedArtifactId(selectedArtifact.id)}
                    title="Use the full pipeline workspace to inspect this exact warped board under its saved grid and live tile-highlight treatment."
                  >Inspect full size</ChromeButton>
                  <ChromeButton unit="inner-text-button"
                    data-testid="fit-predrawn-move-highlights"
                    className={chromeUnitClassNames(
                      'inner-text-button',
                      'le-seg-btn',
                    )}
                    disabled={Boolean(moveHighlightCalibrationDisabledReason)}
                    onClick={() => openMoveHighlightEditor(
                      selectedArtifact,
                      moveHighlightCalibrationDisabledReason,
                    )}
                    title={moveHighlightCalibrationDisabledReason
                      ?? 'Open the full tile-highlight workspace and fit visual footprints without changing gameplay geometry.'}
                  >
                    {selectedMoveHighlightCalibrationReady
                      ? 'Edit tile highlights (optional)'
                      : 'Fit tile highlights (optional)'}
                  </ChromeButton>
                  <ChromeButton unit="inner-text-button"
                    data-testid="discard-predrawn-warp"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                    disabled={Boolean(warpDiscardDisabledReason)}
                    onClick={() => { void discardWarp('selected'); }}
                    title={warpDiscardDisabledReason
                      ?? 'Discard this warped result, preserve its grid fit, and return to grid editing in this same slot.'}
                  >{busy === 'discard-warp' ? 'Discarding warped board…' : 'Discard & adjust grid'}</ChromeButton>
                  <ChromeButton unit="inner-text-button"
                    data-testid="refit-predrawn-board"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                    disabled={Boolean(refitSelectedWarpDisabledReason)}
                    onClick={() => { void refitSelectedWarp(); }}
                    title={refitSelectedWarpDisabledReason
                      ?? 'Open the exact saved grid over the original Raw Pipeline Source in a new slot, without changing this board.'}
                  >Refit board</ChromeButton>
                  <ChromeButton unit="inner-text-button"
                    data-testid="edit-predrawn-occlusion-mask"
                    className={chromeUnitClassNames(
                      'inner-text-button',
                      'le-seg-btn',
                    )}
                    disabled={Boolean(openOcclusionEditorDisabledReason)}
                    onClick={() => openOcclusionEditor(
                      selectedArtifact,
                      openOcclusionEditorDisabledReason,
                    )}
                    title={openOcclusionEditorDisabledReason
                      ?? 'Open the exact warped pixels at full size, select foreground scenery with local AI or manual tools, then create a separate board with an occlusion mask.'}
                  >
                    {selectedAttempt?.occlusionPending
                      ? 'Resume optional occlusion'
                      : 'Add occlusion (optional)'}
                  </ChromeButton>
                </div>
              </div>
            ) : null}

            {selectedArtifact.stage === 'occlusion-ready' ? (
              <div className="le-predrawn-workflow-action-group is-finished">
                <span className="skirmish-eyebrow">Mask attached</span>
                <p>This version carries depth data for live units after it is Set on the board. Artifact previews stay unit-free.</p>
                <div className="le-predrawn-version-actions">
                  <ChromeButton unit="inner-text-button"
                    data-testid="inspect-predrawn-board-full-size"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                    onClick={() => setInspectedArtifactId(selectedArtifact.id)}
                    title="Use the full pipeline workspace to inspect this exact board under its saved grid and live tile-highlight treatment."
                  >Inspect full size</ChromeButton>
                  <ChromeButton unit="inner-text-button"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                    disabled={!selectedMaskUsable}
                    aria-pressed={inspectMask}
                    title="Inspect the attached depth data as a far-to-near heatmap."
                    onClick={() => setInspectMask((value) => !value)}
                  >{inspectMask ? 'Hide depth inspection' : 'Inspect depth'}</ChromeButton>
                  <ChromeButton unit="inner-text-button"
                    data-testid="discard-predrawn-occlusion"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                    disabled={Boolean(selectedOcclusionDiscardDisabledReason)}
                    onClick={() => { void discardOcclusion('selected'); }}
                    title={selectedOcclusionDiscardDisabledReason
                      ?? 'Remove only this mask from the slot, preserve the warped board, grid, and visual-highlight calibration, then reopen the mask editor.'}
                  >
                    {busy === 'discard-occlusion'
                      ? 'Discarding mask…'
                      : 'Discard mask & edit again'}
                  </ChromeButton>
                </div>
              </div>
            ) : null}

            <div className="le-predrawn-version-actions le-predrawn-selection-actions">
              {selectedArtifact.stage !== 'generated' ? (
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', active && 'active')}
                  disabled={active || Boolean(selectedSetDisabledReason)}
                  onClick={setSelected}
                  title={active
                    ? 'This exact board version is already set in the working copy.'
                    : selectedSetDisabledReason
                      ?? `Use this exact artwork version in the editor working copy. ${canonicalActionLabel} is still required to make it canonical.`}
                >
                  {active
                    ? workingCopySyncState === 'saved'
                      ? 'Set · cloud synced'
                      : workingCopySyncState === 'pending' || workingCopySyncState === 'saving'
                        ? 'Set · autosave pending'
                        : workingCopySyncState === 'signed-out'
                          ? 'Set · signed out'
                          : workingCopySyncState === 'error' || workingCopySyncState === 'conflict'
                            ? 'Set · autosave blocked'
                            : 'Set in this tab'
                    : 'Set this board version'}
                </ChromeButton>
              ) : null}
              <ChromeButton unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                disabled={!active || !selectedPreviewReady || workingCopySyncState !== 'saved' || Boolean(busy)}
                onClick={onOpenCanonicalAction}
                title={`Open Status to review and ${canonicalActionLabel.toLowerCase()} this cloud-synced working selection.`}
              >{canonicalActionLabel === 'Publish' ? 'Review & publish' : 'Review & save'}</ChromeButton>
            </div>
            {selectedSetDisabledReason ? (
              <output
                className="le-predrawn-selection-blocker"
                data-testid="set-predrawn-background-blocker"
                data-state={selectedSetBlockerIsError ? 'error' : 'blocked'}
                role={selectedSetBlockerIsError ? 'alert' : 'status'}
              >
                <strong>{selectedArtifact.stage === 'generated' ? 'Use unchanged board unavailable' : 'Set unavailable'}</strong>
                <span>{selectedSetDisabledReason}</span>
              </output>
            ) : null}
            <span>{selectedBackground.frame_width ?? '—'} × {selectedBackground.frame_height ?? '—'} px · {createdLabel(selectedArtifact.version)}</span>
            <span>{selectedParentArtifact ? `Created from ${selectedParentArtifact.title}` : 'Exact unchanged AI artwork'}</span>
            <span>{active ? `Working · ${workingSelectionState}` : 'Not set on the working copy'}</span>
            <span>{canonicalActive ? `${canonicalStateLabel} canonical version` : `${canonicalActionLabel} has not made this version canonical`}</span>
          </div>
        </section>
      ) : null}

      {inspectMask && selectedMask && selectedMaskSrc && previewSrc ? (
        <PredrawnOcclusionDepthPreview
          backgroundSrc={previewSrc}
          maskSrc={selectedMaskSrc}
          maskLabel={versionLabel(selectedMask)}
        />
      ) : null}
      <div className="le-predrawn-version-actions le-predrawn-maintenance-actions">
        <ChromeButton unit="inner-text-button"
          data-testid="archive-pipeline-slot"
          data-state={selectedAttemptArchiveState}
          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
          disabled={!selectedAttemptArchiveAction.ready}
          onClick={() => { void archiveSelectedAttempt(); }}
          title={selectedAttemptArchiveExplanation}
        >
          {busy === 'archive' ? 'Archiving…' : 'Archive slot'}
        </ChromeButton>
        <small
          className="le-predrawn-version-help"
          data-testid="archive-pipeline-slot-state"
          data-state={selectedAttemptArchiveState}
          aria-live="polite"
        >
          {selectedAttemptArchiveExplanation}
        </small>
        {archiveActionFeedback ? (
          <output
            className={
              archiveActionFeedback.tone === 'error'
                ? 'le-predrawn-version-error'
                : archiveActionFeedback.tone === 'success'
                  ? 'le-predrawn-version-ready'
                  : 'le-predrawn-version-help'
            }
            data-testid="archive-pipeline-slot-feedback"
            role={archiveActionFeedback.tone === 'error' ? 'alert' : 'status'}
            aria-live={archiveActionFeedback.tone === 'error' ? 'assertive' : 'polite'}
          >
            {archiveActionFeedback.message}
          </output>
        ) : null}
      </div>
      {selectedBackground?.kind === 'raw' && registration && selectedMatchesCurrentGeometry ? <output className="le-predrawn-version-ready">Saving the exact fitted board and its grid placement…</output> : null}
      {selectedBackground && currentEnvironmentGeometry && !selectedMatchesCurrentGeometry ? <output className="le-predrawn-version-error" role="alert">This version belongs to an earlier environment layout and cannot be derived or Set on the current board.</output> : null}
      {invalidAttempts.length ? (
        <output className="le-predrawn-version-error" role="alert">
          {invalidAttempts.map((model) => (
            `${model.attempt.label}: ${model.issue}`
          )).join(' ')} The server will not substitute nearby artwork.
        </output>
      ) : null}
      <output className="le-predrawn-version-help">Set chooses the remembered AI background. The Legacy/AI mode control determines which background the level actually uses. {canonicalActionLabel} remains the canonical boundary.</output>
      {warpDiscardFeedback ? (
        <output
          className={warpDiscardFeedback.tone === 'error'
            ? 'le-predrawn-version-error'
            : warpDiscardFeedback.tone === 'success'
              ? 'le-predrawn-version-ready'
              : 'le-predrawn-version-help'}
          data-testid="discard-predrawn-warp-feedback"
          role={warpDiscardFeedback.tone === 'error' ? 'alert' : 'status'}
        >{warpDiscardFeedback.message}</output>
      ) : null}
      {occlusionDiscardFeedback ? (
        <output
          className={occlusionDiscardFeedback.tone === 'error'
            ? 'le-predrawn-version-error'
            : occlusionDiscardFeedback.tone === 'success'
              ? 'le-predrawn-version-ready'
              : 'le-predrawn-version-help'}
          data-testid="discard-predrawn-occlusion-feedback"
          role={occlusionDiscardFeedback.tone === 'error' ? 'alert' : 'status'}
          aria-live={occlusionDiscardFeedback.tone === 'error' ? 'assertive' : 'polite'}
        >{occlusionDiscardFeedback.message}</output>
      ) : null}
      {error ? <output className="le-predrawn-version-error" role="alert">{error}</output> : null}
      {pickerOpen && selectedBackground?.content_url && selectedOwned ? (
        <PredrawnCornerPicker
          src={predrawnBackgroundVersionContentUrl(selectedBackground.id)}
          initialRegistration={registration
            ?? predrawnRegistrationForBackground(selectedBackground, versions)
            ?? storedPredrawnBoardRegistration(predrawnBackgroundVersionContentUrl(selectedBackground.id))}
          columns={board.cols}
          rows={board.rows}
          onChange={setRegistration}
          onSaveRegistration={(next) => {
            storePredrawnBoardRegistration(
              predrawnBackgroundVersionContentUrl(selectedBackground.id),
              next,
            );
            setRegistration(next);
            setPickerOpen(false);
            void generateWarp({
              registrationOverride: next,
              setWorkingCopy: true,
              inspectAfterSave: false,
            });
          }}
          saveLabel="USE FITTED BOARD"
          showCodexHandoff={false}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
      {moveHighlightEditorPortal}
      {archiveConfirmDialog}
      {discardWarpConfirmDialog}
      {discardOcclusionConfirmDialog}
    </div>
  );
}
