// Client for shareable public maps (backend: public_maps). Publishing mints a stable, owner-free
// public id for one of the signed-in user's own maps so it can be pasted as a link that anyone can
// preview (Open Graph) and play — see /play?map=<id>. The read is UNAUTHENTICATED (maps are
// public-by-link), so a signed-out visitor can load and play a shared map.

import type { Level } from '../core/level';
import { HttpError } from './http';

export interface PublishedMap {
  public_id: string;
  /** Absolute shareable URL, e.g. https://chess.romaine.life/play?map=<id>. */
  url: string;
}

/** Publish (or refresh) a shareable link for one of the caller's own maps. Requires sign-in. */
export async function publishMap(levelId: string): Promise<PublishedMap> {
  const res = await fetch('/api/maps/publish', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ levelId }),
  });
  if (!res.ok) throw new HttpError('publish map', res.status);
  return res.json() as Promise<PublishedMap>;
}

/** Load a shared map's level snapshot by its public id. Public — no sign-in needed. */
export async function fetchPublicMap(publicId: string): Promise<Level> {
  const res = await fetch(`/api/maps/${encodeURIComponent(publicId)}`, { cache: 'no-cache' });
  if (!res.ok) throw new HttpError('load map', res.status);
  const body = (await res.json()) as { level?: Level };
  if (!body.level || typeof body.level !== 'object') throw new HttpError('load map', 502);
  return body.level;
}
