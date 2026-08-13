/**
 * Which narrow-width placement the shared Controls rail uses.
 *
 * `legacy` is today's behaviour: the rail keeps its desktop shape and simply stacks into the
 * page, which is what leaves it painting over an open workspace on a phone.
 *
 * `sheet` is the proposed placement — a persistent bottom strip (turn, forces, destinations)
 * with the active tab panel peeking above it, collapsing to just the strip when a workspace
 * takes the screen. It is opt-in while it is being judged, so nothing changes for anyone until
 * the placement is chosen; `/mobile-lab` flips between the two on the same route.
 *
 * The flag is read here, on the ONE primitive that owns rail placement, rather than by each
 * host. Placement is the primitive's invariant (see ShellControlsPanel) — the Battle, the
 * Level Editor and its chrome consumers all inherit whichever answer wins, instead of each
 * growing its own narrow-width behaviour later.
 */
export type ControlsMobileLayout = 'legacy' | 'sheet';

export function controlsMobileLayout(
  search: string = typeof window === 'undefined' ? '' : window.location.search,
): ControlsMobileLayout {
  return new URLSearchParams(search).get('hudMobile') === 'sheet' ? 'sheet' : 'legacy';
}
