import { requiredDrawableAsset } from '@chess-tactics/board-render';
import type {
  AdminLiveMediaCatalog,
  AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';

export type ChromeRole = 'outer' | 'inner';
export type ChromeCandidateRole = ChromeRole | 'divider';
export type ChromeCandidateKind = 'atom' | 'rail-repeat' | 'rail-long' | 'rail-sheet';
export type ImageSize = { w: number; h: number };

const installedChrome = () => requiredDrawableAsset('installed-chrome', 'chrome-family');
const installedChromeSlot = (role: string): string => {
  const slot = installedChrome().media[role]?.slot;
  if (!slot) throw new Error(`installed Chrome role ${role} is unavailable`);
  return slot;
};
export const CHROME_LIVE_SLOTS = {
  get outerAtom() { return installedChromeSlot('outer-atom'); },
  get outerRail() { return installedChromeSlot('outer-rail'); },
  get innerAtom() { return installedChromeSlot('inner-atom'); },
  get innerRail() { return installedChromeSlot('inner-rail'); },
  get dividerJoint() { return installedChromeSlot('divider-joint'); },
};

export type ChromeLiveSlot = string;

/** Fail startup instead of silently falling back to source-owned Chrome pixels. */
export function assertInstalledChromeSlots(): void {
  const asset = installedChrome();
  for (const role of ['outer-atom', 'outer-rail', 'inner-atom', 'inner-rail', 'divider-joint']) {
    const media = asset.media[role]?.media;
    if (!media?.mediaType.startsWith('image/') || !media.width || !media.height) {
      throw new Error(`installed Chrome role ${role} is not a dimensioned backend image`);
    }
  }
}

export type ChromeCandidateSource = {
  /** Stable semantic slot for installed media; backend version UUID for a private candidate. */
  id: string;
  label: string;
  role: ChromeCandidateRole;
  kind: ChromeCandidateKind;
  /** Immutable active URL or authenticated private-candidate URL supplied by the backend. */
  src: string;
  width: number;
  height: number;
  sourceSheetId: string;
  sourceSheetLabel: string;
  sourceSheetPath: string;
  componentIndex: number;
  componentCount: number;
  crop: { x: number; y: number; w: number; h: number };
  recommended: boolean;
  authority: 'installed-slot' | 'admin-version';
  versionId?: string;
  versionStatus?: AdminLiveMediaVersion['status'];
  provenance: Record<string, unknown>;
};

type ChromeCandidateMetadata = {
  id: string;
  label: string;
  role: ChromeCandidateRole;
  kind: ChromeCandidateKind;
  width: number;
  height: number;
  sourceSheetId: string;
  sourceSheetLabel: string;
  sourceSheetPath: string;
  componentIndex: number;
  componentCount: number;
  crop: { x: number; y: number; w: number; h: number };
  recommended: boolean;
};

const chromeSlotSpec = (slot: ChromeLiveSlot): {
  label: string;
  role: ChromeCandidateRole;
  kind: ChromeCandidateKind;
} => {
  if (slot === CHROME_LIVE_SLOTS.outerAtom) return { label: 'Installed outer atom', role: 'outer', kind: 'atom' };
  if (slot === CHROME_LIVE_SLOTS.outerRail) return { label: 'Installed outer rail', role: 'outer', kind: 'rail-sheet' };
  if (slot === CHROME_LIVE_SLOTS.innerAtom) return { label: 'Installed inner atom', role: 'inner', kind: 'atom' };
  if (slot === CHROME_LIVE_SLOTS.innerRail) return { label: 'Installed inner rail', role: 'inner', kind: 'rail-repeat' };
  if (slot === CHROME_LIVE_SLOTS.dividerJoint) return { label: 'Installed divider joint', role: 'divider', kind: 'atom' };
  throw new Error(`installed Chrome slot ${slot} has no behavior`);
};

const candidateSources = new Map<string, ChromeCandidateSource>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === 'string' && value[key] ? String(value[key]) : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function nonnegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function chromeCandidateMetadata(version: AdminLiveMediaVersion): ChromeCandidateMetadata | null {
  const raw = version.metadata.chromeCandidate;
  if (!isRecord(raw)) return null;
  const id = stringField(raw, 'id');
  const label = stringField(raw, 'label');
  const role = raw.role;
  const kind = raw.kind;
  const width = positiveInteger(raw.width);
  const height = positiveInteger(raw.height);
  const sourceSheetId = stringField(raw, 'sourceSheetId');
  const sourceSheetLabel = stringField(raw, 'sourceSheetLabel');
  const sourceSheetPath = stringField(raw, 'sourceSheetPath');
  const componentIndex = nonnegativeInteger(raw.componentIndex);
  const componentCount = positiveInteger(raw.componentCount);
  const crop = raw.crop;
  if (
    !id || !label
    || (role !== 'outer' && role !== 'inner' && role !== 'divider')
    || !['atom', 'rail-repeat', 'rail-long', 'rail-sheet'].includes(String(kind))
    || !width || !height || !sourceSheetId || !sourceSheetLabel || !sourceSheetPath
    || componentIndex === null || !componentCount
    || !isRecord(crop)
  ) return null;
  const cropX = nonnegativeInteger(crop.x);
  const cropY = nonnegativeInteger(crop.y);
  const cropW = positiveInteger(crop.w);
  const cropH = positiveInteger(crop.h);
  if (cropX === null || cropY === null || !cropW || !cropH) return null;
  return {
    id,
    label,
    role,
    kind: kind as ChromeCandidateKind,
    width,
    height,
    sourceSheetId,
    sourceSheetLabel,
    sourceSheetPath,
    componentIndex,
    componentCount,
    crop: { x: cropX, y: cropY, w: cropW, h: cropH },
    recommended: raw.recommended === true,
  };
}

function installedSource(slot: ChromeLiveSlot): ChromeCandidateSource {
  const spec = chromeSlotSpec(slot);
  const binding = Object.values(installedChrome().media).find((entry) => entry.slot === slot);
  if (!binding) throw new Error(`installed Chrome slot ${slot} is unavailable`);
  const active = binding.media;
  return {
    id: slot,
    label: spec.label,
    role: spec.role,
    kind: spec.kind,
    src: active.immutableUrl,
    width: active.width ?? 1,
    height: active.height ?? 1,
    sourceSheetId: slot,
    sourceSheetLabel: 'Installed backend slot',
    sourceSheetPath: slot,
    componentIndex: 0,
    componentCount: 1,
    crop: { x: 0, y: 0, w: active.width ?? 1, h: active.height ?? 1 },
    recommended: true,
    authority: 'installed-slot',
    provenance: {},
  };
}

/**
 * Replace the private Chrome Lab source snapshot with one authenticated backend
 * catalog. Missing enrichment is deliberately ignored: candidate filenames and
 * repository paths are never reconstructed as an authority in the browser.
 */
export function installChromeAdminCatalog(catalog: AdminLiveMediaCatalog): number {
  candidateSources.clear();
  for (const version of catalog.versions) {
    if (version.status !== 'candidate') continue;
    if (!version.media?.url) continue;
    // The completed cutover created a second legacy-bridge version for each
    // selected installed source. It carries the same candidate metadata plus
    // this activation marker; the semantic installed slot already represents it.
    if (isRecord(version.metadata.chromeDefaultActivation)) continue;
    const metadata = chromeCandidateMetadata(version);
    if (!metadata) continue;
    candidateSources.set(version.id, {
      ...metadata,
      id: version.id,
      src: version.media.url,
      width: version.media.width ?? metadata.width,
      height: version.media.height ?? metadata.height,
      authority: 'admin-version',
      versionId: version.id,
      versionStatus: version.status,
      provenance: version.provenance,
    });
  }
  return candidateSources.size;
}

export function clearChromeAdminCatalog(): void {
  candidateSources.clear();
}

export function chromeSourceById(id: string): ChromeCandidateSource {
  if (Object.values(CHROME_LIVE_SLOTS).includes(id)) return installedSource(id);
  const candidate = candidateSources.get(id);
  if (candidate) return candidate;
  throw new Error(`Chrome source ${id} is absent from the live backend catalog`);
}

export function chromeSourcesFor(role: ChromeRole, kind: 'atom' | 'rail'): ChromeCandidateSource[] {
  const installedSlot = role === 'outer'
    ? (kind === 'atom' ? CHROME_LIVE_SLOTS.outerAtom : CHROME_LIVE_SLOTS.outerRail)
    : (kind === 'atom' ? CHROME_LIVE_SLOTS.innerAtom : CHROME_LIVE_SLOTS.innerRail);
  const candidates = [...candidateSources.values()].filter((source) => (
    source.role === role && (kind === 'atom' ? source.kind === 'atom' : source.kind !== 'atom')
  )).sort((left, right) => left.sourceSheetLabel.localeCompare(right.sourceSheetLabel)
    || left.componentIndex - right.componentIndex
    || left.versionId!.localeCompare(right.versionId!));
  return [
    installedSource(installedSlot),
    ...candidates,
  ];
}

export function dividerJointSources(): ChromeCandidateSource[] {
  return [
    installedSource(CHROME_LIVE_SLOTS.dividerJoint),
    ...[...candidateSources.values()]
      .filter((source) => source.role === 'divider' && source.kind === 'atom')
      .sort((left, right) => left.sourceSheetLabel.localeCompare(right.sourceSheetLabel)
        || left.componentIndex - right.componentIndex
        || left.versionId!.localeCompare(right.versionId!)),
  ];
}

export function defaultChromeSourceId(role: ChromeRole, kind: 'atom' | 'rail'): ChromeLiveSlot {
  return role === 'outer'
    ? (kind === 'atom' ? CHROME_LIVE_SLOTS.outerAtom : CHROME_LIVE_SLOTS.outerRail)
    : (kind === 'atom' ? CHROME_LIVE_SLOTS.innerAtom : CHROME_LIVE_SLOTS.innerRail);
}
