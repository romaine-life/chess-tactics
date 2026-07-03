import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMatch, loadMatch, persistMatch, setMatchPersistenceEnabled } from './matchPersistence';
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
  turn?: SkirmishState['game']['turn'];
} = {}): SkirmishState {
  const { started = true, winner = null, levelId = 'lvl-1', turn = 'player' } = overrides;
  return {
    started,
    levelId,
    seed: 42,
    tick: 3,
    turnsElapsed: 1,
    objective: 'capture-king',
    objectiveCtx: { kingSide: 'enemy' },
    log: ['Skirmish begins.'],
    clock: null,
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
      clock: state.clock,
    });
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

  it('drops the saved copy once the game is decided', () => {
    persistMatch(fakeState());
    expect(loadMatch()).not.toBeNull();
    persistMatch(fakeState({ winner: 'player' }));
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
});
