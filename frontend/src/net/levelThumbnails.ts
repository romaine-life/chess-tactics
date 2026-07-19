const immutableThumbnailUrls = new Map<string, string>();

export function installLevelThumbnailUrls(input: unknown): void {
  if (!input || typeof input !== 'object') return;
  for (const [levelId, url] of Object.entries(input as Record<string, unknown>)) {
    if (typeof url !== 'string' || !/^\/api\/media\/[0-9a-f]{64}$/.test(url)) continue;
    immutableThumbnailUrls.set(levelId, url);
  }
}

export function levelThumbnailUrl(levelId: string): string | null {
  return immutableThumbnailUrls.get(levelId) ?? null;
}

