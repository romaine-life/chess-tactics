// Client for the campaign-editor workspace (all campaigns + their level docs as
// one document). File-backed on the server today; swappable to a DB later.

import type { Campaign, Level } from '../core/level';
import { HttpError } from './http';

export interface Workspace {
  campaigns: Campaign[];
  levels: Record<string, Level>;
}

export async function loadWorkspace(): Promise<Workspace> {
  const res = await fetch('/api/campaign-workspace', { credentials: 'include' });
  if (!res.ok) throw await HttpError.fromResponse('load', res);
  const data = (await res.json()) as Partial<Workspace>;
  return {
    campaigns: Array.isArray(data.campaigns) ? data.campaigns : [],
    levels: data.levels && typeof data.levels === 'object' ? data.levels : {},
  };
}

export async function saveWorkspace(ws: Workspace): Promise<{ ok: boolean }> {
  const res = await fetch('/api/campaign-workspace', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(ws),
  });
  if (!res.ok) throw await HttpError.fromResponse('save', res);
  return res.json() as Promise<{ ok: boolean }>;
}

// --- Official (global) tier ------------------------------------------------
// The live global DB row (public GET) is the SINGLE and ONLY source of truth for official
// campaigns. There is no committed fixture and no fallback: a DB miss/error resolves to NO
// officials (empty), never stale content. In dev this means a frontend running with no backend
// shows no officials. Never throws — officials must survive any backend failure.
const OFFICIAL_ID = 'default';

function asWorkspace(value: unknown): Workspace {
  const data = (value && typeof value === 'object' ? value : {}) as Partial<Workspace>;
  return {
    campaigns: Array.isArray(data.campaigns) ? data.campaigns : [],
    levels: data.levels && typeof data.levels === 'object' ? data.levels : {},
  };
}

export async function loadOfficialCampaigns(): Promise<Workspace> {
  // The live DB row (public GET, design_portfolios envelope) is authoritative. Any error or a
  // synthesized-empty miss resolves to no officials rather than throwing.
  const empty: Workspace = { campaigns: [], levels: {} };
  try {
    const res = await fetch(`/api/official-campaigns/${OFFICIAL_ID}`, { cache: 'no-cache' });
    if (!res.ok) return empty;
    const body = (await res.json()) as { portfolio?: { data?: unknown } };
    return asWorkspace(body.portfolio?.data);
  } catch {
    return empty;
  }
}

export async function saveOfficialCampaigns(ws: Workspace): Promise<{ revision: number }> {
  const res = await fetch(`/api/official-campaigns/${OFFICIAL_ID}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ data: ws }),
  });
  if (!res.ok) throw await HttpError.fromResponse('save-official', res);
  const body = (await res.json()) as { portfolio?: { revision?: number } };
  return { revision: body.portfolio?.revision ?? 0 };
}
