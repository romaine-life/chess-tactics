import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import {
  createPredrawnSlimSamClient,
  type PredrawnSlimSamClient,
  type PredrawnSlimSamProgress,
} from './predrawnSlimSamClient';
import {
  PREDRAWN_OCCLUSION_MAX_ZOOM,
  acceptPredrawnOcclusionCandidate,
  clampPredrawnOcclusionPan,
  commitPredrawnOcclusionGesture,
  countPredrawnOcclusionPixels,
  createPredrawnOcclusionHistory,
  createPredrawnOcclusionSnapshot,
  discardPredrawnOcclusionCandidate,
  fitPredrawnOcclusionZoom,
  mutatePredrawnOcclusionStroke,
  nativePredrawnOcclusionPoint,
  recordPredrawnOcclusionHistory,
  selectPredrawnOcclusionCandidate,
  stepPredrawnOcclusionHistory,
  zoomPredrawnOcclusionAtPoint,
  type PredrawnOcclusionHistory,
  type PredrawnOcclusionPoint,
  type PredrawnOcclusionPrompt,
  type PredrawnOcclusionPromptLabel,
} from './predrawnOcclusionEditorState';
import './PredrawnOcclusionEditor.css';
import { ChromeButton } from './shared/ChromeButton';

type PredrawnOcclusionTool = 'positive' | 'negative' | 'brush' | 'eraser';
type ModelState = 'preparing' | 'ready' | 'predicting' | 'error';

interface PanGesture {
  kind: 'pan';
  pointerId: number;
  clientX: number;
  clientY: number;
  openingPan: PredrawnOcclusionPoint;
}

interface PaintGesture {
  kind: 'paint';
  pointerId: number;
  openingHistory: PredrawnOcclusionHistory;
  workingAlpha: Uint8Array;
  lastPoint: PredrawnOcclusionPoint;
  value: 0 | 255;
  changed: boolean;
}

type PointerGesture = PanGesture | PaintGesture;

export interface PredrawnOcclusionMaskDraft {
  imageId: string;
  width: number;
  height: number;
  acceptedAlpha: Uint8Array;
  selectedPixelCount: number;
  positivePromptCount: number;
  negativePromptCount: number;
  manualEditCount: number;
  modelId?: string;
  modelRevision?: string;
  backend?: 'webgpu' | 'wasm';
}

export interface PredrawnOcclusionEditorProps {
  imageId: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  title?: string;
  /**
   * Opening mask for this component mount/image identity. Later changes with
   * the same imageId and dimensions are intentionally ignored so a parent
   * refresh cannot erase in-progress authoring.
   */
  initialAlpha?: Uint8Array;
  segmentationClient?: PredrawnSlimSamClient;
  notice?: string;
  submitLabel?: string;
  submitDisabledReason?: string;
  onSubmit?: (draft: PredrawnOcclusionMaskDraft) => void | Promise<void>;
  onClose: () => void;
}

function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message;
  return fallback;
}

function renderAlphaMask(
  canvas: HTMLCanvasElement | null,
  alpha: Uint8Array | undefined,
  width: number,
  height: number,
  color: readonly [number, number, number],
  opacity: number,
): void {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, width, height);
  if (!alpha?.some((value) => value > 0)) return;
  const pixels = context.createImageData(width, height);
  for (let index = 0; index < alpha.length; index += 1) {
    if (!alpha[index]) continue;
    const offset = index * 4;
    pixels.data[offset] = color[0];
    pixels.data[offset + 1] = color[1];
    pixels.data[offset + 2] = color[2];
    pixels.data[offset + 3] = Math.round((alpha[index] / 255) * opacity);
  }
  context.putImageData(pixels, 0, 0);
}

function previewAcceptedMaskStroke(
  canvas: HTMLCanvasElement | null,
  from: PredrawnOcclusionPoint,
  to: PredrawnOcclusionPoint,
  radius: number,
  value: 0 | 255,
): void {
  const context = canvas?.getContext('2d');
  if (!context) return;
  context.save();
  context.globalCompositeOperation = value === 255 ? 'source-over' : 'destination-out';
  context.fillStyle = value === 255 ? 'rgba(31, 211, 238, 0.518)' : '#000';
  context.strokeStyle = context.fillStyle;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = Math.max(1, radius * 2);
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.beginPath();
  context.arc(to.x, to.y, Math.max(0.5, radius), 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function progressPercent(progress: PredrawnSlimSamProgress | undefined): number | undefined {
  if (!progress || progress.total <= 0) return undefined;
  return Math.min(100, Math.max(0, (progress.completed / progress.total) * 100));
}

function selectedCandidateLabel(
  selectedIndex: number,
  candidateCount: number,
  score: number | undefined,
): string {
  if (!candidateCount) return 'No candidate';
  const confidence = Number.isFinite(score) ? ` · score ${Math.round((score ?? 0) * 100)}%` : '';
  return `Candidate ${selectedIndex + 1} of ${candidateCount}${confidence}`;
}

/**
 * Full center-workspace editor for selecting foreground pixels directly from
 * one immutable warped PNG. The component owns no persistence: it only returns
 * a native-resolution alpha mask to its optional submit callback.
 */
export function PredrawnOcclusionEditor({
  imageId,
  imageUrl,
  imageWidth,
  imageHeight,
  title = 'Select painted foreground',
  initialAlpha,
  segmentationClient,
  notice,
  submitLabel = 'Use this mask',
  submitDisabledReason,
  onSubmit,
  onClose,
}: PredrawnOcclusionEditorProps): ReactElement {
  const workspaceRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const acceptedCanvasRef = useRef<HTMLCanvasElement>(null);
  const candidateCanvasRef = useRef<HTMLCanvasElement>(null);
  const internalClientRef = useRef<PredrawnSlimSamClient | undefined>(undefined);
  if (!segmentationClient && !internalClientRef.current) {
    internalClientRef.current = createPredrawnSlimSamClient();
  }
  const client = segmentationClient ?? internalClientRef.current!;
  // Authorized content URLs may refresh while immutable raster identity does not.
  // A URL refresh must not throw away an in-progress mask.
  const sourceKey = `${imageId}:${imageWidth}x${imageHeight}`;
  const openingSnapshotRef = useRef(
    createPredrawnOcclusionSnapshot(imageWidth, imageHeight, initialAlpha),
  );
  const historyRef = useRef<PredrawnOcclusionHistory>(
    createPredrawnOcclusionHistory(imageWidth, imageHeight, initialAlpha),
  );
  const gestureRef = useRef<PointerGesture | undefined>(undefined);
  const segmentAbortRef = useRef<AbortController | undefined>(undefined);
  const fitZoomRef = useRef(0.5);
  const previousSourceKeyRef = useRef(sourceKey);

  const [history, setHistory] = useState(historyRef.current);
  const [tool, setTool] = useState<PredrawnOcclusionTool>('positive');
  const [brushRadius, setBrushRadius] = useState(8);
  const [modelState, setModelState] = useState<ModelState>('preparing');
  const [progress, setProgress] = useState<PredrawnSlimSamProgress>();
  const [prepareAttempt, setPrepareAttempt] = useState(0);
  const [modelError, setModelError] = useState<string>();
  const [editorError, setEditorError] = useState<string>();
  const [imageReady, setImageReady] = useState(false);
  const [imageError, setImageError] = useState<string>();
  const [pendingPrompt, setPendingPrompt] = useState<PredrawnOcclusionPrompt>();
  const [fitZoom, setFitZoom] = useState(0.5);
  const [viewZoom, setViewZoom] = useState(0.5);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const current = history.present;
  const selectedCandidate = current.candidates[current.selectedCandidateIndex];
  const selectedPixelCount = useMemo(
    () => countPredrawnOcclusionPixels(current.acceptedAlpha),
    [current.acceptedAlpha],
  );
  const reportedProgressPercent = progressPercent(progress);
  const busy = modelState === 'predicting' || submitting;

  const replaceHistory = useCallback((next: PredrawnOcclusionHistory): void => {
    historyRef.current = next;
    setHistory(next);
    setSubmitted(false);
  }, []);

  const commitSnapshot = useCallback((
    next: PredrawnOcclusionHistory['present'],
  ): void => {
    replaceHistory(recordPredrawnOcclusionHistory(historyRef.current, next));
  }, [replaceHistory]);

  useEffect(() => {
    if (previousSourceKeyRef.current === sourceKey) return;
    previousSourceKeyRef.current = sourceKey;
    segmentAbortRef.current?.abort();
    const opening = createPredrawnOcclusionSnapshot(imageWidth, imageHeight, initialAlpha);
    openingSnapshotRef.current = opening;
    replaceHistory({
      past: [],
      present: opening,
      future: [],
    });
    gestureRef.current = undefined;
    setPendingPrompt(undefined);
    setImageReady(false);
    setImageError(undefined);
    setEditorError(undefined);
    setModelError(undefined);
    setSubmitted(false);
    setViewPan({ x: 0, y: 0 });
  }, [imageHeight, imageWidth, replaceHistory, sourceKey]);

  useEffect(() => {
    const abort = new AbortController();
    setModelState('preparing');
    setProgress(undefined);
    setModelError(undefined);
    void client.prepare({
      imageId,
      imageUrl,
      width: imageWidth,
      height: imageHeight,
      signal: abort.signal,
      onProgress: setProgress,
    }).then(() => {
      if (abort.signal.aborted) return;
      setModelState('ready');
      setProgress(undefined);
    }).catch((cause: unknown) => {
      if (abort.signal.aborted) return;
      setModelState('error');
      setModelError(errorMessage(
        cause,
        'AI selection could not prepare this artwork. Brush and eraser remain available.',
      ));
    });
    return () => abort.abort();
  }, [client, imageHeight, imageId, imageUrl, imageWidth, prepareAttempt, sourceKey]);

  useEffect(() => () => {
    segmentAbortRef.current?.abort();
    if (!segmentationClient) internalClientRef.current?.dispose();
  }, [segmentationClient]);

  useEffect(() => {
    renderAlphaMask(
      acceptedCanvasRef.current,
      current.acceptedAlpha,
      imageWidth,
      imageHeight,
      [31, 211, 238],
      132,
    );
  }, [current.acceptedAlpha, imageHeight, imageWidth]);

  useEffect(() => {
    renderAlphaMask(
      candidateCanvasRef.current,
      selectedCandidate?.alpha,
      imageWidth,
      imageHeight,
      [255, 190, 64],
      150,
    );
  }, [imageHeight, imageWidth, selectedCandidate?.alpha]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = (): void => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      if (!width || !height) return;
      const nextFit = fitPredrawnOcclusionZoom(
        width,
        height,
        imageWidth,
        imageHeight,
      );
      const followedFit = Math.abs(viewZoom - fitZoomRef.current) < 0.005;
      fitZoomRef.current = nextFit;
      setFitZoom(nextFit);
      if (followedFit) {
        setViewZoom(nextFit);
        setViewPan({ x: 0, y: 0 });
      } else {
        setViewPan((value) => clampPredrawnOcclusionPan(
          value,
          viewZoom,
          width,
          height,
          imageWidth,
          imageHeight,
        ));
      }
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(measure);
    observer?.observe(viewport);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [imageHeight, imageWidth, sourceKey, viewZoom]);

  useEffect(() => {
    workspaceRef.current?.focus();
  }, [sourceKey]);

  const pointFromPointer = (
    event: Pick<ReactPointerEvent, 'clientX' | 'clientY'>,
  ): PredrawnOcclusionPoint | undefined => {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds) return undefined;
    return nativePredrawnOcclusionPoint(
      event.clientX,
      event.clientY,
      bounds,
      imageWidth,
      imageHeight,
    );
  };

  const runSegmentation = useCallback(async (
    point: PredrawnOcclusionPrompt,
  ): Promise<void> => {
    if (modelState !== 'ready' || submitting) return;
    const opening = historyRef.current;
    const points = [...opening.present.prompts, point];
    const abort = new AbortController();
    segmentAbortRef.current?.abort();
    segmentAbortRef.current = abort;
    setPendingPrompt(point);
    setModelState('predicting');
    setProgress(undefined);
    setModelError(undefined);
    setEditorError(undefined);
    try {
      const result = await client.segment({
        points,
        signal: abort.signal,
        onProgress: setProgress,
      });
      if (abort.signal.aborted) return;
      if (result.width !== imageWidth || result.height !== imageHeight) {
        throw new Error(
          `AI selection returned ${result.width} × ${result.height}; expected the exact warped artwork size ${imageWidth} × ${imageHeight}.`,
        );
      }
      const candidates = result.candidates.map((candidate) => {
        if (candidate.alpha.length !== imageWidth * imageHeight) {
          throw new Error(
            `AI candidate ${candidate.index + 1} returned ${candidate.alpha.length} pixels; expected ${imageWidth * imageHeight}.`,
          );
        }
        return {
          index: candidate.index,
          score: candidate.score,
          alpha: new Uint8Array(candidate.alpha),
        };
      });
      if (!candidates.length) {
        throw new Error('AI selection returned no mask candidates.');
      }
      const recommendedByIdentity = candidates.findIndex(
        (candidate) => candidate.index === result.recommendedIndex,
      );
      const recommendedByPosition = result.recommendedIndex >= 0
        && result.recommendedIndex < candidates.length
        ? result.recommendedIndex
        : 0;
      const selectedCandidateIndex = recommendedByIdentity >= 0
        ? recommendedByIdentity
        : recommendedByPosition;
      replaceHistory(recordPredrawnOcclusionHistory(opening, {
        ...opening.present,
        prompts: points,
        candidates,
        selectedCandidateIndex,
        activeModel: {
          modelId: result.modelId,
          modelRevision: result.modelRevision,
          backend: result.backend,
        },
      }));
      setModelState('ready');
      setProgress(undefined);
    } catch (cause) {
      if (abort.signal.aborted) return;
      setModelState('error');
      setModelError(errorMessage(
        cause,
        'AI selection failed. The mask was not changed; brush and eraser remain available.',
      ));
    } finally {
      if (segmentAbortRef.current === abort) segmentAbortRef.current = undefined;
      if (!abort.signal.aborted) setPendingPrompt(undefined);
    }
  }, [
    client,
    imageHeight,
    imageWidth,
    modelState,
    replaceHistory,
    submitting,
  ]);

  const beginPaint = (
    event: ReactPointerEvent<HTMLDivElement>,
    point: PredrawnOcclusionPoint,
    value: 0 | 255,
  ): void => {
    const openingHistory = historyRef.current;
    const workingAlpha = new Uint8Array(openingHistory.present.acceptedAlpha);
    const result = mutatePredrawnOcclusionStroke(
      workingAlpha,
      imageWidth,
      imageHeight,
      point,
      point,
      brushRadius,
      value,
    );
    gestureRef.current = {
      kind: 'paint',
      pointerId: event.pointerId,
      openingHistory,
      workingAlpha,
      lastPoint: point,
      value,
      changed: result.changed,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (result.changed) {
      previewAcceptedMaskStroke(
        acceptedCanvasRef.current,
        point,
        point,
        brushRadius,
        value,
      );
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button === 2) {
      event.preventDefault();
      gestureRef.current = {
        kind: 'pan',
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        openingPan: viewPan,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0 || busy || !imageReady) return;
    const point = pointFromPointer(event);
    if (!point) return;
    event.preventDefault();
    if (tool === 'positive' || tool === 'negative') {
      if (modelState !== 'ready') return;
      void runSegmentation({ ...point, label: tool });
      return;
    }
    beginPaint(event, point, tool === 'brush' ? 255 : 0);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (gesture.kind === 'pan') {
      const viewport = viewportRef.current;
      if (!viewport) return;
      setViewPan(clampPredrawnOcclusionPan(
        {
          x: gesture.openingPan.x + event.clientX - gesture.clientX,
          y: gesture.openingPan.y + event.clientY - gesture.clientY,
        },
        viewZoom,
        viewport.clientWidth,
        viewport.clientHeight,
        imageWidth,
        imageHeight,
      ));
      return;
    }
    const point = pointFromPointer(event);
    if (!point) return;
    const result = mutatePredrawnOcclusionStroke(
      gesture.workingAlpha,
      imageWidth,
      imageHeight,
      gesture.lastPoint,
      point,
      brushRadius,
      gesture.value,
    );
    const from = gesture.lastPoint;
    gesture.lastPoint = point;
    gesture.changed = result.changed || gesture.changed;
    if (result.changed) {
      previewAcceptedMaskStroke(
        acceptedCanvasRef.current,
        from,
        point,
        brushRadius,
        gesture.value,
      );
    }
  };

  const finishPointerGesture = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    gestureRef.current = undefined;
    if (gesture.kind === 'paint' && gesture.changed) {
      replaceHistory(commitPredrawnOcclusionGesture(
        gesture.openingHistory,
        {
          ...gesture.openingHistory.present,
          acceptedAlpha: gesture.workingAlpha,
        },
      ));
    }
  };

  const zoomAtViewportPoint = (
    viewportX: number,
    viewportY: number,
    nextZoom: number,
  ): void => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const changed = zoomPredrawnOcclusionAtPoint({
      zoom: viewZoom,
      nextZoom: Math.max(fitZoom, nextZoom),
      pan: viewPan,
      viewportWidth: viewport.clientWidth,
      viewportHeight: viewport.clientHeight,
      imageWidth,
      imageHeight,
      viewportX,
      viewportY,
    });
    setViewZoom(changed.zoom);
    setViewPan(changed.pan);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const multiplier = Math.exp(-event.deltaY * 0.0015);
    zoomAtViewportPoint(
      event.clientX - bounds.left,
      event.clientY - bounds.top,
      viewZoom * multiplier,
    );
  };

  const stepHistory = (direction: 'undo' | 'redo'): void => {
    if (busy) return;
    const next = stepPredrawnOcclusionHistory(historyRef.current, direction);
    if (next) replaceHistory(next);
  };

  const handleWorkspaceKeyDown = (
    event: ReactKeyboardEvent<HTMLElement>,
  ): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (submitting) return;
      segmentAbortRef.current?.abort();
      onClose();
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      stepHistory('undo');
    } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault();
      stepHistory('redo');
    }
  };

  const reset = (): void => {
    if (busy) return;
    commitSnapshot({
      ...openingSnapshotRef.current,
      acceptedAlpha: new Uint8Array(openingSnapshotRef.current.acceptedAlpha),
    });
    setEditorError(undefined);
  };

  const submit = async (): Promise<void> => {
    if (submitDisabledReason) {
      setEditorError(submitDisabledReason);
      return;
    }
    if (!onSubmit) {
      setEditorError(
        'No pipeline submit callback is connected. This editor cannot create an occlusion artifact by itself.',
      );
      return;
    }
    if (current.candidates.length) {
      setEditorError('Add or discard the visible AI candidate before submitting the mask.');
      return;
    }
    if (!selectedPixelCount) {
      setEditorError('The mask is empty. Select or brush the foreground pixels first.');
      return;
    }
    setSubmitting(true);
    setEditorError(undefined);
    try {
      await onSubmit({
        imageId,
        width: imageWidth,
        height: imageHeight,
        acceptedAlpha: new Uint8Array(current.acceptedAlpha),
        selectedPixelCount,
        positivePromptCount: current.positivePromptCount,
        negativePromptCount: current.negativePromptCount,
        manualEditCount: current.manualEditCount,
        modelId: current.acceptedModel?.modelId,
        modelRevision: current.acceptedModel?.modelRevision,
        backend: current.acceptedModel?.backend,
      });
      setSubmitted(true);
    } catch (cause) {
      setEditorError(errorMessage(
        cause,
        'The pipeline rejected this mask. No occlusion artifact was created.',
      ));
    } finally {
      setSubmitting(false);
    }
  };

  const modelStatusText = modelState === 'ready'
    ? 'AI selection is ready.'
    : modelState === 'predicting'
      ? progress?.message ?? 'Finding the selected pixels…'
      : modelState === 'preparing'
        ? progress?.message ?? 'Preparing local AI selection…'
        : `AI selection is unavailable. ${modelError ?? 'Use the brush and eraser instead.'}`;
  const promptPoints = pendingPrompt
    ? [...current.prompts, pendingPrompt]
    : current.prompts;
  const pointToolsDisabled = modelState !== 'ready' || submitting || !imageReady;
  const stageStyle = {
    width: `${imageWidth}px`,
    height: `${imageHeight}px`,
    left: `calc(50% + ${viewPan.x}px)`,
    top: `calc(50% + ${viewPan.y}px)`,
    transform: `translate(-50%, -50%) scale(${viewZoom})`,
  } satisfies CSSProperties;

  return (
    <section
      ref={workspaceRef}
      className="le-predrawn-workspace-inspector predrawn-occlusion-editor"
      data-testid="predrawn-occlusion-editor"
      tabIndex={-1}
      aria-labelledby="predrawn-occlusion-editor-title"
      onKeyDown={handleWorkspaceKeyDown}
    >
      <header className="le-predrawn-workspace-inspector-head predrawn-occlusion-editor-head">
        <div>
          <span className="skirmish-eyebrow">Board Art Pipeline · Occlusion mask</span>
          <h2 id="predrawn-occlusion-editor-title">{title}</h2>
          <p>
            {imageWidth} × {imageHeight} px · The exact warped artwork is the only image
            examined. Legacy tile artwork is never loaded or consulted.
          </p>
        </div>
        <ChromeButton unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
          disabled={submitting}
          title={submitting
            ? 'Wait for the mask submission to finish before closing this workspace.'
            : 'Close the occlusion-mask workspace.'}
          onClick={() => {
            if (submitting) return;
            segmentAbortRef.current?.abort();
            onClose();
          }}
        >Close</ChromeButton>
      </header>

      <div className="le-predrawn-workspace-inspector-toolbar predrawn-occlusion-editor-toolbar">
        <div className="predrawn-occlusion-editor-tools" role="toolbar" aria-label="Mask tools">
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-occlusion-positive-tool"
            className={chromeUnitClassNames(
              'inner-text-button',
              'le-seg-btn',
              tool === 'positive' && 'active',
            )}
            aria-pressed={tool === 'positive'}
            disabled={pointToolsDisabled}
            title={pointToolsDisabled
              ? 'Positive points become available when the local segmentation model is ready.'
              : 'Click something that should be included in the proposed mask.'}
            onClick={() => setTool('positive')}
          >Positive point</ChromeButton>
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-occlusion-negative-tool"
            className={chromeUnitClassNames(
              'inner-text-button',
              'le-seg-btn',
              tool === 'negative' && 'active',
            )}
            aria-pressed={tool === 'negative'}
            disabled={pointToolsDisabled}
            title={pointToolsDisabled
              ? 'Negative points become available when the local segmentation model is ready.'
              : 'Click something that should be removed from the proposed mask.'}
            onClick={() => setTool('negative')}
          >Negative point</ChromeButton>
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-occlusion-brush-tool"
            className={chromeUnitClassNames(
              'inner-text-button',
              'le-seg-btn',
              tool === 'brush' && 'active',
            )}
            aria-pressed={tool === 'brush'}
            disabled={busy}
            title="Paint exact native-image pixels into the accepted mask."
            onClick={() => setTool('brush')}
          >Brush</ChromeButton>
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-occlusion-eraser-tool"
            className={chromeUnitClassNames(
              'inner-text-button',
              'le-seg-btn',
              tool === 'eraser' && 'active',
            )}
            aria-pressed={tool === 'eraser'}
            disabled={busy}
            title="Erase exact native-image pixels from the accepted mask."
            onClick={() => setTool('eraser')}
          >Eraser</ChromeButton>
          <label className="predrawn-occlusion-editor-brush-size">
            <span>Brush radius</span>
            <input
              type="range"
              min={1}
              max={64}
              step={1}
              value={brushRadius}
              disabled={busy}
              aria-label="Brush radius in native image pixels"
              onChange={(event) => setBrushRadius(Number(event.currentTarget.value))}
            />
            <output>{brushRadius} px</output>
          </label>
        </div>

        <div className="predrawn-occlusion-editor-history" role="group" aria-label="Mask history">
          <ChromeButton unit="inner-undo-key"
            data-testid="predrawn-occlusion-undo"
            className={chromeUnitClassNames('inner-undo-key', 'le-seg-btn')}
            disabled={!history.past.length || busy}
            aria-label="Undo mask edit"
            title={history.past.length ? 'Undo the last mask edit.' : 'Nothing to undo.'}
            onClick={() => stepHistory('undo')}
          >Undo</ChromeButton>
          <ChromeButton unit="inner-redo-key"
            data-testid="predrawn-occlusion-redo"
            className={chromeUnitClassNames('inner-redo-key', 'le-seg-btn')}
            disabled={!history.future.length || busy}
            aria-label="Redo mask edit"
            title={history.future.length ? 'Redo the last undone mask edit.' : 'Nothing to redo.'}
            onClick={() => stepHistory('redo')}
          >Redo</ChromeButton>
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-occlusion-reset"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'danger')}
            disabled={busy}
            title="Restore the mask and points that were present when this workspace opened."
            onClick={reset}
          >Reset all</ChromeButton>
        </div>

        <div
          className="le-predrawn-workspace-inspector-zoom predrawn-occlusion-editor-zoom"
          role="group"
          aria-label="Artwork zoom"
        >
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-occlusion-fit"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            title="Fit the complete artwork in the workspace and center it."
            onClick={() => {
              setViewZoom(fitZoom);
              setViewPan({ x: 0, y: 0 });
            }}
          >Fit artwork</ChromeButton>
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-occlusion-zoom-out"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            aria-label="Zoom out"
            disabled={viewZoom <= fitZoom + 0.001}
            title="Zoom out."
            onClick={() => {
              const viewport = viewportRef.current;
              if (!viewport) return;
              zoomAtViewportPoint(
                viewport.clientWidth / 2,
                viewport.clientHeight / 2,
                viewZoom / 1.2,
              );
            }}
          >−</ChromeButton>
          <output aria-label="Current artwork zoom">{Math.round(viewZoom * 100)}%</output>
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-occlusion-zoom-in"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            aria-label="Zoom in"
            disabled={viewZoom >= PREDRAWN_OCCLUSION_MAX_ZOOM}
            title="Zoom in."
            onClick={() => {
              const viewport = viewportRef.current;
              if (!viewport) return;
              zoomAtViewportPoint(
                viewport.clientWidth / 2,
                viewport.clientHeight / 2,
                viewZoom * 1.2,
              );
            }}
          >+</ChromeButton>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`le-predrawn-workspace-inspector-viewport predrawn-occlusion-editor-viewport${gestureRef.current?.kind === 'pan'
          ? ' is-panning'
          : ''}`}
        data-testid="predrawn-occlusion-viewport"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerGesture}
        onPointerCancel={finishPointerGesture}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div
          ref={stageRef}
          className="predrawn-occlusion-editor-stage"
          style={stageStyle}
          role="group"
          aria-label={`${title}. ${tool === 'positive'
            ? 'Positive point tool'
            : tool === 'negative'
              ? 'Negative point tool'
              : `${tool} tool`} active. Right-drag pans and the mouse wheel zooms.`}
        >
          <img
            src={imageUrl}
            width={imageWidth}
            height={imageHeight}
            draggable={false}
            alt="Exact warped board artwork used for this occlusion mask"
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth !== imageWidth || image.naturalHeight !== imageHeight) {
                setImageReady(false);
                setImageError(
                  `Artwork decoded as ${image.naturalWidth} × ${image.naturalHeight}; expected ${imageWidth} × ${imageHeight}.`,
                );
                return;
              }
              setImageReady(true);
              setImageError(undefined);
            }}
            onError={() => {
              setImageReady(false);
              setImageError('The exact warped artwork could not be displayed.');
            }}
          />
          <canvas
            ref={acceptedCanvasRef}
            className="predrawn-occlusion-editor-mask is-accepted"
            width={imageWidth}
            height={imageHeight}
            aria-hidden="true"
          />
          <canvas
            ref={candidateCanvasRef}
            className="predrawn-occlusion-editor-mask is-candidate"
            width={imageWidth}
            height={imageHeight}
            aria-hidden="true"
          />
          <div className="predrawn-occlusion-editor-points" aria-hidden="true">
            {promptPoints.map((point, index) => (
              <span
                key={`${point.label}:${index}:${point.x}:${point.y}`}
                className={`predrawn-occlusion-editor-point is-${point.label}${point === pendingPrompt
                  ? ' is-pending'
                  : ''}`}
                style={{
                  left: `${(point.x / imageWidth) * 100}%`,
                  top: `${(point.y / imageHeight) * 100}%`,
                  transform: `translate(-50%, -50%) scale(${1 / viewZoom})`,
                }}
              >{point.label === 'positive' ? '+' : '−'}</span>
            ))}
          </div>
        </div>
        {!imageReady && !imageError ? (
          <span className="predrawn-occlusion-editor-viewport-status" role="status">
            Loading exact warped artwork…
          </span>
        ) : null}
        {imageError ? (
          <span className="predrawn-occlusion-editor-viewport-status is-error" role="alert">
            {imageError}
          </span>
        ) : null}
      </div>

      <footer className="le-predrawn-workspace-inspector-footer predrawn-occlusion-editor-footer">
        <div className="predrawn-occlusion-editor-status">
          <div
            className={`predrawn-occlusion-editor-model-status${modelState === 'error'
              ? ' is-error'
              : ''}`}
            role={modelState === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            <strong>{modelStatusText}</strong>
            {progress ? <small>{progress.backend.toUpperCase()} · {progress.stage}</small> : null}
            {progress && reportedProgressPercent !== undefined ? (
              <progress
                max={100}
                value={reportedProgressPercent}
                aria-label={progress.message}
              />
            ) : progress ? (
              <progress aria-label={progress.message} />
            ) : null}
            {modelState === 'error' ? (
              <ChromeButton unit="inner-text-button"
                data-testid="predrawn-occlusion-retry-model"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                disabled={submitting}
                title="Retry loading and encoding this exact warped artwork."
                onClick={() => setPrepareAttempt((value) => value + 1)}
              >Retry AI selection</ChromeButton>
            ) : null}
          </div>
          <p>
            Cyan pixels are accepted. Amber pixels are the current AI candidate.
            Positive points include an object; negative points remove mistakes.
            Brush and eraser always edit native image pixels directly.
          </p>
          <p>
            When you create the board with an occlusion mask, each connected cyan region takes its
            live-unit depth from the bottom-most selected pixel in each image column. Inspect
            the resulting clipping before setting that version on the level.
          </p>
          <p>
            Right-drag pans · mouse wheel zooms · {selectedPixelCount.toLocaleString()} accepted
            pixels · {current.positivePromptCount} accepted positive
            point{current.positivePromptCount === 1 ? '' : 's'} ·{' '}
            {current.negativePromptCount} accepted negative
            point{current.negativePromptCount === 1 ? '' : 's'} ·{' '}
            {current.manualEditCount} manual stroke{current.manualEditCount === 1 ? '' : 's'}
          </p>
          {editorError ? (
            <small className="predrawn-occlusion-editor-error" role="alert">{editorError}</small>
          ) : notice ? (
            <small className="le-predrawn-version-ready" role="status">{notice}</small>
          ) : submitted ? (
            <small role="status">The owning pipeline accepted this native-resolution mask.</small>
          ) : submitDisabledReason ? (
            <small>{submitDisabledReason}</small>
          ) : !onSubmit ? (
            <small>
              No submit callback is connected. This workspace can edit a mask but cannot create
              an occlusion artifact.
            </small>
          ) : (
            <small>
              No artifact is created until you choose {submitLabel}; this editor itself never
              saves or publishes anything.
            </small>
          )}
        </div>

        <div className="predrawn-occlusion-editor-actions">
          <div
            className="predrawn-occlusion-editor-candidates"
            role="group"
            aria-label="AI mask candidates"
          >
            <ChromeButton unit="inner-chevron-key"
              data-testid="predrawn-occlusion-previous-candidate"
              className={chromeUnitClassNames(
                'inner-chevron-key',
                'le-seg-btn',
                'stepper-chevron-left',
              )}
              disabled={!current.candidates.length || current.selectedCandidateIndex === 0 || busy}
              aria-label="Previous AI mask candidate"
              title="Show the previous mask proposed for these same points."
              onClick={() => commitSnapshot(selectPredrawnOcclusionCandidate(
                historyRef.current.present,
                historyRef.current.present.selectedCandidateIndex - 1,
              ))}
            >Previous</ChromeButton>
            <output aria-live="polite" aria-label="Current AI mask candidate">
              {selectedCandidateLabel(
                current.selectedCandidateIndex,
                current.candidates.length,
                selectedCandidate?.score,
              )}
            </output>
            <ChromeButton unit="inner-chevron-key"
              data-testid="predrawn-occlusion-next-candidate"
              className={chromeUnitClassNames(
                'inner-chevron-key',
                'le-seg-btn',
                'stepper-chevron-right',
              )}
              disabled={!current.candidates.length
                || current.selectedCandidateIndex >= current.candidates.length - 1
                || busy}
              aria-label="Next AI mask candidate"
              title="Show the next mask proposed for these same points."
              onClick={() => commitSnapshot(selectPredrawnOcclusionCandidate(
                historyRef.current.present,
                historyRef.current.present.selectedCandidateIndex + 1,
              ))}
            >Next</ChromeButton>
          </div>
          <div className="predrawn-occlusion-editor-candidate-actions">
            <ChromeButton unit="inner-text-button"
              data-testid="predrawn-occlusion-accept-candidate"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'active')}
              disabled={!selectedCandidate || busy}
              title="Add the amber candidate pixels to the accepted cyan mask, then begin another object."
              onClick={() => commitSnapshot(acceptPredrawnOcclusionCandidate(
                historyRef.current.present,
              ))}
            >Add candidate to mask</ChromeButton>
            <ChromeButton unit="inner-text-button"
              data-testid="predrawn-occlusion-discard-candidate"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              disabled={!current.prompts.length && !current.candidates.length || busy}
              title="Remove the current AI proposal and its points without changing accepted pixels."
              onClick={() => commitSnapshot(discardPredrawnOcclusionCandidate(
                historyRef.current.present,
              ))}
            >Discard candidate</ChromeButton>
          </div>
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-occlusion-submit"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'active')}
            disabled={Boolean(submitDisabledReason)
              || !onSubmit
              || !selectedPixelCount
              || current.candidates.length > 0
              || busy
              || Boolean(imageError)}
            title={submitDisabledReason
              ?? (!onSubmit
              ? 'No pipeline submit callback is connected.'
              : current.candidates.length
                ? 'Add or discard the current AI candidate first.'
                : !selectedPixelCount
                  ? 'Select or brush foreground pixels first.'
                  : `Return this exact ${imageWidth} × ${imageHeight} mask to the owning pipeline.`)}
            onClick={() => { void submit(); }}
          >{submitting ? 'Submitting mask…' : submitLabel}</ChromeButton>
        </div>
      </footer>
    </section>
  );
}
