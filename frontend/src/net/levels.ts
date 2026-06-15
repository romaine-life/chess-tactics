// Client for the new-format level persistence API (/api/levels). The body sent
// and received is the exact shared Level document — file-backed on the server
// today, swappable to a DB without touching this client.

import type { Level } from '../core/level';

export interface LevelSummary {
  id: string;
  name?: string;
  cols?: number;
  rows?: number;
  updated_at?: string;
}

export async function saveLevel(level: Level): Promise<{ ok: boolean; revision: number }> {
  const res = await fetch(`/api/levels/${encodeURIComponent(level.id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ level }),
  });
  if (!res.ok) throw new Error(`save failed (${res.status})`);
  return res.json() as Promise<{ ok: boolean; revision: number }>;
}

export async function loadLevel(id: string): Promise<Level> {
  const res = await fetch(`/api/levels/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`load failed (${res.status})`);
  const data = (await res.json()) as { level: Level };
  return data.level;
}

export async function listLevels(): Promise<LevelSummary[]> {
  const res = await fetch('/api/levels');
  if (!res.ok) throw new Error(`list failed (${res.status})`);
  return (await res.json() as { levels: LevelSummary[] }).levels;
}
