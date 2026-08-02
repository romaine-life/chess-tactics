// Apply a ?craft= request on the Run screen: build the named Run state, adopt it as the active
// Run, then drop the craft parameters from the address so the screen keeps only its own.
//
// Development only. A crafted Run is a debugging instrument — an owner or an agent hands over a
// link to the exact Shop, deployment, Battle or victory a change needs to be looked at — and the
// built app must never let an address rewrite a Run that was actually played.

import { useEffect, useState } from 'react';
import { useCampaigns } from '../campaign/store';
import { ensureCampaignsHydrated } from '../campaign/hydrate';
import { useWars } from '../war/store';
import {
  craftRunDocument,
  hasRunCraftRequest,
  parseRunCraftSpec,
  searchWithoutCraftParams,
  selectCraftWar,
} from '../run/craft';
import { useActiveRun } from '../run/store';
import { navigateApp } from './navigation';

export interface RunCraftStatus {
  crafting: boolean;
  error: string | null;
}

const IDLE: RunCraftStatus = { crafting: false, error: null };

export function runCraftAvailable(): boolean {
  return import.meta.env.DEV;
}

/** Resolves to the refusal message, or null once the crafted Run has been adopted. Never rejects:
 * the outcome is the screen's copy, not an unhandled failure. */
async function applyCraft(routePath: string, routeSearch: string): Promise<string | null> {
  try {
    const spec = parseRunCraftSpec(routeSearch);
    if (!spec) return null;
    // Wars and Levels are the real ones the account loads; a crafted Run plays authored content.
    await ensureCampaignsHydrated();
    // Adopt the account/browser arbitration first so replacing the Run writes over the same
    // document the screen would otherwise have shown.
    await useActiveRun.getState().hydrate();
    const war = selectCraftWar(spec, useWars.getState().wars, useCampaigns.getState().levels);
    useActiveRun.getState().replace(craftRunDocument(spec, war));
    navigateApp(`${routePath}${searchWithoutCraftParams(routeSearch)}`, { replace: true, scroll: false });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** One craft per address, shared by every mount of it. The scene director remounts the Run screen
 * as the crafted Run arrives, so the work — and its outcome — has to outlive a single mount: an
 * effect that owned its own attempt would leave a remounted screen crafting forever. */
let pending: { address: string; task: Promise<string | null> } | null = null;

export function useRunCraft(routePath: string, routeSearch: string): RunCraftStatus {
  const requested = runCraftAvailable() && hasRunCraftRequest(routeSearch);
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
