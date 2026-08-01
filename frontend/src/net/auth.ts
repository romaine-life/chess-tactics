// Client helpers for the chess-tactics auth surface. The backend is an OIDC BFF;
// host-only HttpOnly cookies carry its app-local session, so no token reaches
// browser JavaScript and no auth headers are needed on application requests.

import { HttpError } from './http';

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

function isAuthUser(value: unknown): value is AuthUser {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as { signed_in?: unknown }).signed_in === 'boolean';
}

/**
 * Keep network failure distinct from a real signed-out response. The session owner needs this
 * distinction: treating an offline signed-in user as anonymous strands cloud documents and can
 * mislabel recoverable work as a sign-in problem.
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
        // /api/auth/me expresses an authoritative signed-out state as a 200 JSON
        // payload. During a Vite/backend restart the proxy can briefly answer with
        // other 4xx/5xx responses; none of them is permission to render Sign In.
        reachable: false,
      };
    }
    const user: unknown = await res.json();
    if (!isAuthUser(user)) return { user: { signed_in: false }, reachable: false };
    return {
      user,
      reachable: true,
    };
  } catch {
    return { user: { signed_in: false }, reachable: false };
  } finally {
    globalThis.clearTimeout(timeout);
  }
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
  if (!res.ok) throw await HttpError.fromResponse('rename-account', res);
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
