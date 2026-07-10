// TD piece-value worker — gymWorker's pure-stepper contract, reduced to the owner's
// driving grammar:
//   init {level}             -> ready
//   step {cfg, session, n}   -> progress… -> done {session, summary?, stopped}
//   run  {cfg, session}      -> ditto, n = the remaining budget
//   stop {}                  -> flips a flag; it lands between games via the yield
// The ONLY retained state is the init level: every mutable thing (the session)
// travels in the message, so the UI owns it and a level switch simply re-inits.
// Deliberately NO pause/resume machinery (gymWorker needs it because an SPSA step is
// a long multi-game atom) — here the atomic unit is one ms-fast game, so STOP between
// games commits cleanly. When a command finishes AT the budget it also folds the
// seedCount mean ± spread summary (posting summary-progress per seed, stoppable too);
// re-issuing `run` at a completed budget recomputes just that fold.
//
// The logic lives in lab/tdSession.ts (pure, node-tested by tdWorker.test.ts); this
// shell only wires messages, the stop flag, the yield, and the progress cadence.

import type { Level } from '../core/level';
import type { SeedSummary } from '../game/tdValues';
import { advanceTd, tdSeedSummary, type TdRunConfig, type TdSession } from './tdSession';

export type { TdProbe, TdRunConfig, TdSession } from './tdSession';

export interface TdInit { type: 'init'; level: Level }
export interface TdStep { type: 'step'; cfg: TdRunConfig; session: TdSession; n: number }
export interface TdRun { type: 'run'; cfg: TdRunConfig; session: TdSession }
export interface TdStop { type: 'stop' }
export type TdRequest = TdInit | TdStep | TdRun | TdStop;

export type TdResponse =
  | { type: 'ready' }
  | { type: 'progress'; session: TdSession }
  | { type: 'summary-progress'; seedsDone: number; seedsTotal: number }
  | { type: 'done'; session: TdSession; summary?: SeedSummary; stopped: boolean }
  | { type: 'error'; message: string };

const post = (m: TdResponse): void => (self as unknown as { postMessage(m: TdResponse): void }).postMessage(m);

// The ONLY retained state (gymWorker's init contract).
let level: Level | null = null;
let running = false;
let stopFlag = false;

/** Await between games so a queued `stop` message gets handled — without this a
 * synchronous game loop would never see it (recon hazard #1). */
const yieldToMessages = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

/** Post per game for a hand-stepped burst; throttle a long RUN so ms-fast games don't
 * flood React with messages (recon hazard #7) — the numbers still move ~10×/second. */
const PER_GAME_POST_MAX = 32;
const THROTTLE_MS = 100;

self.onmessage = (event: MessageEvent<TdRequest>): void => {
  void handleMessage(event);
};

async function handleMessage(event: MessageEvent<TdRequest>): Promise<void> {
  try {
    const msg = event.data;

    if (msg.type === 'stop') {
      stopFlag = true;
      return;
    }

    if (msg.type === 'init') {
      level = msg.level;
      post({ type: 'ready' });
      return;
    }

    if (!level) { post({ type: 'error', message: 'value learner not initialised' }); return; }
    if (running) return; // one command at a time; the UI gates its transport anyway
    running = true;
    stopFlag = false;
    try {
      const lvl = level;
      const { cfg } = msg;
      const n = msg.type === 'step' ? msg.n : cfg.opts.games - msg.session.train.game;
      const perGame = n <= PER_GAME_POST_MAX;
      let lastPost = 0;
      const control = { afterGame: yieldToMessages, shouldStop: (): boolean => stopFlag };
      const { session, stopped } = await advanceTd(lvl, cfg, msg.session, n, (s) => {
        const now = Date.now();
        if (perGame || s.train.game >= cfg.opts.games || now - lastPost >= THROTTLE_MS) {
          lastPost = now;
          post({ type: 'progress', session: s });
        }
      }, control);
      let summary: SeedSummary | undefined;
      let summaryStopped = false;
      if (!stopped && session.train.game >= cfg.opts.games) {
        const folded = await tdSeedSummary(lvl, cfg, session.train.weights,
          (seedsDone, seedsTotal) => post({ type: 'summary-progress', seedsDone, seedsTotal }),
          control);
        if (folded) summary = folded;
        else summaryStopped = true;
      }
      post({ type: 'done', session, ...(summary ? { summary } : {}), stopped: stopped || summaryStopped });
    } finally {
      running = false;
      stopFlag = false;
    }
  } catch (error) {
    running = false;
    stopFlag = false;
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}
