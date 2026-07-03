// Light-hop exit phase (ADR-0051). When a navigation leaves a light-art screen for a
// DIFFERENT screen, App holds the route swap for a short dissolve of the outgoing
// chrome — the exit counterpart of the ADR-0046 entrance. This is the same
// cover-then-swap shape as the heavy routes' veil, minus the opaque field: the shared
// ambience backdrop stays lit while only the enrolled chrome fades.
//
// A module-scope store (like shell/coldReveal) rather than context because the
// participants live in separate subtrees: App drives the phase from its nav handler,
// while every mounted ArtRouteChrome — the only chrome enrolled in screen transitions
// (ADR-0046 B) — reads it via useSyncExternalStore and wears `.screen-exit` while set.
//
// The flag can stay up PAST the route swap (until the incoming screen commits) so a
// slow lazy chunk can't flash the faded-out screen back to full opacity while it
// loads. ArtRouteChrome therefore ignores the flag on chrome that MOUNTS while it is
// up — only chrome present when the exit began dissolves.

let exiting = false;
const listeners = new Set<() => void>();

// Keep in lockstep with --route-exit-ms in style.css (JS times the swap; CSS the fade).
export const SCREEN_EXIT_MS = 200;

export function setScreenExiting(value: boolean): void {
  if (exiting === value) return;
  exiting = value;
  for (const cb of listeners) cb();
}

export function subscribeScreenExit(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function isScreenExiting(): boolean {
  return exiting;
}
