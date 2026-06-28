// Client helpers for the chess-tactics auth surface. The backend proxies the
// session to auth.romaine.life; same-origin cookies carry it, so no headers are
// needed on any request.

export interface AuthUser {
  signed_in: boolean;
  email?: string;
  name?: string;
  avatar_url?: string | null;
  // True when the signed-in email is in the server's ADMIN_EMAILS allowlist. UI
  // affordance only (gates the editor's "Edit Officials" tab); the real gate is
  // server-side requireAdmin. See ADR-0038.
  is_admin?: boolean;
}

export async function fetchMe(): Promise<AuthUser> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) return { signed_in: false };
    return (await res.json()) as AuthUser;
  } catch {
    return { signed_in: false };
  }
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
