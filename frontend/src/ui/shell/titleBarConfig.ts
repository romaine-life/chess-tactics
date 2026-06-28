// Route -> persistent app-shell title-bar config, consumed by the single
// <AppTitleBar> rendered in App. A non-null config means "the app-shell bar owns
// this screen's title bar"; null means the screen keeps its OWN header — either it's
// out of scope (the Studio + dev surfaces) or it hasn't been migrated yet (staged
// rollout). The single bar renders from this table so it survives navigation.
export interface TitleBarConfig {
  screenName: string;
  /** Render the shared HeaderAccountCluster on the right. */
  showAccountCluster?: boolean;
  /** Show the Settings gear in the cluster. Hidden on the Settings screen itself. */
  showSettingsGear?: boolean;
  /** Where sign-in returns to from this screen's account cluster. */
  signInReturnTo?: string;
  /** Extra class on the bar element to reuse a screen's column layout (e.g. the
   *  menu's 2-column main-menu-twin-header, or an editor's 3-section bar). */
  barClass?: string;
  /** Render a center portal slot the screen fills via <TitleBarSlot region="center">. */
  centerSlot?: boolean;
  /** Render a right portal slot for custom actions (instead of the account cluster). */
  rightSlot?: boolean;
}

// Out of scope — render their own header (Studio + dev/compare surfaces).
const KEEPS_OWN_HEADER = new Set<string>([
  '/tileset-studio', '/unit-studio', '/nine-slice-editor',
  '/portrait-editor', '/doodad-editor',
  '/artwork-compare', '/tile-compare', '/surface-lab',
]);

// Not yet migrated to the shell bar — still render their own header (staged rollout).
const NOT_YET_MIGRATED = new Set<string>([
  '/play', '/skirmish',
]);

export function titleBarConfig(path: string): TitleBarConfig | null {
  if (KEEPS_OWN_HEADER.has(path) || NOT_YET_MIGRATED.has(path)) return null;

  if (path === '/lobbies' || path.startsWith('/lobbies/')) {
    return { screenName: 'Lobbies', showAccountCluster: true, signInReturnTo: '/lobbies' };
  }
  if (path === '/party') {
    return { screenName: 'Party', showAccountCluster: true, signInReturnTo: '/party' };
  }
  if (path === '/edit' || path === '/level-editor') {
    return { screenName: 'Level Editor', barClass: 'le-topbar', centerSlot: true, rightSlot: true };
  }
  if (path === '/campaigns-next' || path === '/campaigns') {
    return { screenName: 'Campaign Editor', barClass: 'ce-topbar', centerSlot: true, rightSlot: true };
  }
  if (path === '/settings' || path.startsWith('/settings/')) {
    return { screenName: 'Settings', showAccountCluster: true, showSettingsGear: false, signInReturnTo: '/settings' };
  }
  if (path === '/campaign' || path.startsWith('/campaign/')) {
    return { screenName: 'Campaign', showAccountCluster: true, signInReturnTo: '/campaign', barClass: 'main-menu-twin-header' };
  }
  // Fallback: the Main Menu — renderRoute's default for any unmatched path.
  return { screenName: 'Main Menu', showAccountCluster: true, signInReturnTo: '/', barClass: 'main-menu-twin-header' };
}
