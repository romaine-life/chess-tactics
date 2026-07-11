import {
  applyLiveMediaCatalog,
  assertCriticalLiveMediaAvailable,
  type LiveMediaCatalog,
} from '@chess-tactics/board-render';
import { HttpError } from './http';

export async function fetchLiveMediaCatalog(): Promise<LiveMediaCatalog> {
  const response = await fetch('/api/asset-catalog', { cache: 'no-cache' });
  if (!response.ok) throw await HttpError.fromResponse('load-live-media-catalog', response);
  return response.json() as Promise<LiveMediaCatalog>;
}

export async function loadLiveMediaCatalog(): Promise<boolean> {
  const catalog = await fetchLiveMediaCatalog();
  const changed = applyLiveMediaCatalog(catalog);
  assertCriticalLiveMediaAvailable();
  return changed;
}
