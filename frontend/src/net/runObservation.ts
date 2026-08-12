// Observation is demand-driven: opening one of these streams is what starts it, and closing it
// is what stops it. Nothing is published because a Run exists.

export interface RunObservationFrame {
  type: 'run' | 'gone' | 'unavailable';
  run?: unknown;
  revision?: number;
}

/** Watch one player's Run. Admin-only server side; the returned function ends the observation. */
export function observeRun(
  ownerEmail: string,
  onFrame: (frame: RunObservationFrame) => void,
): () => void {
  const source = new EventSource(`/api/admin/runs/${encodeURIComponent(ownerEmail)}/observe`);
  source.onmessage = (event) => {
    // One bad frame must not tear down the stream — EventSource keeps the socket, so the next
    // acknowledged mutation recovers the view on its own.
    try { onFrame(JSON.parse(event.data) as RunObservationFrame); } catch { /* ignore */ }
  };
  return () => source.close();
}

/** The player's own stream: how many people are watching me right now. */
export function subscribeWatcherCount(onCount: (count: number) => void): () => void {
  const source = new EventSource('/api/active-run/watchers');
  source.onmessage = (event) => {
    try {
      const frame = JSON.parse(event.data) as { type?: string; count?: number };
      if (frame.type === 'observers' && Number.isInteger(frame.count)) onCount(frame.count as number);
    } catch { /* ignore */ }
  };
  return () => source.close();
}
