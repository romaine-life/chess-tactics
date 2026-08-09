// The addresses the Run screen answers to. One predicate, because "is this the Run screen?" is
// asked by scene resolution, route prefetch, the title bar and the hydration effect alike — and a
// new Run address that only some of them recognise is a scene that renders under the wrong shell.

import { isRunCraftLinkPath } from '../run/craft';
import { normalizeRoutePath } from './navigation';

export const RUN_ROOT = '/run';
export const RUN_STRATEGIKON_ROOT = '/run/strategikon';
export const RUN_STRATEGIKON_PREFIX = '/run/strategikon/';

/** Every address that presents the Run screen: the Run itself, its Strategikon workspace, and a
 * craft link, which crafts and then lands on the Run (ADR-0354). */
export function isRunRoutePath(pathname: string): boolean {
  const path = normalizeRoutePath(pathname);
  return path === RUN_ROOT
    || path === RUN_STRATEGIKON_ROOT
    || path.startsWith(RUN_STRATEGIKON_PREFIX)
    || isRunCraftLinkPath(path);
}

export function isRunStrategikonPath(pathname: string): boolean {
  const path = normalizeRoutePath(pathname);
  return path === RUN_STRATEGIKON_ROOT || path.startsWith(RUN_STRATEGIKON_PREFIX);
}

/** A Run address, split into the parts the screen and the scene graph read separately. */
export interface RunAddress {
  readonly path: string;
  readonly search: string;
}

/**
 * The Run address an address PRESENTS.
 *
 * A craft link keeps its own address in the bar and presents the Run address it names
 * (ADR-0531). The link is the restart button for a state, so it has to survive being pressed:
 * reloading the page a bug was found on re-crafts and lands on it again, which an address that
 * had rewritten itself to `/run` could not do.
 *
 * `to=` names a deeper Run address, so a crafted state can be handed over with the workspace it
 * is about already open — the Strategikon's Chartulary, say — instead of one click short of it.
 * Only an address inside the Run is honoured, and never another craft link: the link's job is to
 * present the Run it just crafted, and anything else would make it mean something other than
 * what it says.
 *
 * Everything that reads the Run's path, or builds an href from it, reads this rather than the
 * browser address — so a craft link never leaks into a link the screen writes, and nothing
 * downstream has to know craft links exist.
 */
export function presentedRunAddress(pathname: string, search: string): RunAddress {
  const path = normalizeRoutePath(pathname);
  if (!isRunCraftLinkPath(path)) return { path, search };
  const params = new URLSearchParams(search);
  const to = params.get('to');
  params.delete('to');
  const inRun = to !== null && /^\/run(?:[/?#]|$)/.test(to) && !isRunCraftLinkPath(to);
  const presented = new URL(inRun ? (to as string) : RUN_ROOT, 'http://localhost');
  for (const [name, value] of params) presented.searchParams.append(name, value);
  return { path: normalizeRoutePath(presented.pathname), search: presented.search };
}
