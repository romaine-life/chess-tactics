import type {
  AdminLiveMediaCatalog,
  AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';

export type NativeRailOrientation = 'horizontal' | 'vertical';
export type NativeRailFit = 'repeat' | 'long';

export type NativeRailCandidateSource = {
  /** Backend version UUID. The historical generator id is provenance only. */
  id: string;
  sourceId: string;
  label: string;
  familyId: string;
  role: 'outer' | 'inner';
  fit: NativeRailFit;
  orientation: NativeRailOrientation;
  /** Authenticated content URL returned by /api/admin/media-assets. */
  src: string;
  width: number;
  height: number;
  nativeThickness: number;
  nativeScale: 1;
  provider: string;
  attemptId: string;
  sourceFile: string;
  seam: { averageDelta: number; alphaMismatches: number } | null;
  status: AdminLiveMediaVersion['status'];
  provenance: Record<string, unknown>;
};

export type NativeRailFamily = {
  id: string;
  label: string;
  role: 'outer' | 'inner';
  fit: NativeRailFit;
  horizontal: NativeRailCandidateSource[];
  vertical: NativeRailCandidateSource[];
};

export type NativeRailCatalog = {
  sources: NativeRailCandidateSource[];
  families: NativeRailFamily[];
  unpairedSourceIds: string[];
};

type NativeRailMetadata = Omit<NativeRailCandidateSource, 'id' | 'src' | 'status' | 'provenance' | 'width' | 'height'> & {
  width: number;
  height: number;
  familyLabel: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === 'string' && value[key] ? String(value[key]) : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function nonnegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function metadataFor(version: AdminLiveMediaVersion): NativeRailMetadata | null {
  const raw = version.metadata.nativeRail;
  if (!isRecord(raw)) return null;
  const sourceId = stringField(raw, 'id');
  const label = stringField(raw, 'label');
  // Explicitly unpaired candidates have neither field in the frozen importer
  // metadata. Keep them visible as sources without inventing a browser family.
  const familyId = stringField(raw, 'familyId') ?? '';
  const familyLabel = stringField(raw, 'familyLabel') ?? '';
  const role = raw.role;
  const fit = raw.fit;
  const orientation = raw.orientation;
  const width = positiveInteger(raw.width);
  const height = positiveInteger(raw.height);
  const nativeThickness = positiveInteger(raw.nativeThickness);
  const provider = stringField(raw, 'provider');
  const attemptId = stringField(raw, 'attemptId');
  const sourceFile = stringField(raw, 'sourceFile');
  if (
    !sourceId || !label
    || (role !== 'outer' && role !== 'inner')
    || (fit !== 'repeat' && fit !== 'long')
    || (orientation !== 'horizontal' && orientation !== 'vertical')
    || !width || !height || !nativeThickness
    || raw.nativeScale !== 1 || !provider || !attemptId || !sourceFile
  ) return null;
  let seam: NativeRailCandidateSource['seam'] = null;
  if (raw.seam !== null) {
    if (!isRecord(raw.seam)) return null;
    const averageDelta = nonnegativeNumber(raw.seam.averageDelta);
    const alphaMismatches = positiveInteger(raw.seam.alphaMismatches) ?? (raw.seam.alphaMismatches === 0 ? 0 : null);
    if (averageDelta === null || alphaMismatches === null) return null;
    seam = { averageDelta, alphaMismatches };
  }
  return {
    sourceId,
    label,
    familyId,
    familyLabel,
    role,
    fit,
    orientation,
    width,
    height,
    nativeThickness,
    nativeScale: 1,
    provider,
    attemptId,
    sourceFile,
    seam,
  };
}

/** Build Rail Lab's complete source/family model only from authenticated backend rows. */
export function nativeRailCatalogFromAdmin(catalog: AdminLiveMediaCatalog): NativeRailCatalog {
  const sources: NativeRailCandidateSource[] = [];
  const familyLabels = new Map<string, string>();
  for (const version of catalog.versions) {
    if (version.status !== 'candidate') continue;
    if (!version.media?.url) continue;
    const metadata = metadataFor(version);
    if (!metadata) continue;
    familyLabels.set(metadata.familyId, metadata.familyLabel);
    sources.push({
      ...metadata,
      id: version.id,
      src: version.media.url,
      width: version.media.width ?? metadata.width,
      height: version.media.height ?? metadata.height,
      status: version.status,
      provenance: version.provenance,
    });
  }

  sources.sort((left, right) => left.familyId.localeCompare(right.familyId)
    || left.orientation.localeCompare(right.orientation)
    || left.sourceId.localeCompare(right.sourceId));
  const families: NativeRailFamily[] = [];
  const admitted = new Set<string>();
  for (const familyId of [...new Set(sources.map((source) => source.familyId).filter(Boolean))].sort()) {
    const members = sources.filter((source) => source.familyId === familyId);
    const horizontal = members.filter((source) => source.orientation === 'horizontal');
    const vertical = members.filter((source) => source.orientation === 'vertical');
    if (!horizontal.length || !vertical.length) continue;
    const role = members[0].role;
    const fit = members[0].fit;
    if (!members.every((source) => source.role === role && source.fit === fit)) continue;
    members.forEach((source) => admitted.add(source.id));
    families.push({
      id: familyId,
      label: familyLabels.get(familyId) ?? familyId,
      role,
      fit,
      horizontal,
      vertical,
    });
  }
  return {
    sources,
    families,
    unpairedSourceIds: sources.filter((source) => !admitted.has(source.id)).map((source) => source.id),
  };
}

export function normalizeNativeRailFamilyId(
  families: readonly NativeRailFamily[],
  sources: readonly NativeRailCandidateSource[],
  value?: string,
): string {
  if (value && families.some((family) => family.id === value)) return value;
  if (value) {
    const sourceFamilyId = sources.find((source) => source.id === value || source.sourceId === value)?.familyId;
    if (sourceFamilyId && families.some((family) => family.id === sourceFamilyId)) return sourceFamilyId;
  }
  return families[0]?.id ?? '';
}
