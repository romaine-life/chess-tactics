// The rules engine: pure functions over game state. Ported faithfully from the
// legacy app.js implementation (pawn/knight/bishop/queen movement, rocks as
// obstacles, side-based pawns, threat = enemy attacked squares, capture/promote/
// last-side-standing) — but deterministic and immutable.

import type { BoardSize, EnemyIntent, GameEvent, GameState, LastMove, Move, Piece, PieceType, Side, UnitFacing, Vec, Winner } from './types';
import type { Rng } from './rng';
import { buildTerrainIndex, canTraverse, elevationAt, haltsTravel, type TerrainIndex } from './terrain';
import { facingFromDelta } from './pieces';
import { fenceBlocksCrossing } from './featureAutotile';

const KNIGHT: ReadonlyArray<readonly [number, number]> = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1],
];
const DIAG: ReadonlyArray<readonly [number, number]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHO: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ALL8: ReadonlyArray<readonly [number, number]> = [...ORTHO, ...DIAG];
const COMPASS: readonly UnitFacing[] = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const FACING_VECTOR: Record<UnitFacing, readonly [number, number]> = {
  north: [0, -1],
  'north-east': [1, -1],
  east: [1, 0],
  'south-east': [1, 1],
  south: [0, 1],
  'south-west': [-1, 1],
  west: [-1, 0],
  'north-west': [-1, -1],
};

const isObstacle = (p: Piece): boolean => p.type === 'rock' || p.type === 'random-rock';

/** Relative worth, used to rank enemy targets when forecasting intents. */
const PIECE_VALUE: Record<PieceType, number> = {
  pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100, rock: 0, 'random-rock': 0,
};

const manhattan = (a: Vec, b: Vec): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function inBounds(x: number, y: number, size: BoardSize): boolean {
  return x >= 0 && x < size.cols && y >= 0 && y < size.rows;
}

export function pieceAt(pieces: readonly Piece[], x: number, y: number): Piece | null {
  return pieces.find((p) => p.alive && p.x === x && p.y === y) ?? null;
}

export function livingPieces(pieces: readonly Piece[], side: Side): Piece[] {
  return pieces.filter((p) => p.side === side && p.alive);
}

/** A target is capturable iff it's a non-obstacle, non-neutral opposing piece. */
export function isEnemy(piece: Piece, target: Piece | null): boolean {
  if (!target) return false;
  if (target.type === 'rock' || target.side === 'neutral') return false;
  return target.side !== piece.side;
}

/**
 * Optional movement environment. When `terrain` is supplied, impassable tiles
 * (cliff/rock) and un-climbable elevation rises block movement — a terrain
 * wall stops a ray and removes a step. Omitting it reproduces pure chess
 * movement, so every existing caller is unaffected.
 */
export interface MoveEnv {
  terrain?: TerrainIndex;
  /**
   * Edge fences as canonical edge keys (roadEdgeKey "x,y|x,y"). A move that CROSSES a fenced edge
   * is forbidden. Only an orthogonal step crosses an edge, so a knight (never orthogonally
   * adjacent) and a diagonal slide/step pass a lone fence freely — the "knights hop" rule, like
   * water. Omit for no fences.
   */
  fences?: ReadonlySet<string>;
  lastMove?: LastMove;
}

/** Whether terrain in `env` forbids moving into (x, y) from `originElev`. */
function blockedByTerrain(env: MoveEnv | undefined, originElev: number, x: number, y: number): boolean {
  return !!env?.terrain && !canTraverse(env.terrain, originElev, x, y);
}

/** Whether a fence in `env` blocks the orthogonal crossing (ax,ay)→(bx,by). No-op off-fence/diagonal. */
function fenceBlocks(env: MoveEnv | undefined, ax: number, ay: number, bx: number, by: number): boolean {
  return fenceBlocksCrossing(env?.fences, ax, ay, bx, by);
}

/**
 * The STATIC movement environment for a game state — its indexed terrain layer + edge-fence set.
 * Neither changes across a game's plies (only `lastMove` does), so callers build this ONCE and
 * spread it per ply as `{ ...gameEnv(state), lastMove }`. Centralised so EVERY consumer (the store,
 * self-play, the opening book, applyMove's stat pass, the AI search) honours terrain AND fences
 * identically — a gameplay layer omitted from one hand-rolled env is exactly the bug class this
 * prevents. The returned env has no `lastMove`; add it at the call site when the caller needs it.
 */
export function gameEnv(state: GameState): MoveEnv {
  return {
    terrain: state.terrain ? buildTerrainIndex(state.terrain) : undefined,
    fences: state.fences && state.fences.length ? new Set(state.fences) : undefined,
  };
}

/** Whether terrain in `env` halts a multi-square move that enters (x, y). */
function haltsTravelAt(env: MoveEnv | undefined, x: number, y: number): boolean {
  return !!env?.terrain && haltsTravel(env.terrain, x, y);
}

function defaultPawnForward(piece: Piece): UnitFacing {
  return piece.side === 'enemy' ? 'south' : 'north';
}

function pawnForward(piece: Piece): UnitFacing {
  return piece.pawnForward ?? defaultPawnForward(piece);
}

function pawnForwardVector(piece: Piece): readonly [number, number] {
  return FACING_VECTOR[pawnForward(piece)];
}

function pawnCaptureVectors(piece: Piece): ReadonlyArray<readonly [number, number]> {
  const forwardIndex = COMPASS.indexOf(pawnForward(piece));
  const left = COMPASS[(forwardIndex + COMPASS.length - 1) % COMPASS.length];
  const right = COMPASS[(forwardIndex + 1) % COMPASS.length];
  return [FACING_VECTOR[left], FACING_VECTOR[right]];
}

function onPawnStart(piece: Piece): boolean {
  return piece.startX === undefined ? piece.y === piece.startY : piece.x === piece.startX && piece.y === piece.startY;
}

function isPawnDoubleStep(last: LastMove): boolean {
  const dx = Math.abs(last.from.x - last.to.x);
  const dy = Math.abs(last.from.y - last.to.y);
  return (dx === 0 && dy === 2) || (dx === 2 && dy === 0) || (dx === 2 && dy === 2);
}

function reachedPawnFarEdge(piece: Piece, size: BoardSize): boolean {
  const [dx, dy] = pawnForwardVector(piece);
  return (dx < 0 && piece.x === 0) ||
    (dx > 0 && piece.x === size.cols - 1) ||
    (dy < 0 && piece.y === 0) ||
    (dy > 0 && piece.y === size.rows - 1);
}

function rayMoves(piece: Piece, pieces: readonly Piece[], size: BoardSize, dirs: ReadonlyArray<readonly [number, number]>, env: MoveEnv | undefined, originElev: number): Move[] {
  const moves: Move[] = [];
  for (const [dx, dy] of dirs) {
    for (let step = 1; ; step += 1) {
      const x = piece.x + dx * step;
      const y = piece.y + dy * step;
      if (!inBounds(x, y, size)) break;
      if (fenceBlocks(env, x - dx, y - dy, x, y)) break; // a fence walls this step (orthogonal rays)
      if (blockedByTerrain(env, originElev, x, y)) break; // terrain wall ends the ray
      const occ = pieceAt(pieces, x, y);
      if (occ) {
        if (isEnemy(piece, occ)) moves.push({ x, y, capture: occ.id });
        break;
      }
      moves.push({ x, y });
      if (haltsTravelAt(env, x, y)) break; // water: the ray may end here, not pass
    }
  }
  return moves;
}

function stepMoves(piece: Piece, pieces: readonly Piece[], size: BoardSize, deltas: ReadonlyArray<readonly [number, number]>, env: MoveEnv | undefined, originElev: number): Move[] {
  const moves: Move[] = [];
  for (const [dx, dy] of deltas) {
    const x = piece.x + dx;
    const y = piece.y + dy;
    if (!inBounds(x, y, size)) continue;
    if (fenceBlocks(env, piece.x, piece.y, x, y)) continue; // an orthogonal step across a fence is walled (knights hop)
    if (blockedByTerrain(env, originElev, x, y)) continue;
    const occ = pieceAt(pieces, x, y);
    if (!occ) {
      moves.push({ x, y });
    } else if (isEnemy(piece, occ)) {
      moves.push({ x, y, capture: occ.id });
    }
  }
  return moves;
}

function pawnMoves(piece: Piece, pieces: readonly Piece[], size: BoardSize, env: MoveEnv | undefined, originElev: number): Move[] {
  const [forwardX, forwardY] = pawnForwardVector(piece);
  const moves: Move[] = [];
  const oneX = piece.x + forwardX;
  const oneY = piece.y + forwardY;
  // A forward step across a fenced edge is walled (only matters for an orthogonal-forward pawn;
  // a diagonally-oriented pawn crosses a corner, which a lone fence never blocks).
  if (inBounds(oneX, oneY, size) && !pieceAt(pieces, oneX, oneY) && !blockedByTerrain(env, originElev, oneX, oneY) && !fenceBlocks(env, piece.x, piece.y, oneX, oneY)) {
    moves.push({ x: oneX, y: oneY });
    const twoX = piece.x + forwardX * 2;
    const twoY = piece.y + forwardY * 2;
    // The double step passes through the one-step square, so water — or a fence on the second edge — halts it.
    if (onPawnStart(piece) && !haltsTravelAt(env, oneX, oneY) && !fenceBlocks(env, oneX, oneY, twoX, twoY) && inBounds(twoX, twoY, size) && !pieceAt(pieces, twoX, twoY) && !blockedByTerrain(env, originElev, twoX, twoY)) {
      moves.push({ x: twoX, y: twoY });
    }
  }
  for (const [dx, dy] of pawnCaptureVectors(piece)) {
    const x = piece.x + dx;
    const y = piece.y + dy;
    if (!inBounds(x, y, size)) continue;
    if (blockedByTerrain(env, originElev, x, y)) continue;
    const occ = pieceAt(pieces, x, y);
    if (isEnemy(piece, occ)) moves.push({ x, y, capture: occ!.id });
  }

  const last = env?.lastMove;
  if (
    last?.pieceType === 'pawn' &&
    last.side !== piece.side &&
    isPawnDoubleStep(last)
  ) {
    const target = pieceAt(pieces, last.to.x, last.to.y);
    for (const [dx, dy] of pawnCaptureVectors(piece)) {
      const x = piece.x + dx;
      const y = piece.y + dy;
      const capturedX = x - forwardX;
      const capturedY = y - forwardY;
      if (last.to.x !== capturedX || last.to.y !== capturedY || target?.id !== last.pieceId) continue;
      if (inBounds(x, y, size) && !pieceAt(pieces, x, y) && !blockedByTerrain(env, originElev, x, y)) {
        moves.push({ x, y, capture: last.pieceId, enPassant: true });
      }
    }
  }
  return moves;
}

/**
 * The board (positions only) after `mover` plays `move`. Mirrors `applyMove`'s
 * displacement so a hypothetical check test sees the same occupancy a committed
 * move would. En passant is handled implicitly: `move.capture` names the victim
 * by id, so it is the piece removed even though it doesn't sit on the destination
 * square.
 */
function boardAfterMove(mover: Piece, move: Move, pieces: readonly Piece[]): Piece[] {
  const capturedId = move.capture ?? pieceAt(pieces, move.x, move.y)?.id;
  const captured = capturedId ? pieces.find((p) => p.id === capturedId) : undefined;
  const captures = !!captured && isEnemy(mover, captured);
  const after: Piece[] = [];
  for (const p of pieces) {
    if (captures && p.id === capturedId) continue;
    after.push(p.id === mover.id ? { ...p, x: move.x, y: move.y } : p);
  }
  return after;
}

/**
 * True if any living king of `side` is attacked by a hostile piece on `board`.
 * Obstacles and neutral pieces never give check; an enemy king still guards its
 * eight neighbours (so two kings can never be adjacent). Terrain-aware via `env`.
 */
function sideKingAttacked(board: readonly Piece[], side: Side, size: BoardSize, env?: MoveEnv): boolean {
  for (const king of board) {
    if (!king.alive || king.type !== 'king' || king.side !== side) continue;
    for (const p of board) {
      if (!p.alive || isObstacle(p) || p.side === side || p.side === 'neutral') continue;
      for (const a of attackedSquares(p, board, size, env)) {
        if (a.x === king.x && a.y === king.y) return true;
      }
    }
  }
  return false;
}

/** True while `side` fields a king that a hostile piece currently attacks (in check). */
export function sideInCheck(state: GameState, side: Side, env?: MoveEnv): boolean {
  return sideKingAttacked(state.pieces, side, state.size, env);
}

/**
 * All legal destinations for a piece (excludes obstacles, which never move).
 * Pass `env.terrain` to apply terrain movement effects (cliff/rock barriers,
 * elevation limits, and water halting travel — a slide may end on water but
 * never pass it, knights hop over, and leaving water is unrestricted); omit it
 * for pure chess movement.
 *
 * A side that fields a king may not make any move that leaves one of its kings
 * in check: the king can't step into check, a pinned piece can't abandon the
 * king, and a side already in check must answer it. This is judged on the board
 * as it would be after the move (see `boardAfterMove` / `sideKingAttacked`).
 * Sides with no king are unconstrained, so kingless skirmishes and pure movement
 * behave exactly as before.
 */
export function legalMoves(piece: Piece, pieces: readonly Piece[], size: BoardSize, env?: MoveEnv): Move[] {
  if (!piece || !piece.alive || isObstacle(piece)) return [];
  const originElev = env?.terrain ? elevationAt(env.terrain, piece.x, piece.y) : 0;
  let moves: Move[];
  switch (piece.type) {
    case 'pawn': moves = pawnMoves(piece, pieces, size, env, originElev); break;
    case 'knight': moves = stepMoves(piece, pieces, size, KNIGHT, env, originElev); break;
    case 'bishop': moves = rayMoves(piece, pieces, size, DIAG, env, originElev); break;
    case 'rook': moves = rayMoves(piece, pieces, size, ORTHO, env, originElev); break;
    case 'queen': moves = rayMoves(piece, pieces, size, ALL8, env, originElev); break;
    case 'king': moves = stepMoves(piece, pieces, size, ALL8, env, originElev); break;
    default: return [];
  }
  const guardsKing = pieces.some((p) => p.alive && p.type === 'king' && p.side === piece.side);
  if (!guardsKing) return moves;
  return moves.filter((m) => !sideKingAttacked(boardAfterMove(piece, m, pieces), piece.side, size, env));
}

/**
 * Squares a piece threatens (basis for the enemy threat telegraph overlay and
 * for check detection). Pass `env.terrain` to make threats respect the board the
 * same way movement does: a slider's ray stops at a terrain wall (and may end on
 * but never pass water) and a stepper can't threaten across an impassable/
 * un-climbable tile. Omit it for pure-chess threats. A piece still "controls"
 * the first occupied square on a ray (that piece is threatened), so a king
 * still guards its neighbours for opposition.
 */
export function attackedSquares(piece: Piece, pieces: readonly Piece[], size: BoardSize, env?: MoveEnv): Vec[] {
  if (!piece || !piece.alive || isObstacle(piece)) return [];
  const originElev = env?.terrain ? elevationAt(env.terrain, piece.x, piece.y) : 0;
  if (piece.type === 'pawn') {
    const out: Vec[] = [];
    for (const [dx, dy] of pawnCaptureVectors(piece)) {
      const x = piece.x + dx;
      const y = piece.y + dy;
      if (inBounds(x, y, size) && !blockedByTerrain(env, originElev, x, y)) out.push({ x, y });
    }
    return out;
  }
  if (piece.type === 'knight') {
    return KNIGHT.map(([dx, dy]) => ({ x: piece.x + dx, y: piece.y + dy }))
      .filter((p) => inBounds(p.x, p.y, size) && !blockedByTerrain(env, originElev, p.x, p.y));
  }
  if (piece.type === 'king') {
    return ALL8.map(([dx, dy]) => ({ x: piece.x + dx, y: piece.y + dy }))
      .filter((p) => inBounds(p.x, p.y, size) && !blockedByTerrain(env, originElev, p.x, p.y) && !fenceBlocks(env, piece.x, piece.y, p.x, p.y));
  }
  const dirs = piece.type === 'bishop' ? DIAG : piece.type === 'rook' ? ORTHO : ALL8;
  const out: Vec[] = [];
  for (const [dx, dy] of dirs) {
    for (let step = 1; ; step += 1) {
      const x = piece.x + dx * step;
      const y = piece.y + dy * step;
      if (!inBounds(x, y, size)) break;
      if (fenceBlocks(env, x - dx, y - dy, x, y)) break; // a fence walls the threat ray (orthogonal)
      if (blockedByTerrain(env, originElev, x, y)) break; // a terrain wall ends the threat ray
      out.push({ x, y });
      if (pieceAt(pieces, x, y)) break;
      if (haltsTravelAt(env, x, y)) break; // water: threatened itself, nothing beyond
    }
  }
  return out;
}

/** True when any living `bySide` piece attacks the square `sq` on this board. */
function squareAttackedBy(sq: Vec, bySide: Side, pieces: readonly Piece[], size: BoardSize, env?: MoveEnv): boolean {
  for (const p of pieces) {
    if (!p.alive || p.side !== bySide || isObstacle(p)) continue;
    for (const a of attackedSquares(p, pieces, size, env)) {
      if (a.x === sq.x && a.y === sq.y) return true;
    }
  }
  return false;
}

/** Ids of the opponents of `p` that currently sit on a square `p` attacks. */
function opponentsUnderAttackBy(p: Piece, pieces: readonly Piece[], size: BoardSize, env?: MoveEnv): Set<string> {
  const ids = new Set<string>();
  for (const sq of attackedSquares(p, pieces, size, env)) {
    const t = pieceAt(pieces, sq.x, sq.y);
    if (t && t.alive && t.side !== p.side && !isObstacle(t)) ids.add(t.id);
  }
  return ids;
}

/** Union of every living enemy's attacked squares (terrain-aware when `env` is given). */
export function enemyThreats(pieces: readonly Piece[], size: BoardSize, env?: MoveEnv): Vec[] {
  const map = new Map<string, Vec>();
  for (const p of livingPieces(pieces, 'enemy')) {
    for (const sq of attackedSquares(p, pieces, size, env)) map.set(`${sq.x},${sq.y}`, sq);
  }
  return [...map.values()];
}

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * Apply a move to the state, returning a NEW state plus the events it produced.
 * Handles capture, pawn promotion, victory (last side standing), and turn
 * hand-off. Pure: the input state is never mutated.
 */
export function applyMove(state: GameState, pieceId: string, move: Move): ApplyResult {
  const events: GameEvent[] = [];
  const pieces = state.pieces.map((p) => ({ ...p }));
  const piece = pieces.find((p) => p.id === pieceId && p.alive);
  if (!piece) return { state, events };

  const from: Vec = { x: piece.x, y: piece.y };
  const movedPieceType = piece.type;

  // Service-record bookkeeping: only player/enemy units accrue stats, and only
  // from this (committed) move. Snapshot the threat picture BEFORE the move while
  // the piece still sits on `from`. Threats respect terrain AND fences so escapes/
  // threats are counted against the same board movement uses.
  const statEnv: MoveEnv = gameEnv(state);
  const tracksStats = piece.side === 'player' || piece.side === 'enemy';
  const opponentSide: Side | null = piece.side === 'player' ? 'enemy' : piece.side === 'enemy' ? 'player' : null;
  const escapedThreat = tracksStats && opponentSide
    ? squareAttackedBy(from, opponentSide, state.pieces, state.size, statEnv)
    : false;
  const threatenedBefore = tracksStats
    ? opponentsUnderAttackBy(piece, state.pieces, state.size, statEnv)
    : new Set<string>();

  const nextFacing = facingFromDelta(move.x - from.x, move.y - from.y);
  if (nextFacing) piece.facing = nextFacing;
  const capturedId = move.capture ?? pieceAt(pieces, move.x, move.y)?.id;
  if (capturedId) {
    const target = pieces.find((p) => p.id === capturedId);
    if (target && isEnemy(piece, target)) {
      target.alive = false;
      if (tracksStats) piece.enemiesKilled = (piece.enemiesKilled ?? 0) + 1;
      events.push({ kind: 'captured', pieceId: target.id, by: piece.id });
    }
  }

  piece.x = move.x;
  piece.y = move.y;
  events.push({ kind: 'moved', pieceId: piece.id, from, to: { x: move.x, y: move.y } });

  if (piece.type === 'pawn') {
    if (reachedPawnFarEdge(piece, state.size)) {
      piece.type = 'queen';
      events.push({ kind: 'promoted', pieceId: piece.id, to: 'queen' });
    }
  }

  // Tally the service record now that the piece sits at its final square.
  if (tracksStats) {
    piece.timesUsed = (piece.timesUsed ?? 0) + 1;
    const dx = Math.abs(piece.x - from.x);
    const dy = Math.abs(piece.y - from.y);
    const diagonal = Math.min(dx, dy);
    const straight = Math.abs(dx - dy);
    piece.squaresTraveled = (piece.squaresTraveled ?? 0) + diagonal * 1.5 + straight;
    if (escapedThreat) piece.escapes = (piece.escapes ?? 0) + 1;
    // Opponents this piece newly placed under attack (in its post-move position).
    const threatenedAfter = opponentsUnderAttackBy(piece, pieces, state.size, statEnv);
    let newlyThreatened = 0;
    for (const id of threatenedAfter) if (!threatenedBefore.has(id)) newlyThreatened += 1;
    if (newlyThreatened > 0) piece.threatsMade = (piece.threatsMade ?? 0) + newlyThreatened;
  }

  let winner: Winner = state.winner;
  let turn = state.turn;
  const players = livingPieces(pieces, 'player').length;
  const enemies = livingPieces(pieces, 'enemy').length;
  if (!players || !enemies) {
    winner = players ? 'player' : 'enemy';
    turn = 'done';
    events.push({ kind: 'victory', winner });
  } else if (piece.side === 'player' || piece.side === 'enemy') {
    const other: Side = piece.side === 'player' ? 'enemy' : 'player';
    turn = other;
  }

  const lastMove: LastMove = { pieceId: piece.id, pieceType: movedPieceType, side: piece.side, from, to: { x: piece.x, y: piece.y } };

  return { state: { ...state, pieces, winner, turn, lastMove }, events };
}

/**
 * Deterministic enemy AI: prefer a capturing move, otherwise any legal move;
 * choices drawn from the injected seeded RNG. Returns null if the enemy is
 * stuck. (Matches the legacy capture-greedy behaviour.)
 */
export function enemyMove(state: GameState, rng: Rng, env?: MoveEnv): { pieceId: string; move: Move } | null {
  const candidates = livingPieces(state.pieces, 'enemy')
    .map((p) => ({ piece: p, moves: legalMoves(p, state.pieces, state.size, env) }))
    .filter((e) => e.moves.length > 0);
  if (!candidates.length) return null;

  const captureEntries = candidates
    .map((e) => ({ piece: e.piece, moves: e.moves.filter((m) => m.capture) }))
    .filter((e) => e.moves.length > 0);

  const pool = captureEntries.length ? captureEntries : candidates;
  const entry = rng.pick(pool);
  const move = rng.pick(entry.moves);
  return { pieceId: entry.piece.id, move };
}

/**
 * Pick an enemy's next move deterministically (no RNG): take the highest-value
 * capture, else the move that closes distance to the nearest living player.
 * Stable tie-breaks (target value, then board position) so a telegraph computed
 * now matches deterministic execution later.
 */
export function chooseEnemyMove(piece: Piece, moves: readonly Move[], state: GameState): Move | null {
  if (!moves.length) return null;
  const valueOf = (m: Move): number => {
    if (!m.capture) return -1;
    const t = state.pieces.find((p) => p.id === m.capture);
    return t ? PIECE_VALUE[t.type] : -1;
  };
  const captures = moves.filter((m) => m.capture);
  if (captures.length) {
    return [...captures].sort((a, b) => valueOf(b) - valueOf(a) || a.y - b.y || a.x - b.x)[0];
  }
  const players = livingPieces(state.pieces, 'player').map((p) => ({ x: p.x, y: p.y }));
  const distOf = (m: Move): number => (players.length
    ? Math.min(...players.map((p) => manhattan({ x: m.x, y: m.y }, p)))
    : 0);
  return [...moves].sort((a, b) => distOf(a) - distOf(b) || a.y - b.y || a.x - b.x)[0];
}

/**
 * Telegraph every living enemy's intended next action — the signature
 * "forecast the queued attack a turn ahead" overlay. Deterministic, so the
 * preview the player sees is exactly what a deterministic enemy turn executes.
 */
export function forecastEnemyIntents(state: GameState, env?: MoveEnv): EnemyIntent[] {
  const intents: EnemyIntent[] = [];
  for (const piece of livingPieces(state.pieces, 'enemy')) {
    const move = chooseEnemyMove(piece, legalMoves(piece, state.pieces, state.size, env), state);
    if (!move) continue;
    const from: Vec = { x: piece.x, y: piece.y };
    const targetId = move.capture ?? pieceAt(state.pieces, move.x, move.y)?.id;
    const target = targetId ? state.pieces.find((p) => p.id === targetId && p.side !== piece.side) : null;
    intents.push(target
      ? { pieceId: piece.id, from, to: { x: move.x, y: move.y }, kind: 'attack', targetId: target.id }
      : { pieceId: piece.id, from, to: { x: move.x, y: move.y }, kind: 'move' });
  }
  return intents;
}

/** State with `intents` recomputed — the enemy's telegraphed upcoming turn. */
export function withForecast(state: GameState, env?: MoveEnv): GameState {
  return { ...state, intents: forecastEnemyIntents(state, env) };
}

/** Force the turn to the other side. Pure; no-op once the game is over. */
export function endTurn(state: GameState): GameState {
  if (state.turn !== 'player' && state.turn !== 'enemy') return state;
  const other: Side = state.turn === 'player' ? 'enemy' : 'player';
  return { ...state, turn: other };
}
