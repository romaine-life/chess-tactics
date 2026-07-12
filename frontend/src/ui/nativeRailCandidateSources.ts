import manifest from './nativeRailCandidateManifest.json';

export type NativeRailOrientation = 'horizontal' | 'vertical';
export type NativeRailFit = 'repeat' | 'long';

export type NativeRailCandidateSource = {
  id: string;
  label: string;
  familyId?: string;
  role: 'outer' | 'inner';
  fit: NativeRailFit;
  orientation: NativeRailOrientation;
  src: string;
  width: number;
  height: number;
  nativeThickness: number;
  nativeScale: 1;
  provider: string;
  attemptId: string;
  sourceFile: string;
  seam: { averageDelta: number; alphaMismatches: number } | null;
};

export type NativeRailFamily = {
  id: string;
  label: string;
  role: 'outer' | 'inner';
  fit: NativeRailFit;
  horizontal: NativeRailCandidateSource[];
  vertical: NativeRailCandidateSource[];
};

type NativeRailFamilyRecord = {
  id: string;
  label: string;
  role: 'outer' | 'inner';
  fit: NativeRailFit;
  review: {
    assembledAtNativeScale: true;
    date: string;
    artifact: string;
  };
  horizontalSourceIds: string[];
  verticalSourceIds: string[];
};

export const NATIVE_RAIL_CANDIDATE_SOURCES = manifest.sources as NativeRailCandidateSource[];
export const UNPAIRED_NATIVE_RAIL_SOURCE_IDS = manifest.unpairedSourceIds as string[];

const SOURCE_BY_ID = new Map(NATIVE_RAIL_CANDIDATE_SOURCES.map((source) => [source.id, source]));

export const NATIVE_RAIL_FAMILIES = (manifest.families as NativeRailFamilyRecord[]).map((family) => ({
  id: family.id,
  label: family.label,
  role: family.role,
  fit: family.fit,
  horizontal: family.horizontalSourceIds.map((id) => SOURCE_BY_ID.get(id)).filter((source): source is NativeRailCandidateSource => Boolean(source)),
  vertical: family.verticalSourceIds.map((id) => SOURCE_BY_ID.get(id)).filter((source): source is NativeRailCandidateSource => Boolean(source)),
}));

export const DEFAULT_RAIL_FAMILY_ID = NATIVE_RAIL_FAMILIES.find((family) => family.role === 'outer')?.id ?? NATIVE_RAIL_FAMILIES[0]?.id ?? '';

export function normalizeNativeRailFamilyId(value?: string): string {
  if (value && NATIVE_RAIL_FAMILIES.some((family) => family.id === value)) return value;
  if (value) {
    const sourceFamilyId = SOURCE_BY_ID.get(value)?.familyId;
    if (sourceFamilyId) return sourceFamilyId;
  }
  return DEFAULT_RAIL_FAMILY_ID;
}
