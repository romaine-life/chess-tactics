import type {
  AcceptLiveMediaVersionInput,
  AdminLiveMediaCatalog,
  AdminLiveMediaSlot,
  AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';

export interface SurfaceAcceptanceGroup {
  groupId: string;
  requiredSlots: string[];
}
export interface SurfaceReviewBatch {
  versions: AdminLiveMediaVersion[];
  groups: SurfaceAcceptanceGroup[];
  missingSlots: string[];
}

export interface SurfaceReviewProofEvidenceInput {
  family: string;
  surfaceUrl: string;
  versions: readonly AdminLiveMediaVersion[];
  slots: readonly AdminLiveMediaSlot[];
  groups: readonly SurfaceAcceptanceGroup[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function surfaceSlotPrefix(family: string): string {
  return `tiles/surface/${family}-`;
}

export function acceptanceGroupForSlot(slot: AdminLiveMediaSlot | undefined): SurfaceAcceptanceGroup | null {
  const acceptance = isRecord(slot?.metadata.acceptance) ? slot.metadata.acceptance : null;
  if (!acceptance || acceptance.mode !== 'group' || !nonemptyString(acceptance.groupId)) return null;
  if (!Array.isArray(acceptance.requiredSlots)) return null;
  const requiredSlots = acceptance.requiredSlots.filter(nonemptyString).map((entry) => entry.trim()).sort();
  if (requiredSlots.length < 2 || new Set(requiredSlots).size !== requiredSlots.length) return null;
  if (!slot || !requiredSlots.includes(slot.slot)) return null;
  return { groupId: acceptance.groupId.trim(), requiredSlots };
}

export function surfaceFamilySlots(catalog: AdminLiveMediaCatalog, family: string): AdminLiveMediaSlot[] {
  const prefix = surfaceSlotPrefix(family);
  return catalog.slots.filter((slot) => slot.slot.startsWith(prefix)).sort((a, b) => a.slot.localeCompare(b.slot));
}

export function candidateVersionsForSlot(catalog: AdminLiveMediaCatalog, slot: string): AdminLiveMediaVersion[] {
  return catalog.versions
    .filter((version) => version.slot === slot && version.status === 'candidate' && version.media)
    .sort((a, b) => {
      const updated = String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
      return updated || b.id.localeCompare(a.id);
    });
}

export function surfaceAcceptanceGroups(catalog: AdminLiveMediaCatalog, family: string): SurfaceAcceptanceGroup[] {
  const groups = new Map<string, SurfaceAcceptanceGroup>();
  for (const slot of surfaceFamilySlots(catalog, family)) {
    const group = acceptanceGroupForSlot(slot);
    if (!group) continue;
    const key = `${group.groupId}\0${group.requiredSlots.join('\0')}`;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.groupId.localeCompare(b.groupId));
}

/**
 * Resolve selected candidate ids into a contract-complete review batch. If one
 * selected slot belongs to a group, all of that group's slots become required.
 */
export function surfaceReviewBatch(
  catalog: AdminLiveMediaCatalog,
  selectedVersionBySlot: Readonly<Record<string, string>>,
): SurfaceReviewBatch {
  const slotById = new Map(catalog.slots.map((slot) => [slot.slot, slot]));
  const versionById = new Map(catalog.versions.map((version) => [version.id, version]));
  const selected = new Map<string, AdminLiveMediaVersion>();
  const groups = new Map<string, SurfaceAcceptanceGroup>();

  for (const [slot, id] of Object.entries(selectedVersionBySlot)) {
    const version = versionById.get(id);
    if (!version || version.slot !== slot || version.status !== 'candidate' || !version.media) continue;
    selected.set(slot, version);
    const group = acceptanceGroupForSlot(slotById.get(slot));
    if (group) groups.set(`${group.groupId}\0${group.requiredSlots.join('\0')}`, group);
  }

  const missing = new Set<string>();
  for (const group of groups.values()) {
    for (const slot of group.requiredSlots) {
      const id = selectedVersionBySlot[slot];
      const version = id ? versionById.get(id) : undefined;
      if (!version || version.slot !== slot || version.status !== 'candidate' || !version.media) {
        missing.add(slot);
        continue;
      }
      selected.set(slot, version);
      const member = acceptanceGroupForSlot(slotById.get(slot));
      if (!member || member.groupId !== group.groupId || member.requiredSlots.join('\0') !== group.requiredSlots.join('\0')) {
        missing.add(slot);
      }
    }
  }

  return {
    versions: [...selected.values()].sort((a, b) => String(a.slot).localeCompare(String(b.slot))),
    groups: [...groups.values()].sort((a, b) => a.groupId.localeCompare(b.groupId)),
    missingSlots: [...missing].sort(),
  };
}
export function selectedSurfaceOverrides(
  catalog: AdminLiveMediaCatalog | null,
  selectedVersionBySlot: Readonly<Record<string, string>>,
): ReadonlyMap<string, string> {
  if (!catalog) return new Map();
  const versionById = new Map(catalog.versions.map((version) => [version.id, version]));
  const overrides = new Map<string, string>();
  for (const [slot, id] of Object.entries(selectedVersionBySlot)) {
    const version = versionById.get(id);
    const active = catalog.slots.find((candidate) => candidate.slot === slot)?.media;
    if (version?.slot === slot && version.media?.url && active?.immutableUrl) overrides.set(active.immutableUrl, version.media.url);
  }
  return overrides;
}

export function isReviewedForCurrentContent(version: AdminLiveMediaVersion): boolean {
  const evidence = version.reviewEvidence;
  return Boolean(
    version.media
    && evidence.approved === true
    && evidence.contentSha256 === version.media.sha256
    && nonemptyString(evidence.notes)
    && nonemptyString(evidence.surfaceUrl)
    && isRecord(evidence.evidence)
    && Object.keys(evidence.evidence).length > 0,
  );
}

/** A review is stale if either its bytes or the slot pointer/contract snapshot moved. */
export function isReviewedForCurrentSurfaceSnapshot(
  version: AdminLiveMediaVersion,
  slot: AdminLiveMediaSlot | undefined,
): boolean {
  if (!isReviewedForCurrentContent(version) || !slot || version.slot !== slot.slot) return false;
  const evidence = isRecord(version.reviewEvidence.evidence) ? version.reviewEvidence.evidence : null;
  if (!evidence || !Array.isArray(evidence.slotSnapshots)) return false;
  const snapshot = evidence.slotSnapshots.find((entry) => isRecord(entry) && entry.slot === slot.slot);
  return Boolean(
    isRecord(snapshot)
    && snapshot.rowRevision === slot.rowRevision
    && (snapshot.activeVersionId ?? null) === slot.activeVersionId,
  );
}

export function surfaceAcceptanceItems(
  catalog: AdminLiveMediaCatalog,
  versions: readonly AdminLiveMediaVersion[],
): AcceptLiveMediaVersionInput[] {
  const slots = new Map(catalog.slots.map((slot) => [slot.slot, slot]));
  return versions.map((version) => {
    if (!version.slot) throw new Error(`Candidate ${version.id} has no semantic slot.`);
    const slot = slots.get(version.slot);
    if (!slot) throw new Error(`Semantic slot ${version.slot} is absent from the admin catalog.`);
    return {
      id: version.id,
      expectedRevision: version.rowRevision,
      expectedSlotRevision: slot.rowRevision,
      expectedActiveVersionId: slot.activeVersionId,
    };
  });
}

export function surfaceReviewProofEvidence({
  family,
  surfaceUrl,
  versions,
  slots,
  groups,
}: SurfaceReviewProofEvidenceInput): Record<string, unknown> {
  const selectedCandidates = versions.map((version) => ({
    slot: version.slot,
    versionId: version.id,
    sha256: version.media?.sha256,
    rowRevision: version.rowRevision,
    role: 'top',
  }));
  return {
    schema: 'terrain-surface-canonical-board-proof-v1',
    family,
    surfaceUrl,
    renderer: 'BoardLabBoard/BoardTerrainLayer',
    canonicalScale: 1,
    assetLocalScale: 1,
    spatialResampling: false,
    deterministicProof: true,
    surfaceOnly: true,
    selectedCandidates,
    slotSnapshots: slots.map((slot) => ({
      slot: slot.slot,
      rowRevision: slot.rowRevision,
      activeVersionId: slot.activeVersionId,
      lifecycleState: slot.lifecycleState,
    })),
    acceptanceGroups: groups.map((group) => ({
      groupId: group.groupId,
      requiredSlots: group.requiredSlots,
    })),
  };
}
