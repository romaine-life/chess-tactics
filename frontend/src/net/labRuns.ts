// Game Lab run persistence client. Contract mirrors backend /api/lab-runs:
// runs are account-scoped JSONB documents — a light `meta` for the list view
// and the full `body` (level snapshot + every game record) fetched on demand.

import { requestJson } from './http';
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

export async function listLabRuns(): Promise<LabRunSummary[]> {
  const data = await requestJson<{ runs?: LabRunSummary[] }>('GET', '/api/lab-runs');
  return Array.isArray(data.runs) ? data.runs : [];
}

export async function saveLabRun(meta: LabRunMeta, body: LabRunBody): Promise<{ id: string }> {
  const data = await requestJson<{ id: string }>('POST', '/api/lab-runs', { meta, body });
  return { id: data.id };
}

export function loadLabRun(id: string): Promise<LabRunDoc> {
  return requestJson<LabRunDoc>('GET', `/api/lab-runs/${encodeURIComponent(id)}`);
}

export async function deleteLabRun(id: string): Promise<void> {
  await requestJson<{ ok: boolean }>('DELETE', `/api/lab-runs/${encodeURIComponent(id)}`);
}
