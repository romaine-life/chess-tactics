export class ImageResourceError extends Error {
  readonly src: string;

  constructor(src: string) {
    super(`Image failed to load or decode: ${src}`);
    this.name = 'ImageResourceError';
    this.src = src;
  }
}

const decodedImages = new Map<string, Promise<HTMLImageElement>>();

/**
 * How long a loaded image may spend pre-decoding before it is handed over anyway.
 *
 * Generous on purpose: a decode that is actually running finishes in single-digit milliseconds
 * here, so this only ever fires for one that is not running at all. Firing early is harmless —
 * see the note at the call site — so there is no reason to tune it finely.
 */
const DECODE_BUDGET_MS = 4_000;

/**
 * Wait for a LOADED image to finish pre-decoding, but never longer than the budget.
 *
 * The one place that bound is expressed, because both readiness gates in this app depend on it:
 * this module's decoded-image cache, and the scene/atomic surface boundary's
 * `waitForRenderedImage`. Both block something the player is waiting for — React's first render
 * and a scene becoming visible — and `decode()` is allowed to stay pending indefinitely on a
 * document the browser is not painting. Unbounded, either one strands the app with no error and
 * nothing in any log, because nothing ever rejects: the shell paints and the scene never arrives,
 * or React never mounts at all and index.html's static "Loading..." stays on screen.
 *
 * Resolving on timeout is safe. The caller only reaches here once `load` has fired, which is the
 * browser saying the bytes arrived and are a decodable image; skipping the pre-decode costs a
 * little work on the first frame that draws it. A decode that genuinely REJECTS still rejects, so
 * broken artwork keeps surfacing as an error rather than being waved through.
 */
export function decodeWithinBudget(image: HTMLImageElement): Promise<void> {
  const decode = image.decode?.();
  if (!decode) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    // Bare `setTimeout`, not `window.setTimeout`: this module is exercised under a plain Node
    // test environment with no `window`, where reaching for one throws inside the executor and
    // turns every decode into a load failure.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (act: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      act();
    };
    timer = setTimeout(() => finish(resolve), DECODE_BUDGET_MS);
    decode.then(() => finish(resolve), (error: unknown) => finish(() => reject(error)));
  });
}

/** One browser image/decode lifecycle shared by every runtime canvas consumer. */
export function loadDecodedImage(src: string): Promise<HTMLImageElement> {
  const cached = decodedImages.get(src);
  if (cached) return cached;

  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    // main.tsx blocks `reactRoot.render()` on composeInstalledChromeCss, which awaits one of these
    // per chrome surface (ADR-0369), so an unbounded decode here means React never mounts at all.
    // Reproduced with all six chrome fill images pending at once while the server served every one
    // of them 200 with a correct Content-Length.
    image.onload = () => {
      decodeWithinBudget(image).then(
        () => resolve(image),
        () => reject(new ImageResourceError(src)),
      );
    };
    image.onerror = () => reject(new ImageResourceError(src));
    image.src = src;
  }).catch((error) => {
    // A transient failure must be retryable; successful decoded records remain reusable.
    decodedImages.delete(src);
    throw error;
  });

  decodedImages.set(src, pending);
  return pending;
}

export async function loadDecodedImageMap(sources: readonly string[]): Promise<Map<string, HTMLImageElement>> {
  const unique = [...new Set(sources)];
  return new Map(await Promise.all(unique.map(async (src) => [src, await loadDecodedImage(src)] as const)));
}

