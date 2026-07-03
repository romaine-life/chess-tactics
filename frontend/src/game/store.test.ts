import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSkirmish, resolveIfPlayerStuck, playerHasLegalMove, shouldStartFreshSkirmish } from './store';
import { livingPieces } from '../core/rules';
import type { MoveEnv } from '../core/rules';
import type { GameState, Piece, PieceType, Side } from '../core/types';
import { createBlankLevel } from '../core/level';

// The enemy reply is staged on a timer (see ENEMY_REPLY_DELAY) so play reads as
// turn-taking rather than a simultaneous swap. Fake timers let us drive that
// reply deterministically and keep pending timeouts from leaking between tests.
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function playFirstMove(seed: number) {
  useSkirmish.getState().newSkirmish({ seed });
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
    useSkirmish.getState().newSkirmish({ seed: 5 });
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
});

function piece(id: string, side: Side, type: PieceType, x: number, y: number): Piece {
  return { id, side, type, x, y, alive: true, startY: y };
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
    expect(log[0]).toMatch(/King is captured/i);
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
    // The surviving enemy pawn matters: it keeps the core last-side-standing rule out
    // of the way so the RIVAL-KINGS objective (not a wipe) is what decides the game.
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
    expect(s.log[0]).toBe('Victory — the rival King is captured.');
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
    expect(s.log[0]).toBe('Defeat — your King has fallen.');
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

  it('reach: a PAWN stepping onto a target cell wins instantly (even as it promotes there)', () => {
    useSkirmish.setState({
      // Pawn one step from the target (0,0) is the enemy back rank, so it promotes on arrival —
      // reach still fires because lastMove records the pre-promotion type (ADR-0054).
      game: { size: { cols: 8, rows: 8 }, pieces: [piece('pp', 'player', 'pawn', 0, 1), piece('ek', 'enemy', 'king', 7, 7)], turn: 'player', winner: null },
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
    const { game } = useSkirmish.getState();
    expect(game.winner).toBe('player');
    expect(game.turn).toBe('done');
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

  it('stays untimed for a free skirmish and for a level without a time control', () => {
    useSkirmish.getState().newSkirmish({ seed: 5 });
    expect(clock()).toBeNull();
    useSkirmish.getState().newSkirmish({ seed: 5, level: timedLevel(60) });
    expect(clock()).not.toBeNull();
    // A new untimed game must clear the previous game's clock.
    useSkirmish.getState().newSkirmish({ seed: 6 });
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

    // The reply resolves (520ms beat) and the player's clock resumes.
    vi.advanceTimersByTime(200);
    expect(useSkirmish.getState().game.turn).toBe('player');
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

describe('soft-lock guard (no manual End Turn)', () => {
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
    expect(playerHasLegalMove(trapped, OPEN_ENV)).toBe(false);

    const res = resolveIfPlayerStuck(trapped, OPEN_ENV);
    expect(res.stuck).toBe(true);
    expect(res.game.winner).toBe('draw');
    expect(res.game.turn).toBe('done');
  });

  it('leaves a state untouched when the player can still move', () => {
    const free = stateOf([piece('p', 'player', 'pawn', 0, 2), piece('ek', 'enemy', 'king', 0, 0)], 1, 3);
    expect(playerHasLegalMove(free, OPEN_ENV)).toBe(true);

    const res = resolveIfPlayerStuck(free, OPEN_ENV);
    expect(res.stuck).toBe(false);
    expect(res.game).toBe(free); // unchanged reference
  });

  it('never fires off the player turn or after the game is decided', () => {
    const trapped = stateOf([piece('p', 'player', 'pawn', 0, 1), piece('ek', 'enemy', 'king', 0, 0)], 1, 2);
    expect(resolveIfPlayerStuck({ ...trapped, turn: 'enemy' }, OPEN_ENV).stuck).toBe(false);
    expect(resolveIfPlayerStuck({ ...trapped, winner: 'player', turn: 'done' }, OPEN_ENV).stuck).toBe(false);
  });
});
