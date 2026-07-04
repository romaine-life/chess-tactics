// Streaming SPRT validation: play ONE game per call, fold its result into a running
// W/D/L record, recompute the SPRT verdict, and report. Drive it in a loop and you
// watch a candidate's strength resolve to ACCEPT / REJECT game-by-game — exactly the
// Fishtest experience, incremental so a UI can render each game as it lands.
//
// Pure and deterministic in (level, candidate, reference, book, match, seed, prev):
// each game is seeded off (seed, gameIndex) and reads a fixed book position, so a
// replay from the same state produces the identical stream. No Math.random, no Date.

import type { Level } from '../core/level';
import { playLevelGame } from '../game/selfplay';
import type { EvalWeights, SearchOptions } from '../core/ai';
import type { BookPosition } from '../game/openingBook';
import type { MatchOptions } from '../game/tuning';
import { sprt, type SprtConfig, type SprtResult, DEFAULT_SPRT } from '../game/sprt';

/** The running state of a streaming validation run. `sprt` is recomputed each game. */
export interface ValState {
  /** Wins / draws / losses FOR THE CANDIDATE, folded across every game so far. */
  w: number;
  d: number;
  l: number;
  /** Index of the NEXT game to play (also games played so far). w+d+l === gameIndex. */
  gameIndex: number;
  /** True once the SPRT has a verdict OR the game budget is exhausted. */
  done: boolean;
  sprt: SprtResult;
}

/** How many games to play before stopping even if the SPRT hasn't decided. */
const DEFAULT_MAX_GAMES = 200;

/** Minimum games before a verdict is allowed to STOP the run. The GSPRT's variance
 * is floored at 1e-6, so a single early decisive game produces an exploding LLR that
 * would cross a bound at n=1 — a meaningless stop. A short warm-up lets the alternating
 * player/enemy games cancel first-move bias and the variance become real before the
 * test is allowed to conclude (exactly why sequential tests warm up). */
const MIN_GAMES_TO_STOP = 8;

/** A fresh (zero-game) validation state under `cfg`. */
export function freshValState(cfg: SprtConfig = DEFAULT_SPRT): ValState {
  return { w: 0, d: 0, l: 0, gameIndex: 0, done: false, sprt: sprt(0, 0, 0, cfg) };
}

/**
 * Play the NEXT game (candidate vs reference from `prev`'s gameIndex), fold it into
 * the running W/D/L, recompute the SPRT, and return the advanced state. Pass
 * `prev = null` (or a fresh state) to start. Sides alternate across calls to cancel
 * first-move bias: on an EVEN gameIndex the candidate is the player, on an ODD one it
 * is the enemy. The book is cycled by gameIndex, so a book shorter than maxGames just
 * repeats its positions.
 */
export function validateStep(
  level: Level,
  candidate: EvalWeights,
  reference: EvalWeights,
  book: readonly BookPosition[],
  match: MatchOptions,
  seed: number,
  prev: ValState | null,
  cfg: SprtConfig = DEFAULT_SPRT,
  maxGames: number = DEFAULT_MAX_GAMES,
): ValState {
  const cur = prev ?? freshValState(cfg);
  const gameIndex = cur.gameIndex;

  // Book position cycles every PAIR of games, so consecutive games (candidate-as-player
  // then candidate-as-enemy) play the SAME position swapped. That is what actually
  // cancels first-move bias: a position where the player side is structurally favored
  // is played once by the candidate and once by the reference, netting out. Cycling the
  // book by gameIndex alone would give each side different positions and leak the bias.
  const pairIndex = Math.floor(gameIndex / 2);
  const pos = book.length ? book[pairIndex % book.length] : undefined;
  const opening = pos ? pos.moves : [];
  const posSeed = pos ? pos.seed : 0;
  // A per-game seed folds in the run seed, the book position, and the game index so
  // no two games in the stream share an rng, and the whole stream is reproducible.
  const gameSeed = seed + gameIndex * 2654435761 + posSeed;

  const searchCandidate: SearchOptions = { ...match.search, weights: candidate };
  const searchReference: SearchOptions = { ...match.search, weights: reference };

  // Even game: candidate plays as the player. Odd game: candidate plays as the enemy.
  const candidateIsPlayer = gameIndex % 2 === 0;
  const searchForSide = candidateIsPlayer
    ? { player: searchCandidate, enemy: searchReference }
    : { player: searchReference, enemy: searchCandidate };

  const rec = playLevelGame(level, { seed: gameSeed, openingMoves: opening, searchForSide, maxPlies: match.maxPlies });

  // Translate the winner into a candidate-perspective W/D/L increment.
  let { w, d, l } = cur;
  if (rec.winner === 'draw') {
    d += 1;
  } else {
    const candidateWon = candidateIsPlayer ? rec.winner === 'player' : rec.winner === 'enemy';
    if (candidateWon) w += 1;
    else l += 1;
  }

  const nextIndex = gameIndex + 1;
  const result = sprt(w, d, l, cfg);
  const verdictStops = result.verdict !== 'continue' && nextIndex >= MIN_GAMES_TO_STOP;
  const done = verdictStops || nextIndex >= maxGames;
  return { w, d, l, gameIndex: nextIndex, done, sprt: result };
}
