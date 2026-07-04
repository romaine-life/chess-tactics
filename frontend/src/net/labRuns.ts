// Game Lab run persistence client. Contract mirrors backend /api/lab-runs:
// runs are account-scoped JSONB documents — a light `meta` for the list view
// and the full `body` (level snapshot + every game record) fetched on demand.

import { HttpError } from './http';
import type { GameRecord } from '../game/selfplay';
import type { Level } from '../core/level';
import type { SearchOptions } from '../core/ai';

/** Light, listable facts about a run — everything the runs shelf shows. */
export interface LabRunMeta {
  name: string;
  levelId: string;
  levelName: string;
  games: number;
  playerWins: number;
  enemyWins: number;
  draws: number;
  avgPlies: number;
  search: { maxDepth?: number; timeBudgetMs?: number; maxNodes?: number };
  seedBase: number;
  /** Human note about what this run varies ("bishop removed"), if anything. */
  variant?: string;
}

/** The full document: the level SNAPSHOT (immune to later edits — replays must
 * reproduce the boards as they were run) plus every recorded game. */
export interface LabRunBody {
  level: Level;
  search: SearchOptions;
  records: GameRecord[];
}

export interface LabRunSummary {
  id: string;
  meta: LabRunMeta;
  created_at: string;
}

export interface LabRunDoc extends LabRunSummary {
  body: LabRunBody;
}

// One fetch core for every endpoint (mirrors net/lobbies.ts's `request`): same
// credentials + JSON + ok-check + HttpError in a single place, so a cross-cutting
// change (retry, 401 handling, an abort signal) is one edit rather than four.
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new HttpError(`${method} ${path}`, res.status);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export async function listLabRuns(): Promise<LabRunSummary[]> {
  const data = await request<{ runs?: LabRunSummary[] }>('GET', '/api/lab-runs');
  return Array.isArray(data.runs) ? data.runs : [];
}

export async function saveLabRun(meta: LabRunMeta, body: LabRunBody): Promise<{ id: string }> {
  const data = await request<{ id: string }>('POST', '/api/lab-runs', { meta, body });
  return { id: data.id };
}

export function loadLabRun(id: string): Promise<LabRunDoc> {
  return request<LabRunDoc>('GET', `/api/lab-runs/${encodeURIComponent(id)}`);
}

export async function deleteLabRun(id: string): Promise<void> {
  await request<{ ok: boolean }>('DELETE', `/api/lab-runs/${encodeURIComponent(id)}`);
}
