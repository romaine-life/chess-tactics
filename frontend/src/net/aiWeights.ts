// Client for the GLOBAL shipped per-level AI weights (ship-to-everyone tier).
// - loadShippedAiWeights: fetch the whole map once at startup and seed the live AI's
//   synchronous resolver cache (game/adoptedWeights.setShippedAiWeights). Best-effort:
//   any failure leaves the cache empty and the live AI falls back to DEFAULT weights.
// - shipAiWeights: admin-only PUT that publishes (or clears) one level's weights.

import { setShippedAiWeights } from '../game/adoptedWeights';

export async function loadShippedAiWeights(): Promise<void> {
  try {
    const res = await fetch('/api/ai-weights', { credentials: 'include' });
    if (!res.ok) return;
    const data = (await res.json()) as { weights?: Record<string, number[]> };
    setShippedAiWeights(data.weights ?? {});
  } catch {
    /* best-effort: no shipped weights ⇒ live AI uses DEFAULT / personal adopted */
  }
}

/** Admin-only: ship `vec` for a level to every player (or clear it with `null`). */
export async function shipAiWeights(levelId: string, vec: number[] | null): Promise<void> {
  const res = await fetch(`/api/ai-weights/${encodeURIComponent(levelId)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ weights: vec }),
  });
  if (!res.ok) throw new Error(`ship failed (${res.status})`);
}
