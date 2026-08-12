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
  wake: (minGapMs?: number) => Promise<AuthStatus | null>;
  reprobeIntervalMs: () => number;
}

const AUTH_RETRY_DELAY_MS = 1_000;
const INITIAL_AUTH_SESSION: AuthSessionSnapshot = Object.freeze({ phase: 'checking', status: null });

/**
 * How often the owner re-reads identity on its own, by phase.
 *
 * A settled session is not a permanent one: it expires on a schedule the browser cannot see, and
 * before this existed the shell went on claiming a dead session was live until something happened
 * to 401 — which for a game that needs no session to play could be hours (ADR-0306's
 * `authenticated` state was authoritative when published and then never re-read).
 *
 * Signed out is the impatient case: someone is likely signing in right now, in this tab or
 * another, and the cost of noticing late is a screen that says signed-out over work that is not.
 * Signed in is the patient case — nothing is waiting on the answer, so this is a liveness check,
 * not a poll.
 */
const REPROBE_SIGNED_IN_MS = 5 * 60_000;
const REPROBE_SIGNED_OUT_MS = 20_000;
/** Floor between probes driven by the person returning, so a flurry of focus events is one read. */
const PRESENCE_FLOOR_MS = 3_000;
/** The tick that drives cadence. Short, because `wake` decides; the timer only offers. */
const WATCH_TICK_MS = 5_000;

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
  now: () => number = () => Date.now(),
): AuthSessionController {
  let snapshot = INITIAL_AUTH_SESSION;
  let inFlight: Promise<AuthStatus> | null = null;
  let refreshInFlight: Promise<AuthStatus> | null = null;
  let lastProbeAt = 0;
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
        lastProbeAt = now();
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
   *
   * The RETURN value is this probe's own result, including a false `reachable`. The published
   * snapshot and the probe outcome answer different questions: the snapshot is what the shell may
   * claim about the user, while the caller that asked also needs to know whether the backend
   * answered at all. Returning the retained snapshot instead reported a reachable backend on a
   * probe that never reached one, which is the single fact a caller waiting for the backend to
   * come back is waiting on.
   */
  const refresh = (): Promise<AuthStatus> => {
    if (refreshInFlight) return refreshInFlight;
    lastProbeAt = now();
    const probe = (async (): Promise<AuthStatus> => {
      let status: AuthStatus;
      try {
        status = await readStatus();
      } catch {
        status = { user: { signed_in: false }, reachable: false };
      }
      if (!status.reachable) return status;
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

  const reprobeIntervalMs = (): number => (
    snapshot.phase === 'authenticated' ? REPROBE_SIGNED_IN_MS : REPROBE_SIGNED_OUT_MS
  );

  /**
   * Re-read identity if at least `minGapMs` has passed since the last read.
   *
   * One throttle serves both callers. The lifecycle passes a short floor, because someone
   * returning to the tab wants an answer now; the cadence tick passes `reprobeIntervalMs()`, so
   * offering every few seconds costs nothing until the interval has actually elapsed. Resolves
   * null when the gap has not passed — the caller learns nothing was read, rather than being
   * handed a stale snapshot dressed up as a fresh answer.
   */
  const wake = (minGapMs: number = PRESENCE_FLOOR_MS): Promise<AuthStatus | null> => {
    // Before the first authoritative answer, `start` already owns an unbounded retry loop.
    // Waking alongside it would race a second reader against the one that is retrying.
    if (!snapshot.status) return Promise.resolve(null);
    if (now() - lastProbeAt < minGapMs) return Promise.resolve(null);
    return refresh();
  };

  return {
    wake,
    reprobeIntervalMs,
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
 * Re-read the authoritative identity status once and publish it. Resolves with THIS probe's
 * result, so an unreachable backend resolves `reachable: false` even though the published
 * snapshot deliberately keeps the last authoritative one. See `refresh` above.
 */
export function refreshAuthSession(): Promise<AuthStatus> {
  return authSession.refresh();
}

/**
 * Keep the shared identity honest for as long as the application is open.
 *
 * The owner settles once and then stops (`start`), which was correct for answering "who is this"
 * and wrong for keeping the answer true. A session expires on a schedule the browser cannot
 * observe, so without this the shell presents a signed-in account over a session that ended some
 * time ago, and only discovers otherwise when an account-gated call happens to 401. In a game
 * that needs no session to play, that call may never come.
 *
 * Bound to the application, not to a screen: screens come and go, identity does not. Screens that
 * need to react subscribe to the snapshot rather than scheduling reads of their own (ADR-0306,
 * ADR-0059).
 *
 * Hidden documents are skipped. A background tab has nobody to mislead, and waking dozens of them
 * on a timer would multiply load on the identity provider for an answer no one is reading.
 */
export function watchAuthSession(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const whenVisible = (minGapMs?: number) => (): void => {
    if (document.hidden) return;
    void authSession.wake(minGapMs);
  };
  const onPresence = whenVisible();
  const onTick = (): void => {
    if (document.hidden) return;
    void authSession.wake(authSession.reprobeIntervalMs());
  };
  const timer = window.setInterval(onTick, WATCH_TICK_MS);
  window.addEventListener('focus', onPresence);
  window.addEventListener('online', onPresence);
  document.addEventListener('visibilitychange', onPresence);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('focus', onPresence);
    window.removeEventListener('online', onPresence);
    document.removeEventListener('visibilitychange', onPresence);
  };
}

/**
 * A comparable scalar for "which account this browser is currently acting as".
 *
 * The owner derives it so no screen re-reads identity out of the raw status (ADR-0306). Equal keys
 * are the same session; a changed key is a real transition — signed in, signed out, or a different
 * account — and that is the only identity movement a consumer is entitled to react to. A status
 * that never reached the backend has no identity to compare and answers `unknown`.
 */
export function authSessionIdentityKey(status: AuthStatus | null): string {
  if (!status?.reachable) return 'unknown';
  return status.user.signed_in ? `account:${status.user.email ?? ''}` : 'anonymous';
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
