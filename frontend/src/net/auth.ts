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
  /**
   * False when admin writes would be rejected right now because credentials were last presented
   * more than eight hours ago (ADR-0576, decision 3). The session itself is unaffected — this is
   * not a sign-out, and treating it as one is the mistake `isUnauthorized` exists to avoid.
   *
   * Carried so an admin can re-authenticate before losing work to a rejected save.
   */
  admin_fresh?: boolean;
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

/**
 * True when a 401 means the authentication behind a still-valid session is not recent enough
 * (RFC 9470's `insufficient_user_authentication`).
 *
 * Admin capability expires eight hours after credentials were presented, while the session itself
 * lasts far longer (ADR-0576). The person is signed in; they are being asked to prove it again
 * before publishing game content.
 */
export function isReauthenticationRequired(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { status, details } = error as { status?: number; details?: string };
  return status === 401 && String(details || '').includes('insufficient_user_authentication');
}

/**
 * True when an error thrown by a net client is an authoritative sign-out (HttpError carries
 * status).
 *
 * A step-up challenge is deliberately excluded. It arrives as a 401 and is not a sign-out, and
 * reporting it as one would knock the whole shell to anonymous over a session that is perfectly
 * alive — the same class of lie ADR-0575 removed from the other direction.
 */
export function isUnauthorized(error: unknown): boolean {
  if (isReauthenticationRequired(error)) return false;
  return Boolean(error) && typeof error === 'object' && (error as { status?: number }).status === 401;
}
