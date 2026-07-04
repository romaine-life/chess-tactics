export const APP_NAVIGATION_EVENT = 'chess-tactics:navigate';

export function normalizeRoutePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

export function getAppNavigationUrl(href: string, baseHref: string = window.location.href): URL | null {
  let url: URL;
  let base: URL;
  try {
    url = new URL(href, baseHref);
    base = new URL(baseHref);
  } catch {
    return null;
  }

  if (url.origin !== base.origin) return null;
  if (url.pathname.startsWith('/api/')) return null;
  return url;
}

// The "return to where you came from" target carried as ?returnTo on a pushed screen's
// URL (written by the title-bar gear when opening Settings; read by Settings to draw the
// "‹ Back" control in the title bar's trailing actions slot and to thread the param
// through its own links). It
// becomes an anchor href, i.e. a navigation target, so it is strictly validated: it must
// RESOLVE same-origin (getAppNavigationUrl — the exact gate the click interceptor applies,
// so any host-escape trick the browser normalizes, e.g. `/\host` or `/<tab>/host`, is
// rejected) and must never point back into Settings (no self-loops). Returns a clean
// same-origin path+search+hash, or null when absent/invalid (⇒ no Back is shown).
// NOTE: distinct from the auth returnTo (net/auth signInHref), which lives on
// /api/auth/sign-in URLs, not here.
export function readValidatedReturnTo(search: string = window.location.search): string | null {
  const raw = new URLSearchParams(search).get('returnTo');
  if (!raw) return null;
  const url = getAppNavigationUrl(raw);
  if (!url) return null;
  const path = normalizeRoutePath(url.pathname);
  if (path === '/settings' || path.startsWith('/settings/')) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function shouldInterceptAppLinkClick(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target.toLowerCase() !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;

  const rawHref = anchor.getAttribute('href');
  if (!rawHref || rawHref.startsWith('#')) return false;

  return getAppNavigationUrl(anchor.href) !== null;
}

export function navigateApp(href: string, options: { replace?: boolean; scroll?: boolean } = {}): boolean {
  const url = getAppNavigationUrl(href);
  if (!url) return false;

  const nextHref = `${url.pathname}${url.search}${url.hash}`;
  const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextHref !== currentHref) {
    const method = options.replace ? 'replaceState' : 'pushState';
    window.history[method]({}, '', nextHref);
  }

  window.dispatchEvent(new CustomEvent(APP_NAVIGATION_EVENT, {
    detail: {
      href: nextHref,
      path: normalizeRoutePath(url.pathname),
    },
  }));

  if (options.scroll !== false && !url.hash) {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    } catch {
      window.scrollTo(0, 0);
    }
  }

  return true;
}
