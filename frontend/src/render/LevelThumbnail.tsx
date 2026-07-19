import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { Level } from '../core/level';
import { levelToEditorBoard } from '../core/levelBoard';
import { bakeBoardThumbnail, boardContentHash, boardBounds } from './bakeBoardThumbnail';
import { loadingError, loadingMark, loadingMeasure } from '../diagnostics/loadingTimeline';
import { levelThumbnailUrl } from '../net/levelThumbnails';

// Player lists consume one compact immutable derivative produced by the backend. The board
// conversion/bake path below is reserved for explicitly named unsaved authoring previews.

// Module-level cache: contentHash -> the baked object URL (+ a refcount so a URL is only revoked
// once every mounted thumbnail using it has released it). Survives remounts within the session.
interface CacheEntry {
  url: string;
  refs: number;
}
const urlCache = new Map<string, CacheEntry>();
// In-flight bakes, so two rows with the same board don't bake twice in parallel.
const inflight = new Map<string, Promise<string>>();

// The bake key folds in the device pixel ratio bucket: a 1× and a 2× screen want different
// raster scales, but both should still dedupe per (board, scale).
function cacheKey(contentHash: string, scale: number): string {
  return `${contentHash}@${scale}x`;
}

async function getThumbnailUrl(board: ReturnType<typeof levelToEditorBoard>, contentHash: string, scale: number): Promise<string> {
  const key = cacheKey(contentHash, scale);
  const existing = urlCache.get(key);
  if (existing) {
    existing.refs += 1;
    return existing.url;
  }
  const pending = inflight.get(key);
  if (pending) {
    const url = await pending;
    const entry = urlCache.get(key);
    if (entry) entry.refs += 1;
    return url;
  }
  const promise = (async () => {
    const blob = await bakeBoardThumbnail(board, { scale });
    const url = URL.createObjectURL(blob);
    urlCache.set(key, { url, refs: 1 });
    inflight.delete(key);
    return url;
  })();
  inflight.set(key, promise);
  return promise;
}

function releaseThumbnailUrl(contentHash: string, scale: number): void {
  const key = cacheKey(contentHash, scale);
  const entry = urlCache.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    URL.revokeObjectURL(entry.url);
    urlCache.delete(key);
  }
}

// Integer raster scale for the screen's pixel density (1 on standard displays, 2 on HiDPI),
// capped at 2 — the 2× variant is the spec's HiDPI bake and more would only waste memory.
function rasterScale(): number {
  if (typeof window === 'undefined') return 1;
  return Math.min(2, Math.max(1, Math.round(window.devicePixelRatio || 1)));
}

export function LevelThumbnail({
  level,
  width,
  height,
  className,
  alt,
  onReady,
  onError,
  authoringPreview = false,
}: {
  level: Level;
  width: number;
  height: number;
  className?: string;
  alt?: string;
  onReady?: (levelId: string) => void;
  onError?: (levelId: string, error: Error) => void;
  /** Studio/editor-only: render unsaved local board pixels instead of a canonical derivative. */
  authoringPreview?: boolean;
}): ReactElement {
  const board = useMemo(() => authoringPreview ? levelToEditorBoard(level) : null, [authoringPreview, level]);
  const contentHash = useMemo(() => board ? boardContentHash(board) : `canonical:${level.id}`, [board, level.id]);
  // Runtime derivatives have one fixed 3:2 delivery box. Authoring previews retain the
  // unsaved board's native aspect ratio.
  const aspect = useMemo(() => {
    if (!board) return 1.5;
    const bounds = boardBounds(board);
    return bounds.width > 0 && bounds.height > 0 ? bounds.width / bounds.height : 1;
  }, [board]);

  const canonicalLevel = /^(?:off-[a-z]+(?:-[a-z]+)*|l\d+)$/.test(level.id);
  const canonicalDerivative = !authoringPreview && canonicalLevel
    ? levelThumbnailUrl(level.id) ?? `/assets/level-list-thumb/${encodeURIComponent(level.id)}.png`
    : null;
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Canonical derivatives are already compact delivery rasters: request them with the
  // list data so a complete list can reveal together. Authoring-only client bakes stay
  // proximity-gated because they are substantially more expensive.
  const [near, setNear] = useState(canonicalDerivative !== null);
  const [url, setUrl] = useState<string | null>(null);
  const [painted, setPainted] = useState(false);

  // Lazy gate: only flip `near` true once the row is at/near the viewport. Once seen, stay seen
  // (no need to un-bake when it scrolls away — the object URL is cheap and shared).
  useEffect(() => {
    if (near) return undefined;
    const node = containerRef.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true); // no observer (older env / tests): bake eagerly rather than never.
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      // 200px margin: start baking just before the row enters view so it's ready on arrival.
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);

  // Bake (lazily) once near AND release the prior URL on change/unmount. The scale is fixed per
  // mount; re-keying on contentHash re-bakes when the board changes.
  useEffect(() => {
    if (!near) return undefined;
    setPainted(false);
    if (canonicalDerivative) {
      setUrl(canonicalDerivative);
      return () => setUrl(null);
    }
    if (!authoringPreview) {
      const error = new Error(`Canonical thumbnail derivative is unavailable for level ${level.id}`);
      loadingError('thumbnail', 'canonical-derivative-missing', error);
      onError?.(level.id, error);
      return undefined;
    }
    let cancelled = false;
    const startedAt = performance.now();
    loadingMark('thumbnail', 'client-bake-start', { levelId: level.id, contentHash, scale: rasterScale() });
    // Exactly one acquire per effect run earns exactly one release. The acquire resolves
    // asynchronously, so release is owned by the acquire's settle handler — that's the only point
    // where the cache entry is guaranteed to exist (cleanup can run BEFORE the bake resolves, when
    // the entry isn't in urlCache yet). Cleanup just flips `cancelled`; the settle handler then
    // releases the ref it took. This releases once and only once, so a shared cache entry's
    // refcount is never double-decremented (which would revoke a URL another row still displays)
    // and never leaked.
    const scale = rasterScale();
    let acquired = false;
    if (!board) return undefined;
    getThumbnailUrl(board, contentHash, scale)
      .then((nextUrl) => {
        acquired = true;
        if (cancelled) {
          releaseThumbnailUrl(contentHash, scale); // unmounted/changed before we could show it
          return;
        }
        setUrl(nextUrl);
        loadingMeasure('thumbnail', 'client-bake-url-ready', startedAt, { levelId: level.id, contentHash });
      })
      .catch((error) => {
        loadingError('thumbnail', 'client-bake-failed', error);
        /* a failed bake never acquired a ref; leave the placeholder in place. */
      });
    return () => {
      cancelled = true;
      if (acquired) {
        // Bake already resolved and took a ref for this run: release it now.
        releaseThumbnailUrl(contentHash, scale);
      }
      // Else the settle handler will see `cancelled` and release the ref once it resolves.
      setUrl(null);
    };
  }, [near, authoringPreview, board, canonicalDerivative, contentHash, level.id, onError]);

  // Integer display dimensions; the box keeps the row's footprint stable whether or not the bake
  // has resolved. The image is letterboxed to the board's native aspect via object-fit:contain.
  const boxStyle = { width: `${Math.round(width)}px`, height: `${Math.round(height)}px` } as const;

  return (
    <div
      ref={containerRef}
      className={`level-thumbnail ${painted ? 'is-ready' : 'is-pending'} ${className ?? ''}`.trim()}
      style={boxStyle}
      data-aspect={aspect.toFixed(3)}
      aria-hidden={painted ? undefined : true}
    >
      {url ? (
        <img
          src={url}
          width={Math.round(width)}
          height={Math.round(height)}
          loading="eager"
          decoding="async"
          alt={alt ?? `${level.name} board`}
          style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated', display: 'block', opacity: painted ? 1 : 0 }}
          draggable={false}
          onLoad={() => {
            requestAnimationFrame(() => {
              setPainted(true);
              onReady?.(level.id);
              loadingMark('thumbnail', 'first-painted-frame', { levelId: level.id, contentHash, derivative: Boolean(canonicalDerivative) });
            });
          }}
          onError={(event) => {
            setPainted(false);
            const error = new Error(`Thumbnail failed: ${event.currentTarget.src}`);
            loadingError('thumbnail', 'derivative-load-failed', error);
            onError?.(level.id, error);
          }}
        />
      ) : null}
      {!painted ? (
        // Neutral, fixed-size placeholder: holds the layout (so lazy-loading + the observer work)
        // until the bake resolves. No spinner — a calm box reads better in a long list.
        <span className="level-thumbnail-placeholder" aria-hidden="true" style={{ display: 'block', width: '100%', height: '100%' }} />
      ) : null}
    </div>
  );
}
