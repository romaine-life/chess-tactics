// Client for the campaign-editor workspace (all campaigns + their level docs as
// one document). File-backed on the server today; swappable to a DB later.

import type { Campaign, Level } from '../core/level';

export interface Workspace {
  campaigns: Campaign[];
  levels: Record<string, Level>;
}

export async function loadWorkspace(): Promise<Workspace> {
  const res = await fetch('/api/campaign-workspace');
  if (!res.ok) throw new Error(`load failed (${res.status})`);
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
    body: JSON.stringify(ws),
  });
  if (!res.ok) throw new Error(`save failed (${res.status})`);
  return res.json() as Promise<{ ok: boolean }>;
}
