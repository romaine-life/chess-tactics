// Apply a craft link: set the account's active Run to the state the id stands for, and stay at
// the link while the Run screen presents it.
//
// The link is the whole point (ADR-0354). Finding a bug on a crafted Run and being unable to get
// back to it is the failure this exists to prevent, so `/run/craft/<id>` is re-runnable by
// design: opening it again re-crafts and drops you back at the same state. It is the restart
// button — which is why the address stays in the bar rather than being spent on arrival
// (ADR-0531). Reloading the page a bug was found on is pressing the button again; the Run it
// overwrites is disposable test state.
//
// The id is all the address carries. The spec lives on the server, which composes the state out
// of the game's real transitions — so the address never grows a grammar to outgrow, and the
// crafting works in a built app because the gate is "you are an administrator" rather than "this
// is a development build". Nobody else's Run can be rewritten by an address.
//
// A hand-typed `?craft=` address is not a second mechanism: it is minted into its permanent id
// and the browser is sent there, so the readable grammar stays a way to WRITE a spec while the
// id remains the only thing a crafted state is ever handed over as.

import { useEffect, useState } from 'react';
import { hasRunCraftRequest, isRunCraftLinkPath, runCraftLinkId, searchWithoutCraftParams } from '../run/craft';
import { craftActiveRunFromLink, mintRunCraftLink } from '../net/activeRun';
import { useActiveRun } from '../run/store';
import { navigateApp } from './navigation';
import { registerCraftedBattleResult } from './craftedRunLanding';

export interface RunCraftStatus {
  crafting: boolean;
  error: string | null;
}

const IDLE: RunCraftStatus = { crafting: false, error: null };

/** What an address asks the Run screen to do before it shows a Run. */
function craftRequest(routePath: string, routeSearch: string): 'link' | 'mint' | null {
  if (isRunCraftLinkPath(routePath)) return 'link';
  return hasRunCraftRequest(routeSearch) ? 'mint' : null;
}

/** Resolves to the refusal message, or null once the crafted Run has been adopted. Never rejects:
 * the outcome is the screen's copy, not an unhandled failure. */
async function applyCraft(routePath: string, routeSearch: string): Promise<string | null> {
  try {
    if (craftRequest(routePath, routeSearch) === 'mint') {
      // Mint first, then let the id address do the crafting, so a typed one-off leaves a
      // permanent link behind instead of a spec spelled out in the address bar.
      const link = await mintRunCraftLink(routeSearch);
      navigateApp(`${link}${searchWithoutCraftParams(routeSearch)}`, { replace: true, scroll: false });
      return null;
    }
    const id = runCraftLinkId(routePath);
    if (!id) return 'This is not a craft link. Check the whole link was copied.';
    // Adopt the account/browser arbitration first so the crafted Run replaces the same document
    // the screen would otherwise have shown.
    await useActiveRun.getState().hydrate();
    const crafted = await craftActiveRunFromLink(id);
    if (!crafted.run) return 'The Run was crafted, but the server did not return it.';
    registerCraftedBattleResult(crafted.run, crafted.battleResult);
    useActiveRun.getState().adoptCraftedRun(crafted.run, crafted.revision);
    // No landing navigation: the address IS the link, and the Run screen presents the address it
    // names through `presentedRunAddress`. Rewriting it here would spend the restart button on
    // the first press.
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** One craft per visit to a craft address, shared by every mount of it. The scene director
 * remounts the Run screen as the crafted Run arrives, so the work — and its outcome — has to
 * outlive a single mount: an effect that owned its own attempt would leave a remounted screen
 * crafting forever. Cleared once the address is a plain Run again — navigating out of the link
 * inside the Run — so coming back to it crafts again rather than replaying the first answer.
 * Staying on the link does NOT re-craft: only opening it does, and a reload is a fresh page. */
let pending: { address: string; task: Promise<string | null> } | null = null;

export function useRunCraft(routePath: string, routeSearch: string): RunCraftStatus {
  const requested = craftRequest(routePath, routeSearch) !== null;
  const [status, setStatus] = useState<RunCraftStatus>(() => (requested ? { crafting: true, error: null } : IDLE));

  useEffect(() => {
    if (!requested) {
      pending = null;
      setStatus((current) => (current === IDLE ? current : IDLE));
      return;
    }
    const address = `${routePath}${routeSearch}`;
    if (pending?.address !== address) pending = { address, task: applyCraft(routePath, routeSearch) };
    const task = pending.task;
    let cancelled = false;
    setStatus({ crafting: true, error: null });
    void task.then((error) => {
      if (cancelled) return;
      setStatus(error ? { crafting: false, error } : IDLE);
    });
    return () => { cancelled = true; };
  }, [requested, routePath, routeSearch]);

  return status;
}
