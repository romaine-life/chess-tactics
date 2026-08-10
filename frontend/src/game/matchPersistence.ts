// Persist the in-progress skirmish so a page reload resumes the live board instead
// of silently discarding it and re-rolling a fresh game. The two ways a player
// reloads mid-battle — a manual browser refresh, and the "A new version is
// available" prompt (which is a plain window.location.reload; see net/appUpdate) —
// both tear down the in-memory store. That store is a module singleton: it survives
// route changes but NOT a reload. This is the disk copy that bridges the reload.
//
// Campaign PROGRESS (cleared levels) already persists separately (see
// campaign/progress); this is the mid-battle BOARD itself — the exact position,
// clock, and log needed to drop the player back where they were.
//
// What's stored is the durable slice of SkirmishState: everything needed to rebuild
// the position. `env` is re-derived from `game` on resume, and selection/focus are
// transient (reset to the first player piece), so none of those are stored.
// Serialization is plain JSON — core/types is serializable by construction.

import type { LogEntry, SkirmishState } from './store';
import { readElapsedClockMs } from '../core/clock';

const KEY = 'chess-tactics-active-match-v1';
const VERSION = 4;

// The fields that fully describe a resumable match. `env` (derived) and
// `selectedId`/`focusedId` (transient) are deliberately omitted — see module note.
export type PersistedMatch = Pick<
  SkirmishState,
  'game' | 'seed' | 'tick' | 'log' | 'objective' | 'objectiveCtx' | 'victoryOverride' | 'turnsElapsed' | 'levelId' | 'clock' | 'battleElapsed'
> &
  // Optional for snapshots written before these fields existed. resumeMatch defaults
  // a missing AI mode to search and a missing activity id to standalone play.
  Partial<Pick<SkirmishState, 'aiMode' | 'activityId' | 'undoStack'>> & {
    /** Wall-clock recency used only to order Play's resumable activities. */
    savedAt?: string;
  };

interface StoredEnvelope extends PersistedMatch {
  version: number;
}

// Mirrors net/appUpdate's storage() guard: localStorage can be absent (SSR/tests)
// or throw (privacy modes), and persistence is always best-effort — a failure to
// save must never break play.
function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Persistence is OFF for the Level Editor's "Test Play" (mode=test): that's
// ephemeral author iteration, and resuming a stale snapshot after an edit+reload
// would be a footgun. Real campaign play and free skirmishes persist. The screen
// sets this on mount, before it starts or resumes a game (see ui/Skirmish).
let enabled = true;
// The Battle and aftermath are sibling scenes, so their stores do not share component
// lifetime. Keep the just-won board in this module as the mandatory same-session handoff;
// localStorage remains the reload bridge, not the condition for rendering Back (ADR-0457).
let currentSessionRunVictory: PersistedMatch | null = null;

export function setMatchPersistenceEnabled(value: boolean): void {
  enabled = value;
}

function sliceOf(state: SkirmishState): PersistedMatch {
  return {
    game: state.game,
    seed: state.seed,
    tick: state.tick,
    log: state.log,
    objective: state.objective,
    objectiveCtx: state.objectiveCtx,
    victoryOverride: state.victoryOverride,
    turnsElapsed: state.turnsElapsed,
    levelId: state.levelId,
    activityId: state.activityId,
    clock: state.clock,
    // Persist only the exact bank. A reload or loading gap is not live Battle time,
    // so the device-local wall-clock anchor never crosses the storage boundary.
    battleElapsed: {
      elapsedMs: readElapsedClockMs(state.battleElapsed),
      startedAtMs: null,
    },
    aiMode: state.aiMode,
    undoStack: state.undoStack ?? [],
    savedAt: new Date().toISOString(),
  };
}

export function clearMatch(): void {
  currentSessionRunVictory = null;
  const store = storage();
  try { store?.removeItem(KEY); } catch { /* storage blocked — nothing to remove */ }
}

/**
 * Save the live match, or clear the saved copy when there's nothing worth
 * resuming. Called after every state transition that changes the board (see store:
 * newSkirmish / tryMoveTo / enemy reply / clock expiry), plus pagehide so a reload
 * banks live elapsed time even before the next move.
 *
 * Skips entirely when persistence is disabled (test play). A never-started
 * placeholder is left alone — it must NOT wipe a genuinely saved match that a fresh
 * page load is about to resume. A finished match is cleared unless its last player
 * decision still has a payable Undo, in which case reload must preserve that choice.
 */
export function persistMatch(state: SkirmishState): void {
  // A won Run Battle remains reviewable from its persisted aftermath report. Keep that
  // exact terminal position even though victory no longer offers Undo; standalone and
  // non-victory terminal matches still have no resumable work and are discarded.
  const reviewableRunVictory = state.game.winner === 'player'
    && typeof state.activityId === 'string'
    && state.activityId.startsWith('run:');
  // Capture the scene-to-scene handoff before the best-effort disk gate. A storage policy,
  // quota failure, or private-mode denial must not remove Back from the report reached from
  // this mounted board. Any later started non-victory match retires the stale handoff.
  if (state.started) currentSessionRunVictory = reviewableRunVictory ? sliceOf(state) : null;
  if (!enabled) return;
  if (!state.started || (state.game.winner !== null && !state.undoStack.length && !reviewableRunVictory)) {
    if (state.started) clearMatch(); // an irrevocably finished match has nothing to resume
    return;
  }
  const store = storage();
  if (!store) return;
  writeEnvelope(store, { version: VERSION, ...sliceOf(state) });
}

/**
 * Write the snapshot, shortening its Undo history rather than losing the board.
 *
 * The undo stack carries one whole position per move played (ADR-0556), so a long Battle is
 * the largest thing this module stores and the only part of it that grows without bound. When
 * the quota refuses the write, the old failure was silent and total: `setItem` threw, the
 * PREVIOUS snapshot stayed on disk, and a reload resumed a board several moves stale. So the
 * deepest half of the history is dropped and the write retried, repeatedly, until the board
 * itself fits. Losing the oldest undos is a shallower rewind; losing the write is the wrong
 * position. Recent moves are kept because they are the ones a player reaches for.
 */
function writeEnvelope(store: Storage, envelope: StoredEnvelope): void {
  let undoStack = envelope.undoStack ?? [];
  for (;;) {
    try {
      store.setItem(KEY, JSON.stringify({ ...envelope, undoStack }));
      return;
    } catch {
      if (undoStack.length === 0) return; // not the history — nothing left to trade away
      undoStack = undoStack.slice(Math.ceil(undoStack.length / 2));
    }
  }
}

// Minimal shape guard: enough to trust the blob can drive a board without throwing.
// A malformed or older-version copy resolves to null (and is cleared) so the caller
// falls back to a fresh game rather than crashing on a half-parsed state.
function hasResumableShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const game = v.game as Record<string, unknown> | undefined;
  if (!game || typeof game !== 'object') return false;
  return Array.isArray(game.pieces)
    && typeof game.size === 'object' && game.size !== null
    && Array.isArray(v.log);
}

/**
 * v3 turned each Event Log line into a `LogEntry` so a played move can carry its chess
 * notation and half-move index (see store's LogEntry). A v1/v2 snapshot holds bare
 * strings: they resume as prose rows, which is exactly what they were. Numbering picks
 * up from the first move played after the resume, since a plain string never recorded
 * which ply it was.
 */
function migrateLog(value: unknown): LogEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((line) => (typeof line === 'string' ? { text: line } : line as LogEntry));
}

function migrateEnvelope(value: unknown): StoredEnvelope | null {
  if (!hasResumableShape(value)) return null;
  let envelope = value as Record<string, unknown>;
  // v1 predates the battle stopwatch: it resumes with an empty bank.
  if (envelope.version === 1) {
    envelope = { ...envelope, version: 2, battleElapsed: { elapsedMs: 0, startedAtMs: null } };
  }
  // v2 wrote the Event Log — and the undo checkpoint's copy of it — as bare strings.
  if (envelope.version === 2) {
    const undo = envelope.undoCheckpoint as Record<string, unknown> | null | undefined;
    envelope = {
      ...envelope,
      version: 3,
      log: migrateLog(envelope.log),
      ...(undo ? { undoCheckpoint: { ...undo, log: migrateLog(undo.log) } } : {}),
    };
  }
  // v3 offered one level of Undo and stored the single checkpoint it could hold. A snapshot
  // written then resumes as a one-deep history: exactly the Undo it was already offering.
  if (envelope.version === 3) {
    const { undoCheckpoint, ...rest } = envelope;
    envelope = { ...rest, version: 4, undoStack: undoCheckpoint ? [undoCheckpoint] : [] };
  }
  if (envelope.version !== VERSION) return null;
  if (!Array.isArray(envelope.undoStack)) return null;
  const elapsed = envelope.battleElapsed as Record<string, unknown> | undefined;
  if (
    !elapsed
    || !Number.isFinite(elapsed.elapsedMs)
    || Number(elapsed.elapsedMs) < 0
    || elapsed.startedAtMs !== null
  ) return null;
  return envelope as unknown as StoredEnvelope;
}

/** Read a resumable match, or null when there's none, it's stale, or it's unreadable. */
export function loadMatch(): PersistedMatch | null {
  const store = storage();
  if (!store) return null;
  let raw: string | null;
  try { raw = store.getItem(KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const envelope = migrateEnvelope(parsed);
    if (!envelope) { clearMatch(); return null; }
    if ((parsed as { version?: unknown }).version !== VERSION) {
      writeEnvelope(store, envelope); // best-effort migration write
    }
    const { version: _version, ...match } = envelope;
    return match;
  } catch {
    clearMatch();
    return null;
  }
}

/** True only when a disk snapshot belongs to the activity being entered. A Level
 * may appear in multiple Runs, so matching the Level id alone can restore a wholly
 * different roster and an older visual scene. Missing ids remain compatible with
 * historical standalone/Campaign saves, whose requested activity id is null. */
export function persistedMatchMatchesActivity(
  match: PersistedMatch,
  levelId: string,
  activityId: string | null,
): boolean {
  const reviewableRunVictory = match.game.winner === 'player'
    && typeof match.activityId === 'string'
    && match.activityId.startsWith('run:');
  return (match.game.winner === null || Boolean(match.undoStack?.length) || reviewableRunVictory)
    && match.levelId === levelId
    && (match.activityId ?? null) === activityId;
}

/** The exact terminal player-win snapshot the matching aftermath may return to for review. */
export function isReviewableRunBattleMatch(
  match: PersistedMatch | null,
  levelId: string,
  activityId: string,
): boolean {
  return match?.game.winner === 'player'
    && persistedMatchMatchesActivity(match, levelId, activityId);
}

/** Resolve Back's exact won board. The current scene handoff wins; disk is only the
 * reload fallback. Neither path may substitute a different Run, Battle, or Level. */
export function loadReviewableRunBattleMatch(
  levelId: string,
  activityId: string,
): PersistedMatch | null {
  if (isReviewableRunBattleMatch(currentSessionRunVictory, levelId, activityId)) {
    return currentSessionRunVictory;
  }
  const stored = loadMatch();
  return isReviewableRunBattleMatch(stored, levelId, activityId) ? stored : null;
}
