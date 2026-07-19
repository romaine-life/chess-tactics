import { applyDrawableCatalog, type DrawableCatalog } from '@chess-tactics/board-render';
import { HttpError } from './http';

export async function fetchDrawableCatalog(): Promise<DrawableCatalog> {
  const response = await fetch('/api/drawable-catalog', { cache: 'no-cache' });
  if (!response.ok) throw await HttpError.fromResponse('load-drawable-catalog', response);
  return response.json() as Promise<DrawableCatalog>;
}

export async function loadDrawableCatalog(): Promise<boolean> {
  return applyDrawableCatalog(await fetchDrawableCatalog());
}
