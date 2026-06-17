// The catalog page — faithful port of app.js renderAssetCatalog. Layout:
//   header (back + title + intro)
//   .asset-catalog-tree-layout
//     .catalog-rail  → controls (Catalog│Glossary toggle + stacked ＋/−) over a
//                      LOCKED tree rail
//     .prototype-tree-content → home | browser | widgets | glossary-entry
// The combined controls sit OVER the tree (session 930, turns 66/67/69 — not
// top-right), ＋/− only in Catalog mode (the Glossary tree is flat), and the
// rail stays mounted across content swaps so its expand state + scroll survive
// (turns 56/59/60: locked rail, no reload, no game-screen flash).
import { useState, type ReactNode } from 'react';
import type { DesignRoute } from './designRoute';
import { ASSET_TREE_PROTOTYPE, pruneTreeToTerms, assetTypeLabel, nineSliceCategory, MENU_MODES } from './catalogData';
import { TreeList, allBranchKeys } from './TreeList';
import { CatalogHome, CatalogBrowser, NineSliceCategoryView, countsByType } from './catalogContent';
import { GlossaryEntry } from './glossary';
import { WidgetGallery } from './widgets';

type Navigate = (href: string, e?: { preventDefault: () => void }) => void;

function CatalogControls({ mode, treeControls, onNavigate, onExpandAll, onCollapseAll }: {
  mode: 'catalog' | 'glossary';
  treeControls: boolean;
  onNavigate: Navigate;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}): ReactNode {
  const tabs: [string, string, string][] = [
    ['catalog', 'Catalog', '/design/catalog'],
    ['glossary', 'Glossary', '/design/catalog/glossary'],
  ];
  return (
    <div className="catalog-controls">
      {/* The active tab is inert (you are already in that view); only the
          inactive tab is a link, so clicking the current mode never reloads. */}
      <nav className="catalog-mode-toggle" aria-label="Catalog view mode">
        {tabs.map(([key, label, href]) => (mode === key
          ? <span className="active" aria-current="page" key={key}>{label}</span>
          : <a href={href} key={key} onClick={(e) => onNavigate(href, e)}>{label}</a>
        ))}
      </nav>
      {treeControls ? (
        <div className="tree-zoom" aria-label="Tree controls">
          <button type="button" title="Expand all" aria-label="Expand all" onClick={onExpandAll}>+</button>
          <button type="button" title="Collapse all" aria-label="Collapse all" onClick={onCollapseAll}>−</button>
        </div>
      ) : null}
    </div>
  );
}

function CatalogHeader({ title, intro, onNavigate }: { title: string; intro: ReactNode; onNavigate: Navigate }): ReactNode {
  return (
    <header className="main-assets-header catalog-header">
      <a className="design-back" href="/design" onClick={(e) => onNavigate('/design', e)}>← Design</a>
      <h2>{title}</h2>
      <p className="main-assets-intro">{intro}</p>
    </header>
  );
}

export function DesignCatalog({ route, path, onNavigate }: { route: DesignRoute; path: string; onNavigate: Navigate }): ReactNode {
  // Open-state lives here so the ＋/− controls work and it survives client-side
  // navigation between catalog views (the component stays mounted).
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set(allBranchKeys(ASSET_TREE_PROTOTYPE)));
  const toggle = (key: string) => setOpenKeys((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const expandAll = () => setOpenKeys(new Set(allBranchKeys(ASSET_TREE_PROTOTYPE)));
  const collapseAll = () => setOpenKeys(new Set());

  if (route.catalogMode === 'glossary') {
    const term = route.glossaryTerm || 'asset';
    const termHref = `/design/catalog/glossary/${encodeURIComponent(term)}`;
    return (
      <div className="main-assets-screen asset-catalog-screen" data-live-screen="asset-catalog">
        <CatalogHeader
          title="Glossary"
          intro={<>The same classification, read as a glossary: pick a type to see what it means. The full vocabulary lives in the <a href="/design/glossary" onClick={(e) => onNavigate('/design/glossary', e)}>Glossary</a>.</>}
          onNavigate={onNavigate}
        />
        <section className="prototype-tree-layout asset-catalog-tree-layout" aria-label="Glossary explorer">
          <div className="catalog-rail">
            <CatalogControls mode="glossary" treeControls={false} onNavigate={onNavigate} onExpandAll={expandAll} onCollapseAll={collapseAll} />
            <aside className="prototype-tree-panel">
              <TreeList nodes={pruneTreeToTerms(ASSET_TREE_PROTOTYPE)} activeHref={termHref} flat openKeys={openKeys} onToggle={toggle} onNavigate={onNavigate} />
            </aside>
          </div>
          <div className="prototype-tree-content">
            <GlossaryEntry term={term} onNavigate={onNavigate} />
          </div>
        </section>
      </div>
    );
  }

  // Catalog modes: home | browser | widgets — the full classification tree.
  let title = 'Catalog';
  let intro: ReactNode = 'Buildable game entities, grouped by type. Open one to inspect its states, slots, source art, and previews.';
  let content: ReactNode;
  if (route.catalogMode === 'widgets') {
    const modes = route.widgetSlug ? MENU_MODES.filter((m) => m.slug === route.widgetSlug) : MENU_MODES;
    const single = Boolean(route.widgetSlug) && modes.length === 1;
    title = single ? modes[0].label : 'Main Menu Buttons';
    intro = single
      ? 'A completed widget, shown live on the catalog page — assembled from a catalog 9-slice (in a state) + an icon + a live label + an action.'
      : 'The completed Main Menu button widgets, shown live on the catalog page. Each is assembled from a catalog 9-slice (in a state) + an icon + a live label + an action.';
    content = modes.length ? <WidgetGallery modes={modes} /> : <p className="catalog-empty">No widgets in this family yet.</p>;
  } else if (route.catalogMode === 'nineSliceCategory' && route.nineSliceCategory) {
    const cat = nineSliceCategory(route.nineSliceCategory);
    title = cat ? `${cat.label} 9-slice` : '9-slice';
    intro = 'A 9-slice category — its contract is the slots and states every 9-slice of this type must expose.';
    content = <NineSliceCategoryView categoryId={route.nineSliceCategory} onNavigate={onNavigate} />;
  } else if (route.catalogMode === 'browser' && route.assetType) {
    title = `${assetTypeLabel(route.assetType)} Assets`;
    content = <CatalogBrowser assetType={route.assetType} assetId={route.assetId} />;
  } else {
    content = <CatalogHome countsByType={countsByType()} onNavigate={onNavigate} />;
  }

  return (
    <div className="main-assets-screen asset-catalog-screen" data-live-screen="asset-catalog">
      <CatalogHeader title={title} intro={intro} onNavigate={onNavigate} />
      <section className="prototype-tree-layout asset-catalog-tree-layout" aria-label="Asset catalog explorer">
        <div className="catalog-rail">
          <CatalogControls mode="catalog" treeControls onNavigate={onNavigate} onExpandAll={expandAll} onCollapseAll={collapseAll} />
          <aside className="prototype-tree-panel">
            <TreeList nodes={ASSET_TREE_PROTOTYPE} activeHref={path} openKeys={openKeys} onToggle={toggle} onNavigate={onNavigate} />
          </aside>
        </div>
        <div className="prototype-tree-content">
          {content}
        </div>
      </section>
    </div>
  );
}
