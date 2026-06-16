import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { loadAssetCatalog, bakedCatalogFallback, type AssetCatalog } from '../render/assetCatalog';
import { entryToAsset, type CatalogAsset } from './catalog/assetFrame';
import {
  ASSET_TREE_PROTOTYPE,
  assetTypeLabel,
  pruneTreeToTerms,
} from './catalog/catalogData';
import { parseCatalogRoute, normalizePath, type CatalogRoute } from './catalog/catalogRoute';
import { CatalogTreePanel, setAllOpen } from './catalog/TreePanel';
import {
  AssetCatalogHome,
  AssetTypePicker,
  ButtonTypeCatalog,
  CatalogAssetCard,
} from './catalog/CatalogCards';
import { GlossaryEntry, WidgetGallery, MENU_MODES } from './catalog/GlossaryWidgets';

// In-app design catalog (/design/catalog and sub-paths). Faithful React port of
// the retired app.js design-catalog tree system: a tree rail (mode toggle + the
// classification tree) beside a content pane. Three modes — catalog (default),
// glossary, widgets — selected from window.location.pathname (full-navigation
// routing, mirroring app.js's route table). The tree/glossary structure is
// static data; the asset cards/widgets are wired to the DB-backed catalog
// (render/assetCatalog), with the baked catalog as the offline fallback.

// Compact catalog header: back link, title, short intro (intro may carry links).
function CatalogHeader({ title, intro }: { title: string; intro: ReactNode }): ReactElement {
  return (
    <header className="main-assets-header catalog-header">
      <a className="design-back" href="/design">← Design</a>
      <h2>{title}</h2>
      <p className="main-assets-intro">{intro}</p>
    </header>
  );
}

// Catalog/Glossary view toggle. The active tab is inert; only the inactive tab
// is a link. When treeControls is set, a compact +/- expands/collapses the tree.
function CatalogModeToggle({
  active,
  treeControls = false,
  panelRef,
}: {
  active: 'catalog' | 'glossary';
  treeControls?: boolean;
  panelRef: RefObject<HTMLElement | null>;
}): ReactElement {
  const tabs: Array<['catalog' | 'glossary', string, string]> = [
    ['catalog', 'Catalog', '/design/catalog'],
    ['glossary', 'Glossary', '/design/catalog/glossary'],
  ];
  return (
    <div className="catalog-controls">
      <nav className="catalog-mode-toggle" aria-label="Catalog view mode">
        {tabs.map(([key, label, href]) =>
          active === key ? (
            <span className="active" aria-current="page" key={key}>{label}</span>
          ) : (
            <a href={href} key={key}>{label}</a>
          ),
        )}
      </nav>
      {treeControls ? (
        <div className="tree-zoom" aria-label="Tree controls">
          <button type="button" data-action="expand-prototype-tree" title="Expand all" aria-label="Expand all" onClick={() => setAllOpen(panelRef, true)}>+</button>
          <button type="button" data-action="collapse-prototype-tree" title="Collapse all" aria-label="Collapse all" onClick={() => setAllOpen(panelRef, false)}>−</button>
        </div>
      ) : null}
    </div>
  );
}

function GlossaryView({ route, panelRef }: { route: CatalogRoute; panelRef: RefObject<HTMLElement | null> }): ReactElement {
  const term = route.glossaryTerm || 'asset';
  const termHref = `/design/catalog/glossary/${encodeURIComponent(term)}`;
  return (
    <div className="main-assets-screen asset-catalog-screen" data-live-screen="asset-catalog">
      <CatalogHeader
        title="Glossary"
        intro={<>The same classification, read as a glossary: pick a type to see what it means. The full vocabulary lives in the <a href="/design/glossary">Glossary</a>.</>}
      />
      <section className="prototype-tree-layout asset-catalog-tree-layout" aria-label="Glossary explorer">
        <div className="catalog-rail">
          <CatalogModeToggle active="glossary" panelRef={panelRef} />
          <CatalogTreePanel activeHref={termHref} nodes={pruneTreeToTerms(ASSET_TREE_PROTOTYPE)} opts={{ flat: true }} panelRef={panelRef} />
        </div>
        <div className="prototype-tree-content">
          <GlossaryEntry term={term} />
        </div>
      </section>
    </div>
  );
}

function WidgetsView({
  route,
  activeHref,
  byId,
  panelRef,
}: {
  route: CatalogRoute;
  activeHref: string;
  byId: Map<string, CatalogAsset>;
  panelRef: RefObject<HTMLElement | null>;
}): ReactElement {
  const modes = route.widgetSlug ? MENU_MODES.filter((mode) => mode.slug === route.widgetSlug) : MENU_MODES;
  const single = Boolean(route.widgetSlug) && modes.length === 1;
  const title = single ? modes[0].label : 'Main Menu Buttons';
  const intro = single
    ? 'A completed widget, shown live on the catalog page — assembled from a catalog 9-slice (in a state) + an icon + a live label + an action.'
    : 'The completed Main Menu button widgets, shown live on the catalog page. Each is assembled from a catalog 9-slice (in a state) + an icon + a live label + an action.';
  return (
    <div className="main-assets-screen asset-catalog-screen" data-live-screen="asset-catalog">
      <CatalogHeader title={title} intro={intro} />
      <section className="prototype-tree-layout asset-catalog-tree-layout" aria-label="Asset catalog explorer">
        <div className="catalog-rail">
          <CatalogModeToggle active="catalog" treeControls panelRef={panelRef} />
          <CatalogTreePanel activeHref={activeHref} opts={{ hideTools: true }} panelRef={panelRef} />
        </div>
        <div className="prototype-tree-content">
          <WidgetGallery modes={modes} byId={byId} />
        </div>
      </section>
    </div>
  );
}

function CatalogView({
  route,
  activeHref,
  assets,
  countsByType,
  panelRef,
}: {
  route: CatalogRoute;
  activeHref: string;
  assets: CatalogAsset[];
  countsByType: Record<string, number>;
  panelRef: RefObject<HTMLElement | null>;
}): ReactElement {
  const selectedType = route.assetType || '';
  const selectedGroup = route.assetGroup || '';
  const typed = assets.filter((asset) => !selectedType || asset.type === selectedType);
  const selectedAsset = typed.find((asset) => asset.id === route.assetId) || typed[0];

  let content: ReactNode;
  if (selectedGroup === 'buttons') {
    content = <ButtonTypeCatalog countsByType={countsByType} />;
  } else if (selectedType) {
    content = (
      <section className="catalog-browser" aria-label="Catalog asset browser">
        <AssetTypePicker assets={typed} selectedAsset={selectedAsset} />
        <div className="catalog-selected-asset">
          {selectedAsset ? <CatalogAssetCard asset={selectedAsset} /> : <p className="catalog-empty">No assets in this section yet.</p>}
        </div>
      </section>
    );
  } else {
    content = <AssetCatalogHome countsByType={countsByType} />;
  }

  const title = selectedGroup === 'buttons'
    ? 'Button Types'
    : selectedType
      ? `${assetTypeLabel(selectedType)} Assets`
      : 'Catalog';

  return (
    <div className="main-assets-screen asset-catalog-screen" data-live-screen="asset-catalog">
      <CatalogHeader title={title} intro="Buildable game entities, grouped by type. Open one to inspect its states, slots, source art, and previews." />
      <section className="prototype-tree-layout asset-catalog-tree-layout" aria-label="Asset catalog explorer">
        <div className="catalog-rail">
          <CatalogModeToggle active="catalog" treeControls panelRef={panelRef} />
          <CatalogTreePanel activeHref={activeHref} opts={{ hideTools: true }} panelRef={panelRef} />
        </div>
        <div className="prototype-tree-content">{content}</div>
      </section>
    </div>
  );
}

export function CatalogViewer(): ReactElement {
  const [catalog, setCatalog] = useState<AssetCatalog | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const live = await loadAssetCatalog();
      if (cancelled) return;
      if (live && live.entries.length) { setCatalog(live); return; }
      const baked = await bakedCatalogFallback();
      if (cancelled) return;
      setCatalog(baked);
    })();
    return () => { cancelled = true; };
  }, []);

  // Recover the legacy asset shape (image + geometry) for every entry, and index
  // by id so the tree/cards/widgets can resolve assets by their catalog id.
  const assets = useMemo<CatalogAsset[]>(() => (catalog?.entries ?? []).map(entryToAsset), [catalog]);
  const byId = useMemo(() => {
    const map = new Map<string, CatalogAsset>();
    for (const asset of assets) map.set(asset.id, asset);
    return map;
  }, [assets]);
  const countsByType = useMemo(() => {
    return assets.reduce<Record<string, number>>((acc, asset) => {
      acc[asset.type] = (acc[asset.type] || 0) + 1;
      return acc;
    }, {});
  }, [assets]);

  const activeHref = normalizePath(window.location.pathname);
  const route = parseCatalogRoute(window.location.pathname) ?? parseCatalogRoute('/design/catalog')!;

  if (route.catalogMode === 'glossary') {
    return <GlossaryView route={route} panelRef={panelRef} />;
  }
  if (route.catalogMode === 'widgets') {
    return <WidgetsView route={route} activeHref={activeHref} byId={byId} panelRef={panelRef} />;
  }
  return <CatalogView route={route} activeHref={activeHref} assets={assets} countsByType={countsByType} panelRef={panelRef} />;
}
