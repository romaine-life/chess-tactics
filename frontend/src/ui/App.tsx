import { lazy, Suspense, type ReactElement } from 'react';
import { MainMenu } from './MainMenu';
import { Lobbies } from './Lobbies';
import { Party } from './Party';
import { Settings } from './Settings';
import { DesignSurface } from './design/DesignSurface';

// The Pixi-heavy / larger surfaces are code-split so the menu, lobbies, etc.
// don't pull the renderer bundle (preserving app.js's lazy-mount behaviour).
const Skirmish = lazy(() => import('./Skirmish').then((m) => ({ default: m.Skirmish })));
const LevelEditor = lazy(() => import('./LevelEditor').then((m) => ({ default: m.LevelEditor })));
const CampaignEditor = lazy(() => import('./CampaignEditor').then((m) => ({ default: m.CampaignEditor })));

const fallback = <div style={{ padding: 40, color: 'var(--ds-ink-3)', fontFamily: 'var(--ds-font-sans)' }}>Loading…</div>;
const split = (node: ReactElement): ReactElement => <Suspense fallback={fallback}>{node}</Suspense>;

// React router replacing app.js's string-HTML router. Plain path matching over
// window.location (links are full navigations). Legacy paths (/skirmish,
// /level-editor, /campaigns, /menu-next, /main-menu) resolve to React surfaces.
export function App(): ReactElement {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/play' || path === '/skirmish') return split(<Skirmish />);
  if (path === '/edit' || path === '/level-editor') return split(<LevelEditor />);
  if (path === '/campaigns-next' || path === '/campaigns') return split(<CampaignEditor />);
  if (path === '/lobbies' || path.startsWith('/lobbies/')) return <Lobbies />;
  if (path === '/party') return <Party />;
  if (path === '/settings') return <Settings />;
  if (path === '/design' || path.startsWith('/design/')) return <DesignSurface />;
  return <MainMenu />;
}
