export class ImageResourceError extends Error {
  readonly src: string;

  constructor(src: string) {
    super(`Image failed to load or decode: ${src}`);
    this.name = 'ImageResourceError';
    this.src = src;
  }
}

const decodedImages = new Map<string, Promise<HTMLImageElement>>();

/** One browser image/decode lifecycle shared by every runtime canvas consumer. */
export function loadDecodedImage(src: string): Promise<HTMLImageElement> {
  const cached = decodedImages.get(src);
  if (cached) return cached;

  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      const decode = image.decode?.();
      if (!decode) {
        resolve(image);
        return;
      }
      decode.then(() => resolve(image), () => reject(new ImageResourceError(src)));
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

