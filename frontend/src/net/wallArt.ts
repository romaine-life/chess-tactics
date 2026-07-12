import { applyLiveWallArt, type WallArtMap } from '../core/wallArt';
import { HttpError } from './http';

const WALL_ART_ID = 'default';
const WALL_ART_CLIENT_SCHEMA_VERSION = 2;

function asWallArtMap(value: unknown): WallArtMap {
  return value && typeof value === 'object' ? (value as WallArtMap) : {};
}

export async function fetchLiveWallArt(): Promise<WallArtMap> {
  try {
    const res = await fetch(`/api/wall-art/${WALL_ART_ID}`, { cache: 'no-cache' });
    if (!res.ok) return {};
    const body = (await res.json()) as { portfolio?: { data?: unknown } };
    return asWallArtMap(body.portfolio?.data);
  } catch {
    return {};
  }
}

export async function loadLiveWallArt(): Promise<boolean> {
  const overrides = await fetchLiveWallArt();
  return applyLiveWallArt(overrides);
}

export async function saveLiveWallArt(assets: WallArtMap): Promise<{ revision: number }> {
  const res = await fetch(`/api/wall-art/${WALL_ART_ID}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ data: assets, client_schema_version: WALL_ART_CLIENT_SCHEMA_VERSION }),
  });
  if (!res.ok) throw new HttpError('save-wall-art', res.status);
  const body = (await res.json()) as { portfolio?: { revision?: number } };
  return { revision: body.portfolio?.revision ?? 0 };
}
