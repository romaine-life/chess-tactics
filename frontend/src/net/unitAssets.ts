import {
  applyLiveUnitCatalog,
  type Direction,
  type Faction,
  type LiveUnitCatalog,
  type PieceId,
} from '../ui/unitCatalog';
import { applyPublishedUnitCatalog } from '../ui/unitSizeTuning';
import { HttpError } from './http';

export type UnitAssetMetadataInput = {
  family: PieceId;
  label: string;
  method: string;
  notes?: string;
  footprintShape: 'circle' | 'square';
  sourceCanvasWidth: number;
  sourceCanvasHeight: number;
  sourceFootprintPx: number;
  anchorX: number;
  anchorY: number;
};

function applyCatalog(catalog: LiveUnitCatalog): boolean {
  const changed = applyLiveUnitCatalog(catalog);
  applyPublishedUnitCatalog(catalog);
  return changed;
}

async function jsonResponse<T>(action: string, response: Response): Promise<T> {
  if (!response.ok) throw await HttpError.fromResponse(action, response);
  return response.json() as Promise<T>;
}

export async function fetchLiveUnitCatalog(): Promise<LiveUnitCatalog> {
  const response = await fetch('/api/unit-catalog', { cache: 'no-cache' });
  return jsonResponse<LiveUnitCatalog>('load-unit-catalog', response);
}

export async function loadLiveUnitCatalog(): Promise<boolean> {
  const catalog = await fetchLiveUnitCatalog();
  return applyCatalog(catalog);
}

export async function fetchAdminUnitCatalog(): Promise<LiveUnitCatalog> {
  const response = await fetch('/api/admin/unit-assets', { cache: 'no-cache', credentials: 'include' });
  const catalog = await jsonResponse<LiveUnitCatalog>('load-unit-assets', response);
  applyCatalog(catalog);
  return catalog;
}

export async function createUnitAsset(input: UnitAssetMetadataInput): Promise<{ assetId: string; catalog: LiveUnitCatalog }> {
  const response = await fetch('/api/admin/unit-assets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  const body = await jsonResponse<{ assetId: string; catalog: LiveUnitCatalog }>('create-unit-asset', response);
  applyCatalog(body.catalog);
  return body;
}

export async function updateUnitAsset(
  assetId: string,
  input: Partial<UnitAssetMetadataInput>,
  expectedRevision: number,
): Promise<LiveUnitCatalog> {
  const response = await fetch(`/api/admin/unit-assets/${encodeURIComponent(assetId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'if-match': `"${expectedRevision}"` },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  const body = await jsonResponse<{ catalog: LiveUnitCatalog }>('update-unit-asset', response);
  applyCatalog(body.catalog);
  return body.catalog;
}

export async function uploadUnitSprite(
  assetId: string,
  palette: Faction,
  direction: Direction,
  png: Blob,
  expectedRevision: number,
): Promise<{ rowRevision: number; catalogRevision: number }> {
  const response = await fetch(
    `/api/admin/unit-assets/${encodeURIComponent(assetId)}/sprites/${encodeURIComponent(palette)}/${encodeURIComponent(direction)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'image/png', 'if-match': `"${expectedRevision}"` },
      credentials: 'include',
      body: png,
    },
  );
  return jsonResponse<{ rowRevision: number; catalogRevision: number }>('upload-unit-sprite', response);
}

export async function publishUnitScale(
  family: PieceId,
  displayScalePercent: number,
  expectedRevision: number,
): Promise<LiveUnitCatalog> {
  const response = await fetch(`/api/admin/unit-families/${family}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'if-match': `"${expectedRevision}"` },
    credentials: 'include',
    body: JSON.stringify({ displayScalePercent }),
  });
  const body = await jsonResponse<{ catalog: LiveUnitCatalog }>('publish-unit-scale', response);
  applyCatalog(body.catalog);
  return body.catalog;
}

async function changeUnitAssetState(assetId: string, action: 'accept' | 'archive', expectedRevision: number): Promise<LiveUnitCatalog> {
  const response = await fetch(`/api/admin/unit-assets/${encodeURIComponent(assetId)}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'if-match': `"${expectedRevision}"` },
    credentials: 'include',
    body: JSON.stringify({ expectedRevision }),
  });
  const body = await jsonResponse<{ catalog: LiveUnitCatalog }>(`${action}-unit-asset`, response);
  applyCatalog(body.catalog);
  return body.catalog;
}

export const acceptUnitAsset = (assetId: string, expectedRevision: number): Promise<LiveUnitCatalog> =>
  changeUnitAssetState(assetId, 'accept', expectedRevision);

export const archiveUnitAsset = (assetId: string, expectedRevision: number): Promise<LiveUnitCatalog> =>
  changeUnitAssetState(assetId, 'archive', expectedRevision);
