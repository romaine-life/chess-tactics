import { lazy, Suspense, useEffect, type ReactElement } from 'react';
import { HomepageBackdrop } from './HomepageBackdrop';
import { ArtRouteChrome } from './shell/ArtRouteChrome';
import { Settings } from './Settings';
import { PlayMenu } from './PlayMenu';
import { Lobbies } from './Lobbies';
import { Enchiridion } from './Enchiridion';
import {
  enchiridionCardFromPath,
  enchiridionCardHref,
  enchiridionCardTypeFromPath,
  enchiridionCardTypeHref,
  enchiridionLipsanonFromPath,
  enchiridionLipsanonHref,
  enchiridionSectionFromPath,
} from './enchiridionRoute';
import { ApparatusRailColumn, ApparatusRailTab } from './shared/ApparatusRailTab';
import { isPlaySelectorPath, PLAY_SELECTOR_ROOT } from './playHubRoute';

// The Editor is heavier / code-split out of the menu bundle. App's SceneBoundary
// keeps the destination unrevealed while its shared Suspense boundary resolves.
const CampaignEditor = lazy(() => import('./CampaignEditor').then((m) => ({ default: m.CampaignEditor })));
import { drawableAssets } from '@chess-tactics/board-render';
import { useSceneReveal } from './shell/SceneBoundary';
import { menuModeIcon } from './menuModeIcon';
import { MenuDestinationSceneSlot } from './shell/AuthoredSceneSlot';

// The title bar's brand mark and wooden surface used to be decoded HERE, so the bar
// revealed whole on this one screen and nowhere else. Both are shell art now: a startup
// precondition plus the bar's own ladder rung (ADR-0369 / shell/shellChromeArt.ts).

interface MenuTab { slug: string; label: string; href: string; icon: string }

// The main-menu rail. Play is the one player-facing entry for Skirmish, standalone
// Levels, and Campaigns (ADR-0074). The database-owned menu-mode inventory supplies
// the visible entries, their ordering, routes, labels, and icon assignments.
const currentMenuTabs = (): MenuTab[] => drawableAssets('menu-mode').map((asset) => {
  const slug = String(asset.behavior.value ?? '');
  const href = String(asset.behavior.route ?? '');
  if (!slug || !href) throw new Error(`menu mode ${asset.id} is incomplete`);
  // Through the shared resolver, not asset.media directly: the Strategikon rail offers
  // the same Enchiridion destination and must read the identical mark (menuModeIcon).
  return { slug, label: asset.label, href, icon: menuModeIcon(slug) };
});
const MENU_TABS: MenuTab[] = new Proxy([], { get: (_target, property) => { const values = currentMenuTabs(); const value = Reflect.get(values, property); return typeof value === 'function' ? value.bind(values) : value; } });

// The trailing-edge Settings control (carved gear) — moved out of the rail into the
// account cluster (ADR-0036). Lives next to the avatar so the top-right reads as one
// "settings + user" unit.
// A mode entry rendered as a settings-style rail tab (shared baked-skin frame,
// shell-selected registered surface, carved icon + label). The main-menu shell
// supplies the same oak material to every semantic tab in its first and second
// columns, while the shared primitive keeps frame and geometry ownership. A
// NavButton, not an anchor (ADR-0052): game
// controls are buttons; the route is the address, not the affordance.
// `index` is the tab's position down the rail — it drives the shared surface-continuity
// slice (--tab-index) so this rail reads as one sheet however many tabs it has
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
  // The menu is an ordinary scene now. Its body reveals on the director's final ladder
  // rung, gated by the boundary's painted contract — which already decodes every image
  // this subtree references, including the rail icons this screen used to decode itself.
  const sceneRevealed = useSceneReveal();
  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('main-menu-active');
    return () => shell?.classList.remove('main-menu-active');
  }, []);

  // The shared backdrop's reveal is the director's first ladder rung now, owned by the
  // App-level host on every route; the menu's controls ride its scene reveal like any other
  // screen's body (ADR-0369). Neither is the menu's own bespoke choreography any more.
  return (
    <div
      className="menu-layer main-menu-layer"
      data-testid="main-menu-next"
      data-reveal-bg=""
      data-reveal-buttons={sceneRevealed ? '' : undefined}
    >
      <HomepageBackdrop />
      {/* Settings-twin layout (ADR-0003 superseded): shared app title bar + a rail of
          mode tabs + a framed feature panel — the same baked-skin chrome as /settings.
          The rail is placed by the shared .settings-shell rule alone (ADR-0062) — no
          home-only position class — so its buttons line up pixel-for-pixel with the
          Settings/Play rails at every width. */}
      <div
        className={`settings-screen main-menu-twin-screen app-shell-bar-pad ${dest ? 'has-dest' : ''}`.trim()}
        data-dest={dest ?? undefined}
      >
        <ArtRouteChrome className="settings-shell">
          <ApparatusRailColumn
            className="settings-frame settings-rail-frame"
            placement="framed"
            aria-label="Game modes"
          >
            {/* Family membership, not string equality: the installed route may be any
                address within the destination (e.g. the Play record migrating from the
                skirmish tab to the hub root) and the tab must still light. */}
            {MENU_TABS.map((tab, index) => <ModeTab key={tab.slug} tab={tab} index={index} active={dest !== null && shellDest(tab.href) === dest} />)}
          </ApparatusRailColumn>
          <MenuDestinationSceneSlot
            className="menu-dest"
            sceneInstance={sceneInstanceKey}
            key={dest ?? 'home'}
            aria-label={dest ? DEST_LABEL[dest] : 'Main menu destination'}
          >
            {/* A destination may suspend while its code chunk loads. Keep that suspension inside
                the replaceable menu slot so React never hides the persistent mode-button rail. */}
            <Suspense fallback={null}>
              {dest
                ? dest === 'settings' ? <Settings embedded path={path} search={search} sceneInstanceKey={sceneInstanceKey} />
                  : dest === 'play' ? <PlayMenu path={path} sceneInstanceKey={sceneInstanceKey} />
                  : dest === 'lobbies' ? <Lobbies embedded />
                  : dest === 'enchiridion' ? (
                      <Enchiridion
                        section={enchiridionSectionFromPath(path)}
                        cardTypeTextureBatch={new URLSearchParams(search).get('cardTypeTextureBatch')}
                        selectedLipsanonId={enchiridionLipsanonFromPath(path)}
                        lipsanonHref={enchiridionLipsanonHref}
                        selectedCardId={enchiridionCardFromPath(path)}
                        cardHref={enchiridionCardHref}
                        selectedCardTypeId={enchiridionCardTypeFromPath(path)}
                        cardTypeHref={enchiridionCardTypeHref}
                        sceneInstanceKey={sceneInstanceKey}
                        framed={false}
                      />
                    )
                  : <CampaignEditor embedded path={path} search={search} sceneInstanceKey={sceneInstanceKey} />
                : null}
            </Suspense>
          </MenuDestinationSceneSlot>
        </ArtRouteChrome>
      </div>
    </div>
  );
}
