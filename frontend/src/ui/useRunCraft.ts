// Apply a craft request carried on the Run address: set the account's active Run to the state
// the link names, then land on a clean /run.
//
// The link is the whole point (ADR-0346). Finding a bug on a crafted Run and being unable to get
// back to it is the failure this exists to prevent, so a craft link is re-runnable by design:
// opening it again re-crafts and drops you back at the same state. It is the restart button.
//
// The crafting itself happens on the server, through the admin-gated endpoint that composes the
// state out of the game's real transitions. That is what lets the link work in a built app: the
// gate is "you are an administrator", not "this is a development build", so nobody else's Run can
// be rewritten by an address.

import { useEffect, useState } from 'react';
import { hasRunCraftRequest, searchWithoutCraftParams } from '../run/craft';
import { craftActiveRun } from '../net/activeRun';
import { useActiveRun } from '../run/store';
import { navigateApp } from './navigation';

export interface RunCraftStatus {
  crafting: boolean;
  error: string | null;
}

const IDLE: RunCraftStatus = { crafting: false, error: null };

/** Resolves to the refusal message, or null once the crafted Run has been adopted. Never rejects:
 * the outcome is the screen's copy, not an unhandled failure. */
async function applyCraft(routePath: string, routeSearch: string): Promise<string | null> {
  try {
    // Adopt the account/browser arbitration first so the crafted Run replaces the same document
    // the screen would otherwise have shown.
    await useActiveRun.getState().hydrate();
    const crafted = await craftActiveRun(routeSearch);
    if (!crafted.run) return 'The Run was crafted, but the server did not return it.';
    useActiveRun.getState().adoptCraftedRun(crafted.run, crafted.revision);
    navigateApp(`${routePath}${searchWithoutCraftParams(routeSearch)}`, { replace: true, scroll: false });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** One craft per visit to a craft address, shared by every mount of it. The scene director
 * remounts the Run screen as the crafted Run arrives, so the work — and its outcome — has to
 * outlive a single mount: an effect that owned its own attempt would leave a remounted screen
 * crafting forever. Cleared once the address is craft-free again, so coming back to the link
 * crafts again rather than replaying the first answer. */
let pending: { address: string; task: Promise<string | null> } | null = null;

export function useRunCraft(routePath: string, routeSearch: string): RunCraftStatus {
  const requested = hasRunCraftRequest(routeSearch);
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
