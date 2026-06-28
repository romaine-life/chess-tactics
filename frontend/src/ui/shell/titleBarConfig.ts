// Route -> persistent app-shell title-bar config, consumed by the single
// <AppTitleBar> rendered in App. Returns null for routes that keep their OWN
// header — the Studio + dev surfaces are out of scope (they render their own bar),
// and screens not yet migrated to the shell bar also return null during the staged
// rollout. A non-null config means "the app-shell bar owns this screen's title bar".
export interface TitleBarConfig {
  screenName: string;
  /** Bar column layout modifier; default = brand + trailing cluster (2-trailing). */
  columns?: 'section' | 'editor';
  /** Render the shared HeaderAccountCluster on the right. */
  showAccountCluster?: boolean;
  /** Where sign-in returns to from this screen's account cluster. */
  signInReturnTo?: string;
}

export function titleBarConfig(path: string): TitleBarConfig | null {
  if (path === '/lobbies' || path.startsWith('/lobbies/')) {
    return { screenName: 'Lobbies', showAccountCluster: true, signInReturnTo: '/lobbies' };
  }
  if (path === '/party') {
    return { screenName: 'Party', showAccountCluster: true, signInReturnTo: '/party' };
  }
  return null;
}
