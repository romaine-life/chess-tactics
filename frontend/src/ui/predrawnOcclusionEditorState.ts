export type PredrawnOcclusionPromptLabel = 'positive' | 'negative';

export interface PredrawnOcclusionPrompt {
  x: number;
  y: number;
  label: PredrawnOcclusionPromptLabel;
}

export interface PredrawnOcclusionCandidate {
  index: number;
  score: number;
  alpha: Uint8Array;
}

export interface PredrawnOcclusionModelProvenance {
  modelId: string;
  modelRevision: string;
  backend: 'webgpu' | 'wasm';
}

export interface PredrawnOcclusionSnapshot {
  width: number;
  height: number;
  acceptedAlpha: Uint8Array;
  prompts: readonly PredrawnOcclusionPrompt[];
  candidates: readonly PredrawnOcclusionCandidate[];
  selectedCandidateIndex: number;
  positivePromptCount: number;
  negativePromptCount: number;
  manualEditCount: number;
  activeModel?: PredrawnOcclusionModelProvenance;
  acceptedModel?: PredrawnOcclusionModelProvenance;
}

export interface PredrawnOcclusionHistory {
  past: readonly PredrawnOcclusionSnapshot[];
  present: PredrawnOcclusionSnapshot;
  future: readonly PredrawnOcclusionSnapshot[];
}

export interface PredrawnOcclusionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PredrawnOcclusionPoint {
  x: number;
  y: number;
}

export interface PredrawnOcclusionPan {
  x: number;
  y: number;
}

export const PREDRAWN_OCCLUSION_HISTORY_LIMIT = 24;
export const PREDRAWN_OCCLUSION_HISTORY_BYTES_LIMIT = 64 * 1024 * 1024;
export const PREDRAWN_OCCLUSION_MIN_ZOOM = 0.05;
export const PREDRAWN_OCCLUSION_MAX_ZOOM = 8;

export interface PredrawnOcclusionStrokeResult {
  alpha: Uint8Array;
  changed: boolean;
}

function assertNativeMaskDimensions(
  alpha: Uint8Array,
  width: number,
  height: number,
  label: string,
): void {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new Error('Occlusion artwork dimensions must be positive integers.');
  }
  if (alpha.length !== width * height) {
    throw new Error(
      `${label} contains ${alpha.length} pixels; expected ${width * height} for ${width} × ${height}.`,
    );
  }
}

export function createPredrawnOcclusionSnapshot(
  width: number,
  height: number,
  initialAlpha?: Uint8Array,
): PredrawnOcclusionSnapshot {
  const acceptedAlpha = initialAlpha
    ? new Uint8Array(initialAlpha)
    : new Uint8Array(width * height);
  assertNativeMaskDimensions(acceptedAlpha, width, height, 'Initial occlusion mask');
  return {
    width,
    height,
    acceptedAlpha,
    prompts: [],
    candidates: [],
    selectedCandidateIndex: 0,
    positivePromptCount: 0,
    negativePromptCount: 0,
    manualEditCount: 0,
  };
}

export function createPredrawnOcclusionHistory(
  width: number,
  height: number,
  initialAlpha?: Uint8Array,
): PredrawnOcclusionHistory {
  return {
    past: [],
    present: createPredrawnOcclusionSnapshot(width, height, initialAlpha),
    future: [],
  };
}

function promptsMatch(
  left: readonly PredrawnOcclusionPrompt[],
  right: readonly PredrawnOcclusionPrompt[],
): boolean {
  return left.length === right.length && left.every((point, index) => {
    const candidate = right[index];
    return candidate !== undefined
      && point.x === candidate.x
      && point.y === candidate.y
      && point.label === candidate.label;
  });
}

function bytesMatch(left: Uint8Array, right: Uint8Array): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function candidatesMatch(
  left: readonly PredrawnOcclusionCandidate[],
  right: readonly PredrawnOcclusionCandidate[],
): boolean {
  return left.length === right.length && left.every((candidate, index) => {
    const other = right[index];
    return other !== undefined
      && candidate.index === other.index
      && candidate.score === other.score
      && bytesMatch(candidate.alpha, other.alpha);
  });
}

export function predrawnOcclusionSnapshotsMatch(
  left: PredrawnOcclusionSnapshot,
  right: PredrawnOcclusionSnapshot,
): boolean {
  return left.width === right.width
    && left.height === right.height
    && left.selectedCandidateIndex === right.selectedCandidateIndex
    && left.positivePromptCount === right.positivePromptCount
    && left.negativePromptCount === right.negativePromptCount
    && left.manualEditCount === right.manualEditCount
    && left.activeModel?.modelId === right.activeModel?.modelId
    && left.activeModel?.modelRevision === right.activeModel?.modelRevision
    && left.activeModel?.backend === right.activeModel?.backend
    && left.acceptedModel?.modelId === right.acceptedModel?.modelId
    && left.acceptedModel?.modelRevision === right.acceptedModel?.modelRevision
    && left.acceptedModel?.backend === right.acceptedModel?.backend
    && bytesMatch(left.acceptedAlpha, right.acceptedAlpha)
    && promptsMatch(left.prompts, right.prompts)
    && candidatesMatch(left.candidates, right.candidates);
}

export function recordPredrawnOcclusionHistory(
  history: PredrawnOcclusionHistory,
  next: PredrawnOcclusionSnapshot,
): PredrawnOcclusionHistory {
  if (predrawnOcclusionSnapshotsMatch(history.present, next)) return history;
  return trimPredrawnOcclusionHistoryToBytes({
    past: [...history.past, history.present].slice(-PREDRAWN_OCCLUSION_HISTORY_LIMIT),
    present: next,
    future: [],
  });
}

/**
 * Replace the live snapshot while a pointer stroke is in progress. The caller
 * commits the finished stroke exactly once with commitPredrawnOcclusionGesture.
 */
export function previewPredrawnOcclusionGesture(
  opening: PredrawnOcclusionHistory,
  present: PredrawnOcclusionSnapshot,
): PredrawnOcclusionHistory {
  return {
    past: opening.past,
    present,
    future: opening.future,
  };
}

export function commitPredrawnOcclusionGesture(
  opening: PredrawnOcclusionHistory,
  present: PredrawnOcclusionSnapshot,
): PredrawnOcclusionHistory {
  const changed = !bytesMatch(
    opening.present.acceptedAlpha,
    present.acceptedAlpha,
  );
  return recordPredrawnOcclusionHistory(opening, changed
    ? {
        ...present,
        manualEditCount: opening.present.manualEditCount + 1,
      }
    : present);
}

export function stepPredrawnOcclusionHistory(
  history: PredrawnOcclusionHistory,
  direction: 'undo' | 'redo',
): PredrawnOcclusionHistory | undefined {
  if (direction === 'undo') {
    const target = history.past.at(-1);
    if (!target) return undefined;
    return trimPredrawnOcclusionHistoryToBytes({
      past: history.past.slice(0, -1),
      present: target,
      future: [...history.future, history.present].slice(-PREDRAWN_OCCLUSION_HISTORY_LIMIT),
    });
  }
  const target = history.future.at(-1);
  if (!target) return undefined;
  return trimPredrawnOcclusionHistoryToBytes({
    past: [...history.past, history.present].slice(-PREDRAWN_OCCLUSION_HISTORY_LIMIT),
    present: target,
    future: history.future.slice(0, -1),
  });
}

function retainedMaskByteLength(
  snapshots: readonly PredrawnOcclusionSnapshot[],
): number {
  const buffers = new Set<ArrayBufferLike>();
  let bytes = 0;
  for (const snapshot of snapshots) {
    for (const alpha of [
      snapshot.acceptedAlpha,
      ...snapshot.candidates.map((candidate) => candidate.alpha),
    ]) {
      if (buffers.has(alpha.buffer)) continue;
      buffers.add(alpha.buffer);
      bytes += alpha.buffer.byteLength;
    }
  }
  return bytes;
}

export function predrawnOcclusionHistoryRetainedBytes(
  history: PredrawnOcclusionHistory,
): number {
  return retainedMaskByteLength([
    ...history.past,
    history.present,
    ...history.future,
  ]);
}

/**
 * Keeps the nearest Undo and Redo states while evicting the farthest retained
 * masks. The current snapshot is authoritative and is never dropped, even when
 * one unusually large image exceeds the ordinary history budget by itself.
 */
export function trimPredrawnOcclusionHistoryToBytes(
  history: PredrawnOcclusionHistory,
  byteLimit = PREDRAWN_OCCLUSION_HISTORY_BYTES_LIMIT,
): PredrawnOcclusionHistory {
  const normalizedLimit = Math.max(0, byteLimit);
  let past = [...history.past].slice(-PREDRAWN_OCCLUSION_HISTORY_LIMIT);
  let future = [...history.future].slice(-PREDRAWN_OCCLUSION_HISTORY_LIMIT);
  while (
    (past.length || future.length)
    && retainedMaskByteLength([...past, history.present, ...future]) > normalizedLimit
  ) {
    if (past.length >= future.length && past.length) past = past.slice(1);
    else if (future.length) future = future.slice(1);
  }
  if (past === history.past && future === history.future) return history;
  return { past, present: history.present, future };
}

export function nativePredrawnOcclusionPoint(
  clientX: number,
  clientY: number,
  rect: PredrawnOcclusionRect,
  width: number,
  height: number,
): PredrawnOcclusionPoint | undefined {
  if (
    !Number.isFinite(clientX)
    || !Number.isFinite(clientY)
    || !Number.isFinite(rect.left)
    || !Number.isFinite(rect.top)
    || !Number.isFinite(rect.width)
    || !Number.isFinite(rect.height)
    || rect.width <= 0
    || rect.height <= 0
    || width < 1
    || height < 1
    || clientX < rect.left
    || clientY < rect.top
    || clientX > rect.left + rect.width
    || clientY > rect.top + rect.height
  ) {
    return undefined;
  }
  return {
    x: Math.min(width - 1, Math.max(0, ((clientX - rect.left) / rect.width) * width)),
    y: Math.min(height - 1, Math.max(0, ((clientY - rect.top) / rect.height) * height)),
  };
}

export function fitPredrawnOcclusionZoom(
  viewportWidth: number,
  viewportHeight: number,
  imageWidth: number,
  imageHeight: number,
  inset = 16,
): number {
  const availableWidth = Math.max(1, viewportWidth - inset * 2);
  const availableHeight = Math.max(1, viewportHeight - inset * 2);
  const fit = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
  return Math.min(
    PREDRAWN_OCCLUSION_MAX_ZOOM,
    Math.max(PREDRAWN_OCCLUSION_MIN_ZOOM, fit),
  );
}

export function clampPredrawnOcclusionPan(
  pan: PredrawnOcclusionPan,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
  imageWidth: number,
  imageHeight: number,
): PredrawnOcclusionPan {
  const maximumX = Math.max(0, (imageWidth * zoom - viewportWidth) / 2);
  const maximumY = Math.max(0, (imageHeight * zoom - viewportHeight) / 2);
  return {
    x: Math.min(maximumX, Math.max(-maximumX, pan.x)),
    y: Math.min(maximumY, Math.max(-maximumY, pan.y)),
  };
}

export function zoomPredrawnOcclusionAtPoint({
  zoom,
  nextZoom,
  pan,
  viewportWidth,
  viewportHeight,
  imageWidth,
  imageHeight,
  viewportX,
  viewportY,
}: {
  zoom: number;
  nextZoom: number;
  pan: PredrawnOcclusionPan;
  viewportWidth: number;
  viewportHeight: number;
  imageWidth: number;
  imageHeight: number;
  viewportX: number;
  viewportY: number;
}): { zoom: number; pan: PredrawnOcclusionPan } {
  const clampedZoom = Math.min(
    PREDRAWN_OCCLUSION_MAX_ZOOM,
    Math.max(PREDRAWN_OCCLUSION_MIN_ZOOM, nextZoom),
  );
  const imageX = imageWidth / 2
    + (viewportX - viewportWidth / 2 - pan.x) / zoom;
  const imageY = imageHeight / 2
    + (viewportY - viewportHeight / 2 - pan.y) / zoom;
  const nextPan = {
    x: viewportX - viewportWidth / 2 - (imageX - imageWidth / 2) * clampedZoom,
    y: viewportY - viewportHeight / 2 - (imageY - imageHeight / 2) * clampedZoom,
  };
  return {
    zoom: clampedZoom,
    pan: clampPredrawnOcclusionPan(
      nextPan,
      clampedZoom,
      viewportWidth,
      viewportHeight,
      imageWidth,
      imageHeight,
    ),
  };
}

function stampMask(
  alpha: Uint8Array,
  width: number,
  height: number,
  point: PredrawnOcclusionPoint,
  radius: number,
  value: number,
): boolean {
  const left = Math.max(0, Math.floor(point.x - radius));
  const right = Math.min(width - 1, Math.ceil(point.x + radius));
  const top = Math.max(0, Math.floor(point.y - radius));
  const bottom = Math.min(height - 1, Math.ceil(point.y + radius));
  const squaredRadius = radius * radius;
  let changed = false;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const dx = x + 0.5 - point.x;
      const dy = y + 0.5 - point.y;
      if (dx * dx + dy * dy > squaredRadius) continue;
      const index = y * width + x;
      if (alpha[index] === value) continue;
      alpha[index] = value;
      changed = true;
    }
  }
  return changed;
}

export function paintPredrawnOcclusionStroke(
  source: Uint8Array,
  width: number,
  height: number,
  from: PredrawnOcclusionPoint,
  to: PredrawnOcclusionPoint,
  radius: number,
  value: 0 | 255,
): Uint8Array {
  assertNativeMaskDimensions(source, width, height, 'Occlusion mask');
  const next = new Uint8Array(source);
  const result = mutatePredrawnOcclusionStroke(
    next,
    width,
    height,
    from,
    to,
    radius,
    value,
  );
  return result.changed ? next : source;
}

/**
 * Mutates one gesture-owned alpha buffer in place. Callers clone the accepted
 * mask once at pointer-down, invoke this for every sampled segment, then commit
 * that same buffer as one immutable snapshot at pointer-up.
 */
export function mutatePredrawnOcclusionStroke(
  alpha: Uint8Array,
  width: number,
  height: number,
  from: PredrawnOcclusionPoint,
  to: PredrawnOcclusionPoint,
  radius: number,
  value: 0 | 255,
): PredrawnOcclusionStrokeResult {
  assertNativeMaskDimensions(alpha, width, height, 'Occlusion mask');
  const normalizedRadius = Math.max(0.5, Math.min(Math.max(width, height), radius));
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(0.5, normalizedRadius * 0.5)));
  let changed = false;
  for (let step = 0; step <= steps; step += 1) {
    const amount = step / steps;
    changed = stampMask(alpha, width, height, {
      x: from.x + (to.x - from.x) * amount,
      y: from.y + (to.y - from.y) * amount,
    }, normalizedRadius, value) || changed;
  }
  return { alpha, changed };
}

export function selectPredrawnOcclusionCandidate(
  snapshot: PredrawnOcclusionSnapshot,
  selectedCandidateIndex: number,
): PredrawnOcclusionSnapshot {
  if (
    !Number.isInteger(selectedCandidateIndex)
    || selectedCandidateIndex < 0
    || selectedCandidateIndex >= snapshot.candidates.length
    || selectedCandidateIndex === snapshot.selectedCandidateIndex
  ) {
    return snapshot;
  }
  return { ...snapshot, selectedCandidateIndex };
}

export function acceptPredrawnOcclusionCandidate(
  snapshot: PredrawnOcclusionSnapshot,
): PredrawnOcclusionSnapshot {
  const candidate = snapshot.candidates[snapshot.selectedCandidateIndex];
  if (!candidate) return snapshot;
  assertNativeMaskDimensions(
    candidate.alpha,
    snapshot.width,
    snapshot.height,
    'Segmentation candidate',
  );
  const acceptedAlpha = new Uint8Array(snapshot.acceptedAlpha);
  let changed = false;
  for (let index = 0; index < acceptedAlpha.length; index += 1) {
    if (!candidate.alpha[index] || acceptedAlpha[index] === 255) continue;
    acceptedAlpha[index] = 255;
    changed = true;
  }
  if (!changed && !snapshot.prompts.length && !snapshot.candidates.length) return snapshot;
  const positivePromptCount = snapshot.positivePromptCount
    + snapshot.prompts.filter((point) => point.label === 'positive').length;
  const negativePromptCount = snapshot.negativePromptCount
    + snapshot.prompts.filter((point) => point.label === 'negative').length;
  return {
    ...snapshot,
    acceptedAlpha: changed ? acceptedAlpha : snapshot.acceptedAlpha,
    prompts: [],
    candidates: [],
    selectedCandidateIndex: 0,
    positivePromptCount,
    negativePromptCount,
    activeModel: undefined,
    acceptedModel: snapshot.activeModel ?? snapshot.acceptedModel,
  };
}

export function discardPredrawnOcclusionCandidate(
  snapshot: PredrawnOcclusionSnapshot,
): PredrawnOcclusionSnapshot {
  if (!snapshot.prompts.length && !snapshot.candidates.length) return snapshot;
  return {
    ...snapshot,
    prompts: [],
    candidates: [],
    selectedCandidateIndex: 0,
    activeModel: undefined,
  };
}

export function countPredrawnOcclusionPixels(alpha: Uint8Array): number {
  let count = 0;
  for (const value of alpha) {
    if (value) count += 1;
  }
  return count;
}
