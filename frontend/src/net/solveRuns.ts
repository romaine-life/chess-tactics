// Cluster board-solver client (ADR-0069 §5). Mirrors backend /api/solve-runs: POST
// persists a SolveSpec and launches a k8s Job on the trainer pool; the Job JSONB-patches
// feasibility + progress + the final proven value into the row's `body`, which GET reads.
// Account-scoped. Cloned from net/trainRuns.ts — contract types come from core/solver
// (not redefined here) so the wire shapes stay in lockstep with the engine.

import { HttpError } from './http';
import type {
  SolveSpec, FeasibilityReport, RootBounds, ProvenCounts, SolveResult,
} from '../core/solver';

/** The progressively-patched result the solver Job writes back (GET :id body).
 * Permissive/optional: the worker patches top-level keys on a cadence, so any subset
 * may be present at a given poll. `rootBounds` is the contract OBJECT (ruling 1), not a
 * `[number, number]` tuple. */
export interface SolveRunBody {
  phase?: string;
  feasibility?: FeasibilityReport;
  statesEnumerated?: number;
  statesSolved?: number;
  proven?: ProvenCounts;
  rootBounds?: RootBounds;
  coveragePct?: number;
  secs?: number;
  depth?: number;
  sweep?: number;
  complete?: boolean;
  rootValue?: SolveResult['rootValue'];
  pieceValues?: SolveResult['pieceValues'];
  provenCount?: number;
  mode?: SolveResult['mode'];
  tablebase?: unknown;
  tablebaseUrl?: string;
  tablebaseTruncated?: boolean;
  startedAt?: string;
  finishedAt?: string;
}

/** pending | running | done | error | cancelled. Matches dbListSolveRuns (F4): no
 * `body`, no `job_name`. */
export interface SolveRunSummary {
  id: string;
  spec: SolveSpec;
  status: string;
  created_at: string;
  updated_at: string;
}

/** Matches dbGetSolveRun (F4): adds `body` + `job_name`. */
export interface SolveRunDoc extends SolveRunSummary {
  body: SolveRunBody;
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

/** Launch a solve run (persists the spec + starts the cluster Job). Returns the run id
 * and status ('running' in-cluster, 'pending' in local dev without a cluster). */
export async function launchSolveRun(spec: SolveSpec): Promise<{ id: string; status: string }> {
  return request<{ id: string; status: string }>('POST', '/api/solve-runs', spec);
}

export async function listSolveRuns(): Promise<SolveRunSummary[]> {
  const data = await request<{ runs?: SolveRunSummary[] }>('GET', '/api/solve-runs');
  return Array.isArray(data.runs) ? data.runs : [];
}

export function getSolveRun(id: string): Promise<SolveRunDoc> {
  return request<SolveRunDoc>('GET', `/api/solve-runs/${encodeURIComponent(id)}`);
}

/** Cancel a run (deletes the k8s Job, releasing the node) — cancel-not-purge: the row is
 * kept with status='cancelled' and its partial body, so it stays viewable (ADR §5). */
export async function cancelSolveRun(id: string): Promise<void> {
  await request<{ ok: boolean }>('DELETE', `/api/solve-runs/${encodeURIComponent(id)}`);
}
