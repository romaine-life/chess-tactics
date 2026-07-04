// Training-gym worker: holds one board's tuning state and does ONE SPSA step per
// request, streaming the resulting trajectory point back. Stepping is driven from
// the UI (one step per click, or repeated for auto-run), so the owner controls the
// pace. Pure compute over the tuning engine — no DOM.

import {
  spsaStep, encodeWeights, makeBook, DEFAULT_HYPERPARAMS,
  type MatchOptions, type SpsaHyperParams,
} from '../game/tuning';
import { DEFAULT_EVAL_WEIGHTS, type EvalWeights } from '../core/ai';
import type { Level } from '../core/level';

export interface GymInit {
  type: 'init';
  level: Level;
  bookSize: number;
  bookBaseSeed?: number;
  masterSeed?: number;
  reference?: EvalWeights;
  hyper?: SpsaHyperParams;
  match: MatchOptions;
}
export type GymRequest = GymInit | { type: 'step' };

export interface GymPoint {
  step: number;
  score: number;
  yPlus: number;
  yMinus: number;
  c: number;
  a: number;
  theta: number[];
}
export type GymResponse =
  | { type: 'ready'; book: number[]; referenceTheta: number[] }
  | { type: 'point'; point: GymPoint; champion: { step: number; score: number; theta: number[] }; sinceImprovement: number }
  | { type: 'error'; message: string };

const post = (m: GymResponse): void => (self as unknown as { postMessage(m: GymResponse): void }).postMessage(m);

interface State {
  level: Level;
  reference: EvalWeights;
  theta: number[];
  step: number;
  book: number[];
  hp: SpsaHyperParams;
  match: MatchOptions;
  masterSeed: number;
  champion: { step: number; score: number; theta: number[] };
  sinceImprovement: number;
}
let state: State | null = null;

self.onmessage = (event: MessageEvent<GymRequest>) => {
  try {
    const msg = event.data;
    if (msg.type === 'init') {
      const reference = msg.reference ?? DEFAULT_EVAL_WEIGHTS;
      const theta = encodeWeights(reference);
      const book = makeBook(msg.bookSize, msg.bookBaseSeed ?? 1);
      state = {
        level: msg.level, reference, theta, step: 0, book,
        hp: msg.hyper ?? DEFAULT_HYPERPARAMS, match: msg.match, masterSeed: msg.masterSeed ?? 1,
        champion: { step: -1, score: 0.5, theta: theta.slice() }, sinceImprovement: 0,
      };
      post({ type: 'ready', book, referenceTheta: theta.slice() });
      return;
    }
    if (msg.type === 'step') {
      if (!state) { post({ type: 'error', message: 'gym not initialised' }); return; }
      const s = state;
      const r = spsaStep(s.level, s.theta, s.reference, s.book, s.step, s.masterSeed, s.hp, s.match);
      s.theta = r.theta;
      const score = (r.yPlus + r.yMinus) / 2;
      const point: GymPoint = { step: s.step, score, yPlus: r.yPlus, yMinus: r.yMinus, c: r.c, a: r.a, theta: r.theta.slice() };
      if (score > s.champion.score) { s.champion = { step: s.step, score, theta: r.theta.slice() }; s.sinceImprovement = 0; }
      else { s.sinceImprovement += 1; }
      s.step += 1;
      post({ type: 'point', point, champion: s.champion, sinceImprovement: s.sinceImprovement });
      return;
    }
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
