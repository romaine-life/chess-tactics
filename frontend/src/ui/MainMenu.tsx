import { lazy, useEffect, type ReactElement } from 'react';
import { HomepageBackdrop } from './HomepageBackdrop';
import { ArtRouteChrome } from './shell/ArtRouteChrome';
import { loadingMark, loadingMeasure } from '../diagnostics/loadingTimeline';
import { Settings } from './Settings';
import { PlayMenu } from './PlayMenu';
import { Lobbies } from './Lobbies';
import { Enchiridion } from './Enchiridion';
import { enchiridionRelicFromPath, enchiridionRelicHref, enchiridionSectionFromPath } from './enchiridionRoute';
import { ApparatusRailTab } from './shared/ApparatusRailTab';
import { isPlaySelectorPath, PLAY_SELECTOR_ROOT } from './playHubRoute';
import { loadDecodedImage } from '../render/imageResources';

// The Editor is heavier / code-split out of the menu bundle. App's SceneBoundary
// keeps the destination unrevealed while its shared Suspense boundary resolves.
const CampaignEditor = lazy(() => import('./CampaignEditor').then((m) => ({ default: m.CampaignEditor })));
const WarEditor = lazy(() => import('./WarEditor').then((m) => ({ default: m.WarEditor })));
import { drawableAssets, requiredDrawableRole } from '@chess-tactics/board-render';
import { useStartupScene } from './shell/startupScene';
import { installedUiMedia } from './installedUiMedia';
import { sceneTransitionTargetAttributes } from './shell/sceneTransitionTarget';

const BRAND_SHIELD = () => installedUiMedia('ui-kit-icons-brand-shield-png');
// The heaviest button asset — the carved-stone surface behind every rail tab. The
// buttons layer only counts as "ready" once this (plus the icons) has decoded, so the
// rail never reveals as bare panels with the stone snapping in underneath later.
const STONE_SURFACE = () => installedUiMedia('ui-surfaces-baseline-stone-blue-avif');
// The title bar's wooden surface — gate the title layer on it (plus the brand shield)
// so the bar reveals whole, not wordmark-first then wood.
const TITLE_SURFACE = () => installedUiMedia('ui-surfaces-hybrid-wood-oak-png');

interface MenuTab { slug: string; label: string; href: string; icon: string }

// The main-menu rail. Play is the one player-facing entry for Skirmish, standalone
// Levels, and Campaigns (ADR-0074). The database-owned menu-mode inventory supplies
// the visible entries, their ordering, routes, labels, and icon assignments.
const currentMenuTabs = (): MenuTab[] => drawableAssets('menu-mode').map((asset) => {
  const slug = String(asset.behavior.value ?? '');
  const href = String(asset.behavior.route ?? '');
  const icon = asset.media.icon?.media.immutableUrl;
  if (!slug || !href || !icon) throw new Error(`menu mode ${asset.id} is incomplete`);
  return { slug, label: asset.label, href, icon };
});
const MENU_TABS: MenuTab[] = new Proxy([], { get: (_target, property) => { const values = currentMenuTabs(); const value = Reflect.get(values, property); return typeof value === 'function' ? value.bind(values) : value; } });

// The trailing-edge Settings control (carved gear) — moved out of the rail into the
// account cluster (ADR-0036). Lives next to the avatar so the top-right reads as one
// "settings + user" unit.
const SETTINGS_ICON = () => requiredDrawableRole('menu-mode', 'settings').media.icon.media.immutableUrl;

// A mode entry rendered as a settings-style rail tab (shared baked-skin frame —
// line frame over the stone surface — carved icon + label). The same chrome the
// Settings sidebar uses, so the menu and the rest of the app read as one family
// (retires the bespoke stone slabs). A NavButton, not an anchor (ADR-0052): game
// controls are buttons; the route is the address, not the affordance.
// `index` is the tab's position down the rail — it drives the shared stone-continuity
// slice (--tab-index) so this rail's stone reads as one sheet however many tabs it has
// (the menu carries five; the Settings screen four). See .settings-tab in style.css.
// `active` lights the tab whose destination is currently open in the shell (ADR-0062 family).
function ModeTab({ tab, index, active }: { tab: MenuTab; index: number; active?: boolean }): ReactElement {
  return <ApparatusRailTab label={tab.label} to={active ? '/' : tab.href} index={index} active={active} iconSrc={tab.icon} />;
}

// Which menu destinations render INSIDE the persistent shell (their own columns beside the pinned
// button column) vs. navigate away to a full screen. Settings, Play, Editor, and Lobbies live in
// the shell; the selected live board and nested Level Editor take the whole screen.
type ShellDest = 'settings' | 'play' | 'editor' | 'lobbies' | 'enchiridion';
const DEST_HREF: Record<ShellDest, string> = {
  settings: '/settings',
  play: PLAY_SELECTOR_ROOT,
  editor: '/editor',
  lobbies: '/lobbies',
  enchiridion: '/enchiridion/units',
};
const DEST_LABEL: Record<ShellDest, string> = {
  settings: 'Settings',
  play: 'Play',
  editor: 'Editor',
  lobbies: 'Lobbies',
  enchiridion: 'Enchiridion',
};
function shellDest(path: string): ShellDest | null {
  if (path === '/settings' || path.startsWith('/settings/')) return 'settings';
  if (isPlaySelectorPath(path)) return 'play';
  // The Editor is a settings-twin now (ADR-0065): canonical /editor + legacy /campaigns-next·/campaigns.
  // The board editor (/editor/level) is a separate heavy full screen — NOT a shell dest.
  if (path === '/editor' || path === '/editor/wars' || path === '/campaigns-next' || path === '/campaigns') return 'editor';
  // Lobbies is a single ACTION column (tab → action) — host/join + the lobby list.
  if (path === '/lobbies' || path.startsWith('/lobbies/')) return 'lobbies';
  if (path === '/enchiridion' || path.startsWith('/enchiridion/')) return 'enchiridion';
  return null;
}


export function MainMenu({
  path = '/',
  search = '',
  sceneInstanceKey = 'main-menu',
}: {
  path?: string;
  search?: string;
  sceneInstanceKey?: string;
} = {}): ReactElement {
  // The persistent menu shell. The button column and selected destination are one
  // scene composition; App owns their navigation fade and paint gate.
  // A menu-config destination fills the shell's SECOND column with its own fixed-width columns; the
  // home route leaves it empty. The rail's zoom-safe placement (ADR-0062) is untouched — the
  // destination just occupies the previously-empty grid track to its right.
  const dest = shellDest(path);
  // Ordered startup scene: background, title, and buttons report real readiness and
  // reveal in that fixed sequence (rain remains decorative)
  // (see shell/startupScene). Here MainMenu just reports readiness for the title's brand
  // mark and the buttons' art (icons + stone surface) and gates the background + button
  // layers off the director's stage; the director owns the sequence and the background
  // probe. On later/home-family navigation the director supplies an already-complete
  // controller, so this transport does not introduce another reveal lifecycle.
  const startup = useStartupScene();
  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('main-menu-active');
    return () => shell?.classList.remove('main-menu-active');
  }, []);

  useEffect(() => {
    const startedAt = performance.now();
    loadingMark('menu', 'critical-art-decode-start');
    // Title: the brand shield + the wooden bar surface, so the bar reveals whole.
    void Promise.all([BRAND_SHIELD(), TITLE_SURFACE()].map(loadDecodedImage)).then(() => {
      startup.reportReady('title');
      loadingMeasure('menu', 'title-art-decoded', startedAt);
    }).catch(startup.reportFailed);
    // Buttons: the carved icons + the heaviest stone rail surface.
    const buttonArt = [SETTINGS_ICON(), STONE_SURFACE(), ...MENU_TABS.map((tab) => tab.icon)];
    void Promise.all(buttonArt.map(loadDecodedImage)).then(() => {
      startup.reportReady('controls');
      requestAnimationFrame(() => loadingMeasure('menu', 'button-art-first-painted-frame', startedAt, { assetCount: buttonArt.length }));
    }).catch(startup.reportFailed);
  }, [startup.generation, startup.reportFailed, startup.reportReady]);

  return (
    <div
      className="menu-layer main-menu-layer"
      data-testid="main-menu-next"
      data-reveal-bg={startup.revealed('background') ? '' : undefined}
      data-reveal-buttons={startup.revealed('controls') ? '' : undefined}
    >
      <HomepageBackdrop />
      {/* Settings-twin layout (ADR-0003 superseded): shared app title bar + a rail of
          mode tabs + a framed feature panel — the same baked-skin chrome as /settings.
          The rail is placed by the shared .settings-shell rule alone (ADR-0062) — no
          home-only position class — so its buttons line up pixel-for-pixel with the
          Settings/Play rails at every width. */}
      <div className={`settings-screen main-menu-twin-screen app-shell-bar-pad ${dest ? 'has-dest' : ''}`.trim()} data-dest={dest ?? undefined}>
        <ArtRouteChrome className="settings-shell">
          <aside className="settings-frame settings-rail-frame" aria-label="Game modes">
            {/* Family membership, not string equality: the installed route may be any
                address within the destination (e.g. the Play record migrating from the
                skirmish tab to the hub root) and the tab must still light. */}
            {MENU_TABS.map((tab, index) => <ModeTab key={tab.slug} tab={tab} index={index} active={dest !== null && shellDest(tab.href) === dest} />)}
          </aside>
          <div
            className="menu-dest"
            {...sceneTransitionTargetAttributes('menu-shell')}
            data-scene-instance={sceneInstanceKey}
            key={dest ?? 'home'}
            aria-label={dest ? DEST_LABEL[dest] : 'Main menu destination'}
          >
            {dest
              ? dest === 'settings' ? <Settings embedded path={path} search={search} sceneInstanceKey={sceneInstanceKey} />
                : dest === 'play' ? <PlayMenu path={path} sceneInstanceKey={sceneInstanceKey} />
                : dest === 'lobbies' ? <Lobbies embedded />
                : dest === 'enchiridion' ? (
                    <Enchiridion
                      section={enchiridionSectionFromPath(path)}
                      selectedRelicId={enchiridionRelicFromPath(path)}
                      relicHref={enchiridionRelicHref}
                      sceneInstanceKey={sceneInstanceKey}
                      framed={false}
                    />
                  )
                : path === '/editor/wars' ? <WarEditor embedded /> : <CampaignEditor embedded />
              : null}
          </div>
        </ArtRouteChrome>
      </div>
    </div>
  );
}
