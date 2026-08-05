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

import type { SkirmishState } from './store';

const KEY = 'chess-tactics-active-match-v1';
const VERSION = 1;

// The fields that fully describe a resumable match. `env` (derived) and
// `selectedId`/`focusedId` (transient) are deliberately omitted — see module note.
export type PersistedMatch = Pick<
  SkirmishState,
  'game' | 'seed' | 'tick' | 'log' | 'objective' | 'objectiveCtx' | 'victoryOverride' | 'turnsElapsed' | 'levelId' | 'clock'
> &
  // Optional for snapshots written before these fields existed. resumeMatch defaults
  // a missing AI mode to search and a missing activity id to standalone play.
  Partial<Pick<SkirmishState, 'aiMode' | 'activityId' | 'undoCheckpoint'>> & {
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
// localStorage remains the reload bridge, not the condition for rendering Back (ADR-0440).
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
    aiMode: state.aiMode,
    undoCheckpoint: state.undoCheckpoint ?? null,
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
 * newSkirmish / tryMoveTo / enemy reply / clock expiry), so the disk copy is never
 * more than one move stale.
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
  if (!state.started || (state.game.winner !== null && !state.undoCheckpoint && !reviewableRunVictory)) {
    if (state.started) clearMatch(); // an irrevocably finished match has nothing to resume
    return;
  }
  const store = storage();
  if (!store) return;
  const envelope: StoredEnvelope = { version: VERSION, ...sliceOf(state) };
  try { store.setItem(KEY, JSON.stringify(envelope)); } catch { /* quota/blocked — best-effort */ }
}

// Minimal shape guard: enough to trust the blob can drive a board without throwing.
// A malformed or older-version copy resolves to null (and is cleared) so the caller
// falls back to a fresh game rather than crashing on a half-parsed state.
function isResumable(value: unknown): value is StoredEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.version !== VERSION) return false;
  const game = v.game as Record<string, unknown> | undefined;
  if (!game || typeof game !== 'object') return false;
  return Array.isArray(game.pieces)
    && typeof game.size === 'object' && game.size !== null
    && Array.isArray(v.log);
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
    if (!isResumable(parsed)) { clearMatch(); return null; }
    const { version: _version, ...match } = parsed;
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
  return (match.game.winner === null || Boolean(match.undoCheckpoint) || reviewableRunVictory)
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
