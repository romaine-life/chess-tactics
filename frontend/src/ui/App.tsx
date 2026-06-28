import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react';
import { MainMenu } from './MainMenu';
import { Campaign } from './Campaign';
import { Lobbies } from './Lobbies';
import { Party } from './Party';
import { Settings } from './Settings';
import { ArtworkCompare } from './ArtworkCompare';
import { TileCompare } from './TileCompare';
import { SurfaceLab } from './SurfaceLab';
import { UpdateBanner } from './UpdateBanner';
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
const TilesetStudio = lazy(() => import('./TilePreview').then((m) => ({ default: m.TilesetStudio })));
const LevelEditor = lazy(() => import('./TilePreview').then((m) => ({ default: m.LevelEditor })));
const PortraitEditor = lazy(() => import('./PortraitEditor').then((m) => ({ default: m.PortraitEditor })));
const DoodadEditor = lazy(() => import('./DoodadEditor').then((m) => ({ default: m.DoodadEditor })));

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

  return (
    <>
      <UpdateBanner />
      {renderRoute(path)}
    </>
  );
}

function renderRoute(path: string): ReactElement {
  if (path === '/play' || path === '/skirmish') return split(<Skirmish />);
  if (path === '/tileset-studio') return split(<TilesetStudio />);
  // /unit-studio is a deep-link into the one Studio with the Units shelf
  // preselected — not a separate surface. Keeps old links working while the
  // catalog/lab/brush flow stays a single mounted component (no route swaps).
  if (path === '/unit-studio') return split(<TilesetStudio initialCategory="units" />);
  if (path === '/portrait-editor') return split(<PortraitEditor />);
  if (path === '/doodad-editor') return split(<DoodadEditor />);
  // /nine-slice-editor is a deep-link alias into the one Studio (like /unit-studio):
  // the 9-slice editor is an embedded Viewer surface, not its own route. The studio
  // reads ?asset=<frame> off this path and canonicalises the URL to /tileset-studio.
  if (path === '/nine-slice-editor') return split(<TilesetStudio />);
  // The level editor is now the studio's socket-legal board in the original
  // asset-backed chrome; the old Pixi LevelEditor/EditorBoard is retired.
  if (path === '/edit' || path === '/level-editor') return split(<LevelEditor />);
  // /campaign (singular) is the play surface — pick a campaign; /campaigns-next is
  // the authoring editor. Distinct paths, so order here doesn't matter.
  if (path === '/campaign' || path.startsWith('/campaign/')) return <Campaign />;
  if (path === '/campaigns-next' || path === '/campaigns') return split(<CampaignEditor />);
  if (path === '/lobbies' || path.startsWith('/lobbies/')) return <Lobbies />;
  if (path === '/party') return <Party />;
  if (path === '/settings' || path.startsWith('/settings/')) return <Settings />;
  if (path === '/artwork-compare') return <ArtworkCompare />;
  if (path === '/tile-compare') return <TileCompare />;
  if (path === '/surface-lab') return <SurfaceLab />;
  return <MainMenu />;
}
