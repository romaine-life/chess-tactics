import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearMatch,
  isReviewableRunBattleMatch,
  loadMatch,
  loadReviewableRunBattleMatch,
  persistedMatchMatchesActivity,
  persistMatch,
  setMatchPersistenceEnabled,
} from './matchPersistence';
import type { SkirmishState } from './store';

const KEY = 'chess-tactics-active-match-v1';

// Tests run in the node env (no DOM). matchPersistence reads window.localStorage, so
// stub a memory Storage on window — the same pattern net/appUpdate.test.ts uses for
// sessionStorage. Importing the store (and its sfx chain) is deliberately avoided:
// these are pure round-trip/validation tests.
const memoryStorage = (): Storage => {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, String(value)); },
  };
};

// A SkirmishState with just the fields persistMatch/sliceOf touch. Cast through
// unknown so the test needn't build the whole store contract.
function fakeState(overrides: {
  started?: boolean;
  winner?: SkirmishState['game']['winner'];
  levelId?: string | null;
  activityId?: string | null;
  turn?: SkirmishState['game']['turn'];
} = {}): SkirmishState {
  const { started = true, winner = null, levelId = 'lvl-1', activityId = null, turn = 'player' } = overrides;
  return {
    started,
    levelId,
    activityId,
    seed: 42,
    tick: 3,
    turnsElapsed: 1,
    objective: 'capture-king',
    objectiveCtx: { kingSide: 'enemy' },
    log: ['Skirmish begins.'],
    clock: null,
    battleElapsed: { elapsedMs: 4_000, startedAtMs: null },
    game: {
      size: { cols: 8, rows: 8 },
      pieces: [{ id: 'p1', side: 'player', type: 'pawn', x: 0, y: 6, alive: true, startY: 6 }],
      turn,
      winner,
    },
  } as unknown as SkirmishState;
}

let store: Storage;
beforeEach(() => {
  store = memoryStorage();
  vi.stubGlobal('window', { localStorage: store });
  setMatchPersistenceEnabled(true);
  clearMatch();
});
afterEach(() => {
  vi.unstubAllGlobals();
  setMatchPersistenceEnabled(true);
});

describe('match persistence', () => {
  it('round-trips the durable slice (env/selection deliberately excluded)', () => {
    const state = fakeState();
    persistMatch(state);
    const loaded = loadMatch();
    expect(loaded).toEqual({
      game: state.game,
      seed: state.seed,
      tick: state.tick,
      log: state.log,
      objective: state.objective,
      objectiveCtx: state.objectiveCtx,
      turnsElapsed: state.turnsElapsed,
      levelId: state.levelId,
      activityId: state.activityId,
      clock: state.clock,
      battleElapsed: state.battleElapsed,
      undoCheckpoint: null,
      savedAt: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(loaded?.savedAt ?? ''))).toBe(false);
    expect(loaded).not.toHaveProperty('version');
    expect(loaded).not.toHaveProperty('env');
  });

  it('returns null when nothing is saved', () => {
    expect(loadMatch()).toBeNull();
  });

  it('saves nothing while persistence is disabled (Test Play)', () => {
    setMatchPersistenceEnabled(false);
    persistMatch(fakeState());
    expect(loadMatch()).toBeNull();
  });

  it('drops a standalone saved copy once the game is decided', () => {
    persistMatch(fakeState());
    expect(loadMatch()).not.toBeNull();
    persistMatch(fakeState({ winner: 'player' }));
    expect(loadMatch()).toBeNull();
  });

  it('keeps an exact won Run Battle for aftermath board review without reviving other results', () => {
    const won = fakeState({ winner: 'player', activityId: 'run:first:battle:0', turn: 'done' });
    persistMatch(won);
    const loaded = loadMatch();

    expect(loaded?.game.winner).toBe('player');
    expect(isReviewableRunBattleMatch(loaded, 'lvl-1', 'run:first:battle:0')).toBe(true);
    expect(isReviewableRunBattleMatch(loaded, 'lvl-1', 'run:second:battle:0')).toBe(false);

    persistMatch(fakeState({ winner: 'enemy', activityId: 'run:first:battle:0', turn: 'done' }));
    expect(loadMatch()).toBeNull();
  });

  it('hands the won board to aftermath in-session even when durable match storage is unavailable', () => {
    const won = fakeState({ winner: 'player', activityId: 'run:first:battle:0', turn: 'done' });
    setMatchPersistenceEnabled(false);

    persistMatch(won);

    expect(loadMatch()).toBeNull();
    expect(loadReviewableRunBattleMatch('lvl-1', 'run:first:battle:0')?.game.winner).toBe('player');
    expect(loadReviewableRunBattleMatch('lvl-1', 'run:other:battle:0')).toBeNull();
  });

  it('keeps a terminal Run Battle resumable while its paid Undo checkpoint exists', () => {
    const state = fakeState({ winner: 'enemy', activityId: 'run:first:battle:0', turn: 'done' });
    state.undoCheckpoint = {
      game: { ...state.game, winner: null, turn: 'player' },
      tick: state.tick,
      log: [...state.log],
      resultDetail: null,
      turnsElapsed: state.turnsElapsed,
      selectedId: 'p1',
      focusedId: 'p1',
      clock: null,
      run: {
        runId: 'first',
        battleIndex: 0,
        goldTenths: 20,
        army: [],
        cards: [],
        battleRuntime: {
          battleIndex: 0,
          initiallyDeployedUnitIds: [],
          reserveUnitIds: [],
          reservistPoolUnitIds: [],
          deployedReservistUnitIds: [],
          observedDeadUnitIds: [],
          cashedOutUnitIds: [],
          reinforcementSequence: 0,
        },
      },
    };

    persistMatch(state);
    const loaded = loadMatch();
    expect(loaded?.game.winner).toBe('enemy');
    expect(loaded?.undoCheckpoint?.run.goldTenths).toBe(20);
    expect(persistedMatchMatchesActivity(loaded!, 'lvl-1', 'run:first:battle:0')).toBe(true);
  });

  it('leaves an existing save intact for the module-load placeholder (not started)', () => {
    // The real match is saved; a subsequent placeholder tick (started:false, e.g. a
    // fresh page before resume decides) must NOT wipe the match we mean to resume.
    persistMatch(fakeState());
    persistMatch(fakeState({ started: false }));
    expect(loadMatch()).not.toBeNull();
  });

  it('discards and clears a copy from an incompatible version', () => {
    store.setItem(KEY, JSON.stringify({ version: 99, game: { pieces: [], size: {} }, log: [] }));
    expect(loadMatch()).toBeNull();
    expect(store.getItem(KEY)).toBeNull(); // stale copy removed
  });

  it('migrates a version-1 match to a banked elapsed clock and writes only version 2', () => {
    persistMatch(fakeState());
    const old = JSON.parse(store.getItem(KEY)!) as Record<string, unknown>;
    old.version = 1;
    delete old.battleElapsed;
    store.setItem(KEY, JSON.stringify(old));

    expect(loadMatch()?.battleElapsed).toEqual({ elapsedMs: 0, startedAtMs: null });
    expect(JSON.parse(store.getItem(KEY)!).version).toBe(2);
    expect(JSON.parse(store.getItem(KEY)!).battleElapsed).toEqual({ elapsedMs: 0, startedAtMs: null });
  });

  it('banks a running elapsed anchor when it persists', () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const state = fakeState();
    state.battleElapsed = { elapsedMs: 2_000, startedAtMs: 7_000 };
    persistMatch(state);
    expect(loadMatch()?.battleElapsed).toEqual({ elapsedMs: 5_000, startedAtMs: null });
    vi.restoreAllMocks();
  });

  it('discards and clears an unparseable copy', () => {
    store.setItem(KEY, '{ not valid json');
    expect(loadMatch()).toBeNull();
    expect(store.getItem(KEY)).toBeNull();
  });

  it('discards a structurally invalid copy (missing pieces)', () => {
    store.setItem(KEY, JSON.stringify({ version: 1, game: { size: { cols: 8, rows: 8 } }, log: [] }));
    expect(loadMatch()).toBeNull();
  });

  it('clearMatch removes a saved match', () => {
    persistMatch(fakeState());
    clearMatch();
    expect(loadMatch()).toBeNull();
  });

  it('never resumes another Run Battle that happens to use the same Level', () => {
    persistMatch(fakeState({ activityId: 'run:first:battle:0' }));
    const loaded = loadMatch();
    expect(loaded).not.toBeNull();
    expect(persistedMatchMatchesActivity(loaded!, 'lvl-1', 'run:first:battle:0')).toBe(true);
    expect(persistedMatchMatchesActivity(loaded!, 'lvl-1', 'run:second:battle:0')).toBe(false);
  });

  it('keeps pre-identity standalone saves compatible but does not adopt them into a Run', () => {
    const legacy = fakeState();
    persistMatch(legacy);
    const stored = JSON.parse(store.getItem(KEY)!) as Record<string, unknown>;
    delete stored.activityId;
    store.setItem(KEY, JSON.stringify(stored));

    const loaded = loadMatch();
    expect(loaded).not.toBeNull();
    expect(persistedMatchMatchesActivity(loaded!, 'lvl-1', null)).toBe(true);
    expect(persistedMatchMatchesActivity(loaded!, 'lvl-1', 'run:first:battle:0')).toBe(false);
  });
});
