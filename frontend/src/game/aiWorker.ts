// Web Worker: resolves the enemy half-turn off the main thread so the board stays live —
// animation AND premove input — while the CPU thinks. Pure compute over the core (no DOM, no
// store, no localStorage); see game/enemyReply for the resolver and game/aiWorkerClient for the
// main-thread side. Instantiated with Vite's native ESM-worker form (see lab/labRunner).

import { resolveEnemyReply, type EnemyReplyRequest, type EnemyReplyResult } from './enemyReply';

interface Incoming { id: number; req: EnemyReplyRequest }
type Outgoing =
  | { id: number; ok: true; result: EnemyReplyResult }
  | { id: number; ok: false; message: string };

const post = (msg: Outgoing): void => (self as unknown as { postMessage(m: Outgoing): void }).postMessage(msg);

self.onmessage = (event: MessageEvent<Incoming>): void => {
  const { id, req } = event.data;
  try {
    post({ id, ok: true, result: resolveEnemyReply(req) });
  } catch (error) {
    post({ id, ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
