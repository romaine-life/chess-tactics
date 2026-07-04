// The trainer's engine surface — a single entry Vite bundles (SSR, DOM-free) into
// dist-trainer/engine.mjs so the headless Node training Job (backend/train-worker.mjs)
// and its worker_threads can import the EXACT SAME pure engine the app and the live
// AI use. No DOM, no pixi, no react in this graph — see vite.trainer.config.js.
//
// Everything here is deterministic per seed, so a game/tune replays identically
// whether it runs in the browser worker, a local vitest, or a cluster Job.

export { playLevelGame, aggregateRecords, replayStates } from '../game/selfplay';
export {
  runTuning, spsaStep, matchStats, matchScore,
  encodeWeights, decodeWeights, deriveScales, tailAverageTheta,
  DEFAULT_HYPERPARAMS, PARAM_LABELS, TUNED_PIECE_TYPES, TUNED_TERMS,
} from '../game/tuning';
export type { SpsaHyperParams, MatchOptions, TuningResult, TrajectoryPoint, StepResult, MatchStats } from '../game/tuning';
export { sprt, eloToScore, scoreToElo, DEFAULT_SPRT } from '../game/sprt';
export type { SprtConfig, SprtResult } from '../game/sprt';
export { validateStep, freshValState } from '../lab/validate';
export type { ValState } from '../lab/validate';
export { generateOpeningBook } from '../game/openingBook';
export type { BookPosition, OpeningBookSettings } from '../game/openingBook';
export { DEFAULT_EVAL_WEIGHTS } from '../core/ai';
export type { EvalWeights, SearchOptions } from '../core/ai';
export { createBlankLevel } from '../core/level';
export type { Level } from '../core/level';
