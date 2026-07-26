import type {
  AdminLiveMediaCatalog,
  AdminLiveMediaSlot,
  AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import type { SaveDrawableAssetInput, AdminDrawableCatalog } from '../net/drawableCatalogAdmin';
import {
  acceptanceGroupForSlot,
  candidateVersionsForSlot,
  isReviewedForCurrentSurfaceSnapshot,
} from './surfaceLiveMediaReview';

export const SOURCE_ART_TURNTABLE_SCHEMA = 'structure-source-art-turntable-v1';
export const SOURCE_ART_DIRECTIONS = [
  'south',
  'south-west',
  'west',
  'north-west',
  'north',
  'north-east',
  'east',
  'south-east',
] as const;
export type SourceArtTurntableDirection = typeof SOURCE_ART_DIRECTIONS[number];

export interface SourceArtTurntableGroup {
  groupId: string;
  assetId: string;
  structureId: string;
  label: string;
  sortOrder: number;
  existing: boolean;
  sourceOnly: boolean;
  structureKind: string | null;
  placementScale: number;
  license: string;
  requiredSlots: string[];
}

export interface SourceArtBoardProofPlacement {
  pixelX: number;
  pixelY: number;
  scale: number;
  direction: SourceArtTurntableDirection;
}

export const SOURCE_ART_APPROVAL_STORAGE_KEY = 'chess-tactics:source-art-approval-list:v1';

type ApprovalStorage = Pick<Storage, 'getItem' | 'setItem'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function browserApprovalStorage(): ApprovalStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readSourceArtApprovalIds(
  storage: ApprovalStorage | undefined = browserApprovalStorage(),
): string[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SOURCE_ART_APPROVAL_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())))];
  } catch {
    return [];
  }
}

export function writeSourceArtApprovalIds(
  assetIds: Iterable<string>,
  storage: ApprovalStorage | undefined = browserApprovalStorage(),
): boolean {
  if (!storage) return false;
  try {
    const normalized = [...new Set([...assetIds].filter((value) => Boolean(value.trim())))].sort();
    storage.setItem(SOURCE_ART_APPROVAL_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function sourceArtApprovalListText(
  groups: readonly SourceArtTurntableGroup[],
  approvedAssetIds: Iterable<string>,
): string {
  const approved = new Set(approvedAssetIds);
  const entries = groups.filter((group) => approved.has(group.assetId));
  return [
    'Source artwork approval list',
    ...entries.map((group) => `- ${group.assetId} — ${group.label}`),
  ].join('\n');
}

function sourceArtMetadata(version: AdminLiveMediaVersion | undefined): Record<string, unknown> | null {
  const metadata = version?.metadata.sourceArt;
  return isRecord(metadata) && metadata.schema === SOURCE_ART_TURNTABLE_SCHEMA ? metadata : null;
}

function sourceArtDirection(value: unknown): value is SourceArtTurntableDirection {
  return typeof value === 'string' && (SOURCE_ART_DIRECTIONS as readonly string[]).includes(value);
}

function latestVersionWithSourceMetadata(catalog: AdminLiveMediaCatalog, slots: readonly string[]): AdminLiveMediaVersion | undefined {
  return catalog.versions
    .filter((version) => version.slot && slots.includes(version.slot) && sourceArtMetadata(version))
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)) || right.id.localeCompare(left.id))[0];
}

export function sourceArtTurntableGroups(catalog: AdminLiveMediaCatalog): SourceArtTurntableGroup[] {
  const groups = new Map<string, SourceArtTurntableGroup>();
  for (const slot of catalog.slots) {
    if (slot.lifecycleState === 'retired') continue;
    const source = isRecord(slot.metadata.sourceArt) ? slot.metadata.sourceArt : null;
    const acceptance = acceptanceGroupForSlot(slot);
    if (
      source?.schema !== SOURCE_ART_TURNTABLE_SCHEMA
      || typeof source.assetId !== 'string'
      || !sourceArtDirection(source.direction)
      || !acceptance
      || acceptance.requiredSlots.length !== SOURCE_ART_DIRECTIONS.length
    ) continue;
    const expectedSlots = SOURCE_ART_DIRECTIONS.map((direction) => `source-art/${source.assetId}/${direction}.png`).sort();
    if (expectedSlots.join('\0') !== acceptance.requiredSlots.join('\0')) continue;
    const version = latestVersionWithSourceMetadata(catalog, acceptance.requiredSlots);
    const metadata = sourceArtMetadata(version);
    if (
      !metadata
      || metadata.assetId !== source.assetId
      || typeof metadata.structureId !== 'string'
      || typeof metadata.label !== 'string'
      || !Number.isSafeInteger(metadata.sortOrder)
      || typeof metadata.existing !== 'boolean'
      || typeof metadata.sourceOnly !== 'boolean'
      || !(typeof metadata.placementScale === 'number' && Number.isFinite(metadata.placementScale) && metadata.placementScale > 0)
    ) continue;
    const group: SourceArtTurntableGroup = {
      groupId: acceptance.groupId,
      assetId: source.assetId,
      structureId: metadata.structureId,
      label: metadata.label,
      sortOrder: Number(metadata.sortOrder),
      existing: metadata.existing,
      sourceOnly: metadata.sourceOnly,
      structureKind: typeof metadata.structureKind === 'string' ? metadata.structureKind : null,
      placementScale: metadata.placementScale,
      license: typeof metadata.license === 'string' ? metadata.license : 'unspecified',
      requiredSlots: acceptance.requiredSlots,
    };
    const key = `${group.groupId}\0${group.requiredSlots.join('\0')}`;
    const prior = groups.get(key);
    if (prior && JSON.stringify(prior) !== JSON.stringify(group)) {
      groups.delete(key);
      continue;
    }
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label));
}

export function sourceArtDirectionForSlot(group: SourceArtTurntableGroup, slot: string): SourceArtTurntableDirection | null {
  const prefix = `source-art/${group.assetId}/`;
  const value = slot.startsWith(prefix) && slot.endsWith('.png') ? slot.slice(prefix.length, -4) : '';
  return sourceArtDirection(value) ? value : null;
}

export function sourceArtSelectedVersions(
  catalog: AdminLiveMediaCatalog,
  group: SourceArtTurntableGroup,
  selectedVersionBySlot: Readonly<Record<string, string>>,
): { versions: AdminLiveMediaVersion[]; slots: AdminLiveMediaSlot[]; missingSlots: string[] } {
  const versionById = new Map(catalog.versions.map((version) => [version.id, version]));
  const slotById = new Map(catalog.slots.map((slot) => [slot.slot, slot]));
  const versions: AdminLiveMediaVersion[] = [];
  const slots: AdminLiveMediaSlot[] = [];
  const missingSlots: string[] = [];
  for (const slotName of group.requiredSlots) {
    const selected = versionById.get(selectedVersionBySlot[slotName] ?? '');
    const version = selected?.slot === slotName && selected.status === 'candidate' && selected.media
      ? selected
      : candidateVersionsForSlot(catalog, slotName)[0];
    const slot = slotById.get(slotName);
    if (!version || !slot) {
      missingSlots.push(slotName);
      continue;
    }
    versions.push(version);
    slots.push(slot);
  }
  versions.sort((left, right) => String(left.slot).localeCompare(String(right.slot)));
  slots.sort((left, right) => left.slot.localeCompare(right.slot));
  return { versions, slots, missingSlots };
}

export function sourceArtOwnerGroupProof(
  group: SourceArtTurntableGroup,
  versions: readonly AdminLiveMediaVersion[],
  slots: readonly AdminLiveMediaSlot[],
  placement: SourceArtBoardProofPlacement,
  mountedDirections: Iterable<SourceArtTurntableDirection>,
): Record<string, unknown> {
  const mounted = new Set(mountedDirections);
  if (!SOURCE_ART_DIRECTIONS.every((direction) => mounted.has(direction)) || mounted.size !== SOURCE_ART_DIRECTIONS.length) {
    throw new Error('Source-art owner proof requires all eight directions mounted on the board');
  }
  return {
    schema: 'live-media-owner-group-proof-v1',
    canonicalScale: 1,
    surfaceKind: 'Studio Source Art interactive board placement',
    renderer: 'BoardLabBoard/SourceArtCandidateOverlay',
    decodedNativeRaster: { width: 512, height: 512, scale: 1 },
    mountedDirections: [...SOURCE_ART_DIRECTIONS],
    placement: {
      pixelX: placement.pixelX,
      pixelY: placement.pixelY,
      scale: placement.scale,
      direction: placement.direction,
      installedSourceScale: group.placementScale,
    },
    selectedCandidates: versions.map((version) => ({
      slot: version.slot,
      versionId: version.id,
      sha256: version.media?.sha256,
      rowRevision: version.rowRevision,
    })),
    slotSnapshots: slots.map((slot) => ({
      slot: slot.slot,
      rowRevision: slot.rowRevision,
      activeVersionId: slot.activeVersionId,
      lifecycleState: slot.lifecycleState,
    })),
    acceptanceGroup: {
      groupId: group.groupId,
      requiredSlots: group.requiredSlots,
    },
  };
}

export function isSourceArtBoardReviewed(
  version: AdminLiveMediaVersion,
  slot: AdminLiveMediaSlot | undefined,
): boolean {
  if (!isReviewedForCurrentSurfaceSnapshot(version, slot)) return false;
  const evidence = version.reviewEvidence.evidence;
  if (!isRecord(evidence)) return false;
  const mountedDirections = evidence.mountedDirections;
  return evidence.schema === 'live-media-owner-group-proof-v1'
    && evidence.surfaceKind === 'Studio Source Art interactive board placement'
    && evidence.renderer === 'BoardLabBoard/SourceArtCandidateOverlay'
    && isRecord(evidence.decodedNativeRaster)
    && evidence.decodedNativeRaster.width === 512
    && evidence.decodedNativeRaster.height === 512
    && evidence.decodedNativeRaster.scale === 1
    && Array.isArray(mountedDirections)
    && SOURCE_ART_DIRECTIONS.every((direction) => mountedDirections.includes(direction))
    && isRecord(evidence.placement);
}

function slotRoleMap(group: SourceArtTurntableGroup): Record<string, string> {
  return Object.fromEntries(SOURCE_ART_DIRECTIONS.flatMap((direction) => {
    const slot = `source-art/${group.assetId}/${direction}.png`;
    return [[`${direction}-back`, slot], [`${direction}-front`, slot]];
  }));
}

function directionBehavior(group: SourceArtTurntableGroup): Record<string, unknown> {
  return Object.fromEntries(SOURCE_ART_DIRECTIONS.map((direction) => [direction, {
    anchorX: 256,
    anchorY: 256,
    scale: group.placementScale,
    splitMode: 'flat-contact',
  }]));
}

export function sourceArtDrawableInstallInput(
  drawables: AdminDrawableCatalog,
  group: SourceArtTurntableGroup,
): SaveDrawableAssetInput {
  const existing = drawables.assets.find((asset) => asset.id === group.structureId);
  if (group.existing && !existing) throw new Error(`Existing structure ${group.structureId} is missing`);
  if (!group.existing && existing && existing.kind !== 'structure') {
    throw new Error(`Source-art id ${group.structureId} is already used by ${existing.kind}`);
  }
  const existingMedia = existing
    ? Object.fromEntries(Object.entries(existing.media).map(([role, media]) => [role, media.slot]))
    : {};
  const sourceMetadata = {
    schema: SOURCE_ART_TURNTABLE_SCHEMA,
    assetId: group.assetId,
    eightWay: true,
    referenceOnly: true,
    license: group.license,
  };
  return {
    id: group.structureId,
    kind: 'structure',
    label: group.label,
    sortOrder: group.sortOrder,
    lifecycleState: 'active',
    behavior: existing ? {
      ...existing.behavior,
      directions: {
        ...(isRecord(existing.behavior.directions) ? existing.behavior.directions : {}),
        ...directionBehavior(group),
      },
    } : {
      value: group.assetId,
      structureKind: group.structureKind ?? 'landmark',
      sourceOnly: true,
      anchorX: 256,
      anchorY: 256,
      scale: group.placementScale,
      splitMode: 'flat-contact',
      directions: directionBehavior(group),
    },
    metadata: {
      ...(existing?.metadata ?? {}),
      sourceArt: sourceMetadata,
    },
    media: {
      ...existingMedia,
      ...slotRoleMap(group),
    },
    expectedRevision: existing?.rowRevision ?? 0,
  };
}

export function sourceArtGroupInstalled(drawables: AdminDrawableCatalog | null, group: SourceArtTurntableGroup): boolean {
  const asset = drawables?.assets.find((candidate) => candidate.id === group.structureId);
  if (!asset || asset.lifecycleState !== 'active') return false;
  const roles = slotRoleMap(group);
  return Object.entries(roles).every(([role, slot]) => asset.media[role]?.slot === slot);
}

export function sourceArtGroupAvailableInEditor(
  drawables: AdminDrawableCatalog | null,
  group: SourceArtTurntableGroup,
): boolean {
  const asset = drawables?.assets.find((candidate) => candidate.id === group.structureId);
  if (!asset || asset.lifecycleState !== 'active' || asset.kind !== 'structure'
    || !sourceArtGroupInstalled(drawables, group)) return false;
  return SOURCE_ART_DIRECTIONS.every((direction) => (
    Boolean(asset.media[`${direction}-back`]?.media)
    && Boolean(asset.media[`${direction}-front`]?.media)
  ));
}

export function sourceArtGroupAccepted(
  catalog: AdminLiveMediaCatalog | null,
  group: SourceArtTurntableGroup,
): boolean {
  if (!catalog) return false;
  const slotByName = new Map(catalog.slots.map((slot) => [slot.slot, slot]));
  const versionById = new Map(catalog.versions.map((version) => [version.id, version]));
  return group.requiredSlots.every((slotName) => {
    const activeVersionId = slotByName.get(slotName)?.activeVersionId;
    const version = activeVersionId ? versionById.get(activeVersionId) : undefined;
    return version?.status === 'accepted' && Boolean(version.media);
  });
}
