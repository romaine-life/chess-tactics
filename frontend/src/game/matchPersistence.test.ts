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
    log: [{ text: 'Skirmish begins.' }],
    clock: null,
    undoStack: [],
    battleElapsed: { elapsedMs: 4_000, startedAtMs: null },
    game: {
      size: { cols: 8, rows: 8 },
      pieces: [{ id: 'p1', side: 'player', type: 'pawn', x: 0, y: 6, alive: true, startY: 6 }],
      turn,
      winner,
    },
  } as unknown as SkirmishState;
}

/** One Undo checkpoint over a given state, priced at `goldTenths`. */
function undoCheckpoint(state: SkirmishState, goldTenths: number): SkirmishState['undoStack'][number] {
  return {
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
      goldTenths,
      army: [],
      cards: [],
      battleRuntime: {
        battleIndex: 0,
        initiallyDeployedUnitIds: [],
        reserveUnitIds: [],
        reservistPoolUnitIds: [],
        deployedReservistUnitIds: [],
        observedDeadUnitIds: [],
        reinforcementSequence: 0,
      },
    },
  };
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
      undoStack: [],
      positions: [],
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
    state.undoStack = [undoCheckpoint(state, 20)];

    persistMatch(state);
    const loaded = loadMatch();
    expect(loaded?.game.winner).toBe('enemy');
    expect(loaded?.undoStack?.at(-1)?.run.goldTenths).toBe(20);
    expect(persistedMatchMatchesActivity(loaded!, 'lvl-1', 'run:first:battle:0')).toBe(true);
  });

  it('round-trips a whole Battle of Undo history in order', () => {
    const state = fakeState();
    state.undoStack = [10, 20, 30].map((gold) => undoCheckpoint(state, gold));

    persistMatch(state);
    expect(loadMatch()?.undoStack?.map((entry) => entry.run.goldTenths)).toEqual([10, 20, 30]);
  });

  it('sheds the oldest Undo history rather than failing the whole write on a full quota', () => {
    // A real quota rejection leaves the PREVIOUS snapshot on disk, so a write that simply
    // gives up resumes a board several moves stale. The position must land; the depth of
    // the rewind is what may be traded away for it.
    const state = fakeState();
    state.undoStack = [1, 2, 3, 4, 5, 6, 7, 8].map((gold) => undoCheckpoint(state, gold * 10));
    const real = store.setItem.bind(store);
    let limit = 3;
    store.setItem = (key: string, value: string) => {
      const entries = (JSON.parse(value) as { undoStack?: unknown[] }).undoStack ?? [];
      if (entries.length > limit) throw new Error('QuotaExceededError');
      real(key, value);
    };

    persistMatch(state);
    // Halving from 8 lands on 4, still over the limit, then 2 — the two most recent moves.
    expect(loadMatch()?.undoStack?.map((entry) => entry.run.goldTenths)).toEqual([70, 80]);

    // A board that cannot fit even with no history at all leaves the write undone, exactly
    // as before: there is nothing left to trade.
    limit = -1;
    clearMatch();
    persistMatch(state);
    expect(loadMatch()).toBeNull();
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

  it('migrates a version-1 match to a banked elapsed clock and writes it forward', () => {
    persistMatch(fakeState());
    const old = JSON.parse(store.getItem(KEY)!) as Record<string, unknown>;
    old.version = 1;
    delete old.battleElapsed;
    store.setItem(KEY, JSON.stringify(old));

    expect(loadMatch()?.battleElapsed).toEqual({ elapsedMs: 0, startedAtMs: null });
    expect(JSON.parse(store.getItem(KEY)!).version).toBe(4);
    expect(JSON.parse(store.getItem(KEY)!).battleElapsed).toEqual({ elapsedMs: 0, startedAtMs: null });
  });

  it('resumes a version-2 match by reading its bare-string Event Log as prose rows', () => {
    persistMatch(fakeState());
    const old = JSON.parse(store.getItem(KEY)!) as Record<string, unknown>;
    old.version = 2;
    old.log = ['Check!', 'Skirmish begins.'];
    old.undoCheckpoint = { log: ['Skirmish begins.'] };
    store.setItem(KEY, JSON.stringify(old));

    const resumed = loadMatch();
    // A string carried no notation and no ply, so it resumes as exactly what it was:
    // a prose row. Numbering restarts at the first move played after the resume.
    expect(resumed?.log).toEqual([{ text: 'Check!' }, { text: 'Skirmish begins.' }]);
    expect(resumed?.undoStack?.[0]?.log).toEqual([{ text: 'Skirmish begins.' }]);
    expect(JSON.parse(store.getItem(KEY)!).version).toBe(4);
  });

  it('resumes a version-3 match with its one Undo as a one-deep history', () => {
    const state = fakeState();
    state.undoStack = [undoCheckpoint(state, 20)];
    persistMatch(state);
    const old = JSON.parse(store.getItem(KEY)!) as Record<string, unknown>;
    const [only] = old.undoStack as unknown[];
    store.setItem(KEY, JSON.stringify({ ...old, version: 3, undoStack: undefined, undoCheckpoint: only }));

    // v3 could hold exactly one checkpoint and offered exactly one Undo. That is what a
    // snapshot written then still means, so it resumes as a history one move deep.
    expect(loadMatch()?.undoStack?.map((entry) => entry.run.goldTenths)).toEqual([20]);
    expect(JSON.parse(store.getItem(KEY)!).version).toBe(4);
    expect(JSON.parse(store.getItem(KEY)!)).not.toHaveProperty('undoCheckpoint');
  });

  it('resumes a version-3 match that never had an Undo with an empty history', () => {
    persistMatch(fakeState());
    const old = JSON.parse(store.getItem(KEY)!) as Record<string, unknown>;
    store.setItem(KEY, JSON.stringify({ ...old, version: 3, undoStack: undefined, undoCheckpoint: null }));

    expect(loadMatch()?.undoStack).toEqual([]);
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
