// Route parser for the design catalog, ported from the retired app.js
// currentRoute() path table. The React app uses full-navigation path routing
// (App.tsx reads window.location.pathname), so the catalog resolves its own
// sub-paths under /design/catalog from the pathname.

export type CatalogMode = 'catalog' | 'glossary' | 'widgets';

export interface CatalogRoute {
  catalogMode: CatalogMode;
  /** Asset type for catalog mode (e.g. 'button-9slice.main-menu'). */
  assetType: string;
  /** 'buttons' for the button-family page. */
  assetGroup: string;
  /** Selected asset id within a type. */
  assetId: string;
  /** Selected glossary term (glossary mode). */
  glossaryTerm: string;
  /** Widget family (widgets mode), e.g. 'main-menu'. */
  widgetFamily: string;
  /** Selected widget slug (widgets mode), e.g. 'solo-skirmish'. */
  widgetSlug: string;
}

const EMPTY: CatalogRoute = {
  catalogMode: 'catalog',
  assetType: '',
  assetGroup: '',
  assetId: '',
  glossaryTerm: '',
  widgetFamily: '',
  widgetSlug: '',
};

// Static routes copied from APP_ROUTES (the /design/catalog/* entries).
const STATIC: Record<string, Partial<CatalogRoute>> = {
  '/design/catalog': {},
  '/design/catalog/buttons': { assetGroup: 'buttons' },
  '/design/catalog/main-menu-buttons': { assetType: 'button-9slice.main-menu' },
  '/design/catalog/main-menu-button-icons': { assetType: 'button-icon.main-menu' },
};

const ASSET_ROUTE_TYPES: Record<string, string> = {
  'main-menu-buttons': 'button-9slice.main-menu',
  'main-menu-button-icons': 'button-icon.main-menu',
};

export function normalizePath(pathname: string): string {
  const path = pathname || '/';
  return path === '/' ? path : path.replace(/\/+$/, '');
}

/**
 * Parse a /design/catalog[...] pathname into a CatalogRoute. Unknown sub-paths
 * fall back to the catalog home (matching app.js's APP_ROUTES['/'] fallback,
 * which here means "show the catalog root"). Returns null for paths that are not
 * under /design/catalog at all.
 */
export function parseCatalogRoute(pathname: string): CatalogRoute | null {
  const path = normalizePath(pathname);
  if (path !== '/design/catalog' && !path.startsWith('/design/catalog/')) return null;

  if (path in STATIC) return { ...EMPTY, ...STATIC[path] };

  if (path === '/design/catalog/glossary') {
    return { ...EMPTY, catalogMode: 'glossary' };
  }
  const glossaryTermMatch = path.match(/^\/design\/catalog\/glossary\/(.+)$/);
  if (glossaryTermMatch) {
    return { ...EMPTY, catalogMode: 'glossary', glossaryTerm: decodeURIComponent(glossaryTermMatch[1]) };
  }
  const widgetMatch = path.match(/^\/design\/catalog\/widgets\/([^/]+)(?:\/([^/]+))?$/);
  if (widgetMatch) {
    return {
      ...EMPTY,
      catalogMode: 'widgets',
      widgetFamily: decodeURIComponent(widgetMatch[1]),
      widgetSlug: widgetMatch[2] ? decodeURIComponent(widgetMatch[2]) : '',
    };
  }
  const assetMatch = path.match(/^\/design\/catalog\/([^/]+)(?:\/([^/]+))?$/);
  if (assetMatch) {
    const assetType = ASSET_ROUTE_TYPES[assetMatch[1]];
    // Unknown first segment under /design/catalog: fall back to catalog home,
    // mirroring app.js returning APP_ROUTES['/'].
    if (!assetType) return { ...EMPTY };
    return {
      ...EMPTY,
      assetType,
      assetId: assetMatch[2] ? decodeURIComponent(assetMatch[2]) : '',
    };
  }
  return { ...EMPTY };
}
