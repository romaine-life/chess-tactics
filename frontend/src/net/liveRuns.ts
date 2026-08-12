import { HttpError } from './http';

// Presence for the observation feature: who is playing right now and roughly where they are.
// A caption, not a Run — enough to decide whether to watch, and nothing more. Reading this
// starts no work on the player's side; observation begins when a watcher actually arrives.

export interface LiveRunPresence {
  /** Null for a guest Run — a guest has no address. Render owner_label, never this. */
  owner_email: string | null;
  owner_kind: 'account' | 'guest';
  /** Always present: the email for an account, "Guest <prefix>" for a guest. */
  owner_label: string;
  /** Opaque, derived from the owner. The watch ADDRESS is built from this, never the email. */
  handle: string;
  run_id: string | null;
  phase: string | null;
  /** 1-based, the way the Run screen counts. Null when the document has no battle index. */
  battle: number | null;
  battle_count: number | null;
  war_name: string | null;
  updated_at: string;
}

export async function fetchLiveRuns(): Promise<LiveRunPresence[]> {
  const response = await fetch('/api/admin/live-runs', { credentials: 'include', cache: 'no-cache' });
  if (!response.ok) throw await HttpError.fromResponse('load-live-runs', response);
  const body = (await response.json()) as { runs?: LiveRunPresence[] };
  return Array.isArray(body.runs) ? body.runs : [];
}

/** The one-line caption for a Run in progress — "Battle 4 of 7 · Bona Vacantia". */
export function liveRunCaption(run: LiveRunPresence): string {
  const parts: string[] = [];
  if (run.phase) parts.push(PHASE_LABELS[run.phase] ?? run.phase);
  if (run.battle !== null) {
    parts.push(run.battle_count ? `Battle ${run.battle} of ${run.battle_count}` : `Battle ${run.battle}`);
  }
  if (run.war_name) parts.push(run.war_name);
  return parts.join(' · ') || 'Run in progress';
}

const PHASE_LABELS: Record<string, string> = {
  commendatio: 'Commendatio',
  sectio: 'Sectio',
  deployment: 'Deployment',
  battle: 'Battle',
  aftermath: 'Aftermath',
  victory: 'Victory',
};
