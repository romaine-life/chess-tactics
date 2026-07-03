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

export async function listLabRuns(): Promise<LabRunSummary[]> {
  const res = await fetch('/api/lab-runs', { credentials: 'include' });
  if (!res.ok) throw new HttpError('list lab runs', res.status);
  const data = (await res.json()) as { runs?: LabRunSummary[] };
  return Array.isArray(data.runs) ? data.runs : [];
}

export async function saveLabRun(meta: LabRunMeta, body: LabRunBody): Promise<{ id: string }> {
  const res = await fetch('/api/lab-runs', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ meta, body }),
  });
  if (!res.ok) throw new HttpError('save lab run', res.status);
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

export async function loadLabRun(id: string): Promise<LabRunDoc> {
  const res = await fetch(`/api/lab-runs/${encodeURIComponent(id)}`, { credentials: 'include' });
  if (!res.ok) throw new HttpError('load lab run', res.status);
  return (await res.json()) as LabRunDoc;
}

export async function deleteLabRun(id: string): Promise<void> {
  const res = await fetch(`/api/lab-runs/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new HttpError('delete lab run', res.status);
}
