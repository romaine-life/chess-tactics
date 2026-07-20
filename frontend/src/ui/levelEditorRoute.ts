export const LEVEL_EDITOR_ROUTE_LAYERS = [
  'board',
  'tile',
  'generate',
  'paths',
  'fence',
  'wall',
  'subterrain',
  'wallart',
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
  'wall',
  'subterrain',
  'wallart',
  'zone',
] as const;

export type LevelEditorBrushKind = typeof LEVEL_EDITOR_ROUTE_BRUSH_KINDS[number];

export const LEVEL_EDITOR_EVENTS_TABS = ['victory', 'other'] as const;

export type LevelEditorEventsTab = typeof LEVEL_EDITOR_EVENTS_TABS[number];

export type LevelEditorRouteState = {
  layer?: LevelEditorLayerKey;
  brushKind?: LevelEditorBrushKind;
  brush?: string;
  eventsEditor: boolean;
  eventsTab?: LevelEditorEventsTab;
};

const layerSet = new Set<string>(LEVEL_EDITOR_ROUTE_LAYERS);
const brushKindSet = new Set<string>(LEVEL_EDITOR_ROUTE_BRUSH_KINDS);
const eventsTabSet = new Set<string>(LEVEL_EDITOR_EVENTS_TABS);

export function isLevelEditorLayerKey(value: string | null | undefined): value is LevelEditorLayerKey {
  return typeof value === 'string' && layerSet.has(value);
}

export function isLevelEditorBrushKind(value: string | null | undefined): value is LevelEditorBrushKind {
  return typeof value === 'string' && brushKindSet.has(value);
}

export function isLevelEditorEventsTab(value: string | null | undefined): value is LevelEditorEventsTab {
  return typeof value === 'string' && eventsTabSet.has(value);
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
  const eventsEditorRequested = params.get('eventsEditor') === '1';
  const requestedLayer = isLevelEditorLayerKey(rawLayer) ? rawLayer : levelEditorLayerForBrushKind(brushKind);
  const layer = eventsEditorRequested ? 'rules' : requestedLayer;
  const rawEventsTab = params.get('eventsTab');
  const eventsTab = eventsEditorRequested && isLevelEditorEventsTab(rawEventsTab) ? rawEventsTab : undefined;
  return {
    layer,
    brushKind,
    brush: params.get('brush') ?? undefined,
    eventsEditor: eventsEditorRequested,
    eventsTab,
  };
}

export function levelEditorRouteBrushKind(
  layer: LevelEditorLayerKey,
  current: LevelEditorBrushKind | undefined,
): LevelEditorBrushKind | null {
  if (layer === 'paths') return current === 'river' ? 'river' : 'road';
  if (layer === 'tile' || layer === 'unit' || layer === 'doodad' || layer === 'prop' || layer === 'cover' || layer === 'fence' || layer === 'wall' || layer === 'subterrain' || layer === 'wallart' || layer === 'zone') {
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
    eventsEditor?: boolean | null;
    eventsTab?: LevelEditorEventsTab | null;
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
  if (state.layer !== 'rules') {
    url.searchParams.delete('eventsEditor');
    url.searchParams.delete('eventsTab');
  } else if ('eventsEditor' in state) {
    if (state.eventsEditor) {
      url.searchParams.set('eventsEditor', '1');
      if (state.eventsTab === 'other') url.searchParams.set('eventsTab', 'other');
      else url.searchParams.delete('eventsTab');
    } else {
      url.searchParams.delete('eventsEditor');
      url.searchParams.delete('eventsTab');
    }
  } else if ('eventsTab' in state) {
    if (url.searchParams.get('eventsEditor') === '1' && state.eventsTab === 'other') {
      url.searchParams.set('eventsTab', 'other');
    } else {
      url.searchParams.delete('eventsTab');
    }
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
