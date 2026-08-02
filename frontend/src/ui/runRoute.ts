// The addresses the Run screen answers to. One predicate, because "is this the Run screen?" is
// asked by scene resolution, route prefetch, the title bar and the hydration effect alike — and a
// new Run address that only some of them recognise is a scene that renders under the wrong shell.

import { isRunCraftLinkPath } from '../run/craft';
import { normalizeRoutePath } from './navigation';

export const RUN_ROOT = '/run';
export const RUN_STRATEGIKON_PREFIX = '/run/strategikon/';

/** Every address that presents the Run screen: the Run itself, its Strategikon workspace, and a
 * craft link, which crafts and then lands on the Run (ADR-0346). */
export function isRunRoutePath(pathname: string): boolean {
  const path = normalizeRoutePath(pathname);
  return path === RUN_ROOT || path.startsWith(RUN_STRATEGIKON_PREFIX) || isRunCraftLinkPath(path);
}

export function isRunStrategikonPath(pathname: string): boolean {
  return normalizeRoutePath(pathname).startsWith(RUN_STRATEGIKON_PREFIX);
}
