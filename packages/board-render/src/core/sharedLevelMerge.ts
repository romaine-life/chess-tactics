import type { Level } from './level';
import { editorBoardToLevel, levelToEditorBoard } from './levelBoard';

const ABSENT = Symbol('absent');
type MergeValue = unknown | typeof ABSENT;

const isRecord = (value: MergeValue): value is Record<string, unknown> => (
  value !== ABSENT && value !== null && typeof value === 'object' && !Array.isArray(value)
);

function equalValue(left: MergeValue, right: MergeValue): boolean {
  if (left === right) return true;
  if (left === ABSENT || right === ABSENT) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((entry, index) => equalValue(entry, right[index]));
  }
  if (isRecord(left) || isRecord(right)) {
    if (!isRecord(left) || !isRecord(right)) return false;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.hasOwn(right, key) && equalValue(left[key], right[key]));
  }
  return false;
}
function cloneValue<T extends MergeValue>(value: T): T {
  if (value === ABSENT || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => cloneValue(entry)) as T;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]),
  ) as T;
}

function arrayEntryKey(value: unknown): string | null {
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0]) return `tuple:${value[0]}`;
  if (!isRecord(value)) return null;
  if ((typeof value.id === 'string' || typeof value.id === 'number') && String(value.id)) {
    return `id:${String(value.id)}`;
  }
  if (typeof value.x === 'number' && typeof value.y === 'number') {
    return `xy:${value.x},${value.y}`;
  }
  return null;
}

function keyedArray(values: unknown[]): Map<string, unknown> | null {
  const result = new Map<string, unknown>();
  for (const value of values) {
    const key = arrayEntryKey(value);
    if (!key || result.has(key)) return null;
    result.set(key, value);
  }
  return result;
}

function mergeArray(base: unknown[], local: unknown[], remote: unknown[]): unknown[] {
  const primitiveSet = [base, local, remote].every((values) => (
    values.every((value) => typeof value === 'string' || typeof value === 'number')
    && new Set(values).size === values.length
  ));
  if (primitiveSet) {
    const baseSet = new Set(base);
    const localSet = new Set(local);
    const locallyRemoved = new Set(base.filter((value) => !localSet.has(value)));
    const merged = remote.filter((value) => !locallyRemoved.has(value));
    for (const value of local) {
      if (!baseSet.has(value) && !merged.includes(value)) merged.push(cloneValue(value));
    }
    return merged;
  }

  const baseByKey = keyedArray(base);
  const localByKey = keyedArray(local);
  const remoteByKey = keyedArray(remote);
  if (baseByKey && localByKey && remoteByKey) {
    const order = [
      ...remote.map((entry) => arrayEntryKey(entry)!),
      ...local.map((entry) => arrayEntryKey(entry)!).filter((key) => !remoteByKey.has(key)),
    ];
    const merged: unknown[] = [];
    for (const key of order) {
      const value = mergeValue(
        baseByKey.has(key) ? baseByKey.get(key) : ABSENT,
        localByKey.has(key) ? localByKey.get(key) : ABSENT,
        remoteByKey.has(key) ? remoteByKey.get(key) : ABSENT,
      );
      if (value !== ABSENT) merged.push(value);
    }
    return merged;
  }

  if (base.length === local.length && base.length === remote.length) {
    return base.map((entry, index) => mergeValue(entry, local[index], remote[index]));
  }

  // The local snapshot arrived after the remote snapshot. For an ordered collection with no
  // stable member identity, preserve that server arrival order instead of inventing a splice.
  return cloneValue(local);
}

function mergeValue(base: MergeValue, local: MergeValue, remote: MergeValue): MergeValue {
  if (equalValue(local, remote)) return cloneValue(local);
  if (equalValue(local, base)) return cloneValue(remote);
  if (equalValue(remote, base)) return cloneValue(local);

  if (local === ABSENT || remote === ABSENT) return cloneValue(local);
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    return mergeArray(base, local, remote);
  }
  if (isRecord(base) && isRecord(local) && isRecord(remote)) {
    const merged: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(remote), ...Object.keys(local)]);
    for (const key of keys) {
      const value = mergeValue(
        Object.hasOwn(base, key) ? base[key] : ABSENT,
        Object.hasOwn(local, key) ? local[key] : ABSENT,
        Object.hasOwn(remote, key) ? remote[key] : ABSENT,
      );
      if (value !== ABSENT) merged[key] = value;
    }
    return merged;
  }

  // Both editors changed the same scalar. The local snapshot is the later server arrival.
  return cloneValue(local);
}

/**
 * Merge one stale Level Editor snapshot onto the latest shared cloud working copy.
 * Board state is merged through the lossless EditorBoard projection, then projected back into
 * both boardCode and gameplay layers so those two persistence channels cannot disagree.
 */
export function mergeSharedLevel(base: Level, local: Level, remote: Level): Level {
  const metadata = mergeValue(base, local, remote) as Level;
  const board = mergeValue(
    levelToEditorBoard(base),
    levelToEditorBoard(local),
    levelToEditorBoard(remote),
  ) as ReturnType<typeof levelToEditorBoard>;

  return editorBoardToLevel(board, {
    id: remote.id,
    name: metadata.name,
    notes: metadata.notes,
    objective: metadata.objective,
    placement: metadata.placement,
    roster: metadata.roster,
    surviveTurns: metadata.surviveTurns,
    timeControl: metadata.timeControl,
    victory: metadata.victory,
    events: metadata.events,
    battle: metadata.battle,
    difficulty: metadata.difficulty,
    economy: metadata.economy,
    theme: metadata.theme,
    previousTerrain: remote.layers.terrain,
  });
}
