const immutableThumbnailUrls = new Map<string, string>();

function isCanonicalThumbnailUrl(url: string): boolean {
  return (
    /^\/api\/media\/[0-9a-f]{64}$/.test(url)
    || /^\/api\/campaign-workspace\/level-thumbnails\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}\/[0-9a-f]{64}\.png$/.test(url)
  );
}

export function installLevelThumbnailUrls(input: unknown): void {
  if (!input || typeof input !== 'object') return;
  for (const [levelId, url] of Object.entries(input as Record<string, unknown>)) {
    if (typeof url !== 'string' || !isCanonicalThumbnailUrl(url)) continue;
    immutableThumbnailUrls.set(levelId, url);
  }
}

export function levelThumbnailUrl(levelId: string): string | null {
  return immutableThumbnailUrls.get(levelId) ?? null;
}

