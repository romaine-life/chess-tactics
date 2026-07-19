import type { DrawableAsset, DrawableCatalog } from '@chess-tactics/board-render';
import { HttpError } from './http';

export interface AdminDrawableAsset extends Omit<DrawableAsset, 'lifecycleState'> {
  lifecycleState: 'active' | 'retired';
}

export interface AdminDrawableCatalog extends Omit<DrawableCatalog, 'assets'> {
  assets: AdminDrawableAsset[];
}

export interface SaveDrawableAssetInput {
  id: string;
  kind: string;
  label: string;
  sortOrder: number;
  lifecycleState: 'active' | 'retired';
  behavior: Record<string, unknown>;
  metadata: Record<string, unknown>;
  media: Record<string, string>;
  expectedRevision: number;
}

async function jsonResponse<T>(action: string, response: Response): Promise<T> {
  if (!response.ok) throw await HttpError.fromResponse(action, response);
  return response.json() as Promise<T>;
}

export async function fetchAdminDrawableCatalog(): Promise<AdminDrawableCatalog> {
  const response = await fetch('/api/admin/drawable-assets', {
    cache: 'no-store',
    credentials: 'include',
  });
  return jsonResponse<AdminDrawableCatalog>('load-drawable-admin-catalog', response);
}

export async function saveDrawableAsset(input: SaveDrawableAssetInput): Promise<{
  asset: AdminDrawableAsset;
  catalogRevision: number;
}> {
  const response = await fetch(`/api/admin/drawable-assets/${encodeURIComponent(input.id)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': `"${input.expectedRevision}"`,
    },
    body: JSON.stringify({
      kind: input.kind,
      label: input.label,
      sortOrder: input.sortOrder,
      lifecycleState: input.lifecycleState,
      behavior: input.behavior,
      metadata: input.metadata,
      media: input.media,
    }),
  });
  return jsonResponse('save-drawable-asset', response);
}
