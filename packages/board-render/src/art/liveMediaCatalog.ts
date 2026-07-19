import { resetGroundCoverCatalog } from '../core/groundCover';
import { resetWallDecorCatalog } from '../core/wallDecor';

export type LiveMediaAvailabilityPolicy = 'critical' | 'decorative';
export type LiveMediaVersionStatus = 'accepted' | 'legacy-bridge';

export interface LiveMediaDescriptor {
  url: string;
  immutableUrl: string;
  sha256: string;
  mediaType: string;
  width: number | null;
  height: number | null;
  byteLength: number;
}

export interface LiveMediaSlot {
  slot: string;
  domain: string;
  role: string;
  availabilityPolicy: LiveMediaAvailabilityPolicy;
  activeVersionId: string;
  rowRevision: number;
  metadata: Record<string, unknown>;
  versionStatus: LiveMediaVersionStatus;
  productionEligible: boolean;
  versionMetadata: Record<string, unknown>;
  provenance: Record<string, unknown>;
  nativeEvidence: Record<string, unknown>;
  media: LiveMediaDescriptor;
}

export interface LiveMediaCatalog {
  schemaVersion: 1;
  revision: number;
  updatedAt: string | null;
  slots: LiveMediaSlot[];
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SLOT_SEGMENT_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._@+-]*$/;

function catalogFailure(message: string): Error {
  return new Error(`invalid live media catalog: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function liveMediaSlotUrl(slot: string): string {
  const segments = String(slot).split('/');
  if (!segments.length || segments.some((segment) => !SLOT_SEGMENT_PATTERN.test(segment))) {
    throw catalogFailure(`invalid semantic slot ${String(slot)}`);
  }
  return `/assets/${segments.map(encodeURIComponent).join('/')}`;
}

export function assertLiveMediaCatalog(value: unknown): asserts value is LiveMediaCatalog {
  if (!isRecord(value)) throw catalogFailure('response is not an object');
  if (value.schemaVersion !== 1) throw catalogFailure(`unsupported schema version ${String(value.schemaVersion)}`);
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0) throw catalogFailure('revision is missing');
  if (value.updatedAt !== null && typeof value.updatedAt !== 'string') throw catalogFailure('updatedAt is invalid');
  if (!Array.isArray(value.slots)) throw catalogFailure('slots are missing');

  const seen = new Set<string>();
  for (const raw of value.slots) {
    if (!isRecord(raw)) throw catalogFailure('slot record is not an object');
    const slot = typeof raw.slot === 'string' ? raw.slot : '';
    const expectedUrl = liveMediaSlotUrl(slot);
    if (seen.has(slot)) throw catalogFailure(`duplicate semantic slot ${slot}`);
    seen.add(slot);
    if (typeof raw.domain !== 'string' || !raw.domain) throw catalogFailure(`${slot} domain is missing`);
    if (typeof raw.role !== 'string' || !raw.role) throw catalogFailure(`${slot} role is missing`);
    if (raw.availabilityPolicy !== 'critical' && raw.availabilityPolicy !== 'decorative') {
      throw catalogFailure(`${slot} availability policy is invalid`);
    }
    if (typeof raw.activeVersionId !== 'string' || !raw.activeVersionId) {
      throw catalogFailure(`${slot} active version is missing`);
    }
    if (!Number.isSafeInteger(raw.rowRevision) || Number(raw.rowRevision) < 0) {
      throw catalogFailure(`${slot} row revision is invalid`);
    }
    if (!isRecord(raw.metadata)) throw catalogFailure(`${slot} metadata is invalid`);
    if (raw.versionStatus !== 'accepted' && raw.versionStatus !== 'legacy-bridge') {
      throw catalogFailure(`${slot} active version status is invalid`);
    }
    if (typeof raw.productionEligible !== 'boolean') {
      throw catalogFailure(`${slot} production eligibility is invalid`);
    }
    if (raw.versionStatus === 'accepted' && raw.productionEligible !== true) {
      throw catalogFailure(`${slot} accepted version is not production eligible`);
    }
    if (raw.versionStatus === 'legacy-bridge' && raw.productionEligible !== false) {
      throw catalogFailure(`${slot} legacy bridge is falsely production eligible`);
    }
    if (!isRecord(raw.versionMetadata)) throw catalogFailure(`${slot} version metadata is invalid`);
    if (!isRecord(raw.provenance)) throw catalogFailure(`${slot} provenance is invalid`);
    if (!isRecord(raw.nativeEvidence)) throw catalogFailure(`${slot} native evidence is invalid`);
    if (!isRecord(raw.media)) throw catalogFailure(`${slot} media is missing`);
    const media = raw.media;
    if (media.url !== expectedUrl) throw catalogFailure(`${slot} stable URL is not canonical`);
    if (typeof media.sha256 !== 'string' || !SHA256_PATTERN.test(media.sha256)) {
      throw catalogFailure(`${slot} SHA-256 is invalid`);
    }
    if (media.immutableUrl !== `/api/media/${media.sha256}`) {
      throw catalogFailure(`${slot} immutable URL does not match its hash`);
    }
    if (typeof media.mediaType !== 'string' || !media.mediaType.includes('/')) {
      throw catalogFailure(`${slot} media type is invalid`);
    }
    if (!Number.isSafeInteger(media.byteLength) || Number(media.byteLength) <= 0) {
      throw catalogFailure(`${slot} byte length is invalid`);
    }
    for (const key of ['width', 'height'] as const) {
      const dimension = media[key];
      if (dimension !== null && (!Number.isSafeInteger(dimension) || Number(dimension) <= 0)) {
        throw catalogFailure(`${slot} ${key} is invalid`);
      }
    }
  }
}

let liveMediaCatalog: LiveMediaCatalog | null = null;
let liveMediaBySlot = new Map<string, LiveMediaSlot>();

// These five semantic roles are a browser-startup contract, not a Studio
// preference. Keep the identities in the shared renderer so the browser and
// backend readiness probe cannot drift into validating different Chrome sets.
export const INSTALLED_CHROME_LIVE_SLOTS = {
  outerAtom: 'ui/chrome/outer/atom.png',
  outerRail: 'ui/chrome/outer/rail.png',
  innerAtom: 'ui/chrome/inner/atom.png',
  innerRail: 'ui/chrome/inner/rail.png',
  dividerJoint: 'ui/chrome/divider/joint.png',
} as const;

/** Apply one complete backend snapshot as the renderer's only media authority. */
export function applyLiveMediaCatalog(value: unknown): boolean {
  assertLiveMediaCatalog(value);
  const changed = liveMediaCatalog?.revision !== value.revision;
  liveMediaCatalog = value;
  liveMediaBySlot = new Map(value.slots.map((slot) => [slot.slot, slot]));
  return changed;
}

export function currentLiveMediaCatalog(): LiveMediaCatalog | null {
  return liveMediaCatalog;
}

export function resetLiveMediaCatalog(): void {
  liveMediaCatalog = null;
  liveMediaBySlot = new Map();
  resetGroundCoverCatalog();
  resetWallDecorCatalog();
}

export function liveMediaForSlot(slot: string): LiveMediaSlot {
  if (!liveMediaCatalog) throw catalogFailure('catalog is not hydrated');
  const entry = liveMediaBySlot.get(slot);
  if (!entry) throw catalogFailure(`required semantic slot ${slot} is absent`);
  return entry;
}

/** Return active slots beneath a semantic prefix from the hydrated backend snapshot. */
export function liveMediaSlotsWithPrefix(prefix: string): LiveMediaSlot[] {
  if (!liveMediaCatalog) throw catalogFailure('catalog is not hydrated');
  const normalized = String(prefix);
  if (!normalized || normalized.startsWith('/') || normalized.endsWith('//')) {
    throw catalogFailure(`invalid semantic prefix ${normalized}`);
  }
  return liveMediaCatalog.slots.filter((entry) => entry.slot.startsWith(normalized));
}

export function resolvedLiveMediaUrl(slot: string): string {
  // Pin every render to the immutable hash from the one hydrated catalog
  // snapshot. Stable /assets routes are semantic entry points, not a safe way
  // to assemble a multi-asset frame while a promotion may occur.
  return liveMediaForSlot(slot).media.immutableUrl;
}

export function assertCriticalLiveMediaAvailable(): void {
  if (!liveMediaCatalog) throw catalogFailure('catalog is not hydrated');
  if (!liveMediaCatalog.slots.some((slot) => slot.availabilityPolicy === 'critical')) {
    throw catalogFailure('catalog contains no availability-critical slots');
  }
}

/** Fail startup/readiness unless every installed Chrome role is a real live raster. */
export function assertInstalledChromeLiveMediaAvailable(): void {
  for (const slot of Object.values(INSTALLED_CHROME_LIVE_SLOTS)) {
    const active = liveMediaForSlot(slot);
    if (!active.media.mediaType.startsWith('image/') || !active.media.width || !active.media.height) {
      throw catalogFailure(`installed Chrome slot ${slot} is not a dimensioned backend image`);
    }
  }
}
