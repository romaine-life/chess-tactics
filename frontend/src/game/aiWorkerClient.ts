// Main-thread client for the enemy-reply worker (game/aiWorker). The store hands it a reply
// request + a callback; it runs the search in the worker (browser) or inline (tests / SSR / if
// the worker is unavailable) and calls back with the result — so the store's reply path has ONE
// shape regardless of WHERE the compute ran. The inline path is SYNCHRONOUS, which is what keeps
// the existing fake-timer tests driving the whole reply within vi.runAllTimers unchanged.

import { resolveEnemyReply, type EnemyReplyRequest, type EnemyReplyResult } from './enemyReply';

interface Incoming { id: number; req: EnemyReplyRequest }
type Outgoing =
  | { id: number; ok: true; result: EnemyReplyResult }
  | { id: number; ok: false; message: string };

let worker: Worker | null = null;
let unavailable = false; // no Worker global, or one that failed to construct — use inline forever
let nextId = 1;
const pending = new Map<number, { req: EnemyReplyRequest; cb: (r: EnemyReplyResult) => void }>();

function ensureWorker(): Worker | null {
  if (unavailable) return null;
  if (worker) return worker;
  if (typeof Worker === 'undefined') { unavailable = true; return null; } // node / jsdom / SSR
  try {
    const w = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (event: MessageEvent<Outgoing>) => {
      const msg = event.data;
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      // A worker-side failure must never stall a game — recompute the reply inline.
      entry.cb(msg.ok ? msg.result : resolveEnemyReply(entry.req));
    };
    w.onerror = () => {
      // The worker crashed: settle every waiting reply inline and drop to inline for the rest
      // of the session, so a live game can never hang on the AI.
      unavailable = true;
      worker = null;
      const waiting = [...pending.values()];
      pending.clear();
      for (const e of waiting) e.cb(resolveEnemyReply(e.req));
    };
    worker = w;
    return w;
  } catch {
    unavailable = true;
    worker = null;
    return null;
  }
}

/** Resolve the enemy reply for `req`, invoking `onResult` when the move is ready — off-thread in
 *  a browser (the board stays live for the whole think), synchronously inline where no worker
 *  exists. Exactly one `onResult` call per request. */
export function requestEnemyReply(req: EnemyReplyRequest, onResult: (result: EnemyReplyResult) => void): void {
  const w = ensureWorker();
  if (!w) { onResult(resolveEnemyReply(req)); return; }
  const id = nextId++;
  pending.set(id, { req, cb: onResult });
  try {
    w.postMessage({ id, req } satisfies Incoming);
  } catch {
    // Structured-clone or transport failure → fall back to an inline result for this reply.
    pending.delete(id);
    onResult(resolveEnemyReply(req));
  }
}
