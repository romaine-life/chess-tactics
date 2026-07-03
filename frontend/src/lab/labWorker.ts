// Game Lab self-play worker: plays its assigned seeds to completion and streams
// each finished GameRecord back. Pure compute over the core — no DOM access —
// so N of these run the Lab's games in parallel without stalling the page.

import { playLevelGame, type GameRecord } from '../game/selfplay';
import type { Level } from '../core/level';
import type { SearchOptions } from '../core/ai';

export interface LabWorkerRequest {
  level: Level;
  seeds: number[];
  search?: SearchOptions;
  maxPlies?: number;
}

export type LabWorkerResponse =
  | { type: 'game'; record: GameRecord }
  | { type: 'done' }
  | { type: 'error'; message: string };

const post = (msg: LabWorkerResponse): void => {
  (self as unknown as { postMessage(m: LabWorkerResponse): void }).postMessage(msg);
};

self.onmessage = (event: MessageEvent<LabWorkerRequest>) => {
  const { level, seeds, search, maxPlies } = event.data;
  try {
    for (const seed of seeds) {
      post({ type: 'game', record: playLevelGame(level, { seed, search, maxPlies }) });
    }
    post({ type: 'done' });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
