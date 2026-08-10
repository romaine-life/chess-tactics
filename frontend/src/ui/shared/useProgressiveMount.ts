import { useEffect, useState } from 'react';

// How many of a long list to put on the page RIGHT NOW, growing across frames until all of it
// is there.
//
// Why this exists: a React commit and the layout effects that follow it are atomic — the browser
// cannot paint through them — so a screen that mounts its whole list in one render holds the
// main thread for as long as that list takes to build. The Enchiridion's 284-card catalog held
// it for about a second: the menu's rain (a rAF canvas draw) and its waterfalls (`steps()` on
// `background-position`, a main-thread property) stood still for the whole of it, and so did
// every control. Scheduling cannot fix that — a transition can yield BETWEEN commits but never
// inside one (ADR-0562) — and neither can `content-visibility`, which skips layout and paint for
// off-screen items but not the work of creating them.
//
// The list does not have to be shorter. It has to arrive in pieces, with a paint between them:
// the screen appears at once with its first screenful, the rest fills in over the next few
// frames, and nothing is ever blocked. The total work is unchanged.

export interface ProgressiveMountPacing {
  /** Rendered in the first commit — enough to fill the visible area, not more. */
  first?: number;
  /** Added per frame after that. */
  step?: number;
}

/**
 * `resetKey` starts the fill again when the list becomes a DIFFERENT list of the same length —
 * a filter change that happens to match the same number of cards would otherwise leave the
 * counter at "all mounted" and put the whole new list up in one commit again.
 */
export function useProgressiveMount(
  total: number,
  resetKey: string,
  { first = 16, step = 16 }: ProgressiveMountPacing = {},
): number {
  const [mounted, setMounted] = useState(() => Math.min(first, total));

  useEffect(() => {
    setMounted(Math.min(first, total));
  }, [resetKey, total, first]);

  useEffect(() => {
    if (mounted >= total) return undefined;
    // One batch per frame, so the browser gets to paint (and the scene gets to animate)
    // between every one of them.
    const frame = window.requestAnimationFrame(() => {
      setMounted((current) => Math.min(total, current + step));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mounted, total, step]);

  return Math.min(mounted, total);
}
