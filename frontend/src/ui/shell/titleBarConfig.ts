// Route -> persistent app-shell title-bar config, consumed by the single
// <AppTitleBar> rendered in App. A non-null config means "the app-shell bar owns
// this screen's title bar"; null means the screen still renders its OWN header (a
// screen not yet migrated to the shell bar). The single bar renders from this table
// so it survives navigation. Every shipping surface — including the design/asset
// Studio and the dev/inspector tools — is on the shared bar; there is no permanent
// opt-out set.
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

export function titleBarConfig(path: string): TitleBarConfig | null {
  // The design/asset Studio + its deep-link aliases: brand left, breadcrumb in the
  // center slot (filled by <TitleBarSlot> inside the studio), account cluster right.
  if (path === '/tileset-studio' || path === '/unit-studio' || path === '/nine-slice-editor') {
    return { screenName: 'Studio', barClass: 'tileset-studio-titlebar', centerSlot: true, showAccountCluster: true };
  }
  // Dev / inspector tools — the shared bar with just brand + account cluster.
  if (path === '/portrait-editor') return { screenName: 'Portrait Editor', showAccountCluster: true };
  if (path === '/doodad-editor') return { screenName: 'Doodad Editor', showAccountCluster: true };
  if (path === '/tile-compare') return { screenName: 'Tile Compare', showAccountCluster: true };
  if (path === '/artwork-compare') return { screenName: 'Artwork Compare', showAccountCluster: true };
  if (path === '/surface-lab') return { screenName: 'Surface Lab', showAccountCluster: true };

  if (path === '/play' || path === '/skirmish') {
    return { screenName: 'Skirmish', barClass: 'skirmish-topbar', centerSlot: true, showAccountCluster: true };
  }
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
    // The Settings body scales with the UI-Scale setting (zoom: --settings-ui-scale on
    // .settings-screen). The bar lives outside that element, so tag it to ride the same
    // (global, on documentElement) var — the persistent bar drops this class on the next
    // screen, so only Settings scales.
    return { screenName: 'Settings', showAccountCluster: true, showSettingsGear: false, signInReturnTo: '/settings', barClass: 'app-titlebar--ui-scaled' };
  }
  if (path === '/campaign' || path.startsWith('/campaign/')) {
    return { screenName: 'Campaign', showAccountCluster: true, signInReturnTo: '/campaign', barClass: 'main-menu-twin-header' };
  }
  // Fallback: the Main Menu — renderRoute's default for any unmatched path.
  return { screenName: 'Main Menu', showAccountCluster: true, signInReturnTo: '/', barClass: 'main-menu-twin-header' };
}
