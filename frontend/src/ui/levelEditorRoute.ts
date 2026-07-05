export const LEVEL_EDITOR_ROUTE_LAYERS = [
  'board',
  'tile',
  'generate',
  'paths',
  'fence',
  'unit',
  'doodad',
  'prop',
  'cover',
  'zone',
  'rules',
  'status',
] as const;

export type LevelEditorLayerKey = typeof LEVEL_EDITOR_ROUTE_LAYERS[number];

export const LEVEL_EDITOR_ROUTE_BRUSH_KINDS = [
  'tile',
  'unit',
  'doodad',
  'prop',
  'cover',
  'road',
  'river',
  'fence',
  'zone',
] as const;

export type LevelEditorBrushKind = typeof LEVEL_EDITOR_ROUTE_BRUSH_KINDS[number];

export type LevelEditorRouteState = {
  layer?: LevelEditorLayerKey;
  brushKind?: LevelEditorBrushKind;
  brush?: string;
};

const layerSet = new Set<string>(LEVEL_EDITOR_ROUTE_LAYERS);
const brushKindSet = new Set<string>(LEVEL_EDITOR_ROUTE_BRUSH_KINDS);

export function isLevelEditorLayerKey(value: string | null | undefined): value is LevelEditorLayerKey {
  return typeof value === 'string' && layerSet.has(value);
}

export function isLevelEditorBrushKind(value: string | null | undefined): value is LevelEditorBrushKind {
  return typeof value === 'string' && brushKindSet.has(value);
}

export function isLevelEditorRoutePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === '/editor/level' || path === '/edit' || path === '/level-editor';
}

export function levelEditorLayerForBrushKind(kind: LevelEditorBrushKind | undefined): LevelEditorLayerKey | undefined {
  if (kind === undefined) return undefined;
  if (kind === 'road' || kind === 'river') return 'paths';
  return kind;
}

export function readLevelEditorRouteState(search: string): LevelEditorRouteState {
  const params = new URLSearchParams(search);
  const rawLayer = params.get('layer');
  const rawKind = params.get('kind');
  const brushKind = isLevelEditorBrushKind(rawKind) ? rawKind : undefined;
  return {
    layer: isLevelEditorLayerKey(rawLayer) ? rawLayer : levelEditorLayerForBrushKind(brushKind),
    brushKind,
    brush: params.get('brush') ?? undefined,
  };
}

export function levelEditorRouteBrushKind(
  layer: LevelEditorLayerKey,
  current: LevelEditorBrushKind | undefined,
): LevelEditorBrushKind | null {
  if (layer === 'paths') return current === 'river' ? 'river' : 'road';
  if (layer === 'tile' || layer === 'unit' || layer === 'doodad' || layer === 'prop' || layer === 'cover' || layer === 'fence' || layer === 'zone') {
    return layer;
  }
  return null;
}

export function levelEditorHrefWithRouteState(
  href: string,
  state: {
    layer: LevelEditorLayerKey;
    brushKind?: LevelEditorBrushKind | null;
    brush?: string | null;
  },
): string {
  const url = new URL(href, 'https://chess-tactics.local');
  url.searchParams.set('layer', state.layer);
  if ('brushKind' in state) {
    if (state.brushKind) url.searchParams.set('kind', state.brushKind);
    else url.searchParams.delete('kind');
  }
  if ('brush' in state) {
    if (state.brush) url.searchParams.set('brush', state.brush);
    else url.searchParams.delete('brush');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
