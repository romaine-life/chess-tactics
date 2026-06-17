// The three asset-navigation prototypes (drilldown / tree / hybrid) — faithful
// port of app.js renderDrilldown/Tree/HybridPrototype. These are intentionally
// rough structural studies for comparing how a large catalog could be explored;
// the prior rushed React port dropped them, so they are restored here in full.
import { useState } from 'react';
import { ASSET_TREE_PROTOTYPE } from './catalogData';
import { TreeList, allBranchKeys } from './TreeList';

type Navigate = (href: string, e?: { preventDefault: () => void }) => void;
export type PrototypeKind = 'drilldown' | 'tree' | 'hybrid';

interface MiniItem { label: string; href?: string; planned?: boolean }

function PrototypeSwitcher({ active, onNavigate }: { active: PrototypeKind; onNavigate: Navigate }): React.ReactElement {
  const links: [PrototypeKind, string, string][] = [
    ['drilldown', 'Page Drilldown', '/design/catalog/navigation-drilldown'],
    ['tree', 'Tree Sidebar', '/design/catalog/navigation-tree'],
    ['hybrid', 'Hybrid', '/design/catalog/navigation-hybrid'],
  ];
  return (
    <nav className="prototype-switcher" aria-label="Asset navigation prototypes">
      {links.map(([key, label, href]) => (
        <a key={key} className={active === key ? 'active' : ''} href={href} onClick={(e) => onNavigate(href, e)}>{label}</a>
      ))}
    </nav>
  );
}

function PreviewCard({ title, copy, items = [], onNavigate }: { title: string; copy: string; items?: MiniItem[]; onNavigate: Navigate }): React.ReactElement {
  return (
    <article className="prototype-preview-card">
      <span className="design-hub-kicker">Selected node</span>
      <h3>{title}</h3>
      <p>{copy}</p>
      {items.length ? (
        <div className="prototype-mini-list">
          {items.map((item, i) => (
            <a key={i} href={item.href || '#'} className={item.planned ? 'planned' : ''} onClick={(e) => onNavigate(item.href || '#', e)}>{item.label}</a>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function Breadcrumb({ parts }: { parts: string[] }): React.ReactElement {
  return (
    <div className="prototype-crumbs">
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 ? <b>/</b> : null}
        </span>
      ))}
    </div>
  );
}

// The tree rail used by the tree/hybrid prototypes — with the inline Expand all
// / Collapse all tools (renderPrototypeTreePanel's default), local open-state.
function PrototypeTreePanel({ activeHref, onNavigate }: { activeHref: string; onNavigate: Navigate }): React.ReactElement {
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set(allBranchKeys(ASSET_TREE_PROTOTYPE)));
  const toggle = (key: string) => setOpenKeys((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  return (
    <aside className="prototype-tree-panel">
      <div className="prototype-tree-tools" aria-label="Tree controls">
        <button type="button" onClick={() => setOpenKeys(new Set(allBranchKeys(ASSET_TREE_PROTOTYPE)))}>Expand all</button>
        <button type="button" onClick={() => setOpenKeys(new Set())}>Collapse all</button>
      </div>
      <TreeList nodes={ASSET_TREE_PROTOTYPE} activeHref={activeHref} openKeys={openKeys} onToggle={toggle} onNavigate={onNavigate} />
    </aside>
  );
}

function Drilldown({ onNavigate }: { onNavigate: Navigate }): React.ReactElement {
  return (
    <section className="prototype-drill-grid">
      <PreviewCard
        title="Assets"
        copy="Start at the root. Each card sends you to a new page one level deeper."
        items={[
          { label: 'Buttons', href: '/design/catalog/buttons' },
          { label: 'Icons', href: '#' },
          { label: 'Board', href: '#', planned: true },
          { label: 'Pieces', href: '#', planned: true },
        ]}
        onNavigate={onNavigate}
      />
      <PreviewCard
        title="Buttons"
        copy="The button category page lists button families, not individual button assets."
        items={[
          { label: 'Main Menu Buttons', href: '/design/catalog/main-menu-buttons' },
          { label: 'Plain Buttons', href: '#', planned: true },
        ]}
        onNavigate={onNavigate}
      />
      <PreviewCard
        title="Main Menu Buttons"
        copy="The type page has the dropdown/search picker and one full inspection card."
        items={[{ label: 'Main Menu', href: '/design/catalog/main-menu-buttons/button-9slice.main-menu' }]}
        onNavigate={onNavigate}
      />
    </section>
  );
}

function TreeStudy({ onNavigate }: { onNavigate: Navigate }): React.ReactElement {
  return (
    <section className="prototype-tree-layout">
      <PrototypeTreePanel activeHref="/design/catalog/main-menu-buttons" onNavigate={onNavigate} />
      <div className="prototype-tree-content">
        <Breadcrumb parts={['Assets', 'Buttons', 'Main Menu Buttons']} />
        <PreviewCard
          title="Main Menu Buttons"
          copy="The tree stays visible while the right panel swaps to the selected category, type, or asset page."
          items={[{ label: 'Main Menu', href: '/design/catalog/main-menu-buttons/button-9slice.main-menu' }]}
          onNavigate={onNavigate}
        />
      </div>
    </section>
  );
}

function Hybrid({ onNavigate }: { onNavigate: Navigate }): React.ReactElement {
  return (
    <section className="prototype-tree-layout prototype-hybrid-layout">
      <PrototypeTreePanel activeHref="/design/catalog/main-menu-buttons/button-9slice.main-menu" onNavigate={onNavigate} />
      <div className="prototype-tree-content">
        <Breadcrumb parts={['Assets', 'Buttons', 'Main Menu Buttons', 'Main Menu Button 9-Slice']} />
        <div className="prototype-hybrid-grid">
          <PreviewCard
            title="Main Menu Buttons"
            copy="Type-level controls live here: search, dropdown, status filters, and family notes."
            items={[
              { label: 'Search within Main Menu Buttons', href: '#' },
              { label: 'Selected: Main Menu Button 9-Slice', href: '/design/catalog/main-menu-buttons/button-9slice.main-menu' },
            ]}
            onNavigate={onNavigate}
          />
          <PreviewCard
            title="Inspection Card"
            copy="The selected asset still gets a dedicated full card, but the tree keeps the larger catalog context visible."
            items={[
              { label: 'States: pressed, normal', href: '#' },
              { label: 'Slots: icon, text, arrow, hitbox', href: '#' },
            ]}
            onNavigate={onNavigate}
          />
        </div>
      </div>
    </section>
  );
}

export function NavigationPrototype({ prototype, onNavigate }: { prototype: PrototypeKind; onNavigate: Navigate }): React.ReactElement {
  const titles: Record<PrototypeKind, string> = {
    drilldown: 'Navigation Prototype: Page Drilldown',
    tree: 'Navigation Prototype: Tree Sidebar',
    hybrid: 'Navigation Prototype: Hybrid',
  };
  return (
    <div className="main-assets-screen asset-catalog-screen asset-prototype-screen" data-live-screen="asset-nav-prototype">
      <header className="main-assets-header">
        <a className="design-back" href="/design/catalog" onClick={(e) => onNavigate('/design/catalog', e)}>← Asset Catalog</a>
        <p className="eyebrow">Asset navigation study</p>
        <h2>{titles[prototype]}</h2>
        <p className="main-assets-intro">Quick structural mocks for comparing how a large asset catalog might be explored. These pages are intentionally rough.</p>
        <PrototypeSwitcher active={prototype} onNavigate={onNavigate} />
      </header>
      {prototype === 'drilldown' ? <Drilldown onNavigate={onNavigate} /> : null}
      {prototype === 'tree' ? <TreeStudy onNavigate={onNavigate} /> : null}
      {prototype === 'hybrid' ? <Hybrid onNavigate={onNavigate} /> : null}
    </div>
  );
}
