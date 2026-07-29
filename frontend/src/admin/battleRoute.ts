import { normalizeRoutePath } from '../ui/navigation';

const LAST_ADMIN_BATTLE_HREF_KEY = 'chess-tactics:last-admin-battle-href:v1';

export function isAdminBattleHref(href: string | null | undefined): href is string {
  if (!href || !href.startsWith('/')) return false;
  const path = normalizeRoutePath(href.split(/[?#]/, 1)[0]);
  return path === '/play' || path === '/run';
}

export function rememberAdminBattleHref(href: string): void {
  if (!isAdminBattleHref(href)) return;
  try { sessionStorage.setItem(LAST_ADMIN_BATTLE_HREF_KEY, href); } catch { /* ephemeral convenience only */ }
}

export function readAdminBattleHref(returnTo?: string | null): string | null {
  if (isAdminBattleHref(returnTo)) return returnTo;
  try {
    const remembered = sessionStorage.getItem(LAST_ADMIN_BATTLE_HREF_KEY);
    return isAdminBattleHref(remembered) ? remembered : null;
  } catch {
    return null;
  }
}
