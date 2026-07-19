// The rules engine: pure functions over game state. Ported faithfully from the
// legacy app.js implementation (pawn/knight/bishop/queen movement, rocks as
// obstacles, side-based pawns, threat = enemy attacked squares, capture/promote/
// move settlement) — but deterministic and immutable. Match outcomes live in
// core/adjudication, because only that layer has the level's authored rules.

import type { BoardSize, CastleRule, EnemyIntent, GameEvent, GameState, LastMove, Move, PawnPromotionRule, Piece, PieceType, PromotionPieceType, Side, UnitFacing, Vec } from './types';
import { PROMOTION_PIECE_TYPES } from './types';
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
   * Edge barriers as canonical edge keys (roadEdgeKey "x,y|x,y"). An orthogonal crossing is
   * blocked by its shared edge. A diagonal crossing is blocked only when both orthogonal routes
   * around the shared corner are closed; a lone barrier leaves one route open. Knights and other
   * non-adjacent jumps hop barriers. Omit for no barriers.
   */
  fences?: ReadonlySet<string>;
  /**
   * Authored castling options (GameState.castleRules), threaded through the env so
   * `legalMoves` — which never sees the GameState — can generate castle moves. Static
   * across a game's plies like terrain and fences; sourced by `gameEnv`.
   */
  castleRules?: readonly CastleRule[];
  lastMove?: LastMove;
}

/** Whether terrain in `env` forbids moving into (x, y) from `originElev`. */
function blockedByTerrain(env: MoveEnv | undefined, originElev: number, x: number, y: number): boolean {
  return !!env?.terrain && !canTraverse(env.terrain, originElev, x, y);
}

/** Whether the authored edge barriers in `env` close the adjacent crossing (ax,ay)→(bx,by). */
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
    castleRules: state.castleRules && state.castleRules.length ? state.castleRules : undefined,
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

function rayMoves(piece: Piece, pieces: readonly Piece[], size: BoardSize, dirs: ReadonlyArray<readonly [number, number]>, env: MoveEnv | undefined, originElev: number): Move[] {
  const moves: Move[] = [];
  for (const [dx, dy] of dirs) {
    for (let step = 1; ; step += 1) {
      const x = piece.x + dx * step;
      const y = piece.y + dy * step;
      if (!inBounds(x, y, size)) break;
      if (fenceBlocks(env, x - dx, y - dy, x, y)) break; // an edge barrier closes this ray step
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
    if (fenceBlocks(env, piece.x, piece.y, x, y)) continue; // closed edge/corner; knights still hop
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
  // A flat edge blocks orthogonal travel; a diagonally-oriented pawn can pass an open corner but
  // not one whose two routes are closed.
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
    if (fenceBlocks(env, piece.x, piece.y, x, y)) continue;
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
      if (inBounds(x, y, size) && !pieceAt(pieces, x, y) && !fenceBlocks(env, piece.x, piece.y, x, y) && !blockedByTerrain(env, originElev, x, y)) {
        moves.push({ x, y, capture: last.pieceId, enPassant: true });
      }
    }
  }
  return moves;
}

function addBlockedCandidate(
  out: Map<string, Vec>,
  piece: Piece,
  pieces: readonly Piece[],
  size: BoardSize,
  env: MoveEnv | undefined,
  originElev: number,
  fromX: number,
  fromY: number,
  x: number,
  y: number,
): boolean {
  if (!inBounds(x, y, size)) return false;
  if (fenceBlocks(env, fromX, fromY, x, y) || blockedByTerrain(env, originElev, x, y)) {
    out.set(`${x},${y}`, { x, y });
    return false;
  }
  const occ = pieceAt(pieces, x, y);
  if (occ) {
    if (!isEnemy(piece, occ)) out.set(`${x},${y}`, { x, y });
    return false;
  }
  return !haltsTravelAt(env, x, y);
}

/** Squares that are geometrically relevant to a piece but blocked by terrain, fences,
 * friendly pieces, or neutral obstacles. Used by render overlays only; legalMoves
 * remains the source of truth for playable destinations. */
export function blockedCandidateSquares(piece: Piece, pieces: readonly Piece[], size: BoardSize, env?: MoveEnv): Vec[] {
  const blocked = new Map<string, Vec>();
  if (!piece.alive || isObstacle(piece)) return [];
  const originElev = env?.terrain ? elevationAt(env.terrain, piece.x, piece.y) : 0;
  const ray = (dirs: ReadonlyArray<readonly [number, number]>) => {
    for (const [dx, dy] of dirs) {
      for (let step = 1; ; step += 1) {
        const fromX = piece.x + dx * (step - 1);
        const fromY = piece.y + dy * (step - 1);
        const x = piece.x + dx * step;
        const y = piece.y + dy * step;
        if (!addBlockedCandidate(blocked, piece, pieces, size, env, originElev, fromX, fromY, x, y)) break;
      }
    }
  };
  const step = (deltas: ReadonlyArray<readonly [number, number]>) => {
    for (const [dx, dy] of deltas) {
      addBlockedCandidate(blocked, piece, pieces, size, env, originElev, piece.x, piece.y, piece.x + dx, piece.y + dy);
    }
  };

  if (piece.type === 'pawn') {
    const [forwardX, forwardY] = pawnForwardVector(piece);
    const oneX = piece.x + forwardX;
    const oneY = piece.y + forwardY;
    const oneOpen = addBlockedCandidate(blocked, piece, pieces, size, env, originElev, piece.x, piece.y, oneX, oneY);
    if (oneOpen && onPawnStart(piece)) {
      addBlockedCandidate(blocked, piece, pieces, size, env, originElev, oneX, oneY, piece.x + forwardX * 2, piece.y + forwardY * 2);
    }
    for (const [dx, dy] of pawnCaptureVectors(piece)) {
      addBlockedCandidate(blocked, piece, pieces, size, env, originElev, piece.x, piece.y, piece.x + dx, piece.y + dy);
    }
  } else if (piece.type === 'knight') {
    step(KNIGHT);
  } else if (piece.type === 'king') {
    step(ALL8);
  } else if (piece.type === 'bishop') {
    ray(DIAG);
  } else if (piece.type === 'rook') {
    ray(ORTHO);
  } else if (piece.type === 'queen') {
    ray(ALL8);
  }
  return [...blocked.values()];
}

/**
 * The board (positions only) after `mover` plays `move`. Mirrors `applyMove`'s
 * displacement so a hypothetical check test sees the same occupancy a committed
 * move would. En passant is handled implicitly: `move.capture` names the victim
 * by id, so it is the piece removed even though it doesn't sit on the destination
 * square. A castle's rook hop is mirrored too, so king safety after castling is
 * judged with the rook on its landing square.
 */
function boardAfterMove(mover: Piece, move: Move, pieces: readonly Piece[]): Piece[] {
  const capturedId = move.capture ?? pieceAt(pieces, move.x, move.y)?.id;
  const captured = capturedId ? pieces.find((p) => p.id === capturedId) : undefined;
  const captures = !!captured && isEnemy(mover, captured);
  const after: Piece[] = [];
  const landX = move.castle?.kingTo.x ?? move.x;
  const landY = move.castle?.kingTo.y ?? move.y;
  for (const p of pieces) {
    if (captures && p.id === capturedId) continue;
    if (p.id === mover.id) after.push({ ...p, x: landX, y: landY });
    else if (move.castle && p.id === move.castle.rookId) after.push({ ...p, x: move.castle.rookTo.x, y: move.castle.rookTo.y });
    else after.push(p);
  }
  return after;
}

/**
 * Castle moves for a king, generated from the game's authored king-rook pairs
 * (env.castleRules) under chess legality: the rule's king and a friendly rook sit
 * UNMOVED on their authored squares, every square strictly between them is empty,
 * the destinations are clear, the king is not in check and crosses no attacked
 * square (landing safety is the standard king filter's job, judged with the rook
 * displaced — see boardAfterMove), and both pieces' straight-line travel respects
 * terrain, water, and fences like any slide. Encoded as a king move to `kingTo`
 * carrying the rook's hop, so one applyMove relocates both pieces in one action.
 */
function castleMoves(king: Piece, pieces: readonly Piece[], size: BoardSize, env: MoveEnv | undefined, originElev: number): Move[] {
  const rules = env?.castleRules;
  if (!rules?.length || king.hasMoved) return [];

  // A straight sign-step walk from (fromX, fromY) to `to`: false when the line isn't
  // straight or a step crosses a fence, blocked terrain, or (mid-path) halting water;
  // when `guarded`, the king may not cross an attacked square. The landing square may
  // be water (the slide simply ends there).
  const walk = (fromX: number, fromY: number, to: Vec, elev: number, guarded: boolean, opponent: Side): boolean => {
    const dx = to.x - fromX;
    const dy = to.y - fromY;
    if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return false;
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    let px = fromX;
    let py = fromY;
    while (px !== to.x || py !== to.y) {
      const nx = px + sx;
      const ny = py + sy;
      if (!inBounds(nx, ny, size)) return false;
      if (fenceBlocks(env, px, py, nx, ny)) return false;
      if (blockedByTerrain(env, elev, nx, ny)) return false;
      const landing = nx === to.x && ny === to.y;
      if (!landing && haltsTravelAt(env, nx, ny)) return false;
      if (guarded && !landing && squareAttackedBy({ x: nx, y: ny }, opponent, pieces, size, env)) return false;
      px = nx;
      py = ny;
    }
    return true;
  };

  const out: Move[] = [];
  for (const rule of rules) {
    if (rule.side !== king.side) continue;
    if (king.x !== rule.king.x || king.y !== rule.king.y) continue;
    if (rule.kingTo.x === king.x && rule.kingTo.y === king.y) continue; // a "move" to its own square is unclickable
    if (rule.kingTo.x === rule.rookTo.x && rule.kingTo.y === rule.rookTo.y) continue; // two pieces can't land on one square
    if (!inBounds(rule.kingTo.x, rule.kingTo.y, size) || !inBounds(rule.rookTo.x, rule.rookTo.y, size)) continue;
    const rook = pieceAt(pieces, rule.rook.x, rule.rook.y);
    if (!rook || rook.type !== 'rook' || rook.side !== king.side || rook.hasMoved) continue;

    // King and rook on one rank or file, every square strictly between them empty.
    const dx = Math.sign(rule.rook.x - king.x);
    const dy = Math.sign(rule.rook.y - king.y);
    if ((dx !== 0) === (dy !== 0)) continue;
    let open = true;
    for (let x = king.x + dx, y = king.y + dy; x !== rule.rook.x || y !== rule.rook.y; x += dx, y += dy) {
      if (!inBounds(x, y, size) || pieceAt(pieces, x, y)) { open = false; break; }
    }
    if (!open) continue;

    // Destinations clear — the vacated king/rook squares themselves don't block.
    const ktOcc = pieceAt(pieces, rule.kingTo.x, rule.kingTo.y);
    if (ktOcc && ktOcc.id !== king.id && ktOcc.id !== rook.id) continue;
    const rtOcc = pieceAt(pieces, rule.rookTo.x, rule.rookTo.y);
    if (rtOcc && rtOcc.id !== king.id && rtOcc.id !== rook.id) continue;

    // No castling out of check, and the king's crossed squares must be safe. The rook's
    // path ignores occupancy (both pieces move at once, chess-style) but not terrain.
    const opponent: Side = king.side === 'player' ? 'enemy' : 'player';
    if (squareAttackedBy({ x: king.x, y: king.y }, opponent, pieces, size, env)) continue;
    if (!walk(king.x, king.y, rule.kingTo, originElev, true, opponent)) continue;
    const rookElev = env?.terrain ? elevationAt(env.terrain, rook.x, rook.y) : 0;
    if (!walk(rook.x, rook.y, rule.rookTo, rookElev, false, opponent)) continue;

    // The chess.com gesture range: dropping the king anywhere from the two-square hop
    // THROUGH the rook's own square commits this castle (the king still lands on
    // kingTo). Every gesture square carries the same payload; extension past kingTo
    // only applies when kingTo sits between king and rook (always true for the
    // template's chess geometry — exotic authored rules just get the single square).
    const castle = { rookId: rook.id, rookTo: { x: rule.rookTo.x, y: rule.rookTo.y }, kingTo: { x: rule.kingTo.x, y: rule.kingTo.y } };
    const taken = new Set(out.map((m) => `${m.x},${m.y}`));
    const offer = (x: number, y: number): void => {
      if (!taken.has(`${x},${y}`)) out.push({ x, y, castle });
    };
    offer(rule.kingTo.x, rule.kingTo.y);
    if (Math.sign(rule.rook.x - rule.kingTo.x) === dx && Math.sign(rule.rook.y - rule.kingTo.y) === dy) {
      for (let x = rule.kingTo.x + dx, y = rule.kingTo.y + dy; inBounds(x, y, size); x += dx, y += dy) {
        offer(x, y);
        if (x === rule.rook.x && y === rule.rook.y) break;
      }
    }
  }
  return out;
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
    case 'king': moves = [...stepMoves(piece, pieces, size, ALL8, env, originElev), ...castleMoves(piece, pieces, size, env, originElev)]; break;
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
      if (inBounds(x, y, size) && !fenceBlocks(env, piece.x, piece.y, x, y) && !blockedByTerrain(env, originElev, x, y)) out.push({ x, y });
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
      if (fenceBlocks(env, x - dx, y - dy, x, y)) break; // an edge barrier closes this threat step
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

export interface ApplyOptions {
  promotion?: PromotionPieceType;
}

export function promotionRuleForMove(state: GameState, piece: Piece, to: Vec): PawnPromotionRule | null {
  if (piece.type !== 'pawn') return null;
  const rules = state.promotionRules;
  if (rules?.length) {
    return rules.find((rule) =>
      (rule.side === undefined || rule.side === piece.side) &&
      rule.cells.some((cell) => cell.x === to.x && cell.y === to.y)
    ) ?? null;
  }
  if (state.promotionZones?.some((cell) => cell.x === to.x && cell.y === to.y)) {
    return { cells: state.promotionZones };
  }
  return null;
}

function promotionChoice(rule: PawnPromotionRule, requested: PromotionPieceType | undefined): PromotionPieceType {
  const choices = rule.choices?.length ? rule.choices : PROMOTION_PIECE_TYPES;
  const fallback = rule.defaultPromotion && choices.includes(rule.defaultPromotion) ? rule.defaultPromotion : choices[0] ?? 'queen';
  return requested && choices.includes(requested) ? requested : fallback;
}

/**
 * Apply a move to the state, returning a NEW state plus the events it produced.
 * Handles capture, pawn promotion, history, and turn hand-off. Match outcomes are
 * deliberately absent: `settleCommittedPosition` applies the level's exact rules
 * after the move is committed. Pure: the input state is never mutated.
 */
export function applyMove(state: GameState, pieceId: string, move: Move, options: ApplyOptions = {}): ApplyResult {
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

  // A castle's (x, y) is the gesture square (chess.com range: two-out through the rook's
  // square); the king's REAL landing square is castle.kingTo. Everything below — facing,
  // displacement, stats, events, lastMove — uses the landing square.
  const landX = move.castle?.kingTo.x ?? move.x;
  const landY = move.castle?.kingTo.y ?? move.y;
  const nextFacing = facingFromDelta(landX - from.x, landY - from.y);
  if (nextFacing) piece.facing = nextFacing;
  let tookPiece = false;
  const capturedId = move.capture ?? pieceAt(pieces, move.x, move.y)?.id;
  if (capturedId) {
    const target = pieces.find((p) => p.id === capturedId);
    if (target && isEnemy(piece, target)) {
      target.alive = false;
      tookPiece = true;
      if (tracksStats) piece.enemiesKilled = (piece.enemiesKilled ?? 0) + 1;
      events.push({ kind: 'captured', pieceId: target.id, by: piece.id });
    }
  }

  piece.x = landX;
  piece.y = landY;
  // Castling-rights history: only tracked when the game HAS castle rules, so a level
  // without them keeps a byte-identical serialized GameState (ADR-0072 back-compat).
  if (state.castleRules?.length) piece.hasMoved = true;
  events.push({ kind: 'moved', pieceId: piece.id, from, to: { x: landX, y: landY } });

  // Castling: the same action also hops the rook (see Move.castle / castleMoves).
  if (move.castle) {
    const rook = pieces.find((p) => p.id === move.castle!.rookId && p.alive);
    if (rook) {
      const rookFrom: Vec = { x: rook.x, y: rook.y };
      const rookFacing = facingFromDelta(move.castle.rookTo.x - rook.x, move.castle.rookTo.y - rook.y);
      if (rookFacing) rook.facing = rookFacing;
      rook.x = move.castle.rookTo.x;
      rook.y = move.castle.rookTo.y;
      rook.hasMoved = true;
      events.push({ kind: 'moved', pieceId: rook.id, from: rookFrom, to: { x: rook.x, y: rook.y } });
      events.push({ kind: 'castled', kingId: piece.id, rookId: rook.id });
    }
  }

  const promoRule = promotionRuleForMove(state, { ...piece, type: movedPieceType }, { x: piece.x, y: piece.y });
  if (promoRule) {
    const promotion = promotionChoice(promoRule, options.promotion);
    piece.type = promotion;
    events.push({ kind: 'promoted', pieceId: piece.id, to: promotion });
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

  // Move mechanics never decide the match. In particular, removing the final
  // opposing piece is not implicitly a win: an authored VictoryRules override may
  // deliberately omit elimination. The committed-position adjudicator owns every
  // outcome and applies the level's exact rule list after this move settles.
  let turn = state.turn;
  if (piece.side === 'player' || piece.side === 'enemy') {
    const other: Side = piece.side === 'player' ? 'enemy' : 'player';
    turn = other;
  }

  const lastMove: LastMove = { pieceId: piece.id, pieceType: movedPieceType, side: piece.side, from, to: { x: piece.x, y: piece.y } };
  // The 50-move rule's clock: halfmoves since the last capture or pawn move. Only
  // maintained when the game enforces draw rules, so every other level's serialized
  // GameState stays byte-identical to before (ADR-0072 back-compat).
  const clockField = state.drawRules
    ? { halfmoveClock: tookPiece || movedPieceType === 'pawn' ? 0 : (state.halfmoveClock ?? 0) + 1 }
    : undefined;

  return { state: { ...state, pieces, turn, lastMove, ...clockField }, events };
}

const POSITION_TYPE_CODE: Record<PieceType, string> = {
  pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K', rock: 'X', 'random-rock': 'X',
};

/**
 * A serializable identity for the position, for threefold repetition (FIDE 9.2 exact):
 * combat-piece placement (neutral rocks never move, so they're constant and omitted),
 * side to move, which authored castle options remain available in principle (both
 * pieces alive and unmoved on their squares), and — only when a capture is actually
 * legal, pins included — the en-passant square. Two states with the same key offer the
 * side to move the identical set of legal moves. Pass `env` when the caller already
 * holds one (search); omitted, it is built from the state.
 */
export function positionKey(state: GameState, env?: MoveEnv): string {
  const e = env ?? { ...gameEnv(state), lastMove: state.lastMove };
  const parts: string[] = [
    state.pieces
      .filter((p) => p.alive && p.side !== 'neutral')
      .map((p) => `${p.side === 'player' ? 'w' : 'b'}${POSITION_TYPE_CODE[p.type]}${p.x},${p.y}`)
      .sort()
      .join(' '),
    String(state.turn),
  ];
  if (state.castleRules?.length) {
    parts.push(state.castleRules.map((rule) => {
      const king = pieceAt(state.pieces, rule.king.x, rule.king.y);
      const rook = pieceAt(state.pieces, rule.rook.x, rule.rook.y);
      const open = !!king && king.type === 'king' && king.side === rule.side && !king.hasMoved
        && !!rook && rook.type === 'rook' && rook.side === rule.side && !rook.hasMoved;
      return open ? '1' : '0';
    }).join(''));
  }
  const last = e.lastMove;
  if (
    last && last.pieceType === 'pawn' && isPawnDoubleStep(last)
    && (state.turn === 'player' || state.turn === 'enemy') && last.side !== state.turn
  ) {
    const epAvailable = livingPieces(state.pieces, state.turn)
      .some((p) => p.type === 'pawn' && legalMoves(p, state.pieces, state.size, e).some((m) => m.enPassant));
    if (epAvailable) parts.push(`ep${last.to.x},${last.to.y}`);
  }
  return parts.join('|');
}

/**
 * Record the state's position in the threefold table — once per COMMITTED move (and
 * once for the initial position), never for hypothetical search applies. A capture or
 * pawn move (halfmoveClock 0) makes every earlier position unreachable, so the table
 * restarts there and stays as small as the clock. No-op unless this game enforces
 * threefold, so every other level's GameState is byte-identical to before.
 */
export function recordPosition(state: GameState, env?: MoveEnv): GameState {
  if (!state.drawRules?.threefold) return state;
  const key = positionKey(state, env);
  if ((state.halfmoveClock ?? 0) === 0) return { ...state, positionCounts: { [key]: 1 } };
  const counts = state.positionCounts ?? {};
  return { ...state, positionCounts: { ...counts, [key]: (counts[key] ?? 0) + 1 } };
}

export type RuleDrawKind = 'fifty-move' | 'threefold';

/**
 * A draw forced by this game's authored chess draw rules at the settled position, or
 * null. Threefold reads the committed table (see recordPosition; a third occurrence
 * needs at least 8 reversible halfmoves, so the key is only computed past that clock).
 * The 50-move branch is mate-exact per FIDE: a move that fills the clock AND delivers
 * checkmate wins, so with the side to move in check the clock only draws if an escape
 * exists. Callers need no particular ordering against their own checkmate detection.
 */
export function ruleDraw(state: GameState, env?: MoveEnv): RuleDrawKind | null {
  const rules = state.drawRules;
  if (!rules || state.winner || (state.turn !== 'player' && state.turn !== 'enemy')) return null;
  const clock = state.halfmoveClock ?? 0;
  const e = env ?? { ...gameEnv(state), lastMove: state.lastMove };
  if (rules.threefold && clock >= 8 && (state.positionCounts?.[positionKey(state, e)] ?? 0) >= 3) return 'threefold';
  if (rules.fiftyMove && clock >= 100) {
    const side = state.turn;
    const mated = sideInCheck(state, side, e)
      && !livingPieces(state.pieces, side).some((p) => legalMoves(p, state.pieces, state.size, e).length > 0);
    if (!mated) return 'fifty-move';
  }
  return null;
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
