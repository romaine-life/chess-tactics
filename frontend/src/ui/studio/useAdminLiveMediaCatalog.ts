import { useCallback, useEffect, useState } from 'react';
import { fetchAdminLiveMediaCatalog, type AdminLiveMediaCatalog } from '../../net/liveMediaAdmin';

/**
 * ONE admin live-media catalog for the whole Studio.
 *
 * Every review category needs the same catalog, and the Studio builds all of its categories'
 * state on mount — `main` and `controls` are elements, so their hooks run whether or not their
 * category is the open one. Each category fetching its own copy therefore meant one request per
 * category on every Studio open, of a payload measured in megabytes, of which at most one was
 * ever looked at. Eight categories, eight identical fetches.
 *
 * So the request is shared: the first caller starts it, everyone mounted while it is in flight
 * waits on that same promise, and later callers get the cached answer. `refresh()` — what an
 * install calls once it has changed the catalog — drops the cache and re-fetches once for
 * everybody, so a category that installed and its neighbours cannot disagree about what is
 * installed.
 *
 * Cached for the session rather than for a duration: the only thing that changes this catalog
 * from under a Studio session is an install made in that same session, and that path already
 * calls `refresh()`.
 */
interface CatalogSnapshot {
  catalog: AdminLiveMediaCatalog | null;
  error: string;
}

let snapshot: CatalogSnapshot = { catalog: null, error: '' };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: CatalogSnapshot): void {
  snapshot = next;
  for (const listener of [...listeners]) listener();
}

/**
 * The store, exported so the coalescing can be tested without a renderer — the hook below is a
 * thin subscription over these and has no behaviour of its own worth a DOM.
 */
export function loadAdminLiveMediaCatalog(): Promise<void> {
  if (inflight) return inflight;
  // Already answered — including with a failure. A read that failed is an answer every category
  // shows the same way, and retrying per mount would turn one dead backend into eight requests.
  // `refreshAdminLiveMediaCatalog()` is the retry, and an install calls it anyway.
  if (snapshot.catalog || snapshot.error) return Promise.resolve();
  inflight = fetchAdminLiveMediaCatalog()
    .then((catalog) => { publish({ catalog, error: '' }); })
    .catch((reason) => {
      publish({ catalog: null, error: reason instanceof Error ? reason.message : String(reason) });
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export function adminLiveMediaCatalogSnapshot(): CatalogSnapshot {
  return snapshot;
}

export function subscribeAdminLiveMediaCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Drop the shared catalog and re-read it. Called after an install changes what is accepted. */
export function refreshAdminLiveMediaCatalog(): Promise<void> {
  publish({ catalog: null, error: '' });
  inflight = null;
  return loadAdminLiveMediaCatalog();
}

/** Only for tests, which must not inherit another test's catalog. */
export function resetAdminLiveMediaCatalog(): void {
  snapshot = { catalog: null, error: '' };
  inflight = null;
  listeners.clear();
}

export interface AdminLiveMediaCatalogState {
  catalog: AdminLiveMediaCatalog | null;
  error: string;
  refresh: () => void;
}

export function useAdminLiveMediaCatalog(): AdminLiveMediaCatalogState {
  const [current, setCurrent] = useState(adminLiveMediaCatalogSnapshot);
  useEffect(() => {
    const listener = (): void => setCurrent(adminLiveMediaCatalogSnapshot());
    const unsubscribe = subscribeAdminLiveMediaCatalog(listener);
    listener();
    void loadAdminLiveMediaCatalog();
    return unsubscribe;
  }, []);
  const refresh = useCallback(() => { void refreshAdminLiveMediaCatalog(); }, []);
  return { catalog: current.catalog, error: current.error, refresh };
}
