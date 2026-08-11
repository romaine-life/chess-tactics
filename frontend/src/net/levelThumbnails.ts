// The canonical list derivative each level is currently served from.
//
// A URL is content-addressed, so an installed one stays correct for exactly as long as the level's
// content does. The map therefore has to be REPLACED, not merely filled, whenever a write changes
// canonical content: a Save or a publish answers with the address it just baked, and the mounted
// rows have to notice. Reads used to be a plain module lookup, which meant nothing re-read the map
// after hydration — a page that saved a level went on rendering the pre-save picture until reload.

const immutableThumbnailUrls = new Map<string, string>();
const listeners = new Set<() => void>();

function isCanonicalThumbnailUrl(url: string): boolean {
  return (
    /^\/api\/media\/[0-9a-f]{64}$/.test(url)
    || /^\/api\/campaign-workspace\/level-thumbnails\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}\/[0-9a-f]{64}\.png$/.test(url)
  );
}

/** Notify mounted thumbnails once per install, and only when an address actually moved. */
function announce(changed: boolean): void {
  if (!changed) return;
  for (const listener of [...listeners]) listener();
}

export function installLevelThumbnailUrls(input: unknown): void {
  if (!input || typeof input !== 'object') return;
  let changed = false;
  for (const [levelId, url] of Object.entries(input as Record<string, unknown>)) {
    if (typeof url !== 'string' || !isCanonicalThumbnailUrl(url)) continue;
    if (immutableThumbnailUrls.get(levelId) === url) continue;
    immutableThumbnailUrls.set(levelId, url);
    changed = true;
  }
  announce(changed);
}

/**
 * Install the derivative a single write just produced. A write that could not prepare one answers
 * with null; the previously installed address is then retired rather than left to render content
 * the level no longer has.
 */
export function installLevelThumbnailUrl(levelId: string, url: unknown): void {
  if (!levelId) return;
  if (typeof url !== 'string' || !isCanonicalThumbnailUrl(url)) {
    announce(immutableThumbnailUrls.delete(levelId));
    return;
  }
  if (immutableThumbnailUrls.get(levelId) === url) return;
  immutableThumbnailUrls.set(levelId, url);
  announce(true);
}

export function levelThumbnailUrl(levelId: string): string | null {
  return immutableThumbnailUrls.get(levelId) ?? null;
}

export function subscribeLevelThumbnailUrls(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
