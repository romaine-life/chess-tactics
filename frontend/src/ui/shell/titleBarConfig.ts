// Route -> persistent app-shell title-bar config, consumed by the single
// <AppTitleBar> rendered in App. The single bar renders from this table so it
// survives navigation, and it ALWAYS draws the invariant chrome — BrandLockup
// (leading) + HeaderAccountCluster (trailing) — on every route (ADR-0042). A config
// can only ADD optional regions between brand and cluster; nothing here can suppress
// the cluster. Every shipping surface (Studio + dev/inspector tools included) is on
// the shared bar; there is no opt-out set, and the function never returns null.
export interface TitleBarConfig {
  screenName: string;
  /** Hide the Settings gear in the cluster. ONLY the Settings screen itself sets this
   *  (you don't link to Settings from Settings); the account control still renders. */
  showSettingsGear?: boolean;
  /** Where the cluster's signed-out Sign In control returns to from this screen. */
  signInReturnTo?: string;
  /** Extra class on the bar element to reuse a screen's column layout (e.g. the
   *  menu's 2-column main-menu-twin-header, or an editor's 4-section bar). */
  barClass?: string;
  /** Render a center portal slot the screen fills via <TitleBarSlot region="center">. */
  centerSlot?: boolean;
  /** Render an actions portal slot (labeled controls) the screen fills via
   *  <TitleBarSlot region="actions">. Laid out BEFORE the cluster — additive, never
   *  a replacement for it (ADR-0042). */
  actionsSlot?: boolean;
}

export function titleBarConfig(path: string): TitleBarConfig | null {
  // The design/asset Studio + its deep-link aliases: brand left, account cluster right.
  if (path === '/tileset-studio' || path === '/unit-studio' || path === '/nine-slice-editor') {
    return { screenName: 'Studio' };
  }
  // Dev / inspector tools — the shared bar with just brand + account cluster.
  if (path === '/portrait-editor') return { screenName: 'Portrait Editor' };
  if (path === '/doodad-editor') return { screenName: 'Doodad Editor' };
  if (path === '/tile-compare') return { screenName: 'Tile Compare' };
  if (path === '/artwork-compare') return { screenName: 'Artwork Compare' };
  if (path === '/surface-lab') return { screenName: 'Surface Lab' };

  if (path === '/play' || path === '/skirmish') {
    return { screenName: 'Skirmish', barClass: 'skirmish-topbar', centerSlot: true };
  }
  if (path === '/lobbies' || path.startsWith('/lobbies/')) {
    return { screenName: 'Lobbies', signInReturnTo: '/lobbies' };
  }
  if (path === '/party') {
    return { screenName: 'Party', signInReturnTo: '/party' };
  }
  if (path === '/edit' || path === '/level-editor') {
    return { screenName: 'Level Editor', barClass: 'le-topbar', centerSlot: true, actionsSlot: true };
  }
  if (path === '/campaigns-next' || path === '/campaigns') {
    return { screenName: 'Campaign Editor', barClass: 'ce-topbar', centerSlot: true, actionsSlot: true };
  }
  if (path === '/settings' || path.startsWith('/settings/')) {
    // The Settings body scales with the UI-Scale setting (zoom: --settings-ui-scale on
    // .settings-screen). The bar lives outside that element, so tag it to ride the same
    // (global, on documentElement) var — the persistent bar drops this class on the next
    // screen, so only Settings scales. showSettingsGear:false hides only the gear (no
    // self-link to Settings); the account control still renders (ADR-0036/0042).
    return { screenName: 'Settings', showSettingsGear: false, signInReturnTo: '/settings', barClass: 'app-titlebar--ui-scaled' };
  }
  if (path === '/campaign' || path.startsWith('/campaign/')) {
    return { screenName: 'Campaign', signInReturnTo: '/campaign', barClass: 'main-menu-twin-header' };
  }
  // Fallback: the Main Menu — renderRoute's default for any unmatched path.
  return { screenName: 'Main Menu', signInReturnTo: '/', barClass: 'main-menu-twin-header' };
}
