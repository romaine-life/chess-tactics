// Warm the browser image cache for art that mounts late.
//
// Portraits (and their backdrops) only render once a unit is focused, so the
// browser doesn't fetch them until the first click — producing a visible "art
// becomes ready" hitch. Kicking off the fetch + decode ahead of time makes the
// first portrait paint instant. Decoding is best-effort; a missing asset must
// never throw or block.

import { loadDecodedImage } from '../render/imageResources';

export function preloadImages(urls: Iterable<string>): void {
  for (const url of urls) {
    if (!url) continue;
    // Join the runtime's shared decoded-image record so the late-mounting
    // consumer does not start a second Image lifecycle for the same asset.
    void loadDecodedImage(url).catch(() => {});
  }
}
