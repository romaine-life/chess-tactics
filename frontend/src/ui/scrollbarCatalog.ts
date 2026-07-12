import {
  currentLiveMediaCatalog,
  liveMediaSlotsWithPrefix,
  type LiveMediaSlot,
} from '@chess-tactics/board-render';

const SCROLLBAR_SLOT_PREFIX = 'ui/scrollbars/';

// These values describe only how the Studio exercises a known semantic grip.
// Browse membership and bytes come from the hydrated backend catalog.
const PREVIEW_KIND_BY_STABLE_SLOT = {
  'ui/scrollbars/oak-pixellab.png': 'sprite',
  'ui/scrollbars/oak-forge.png': 'sprite',
  'ui/scrollbars/oak-pixelated.png': 'texture',
  'ui/scrollbars/oak-raw.png': 'texture',
} as const satisfies Readonly<Record<string, 'sprite' | 'texture'>>;

export interface ScrollbarAsset {
  name: string;
  label: string;
  slot: string;
  file: string;
  kind: 'sprite' | 'texture';
  width: number;
  height: number;
}

function previewKind(slot: string): ScrollbarAsset['kind'] | undefined {
  return (PREVIEW_KIND_BY_STABLE_SLOT as Readonly<Record<string, ScrollbarAsset['kind']>>)[slot];
}

function scrollbarName(slot: string): string | null {
  const filename = slot.slice(SCROLLBAR_SLOT_PREFIX.length);
  if (!filename || filename.includes('/') || !filename.toLowerCase().endsWith('.png')) return null;
  return filename.slice(0, -'.png'.length);
}

function labelForName(name: string): string {
  return name
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function liveScrollbarAsset(entry: LiveMediaSlot): ScrollbarAsset | null {
  const name = scrollbarName(entry.slot);
  const kind = previewKind(entry.slot);
  if (
    !name
    || !kind
    || !entry.media.mediaType.startsWith('image/')
    || !entry.media.width
    || !entry.media.height
  ) return null;

  return {
    name,
    label: labelForName(name),
    slot: entry.slot,
    file: entry.media.immutableUrl,
    kind,
    width: entry.media.width,
    height: entry.media.height,
  };
}

/** Build the scrollbar browser from one already-applied live catalog snapshot. */
export function liveScrollbarAssets(): ScrollbarAsset[] {
  // Scrollbar art is decorative. Before startup hydration there is no Git or
  // built-in replacement to show; callers safely render an empty browser.
  if (!currentLiveMediaCatalog()) return [];
  return liveMediaSlotsWithPrefix(SCROLLBAR_SLOT_PREFIX)
    .map(liveScrollbarAsset)
    .filter((asset): asset is ScrollbarAsset => asset !== null)
    .sort((left, right) => left.slot.localeCompare(right.slot));
}
