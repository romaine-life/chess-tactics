// Cluster training-run client. Mirrors backend /api/train-runs: POST persists a run
// spec and launches a k8s Job on the D8als_v7 trainer pool; the Job writes progress +
// the champion back into the row's `body`, which GET reads. Account-scoped.

import { HttpError } from './http';
import type { Level } from '../core/level';
import type { SearchOptions } from '../core/ai';
import type { OpeningBookSettings, CurationSettings } from '../game/openingBook';

/** The run spec the trainer Job consumes (POST body). Only `level` is required. */
export interface TrainSpec {
  level: Level;
  steps?: number;
  restarts?: number;
  masterSeed?: number;
  holdoutFraction?: number;
  match?: { search: SearchOptions; maxPlies?: number };
  bookSettings?: OpeningBookSettings;
  curation?: CurationSettings;
}

/** The champion + held-out verdict the worker writes back. */
export interface TrainRunBody {
  startedAt?: string;
  finishedAt?: string;
  secs?: number;
  restarts?: { r: number; score: number }[];
  champion?: { step: number; score: number; theta: number[] };
  holdout?: { verdict: 'accept' | 'reject' | 'continue' | 'inconclusive' | 'skipped'; elo: number; n: number; w: number; d: number; l: number };
  train?: number;
}

/** pending | running | done | error | cancelled. */
export interface TrainRunSummary {
  id: string;
  spec: TrainSpec;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TrainRunDoc extends TrainRunSummary {
  body: TrainRunBody;
  job_name: string | null;
}

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

/** Launch a tuning run (persists the spec + starts the cluster Job). Returns the run
 * id and status ('running' in-cluster, 'pending' in local dev without a cluster). */
export async function launchTrainRun(spec: TrainSpec): Promise<{ id: string; status: string }> {
  return request<{ id: string; status: string }>('POST', '/api/train-runs', spec);
}

export async function listTrainRuns(): Promise<TrainRunSummary[]> {
  const data = await request<{ runs?: TrainRunSummary[] }>('GET', '/api/train-runs');
  return Array.isArray(data.runs) ? data.runs : [];
}

export function getTrainRun(id: string): Promise<TrainRunDoc> {
  return request<TrainRunDoc>('GET', `/api/train-runs/${encodeURIComponent(id)}`);
}

/** Cancel + delete a run (deletes the k8s Job, releasing the node). */
export async function cancelTrainRun(id: string): Promise<void> {
  await request<{ ok: boolean }>('DELETE', `/api/train-runs/${encodeURIComponent(id)}`);
}
