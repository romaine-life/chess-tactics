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
  if (!res.ok) throw new HttpError('load', res.status);
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
  if (!res.ok) throw new HttpError('save', res.status);
  return res.json() as Promise<{ ok: boolean }>;
}

// --- Official (global) tier ------------------------------------------------
// The live global DB row (public GET) is the SINGLE source of truth for official campaigns. The
// committed official.json is a DEV-ONLY seed fixture — it is NOT shipped to the prod image and is
// only read as a fallback under `import.meta.env.DEV`. In production a DB miss yields NO officials
// rather than STALE test data (a stale snapshot shown to real players is worse than an outage).
// Never throws — officials must survive any backend failure.
const OFFICIAL_ID = 'default';
const OFFICIAL_FILE = '/assets/campaigns/official.json';

function asWorkspace(value: unknown): Workspace {
  const data = (value && typeof value === 'object' ? value : {}) as Partial<Workspace>;
  return {
    campaigns: Array.isArray(data.campaigns) ? data.campaigns : [],
    levels: data.levels && typeof data.levels === 'object' ? data.levels : {},
  };
}

// DEV-ONLY: the committed seed fixture, so a local frontend with no backend still shows officials.
// In a production build this returns empty — the fixture is never a prod data source.
async function loadOfficialFallback(): Promise<Workspace> {
  if (!import.meta.env.DEV) return { campaigns: [], levels: {} };
  try {
    const res = await fetch(OFFICIAL_FILE, { cache: 'no-cache' });
    if (!res.ok) return { campaigns: [], levels: {} };
    return asWorkspace(await res.json());
  } catch {
    return { campaigns: [], levels: {} };
  }
}

export async function loadOfficialCampaigns(): Promise<Workspace> {
  // The live DB row (public GET, design_portfolios envelope) is authoritative. On any error or a
  // synthesized-empty miss, fall back to the DEV-only fixture (empty in prod).
  try {
    const res = await fetch(`/api/official-campaigns/${OFFICIAL_ID}`, { cache: 'no-cache' });
    if (!res.ok) return loadOfficialFallback();
    const body = (await res.json()) as { portfolio?: { data?: unknown } };
    const ws = asWorkspace(body.portfolio?.data);
    return ws.campaigns.length ? ws : loadOfficialFallback();
  } catch {
    return loadOfficialFallback();
  }
}

export async function saveOfficialCampaigns(ws: Workspace): Promise<{ revision: number }> {
  const res = await fetch(`/api/official-campaigns/${OFFICIAL_ID}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ data: ws }),
  });
  if (!res.ok) throw new HttpError('save-official', res.status);
  const body = (await res.json()) as { portfolio?: { revision?: number } };
  return { revision: body.portfolio?.revision ?? 0 };
}
