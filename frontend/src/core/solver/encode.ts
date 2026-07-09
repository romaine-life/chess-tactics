// Board solver — position encoding, enumeration, and decode (ADR-0069 Phase 1, the crux).
//
// The piece set is FIXED: a board only ever loses pieces or promotes a pawn (→ queen);
// no piece is ever added. So a position is fully described by, per slot, either DEAD or
// (occupied-cell-index + promoted flag), plus one side-to-move bit, plus `turnsElapsed`
// (ONLY when input.clockMatters — §position key contract clause 3).
//
// CANONICALIZATION (soundness — §position key contract clause 2): two positions the
// solver may treat as game-theoretically equal MUST produce the same key. Same-side,
// same-EFFECTIVE-type pieces are interchangeable, so the key encodes, per (side, type)
// class, the SORTED SET of occupied cells — not a slot-indexed vector. Two identical
// pawns swapping squares therefore yield ONE key. A slot-identity key would be
// order-dependent, inflate the space, and defeat Phase-4 cycle detection.
//
// The canonical key is a mixed-radix bigint (fast map lookups); the contract wire type
// `PositionKey` is its stringification. The retrograde hot loop runs on dense `number`
// ordinals (PositionSpace.index), touching bigint only at encode/decode.

import type { GameState, Piece, PieceType, Side } from '../types';
import type { MoveEnv } from '../rules';
import type { SolverInput } from './input';
import { applyMove, legalMoves, livingPieces } from '../rules';
import { terminalOutcome } from './input';

/** A slot's live description in a position: dead, or a cell-index (into passableCells)
 * plus whether a promotable pawn has become a queen. */
export interface SolverPosition {
  /** Per slot: passable-cell index (0..C-1), or -1 if dead. */
  cell: Int16Array;
  /** Per slot: 1 if a promotable pawn is currently a queen, else 0. */
  promoted: Uint8Array;
  turn: Side;
  /** Folded into the key only when input.clockMatters. */
  turnsElapsed: number;
}

/** A dense ordinal index over enumerated positions. `keys` maps ordinal → canonical
 * bigint key; `index` maps key → ordinal. `truncated` flags an enumeration cap hit. */
export interface PositionSpace {
  input: SolverInput;
  index: Map<bigint, number>;
  keys: bigint[];
  truncated: boolean;
}

const TURN_RADIX = 2n;
const turnBit = (turn: Side): bigint => (turn === 'enemy' ? 1n : 0n);

const CLASS_TYPE_ORDER: PieceType[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
const CLASS_SIDE_ORDER: Side[] = ['player', 'enemy'];

type Slot = SolverInput['slots'][number];

function effectiveType(slot: Slot, promoted: boolean): PieceType {
  return slot.canPromote && promoted ? 'queen' : slot.origType;
}

/**
 * The interchangeability discriminator that separates NON-fungible same-type pawns (§position key
 * contract clause 2 / Risk 6). Two pawns are fungible (may swap squares under ONE key) only when
 * their whole move graph is identical forever, which needs the SAME `pawnForward` (movement +
 * capture geometry) AND the SAME start-eligibility (`onPawnStart` compares the pawn's square to its
 * OWN startX/startY — rules.ts:126 — so pawns with different starts differ in double-step
 * availability at the same cell). Non-pawns (and a promoted pawn now a queen) are fully fungible ⇒
 * empty discriminator. Keying pawns without this merged two DIFFERENT move graphs to one key
 * (corrupting decode∘encode and proving a wrong value).
 */
function pawnDisc(slot: Slot, type: PieceType): string {
  if (type !== 'pawn') return '';
  const fwd = slot.pawnForward ?? '';
  const sx = slot.startX === undefined ? 'u' : String(slot.startX);
  return `${fwd}|${sx}|${slot.startY}`;
}

/** Full class key: side|effective-type|pawn-discriminator. Pawns split into sub-classes by
 * facing + start; every other type has an empty discriminator (all fungible). */
const classKeyOf = (side: Side, type: PieceType, disc: string): string => `${side}|${type}|${disc}`;

/** The class key for a slot in a given promotion state (queen when a promotable pawn is promoted). */
function slotClassKey(slot: Slot, promoted: boolean): string {
  const type = effectiveType(slot, promoted);
  return classKeyOf(slot.side, type, pawnDisc(slot, type));
}

/** For each class (side, effective-type, pawn-disc), the sorted ascending occupied cell-indices.
 * The order-independent core of the key: genuinely-interchangeable pieces are a SET, not a vector. */
function occupancyOf(pos: SolverPosition, input: SolverInput): Map<string, number[]> {
  const classes = new Map<string, number[]>();
  for (const slot of input.slots) {
    const cell = pos.cell[slot.index];
    if (cell < 0) continue; // dead
    const k = slotClassKey(slot, pos.promoted[slot.index] === 1);
    const list = classes.get(k);
    if (list) list.push(cell);
    else classes.set(k, [cell]);
  }
  for (const list of classes.values()) list.sort((a, b) => a - b);
  return classes;
}

interface ClassDesc {
  side: Side;
  type: PieceType;
  disc: string;
  key: string;
}

interface KeyLayout {
  /** Ordered classes present for THIS board (deterministic). */
  order: ClassDesc[];
  /** Per class key: capacity (max simultaneous pieces = digits encoded). A pawn slot contributes
   * capacity to BOTH its (discriminated) pawn class and the fungible queen class (it can promote). */
  capacity: Map<string, number>;
  cellCount: number;
  /** Clock digit radix (>=1). 1 means no clock digit. */
  clockRadix: bigint;
}

function computeLayout(input: SolverInput): KeyLayout {
  const cellCount = input.passableCells.length;
  const capacity = new Map<string, number>();
  const descByKey = new Map<string, ClassDesc>();
  const bump = (side: Side, type: PieceType, disc: string): void => {
    const key = classKeyOf(side, type, disc);
    capacity.set(key, (capacity.get(key) ?? 0) + 1);
    if (!descByKey.has(key)) descByKey.set(key, { side, type, disc, key });
  };
  for (const slot of input.slots) {
    if (slot.canPromote) {
      bump(slot.side, 'pawn', pawnDisc(slot, 'pawn'));
      bump(slot.side, 'queen', ''); // a promoted pawn joins the fungible queen class
    } else {
      bump(slot.side, slot.origType, pawnDisc(slot, slot.origType));
    }
  }
  // Deterministic order: side, then type, then discriminator string. The disc-sort keeps two
  // pawn sub-classes in a stable, run-independent slot layout.
  const order: ClassDesc[] = Array.from(descByKey.values()).sort((a, b) => {
    const sa = CLASS_SIDE_ORDER.indexOf(a.side); const sb = CLASS_SIDE_ORDER.indexOf(b.side);
    if (sa !== sb) return sa - sb;
    const ta = CLASS_TYPE_ORDER.indexOf(a.type); const tb = CLASS_TYPE_ORDER.indexOf(b.type);
    if (ta !== tb) return ta - tb;
    return a.disc < b.disc ? -1 : a.disc > b.disc ? 1 : 0;
  });
  // The clock digit radix is the number of distinct turnsElapsed values, precomputed on the
  // input as the max over surviveTurns AND every authored turnLimit condition (+1). Deriving it
  // from surviveTurns alone here would clamp distinct clocks to one key (false proof).
  const clockCeil = input.clockMatters ? input.clockCeil : 1;
  return { order, capacity, cellCount, clockRadix: BigInt(clockCeil) };
}

const LAYOUT_CACHE = new WeakMap<SolverInput, KeyLayout>();
function layoutFor(input: SolverInput): KeyLayout {
  let cached = LAYOUT_CACHE.get(input);
  if (!cached) { cached = computeLayout(input); LAYOUT_CACHE.set(input, cached); }
  return cached;
}

const CELL_INDEX_CACHE = new WeakMap<SolverInput, Map<string, number>>();
function cellIndexOf(input: SolverInput, x: number, y: number): number {
  let map = CELL_INDEX_CACHE.get(input);
  if (!map) {
    map = new Map<string, number>();
    input.passableCells.forEach((c, i) => map!.set(`${c.x},${c.y}`, i));
    CELL_INDEX_CACHE.set(input, map);
  }
  return map.get(`${x},${y}`) ?? -1;
}

/** Pack a canonical occupancy + turn (+ clock) into the mixed-radix bigint key. Each class
 * emits exactly `capacity` ascending digits in radix (cellCount+1): its sorted occupied
 * cells as (cellIndex+1), padded with 0 (absent). Then the turn digit, then (if it matters)
 * the clock digit at the top. */
function packKey(occ: Map<string, number[]>, turn: Side, turnsElapsed: number, layout: KeyLayout, clockMatters: boolean): bigint {
  const cellRadix = BigInt(layout.cellCount + 1);
  let key = 0n;
  for (const cls of layout.order) {
    const cap = layout.capacity.get(cls.key) ?? 0;
    const cells = occ.get(cls.key) ?? [];
    for (let i = 0; i < cap; i += 1) {
      const digit = i < cells.length ? BigInt(cells[i] + 1) : 0n;
      key = key * cellRadix + digit;
    }
  }
  key = key * TURN_RADIX + turnBit(turn);
  if (clockMatters) {
    const ceil = Number(layout.clockRadix);
    // With the radix computed from the true terminal clock (max over surviveTurns + every
    // authored turnLimit, +1) a real clock NEVER exceeds ceil-1 for any enumerated position, so
    // a clamp here would be a soundness bug (two distinct clocks colliding to one key). Fail loud
    // rather than silently proving a wrong value.
    if (turnsElapsed < 0 || turnsElapsed >= ceil) {
      throw new Error(`solver: turnsElapsed ${turnsElapsed} out of clock radix [0,${ceil}) — clock-radix underflow`);
    }
    key = key * layout.clockRadix + BigInt(turnsElapsed);
  }
  return key;
}

export function encodePosition(pos: SolverPosition, input: SolverInput): bigint {
  return packKey(occupancyOf(pos, input), pos.turn, pos.turnsElapsed, layoutFor(input), input.clockMatters);
}

/** Build a SolverPosition from a real GameState (living player/enemy pieces mapped to slots
 * by id; obstacles ignored — they are invariant). */
export function positionFromState(state: GameState, input: SolverInput, turnsElapsed: number): SolverPosition {
  const n = input.slots.length;
  const cell = new Int16Array(n).fill(-1);
  const promoted = new Uint8Array(n);
  const slotById = new Map<string, number>();
  for (const slot of input.slots) slotById.set(slot.id, slot.index);
  for (const p of state.pieces) {
    if (!p.alive) continue;
    const idx = slotById.get(p.id);
    if (idx === undefined) continue; // obstacle or unknown
    cell[idx] = cellIndexOf(input, p.x, p.y);
    if (input.slots[idx].canPromote && p.type === 'queen') promoted[idx] = 1;
  }
  // Side-to-move. When `applyMove` ended the game it set `turn: 'done'` (a wipe leaves the
  // board with no live opponent). The solver stores that resulting position too, and its
  // NOMINAL side-to-move is the LOSER — the side whose turn it would be (the wiped/king-
  // captured side, i.e. the opponent of the winner). Encoding 'done' as the loser is what
  // makes the terminal read as a LOSS from the mover's view in the negamax back-up (a
  // king-capture terminal is a loss for the side whose king is gone), so the parent counts
  // the capturing move as a mate-in-1. Coercing 'done' → 'player' silently inflated DTM
  // whenever the shortest win was a direct king capture.
  let turn: Side;
  if (state.turn === 'enemy') turn = 'enemy';
  else if (state.turn === 'player') turn = 'player';
  else turn = state.winner === 'player' ? 'enemy' : 'player'; // 'done' ⇒ nominal mover = loser
  return { cell, promoted, turn, turnsElapsed };
}

/** GameState → canonical key (through the canonical occupancy, so it is order-independent). */
export function canonicalKey(state: GameState, input: SolverInput, turnsElapsed = 0): bigint {
  return encodePosition(positionFromState(state, input, turnsElapsed), input);
}

/** Read the survive/turnLimit clock back out of a canonical key (the lowest digit when
 * `clockMatters`; 0 otherwise). Lets a post-solve pass recompute a position's successor keys
 * (child clock = this + 1 on an enemy move — the shared bump rule) without re-tracking clocks. */
export function clockOfKey(key: bigint, input: SolverInput): number {
  if (!input.clockMatters) return 0;
  return Number(key % layoutFor(input).clockRadix);
}

/**
 * Rebuild a real GameState from a canonical key. The key drops slot identity within each
 * INTERCHANGEABLE class, so decode re-deals a class's sorted cells to that class's slots
 * deterministically (ascending slot index ← ascending cell) — game value is unaffected.
 *
 * Pawns are split into sub-classes by (facing, start) so NON-fungible pawns never merge (Risk 6).
 * Promotion crosses classes: a promoted pawn joins the fungible queen class and leaves its pawn
 * sub-class. Decode recovers WHICH pawns are promoted per sub-class from the counts: a pawn
 * sub-class D with S slots and C recorded cells has exactly S−C promoted slots, so the promotion
 * set is forced (not a free choice) — otherwise a queen-class cell could be assigned to a slot
 * whose pawn sub-class still owns a cell, stranding it. Reattaches invariant obstacles; NO
 * lastMove (F6).
 */
export function decodePosition(key: bigint, input: SolverInput): GameState {
  const layout = layoutFor(input);
  const cellRadix = BigInt(layout.cellCount + 1);
  let rest = key;
  if (input.clockMatters) rest = rest / layout.clockRadix; // clock is not needed to rebuild the board
  const turn: Side = rest % TURN_RADIX === 1n ? 'enemy' : 'player';
  rest = rest / TURN_RADIX;

  // Unfold class digits in REVERSE order; within a class the digits pop top-first, so sort
  // ascending to recover the canonical cell list. Keyed by the FULL class key (incl. pawn disc).
  const classCells = new Map<string, number[]>();
  for (let ci = layout.order.length - 1; ci >= 0; ci -= 1) {
    const cls = layout.order[ci];
    const cap = layout.capacity.get(cls.key) ?? 0;
    const digits: number[] = [];
    for (let i = 0; i < cap; i += 1) {
      const d = Number(rest % cellRadix);
      rest = rest / cellRadix;
      if (d > 0) digits.push(d - 1);
    }
    digits.sort((a, b) => a - b);
    classCells.set(cls.key, digits);
  }

  const pieces: Piece[] = [];
  const emit = (slot: Slot, cellIndex: number, promoted: boolean): void => {
    const c = input.passableCells[cellIndex];
    const type: PieceType = slot.canPromote && promoted ? 'queen' : slot.origType;
    const piece: Piece = { id: slot.id, side: slot.side, type, x: c.x, y: c.y, alive: true, startY: slot.startY };
    if (slot.startX !== undefined) piece.startX = slot.startX;
    if (slot.facing) piece.facing = slot.facing;
    if (slot.pawnForward) piece.pawnForward = slot.pawnForward;
    pieces.push(piece);
  };

  for (const side of CLASS_SIDE_ORDER) {
    // Promoted-pending pawn slots collected per sub-class, then fed into the queen class.
    const promotedPending: Slot[] = [];

    // Pawn sub-classes (one per discriminator). The number promoted in sub-class D is forced =
    // (#D slots) − (#D pawn cells); the first cells go to the lowest-index slots as pawns, the
    // remaining slots are promoted and draw a queen cell below.
    const pawnDiscs = new Set<string>();
    for (const slot of input.slots) {
      if (slot.side === side && slot.canPromote) pawnDiscs.add(pawnDisc(slot, 'pawn'));
    }
    for (const disc of pawnDiscs) {
      const dSlots = input.slots
        .filter((s) => s.side === side && s.canPromote && pawnDisc(s, 'pawn') === disc)
        .sort((a, b) => a.index - b.index);
      const cells = classCells.get(classKeyOf(side, 'pawn', disc)) ?? [];
      for (let i = 0; i < dSlots.length; i += 1) {
        if (i < cells.length) emit(dSlots[i], cells[i], false); // an unpromoted pawn
        else promotedPending.push(dSlots[i]);                   // promoted ⇒ queen cell below
      }
    }

    // Queen class: original (non-promotable) queen slots first, then the promoted pawns —
    // both ascending by index for a deterministic, round-trip-stable layout.
    const queenCells = classCells.get(classKeyOf(side, 'queen', '')) ?? [];
    const origQueenSlots = input.slots
      .filter((s) => s.side === side && !s.canPromote && s.origType === 'queen')
      .sort((a, b) => a.index - b.index);
    promotedPending.sort((a, b) => a.index - b.index);
    const queenSlots = [...origQueenSlots, ...promotedPending];
    for (let i = 0; i < queenSlots.length && i < queenCells.length; i += 1) {
      emit(queenSlots[i], queenCells[i], queenSlots[i].canPromote);
    }

    // Remaining fixed classes (king/rook/bishop/knight).
    for (const type of CLASS_TYPE_ORDER) {
      if (type === 'pawn' || type === 'queen') continue;
      const slotsArr = input.slots
        .filter((s) => s.side === side && !s.canPromote && s.origType === type)
        .sort((a, b) => a.index - b.index);
      if (!slotsArr.length) continue;
      const cells = classCells.get(classKeyOf(side, type, '')) ?? [];
      for (let i = 0; i < slotsArr.length && i < cells.length; i += 1) emit(slotsArr[i], cells[i], false);
    }
  }

  for (const o of input.obstacles) pieces.push({ ...o });

  return {
    size: { cols: input.start.size.cols, rows: input.start.size.rows },
    pieces,
    terrain: input.start.terrain,
    fences: input.start.fences,
    turn,
    winner: null,
  };
}

/**
 * Forward closure from the start position. Pops the frontier, decodes, and — unless the
 * position is terminal — expands every legal move for the side to move, assigning fresh
 * ordinals to unseen canonical keys. `turnsElapsed` is tracked alongside the key (folded
 * into the key only when clockMatters). The node set is finite even though play can loop:
 * only UNSEEN canonical keys are enqueued. `cap` bounds enumeration; `truncated` marks overflow.
 */
export function enumerateReachable(input: SolverInput, cap: number): PositionSpace {
  const index = new Map<bigint, number>();
  const keys: bigint[] = [];
  const clockOf: number[] = [];
  const startKey = canonicalKey(input.start, input, 0);
  index.set(startKey, 0);
  keys.push(startKey);
  clockOf.push(0);
  let truncated = false;

  const env: MoveEnv = input.env; // no lastMove (F6)
  const queue: number[] = [0];
  let head = 0;

  while (head < queue.length) {
    const ordinal = queue[head];
    head += 1;
    const state = decodePosition(keys[ordinal], input);
    const turnsElapsed = input.clockMatters ? clockOf[ordinal] : 0;

    // Terminal positions are leaves: never expanded.
    if (terminalOutcome(state, input, turnsElapsed) !== null) continue;

    const side: Side = state.turn === 'enemy' ? 'enemy' : 'player';
    const movers = livingPieces(state.pieces, side);
    for (const p of movers) {
      const moves = legalMoves(p, state.pieces, state.size, env);
      for (const m of moves) {
        const { state: next } = applyMove(state, p.id, m);
        // The survive/turnLimit clock advances on the ENEMY→player transition (a round elapses),
        // matching the store (store.ts:462/615). Bumping on player→enemy would fire the terminal
        // clock win one enemy ply early (the enemy's capturing reply would be pruned).
        const childClock = input.clockMatters ? turnsElapsed + (side === 'enemy' ? 1 : 0) : 0;
        const childKey = canonicalKey(next, input, childClock);
        if (!index.has(childKey)) {
          if (keys.length >= cap) { truncated = true; break; }
          const nextOrdinal = keys.length;
          index.set(childKey, nextOrdinal);
          keys.push(childKey);
          clockOf.push(childClock);
          queue.push(nextOrdinal);
        }
      }
      if (truncated) break;
    }
    if (truncated) break;
  }

  return { input, index, keys, truncated };
}
