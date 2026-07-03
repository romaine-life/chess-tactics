// Orchestrates a Game Lab run across a pool of self-play workers. Seeds are
// dealt round-robin; records stream back as each game finishes (any order) and
// the final list is sorted by seed so a run is displayed deterministically.

import type { GameRecord } from '../game/selfplay';
import type { Level } from '../core/level';
import type { SearchOptions } from '../core/ai';
import type { LabWorkerRequest, LabWorkerResponse } from './labWorker';

export interface LabRunHandle {
  /** Resolves with all records (sorted by seed) once every worker finishes. */
  promise: Promise<GameRecord[]>;
  /** Terminate all workers; the promise rejects with 'cancelled'. */
  cancel: () => void;
}

export function runLabGames(
  level: Level,
  seeds: readonly number[],
  search: SearchOptions | undefined,
  onGame: (record: GameRecord, done: number, total: number) => void,
): LabRunHandle {
  const poolSize = Math.max(1, Math.min(8, (navigator.hardwareConcurrency ?? 4) - 1, seeds.length));
  const workers: Worker[] = [];
  const records: GameRecord[] = [];
  let cancelled = false;
  // Hoisted so cancel() can settle the promise — see the LabRunHandle contract.
  let rejectRun: (reason: Error) => void = () => undefined;

  const promise = new Promise<GameRecord[]>((resolve, reject) => {
    rejectRun = reject;
    let workersDone = 0;
    const finishWorker = (): void => {
      workersDone += 1;
      if (workersDone === poolSize) {
        workers.forEach((w) => w.terminate());
        resolve([...records].sort((a, b) => a.seed - b.seed));
      }
    };
    const fail = (message: string): void => {
      workers.forEach((w) => w.terminate());
      reject(new Error(message));
    };

    for (let i = 0; i < poolSize; i += 1) {
      const worker = new Worker(new URL('./labWorker.ts', import.meta.url), { type: 'module' });
      workers.push(worker);
      worker.onmessage = (event: MessageEvent<LabWorkerResponse>) => {
        if (cancelled) return;
        const msg = event.data;
        if (msg.type === 'game') {
          records.push(msg.record);
          onGame(msg.record, records.length, seeds.length);
        } else if (msg.type === 'done') {
          finishWorker();
        } else {
          fail(msg.message);
        }
      };
      worker.onerror = (event) => fail(event.message || 'lab worker crashed');
      const assigned = seeds.filter((_, idx) => idx % poolSize === i);
      const request: LabWorkerRequest = { level, seeds: assigned, search };
      worker.postMessage(request);
    }
  });
  // A rejected run must have a consumer or it surfaces as an unhandled rejection;
  // GameLab's .catch handles it, and this no-op guard covers a cancel with no await.
  promise.catch(() => undefined);

  return {
    promise,
    cancel: () => {
      cancelled = true;
      workers.forEach((w) => w.terminate());
      rejectRun(new Error('cancelled'));
    },
  };
}
