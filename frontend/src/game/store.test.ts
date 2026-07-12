import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSkirmish, shouldStartFreshSkirmish, setNetMoveSink, setNetResignSink } from './store';
import { legalMoves, livingPieces } from '../core/rules';
import type { MoveEnv } from '../core/rules';
import type { GameState, Piece, PieceType, Side } from '../core/types';
import { createBlankLevel } from '../core/level';
import { settleCommittedPosition } from '../core/adjudication';
import type { PlayingSide } from './clientPerspective';
import { loadPersistedNetIntent, persistNetIntent } from './netIntentPersistence';

// A handful of tests here compute one or two full enemy replies, each of which runs
// the rung-1 search AI (core/ai searchEnemyMove) synchronously and DELIBERATELY with
// no wall-clock budget — bounded only by LIVE_SEARCH's 40k-node cap so a seed replays
// identically on any machine (that determinism is exactly what "is fully deterministic"
// asserts). A 40k-node search is ~1s/move on a fast core; two of them plus CI's slower,
// contended cores blow past vitest's 5s default and wedged every deploy (issue: the
// build-and-deploy "Test app" gate). These tests are compute-heavy by design, not hung,
// so give the file honest headroom rather than weakening the AI or the determinism check.
vi.setConfig({ testTimeout: 20_000 });

// The enemy reply is staged on a timer (see ENEMY_REPLY_DELAY) so play reads as
// turn-taking rather than a simultaneous swap. Fake timers (Date included) let us
// drive both that reply and the battle clock deterministically. The search enemy
// carries no wall-clock budget in the live store (LIVE_SEARCH is node-bounded), so
// a frozen Date can't make it run away — it terminates on maxNodes, deterministically.
function testStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', testStorage());
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  // The store is a module singleton shared across tests; a test that sets an authored victory
  // override (ADR-0064) must not leak it into the next test's preset eval. Reset the victory state.
  useSkirmish.setState({ victoryOverride: null, resultDetail: null, pendingPromotion: null });
  setNetMoveSink(null);
  setNetResignSink(null);
  vi.unstubAllGlobals();
});

function playFirstMove(seed: number) {
  // Untimed: these flow tests drive the enemy reply with runAllTimers, which would
  // otherwise drain the now-default 5:00 free-skirmish clock to a flag-fall and end the
  // game mid-assertion. The clock is covered on its own by the "battle clock" suite.
  useSkirmish.getState().newSkirmish({ seed, timeControl: null });
  const moves = useSkirmish.getState().movesForSelected();
  if (moves.length) useSkirmish.getState().tryMoveTo(moves[0].x, moves[0].y);
  vi.runAllTimers(); // resolve the staged enemy reply
  return useSkirmish.getState().game;
}

describe('skirmish store', () => {
  it('starts on the player turn with a selected player piece', () => {
    useSkirmish.getState().newSkirmish({ seed: 5 });
    const s = useSkirmish.getState();
    expect(s.game.turn).toBe('player');
    expect(s.selectedId).not.toBeNull();
    expect(s.focusedId).toBe(s.selectedId);
    expect(livingPieces(s.game.pieces, 'player').length).toBeGreaterThan(0);
  });

  it('can focus an enemy without changing the player movement selection', () => {
    useSkirmish.getState().newSkirmish({ seed: 5 });
    const selectedId = useSkirmish.getState().selectedId;
    const enemy = livingPieces(useSkirmish.getState().game.pieces, 'enemy')[0];
    expect(enemy).toBeTruthy();
    useSkirmish.getState().focus(enemy.id);
    expect(useSkirmish.getState().focusedId).toBe(enemy.id);
    expect(useSkirmish.getState().selectedId).toBe(selectedId);
  });

  it('a legal move applies immediately and stages the enemy reply on a beat', () => {
    useSkirmish.getState().newSkirmish({ seed: 5, timeControl: null }); // untimed: runAllTimers below must not flag-fall the clock
    const before = useSkirmish.getState().game;
    const moves = useSkirmish.getState().movesForSelected();
    expect(moves.length).toBeGreaterThan(0);
    useSkirmish.getState().tryMoveTo(moves[0].x, moves[0].y);

    // The player's move lands right away; the enemy hasn't answered yet, so the
    // turn is held on 'enemy' (which also locks further player input).
    const mid = useSkirmish.getState().game;
    expect(mid).not.toBe(before); // new immutable state
    expect(['enemy', 'done']).toContain(mid.turn);

    // After the staged beat the enemy answers and the turn returns to the player.
    vi.runAllTimers();
    const after = useSkirmish.getState().game;
    expect(['player', 'done']).toContain(after.turn);
  });

  it('keeps the piece you moved selected through the enemy turn and into your next turn', () => {
    useSkirmish.getState().newSkirmish({ seed: 5, timeControl: null }); // untimed: runAllTimers below must not flag-fall the clock
    const movedId = useSkirmish.getState().selectedId!;
    const moves = useSkirmish.getState().movesForSelected();
    expect(moves.length).toBeGreaterThan(0);
    useSkirmish.getState().tryMoveTo(moves[0].x, moves[0].y);

    // Through the enemy turn: the mover always survives its own move, so the piece the
    // player just commanded stays selected rather than being cleared. Input is gated by
    // turn, so it shows no move-dots — it just keeps the player's context on the board.
    expect(useSkirmish.getState().selectedId).toBe(movedId);

    // Into the next player turn: the selection follows that same piece, only falling
    // back to a living player piece if the enemy captured it.
    vi.runAllTimers();
    const after = useSkirmish.getState();
    const movedStillAlive = after.game.pieces.some((p) => p.id === movedId && p.alive && p.side === 'player');
    if (movedStillAlive) {
      expect(after.selectedId).toBe(movedId);
    } else {
      const sel = after.game.pieces.find((p) => p.id === after.selectedId);
      expect(sel?.side).toBe('player');
      expect(sel?.alive).toBe(true);
    }
  });

  it('ignores an illegal destination', () => {
    useSkirmish.getState().newSkirmish({ seed: 5 });
    const before = useSkirmish.getState().game;
    useSkirmish.getState().tryMoveTo(-1, -1);
    expect(useSkirmish.getState().game).toBe(before);
  });

  it('is fully deterministic for a seed + move sequence', () => {
    expect(playFirstMove(5)).toEqual(playFirstMove(5));
  });

  it('newSkirmish marks the game as started and records its level', () => {
    useSkirmish.getState().newSkirmish({ seed: 5 });
    expect(useSkirmish.getState().started).toBe(true);
    expect(useSkirmish.getState().levelId).toBeNull(); // free skirmish

    useSkirmish.getState().newSkirmish({ seed: 5, level: createBlankLevel('lvl-7') });
    expect(useSkirmish.getState().levelId).toBe('lvl-7');
  });

  it('resumeMatch restores a saved board and reads as resumable for its level', () => {
    // A real (full-board) game stands in for the saved match; label it as a campaign
    // level so the fresh-vs-resume gate has a levelId to key on.
    useSkirmish.getState().newSkirmish({ seed: 5 });
    const s = useSkirmish.getState();
    const saved = {
      game: s.game, seed: s.seed, tick: s.tick, log: s.log, objective: s.objective,
      objectiveCtx: s.objectiveCtx, victoryOverride: s.victoryOverride, turnsElapsed: s.turnsElapsed, levelId: 'lvl-9', clock: s.clock,
    };
    // Simulate a reload wiping the singleton to a different, unrelated game.
    vi.clearAllTimers();
    useSkirmish.getState().newSkirmish({ seed: 123 });
    expect(useSkirmish.getState().levelId).toBeNull();

    useSkirmish.getState().resumeMatch(saved);
    const r = useSkirmish.getState();
    expect(r.started).toBe(true);
    expect(r.levelId).toBe('lvl-9');
    expect(r.game).toEqual(saved.game);
    expect(r.selectedId).not.toBeNull(); // a player piece is reselected
    expect(shouldStartFreshSkirmish(r, 'lvl-9')).toBe(false); // gate now says "resume"
    expect(shouldStartFreshSkirmish(r, 'other')).toBe(true); // a different level still starts fresh
  });

  it('resumeMatch re-stages the enemy reply that a reload interrupts', () => {
    useSkirmish.getState().newSkirmish({ seed: 5, timeControl: null }); // untimed: runAllTimers below must not flag-fall the clock
    const moves = useSkirmish.getState().movesForSelected();
    useSkirmish.getState().tryMoveTo(moves[0].x, moves[0].y);
    expect(useSkirmish.getState().game.turn).toBe('enemy'); // reply staged on a timer

    const s = useSkirmish.getState();
    const saved = {
      game: s.game, seed: s.seed, tick: s.tick, log: s.log, objective: s.objective,
      objectiveCtx: s.objectiveCtx, victoryOverride: s.victoryOverride, turnsElapsed: s.turnsElapsed, levelId: s.levelId, clock: s.clock,
    };
    vi.clearAllTimers(); // a page reload kills the pending reply — the soft-lock this guards
    useSkirmish.getState().resumeMatch(saved);
    expect(useSkirmish.getState().game.turn).toBe('enemy'); // reply re-staged

    vi.runAllTimers();
    expect(useSkirmish.getState().game.turn).toBe('player'); // enemy answered; turn handed back
  });

  it('newSkirmish computes kingSide uniformly — free games field the King on the enemy side', () => {
    useSkirmish.getState().newSkirmish({ seed: 5 });
    expect(useSkirmish.getState().objectiveCtx.kingSide).toBe('enemy');
  });

  it('newSkirmish flips kingSide (and the intro copy) when the LEVEL gives the player the King', () => {
    const level = createBlankLevel('lvl-protect', 'Protect', 8, 8);
    level.objective = 'capture-king';
    level.layers.units = [
      { x: 0, y: 7, type: 'king', side: 'player' },
      { x: 7, y: 0, type: 'queen', side: 'enemy' },
    ];
    useSkirmish.getState().newSkirmish({ seed: 5, level });
    const s = useSkirmish.getState();
    expect(s.objectiveCtx.kingSide).toBe('player');
    expect(s.log[0]).toContain('Protect your King');
  });
});

// The skirmish screen remounts whenever you leave and return (route swap), but
// the store is a singleton that already holds the live board — so re-entry must
// resume, not restart. shouldStartFreshSkirmish encodes exactly when a rebuild
// is warranted; this is the regression guard for "menu → back wiped my game".
describe('shouldStartFreshSkirmish (resume vs restart on re-entry)', () => {
  const live = (overrides: Partial<{ winner: 'player' | 'enemy' | 'draw' | null }> = {}) => ({
    started: true,
    levelId: null as string | null,
    game: { winner: null, ...overrides } as GameState,
  });

  it('starts fresh on the very first entry (nothing started yet)', () => {
    expect(shouldStartFreshSkirmish({ started: false, levelId: null, game: { winner: null } as GameState }, null)).toBe(true);
  });

  it('resumes an in-progress free skirmish (the menu → back case)', () => {
    expect(shouldStartFreshSkirmish(live(), null)).toBe(false);
  });

  it('starts fresh after a finished game rather than re-showing the result', () => {
    expect(shouldStartFreshSkirmish(live({ winner: 'player' }), null)).toBe(true);
    expect(shouldStartFreshSkirmish(live({ winner: 'enemy' }), null)).toBe(true);
    expect(shouldStartFreshSkirmish(live({ winner: 'draw' }), null)).toBe(true);
  });

  it('resumes the same level but rebuilds when a different level is opened', () => {
    const onLevelA = { started: true, levelId: 'A' as string | null, game: { winner: null } as GameState };
    expect(shouldStartFreshSkirmish(onLevelA, 'A')).toBe(false); // same level → resume
    expect(shouldStartFreshSkirmish(onLevelA, 'B')).toBe(true); // different level → fresh
    expect(shouldStartFreshSkirmish(onLevelA, null)).toBe(true); // level → free skirmish → fresh
  });

  it('always rebuilds when leaving netplay, even for the same level id', () => {
    const state = {
      started: true,
      levelId: 'A',
      game: { winner: null } as GameState,
      net: { lobbyId: 'L1', localSide: 'player' as const, moveCount: 0, pendingMove: null, terminalResult: null },
    };
    expect(shouldStartFreshSkirmish(state, 'A')).toBe(true);
  });
});

function piece(id: string, side: Side, type: PieceType, x: number, y: number): Piece {
  return { id, side, type, x, y, alive: true, startY: y };
}

function playableNetLevel() {
  const level = createBlankLevel('net-1', 'Net', 8, 8);
  level.layers.units = [
    { side: 'player', type: 'king', x: 0, y: 7 },
    { side: 'player', type: 'rook', x: 1, y: 7 },
    { side: 'enemy', type: 'king', x: 7, y: 0 },
    { side: 'enemy', type: 'rook', x: 6, y: 0 },
  ];
  return level;
}

/** Load a hand-built board into the store as the active capture-king skirmish.
 * objectiveCtx is reset explicitly (classic enemy-holds-the-King direction) — setState
 * merges, so a kingSide left behind by an earlier test would otherwise leak in. */
function loadCaptureKing(pieces: Piece[], selectedId: string): void {
  const game: GameState = { size: { cols: 8, rows: 8 }, pieces, turn: 'player', winner: null };
  useSkirmish.setState({
    game,
    env: { terrain: undefined, lastMove: undefined },
    objective: 'capture-king',
    objectiveCtx: { kingSide: 'enemy' },
    selectedId,
    focusedId: selectedId,
    log: [],
  });
}

describe('skirmish store: capture-king objective', () => {
  it('wins the instant the enemy King is captured, even with lesser enemies still alive', () => {
    // Player rook shares a column with the enemy King; an enemy pawn survives elsewhere.
    loadCaptureKing(
      [piece('pr', 'player', 'rook', 0, 0), piece('ek', 'enemy', 'king', 0, 5), piece('ep', 'enemy', 'pawn', 7, 7)],
      'pr',
    );
    useSkirmish.getState().tryMoveTo(0, 5); // capture the King

    const { game, log } = useSkirmish.getState();
    expect(game.winner).toBe('player');
    expect(game.turn).toBe('done');
    expect(game.pieces.find((p) => p.id === 'ep')?.alive).toBe(true); // lesser enemy still on the board
    expect(log[0]).toBe('Victory — The opposing King was captured.');
  });

  it('does not win when a non-royal enemy is captured — the game continues', () => {
    loadCaptureKing(
      [piece('pr', 'player', 'rook', 0, 0), piece('ek', 'enemy', 'king', 7, 7), piece('ep', 'enemy', 'pawn', 0, 5)],
      'pr',
    );
    useSkirmish.getState().tryMoveTo(0, 5); // capture the pawn, not the King

    const { game } = useSkirmish.getState();
    expect(game.winner).toBeNull();
    expect(game.turn).toBe('enemy'); // handed to the enemy, not resolved
  });
});

describe('skirmish store: rival-kings + direction-aware capture-king copy', () => {
  it('rival-kings: capturing the enemy King wins with the rival-King wording', () => {
    // The surviving pawn proves this is the RIVAL-KINGS authored rule rather than
    // the preset's separate full-force elimination condition.
    const game: GameState = {
      size: { cols: 8, rows: 8 },
      pieces: [piece('pr', 'player', 'rook', 0, 0), piece('pk', 'player', 'king', 7, 7), piece('ek', 'enemy', 'king', 0, 5), piece('ep', 'enemy', 'pawn', 7, 2)],
      turn: 'player',
      winner: null,
    };
    useSkirmish.setState({ game, env: { terrain: undefined, lastMove: undefined }, objective: 'rival-kings', objectiveCtx: {}, selectedId: 'pr', focusedId: 'pr', log: [] });
    useSkirmish.getState().tryMoveTo(0, 5); // rook takes the rival King
    const s = useSkirmish.getState();
    expect(s.game.winner).toBe('player');
    expect(s.log[0]).toBe('Victory — The opposing King was captured.');
  });

  it('capture-king with kingSide=player: losing the King reads as the King falling, not a wipe', () => {
    // The player King is already gone (only a pawn remains): the player's next move
    // triggers the objective check, which the King-holder side has already lost.
    const game: GameState = {
      size: { cols: 8, rows: 8 },
      pieces: [piece('pp', 'player', 'pawn', 0, 6), piece('ek', 'enemy', 'king', 7, 0)],
      turn: 'player',
      winner: null,
    };
    useSkirmish.setState({ game, env: { terrain: undefined, lastMove: undefined }, objective: 'capture-king', objectiveCtx: { kingSide: 'player' }, selectedId: 'pp', focusedId: 'pp', log: [] });
    useSkirmish.getState().tryMoveTo(0, 5); // any legal pawn step
    const s = useSkirmish.getState();
    expect(s.game.winner).toBe('enemy');
    expect(s.log[0]).toBe('Defeat — Your King was captured.');
  });
});

describe('skirmish store: authored victory names the fired rule (ADR-0064)', () => {
  it('an authored win reads by its rule name, not the mode label — in the log and resultDetail', () => {
    // AUTHORED to win by capturing the enemy KING while the enemy still fields a pawn, so this
    // exact named rule — not a full-force preset condition — is what decides.
    // The result must read by the authored rule name ("Storm the keep"), not an objective preset.
    const game: GameState = {
      size: { cols: 8, rows: 8 },
      pieces: [piece('pr', 'player', 'rook', 0, 0), piece('ek', 'enemy', 'king', 0, 5), piece('ep', 'enemy', 'pawn', 7, 7)],
      turn: 'player',
      winner: null,
    };
    useSkirmish.setState({
      game,
      env: { terrain: undefined, lastMove: undefined },
      objective: 'capture-all',
      objectiveCtx: {},
      victoryOverride: [{ name: 'Storm the keep', if: [{ kind: 'eliminate', side: 'enemy', filter: { type: 'king' } }], do: [{ kind: 'win', side: 'player' }] }],
      resultDetail: null,
      selectedId: 'pr',
      focusedId: 'pr',
      log: [],
    });
    useSkirmish.getState().tryMoveTo(0, 5); // rook takes the enemy King (the pawn survives)
    const s = useSkirmish.getState();
    expect(s.game.winner).toBe('player');
    expect(s.log[0]).toBe('Victory — Storm the keep.');
    expect(s.resultDetail).toBe('Storm the keep');
  });
});

describe('skirmish store: survive + reach objectives', () => {
  it('survive: wins once the required rounds elapse (after the enemy reply)', () => {
    useSkirmish.setState({
      game: { size: { cols: 8, rows: 8 }, pieces: [piece('pk', 'player', 'king', 0, 7), piece('ek', 'enemy', 'king', 7, 0)], turn: 'player', winner: null },
      env: { terrain: undefined, lastMove: undefined },
      objective: 'survive',
      objectiveCtx: { surviveTurns: 1 },
      turnsElapsed: 0,
      seed: 1,
      tick: 0,
      selectedId: 'pk',
      focusedId: 'pk',
      log: [],
    });
    useSkirmish.getState().tryMoveTo(0, 6); // king steps to an empty square
    expect(useSkirmish.getState().game.winner).toBeNull(); // round not complete yet
    vi.runAllTimers(); // enemy replies → one round elapses → survive target met
    expect(useSkirmish.getState().game.winner).toBe('player');
  });

  it('reach: a PAWN promoting on a target cell wins after the promotion choice', () => {
    useSkirmish.setState({
      game: { size: { cols: 8, rows: 8 }, pieces: [piece('pp', 'player', 'pawn', 0, 1), piece('ek', 'enemy', 'king', 7, 7)], turn: 'player', winner: null, promotionZones: [{ x: 0, y: 0 }] },
      env: { terrain: undefined, lastMove: undefined },
      objective: 'reach',
      objectiveCtx: { reachCells: [{ x: 0, y: 0 }] },
      turnsElapsed: 0,
      seed: 1,
      tick: 0,
      selectedId: 'pp',
      focusedId: 'pp',
      log: [],
    });
    useSkirmish.getState().tryMoveTo(0, 0); // pawn steps onto the target
    expect(useSkirmish.getState().pendingPromotion).toMatchObject({ pieceId: 'pp' });
    expect(useSkirmish.getState().game.pieces.find((p) => p.id === 'pp')).toMatchObject({ type: 'pawn', x: 0, y: 1 });
    useSkirmish.getState().choosePromotion('rook');
    const { game } = useSkirmish.getState();
    expect(game.winner).toBe('player');
    expect(game.turn).toBe('done');
    expect(game.pieces.find((p) => p.id === 'pp')).toMatchObject({ type: 'rook', x: 0, y: 0 });
  });

  it('reach: a NON-pawn on a target cell does NOT win (reach is pawn-only)', () => {
    useSkirmish.setState({
      game: { size: { cols: 8, rows: 8 }, pieces: [piece('pr', 'player', 'rook', 0, 3), piece('ek', 'enemy', 'king', 7, 7)], turn: 'player', winner: null },
      env: { terrain: undefined, lastMove: undefined },
      objective: 'reach',
      objectiveCtx: { reachCells: [{ x: 0, y: 0 }] },
      turnsElapsed: 0,
      seed: 1,
      tick: 0,
      selectedId: 'pr',
      focusedId: 'pr',
      log: [],
    });
    useSkirmish.getState().tryMoveTo(0, 0); // rook slides onto the target — no longer a win
    expect(useSkirmish.getState().game.winner).toBeNull();
  });
});

// The battle clock: standard chess-clock rules for the player only. Runs on the
// player's live turn, pauses (banking the Fischer increment) the moment their move
// applies, resumes when the enemy reply hands the turn back, and a flag fall is a
// defeat. Driven entirely by fake timers (the ticker + Date are both faked).
describe('skirmish store: battle clock', () => {
  /** A playable timed level: one player rook vs a far-away enemy king. */
  const timedLevel = (initialSeconds: number, incrementSeconds = 0) => {
    const level = createBlankLevel('lvl-clock', 'Timed', 8, 8);
    level.layers.units = [
      { x: 0, y: 7, type: 'rook', side: 'player' },
      { x: 7, y: 0, type: 'king', side: 'enemy' },
    ];
    level.timeControl = { initialSeconds, incrementSeconds };
    return level;
  };

  const clock = () => useSkirmish.getState().clock;

  it('defaults a free skirmish to the 5:00 clock; a level without a control stays untimed', () => {
    // A free skirmish (no level, no explicit control) is timed by default so random
    // battles play like a real game — DEFAULT_TIME_CONTROL is 5:00 with no increment.
    useSkirmish.getState().newSkirmish({ seed: 5 });
    expect(clock()).toEqual({ remainingMs: 300_000, running: true, incrementMs: 0 });
    // A level uses its OWN authored control...
    useSkirmish.getState().newSkirmish({ seed: 5, level: timedLevel(60) });
    expect(clock()).toEqual({ remainingMs: 60_000, running: true, incrementMs: 0 });
    // ...and a level WITHOUT one stays untimed (undefined ⇒ no clock).
    const untimedLevel = createBlankLevel('lvl-untimed', 'Untimed', 8, 8);
    untimedLevel.layers.units = [
      { x: 0, y: 7, type: 'rook', side: 'player' },
      { x: 7, y: 0, type: 'king', side: 'enemy' },
    ];
    useSkirmish.getState().newSkirmish({ seed: 6, level: untimedLevel });
    expect(clock()).toBeNull();
  });

  it('honors an explicit free-skirmish time control: a value arms it, null plays untimed', () => {
    // The HUD clock picker / "New skirmish" passes timeControl explicitly; it wins over
    // the 5:00 default — a TimeControl arms exactly that clock...
    useSkirmish.getState().newSkirmish({ seed: 5, timeControl: { initialSeconds: 120, incrementSeconds: 2 } });
    expect(clock()).toEqual({ remainingMs: 120_000, running: true, incrementMs: 2_000 });
    // ...and null forces an untimed skirmish (and clears the prior game's clock).
    useSkirmish.getState().newSkirmish({ seed: 6, timeControl: null });
    expect(clock()).toBeNull();
  });

  it('arms the clock running from the first (player) turn', () => {
    useSkirmish.getState().newSkirmish({ seed: 5, level: timedLevel(60, 5) });
    expect(clock()).toEqual({ remainingMs: 60_000, running: true, incrementMs: 5_000 });
  });

  it('counts down on the player turn and freezes for the whole enemy reply', () => {
    useSkirmish.getState().newSkirmish({ seed: 5, level: timedLevel(60) });
    vi.advanceTimersByTime(3_000);
    expect(clock()!.remainingMs).toBe(57_000);

    const moves = useSkirmish.getState().movesForSelected();
    expect(moves.length).toBeGreaterThan(0);
    useSkirmish.getState().tryMoveTo(moves[0].x, moves[0].y);
    expect(clock()!.running).toBe(false);
    const paused = clock()!.remainingMs;

    // Inside the staged enemy-reply beat: no time drains off the player's bank.
    vi.advanceTimersByTime(400);
    expect(clock()!.remainingMs).toBe(paused);

    // The reply resolves (520ms beat), but the enemy's visible landing beat still belongs
    // to premove input, so the player's clock stays paused.
    vi.advanceTimersByTime(200);
    expect(useSkirmish.getState().game.turn).toBe('player');
    expect(useSkirmish.getState().premoveInputOpen).toBe(true);
    expect(clock()!.running).toBe(false);

    // Once that premove input beat closes without a queued move, live control and clock resume.
    vi.advanceTimersByTime(620);
    expect(useSkirmish.getState().premoveInputOpen).toBe(false);
    expect(clock()!.running).toBe(true);
  });

  it('banks the Fischer increment when a move completes', () => {
    useSkirmish.getState().newSkirmish({ seed: 5, level: timedLevel(60, 5) });
    vi.advanceTimersByTime(2_000); // 58s left on the deadline
    const moves = useSkirmish.getState().movesForSelected();
    useSkirmish.getState().tryMoveTo(moves[0].x, moves[0].y);
    expect(clock()!.remainingMs).toBe(58_000 + 5_000);
  });

  it('flag fall: reaching zero on the player turn is a defeat on time', () => {
    useSkirmish.getState().newSkirmish({ seed: 5, level: timedLevel(1) });
    vi.advanceTimersByTime(1_100);
    const s = useSkirmish.getState();
    expect(s.game.winner).toBe('enemy');
    expect(s.game.turn).toBe('done');
    expect(s.clock).toEqual({ remainingMs: 0, running: false, incrementMs: 0 });
    expect(s.log[0]).toMatch(/clock ran out/i);
    // Input is locked exactly like any other decided game.
    expect(useSkirmish.getState().movesForSelected()).toEqual([]);
  });
});

describe('checkmate ends the game the instant it is delivered', () => {
  const OPEN_ENV: MoveEnv = { terrain: undefined, lastMove: undefined };

  it('a player move that mates the enemy wins immediately — no capture, no enemy reply', () => {
    // Enemy King boxed at (0,0): a player rook already seals column 1, and moving
    // the second rook onto column 0 (0,3) gives a check the King cannot escape.
    const game: GameState = {
      size: { cols: 8, rows: 8 },
      pieces: [
        piece('ek', 'enemy', 'king', 0, 0),
        piece('seal', 'player', 'rook', 1, 7), // covers (1,0) and (1,1)
        piece('mater', 'player', 'rook', 2, 3), // will slide to (0,3) to mate
        piece('pk', 'player', 'king', 5, 5),
      ],
      turn: 'player',
      winner: null,
    };
    useSkirmish.setState({
      game, env: OPEN_ENV, selectedId: 'mater', focusedId: 'mater',
      objective: 'capture-king', objectiveCtx: { kingSide: 'enemy' }, turnsElapsed: 0,
      clock: null, started: true,
    });

    useSkirmish.getState().tryMoveTo(0, 3);

    const s = useSkirmish.getState();
    expect(s.game.winner).toBe('player'); // Victory, resolved on the mating move itself
    expect(s.game.turn).toBe('done');
    expect(s.game.pieces.find((p) => p.id === 'ek')?.alive).toBe(true); // King never had to be captured
    expect(s.log[0]).toMatch(/checkmate/i);

    // No enemy reply is pending — the game is already over.
    vi.runAllTimers();
    expect(useSkirmish.getState().game.turn).toBe('done');
  });
});

describe('canonical settled-position guard (no manual End Turn)', () => {
  const OPEN_ENV: MoveEnv = { terrain: undefined, lastMove: undefined };
  const stateOf = (pieces: Piece[], cols: number, rows: number): GameState => ({
    size: { cols, rows },
    pieces,
    turn: 'player',
    winner: null,
  });

  it('a player with no legal move on their turn ends in a draw (stalemate — cannot pass)', () => {
    // 1-wide board: the lone pawn is blocked head-on by the enemy King (pawns do not
    // capture forward) and has no diagonal capture available off the board's edges.
    const trapped = stateOf([piece('p', 'player', 'pawn', 0, 1), piece('ek', 'enemy', 'king', 0, 0)], 1, 2);
    const res = settleCommittedPosition(trapped, { victoryRules: [], env: OPEN_ENV });
    expect(res.adjudication).toEqual({ kind: 'stalemate', winner: 'draw', rule: null, side: 'player' });
    expect(res.state.winner).toBe('draw');
    expect(res.state.turn).toBe('done');
  });

  it('leaves a state untouched when the player can still move', () => {
    const free = stateOf([piece('p', 'player', 'pawn', 0, 2), piece('ek', 'enemy', 'king', 0, 0)], 1, 3);
    const res = settleCommittedPosition(free, { victoryRules: [], env: OPEN_ENV });
    expect(res.adjudication).toBeNull();
    expect(res.state).toBe(free); // unchanged reference
  });

  it('a checkmated player (king in check with no escape) loses, not draws', () => {
    // King cornered at (0,0): one rook checks down column 0, another seals column 1,
    // so every escape square is attacked and there is no piece to interpose.
    const mated = stateOf([
      piece('pk', 'player', 'king', 0, 0),
      piece('r1', 'enemy', 'rook', 0, 5),
      piece('r2', 'enemy', 'rook', 1, 5),
      piece('ek', 'enemy', 'king', 2, 5),
    ], 3, 6);
    const res = settleCommittedPosition(mated, { victoryRules: [], env: OPEN_ENV });
    expect(res.adjudication).toEqual({ kind: 'checkmate', winner: 'enemy', rule: null, side: 'player' });
    expect(res.state.winner).toBe('enemy');
    expect(res.state.turn).toBe('done');
  });

  it('a stalemated player (king has no move but is NOT in check) still draws', () => {
    // King at (0,0) is not attacked, but a rook seals column 1 and a rook seals row 1,
    // covering every neighbour — no legal move, yet no check: stalemate, not mate.
    const stuck = stateOf([
      piece('pk', 'player', 'king', 0, 0),
      piece('r1', 'enemy', 'rook', 1, 5),
      piece('r2', 'enemy', 'rook', 5, 1),
      piece('ek', 'enemy', 'king', 5, 5),
    ], 6, 6);
    const res = settleCommittedPosition(stuck, { victoryRules: [], env: OPEN_ENV });
    expect(res.adjudication).toEqual({ kind: 'stalemate', winner: 'draw', rule: null, side: 'player' });
    expect(res.state.winner).toBe('draw');
    expect(res.state.turn).toBe('done');
  });

  it('resolves the ENEMY to move: checkmate hands the win to the player', () => {
    const g = { ...stateOf([
      piece('ek', 'enemy', 'king', 0, 0),
      piece('r1', 'player', 'rook', 0, 5), // checks down column 0
      piece('r2', 'player', 'rook', 1, 5), // seals column 1
      piece('pk', 'player', 'king', 2, 5),
    ], 3, 6), turn: 'enemy' as const };
    expect(settleCommittedPosition(g, { victoryRules: [], env: OPEN_ENV }).adjudication)
      .toEqual({ winner: 'player', kind: 'checkmate', rule: null, side: 'enemy' });
  });

  it('resolves the ENEMY to move: stalemate is a draw', () => {
    const g = { ...stateOf([
      piece('ek', 'enemy', 'king', 0, 0),
      piece('r1', 'player', 'rook', 1, 5), // seals column 1
      piece('r2', 'player', 'rook', 5, 1), // seals row 1
      piece('pk', 'player', 'king', 5, 5),
    ], 6, 6), turn: 'enemy' as const };
    expect(settleCommittedPosition(g, { victoryRules: [], env: OPEN_ENV }).adjudication)
      .toEqual({ winner: 'draw', kind: 'stalemate', rule: null, side: 'enemy' });
  });

  it('returns null while the side to move can still move', () => {
    const g = { ...stateOf([piece('ek', 'enemy', 'king', 0, 0), piece('pk', 'player', 'king', 5, 5)], 6, 6), turn: 'enemy' as const };
    expect(settleCommittedPosition(g, { victoryRules: [], env: OPEN_ENV }).adjudication).toBeNull();
  });

  it('ends a movable position as a draw when the chess draw rules say so', () => {
    const base = { ...stateOf([piece('ek', 'enemy', 'king', 0, 0), piece('pk', 'player', 'king', 5, 5)], 6, 6), turn: 'enemy' as const };
    const clocked = { ...base, drawRules: { fiftyMove: true }, halfmoveClock: 100 };
    expect(settleCommittedPosition(clocked, { victoryRules: [], env: OPEN_ENV }).adjudication)
      .toEqual({ winner: 'draw', kind: 'fifty-move', rule: null, side: 'enemy' });
    // Without the authored rule the same clock means nothing (back-compat).
    expect(settleCommittedPosition({ ...base, halfmoveClock: 100 }, { victoryRules: [], env: OPEN_ENV }).adjudication).toBeNull();
  });

  it('does not invent a second adjudication after the game is decided', () => {
    const trapped = stateOf([piece('p', 'player', 'pawn', 0, 1), piece('ek', 'enemy', 'king', 0, 0)], 1, 2);
    const decided = { ...trapped, winner: 'player' as const, turn: 'done' as const };
    const res = settleCommittedPosition(decided, { victoryRules: [], env: OPEN_ENV });
    expect(res.adjudication).toBeNull();
    expect(res.state).toBe(decided);
  });
});

// Premoves: a chain queued while it's the opponent's turn, fired one-per-turn as control
// returns. The head is re-validated against the REAL board the enemy reply produced —
// legal → it fires and re-stages the reply (so the chain plays out); illegal → the WHOLE
// chain is dropped (chess default). Driven by the same fake timers as the enemy reply.
describe('skirmish store: premoves', () => {
  // A clean capture-king board on the player's turn, with an empty premove queue — the
  // queue leaks across tests otherwise (setState merges), so reset it explicitly. The
  // enemy is pinned to the GREEDY policy (always grabs an available capture): these test
  // premove MECHANICS against a deterministic reply, not the positional search AI, whose
  // choices would make "does the enemy take the premoved piece?" scenario-dependent.
  function loadBoard(pieces: Piece[], selectedId: string): void {
    useSkirmish.setState({
      game: { size: { cols: 8, rows: 8 }, pieces, turn: 'player', winner: null },
      env: { terrain: undefined, lastMove: undefined },
      objective: 'capture-king',
      objectiveCtx: { kingSide: 'enemy' },
      turnsElapsed: 0,
      seed: 1,
      tick: 0,
      aiMode: 'greedy',
      selectedId,
      focusedId: selectedId,
      log: [],
      started: true,
      clock: null,
      premoves: [],
      premoveInputOpen: false,
      testMode: false,
      testMinCpuDelayMs: 0,
    });
  }

  it('queues only during the opponent turn, and only legal targets', () => {
    loadBoard([piece('pr', 'player', 'rook', 0, 0), piece('pk', 'player', 'king', 0, 7), piece('ek', 'enemy', 'king', 7, 7)], 'pk');
    // On the player's own live turn a click is a real move, not a premove.
    useSkirmish.getState().queueMove('pr', 0, 5);
    expect(useSkirmish.getState().premoves).toEqual([]);

    useSkirmish.getState().tryMoveTo(1, 7); // safe king step → opponent's turn
    expect(useSkirmish.getState().game.turn).toBe('enemy');
    useSkirmish.getState().queueMove('pr', 1, 5); // a rook can't reach (1,5) in one move
    expect(useSkirmish.getState().premoves).toEqual([]);
    useSkirmish.getState().queueMove('pr', 0, 5); // legal along the file
    expect(useSkirmish.getState().premoves).toEqual([{ pieceId: 'pr', x: 0, y: 5 }]);
  });

  it('preserves a different unit selected during the opponent reply', () => {
    loadBoard([piece('pr', 'player', 'rook', 0, 0), piece('pk', 'player', 'king', 0, 7), piece('ek', 'enemy', 'king', 7, 7)], 'pk');
    useSkirmish.getState().tryMoveTo(1, 7); // selected mover is pk; reply is now staged
    expect(useSkirmish.getState().selectedId).toBe('pk');

    useSkirmish.getState().select('pr'); // mirrors clicking a different unit in premove mode
    expect(useSkirmish.getState().selectedId).toBe('pr');

    vi.runAllTimers();
    expect(useSkirmish.getState().game.turn).toBe('player');
    expect(useSkirmish.getState().selectedId).toBe('pr');
    expect(useSkirmish.getState().focusedId).toBe('pr');
  });

  it('preserves an explicitly cleared selection through the opponent reply', () => {
    loadBoard([piece('pr', 'player', 'rook', 0, 0), piece('pk', 'player', 'king', 0, 7), piece('ek', 'enemy', 'king', 7, 7)], 'pk');
    useSkirmish.getState().tryMoveTo(1, 7); // selected mover is pk; reply is now staged

    useSkirmish.getState().select(null); // mirrors clicking away from every unit
    expect(useSkirmish.getState().selectedId).toBeNull();
    expect(useSkirmish.getState().focusedId).toBeNull();

    vi.runAllTimers();
    expect(useSkirmish.getState().game.turn).toBe('player');
    expect(useSkirmish.getState().selectedId).toBeNull();
    expect(useSkirmish.getState().focusedId).toBeNull();
  });

  it('keeps the premove unit selected during the fire beat after the reply', () => {
    loadBoard([piece('pr', 'player', 'rook', 0, 0), piece('pk', 'player', 'king', 0, 7), piece('ek', 'enemy', 'king', 7, 7)], 'pk');
    useSkirmish.getState().tryMoveTo(1, 7);
    useSkirmish.getState().select('pr');
    useSkirmish.getState().queueMove('pr', 0, 5);

    vi.advanceTimersByTime(520); // enemy reply resolves; the premove waits for its visible beat
    const duringBeat = useSkirmish.getState();
    expect(duringBeat.game.turn).toBe('player');
    expect(duringBeat.premoveInputOpen).toBe(true);
    expect(duringBeat.premoves).toEqual([{ pieceId: 'pr', x: 0, y: 5 }]);
    expect(duringBeat.selectedId).toBe('pr');
  });

  it('accepts a premove queued while the enemy reply is visibly landing', () => {
    loadBoard([piece('pr', 'player', 'rook', 0, 0), piece('pk', 'player', 'king', 0, 7), piece('ek', 'enemy', 'king', 7, 7)], 'pk');
    useSkirmish.getState().tryMoveTo(1, 7);

    vi.advanceTimersByTime(520); // reply has applied; landing beat is still premove input
    expect(useSkirmish.getState().game.turn).toBe('player');
    expect(useSkirmish.getState().premoveInputOpen).toBe(true);

    useSkirmish.getState().queueMove('pr', 0, 5);
    expect(useSkirmish.getState().premoves).toEqual([{ pieceId: 'pr', x: 0, y: 5 }]);

    vi.advanceTimersByTime(619);
    expect(useSkirmish.getState().premoves).toEqual([{ pieceId: 'pr', x: 0, y: 5 }]);
    vi.advanceTimersByTime(2);
    const afterFire = useSkirmish.getState();
    expect(afterFire.game.pieces.find((p) => p.id === 'pr')).toMatchObject({ x: 0, y: 5 });
    expect(afterFire.premoveInputOpen).toBe(false);
  });

  it('closes the post-reply premove input beat when no premove is queued', () => {
    loadBoard([piece('pr', 'player', 'rook', 0, 0), piece('pk', 'player', 'king', 0, 7), piece('ek', 'enemy', 'king', 7, 7)], 'pk');
    useSkirmish.getState().tryMoveTo(1, 7);

    vi.advanceTimersByTime(520);
    expect(useSkirmish.getState().premoveInputOpen).toBe(true);
    vi.advanceTimersByTime(620);
    expect(useSkirmish.getState().premoveInputOpen).toBe(false);
    expect(useSkirmish.getState().game.turn).toBe('player');
  });

  it('fires a queued premove the instant control returns to the player', () => {
    loadBoard([piece('pr', 'player', 'rook', 0, 0), piece('pk', 'player', 'king', 0, 7), piece('ek', 'enemy', 'king', 7, 7)], 'pk');
    useSkirmish.getState().tryMoveTo(1, 7);
    useSkirmish.getState().queueMove('pr', 0, 5);

    vi.runAllTimers(); // enemy reply → premove fires → enemy answers the premove
    const s = useSkirmish.getState();
    expect(s.game.pieces.find((p) => p.id === 'pr')).toMatchObject({ x: 0, y: 5 });
    expect(s.premoves).toEqual([]);
    expect(s.game.turn).toBe('player');
  });

  it('fires a stacked chain step-by-step across turns', () => {
    loadBoard([piece('pr', 'player', 'rook', 0, 0), piece('pk', 'player', 'king', 0, 7), piece('ek', 'enemy', 'king', 7, 7)], 'pk');
    useSkirmish.getState().tryMoveTo(1, 7);
    useSkirmish.getState().queueMove('pr', 0, 5); // step 1
    useSkirmish.getState().queueMove('pr', 3, 5); // step 2, built on the provisional board
    expect(useSkirmish.getState().premoves).toHaveLength(2);

    vi.runAllTimers();
    const s = useSkirmish.getState();
    expect(s.game.pieces.find((p) => p.id === 'pr')).toMatchObject({ x: 3, y: 5 }); // both steps ran
    expect(s.premoves).toEqual([]);
  });

  it('drops the whole chain when the enemy reply captures the premoved piece', () => {
    loadBoard([
      piece('pk', 'player', 'king', 0, 7),
      piece('pp', 'player', 'pawn', 4, 4),
      piece('er', 'enemy', 'rook', 4, 0), // the only capture on the board: er takes pp up file 4
      piece('ek', 'enemy', 'king', 7, 0),
    ], 'pk');
    useSkirmish.getState().tryMoveTo(1, 7); // safe king step → opponent's turn
    useSkirmish.getState().queueMove('pp', 4, 3);
    expect(useSkirmish.getState().premoves).toHaveLength(1);

    vi.runAllTimers();
    const s = useSkirmish.getState();
    expect(s.game.pieces.find((p) => p.id === 'pp')?.alive).toBe(false); // captured by the reply
    expect(s.premoves).toEqual([]); // chain dropped — the premove never fired
    expect(s.game.turn).toBe('player');
  });

  it('fires a queued recapture after the enemy captures a friendly-occupied square', () => {
    loadBoard([
      piece('pk', 'player', 'king', 0, 7),
      piece('pr', 'player', 'rook', 0, 4),
      piece('bait', 'player', 'pawn', 4, 4),
      piece('er', 'enemy', 'rook', 4, 0), // greedy reply: er takes bait on the recapture square
      piece('ek', 'enemy', 'king', 7, 0),
    ], 'pk');
    useSkirmish.getState().tryMoveTo(1, 7); // safe king step -> opponent's turn
    useSkirmish.getState().queueMove('pr', 4, 4);
    expect(useSkirmish.getState().premoves).toEqual([{ pieceId: 'pr', x: 4, y: 4 }]);

    vi.advanceTimersByTime(520); // enemy reply lands; the premove waits for its visible beat
    const afterReply = useSkirmish.getState();
    expect(afterReply.game.pieces.find((p) => p.id === 'bait')?.alive).toBe(false);
    expect(afterReply.game.pieces.find((p) => p.id === 'er')).toMatchObject({ x: 4, y: 4, alive: true });
    expect(afterReply.premoveInputOpen).toBe(true);

    vi.advanceTimersByTime(621); // fire the queued recapture, but not the next enemy reply
    const afterRecapture = useSkirmish.getState();
    expect(afterRecapture.game.pieces.find((p) => p.id === 'pr')).toMatchObject({ x: 4, y: 4, alive: true });
    expect(afterRecapture.game.pieces.find((p) => p.id === 'er')?.alive).toBe(false);
    expect(afterRecapture.premoves).toEqual([]);
    expect(afterRecapture.game.turn).toBe('enemy');
  });

  it('clearPremoves drops the whole queued chain', () => {
    loadBoard([piece('pr', 'player', 'rook', 0, 0), piece('pk', 'player', 'king', 0, 7), piece('ek', 'enemy', 'king', 7, 7)], 'pk');
    useSkirmish.getState().tryMoveTo(1, 7);
    useSkirmish.getState().queueMove('pr', 0, 5);
    expect(useSkirmish.getState().premoves).toHaveLength(1);
    useSkirmish.getState().clearPremoves();
    expect(useSkirmish.getState().premoves).toEqual([]);
  });

  it('test board: a min CPU-delay floor holds the reply until the floor elapses', () => {
    loadBoard([piece('pr', 'player', 'rook', 0, 0), piece('pk', 'player', 'king', 0, 7), piece('ek', 'enemy', 'king', 7, 7)], 'pk');
    useSkirmish.getState().setTestMode(true);
    useSkirmish.getState().setTestMinCpuDelay(3000); // floor well past the 520ms default
    useSkirmish.getState().tryMoveTo(1, 7);
    expect(useSkirmish.getState().game.turn).toBe('enemy');
    vi.advanceTimersByTime(2999);
    expect(useSkirmish.getState().game.turn).toBe('enemy'); // still thinking — floored to 3s
    vi.advanceTimersByTime(2); // cross 3000ms
    expect(useSkirmish.getState().game.turn).toBe('player'); // reply resolves once the floor elapses
  });

  it('the CPU-delay floor is test-only and clears on leaving test mode (real play never floored)', () => {
    loadBoard([piece('pr', 'player', 'rook', 0, 0), piece('ek', 'enemy', 'king', 7, 7)], 'pr');
    // Outside test mode the setter is a no-op — real/campaign play can never be floored.
    useSkirmish.getState().setTestMinCpuDelay(3000);
    expect(useSkirmish.getState().testMinCpuDelayMs).toBe(0);
    // In test mode it takes; leaving test mode resets it so it can't leak into real play.
    useSkirmish.getState().setTestMode(true);
    useSkirmish.getState().setTestMinCpuDelay(3000);
    expect(useSkirmish.getState().testMinCpuDelayMs).toBe(3000);
    useSkirmish.getState().setTestMode(false);
    expect(useSkirmish.getState().testMinCpuDelayMs).toBe(0);
  });
});

describe('skirmish store: multiplayer session parity', () => {
  it.each([
    ['player', 'Victory — The opposing force was eliminated.', 'The opposing force was eliminated'],
    ['enemy', 'Defeat — Your force was eliminated.', 'Your force was eliminated'],
  ] as const)('settles an already-terminal initial board from the %s seat', (localSide, copy, detail) => {
    const level = createBlankLevel('terminal-net', 'Terminal Net', 8, 8);
    level.objective = 'capture-all';
    level.layers.units = [{ side: 'player', type: 'king', x: 0, y: 7 }];

    useSkirmish.getState().newNetMatch({ lobbyId: 'L1', localSide, level, seed: 7 });

    const state = useSkirmish.getState();
    expect(state.game).toMatchObject({ winner: 'player', turn: 'done' });
    expect(state.log[0]).toBe(copy);
    expect(state.resultDetail).toBe(detail);
    expect(state.net?.terminalResult).toEqual({ expectedMoveCount: 0, winner: 'player', reason: 'victory-rule' });
  });

  it('cancels a staged solo reply when a lobby match replaces the session', () => {
    useSkirmish.getState().newSkirmish({ seed: 5, timeControl: null });
    const solo = useSkirmish.getState();
    const mover = livingPieces(solo.game.pieces, 'player')
      .find((candidate) => legalMoves(candidate, solo.game.pieces, solo.game.size, solo.env).length > 0);
    expect(mover).toBeTruthy();
    useSkirmish.getState().select(mover!.id);
    useSkirmish.getState().setTestMode(true);
    useSkirmish.getState().setTestMinCpuDelay(3000);
    const move = useSkirmish.getState().movesForSelected()[0];
    useSkirmish.getState().tryMoveTo(move.x, move.y);
    expect(useSkirmish.getState().game.turn).toBe('enemy');
    const oldEpoch = useSkirmish.getState().sessionEpoch;

    useSkirmish.setState({ premoves: [{ pieceId: mover!.id, x: move.x, y: move.y }], premoveInputOpen: true });
    useSkirmish.getState().newNetMatch({ lobbyId: 'L1', localSide: 'player', level: playableNetLevel(), seed: 7 });
    const netGame = useSkirmish.getState().game;
    const netEpoch = useSkirmish.getState().sessionEpoch;
    expect(netEpoch).toBeGreaterThan(oldEpoch);
    expect(useSkirmish.getState()).toMatchObject({
      premoves: [], premoveInputOpen: false, testMode: false, testMinCpuDelayMs: 0, clock: null,
    });

    vi.advanceTimersByTime(5000);
    expect(useSkirmish.getState().game).toBe(netGame);
    expect(useSkirmish.getState().sessionEpoch).toBe(netEpoch);
    expect(useSkirmish.getState().net?.moveCount).toBe(0);
  });

  it('allows only one pending intent, restores it after rejection, and clears it on the matching echo', () => {
    const sent: Array<{
      pieceId: string;
      move: { x: number; y: number; promotion?: 'queen' | 'rook' | 'bishop' | 'knight' };
      expected: number;
      intentId: string;
    }> = [];
    setNetMoveSink((pieceId, move, expected, intentId) => { sent.push({ pieceId, move, expected, intentId }); });
    useSkirmish.getState().newNetMatch({ lobbyId: 'L1', localSide: 'player', level: playableNetLevel(), seed: 7 });
    const before = useSkirmish.getState();
    const selected = before.selectedId!;
    const move = before.movesForSelected()[0];
    expect(move).toBeTruthy();

    before.tryMoveTo(move.x, move.y);
    useSkirmish.getState().tryMoveTo(move.x, move.y);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ pieceId: selected, expected: 0, move: { x: move.x, y: move.y } });
    expect(sent[0].intentId).toMatch(/^[-\w]+$/);
    expect(useSkirmish.getState().net?.pendingMove?.intentId).toBe(sent[0].intentId);
    expect(useSkirmish.getState().game).toBe(before.game); // server echo owns the apply
    expect(useSkirmish.getState().selectedId).toBe(selected);
    expect(useSkirmish.getState().net?.pendingMove?.expectedMoveCount).toBe(0);
    expect(useSkirmish.getState().net?.pendingMove?.uncertain).toBe(false);

    useSkirmish.getState().rejectNetMove(1); // stale recovery cannot unlock a newer intent
    expect(useSkirmish.getState().net?.pendingMove).not.toBeNull();
    useSkirmish.getState().markNetMoveUncertain(1); // stale failure cannot mark it either
    expect(useSkirmish.getState().net?.pendingMove?.uncertain).toBe(false);
    useSkirmish.getState().markNetMoveUncertain(0);
    expect(useSkirmish.getState().net?.pendingMove?.uncertain).toBe(true);
    useSkirmish.getState().rejectNetMove(0);
    expect(useSkirmish.getState().net?.pendingMove).toBeNull();
    expect(useSkirmish.getState().selectedId).toBe(selected);
    expect(useSkirmish.getState().movesForSelected().length).toBeGreaterThan(0);

    useSkirmish.getState().tryMoveTo(move.x, move.y);
    expect(sent).toHaveLength(2);
    expect(sent[1].intentId).not.toBe(sent[0].intentId);
    useSkirmish.getState().applyRemoteMove(sent[1].pieceId, sent[1].move, sent[1].intentId);
    expect(useSkirmish.getState().net).toMatchObject({ moveCount: 1, pendingMove: null });
    expect(useSkirmish.getState().selectedId).toBe(selected);

    // Choosing another owned piece during the opponent turn survives their relay too.
    const localRook = useSkirmish.getState().game.pieces.find((candidate) => candidate.side === 'player' && candidate.type === 'rook')!;
    useSkirmish.getState().select(localRook.id);
    const current = useSkirmish.getState();
    const opponent = livingPieces(current.game.pieces, 'enemy')
      .find((candidate) => legalMoves(candidate, current.game.pieces, current.game.size, current.env).some((candidateMove) => !candidateMove.capture))!;
    const opponentMove = legalMoves(opponent, current.game.pieces, current.game.size, current.env).find((candidateMove) => !candidateMove.capture)!;
    useSkirmish.getState().applyRemoteMove(opponent.id, opponentMove);
    expect(useSkirmish.getState().selectedId).toBe(localRook.id);
    expect(useSkirmish.getState().focusedId).toBe(localRook.id);
  });

  it('restores one durable relay identity after reload and clears it on authoritative echo', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      removeItem: (key: string) => { values.delete(key); },
      setItem: (key: string, value: string) => { values.set(key, value); },
    } satisfies Storage);

    const level = playableNetLevel();
    useSkirmish.getState().newNetMatch({ lobbyId: 'reload-lobby', localSide: 'player', level, seed: 7 });
    const beforeReload = useSkirmish.getState();
    const pieceId = beforeReload.selectedId!;
    const legal = beforeReload.movesForSelected()[0];
    const move = { x: legal.x, y: legal.y };
    persistNetIntent({
      lobbyId: 'reload-lobby',
      localSide: 'player',
      intentId: 'stable-across-reload',
      expectedMoveCount: 0,
      pieceId,
      move,
      createdAt: Date.now(),
    });

    useSkirmish.getState().newNetMatch({ lobbyId: 'reload-lobby', localSide: 'player', level, seed: 7 });
    expect(useSkirmish.getState().net?.pendingMove).toMatchObject({
      intentId: 'stable-across-reload', expectedMoveCount: 0, uncertain: true,
    });
    useSkirmish.getState().applyRemoteMove(pieceId, move, 'stable-across-reload');
    expect(useSkirmish.getState().net).toMatchObject({ moveCount: 1, pendingMove: null });
    expect(loadPersistedNetIntent('reload-lobby', 'player')).toBeNull();
  });

  it('fails closed instead of sending an unjournaled multiplayer move', () => {
    vi.stubGlobal('localStorage', {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => { throw new DOMException('storage denied', 'QuotaExceededError'); },
    } satisfies Storage);
    const sent = vi.fn();
    setNetMoveSink(sent);
    useSkirmish.getState().newNetMatch({ lobbyId: 'no-storage', localSide: 'player', level: playableNetLevel(), seed: 7 });
    const before = useSkirmish.getState();
    const move = before.movesForSelected()[0];
    before.tryMoveTo(move.x, move.y);

    expect(sent).not.toHaveBeenCalled();
    expect(useSkirmish.getState().net?.pendingMove).toBeNull();
    expect(useSkirmish.getState().game).toBe(before.game);
    expect(useSkirmish.getState().log[0]).toContain('browser storage is unavailable');
  });

  it('drains an enemy-seat promotion premove with the chosen promotion through the relay', () => {
    const sent: Array<{ pieceId: string; move: { x: number; y: number; promotion?: 'queen' | 'rook' | 'bishop' | 'knight' }; expected: number }> = [];
    setNetMoveSink((pieceId, move, expected) => { sent.push({ pieceId, move, expected }); });
    useSkirmish.getState().newNetMatch({ lobbyId: 'L1', localSide: 'enemy', level: playableNetLevel(), seed: 7 });
    const game: GameState = {
      size: { cols: 8, rows: 8 },
      pieces: [
        piece('pk', 'player', 'king', 0, 0),
        piece('pr', 'player', 'rook', 1, 0),
        piece('ep', 'enemy', 'pawn', 4, 6),
        piece('ek', 'enemy', 'king', 7, 7),
      ],
      promotionRules: [{ side: 'enemy', cells: [{ x: 4, y: 7 }], choices: ['queen', 'knight'] }],
      turn: 'player',
      winner: null,
    };
    useSkirmish.setState({
      game,
      env: { terrain: undefined, lastMove: undefined },
      objective: 'capture-all',
      objectiveCtx: {},
      selectedId: 'ep',
      focusedId: 'ep',
      premoves: [],
      premoveInputOpen: false,
    });

    useSkirmish.getState().queueMove('ep', 4, 7);
    expect(useSkirmish.getState().pendingPromotion).toMatchObject({ mode: 'premove', pieceId: 'ep' });
    useSkirmish.getState().choosePromotion('knight');
    expect(useSkirmish.getState().premoves).toEqual([{ pieceId: 'ep', x: 4, y: 7, promotion: 'knight' }]);

    useSkirmish.getState().applyRemoteMove('pk', { x: 0, y: 1 });
    expect(useSkirmish.getState().net?.moveCount).toBe(1);
    vi.advanceTimersByTime(621);
    expect(sent).toEqual([{ pieceId: 'ep', move: { x: 4, y: 7, promotion: 'knight' }, expected: 1 }]);
    expect(useSkirmish.getState().game.pieces.find((candidate) => candidate.id === 'ep')).toMatchObject({ type: 'pawn', x: 4, y: 6 });
    expect(useSkirmish.getState().net?.pendingMove?.expectedMoveCount).toBe(1);

    useSkirmish.getState().applyRemoteMove('ep', sent[0].move);
    expect(useSkirmish.getState().game.pieces.find((candidate) => candidate.id === 'ep')).toMatchObject({ type: 'knight', x: 4, y: 7 });
    expect(useSkirmish.getState().net).toMatchObject({ moveCount: 2, pendingMove: null });
  });

  it('retains a move-derived terminal result at its exact authoritative relay count', () => {
    useSkirmish.getState().newNetMatch({ lobbyId: 'L1', localSide: 'enemy', level: playableNetLevel(), seed: 7 });
    useSkirmish.setState({
      game: {
        size: { cols: 8, rows: 8 },
        pieces: [piece('pr', 'player', 'rook', 0, 0), piece('pk', 'player', 'king', 7, 7), piece('ek', 'enemy', 'king', 0, 5)],
        turn: 'player',
        winner: null,
      },
      env: { terrain: undefined, lastMove: undefined },
      objective: 'capture-king',
      objectiveCtx: { kingSide: 'enemy' },
      victoryOverride: null,
      selectedId: null,
      focusedId: null,
    });

    useSkirmish.getState().applyRemoteMove('pr', { x: 0, y: 5 });

    const state = useSkirmish.getState();
    expect(state.game).toMatchObject({ winner: 'player', turn: 'done' });
    expect(state.net?.terminalResult).toEqual({ expectedMoveCount: 1, winner: 'player', reason: 'victory-rule' });
    expect(state.log[0]).toBe('Defeat — Your King was captured.');
  });

  it('invalidates and clears all lobby-owned local state when its route is left', () => {
    useSkirmish.getState().newNetMatch({ lobbyId: 'L1', localSide: 'enemy', level: playableNetLevel(), seed: 7 });
    const beforeEpoch = useSkirmish.getState().sessionEpoch;
    useSkirmish.setState({
      premoves: [{ pieceId: 'queued', x: 1, y: 2 }],
      premoveInputOpen: true,
      testMode: true,
      testMinCpuDelayMs: 1234,
    });

    useSkirmish.getState().leaveNetSession('some-other-lobby');
    expect(useSkirmish.getState().net?.lobbyId).toBe('L1');
    useSkirmish.getState().leaveNetSession('L1');

    expect(useSkirmish.getState()).toMatchObject({
      started: false,
      levelId: null,
      victoryOverride: null,
      resultDetail: null,
      turnsElapsed: 0,
      net: null,
      selectedId: null,
      focusedId: null,
      pendingPromotion: null,
      premoves: [],
      premoveInputOpen: false,
      testMode: false,
      testMinCpuDelayMs: 0,
      clock: null,
    });
    expect(useSkirmish.getState().sessionEpoch).toBeGreaterThan(beforeEpoch);
  });
});

describe('local resign', () => {
  it('ends a single-player board immediately as a defeat', () => {
    useSkirmish.getState().newSkirmish({ seed: 5 });
    useSkirmish.getState().resignLocal();

    const s = useSkirmish.getState();
    expect(s.game.winner).toBe('enemy');
    expect(s.game.turn).toBe('done');
    expect(s.selectedId).toBeNull();
    expect(s.focusedId).toBeNull();
    expect(s.clock?.running).toBe(false);
    expect(s.log[0]).toMatch(/you resigned/i);
  });

  it('does not decide a netplay match locally', () => {
    useSkirmish.getState().newNetMatch({ lobbyId: 'L1', localSide: 'player', level: playableNetLevel(), seed: 7 });
    useSkirmish.getState().resignLocal();

    expect(useSkirmish.getState().game.winner).toBeNull();
  });
});

describe('netplay resign', () => {
  const netMatch = (localSide: PlayingSide) =>
    useSkirmish.getState().newNetMatch({ lobbyId: 'L1', localSide, level: playableNetLevel(), seed: 7 });

  afterEach(() => setNetResignSink(null));

  it('relays a resignation via the sink but does NOT decide the game locally (server-sequenced)', () => {
    netMatch('player');
    let relayed = 0;
    setNetResignSink(() => { relayed += 1; });
    useSkirmish.getState().resign();
    expect(relayed).toBe(1);
    // The winner is set only when the server's result echoes back (concludeNet) — never optimistically.
    expect(useSkirmish.getState().game.winner).toBeNull();
  });

  it('resign is a no-op in single-player and once the game is decided', () => {
    let relayed = 0;
    setNetResignSink(() => { relayed += 1; });
    // Single-player: no net context, so nothing is relayed.
    useSkirmish.getState().newSkirmish({ seed: 5 });
    useSkirmish.getState().resign();
    expect(relayed).toBe(0);
    // Netplay but already decided: a second resign can't re-fire.
    netMatch('player');
    useSkirmish.getState().concludeNet('enemy', 'resign');
    useSkirmish.getState().resign();
    expect(relayed).toBe(0);
  });

  it('concludeNet ends the match as a win for the non-resigning seat and is idempotent', () => {
    // Host seat ('player'); the opponent ('enemy') resigned → we win.
    netMatch('player');
    useSkirmish.getState().concludeNet('player', 'resign');
    const s = useSkirmish.getState();
    expect(s.game.winner).toBe('player');
    expect(s.game.turn).toBe('done');
    expect(s.selectedId).toBeNull();
    expect(s.log[0]).toMatch(/opponent resigned/i);
    // A redelivered result frame must not overwrite the decided game.
    useSkirmish.getState().concludeNet('enemy', 'resign');
    expect(useSkirmish.getState().game.winner).toBe('player');
  });

  it('concludeNet frames the loss from the resigning seat', () => {
    // Guest seat ('enemy') that resigned → winner is 'player' (not our side) = defeat copy.
    netMatch('enemy');
    useSkirmish.getState().concludeNet('player', 'resign');
    const s = useSkirmish.getState();
    expect(s.game.winner).toBe('player');
    expect(s.log[0]).toMatch(/you resigned/i);
  });

  it('lets the first authoritative resignation resolve a different local disputed verdict', () => {
    netMatch('player');
    useSkirmish.setState((state) => ({
      game: { ...state.game, winner: 'enemy', turn: 'done' },
      net: state.net ? {
        ...state.net,
        terminalResult: { expectedMoveCount: 0, winner: 'enemy', reason: 'victory-rule' },
      } : null,
    }));

    useSkirmish.getState().concludeNet('player', 'resign');
    const resolved = useSkirmish.getState();
    expect(resolved.game.winner).toBe('player');
    expect(resolved.net?.terminalResult).toBeNull();
    expect(resolved.net?.authoritativeResult).toEqual({ winner: 'player', reason: 'resign' });
    expect(resolved.log[0]).toMatch(/opponent resigned/i);
  });
});
