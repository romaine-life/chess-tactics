// Training-gym worker: a PURE stepper over the tuning engine. It holds NO hidden
// training state — the store owns every book's retained session. Each message is
// self-contained:
//   init     {level, match}            -> ready
//   generate {settings}                -> book   (the opening-book positions)
//   step     {book, session}           -> point  (the appended GymPoint + the
//                                                  UPDATED session to persist)
// Because the step is a pure function of (book, session), the UI can switch the
// active book at will and each book's session (champion + curve) resumes exactly.
// Pure compute over the deterministic engine (game/tuning.ts, game/openingBook.ts)
// — no DOM, no timers, no module-level accumulation beyond the immutable init.

import { DEFAULT_HYPERPARAMS, type MatchOptions, type SpsaHyperParams } from '../game/tuning';
import { generateOpeningBook, type BookPosition, type OpeningBookSettings } from '../game/openingBook';
import { advanceSession } from './gymStep';
import { DEFAULT_EVAL_WEIGHTS, type EvalWeights } from '../core/ai';
import type { Level } from '../core/level';
import type { GymSession, GymPoint } from './openingBooks';

// Re-export the session/point shapes the UI + store speak, so a consumer can pull
// them from the worker module without also importing the store.
export type { GymSession, GymPoint } from './openingBooks';

export interface GymInit {
  type: 'init';
  level: Level;
  /** Search + ply budget shared by generation (ranking) and the training games. */
  match: MatchOptions;
  /** Fixed reference the trajectory is measured against (default: shipped weights). */
  reference?: EvalWeights;
  hyper?: SpsaHyperParams;
  /** SPSA master seed (the whole trajectory replays identically from it). */
  masterSeed?: number;
}
export interface GymGenerate {
  type: 'generate';
  settings: OpeningBookSettings;
}
export interface GymStep {
  type: 'step';
  book: BookPosition[];
  session: GymSession;
}
export type GymRequest = GymInit | GymGenerate | GymStep;

export type GymResponse =
  | { type: 'ready' }
  | { type: 'book'; positions: BookPosition[] }
  | { type: 'point'; point: GymPoint; session: GymSession }
  | { type: 'error'; message: string };

const post = (m: GymResponse): void => (self as unknown as { postMessage(m: GymResponse): void }).postMessage(m);

interface WorkerConfig {
  level: Level;
  match: MatchOptions;
  reference: EvalWeights;
  hp: SpsaHyperParams;
  masterSeed: number;
}
// The ONLY retained state: the immutable init config. No trajectory, no champion,
// no theta — every step's mutable state travels in the message.
let config: WorkerConfig | null = null;

self.onmessage = (event: MessageEvent<GymRequest>): void => {
  try {
    const msg = event.data;

    if (msg.type === 'init') {
      config = {
        level: msg.level,
        match: msg.match,
        reference: msg.reference ?? DEFAULT_EVAL_WEIGHTS,
        hp: msg.hyper ?? DEFAULT_HYPERPARAMS,
        masterSeed: msg.masterSeed ?? 1,
      };
      post({ type: 'ready' });
      return;
    }

    if (msg.type === 'generate') {
      if (!config) { post({ type: 'error', message: 'gym not initialised' }); return; }
      const positions = generateOpeningBook(config.level, msg.settings, { search: config.match.search });
      post({ type: 'book', positions });
      return;
    }

    if (msg.type === 'step') {
      if (!config) { post({ type: 'error', message: 'gym not initialised' }); return; }
      const c = config;
      const { session, book } = msg;
      // One SPSA step from the session's current point over THIS book. The pure
      // reducer (gymStep.ts) is seeded by (masterSeed, session.k), so replaying a
      // session's k re-derives the same trajectory — the session is the complete,
      // portable training state.
      const { point, session: next } = advanceSession(
        { level: c.level, reference: c.reference, hp: c.hp, match: c.match, masterSeed: c.masterSeed },
        session,
        book,
      );
      post({ type: 'point', point, session: next });
      return;
    }
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
