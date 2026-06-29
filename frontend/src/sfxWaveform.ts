// Offline-render a terrain SFX recipe to a normalized peak array, for the catalog's
// waveform preview. The recipe is the SAME function the live game plays (sfx.ts
// RECIPES); here it runs in an OfflineAudioContext (no speakers) and we bin the
// rendered buffer into peaks. So the picture on a sound-effect card IS that sound's
// real envelope — generated, never an authored image. Results are memoized per
// terrain (the recipes are deterministic enough that one render stands in for the
// card art) so re-mounts and the Viewer are instant and screenshot-stable.

import type { TerrainType } from './core/types';
import { RECIPES } from './sfx';

const RENDER_SECONDS = 0.34; // covers the longest recipe tail (~0.22s) with headroom
const SAMPLE_RATE = 22050; // half-rate is plenty for an amplitude envelope; fast to render

const cache = new Map<TerrainType, number[]>();
const inflight = new Map<TerrainType, Promise<number[]>>();

type OfflineCtor = typeof OfflineAudioContext;

function offlineCtor(): OfflineCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  // Keep the globalThis half of the window type (it carries OfflineAudioContext)
  // while adding the prefixed Safari fallback the lib types omit.
  const w = window as typeof window & { webkitOfflineAudioContext?: OfflineCtor };
  return w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
}

/** Bin |samples| into `bins` peak buckets, normalized so the loudest bin == 1. */
function binPeaks(data: Float32Array, bins: number): number[] {
  const size = Math.max(1, Math.floor(data.length / bins));
  const peaks: number[] = [];
  let max = 0;
  for (let b = 0; b < bins; b += 1) {
    let peak = 0;
    const start = b * size;
    const end = Math.min(data.length, start + size);
    for (let i = start; i < end; i += 1) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
    }
    peaks.push(peak);
    if (peak > max) max = peak;
  }
  if (max <= 0) return peaks;
  return peaks.map((p) => p / max);
}

/** The cached waveform for a terrain, or null if it hasn't been rendered yet. */
export function sfxWaveformCached(terrain: TerrainType, bins = 56): number[] | null {
  const peaks = cache.get(terrain);
  return peaks && peaks.length === bins ? peaks : null;
}

/**
 * Render (or return the cached) normalized peak array for a terrain's SFX recipe.
 * Resolves to [] when Web Audio offline rendering is unavailable (SSR / older
 * browsers) — callers should fall back to a flat placeholder.
 */
export async function sfxWaveform(terrain: TerrainType, bins = 56): Promise<number[]> {
  const cached = sfxWaveformCached(terrain, bins);
  if (cached) return cached;
  const pending = inflight.get(terrain);
  if (pending) return pending;

  const Ctor = offlineCtor();
  const recipe = RECIPES[terrain];
  if (!Ctor || !recipe) return [];

  const job = (async () => {
    try {
      const length = Math.ceil(SAMPLE_RATE * RENDER_SECONDS);
      const octx = new Ctor(1, length, SAMPLE_RATE);
      // The recipe builds its graph onto the destination and schedules from t=0.
      recipe(octx, octx.destination, 0);
      const buffer = await octx.startRendering();
      const peaks = binPeaks(buffer.getChannelData(0), bins);
      cache.set(terrain, peaks);
      return peaks;
    } catch {
      return [];
    } finally {
      inflight.delete(terrain);
    }
  })();
  inflight.set(terrain, job);
  return job;
}
