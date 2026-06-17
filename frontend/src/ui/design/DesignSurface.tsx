// Top-level /design surface. Owns client-side navigation for the whole design
// subtree: link clicks within /design are intercepted (pushState + re-render in
// place — no full reload, no flash of the game screen), while links that leave
// /design fall through to a normal navigation so App's router re-routes. A
// faithful restoration of the design hub + the catalog/glossary/widgets/
// navigation-prototype surfaces from the retired app.js.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { parseDesignRoute, normalizeDesignPath } from './designRoute';
import { DesignCatalog } from './DesignCatalog';
import { GlossaryPage } from './glossary';
import { WidgetGallery } from './widgets';
import { NavigationPrototype } from './navPrototypes';

const HUB_AREAS = [
  {
    href: '/design/catalog',
    kicker: 'Design system',
    title: 'Catalog',
    copy: "Classified catalog of the game's buildable entities — assets (9-slice, icon) and widgets (button) — with contracts, states, slot rules, source art, and previews.",
    go: 'Open catalog',
  },
  {
    href: '/design/glossary',
    kicker: 'Design system',
    title: 'Glossary',
    copy: 'The shared vocabulary — asset, 9-slice, icon, slot, state, widget, template — each attested by engine docs.',
    go: 'Open glossary',
  },
  {
    href: '/design/widgets',
    kicker: 'Components',
    title: 'Widgets',
    copy: 'Completed, assembled widgets — the main-menu button family, built from catalog assets plus live labels and actions.',
    go: 'Open widgets',
  },
];

type Navigate = (href: string, e?: { preventDefault: () => void }) => void;

function DesignHub({ onNavigate }: { onNavigate: Navigate }): ReactNode {
  return (
    <div className="main-assets-screen design-index-screen" data-live-screen="design-index">
      <header className="main-assets-header">
        <a className="design-back" href="/" onClick={(e) => onNavigate('/', e)}>← Menu</a>
        <p className="eyebrow">Design system</p>
        <h2>Design</h2>
        <p className="main-assets-intro">The classified catalog, the shared vocabulary, and the completed widgets — restored to the React stack, reading the committed asset catalog.</p>
      </header>
      <div className="design-hub-grid">
        {HUB_AREAS.map((area) => (
          <a className="design-hub-card" href={area.href} onClick={(e) => onNavigate(area.href, e)} key={area.href}>
            <span className="design-hub-kicker">{area.kicker}</span>
            <h3>{area.title}</h3>
            <p>{area.copy}</p>
            <span className="design-hub-go">{area.go} →</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function WidgetsPage({ onNavigate }: { onNavigate: Navigate }): ReactNode {
  return (
    <div className="main-assets-screen widgets-screen" data-live-screen="widgets">
      <header className="main-assets-header">
        <a className="design-back" href="/design" onClick={(e) => onNavigate('/design', e)}>← Design</a>
        <p className="eyebrow">Design system · completed widgets</p>
        <h2>Widgets</h2>
        <p className="main-assets-intro">Finished, assembled widgets — each built from catalog assets (a 9-slice in a state + an icon) plus a live label and an action. This is the main-menu button family, live in the game.</p>
      </header>
      <WidgetGallery />
    </div>
  );
}

export function DesignSurface(): ReactNode {
  const [path, setPath] = useState<string>(() => normalizeDesignPath(window.location.pathname));

  const navigate = useCallback<Navigate>((href, e) => {
    if (e) e.preventDefault();
    if (!href || href === '#') return;
    // Leaving the design subtree: hand off to a real navigation so App's
    // top-level router renders the right surface.
    if (!href.startsWith('/design')) {
      window.location.href = href;
      return;
    }
    window.history.pushState({}, '', href);
    setPath(normalizeDesignPath(href));
  }, []);

  useEffect(() => {
    const onPop = () => {
      const pathname = window.location.pathname;
      // Back/forward out of the design subtree: reload so App re-routes to the
      // right top-level surface (main menu, a game screen, etc.).
      if (!pathname.startsWith('/design')) { window.location.reload(); return; }
      setPath(normalizeDesignPath(pathname));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const route = parseDesignRoute(path);

  if (route.view === 'catalog') return <DesignCatalog route={route} path={path} onNavigate={navigate} />;
  if (route.view === 'glossaryPage') return <GlossaryPage onNavigate={navigate} />;
  if (route.view === 'widgetsPage') return <WidgetsPage onNavigate={navigate} />;
  if (route.view === 'prototype' && route.prototype) return <NavigationPrototype prototype={route.prototype} onNavigate={navigate} />;
  return <DesignHub onNavigate={navigate} />;
}
