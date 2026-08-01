// Client helpers for the chess-tactics auth surface. The backend is an OIDC BFF;
// host-only HttpOnly cookies carry its app-local session, so no token reaches
// browser JavaScript and no auth headers are needed on application requests.

export interface AuthUser {
  signed_in: boolean;
  email?: string;
  name?: string;
  avatar_url?: string | null;
  // True when the signed-in email is in the server's ADMIN_EMAILS allowlist. UI
  // affordance only (gates inline editing + "Publish to all players" for official
  // campaigns); the real gate is server-side requireAdmin. See ADR-0038.
  is_admin?: boolean;
}

export interface AuthStatus {
  user: AuthUser;
  /** False means the request never reached a usable auth response; it is not a sign-out. */
  reachable: boolean;
}

const AUTH_CHECK_TIMEOUT_MS = 10_000;
const AUTH_RETRY_DELAY_MS = 1_000;

/**
 * Keep network failure distinct from a real signed-out response. Editors need this distinction:
 * treating an offline signed-in user as anonymous strands their cloud document and can mislabel
 * recoverable work as a sign-in problem.
 */
export async function fetchMeStatus(): Promise<AuthStatus> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), AUTH_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch('/api/auth/me', {
      credentials: 'include',
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        user: { signed_in: false },
        reachable: res.status < 500,
      };
    }
    return {
      user: (await res.json()) as AuthUser,
      reachable: true,
    };
  } catch {
    return { user: { signed_in: false }, reachable: false };
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

/**
 * Resolve an authoritative auth response across a temporary backend outage.
 *
 * Vite can keep serving the app shell while its required backend is restarting. A
 * single 5xx in that window is not a sign-out, so persistent chrome waits and
 * retries until the backend can answer. A reachable signed-out response still
 * settles immediately.
 */
export async function fetchReachableAuthStatus(
  signal?: AbortSignal,
  retryDelayMs: number = AUTH_RETRY_DELAY_MS,
): Promise<AuthStatus | null> {
  while (!signal?.aborted) {
    const status = await fetchMeStatus();
    if (signal?.aborted) return null;
    if (status.reachable) return status;

    const retry = await new Promise<boolean>((resolve) => {
      let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
      const stop = (): void => {
        if (timer !== undefined) globalThis.clearTimeout(timer);
        signal?.removeEventListener('abort', stop);
        resolve(false);
      };
      timer = globalThis.setTimeout(() => {
        signal?.removeEventListener('abort', stop);
        resolve(true);
      }, Math.max(0, retryDelayMs));
      signal?.addEventListener('abort', stop, { once: true });
    });
    if (!retry) return null;
  }
  return null;
}

export async function fetchMe(): Promise<AuthUser> {
  return (await fetchMeStatus()).user;
}

// Set (or clear, with an empty string) the signed-in user's display name — the
// editable account username. The email is the immutable identity and is unaffected.
// Resolves to the refreshed user; rejects on failure so the caller can surface it.
export async function updateDisplayName(name: string): Promise<AuthUser> {
  const res = await fetch('/api/auth/me', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`rename failed: ${res.status}`);
  return (await res.json()) as AuthUser;
}

export function signInHref(returnTo: string = window.location.pathname + window.location.search): string {
  return `/api/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
}

export function goSignIn(returnTo?: string): void {
  window.location.href = signInHref(returnTo);
}

// True when an error thrown by a net client is a 401 (HttpError carries status).
export function isUnauthorized(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && (error as { status?: number }).status === 401;
}
