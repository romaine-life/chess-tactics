import type { LiveMediaCatalog, LiveMediaSlot } from '@chess-tactics/board-render';

export type StudioProductionStatus = 'accepted' | 'legacy-bridge' | 'mixed';
export type StudioAssetType = 'settings' | 'game' | 'shields' | 'frames' | 'structure';

export interface StudioLiveMediaRecord {
  id: string;
  label: string;
  primary: LiveMediaSlot;
  slots: readonly LiveMediaSlot[];
  immutableUrl: string;
  width: number | null;
  height: number | null;
  productionStatus: StudioProductionStatus;
  productionEligible: boolean;
  runtime: Readonly<Record<string, unknown>>;
}

export interface StudioAssetRecord extends StudioLiveMediaRecord {
  type: StudioAssetType;
  kind: 'glyph' | 'frame' | 'structure';
  name: string;
  front?: LiveMediaSlot;
  back?: LiveMediaSlot;
  structureId?: string;
}

export interface StudioAssetLibrary {
  revision: number;
  items: StudioAssetRecord[];
}

export interface StudioArtworkRecord extends StudioLiveMediaRecord {
  groupId: string;
  sub: string;
}

export interface StudioArtworkGroup {
  id: string;
  label: string;
  items: StudioArtworkRecord[];
}

export interface StudioArtworkLibrary {
  revision: number;
  groups: StudioArtworkGroup[];
  items: StudioArtworkRecord[];
}

interface ArtworkTaxonomy {
  id: string;
  label: string;
  classify: (slot: string) => { label: string; sub: string } | null;
}

const PIECES = new Set(['bishop', 'king', 'knight', 'pawn', 'queen', 'rook']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function runtimeOf(slot: LiveMediaSlot): Readonly<Record<string, unknown>> {
  const runtime = slot.versionMetadata.runtime;
  return isRecord(runtime) ? runtime : {};
}

function stripRasterExtension(value: string): string {
  return value.replace(/\.(?:avif|gif|jpe?g|png|webp)$/i, '');
}

function titleCase(value: string): string {
  const normalized = stripRasterExtension(value)
    .replace(/(?:^|\/)generated\//g, '')
    .replace(/@\d+x$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function runtimeLabel(slot: LiveMediaSlot, fallback: string): string {
  const runtime = runtimeOf(slot);
  const altText = typeof runtime.altText === 'string' ? runtime.altText.trim() : '';
  return altText || fallback;
}

function productionStatus(slots: readonly LiveMediaSlot[]): StudioProductionStatus {
  if (slots.every((slot) => slot.versionStatus === 'accepted' && slot.productionEligible)) return 'accepted';
  if (slots.every((slot) => slot.versionStatus === 'legacy-bridge' && !slot.productionEligible)) return 'legacy-bridge';
  return 'mixed';
}

function byLabelThenId<T extends { label: string; id: string }>(left: T, right: T): number {
  return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
    || left.id.localeCompare(right.id);
}

function liveRecord(
  id: string,
  label: string,
  primary: LiveMediaSlot,
  slots: readonly LiveMediaSlot[],
): StudioLiveMediaRecord {
  return {
    id,
    label: runtimeLabel(primary, label),
    primary,
    slots,
    immutableUrl: primary.media.immutableUrl,
    width: primary.media.width,
    height: primary.media.height,
    productionStatus: productionStatus(slots),
    productionEligible: slots.every((slot) => slot.productionEligible),
    runtime: runtimeOf(primary),
  };
}

function classifyUiKitAsset(slot: LiveMediaSlot): Omit<StudioAssetRecord, keyof StudioLiveMediaRecord> | null {
  if (!slot.media.mediaType.startsWith('image/')) return null;
  let match = slot.slot.match(/^ui\/kit\/icons\/game\/([^/]+\.(?:avif|gif|jpe?g|png|webp))$/i);
  if (match) return { type: 'game', kind: 'glyph', name: stripRasterExtension(match[1]) };
  match = slot.slot.match(/^ui\/kit\/icons\/shields\/([^/]+\.(?:avif|gif|jpe?g|png|webp))$/i);
  if (match) return { type: 'shields', kind: 'glyph', name: stripRasterExtension(match[1]) };
  match = slot.slot.match(/^ui\/kit\/icons\/([^/]+\.(?:avif|gif|jpe?g|png|webp))$/i);
  if (match) return { type: 'settings', kind: 'glyph', name: stripRasterExtension(match[1]) };
  match = slot.slot.match(/^ui\/kit\/(?!_refs\/)(.+\.(?:avif|gif|jpe?g|png|webp))$/i);
  if (match) return { type: 'frames', kind: 'frame', name: stripRasterExtension(match[1]) };
  return null;
}

/**
 * Project the Studio's asset roster from one complete backend catalog snapshot.
 * Path rules classify live semantic slots; they do not enumerate media or carry
 * active pointers. Structure entities are paired only after their active halves
 * are present in this snapshot.
 */
export function buildStudioAssetLibrary(catalog: LiveMediaCatalog): StudioAssetLibrary {
  const items: StudioAssetRecord[] = [];
  for (const slot of catalog.slots) {
    const classification = classifyUiKitAsset(slot);
    if (!classification) continue;
    const record = liveRecord(slot.slot, titleCase(classification.name.split('/').at(-1) || classification.name), slot, [slot]);
    items.push({ ...record, ...classification });
  }

  const structureHalves = new Map<string, { root: string; structureId: string; front?: LiveMediaSlot; back?: LiveMediaSlot }>();
  for (const slot of catalog.slots) {
    if (!slot.media.mediaType.startsWith('image/')) continue;
    const match = slot.slot.match(/^(props|doodads)\/([^/]+)\/(front|back)\.(?:avif|gif|jpe?g|png|webp)$/i);
    if (!match) continue;
    const key = `${match[1]}/${match[2]}`;
    const halves = structureHalves.get(key) ?? { root: match[1], structureId: match[2] };
    halves[match[3].toLowerCase() as 'front' | 'back'] = slot;
    structureHalves.set(key, halves);
  }
  for (const [id, halves] of structureHalves) {
    const primary = halves.front ?? halves.back;
    if (!primary) continue;
    const slots = [halves.back, halves.front].filter((slot): slot is LiveMediaSlot => !!slot);
    const record = liveRecord(id, titleCase(halves.structureId), primary, slots);
    items.push({
      ...record,
      type: 'structure',
      kind: 'structure',
      name: halves.structureId,
      structureId: halves.structureId,
      front: halves.front,
      back: halves.back,
    });
  }

  items.sort(byLabelThenId);
  return { revision: catalog.revision, items };
}

function setLabel(setId: string): string {
  return titleCase(setId.replace(/-set-\d+$/i, ''));
}

function pieceLabel(piece: string, palette?: string): string {
  return palette ? `${titleCase(piece)} · ${titleCase(palette)}` : titleCase(piece);
}

const ARTWORK_TAXONOMY: readonly ArtworkTaxonomy[] = [
  {
    id: 'world-scenes', label: 'World scenes',
    classify: (slot) => {
      const world = slot.match(/^backgrounds\/([^/]+)\/world\.png$/i);
      if (world) return { label: setLabel(world[1]), sub: 'world scene' };
      if (/^ui\/main-menu\/background-scene-v\d+\.png$/i.test(slot)) return { label: 'Main menu scene', sub: 'main menu' };
      return null;
    },
  },
  {
    id: 'portrait-backgrounds', label: 'Portrait backgrounds',
    classify: (slot) => {
      const match = slot.match(/^backgrounds\/([^/]+)\/portraits\/([^/]+)\.png$/i);
      return match ? { label: pieceLabel(match[2]), sub: setLabel(match[1]) } : null;
    },
  },
  {
    id: 'unit-portraits', label: 'Unit portraits',
    classify: (slot) => {
      const match = slot.match(/^units\/([^/]+)\/portrait\/([^/]+)\.png$/i);
      if (!match || !PIECES.has(match[1].toLowerCase())) return null;
      return { label: pieceLabel(match[1], match[2]), sub: 'team palette' };
    },
  },
  {
    id: 'portrait-editor', label: 'Portrait-editor sources',
    classify: (slot) => {
      const match = slot.match(/^portrait-editor\/([^/]+)\/([^/]+)\.png$/i);
      if (!match || !PIECES.has(match[1].toLowerCase())) return null;
      return { label: pieceLabel(match[1], match[2]), sub: 'portrait source' };
    },
  },
  {
    id: 'brand-key-art', label: 'Brand & key art',
    classify: (slot) => (
      /^ui\/main-menu-(?:aspirational|brand-[^/]+|button-art-[^/]+)\.png$/i.test(slot)
        ? { label: titleCase(slot.split('/').at(-1) || slot), sub: 'brand / key art' }
        : null
    ),
  },
  {
    id: 'concept-art', label: 'Concept art',
    classify: (slot) => {
      if (/^art\/[^/]+\.png$/i.test(slot) || /^ui\/[^/]+-concept(?:-v\d+)?\.png$/i.test(slot)) {
        return { label: titleCase(slot.split('/').at(-1) || slot), sub: 'concept' };
      }
      return null;
    },
  },
  {
    id: 'inspiration', label: 'Inspiration',
    classify: (slot) => {
      const match = slot.match(/^artwork\/inspiration\/(.+)\/([^/]+)\.png$/i);
      return match ? { label: titleCase(match[2]), sub: match[1].split('/').filter((part) => part !== 'generated').join(' / ') } : null;
    },
  },
];

/** Project the Artwork library from the same immutable-pointer snapshot as Assets. */
export function buildStudioArtworkLibrary(catalog: LiveMediaCatalog): StudioArtworkLibrary {
  const grouped = new Map(ARTWORK_TAXONOMY.map((group) => [group.id, { ...group, items: [] as StudioArtworkRecord[] }]));
  for (const slot of catalog.slots) {
    if (!slot.media.mediaType.startsWith('image/')) continue;
    for (const taxonomy of ARTWORK_TAXONOMY) {
      const classified = taxonomy.classify(slot.slot);
      if (!classified) continue;
      const record = liveRecord(stripRasterExtension(slot.slot), classified.label, slot, [slot]);
      grouped.get(taxonomy.id)?.items.push({ ...record, groupId: taxonomy.id, sub: classified.sub });
      break;
    }
  }
  const groups = ARTWORK_TAXONOMY.map((taxonomy) => {
    const items = grouped.get(taxonomy.id)?.items ?? [];
    items.sort(byLabelThenId);
    return { id: taxonomy.id, label: taxonomy.label, items };
  }).filter((group) => group.items.length);
  return { revision: catalog.revision, groups, items: groups.flatMap((group) => group.items) };
}

export function mediaDimensions(record: Pick<StudioLiveMediaRecord, 'width' | 'height'>): string {
  return record.width && record.height ? `${record.width}×${record.height}` : '—';
}

export function studioProductionLabel(status: StudioProductionStatus): string {
  if (status === 'accepted') return 'accepted';
  if (status === 'legacy-bridge') return 'legacy bridge';
  return 'mixed pointers';
}
