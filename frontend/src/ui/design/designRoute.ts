// Parses a /design/* path into the structured route the catalog renders from —
// a faithful port of app.js's currentRoute() for the design surfaces. The
// catalog does its own client-side sub-navigation (pushState + re-render in
// place) so moving between catalog views never triggers a full reload or the
// "flash of the game screen" the user flagged in session 930 (turns 56, 60).
export type DesignView = 'hub' | 'catalog' | 'glossaryPage' | 'widgetsPage' | 'prototype';
export type CatalogMode = 'home' | 'glossary' | 'widgets' | 'browser' | 'nineSliceCategory';
export type PrototypeKind = 'drilldown' | 'tree' | 'hybrid';

export interface DesignRoute {
  view: DesignView;
  catalogMode: CatalogMode;
  glossaryTerm?: string;
  assetType?: string;
  assetId?: string;
  widgetFamily?: string;
  widgetSlug?: string;
  prototype?: PrototypeKind;
  nineSliceCategory?: string;
}

const ASSET_ROUTE_TYPES: Record<string, string> = {
  'main-menu-buttons': 'button-9slice.main-menu',
  'main-menu-button-rows': 'button-row.main-menu',
  'main-menu-panels': 'panel-9slice.main-menu',
  'main-menu-button-icons': 'button-icon.main-menu',
  'main-menu-profile-icons': 'profile-icon.main-menu',
};

export function normalizeDesignPath(pathname: string): string {
  const path = pathname || '/';
  return path === '/' ? path : path.replace(/\/+$/, '');
}

export function parseDesignRoute(pathname: string): DesignRoute {
  const path = normalizeDesignPath(pathname);
  const hub: DesignRoute = { view: 'hub', catalogMode: 'home' };

  if (path === '/design') return hub;
  if (path === '/design/glossary') return { view: 'glossaryPage', catalogMode: 'home' };
  if (path === '/design/widgets') return { view: 'widgetsPage', catalogMode: 'home' };

  if (path === '/design/catalog/navigation-drilldown') return { view: 'prototype', catalogMode: 'home', prototype: 'drilldown' };
  if (path === '/design/catalog/navigation-tree') return { view: 'prototype', catalogMode: 'home', prototype: 'tree' };
  if (path === '/design/catalog/navigation-hybrid') return { view: 'prototype', catalogMode: 'home', prototype: 'hybrid' };

  if (path === '/design/catalog') return { view: 'catalog', catalogMode: 'home' };
  if (path === '/design/catalog/glossary') return { view: 'catalog', catalogMode: 'glossary', glossaryTerm: 'asset' };

  const glossaryTerm = path.match(/^\/design\/catalog\/glossary\/(.+)$/);
  if (glossaryTerm) return { view: 'catalog', catalogMode: 'glossary', glossaryTerm: decodeURIComponent(glossaryTerm[1]) };

  const widget = path.match(/^\/design\/catalog\/widgets\/([^/]+)(?:\/([^/]+))?$/);
  if (widget) {
    return {
      view: 'catalog',
      catalogMode: 'widgets',
      widgetFamily: decodeURIComponent(widget[1]),
      widgetSlug: widget[2] ? decodeURIComponent(widget[2]) : undefined,
    };
  }

  const nineSlice = path.match(/^\/design\/catalog\/9-slice\/([^/]+)$/);
  if (nineSlice) {
    return { view: 'catalog', catalogMode: 'nineSliceCategory', nineSliceCategory: decodeURIComponent(nineSlice[1]) };
  }

  const asset = path.match(/^\/design\/catalog\/([^/]+)(?:\/([^/]+))?$/);
  if (asset) {
    const assetType = ASSET_ROUTE_TYPES[asset[1]];
    if (!assetType) return { view: 'catalog', catalogMode: 'home' };
    return {
      view: 'catalog',
      catalogMode: 'browser',
      assetType,
      assetId: asset[2] ? decodeURIComponent(asset[2]) : undefined,
    };
  }

  // /design/main-menu* and anything else: the design hub. (The main-menu
  // acceptance-review surface is the next surface to restore.)
  return hub;
}
