import { useCallback, useEffect, useRef, useState } from 'react';
import { loadingError, loadingMark, loadingMeasure } from '../diagnostics/loadingTimeline';

let pending = false;
let token = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setPending(next: boolean): void {
  if (pending === next) return;
  pending = next;
  emit();
}

export function subscribeBoardArt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isBoardArtPending(): boolean {
  return pending;
}

function armBoardArt(): number {
  token += 1;
  setPending(true);
  return token;
}

function releaseBoardArt(current: number): void {
  if (current === token) setPending(false);
}

/** Navigation covers the destination before it mounts; the destination compositor owns release. */
export function armBoardArtForNav(): void {
  armBoardArt();
}

export type BoardFrameLayer = 'terrain' | 'barriers' | 'scene';
const REQUIRED_LAYERS: readonly BoardFrameLayer[] = ['terrain', 'barriers', 'scene'];

export interface BoardFrameReveal {
  ready: boolean;
  error: Error | null;
  retryKey: number;
  paintedLayers: readonly BoardFrameLayer[];
  acknowledge: (layer: BoardFrameLayer) => void;
  fail: (error: unknown) => void;
  retry: () => void;
}

/**
 * Coordinates the canvases that actually form the board. The board is ready only after every
 * required compositor has drawn and two animation frames have elapsed, putting the release on
 * the browser's presented-frame side of React commit and canvas draw. There is deliberately no
 * timeout that can rename a partial frame as ready.
 */
export function useBoardFrameReveal(signature: string): BoardFrameReveal {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [paintedLayers, setPaintedLayers] = useState<readonly BoardFrameLayer[]>([]);
  const layersRef = useRef(new Set<BoardFrameLayer>());
  const tokenRef = useRef(0);
  const startedAtRef = useRef(0);
  const generationRef = useRef('');

  const generation = `${signature}:${retryKey}`;
  if (generationRef.current !== generation) {
    generationRef.current = generation;
    layersRef.current = new Set();
  }

  useEffect(() => {
    setReady(false);
    setError(null);
    setPaintedLayers([]);
    startedAtRef.current = performance.now();
    tokenRef.current = armBoardArt();
    loadingMark('board', 'compositor-wait-start', { signatureLength: signature.length, retryKey });
  }, [retryKey, signature]);

  const acknowledge = useCallback((layer: BoardFrameLayer) => {
    if (error || ready) return;
    layersRef.current.add(layer);
    setPaintedLayers([...layersRef.current]);
    loadingMark('board', 'compositor-layer-painted', { layer });
    if (!REQUIRED_LAYERS.every((required) => layersRef.current.has(required))) return;
    const current = tokenRef.current;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setReady(true);
      releaseBoardArt(current);
      loadingMeasure('board', 'complete-compositor-frame', startedAtRef.current, { retryKey });
    }));
  }, [error, ready, retryKey]);

  const fail = useCallback((reason: unknown) => {
    const next = reason instanceof Error ? reason : new Error(String(reason));
    setError(next);
    setReady(false);
    releaseBoardArt(tokenRef.current);
    loadingError('board', 'critical-compositor-failed', next);
  }, []);

  const retry = useCallback(() => setRetryKey((value) => value + 1), []);

  useEffect(() => () => releaseBoardArt(tokenRef.current), []);

  return { ready, error, retryKey, paintedLayers, acknowledge, fail, retry };
}
