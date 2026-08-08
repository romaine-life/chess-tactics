import { useSyncExternalStore } from 'react';
import { fetchMeStatus, isUnauthorized, type AuthStatus, type AuthUser } from './auth';

export type AuthSessionPhase = 'checking' | 'unavailable' | 'authenticated' | 'anonymous';

export interface AuthSessionSnapshot {
  phase: AuthSessionPhase;
  /** Null only before the owner has received its first authoritative or unavailable result. */
  status: AuthStatus | null;
}

type AuthStatusReader = () => Promise<AuthStatus>;
type AuthSessionListener = () => void;

export interface AuthSessionController {
  getSnapshot: () => AuthSessionSnapshot;
  subscribe: (listener: AuthSessionListener) => () => void;
  start: () => Promise<AuthStatus>;
  refresh: () => Promise<AuthStatus>;
  replaceUser: (user: AuthUser) => void;
  reportFailure: (error: unknown) => boolean;
}

const AUTH_RETRY_DELAY_MS = 1_000;
const INITIAL_AUTH_SESSION: AuthSessionSnapshot = Object.freeze({ phase: 'checking', status: null });

/**
 * The one client-side owner of `/api/auth/me` state (ADR-0306).
 *
 * Consumers subscribe to its snapshot or await `start`; they never probe, retry,
 * cache, or reinterpret authentication themselves. An unavailable backend is a
 * shared state transition, not an anonymous user.
 */
export function createAuthSessionController(
  readStatus: AuthStatusReader = fetchMeStatus,
  retryDelayMs: number = AUTH_RETRY_DELAY_MS,
): AuthSessionController {
  let snapshot = INITIAL_AUTH_SESSION;
  let inFlight: Promise<AuthStatus> | null = null;
  let refreshInFlight: Promise<AuthStatus> | null = null;
  const listeners = new Set<AuthSessionListener>();

  const publish = (next: AuthSessionSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const start = (): Promise<AuthStatus> => {
    if (snapshot.status?.reachable) return Promise.resolve(snapshot.status);
    if (inFlight) return inFlight;

    const probe = (async (): Promise<AuthStatus> => {
      for (;;) {
        let status: AuthStatus;
        try {
          status = await readStatus();
        } catch {
          // The production transport already converts failures to unavailable.
          // Keep the owner fail-safe if a replacement transport ever regresses.
          status = { user: { signed_in: false }, reachable: false };
        }
        if (status.reachable) {
          publish({
            phase: status.user.signed_in ? 'authenticated' : 'anonymous',
            status,
          });
          return status;
        }
        if (snapshot.phase !== 'unavailable') {
          publish({ phase: 'unavailable', status });
        }
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, Math.max(0, retryDelayMs)));
      }
    })();
    inFlight = probe;
    void probe.finally(() => {
      if (inFlight === probe) inFlight = null;
    });
    return probe;
  };

  /**
   * Re-read the authoritative status once, even when a reachable snapshot already exists.
   *
   * `start` deliberately settles and stops; a session can still expire, or be restored in another
   * tab, long after it settled. Callers that hold account-gated work — an open editor document —
   * use this to notice either transition without polling or caching identity themselves. An
   * unreachable probe keeps the last authoritative snapshot: a transport blip is not a sign-out,
   * and must not knock a signed-in shell into `unavailable` behind the owner's back.
   */
  const refresh = (): Promise<AuthStatus> => {
    if (refreshInFlight) return refreshInFlight;
    const probe = (async (): Promise<AuthStatus> => {
      let status: AuthStatus;
      try {
        status = await readStatus();
      } catch {
        status = { user: { signed_in: false }, reachable: false };
      }
      if (!status.reachable) return snapshot.status ?? status;
      publish({
        phase: status.user.signed_in ? 'authenticated' : 'anonymous',
        status,
      });
      return status;
    })();
    refreshInFlight = probe;
    void probe.finally(() => {
      if (refreshInFlight === probe) refreshInFlight = null;
    });
    return probe;
  };

  const replaceUser = (user: AuthUser): void => publish({
    phase: user.signed_in ? 'authenticated' : 'anonymous',
    status: { user, reachable: true },
  });

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start,
    refresh,
    replaceUser,
    reportFailure: (error) => {
      if (!isUnauthorized(error)) return false;
      replaceUser({ signed_in: false });
      return true;
    },
  };
}

export const authSession = createAuthSessionController();

export function startAuthSession(): Promise<AuthStatus> {
  return authSession.start();
}

/**
 * Re-read the authoritative identity status once and publish it. See `refresh` above.
 */
export function refreshAuthSession(): Promise<AuthStatus> {
  return authSession.refresh();
}

export function updateAuthSessionUser(user: AuthUser): void {
  authSession.replaceUser(user);
}

/**
 * Reconcile an account-gated operation with the shared identity owner.
 * Returns true only when the failure is an authoritative signed-out response.
 */
export function reportAuthSessionFailure(error: unknown): boolean {
  return authSession.reportFailure(error);
}

export function useAuthSession<T>(selector: (snapshot: AuthSessionSnapshot) => T): T {
  const snapshot = useSyncExternalStore(
    authSession.subscribe,
    authSession.getSnapshot,
    authSession.getSnapshot,
  );
  return selector(snapshot);
}
