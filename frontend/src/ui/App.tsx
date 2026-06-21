import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react';
import { MainMenu } from './MainMenu';
import { Lobbies } from './Lobbies';
import { Party } from './Party';
import { Settings } from './Settings';
import { DesignSurface } from './design/DesignSurface';
import {
  APP_NAVIGATION_EVENT,
  navigateApp,
  normalizeRoutePath,
  shouldInterceptAppLinkClick,
} from './navigation';

// The Pixi-heavy / larger surfaces are code-split so the menu, lobbies, etc.
// don't pull the renderer bundle (preserving app.js's lazy-mount behaviour).
const Skirmish = lazy(() => import('./Skirmish').then((m) => ({ default: m.Skirmish })));
const CampaignEditor = lazy(() => import('./CampaignEditor').then((m) => ({ default: m.CampaignEditor })));
const TilePreview = lazy(() => import('./TilePreview').then((m) => ({ default: m.TilePreview })));
const TileReview = lazy(() => import('./TilePreview').then((m) => ({ default: m.TileReview })));
const TilesetStudio = lazy(() => import('./TilePreview').then((m) => ({ default: m.TilesetStudio })));
const LevelEditor = lazy(() => import('./TilePreview').then((m) => ({ default: m.LevelEditorPage })));
const TilesetCandidateReview = lazy(() => import('./TilePreview').then((m) => ({ default: m.TilesetCandidateReview })));

const fallback = <div style={{ padding: 40, color: 'var(--ds-ink-3)', fontFamily: 'var(--ds-font-sans)' }}>Loading…</div>;
const split = (node: ReactElement): ReactElement => <Suspense fallback={fallback}>{node}</Suspense>;

// React router replacing app.js's string-HTML router. Same-origin app links are
// intercepted below so route changes keep the document, React tree, and BGM
// audio element alive. Legacy paths (/skirmish, /level-editor, /campaigns,
// /menu-next, /main-menu) resolve to React surfaces.
export function App(): ReactElement {
  const [path, setPath] = useState<string>(() => normalizeRoutePath(window.location.pathname));

  useEffect(() => {
    const syncPath = () => setPath(normalizeRoutePath(window.location.pathname));
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!shouldInterceptAppLinkClick(event, anchor)) return;

      event.preventDefault();
      navigateApp(anchor.href);
    };

    window.addEventListener('popstate', syncPath);
    window.addEventListener(APP_NAVIGATION_EVENT, syncPath);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('popstate', syncPath);
      window.removeEventListener(APP_NAVIGATION_EVENT, syncPath);
      document.removeEventListener('click', onClick);
    };
  }, []);

  if (path === '/play' || path === '/skirmish') return split(<Skirmish />);
  if (path === '/tileset-studio') return split(<TilesetStudio />);
  if (path === '/tileset-review') return split(<TilesetCandidateReview />);
  if (path === '/tile-review') return split(<TileReview />);
  if (path === '/tile-preview') return split(<TilePreview />);
  // The level editor is now the studio's socket-legal board in the original
  // asset-backed chrome; the old Pixi LevelEditor/EditorBoard is retired.
  if (path === '/edit' || path === '/level-editor') return split(<LevelEditor />);
  if (path === '/campaigns-next' || path === '/campaigns') return split(<CampaignEditor />);
  if (path === '/lobbies' || path.startsWith('/lobbies/')) return <Lobbies />;
  if (path === '/party') return <Party />;
  if (path === '/settings') return <Settings />;
  if (path === '/design' || path.startsWith('/design/')) return <DesignSurface />;
  return <MainMenu />;
}
