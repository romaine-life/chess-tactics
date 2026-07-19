import { drawableAssets, type DrawableAsset } from '@chess-tactics/board-render';

export type NineSliceCatalogAsset = {
  record: DrawableAsset;
  id: string;
  label: string;
  kind: 'frame' | 'bar' | 'junction';
  theme?: string;
  frame: { w: number; h: number };
  carve: boolean;
  flipSides: boolean;
  railSource?: 'panel-line' | 'edge';
  railFit?: 'tile' | 'stretch';
  junctionStyle?: 'gold' | 'natural';
  host?: { slice?: number; previewWidth?: number };
  geometry: Record<string, unknown>;
  media: Record<string, string>;
};

function positive(value: unknown, field: string, id: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`nine-slice ${id} has invalid ${field}`);
  return value;
}

export function nineSliceCatalogAssets(): NineSliceCatalogAsset[] {
  return drawableAssets('nine-slice').map((record) => {
    const behavior = record.behavior;
    const frame = behavior.frame;
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw new Error(`nine-slice ${record.id} has no frame geometry`);
    const rawKind = behavior.kind;
    const kind = rawKind === 'bar' || rawKind === 'junction' ? rawKind : 'frame';
    const media = Object.fromEntries(Object.entries(record.media).map(([role, binding]) => [role, binding.media.immutableUrl]));
    if (kind === 'frame' && ['corner', 'edge', 'fill', 'target'].some((role) => !media[role])) throw new Error(`nine-slice ${record.id} is missing frame media`);
    if (kind === 'bar' && (!media.edge || !media.tee)) throw new Error(`nine-slice ${record.id} is missing bar media`);
    return {
      record,
      id: record.id,
      label: record.label,
      kind,
      theme: typeof behavior.theme === 'string' ? behavior.theme : undefined,
      frame: { w: positive((frame as Record<string, unknown>).w, 'frame width', record.id), h: positive((frame as Record<string, unknown>).h, 'frame height', record.id) },
      carve: behavior.carve === true,
      flipSides: behavior.flipSides === true,
      railSource: behavior.railSource === 'edge' ? 'edge' : behavior.railSource === 'panel-line' ? 'panel-line' : undefined,
      railFit: behavior.railFit === 'tile' ? 'tile' : behavior.railFit === 'stretch' ? 'stretch' : undefined,
      junctionStyle: behavior.junctionStyle === 'natural' ? 'natural' : behavior.junctionStyle === 'gold' ? 'gold' : undefined,
      host: behavior.host && typeof behavior.host === 'object' && !Array.isArray(behavior.host) ? behavior.host as { slice?: number; previewWidth?: number } : undefined,
      geometry: behavior.geometry && typeof behavior.geometry === 'object' && !Array.isArray(behavior.geometry) ? behavior.geometry as Record<string, unknown> : {},
      media,
    };
  });
}

export function requiredNineSliceAsset(id: string): NineSliceCatalogAsset {
  const asset = nineSliceCatalogAssets().find((entry) => entry.id === id);
  if (!asset) throw new Error(`nine-slice ${id} is unavailable`);
  return asset;
}

export function requiredNineSliceRole(role: string): NineSliceCatalogAsset {
  const asset = nineSliceCatalogAssets().find((entry) => (
    Array.isArray(entry.record.behavior.roles) && entry.record.behavior.roles.includes(role)
  ));
  if (!asset) throw new Error(`nine-slice role ${role} is unavailable`);
  return asset;
}
