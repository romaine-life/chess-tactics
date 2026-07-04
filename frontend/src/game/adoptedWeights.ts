// Per-level ADOPTED eval weights — the bridge from the Training Gym to the LIVE
// played enemy AI. When the gym validates a champion against the shipped weights
// with SPRT and the owner adopts the result, the winning weight VECTOR is stored
// here keyed by level id, and the live opponent (game/store: scheduleEnemyReply)
// reads it synchronously before every enemy reply — using the adopted weights for
// that level instead of DEFAULT_EVAL_WEIGHTS.
//
// Two homes, one truth (mirrors campaign progress: backend account row + a local
// cache): the account-scoped opening-books blob keeps the durable, cross-device
// copy (BooksBlob.adoptedWeights, persisted through net/openingBooks), and THIS
// localStorage map is the synchronous cache the live AI can read without awaiting a
// backend round-trip. The Gym writes both on adopt; the store reads only this one.
//
// Best-effort like every other localStorage store in the app: absent/blocked
// storage (SSR, tests, privacy modes) degrades to "no adoption" and the live AI
// falls back to the shipped weights — never a throw on the play path.

import { decodeWeights } from './tuning';
import { DEFAULT_EVAL_WEIGHTS, type EvalWeights } from '../core/ai';

const KEY = 'chess-tactics-adopted-weights-v1';

/** level id -> the adopted flat weight vector (encodeWeights order). */
type AdoptedMap = Record<string, number[]>;

// Mirrors matchPersistence's storage() guard: localStorage can be absent or throw.
function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readMap(): AdoptedMap {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === 'object' ? (parsed as AdoptedMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: AdoptedMap): void {
  const store = storage();
  if (!store) return;
  try { store.setItem(KEY, JSON.stringify(map)); } catch { /* quota/blocked — best-effort */ }
}

/** Record (or clear, when `vec` is null) the adopted weight vector for a level, and
 * notify open screens. The live AI's next enemy reply reads the new value. */
export function setAdoptedWeights(levelId: string, vec: readonly number[] | null): void {
  const map = readMap();
  if (vec === null) delete map[levelId];
  else map[levelId] = [...vec];
  writeMap(map);
}

/** The raw adopted vector for a level, or null if none is adopted / storage is off. */
export function readAdoptedVector(levelId: string): number[] | null {
  const vec = readMap()[levelId];
  return Array.isArray(vec) ? vec : null;
}

/** The EvalWeights the live AI should use for a level: the adopted champion if one
 * has been adopted, else the shipped DEFAULT_EVAL_WEIGHTS. Null levelId (free
 * skirmish) always uses the shipped weights. Never throws. */
export function adoptedWeightsFor(levelId: string | null): EvalWeights {
  if (!levelId) return DEFAULT_EVAL_WEIGHTS;
  const vec = readAdoptedVector(levelId);
  if (!vec) return DEFAULT_EVAL_WEIGHTS;
  try {
    return decodeWeights(vec);
  } catch {
    return DEFAULT_EVAL_WEIGHTS;
  }
}
