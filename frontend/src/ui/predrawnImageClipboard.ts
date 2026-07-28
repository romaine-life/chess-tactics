const PNG_MEDIA_TYPE = 'image/png';
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

export type PredrawnImageClipboardErrorCode =
  | 'unsupported'
  | 'permission-denied'
  | 'no-png'
  | 'load-failed'
  | 'clipboard-failed';

export class PredrawnImageClipboardError extends Error {
  readonly code: PredrawnImageClipboardErrorCode;

  constructor(
    code: PredrawnImageClipboardErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'PredrawnImageClipboardError';
    this.code = code;
  }
}

export interface PredrawnClipboardReadItem {
  readonly types: readonly string[];
  getType(type: string): Promise<Blob>;
}

export interface PredrawnClipboardWriteItem {
  readonly types?: readonly string[];
}

export interface PredrawnImageClipboard {
  read?: () => Promise<readonly PredrawnClipboardReadItem[]>;
  write?: (items: readonly PredrawnClipboardWriteItem[]) => Promise<void>;
}

export type PredrawnClipboardItemConstructor = new (
  items: Record<string, Blob | Promise<Blob>>,
) => PredrawnClipboardWriteItem;

export type PredrawnImageClipboardFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface PredrawnImageClipboardDependencies {
  clipboard?: PredrawnImageClipboard | null;
  ClipboardItem?: PredrawnClipboardItemConstructor | null;
  fetch?: PredrawnImageClipboardFetch | null;
}

export interface PredrawnClipboardDataTransferItem {
  readonly kind: string;
  readonly type: string;
  getAsFile(): Blob | null;
}

export interface PredrawnClipboardDataTransfer {
  readonly items?: ArrayLike<PredrawnClipboardDataTransferItem>;
  readonly files?: ArrayLike<Blob>;
}

export interface PredrawnClipboardPasteEvent {
  readonly clipboardData: PredrawnClipboardDataTransfer | null;
}

export type PredrawnPngIngressOperation = {
  readonly attemptId: string;
  readonly token: number;
};

export interface PredrawnPngIngressGuard {
  activate(): void;
  selectAttempt(attemptId: string): void;
  begin(attemptId: string): PredrawnPngIngressOperation;
  isCurrent(operation: PredrawnPngIngressOperation): boolean;
  dispose(): void;
}

/**
 * Keeps an asynchronous PNG ingress bound to the slot and mounted workspace that initiated it.
 * Selecting another slot or disposing the workspace invalidates every outstanding operation.
 */
export function createPredrawnPngIngressGuard(
  initialAttemptId = '',
): PredrawnPngIngressGuard {
  let active = true;
  let selectedAttemptId = initialAttemptId;
  let token = 0;

  return {
    activate(): void {
      active = true;
    },
    selectAttempt(attemptId: string): void {
      if (attemptId === selectedAttemptId) return;
      selectedAttemptId = attemptId;
      token += 1;
    },
    begin(attemptId: string): PredrawnPngIngressOperation {
      token += 1;
      return { attemptId, token };
    },
    isCurrent(operation: PredrawnPngIngressOperation): boolean {
      return (
        active
        && operation.attemptId === selectedAttemptId
        && operation.token === token
      );
    },
    dispose(): void {
      active = false;
      token += 1;
    },
  };
}

function defaultClipboard(): PredrawnImageClipboard | null {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return null;
  return navigator.clipboard as unknown as PredrawnImageClipboard;
}

function defaultClipboardItemConstructor(): PredrawnClipboardItemConstructor | null {
  if (typeof ClipboardItem === 'undefined') return null;
  return ClipboardItem as unknown as PredrawnClipboardItemConstructor;
}

function defaultFetch(): PredrawnImageClipboardFetch | null {
  if (typeof fetch !== 'function') return null;
  return fetch.bind(globalThis);
}

function clipboardDependency(
  dependencies: PredrawnImageClipboardDependencies,
): PredrawnImageClipboard | null {
  return dependencies.clipboard === undefined ? defaultClipboard() : dependencies.clipboard;
}

function clipboardItemDependency(
  dependencies: PredrawnImageClipboardDependencies,
): PredrawnClipboardItemConstructor | null {
  return dependencies.ClipboardItem === undefined
    ? defaultClipboardItemConstructor()
    : dependencies.ClipboardItem;
}

function fetchDependency(
  dependencies: PredrawnImageClipboardDependencies,
): PredrawnImageClipboardFetch | null {
  return dependencies.fetch === undefined ? defaultFetch() : dependencies.fetch;
}

function unsupportedError(action: 'copy' | 'paste'): PredrawnImageClipboardError {
  return new PredrawnImageClipboardError(
    'unsupported',
    action === 'copy'
      ? 'Image clipboard copy is unavailable in this browser. Open the editor in Chrome on HTTPS or localhost, or download the PNG instead.'
      : 'Image clipboard paste is unavailable in this browser. Open the editor in Chrome on HTTPS or localhost, or choose the AI-painted PNG file instead.',
  );
}

function noPngError(invalidBytes = false): PredrawnImageClipboardError {
  return new PredrawnImageClipboardError(
    'no-png',
    invalidBytes
      ? 'The clipboard image is labeled as PNG but its bytes are not a PNG. Copy the AI-painted board image itself, then try again.'
      : 'The clipboard does not contain a PNG image. Copy the AI-painted board image itself, then try again.',
  );
}

function invalidGenerationReferencePngError(invalidBytes = false): PredrawnImageClipboardError {
  return new PredrawnImageClipboardError(
    'load-failed',
    invalidBytes
      ? 'The stored generation reference is labeled as PNG but its bytes are invalid. Refresh the artwork list and capture the reference again.'
      : 'The stored generation reference is not a PNG image. Refresh the artwork list and capture the reference again.',
  );
}

function permissionDeniedError(cause: unknown): PredrawnImageClipboardError {
  return new PredrawnImageClipboardError(
    'permission-denied',
    'Clipboard access was denied. Focus this tab, allow clipboard access for this site, and try again.',
    { cause },
  );
}

function isPermissionDenied(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false;
  const name = 'name' in cause ? String(cause.name) : '';
  return name === 'NotAllowedError' || name === 'SecurityError';
}

function clipboardFailure(
  action: 'copy' | 'paste',
  cause: unknown,
): PredrawnImageClipboardError {
  if (cause instanceof PredrawnImageClipboardError) return cause;
  if (isPermissionDenied(cause)) return permissionDeniedError(cause);
  return new PredrawnImageClipboardError(
    'clipboard-failed',
    action === 'copy'
      ? 'The full-resolution image could not be copied. Keep this tab focused and try again, or download the PNG instead.'
      : 'The PNG could not be read from the clipboard. Keep this tab focused and try again, or choose the AI-painted PNG file instead.',
    { cause },
  );
}

function normalizedMediaType(value: string): string {
  return value.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

async function requireExactPng(
  blob: Blob,
  source: 'clipboard' | 'generation-reference' = 'clipboard',
): Promise<Blob> {
  if (normalizedMediaType(blob.type) !== PNG_MEDIA_TYPE) {
    throw source === 'clipboard' ? noPngError() : invalidGenerationReferencePngError();
  }
  const signature = new Uint8Array(await blob.slice(0, PNG_SIGNATURE.length).arrayBuffer());
  if (
    signature.length !== PNG_SIGNATURE.length
    || PNG_SIGNATURE.some((byte, index) => signature[index] !== byte)
  ) {
    throw source === 'clipboard'
      ? noPngError(true)
      : invalidGenerationReferencePngError(true);
  }
  return blob;
}

async function loadExactPng(
  sourceUrl: string,
  fetchPng: PredrawnImageClipboardFetch,
): Promise<Blob> {
  let response: Response;
  try {
    response = await fetchPng(sourceUrl, {
      credentials: 'include',
      cache: 'no-store',
    });
  } catch (cause) {
    throw new PredrawnImageClipboardError(
      'load-failed',
      'The full-resolution generation reference could not be loaded. Check the connection and try again.',
      { cause },
    );
  }
  if (!response.ok) {
    throw new PredrawnImageClipboardError(
      'load-failed',
      `The full-resolution generation reference could not be loaded (${response.status}). Refresh the artwork list and try again.`,
    );
  }
  try {
    return await requireExactPng(await response.blob(), 'generation-reference');
  } catch (cause) {
    if (cause instanceof PredrawnImageClipboardError) throw cause;
    throw new PredrawnImageClipboardError(
      'load-failed',
      'The full-resolution generation reference could not be read as a PNG.',
      { cause },
    );
  }
}

/**
 * Copy the immutable full-resolution PNG itself. ClipboardItem receives the pending authenticated
 * fetch so clipboard.write is invoked during the originating click instead of after user activation
 * has expired. No canvas or image re-encoding is involved.
 */
export async function copyPredrawnPngToClipboard(
  sourceUrl: string,
  dependencies: PredrawnImageClipboardDependencies = {},
): Promise<Blob> {
  const clipboard = clipboardDependency(dependencies);
  const ClipboardItemConstructor = clipboardItemDependency(dependencies);
  const fetchPng = fetchDependency(dependencies);
  if (!clipboard?.write || !ClipboardItemConstructor || !fetchPng) {
    throw unsupportedError('copy');
  }

  const png = loadExactPng(sourceUrl, fetchPng);
  // A permission failure may reject write before the ClipboardItem consumes its promised payload.
  // Keep that later fetch rejection observed without delaying the actionable clipboard error.
  void png.catch(() => {});
  try {
    const item = new ClipboardItemConstructor({ [PNG_MEDIA_TYPE]: png });
    await clipboard.write([item]);
    return await png;
  } catch (cause) {
    throw clipboardFailure('copy', cause);
  }
}

/** Read the exact PNG Blob exposed by the async Clipboard API without raster conversion. */
export async function readPredrawnPngFromClipboard(
  dependencies: Pick<PredrawnImageClipboardDependencies, 'clipboard'> = {},
): Promise<Blob> {
  const clipboard = clipboardDependency(dependencies);
  if (!clipboard?.read) throw unsupportedError('paste');

  let items: readonly PredrawnClipboardReadItem[];
  try {
    items = await clipboard.read();
  } catch (cause) {
    throw clipboardFailure('paste', cause);
  }
  let matchingItem: PredrawnClipboardReadItem | undefined;
  let matchingType: string | undefined;
  for (const candidate of items) {
    matchingType = candidate.types.find((type) => normalizedMediaType(type) === PNG_MEDIA_TYPE);
    if (matchingType) {
      matchingItem = candidate;
      break;
    }
  }
  if (!matchingItem || !matchingType) throw noPngError();

  try {
    return await requireExactPng(await matchingItem.getType(matchingType));
  } catch (cause) {
    throw clipboardFailure('paste', cause);
  }
}

/**
 * Extract a PNG supplied by a native paste event. This path does not request clipboard permission
 * because the browser has already scoped the DataTransfer to the user's Ctrl+V gesture.
 */
export async function predrawnPngFromDataTransfer(
  dataTransfer: PredrawnClipboardDataTransfer | null,
): Promise<Blob> {
  if (!dataTransfer) {
    throw new PredrawnImageClipboardError(
      'unsupported',
      'This browser did not expose pasted image data. Use the Paste AI-painted board button or choose the PNG file instead.',
    );
  }

  const pngItem = Array.from(dataTransfer.items ?? []).find((item) => (
    item.kind === 'file' && normalizedMediaType(item.type) === PNG_MEDIA_TYPE
  ));
  const itemBlob = pngItem?.getAsFile() ?? null;
  if (itemBlob) return requireExactPng(itemBlob);

  const pngFile = Array.from(dataTransfer.files ?? []).find((file) => (
    normalizedMediaType(file.type) === PNG_MEDIA_TYPE
  ));
  if (pngFile) return requireExactPng(pngFile);
  throw noPngError();
}

export async function predrawnPngFromPasteEvent(
  event: PredrawnClipboardPasteEvent,
): Promise<Blob> {
  return predrawnPngFromDataTransfer(event.clipboardData);
}
