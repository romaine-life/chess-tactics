// TEMPORARY ADR-0085 CUTOVER TOOL.
//
// This is not a seed path and must not survive the cutover. The permanent
// no-committed-media guard fails while this file exists. It inventories the old
// Git bytes, uploads each byte-for-byte, verifies the immutable object by hash,
// and records exactly one of:
//   - an active, explicitly non-production-eligible legacy bridge for an old
//     frontend/public/assets semantic path; or
//   - a non-active candidate for old Chrome Lab candidate pixels; or
//   - a non-active private archive version for source/review media elsewhere.
//
// It never claims that legacy media is native 1x or owner-reviewed, and it has
// no review or acceptance capability. Production acceptance remains an
// owner-operated backend transaction after the storage cutover.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCanonicalGitByteReader,
  isAllowedSyntheticTestMedia,
  isMediaPath,
  listTrackedFiles,
  normalizeRepoPath,
} from './check-no-committed-media.mjs';
import {
  LiveMediaAdminClient,
  mediaRecordFrom,
  mediaTypeFromBytes,
  mediaVersionFrom,
  sha256Bytes,
} from './live-media-admin-client.mjs';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultRepoRoot = path.resolve(frontendRoot, '..');
const INVENTORY_SCHEMA = 'adr-0085-media-migration-inventory-v1';
const PUBLIC_ASSET_PREFIX = 'frontend/public/assets/';
const CHROME_CANDIDATE_PREFIX = `${PUBLIC_ASSET_PREFIX}ui/chrome-candidates/`;
const CHROME_CANDIDATE_MANIFEST_SOURCE = 'frontend/src/ui/chromeCandidateManifest.json';
const NATIVE_RAIL_CANDIDATE_MANIFEST_SOURCE = 'frontend/src/ui/nativeRailCandidateManifest.json';
const NATIVE_RAIL_FAMILIES_SOURCE = 'frontend/config/native-rail-families.json';
const CHROME_LAB_DEFAULTS_SOURCE = 'frontend/config/chrome-lab-defaults.json';
const CHROME_PRIVATE_ARCHIVE_SOURCES = new Set([
  CHROME_CANDIDATE_MANIFEST_SOURCE,
  NATIVE_RAIL_CANDIDATE_MANIFEST_SOURCE,
  NATIVE_RAIL_FAMILIES_SOURCE,
]);
const CHROME_DEFAULT_ACTIVATION_SPECS = Object.freeze([
  { configKey: 'outer.atomSourceId', sourceId: 'outer-atoms-img2img-32-v1-08', slot: 'ui/chrome/outer/atom.png', role: 'atom' },
  { configKey: 'outer.railSourceId', sourceId: 'outer-rails-v3-01', slot: 'ui/chrome/outer/rail.png', role: 'rail' },
  { configKey: 'inner.atomSourceId', sourceId: 'inner-atoms-img2img-micro-v2-10', slot: 'ui/chrome/inner/atom.png', role: 'atom' },
  { configKey: 'inner.railSourceId', sourceId: 'inner-rails-repeat-v4-02', slot: 'ui/chrome/inner/rail.png', role: 'rail' },
  { configKey: 'divider.atomSourceId', sourceId: 'divider-atoms-pixellab-cover-v1-21', slot: 'ui/chrome/divider/joint.png', role: 'joint' },
]);
const SYNTHESIZED_DIVIDER_SETS = Object.freeze([
  {
    id: 'divider-atoms-pixellab-cover-v1',
    label: 'Divider PixelLab cover',
    sourceSheetLabel: 'Divider PixelLab cover atoms 17',
    sourceSheetPath: '/assets/ui/chrome-candidates/pixellab-v1/divider-cover-atoms-17',
    count: 52,
  },
  {
    id: 'divider-atoms-codex-style-cover-v1',
    label: 'Divider Codex-style cover',
    sourceSheetLabel: 'Divider Codex-style cover atoms 17',
    sourceSheetPath: '/assets/ui/chrome-candidates/pixellab-v1/divider-cover-atoms-codex-style-17',
    count: 55,
  },
]);
const CHROME_CANDIDATE_REPORT_COUNT = 26;
const DIVIDER_ORNAMENT_SOURCE = 'frontend/public/kit-portfolio/cand3-codex.png';
const PORTRAIT_CANONICAL_ACTIVATION_SOURCE = /^frontend\/public\/assets\/portrait-candidates\/codex-stone\/(bishop|king|knight|pawn|queen|rook)\/(black|crimson|emerald|golden|navy-blue|white)\.png$/;
const DISPLACED_CANONICAL_PORTRAIT_SOURCE = /^frontend\/public\/assets\/units\/(bishop|king|knight|pawn|queen|rook)\/portrait\/(black|crimson|emerald|golden|navy-blue|white)\.png$/;
const MAX_API_BYTES = 32 * 1024 * 1024;
const SLOT_SEGMENT_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._@+-]*$/;
const ADMIN_CATALOG_PATH = '/api/admin/media-assets';
const CREATE_PATH = '/api/admin/media-versions';
const CONTENT_PATH = '/api/admin/media-versions/{id}/content';
const BRIDGE_PATH = '/api/admin/media-versions/{id}/bridge';
const ARCHIVE_PATH = '/api/admin/media-versions/{id}/archive';
const CANONICAL_GIT_BYTE_CONTEXT = Symbol('canonicalGitByteContext');
export const WATER_SIDE_ACCEPTANCE_REQUIRED_SLOTS = Object.freeze(
  Array.from({ length: 8 }, (_, index) => `tiles/surface/water-${index}-side.png`).sort(),
);
const FROZEN_FULL_INVENTORY = {
  count: 3984,
  bytes: 428728479,
  versionCount: 4025,
  activeCount: 1608,
  candidateCount: 273,
  archiveCount: 2144,
  canonicalActivationCount: 41,
  sha256: '0f1a017089b5b59bcc17d8e2ebcb2b1a9536fe5c627ad7af7bf2e279cb9ad446',
};

function sha256(bytes) {
  return sha256Bytes(bytes);
}

function sha256Text(value) {
  return sha256(Buffer.from(value, 'utf8'));
}

export function mediaTypeFor(relativePath, bytes) {
  return mediaTypeFromBytes(relativePath, bytes);
}

function uint24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

export function imageDimensions(bytes, mediaType) {
  if (mediaType === 'image/png' && bytes.length >= 24
    && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mediaType === 'image/gif' && bytes.length >= 10) {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  if (mediaType === 'image/jpeg' && bytes.length >= 4) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const segmentLength = bytes.readUInt16BE(offset + 2);
      if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      offset += 2 + segmentLength;
    }
  }
  if (mediaType === 'image/webp' && bytes.length >= 30
    && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = bytes.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: uint24LE(bytes, 24) + 1, height: uint24LE(bytes, 27) + 1 };
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const packed = bytes.readUInt32LE(21);
      return { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
  }
  if (mediaType === 'image/avif') {
    const ispe = bytes.indexOf(Buffer.from('ispe', 'ascii'));
    if (ispe >= 0 && ispe + 16 <= bytes.length) {
      return { width: bytes.readUInt32BE(ispe + 8), height: bytes.readUInt32BE(ispe + 12) };
    }
  }
  return { width: null, height: null };
}

function runtimeDomain(slot) {
  const first = slot.split('/')[0];
  return ({
    backgrounds: 'background', doodads: 'prop', fonts: 'font', groundcover: 'terrain', og: 'social-card',
    'portrait-candidates': 'portrait', 'portrait-editor': 'portrait', props: 'prop', sfx: 'sfx',
    sprites: 'sprite-atlas', tiles: 'terrain', ui: 'ui-kit', units: 'unit-art', 'wall-decor': 'wall-decor',
    art: 'review-media', artwork: 'review-media',
  })[first] ?? 'runtime-media';
}

function sourceDomain(sourcePath) {
  if (/^docs\/art\/chrome-/i.test(sourcePath)) return 'ui-kit';
  if (/unit|portrait/i.test(sourcePath)) return /portrait/i.test(sourcePath) ? 'portrait' : 'unit-art';
  if (/tile|terrain|surface|groundcover|wall|fence|shore|water|road/i.test(sourcePath)) return 'terrain';
  if (/ui|kit|menu|button|toggle|frame|titlebar|scrollbar/i.test(sourcePath)) return 'ui-kit';
  if (/sfx|audio|sound|music/i.test(sourcePath)) return 'sfx';
  if (/prop|doodad/i.test(sourcePath)) return 'prop';
  return 'source-media';
}

function roleFor(sourcePath, isRuntime, domain) {
  const value = sourcePath.toLowerCase();
  if (!isRuntime) {
    if (/candidate/.test(value)) return 'candidate';
    return /contact.sheet|proof|review|comparison|preview|screenshot/.test(value) ? 'review' : 'source';
  }
  if (domain === 'terrain' && (/-top-anim\.|\/animation/.test(value))) return 'animation';
  if (domain === 'terrain' && /-top\./.test(value)) return 'top';
  if (domain === 'terrain' && /-side\./.test(value)) return 'side';
  if (/thumb|preview|contact.sheet|candidate|review|proof|concept|explore|generated-source|inspiration|aspirational/.test(value)) return 'review';
  if (/(?:^|\/)(?:readme|ofl|license)(?:\.|$)/.test(value)) return 'metadata';
  if (/\.json$/.test(value)) return 'manifest';
  if (/font/.test(value)) return 'font';
  if (/sfx|\.wav$|\.ogg$|\.m4a$|\.aac$/.test(value)) return 'audio';
  return 'media';
}

function availabilityPolicyFor(domain, role) {
  if (role === 'candidate' || role === 'review' || role === 'metadata') return 'decorative';
  if (['sfx', 'portrait', 'prop', 'wall-decor', 'social-card', 'review-media'].includes(domain)) return 'decorative';
  return 'critical';
}

export function migrationIdentity(sourcePath, chromeContext = null) {
  const normalized = normalizeRepoPath(sourcePath);
  if (normalized.startsWith(CHROME_CANDIDATE_PREFIX)) {
    const isCatalogCandidate = normalized.toLowerCase().endsWith('.png')
      && chromeContext?.candidateBySourcePath?.has(normalized);
    if (!isCatalogCandidate) {
      return {
        namespace: 'migration/git-media-cutover',
        slot: null,
        migrationDisposition: 'private-archive',
        domain: 'ui-kit',
        role: normalized.toLowerCase().endsWith('.json') ? 'manifest' : 'source',
      };
    }
    const slot = normalized.slice(PUBLIC_ASSET_PREFIX.length);
    if (!slot || slot.length > 512 || !slot.split('/').every((segment) => SLOT_SEGMENT_PATTERN.test(segment))) {
      throw new Error(`Chrome candidate path cannot be preserved as a semantic slot: ${normalized}`);
    }
    return {
      namespace: 'runtime-candidate',
      slot,
      migrationDisposition: 'candidate',
      domain: 'ui-kit',
      role: 'candidate',
    };
  }
  if (CHROME_PRIVATE_ARCHIVE_SOURCES.has(normalized)) {
    return {
      namespace: 'migration/git-media-cutover',
      slot: null,
      migrationDisposition: 'private-archive',
      domain: 'ui-kit',
      role: 'manifest',
    };
  }
  if (DISPLACED_CANONICAL_PORTRAIT_SOURCE.test(normalized)) {
    return {
      namespace: 'migration/git-media-cutover',
      slot: null,
      migrationDisposition: 'private-archive',
      domain: 'portrait',
      role: 'source',
    };
  }
  if (normalized === DIVIDER_ORNAMENT_SOURCE) {
    return {
      namespace: 'runtime',
      slot: 'ui/kit/dividers/codex-ornament.png',
      migrationDisposition: 'legacy-bridge',
      domain: 'ui-kit',
      role: 'media',
    };
  }
  if (normalized.startsWith(PUBLIC_ASSET_PREFIX)) {
    const slot = normalized.slice(PUBLIC_ASSET_PREFIX.length);
    if (!slot || slot.length > 512 || !slot.split('/').every((segment) => SLOT_SEGMENT_PATTERN.test(segment))) {
      throw new Error(`Public asset path cannot be preserved as a semantic slot: ${normalized}`);
    }
    const domain = runtimeDomain(slot);
    return {
      namespace: 'runtime',
      slot,
      migrationDisposition: 'legacy-bridge',
      domain,
      role: roleFor(slot, true, domain),
    };
  }
  return {
    namespace: 'migration/git-media-cutover',
    slot: null,
    migrationDisposition: 'private-archive',
    domain: sourceDomain(normalized),
    role: roleFor(normalized, false, sourceDomain(normalized)),
  };
}

export function portraitCanonicalActivation(sourcePath, baseEntry) {
  const match = normalizeRepoPath(sourcePath).match(PORTRAIT_CANONICAL_ACTIVATION_SOURCE);
  if (!match) return null;
  if (!baseEntry?.slot) throw new Error(`Portrait canonical activation requires its candidate slot: ${sourcePath}`);
  const canonicalSlot = `units/${match[1]}/portrait/${match[2]}.png`;
  return {
    ...baseEntry,
    namespace: 'runtime-canonical-activation',
    slot: canonicalSlot,
    domain: 'portrait',
    role: 'portrait',
    availabilityPolicy: 'critical',
    activationSourceSlot: baseEntry.slot,
    displacedSourcePath: `${PUBLIC_ASSET_PREFIX}${canonicalSlot}`,
  };
}

function requiredJson(repoRoot, sourcePath) {
  const absolutePath = path.join(repoRoot, sourcePath);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read required Chrome cutover manifest ${sourcePath}: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Chrome cutover manifest must contain an object: ${sourcePath}`);
  }
  return parsed;
}

function sourcePathFromAssetUrl(value, label) {
  if (typeof value !== 'string' || !value.startsWith('/assets/')) {
    throw new Error(`${label} must use an /assets/ source URL`);
  }
  const sourcePath = normalizeRepoPath(`frontend/public${value}`);
  if (!sourcePath.startsWith(CHROME_CANDIDATE_PREFIX)) {
    throw new Error(`${label} must resolve inside ${CHROME_CANDIDATE_PREFIX}`);
  }
  return sourcePath;
}

function pickOwn(source, keys) {
  const result = {};
  for (const key of keys) {
    if (Object.hasOwn(source, key)) result[key] = source[key];
  }
  return result;
}

function indexUnique(rows, keyFor, label) {
  const result = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    if (!key) throw new Error(`${label} contains an entry without an identity`);
    if (result.has(key)) throw new Error(`${label} contains duplicate identity ${key}`);
    result.set(key, row);
  }
  return result;
}

function normalizedNativeFamily(family) {
  if (!family) return null;
  const members = family.members && typeof family.members === 'object' ? family.members : {};
  return {
    ...pickOwn(family, ['id', 'label', 'role', 'fit', 'generationAttemptId', 'review']),
    horizontalSourceIds: Array.isArray(family.horizontalSourceIds)
      ? [...family.horizontalSourceIds]
      : Array.isArray(members.horizontalSourceIds) ? [...members.horizontalSourceIds] : [],
    verticalSourceIds: Array.isArray(family.verticalSourceIds)
      ? [...family.verticalSourceIds]
      : Array.isArray(members.verticalSourceIds) ? [...members.verticalSourceIds] : [],
  };
}

function dividerSourcePath(sourceId) {
  const match = String(sourceId || '').match(/^(divider-atoms-(?:pixellab|codex-style)-cover-v1)-(\d{2})$/);
  if (!match) throw new Error(`Unsupported Chrome Lab divider source id: ${sourceId}`);
  return `${CHROME_CANDIDATE_PREFIX}exploded/${match[1]}/candidate-${match[2]}.png`;
}

/**
 * Builds the lossless lookup used only by the one-time cutover. The DB record
 * keeps the UI-facing descriptor under metadata and records which frozen
 * manifest supplied it under provenance.
 */
export function createChromeCutoverContext({
  chromeManifest,
  nativeRailManifest,
  nativeRailFamilies,
  chromeLabDefaults,
}) {
  if (!Array.isArray(chromeManifest?.sources)) throw new Error('Chrome candidate manifest is missing sources');
  if (!Array.isArray(nativeRailManifest?.sources) || !Array.isArray(nativeRailManifest?.families)
    || !Array.isArray(nativeRailManifest?.unpairedSourceIds)) {
    throw new Error('Native rail candidate manifest is incomplete');
  }
  if (!Array.isArray(nativeRailFamilies?.families)) throw new Error('Native rail family manifest is missing families');

  const familyById = indexUnique(nativeRailFamilies.families, (row) => row?.id, 'Native rail family manifest');
  const embeddedFamilyById = indexUnique(nativeRailManifest.families, (row) => row?.id, 'Native rail candidate families');
  if (familyById.size !== embeddedFamilyById.size) {
    throw new Error('Native rail candidate and family manifests disagree about family count');
  }
  for (const [familyId, family] of familyById) {
    if (JSON.stringify(normalizedNativeFamily(family))
      !== JSON.stringify(normalizedNativeFamily(embeddedFamilyById.get(familyId)))) {
      throw new Error(`Native rail candidate and family manifests disagree about ${familyId}`);
    }
  }
  const unpairedSourceIds = new Set(nativeRailManifest.unpairedSourceIds);
  const candidateBySourcePath = new Map();
  const sourcePathById = new Map();

  for (const source of chromeManifest.sources) {
    const sourcePath = sourcePathFromAssetUrl(source?.src, `Chrome candidate ${source?.id ?? '<unknown>'}`);
    if (!source?.id || sourcePathById.has(source.id)) throw new Error(`Duplicate Chrome candidate id: ${source?.id}`);
    sourcePathById.set(source.id, sourcePath);
    const current = candidateBySourcePath.get(sourcePath) ?? {};
    if (current.metadata?.chromeCandidate) throw new Error(`Duplicate Chrome candidate source path: ${sourcePath}`);
    candidateBySourcePath.set(sourcePath, {
      ...current,
      metadata: {
        ...(current.metadata ?? {}),
        chromeCandidate: pickOwn(source, [
          'id', 'label', 'role', 'kind', 'width', 'height',
          'sourceSheetId', 'sourceSheetLabel', 'sourceSheetPath',
          'componentIndex', 'componentCount', 'crop', 'recommended',
        ]),
      },
      provenance: {
        ...(current.provenance ?? {}),
        chromeCandidateManifest: {
          schema: 'chrome-candidate-manifest-v1',
          manifestPath: CHROME_CANDIDATE_MANIFEST_SOURCE,
          generatedBy: chromeManifest.generatedBy ?? null,
        },
      },
    });
  }

  // These two direct-copy sets were intentionally omitted from the generated
  // JSON manifest even though Chrome Lab synthesized their descriptors. Rebuild
  // that deterministic registry here so no candidate loses its authoring
  // identity when Git-backed discovery is removed.
  for (const set of SYNTHESIZED_DIVIDER_SETS) {
    for (let index = 0; index < set.count; index += 1) {
      const number = String(index + 1).padStart(2, '0');
      const id = `${set.id}-${number}`;
      const sourcePath = `${CHROME_CANDIDATE_PREFIX}exploded/${set.id}/candidate-${number}.png`;
      if (sourcePathById.has(id) || candidateBySourcePath.has(sourcePath)) {
        throw new Error(`Duplicate synthesized divider candidate ${id}`);
      }
      sourcePathById.set(id, sourcePath);
      candidateBySourcePath.set(sourcePath, {
        metadata: {
          chromeCandidate: {
            id,
            label: `${set.label} ${number}`,
            role: 'divider',
            kind: 'atom',
            width: 17,
            height: 17,
            sourceSheetId: set.id,
            sourceSheetLabel: set.sourceSheetLabel,
            sourceSheetPath: set.sourceSheetPath,
            componentIndex: index,
            componentCount: set.count,
            crop: { x: 0, y: 0, w: 17, h: 17 },
            recommended: index === 0,
          },
        },
        provenance: {
          chromeCandidateManifest: {
            schema: 'chrome-candidate-runtime-synthesis-v1',
            registryPath: 'frontend/src/ui/chromeFamilyRuntime.ts',
            generatorPath: 'frontend/scripts/explode-chrome-candidate-sheets.mjs',
            sourceSetPath: set.sourceSheetPath,
          },
        },
      });
    }
  }

  const nativeIdIndex = indexUnique(nativeRailManifest.sources, (row) => row?.id, 'Native rail candidate manifest');
  const familyOwnerBySourceId = new Map();
  for (const family of familyById.values()) {
    const normalized = normalizedNativeFamily(family);
    for (const sourceId of [...normalized.horizontalSourceIds, ...normalized.verticalSourceIds]) {
      if (!nativeIdIndex.has(sourceId)) throw new Error(`Native rail family ${family.id} references missing source ${sourceId}`);
      if (familyOwnerBySourceId.has(sourceId)) throw new Error(`Native rail source ${sourceId} belongs to multiple families`);
      if (nativeIdIndex.get(sourceId).familyId !== family.id) {
        throw new Error(`Native rail source ${sourceId} does not point back to family ${family.id}`);
      }
      familyOwnerBySourceId.set(sourceId, family.id);
    }
  }
  for (const sourceId of unpairedSourceIds) {
    if (!nativeIdIndex.has(sourceId)) throw new Error(`Unpaired native rail list references missing source ${sourceId}`);
    if (familyOwnerBySourceId.has(sourceId)) throw new Error(`Native rail source ${sourceId} is both family-owned and unpaired`);
  }
  for (const source of nativeIdIndex.values()) {
    const sourcePath = sourcePathFromAssetUrl(source?.src, `Native rail candidate ${source.id}`);
    if (sourcePathById.has(source.id)) throw new Error(`Candidate id appears in both Chrome manifests: ${source.id}`);
    sourcePathById.set(source.id, sourcePath);
    const family = source.familyId ? familyById.get(source.familyId) : null;
    const unpaired = unpairedSourceIds.has(source.id);
    if (source.familyId && !family) throw new Error(`Native rail ${source.id} references missing family ${source.familyId}`);
    if (Boolean(family) === unpaired) {
      throw new Error(`Native rail ${source.id} must be either family-owned or explicitly unpaired`);
    }
    const familyEvidence = normalizedNativeFamily(family);
    if (familyEvidence) {
      const members = [...familyEvidence.horizontalSourceIds, ...familyEvidence.verticalSourceIds];
      if (!members.includes(source.id)) throw new Error(`Native rail family ${family.id} omits member ${source.id}`);
    }
    const nativeRail = pickOwn(source, [
      'id', 'label', 'familyId', 'role', 'fit', 'orientation', 'width', 'height',
      'nativeThickness', 'nativeScale', 'provider', 'attemptId', 'sourceFile', 'seam',
    ]);
    if (family?.label !== undefined) nativeRail.familyLabel = family.label;
    const current = candidateBySourcePath.get(sourcePath) ?? {};
    if (current.metadata?.nativeRail) throw new Error(`Duplicate native rail source path: ${sourcePath}`);
    candidateBySourcePath.set(sourcePath, {
      ...current,
      metadata: { ...(current.metadata ?? {}), nativeRail },
      provenance: {
        ...(current.provenance ?? {}),
        nativeRailManifest: {
          schema: 'native-rail-candidate-manifest-v1',
          manifestPath: NATIVE_RAIL_CANDIDATE_MANIFEST_SOURCE,
          familyManifestPath: NATIVE_RAIL_FAMILIES_SOURCE,
          generatedBy: nativeRailManifest.generatedBy ?? null,
          family: familyEvidence,
          unpaired,
        },
      },
      nativeEvidenceBasis: {
        sourceId: source.id,
        width: source.width,
        height: source.height,
        nativeScale: source.nativeScale,
      },
    });
  }

  const configValue = (configKey) => configKey.split('.').reduce((value, key) => value?.[key], chromeLabDefaults);
  const selectionSpecs = CHROME_DEFAULT_ACTIVATION_SPECS.map((selection) => ({ ...selection }));
  const activationsBySourcePath = new Map();
  for (const selection of selectionSpecs) {
    if (configValue(selection.configKey) !== selection.slot) {
      throw new Error(`Chrome Lab default ${selection.configKey} must select canonical slot ${selection.slot}`);
    }
    const sourcePath = sourcePathById.get(selection.sourceId)
      ?? (selection.configKey === 'divider.atomSourceId' ? dividerSourcePath(selection.sourceId) : null);
    if (!sourcePath) throw new Error(`Chrome Lab default ${selection.configKey} references unknown source ${selection.sourceId}`);
    const activation = { ...selection, sourcePath };
    const current = activationsBySourcePath.get(sourcePath) ?? [];
    current.push(activation);
    activationsBySourcePath.set(sourcePath, current);
  }
  if (new Set(selectionSpecs.map((row) => row.slot)).size !== 5) {
    throw new Error('Chrome Lab default activations must own five distinct canonical slots');
  }
  return { candidateBySourcePath, activationsBySourcePath, selections: selectionSpecs };
}

export function loadChromeCutoverContext(repoRoot = defaultRepoRoot) {
  return createChromeCutoverContext({
    chromeManifest: requiredJson(repoRoot, CHROME_CANDIDATE_MANIFEST_SOURCE),
    nativeRailManifest: requiredJson(repoRoot, NATIVE_RAIL_CANDIDATE_MANIFEST_SOURCE),
    nativeRailFamilies: requiredJson(repoRoot, NATIVE_RAIL_FAMILIES_SOURCE),
    chromeLabDefaults: requiredJson(repoRoot, CHROME_LAB_DEFAULTS_SOURCE),
  });
}

export function enrichChromeCandidateEntry(baseEntry, context) {
  if (baseEntry.migrationDisposition !== 'candidate') return baseEntry;
  const descriptor = context.candidateBySourcePath.get(baseEntry.sourcePath);
  if (!descriptor) return baseEntry;
  for (const metadata of [descriptor.metadata?.chromeCandidate, descriptor.metadata?.nativeRail].filter(Boolean)) {
    if (Number(metadata.width) !== baseEntry.width || Number(metadata.height) !== baseEntry.height) {
      throw new Error(`Chrome candidate manifest dimensions differ from tracked pixels: ${baseEntry.sourcePath}`);
    }
  }
  let nativeEvidence;
  if (descriptor.nativeEvidenceBasis) {
    if (descriptor.nativeEvidenceBasis.nativeScale !== 1) {
      throw new Error(`Native rail candidate is not recorded at native 1x: ${baseEntry.sourcePath}`);
    }
    nativeEvidence = {
      native1x: true,
      spatialResampling: false,
      sourceWidth: baseEntry.width,
      sourceHeight: baseEntry.height,
      sourceSha256: baseEntry.sha256,
      evidenceSchema: 'native-rail-candidate-manifest-v1',
      sourceManifest: NATIVE_RAIL_CANDIDATE_MANIFEST_SOURCE,
      sourceId: descriptor.nativeEvidenceBasis.sourceId,
    };
  }
  return {
    ...baseEntry,
    candidateMetadata: descriptor.metadata,
    candidateProvenance: descriptor.provenance,
    ...(nativeEvidence ? { nativeEvidence } : {}),
  };
}

export function chromeCanonicalActivations(sourcePath, baseEntry, context) {
  const selections = context.activationsBySourcePath.get(normalizeRepoPath(sourcePath)) ?? [];
  if (!selections.length) return [];
  if (baseEntry.migrationDisposition !== 'candidate' || !baseEntry.slot) {
    throw new Error(`Chrome canonical activation requires its non-active candidate slot: ${sourcePath}`);
  }
  return selections.map((selection) => ({
    ...baseEntry,
    namespace: 'runtime-chrome-default-activation',
    slot: selection.slot,
    migrationDisposition: 'legacy-bridge',
    domain: 'ui-kit',
    role: selection.role,
    availabilityPolicy: 'critical',
    activationSourceSlot: baseEntry.slot,
    chromeDefaultActivation: {
      schema: 'chrome-lab-default-activation-v1',
      configPath: CHROME_LAB_DEFAULTS_SOURCE,
      configKey: selection.configKey,
      sourceId: selection.sourceId,
      sourceSlot: baseEntry.slot,
      targetSlot: selection.slot,
    },
  }));
}

export function acceptanceContractForSlot(slot) {
  if (!WATER_SIDE_ACCEPTANCE_REQUIRED_SLOTS.includes(slot)) return null;
  return {
    mode: 'group',
    groupId: 'terrain/water/side-v1',
    requiredSlots: [...WATER_SIDE_ACCEPTANCE_REQUIRED_SLOTS],
  };
}

function includePath(relativePath, prefixes) {
  return !prefixes.length || prefixes.some((prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`));
}

/** Every retired public-asset file is migration data, including JSON reports. */
export function isCutoverSourcePath(relativePath) {
  const normalized = normalizeRepoPath(relativePath);
  return isMediaPath(normalized)
    || normalized.startsWith(CHROME_CANDIDATE_PREFIX)
    || CHROME_PRIVATE_ARCHIVE_SOURCES.has(normalized);
}

function inventorySha256(entries) {
  return sha256(Buffer.from(entries.map((entry) => [
    entry.sourcePath,
    entry.sha256,
    entry.byteLength,
    entry.mediaType,
    entry.width ?? '',
    entry.height ?? '',
    entry.slot ?? '',
    entry.domain,
    entry.role,
    entry.availabilityPolicy ?? '',
    entry.activationSourceSlot ?? '',
    entry.displacedSourcePath ?? '',
    JSON.stringify(entry.chromeDefaultActivation ?? null),
    JSON.stringify(entry.candidateMetadata ?? null),
    JSON.stringify(entry.candidateProvenance ?? null),
    JSON.stringify(entry.nativeEvidence ?? null),
    JSON.stringify(entry.acceptance ?? null),
    entry.migrationDisposition,
  ].join('\t')).join('\n'), 'utf8'));
}

export function buildMigrationInventory({
  repoRoot = defaultRepoRoot,
  prefixes = [],
  startAfter = '',
  limit = Infinity,
  canonicalGitByteReader = createCanonicalGitByteReader(repoRoot),
} = {}) {
  const commit = canonicalGitByteReader.head;
  const changedFromHead = canonicalGitByteReader.changedPaths;
  const chromeContext = loadChromeCutoverContext(repoRoot);
  const normalizedPrefixes = prefixes.map(normalizeRepoPath);
  const trackedFiles = listTrackedFiles(repoRoot).sort();
  const entries = [];
  const workingBytesBySource = new Map();
  let processedSources = 0;
  let started = !startAfter;
  for (const sourcePath of trackedFiles) {
    if (!started) {
      if (sourcePath === normalizeRepoPath(startAfter)) started = true;
      continue;
    }
    if (!isCutoverSourcePath(sourcePath) || !includePath(sourcePath, normalizedPrefixes)) continue;
    if (changedFromHead.has(sourcePath)) {
      throw new Error(`Tracked migration source differs from ${commit}: ${sourcePath}`);
    }
    const absolutePath = path.join(repoRoot, sourcePath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) continue;
    const workingBytes = fs.readFileSync(absolutePath);
    const bytes = canonicalGitByteReader.read(sourcePath, workingBytes);
    if (isMediaPath(sourcePath) && isAllowedSyntheticTestMedia(sourcePath, bytes.length)) continue;
    if (!bytes.length) throw new Error(`Refusing to migrate an empty cutover asset: ${sourcePath}`);
    if (bytes.length > MAX_API_BYTES) throw new Error(`Cutover asset exceeds the 32 MiB API limit: ${sourcePath}`);
    workingBytesBySource.set(sourcePath, {
      byteLength: workingBytes.length,
      sha256: sha256(workingBytes),
    });
    const mediaType = mediaTypeFor(sourcePath, bytes);
    const dimensions = imageDimensions(bytes, mediaType);
    const identity = migrationIdentity(sourcePath, chromeContext);
    const acceptance = identity.slot ? acceptanceContractForSlot(identity.slot) : null;
    let baseEntry = {
      sourcePath,
      ...identity,
      availabilityPolicy: identity.slot === null ? null : availabilityPolicyFor(identity.domain, identity.role),
      mediaType,
      byteLength: bytes.length,
      sha256: sha256(bytes),
      width: dimensions.width,
      height: dimensions.height,
      ...(acceptance ? { acceptance } : {}),
    };
    baseEntry = enrichChromeCandidateEntry(baseEntry, chromeContext);
    entries.push(baseEntry);
    const activationEntry = portraitCanonicalActivation(sourcePath, baseEntry);
    if (activationEntry) entries.push(activationEntry);
    entries.push(...chromeCanonicalActivations(sourcePath, baseEntry, chromeContext));
    processedSources += 1;
    if (processedSources >= limit) break;
  }
  const fullInventory = !prefixes.length && !startAfter && limit === Infinity;
  if (fullInventory) {
    const waterSideEntries = entries.filter((entry) => WATER_SIDE_ACCEPTANCE_REQUIRED_SLOTS.includes(entry.slot));
    const waterSideSlots = waterSideEntries.map((entry) => entry.slot).sort();
    if (JSON.stringify(waterSideSlots) !== JSON.stringify(WATER_SIDE_ACCEPTANCE_REQUIRED_SLOTS)
      || waterSideEntries.some((entry) => JSON.stringify(entry.acceptance) !== JSON.stringify(acceptanceContractForSlot(entry.slot)))) {
      throw new Error('Full cutover inventory must seed the exact eight-slot terrain/water/side-v1 acceptance group');
    }
    const candidateSources = entries.filter((entry) => entry.migrationDisposition === 'candidate');
    const expectedCandidateSourcePaths = [...chromeContext.candidateBySourcePath.keys()].sort();
    if (candidateSources.some((entry) => !entry.sourcePath.startsWith(CHROME_CANDIDATE_PREFIX)
      || !entry.sourcePath.toLowerCase().endsWith('.png') || entry.slot !== entry.sourcePath.slice(PUBLIC_ASSET_PREFIX.length))
      || expectedCandidateSourcePaths.some((sourcePath) => !trackedFiles.includes(sourcePath))
      || JSON.stringify(candidateSources.map((entry) => entry.sourcePath).sort()) !== JSON.stringify(expectedCandidateSourcePaths)) {
      throw new Error('Full cutover inventory contains an invalid Chrome candidate classification');
    }
    const expectedCandidateArchivePaths = trackedFiles.filter((sourcePath) => sourcePath.startsWith(CHROME_CANDIDATE_PREFIX)
      && !chromeContext.candidateBySourcePath.has(sourcePath));
    const candidateArchiveEntries = entries.filter((entry) => expectedCandidateArchivePaths.includes(entry.sourcePath));
    if (JSON.stringify(candidateArchiveEntries.map((entry) => entry.sourcePath).sort())
      !== JSON.stringify(expectedCandidateArchivePaths)
      || candidateArchiveEntries.some((entry) => entry.migrationDisposition !== 'private-archive' || entry.slot !== null)) {
      throw new Error('Full cutover inventory must privately archive unclassified Chrome pixels and all non-image data');
    }
    const reportEntries = entries.filter((entry) => entry.sourcePath.startsWith(CHROME_CANDIDATE_PREFIX)
      && entry.sourcePath.toLowerCase().endsWith('/report.json'));
    if (reportEntries.length !== CHROME_CANDIDATE_REPORT_COUNT
      || reportEntries.some((entry) => entry.migrationDisposition !== 'private-archive' || entry.slot !== null)) {
      throw new Error(`Full cutover inventory must privately archive exactly ${CHROME_CANDIDATE_REPORT_COUNT} Chrome candidate reports`);
    }
    for (const sourcePath of CHROME_PRIVATE_ARCHIVE_SOURCES) {
      const matches = entries.filter((entry) => entry.sourcePath === sourcePath);
      if (matches.length !== 1 || matches[0].migrationDisposition !== 'private-archive' || matches[0].slot !== null) {
        throw new Error(`Full cutover inventory must privately archive ${sourcePath}`);
      }
    }
    const chromeActivations = entries.filter((entry) => entry.chromeDefaultActivation);
    const expectedChromeSlots = [
      'ui/chrome/outer/atom.png', 'ui/chrome/outer/rail.png',
      'ui/chrome/inner/atom.png', 'ui/chrome/inner/rail.png',
      'ui/chrome/divider/joint.png',
    ].sort();
    if (JSON.stringify(chromeActivations.map((entry) => entry.slot).sort()) !== JSON.stringify(expectedChromeSlots)
      || chromeActivations.some((entry) => entry.migrationDisposition !== 'legacy-bridge')) {
      throw new Error('Full cutover inventory must create exactly the five Chrome Lab default canonical activations');
    }
  }
  const dispositionCounts = Object.fromEntries([...new Set(entries.map((entry) => entry.migrationDisposition))]
    .sort().map((value) => [value, entries.filter((entry) => entry.migrationDisposition === value).length]));
  const sources = new Map();
  const blobs = new Map();
  for (const entry of entries) {
    if (!sources.has(entry.sourcePath)) sources.set(entry.sourcePath, entry);
    if (!blobs.has(entry.sha256)) blobs.set(entry.sha256, entry);
  }
  const sourceEntries = [...sources.values()];
  const blobEntries = [...blobs.values()];
  const inventory = {
    schema: INVENTORY_SCHEMA,
    generatedAt: new Date().toISOString(),
    repositoryCommit: commit,
    sourceRoot: normalizeRepoPath(path.relative(repoRoot, repoRoot)) || '.',
    totals: {
      count: sourceEntries.length,
      bytes: sourceEntries.reduce((total, entry) => total + entry.byteLength, 0),
      versionCount: entries.length,
      transferBytes: entries.reduce((total, entry) => total + entry.byteLength, 0),
      activeCount: entries.filter((entry) => entry.migrationDisposition === 'legacy-bridge').length,
      candidateCount: entries.filter((entry) => entry.migrationDisposition === 'candidate').length,
      archiveCount: entries.filter((entry) => entry.migrationDisposition === 'private-archive').length,
      canonicalActivationCount: entries.filter((entry) => entry.activationSourceSlot).length,
      uniqueBlobCount: blobEntries.length,
      uniqueBlobBytes: blobEntries.reduce((total, entry) => total + entry.byteLength, 0),
      byDisposition: dispositionCounts,
    },
    inventorySha256: inventorySha256(entries),
    entries,
  };
  if (fullInventory
    && (inventory.totals.count !== FROZEN_FULL_INVENTORY.count
      || inventory.totals.bytes !== FROZEN_FULL_INVENTORY.bytes
      || inventory.totals.versionCount !== FROZEN_FULL_INVENTORY.versionCount
      || inventory.totals.activeCount !== FROZEN_FULL_INVENTORY.activeCount
      || inventory.totals.candidateCount !== FROZEN_FULL_INVENTORY.candidateCount
      || inventory.totals.archiveCount !== FROZEN_FULL_INVENTORY.archiveCount
      || inventory.totals.canonicalActivationCount !== FROZEN_FULL_INVENTORY.canonicalActivationCount
      || inventory.inventorySha256 !== FROZEN_FULL_INVENTORY.sha256)) {
    throw new Error(`Full cutover inventory no longer matches its frozen baseline: ${JSON.stringify({
      expected: FROZEN_FULL_INVENTORY,
      actual: {
        count: inventory.totals.count,
        bytes: inventory.totals.bytes,
        versionCount: inventory.totals.versionCount,
        activeCount: inventory.totals.activeCount,
        candidateCount: inventory.totals.candidateCount,
        archiveCount: inventory.totals.archiveCount,
        canonicalActivationCount: inventory.totals.canonicalActivationCount,
        sha256: inventory.inventorySha256,
      },
    })}`);
  }
  Object.defineProperty(inventory, CANONICAL_GIT_BYTE_CONTEXT, {
    value: { reader: canonicalGitByteReader, workingBytesBySource },
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return inventory;
}

function parseHeader(value) {
  const index = value.indexOf(':');
  if (index <= 0) throw new Error(`--header must be "Name: value", got: ${value}`);
  return [value.slice(0, index).trim(), value.slice(index + 1).trim()];
}

export function parseArgs(argv) {
  const options = {
    command: 'inventory', repoRoot: defaultRepoRoot, prefixes: [], startAfter: '', limit: Infinity,
    json: false, execute: false, apiBase: '',
    headers: process.env.LIVE_MEDIA_COOKIE ? { Cookie: process.env.LIVE_MEDIA_COOKIE } : {},
    immutablePrefix: '/api/media', stablePrefix: '/assets',
  };
  let index = 0;
  if (argv[0] && !argv[0].startsWith('-')) options.command = argv[index++];
  for (; index < argv.length; index += 1) {
    const value = argv[index];
    const next = () => {
      const result = argv[++index];
      if (result === undefined) throw new Error(`${value} requires a value`);
      return result;
    };
    if (value === '--repo-root') options.repoRoot = path.resolve(next());
    else if (value === '--include') options.prefixes.push(normalizeRepoPath(next()).replace(/\/$/, ''));
    else if (value === '--start-after') options.startAfter = normalizeRepoPath(next());
    else if (value === '--limit') options.limit = Number.parseInt(next(), 10);
    else if (value === '--json') options.json = true;
    else if (value === '--execute') options.execute = true;
    else if (value === '--api-base') options.apiBase = next().replace(/\/$/, '');
    else if (value === '--cookie') options.headers.Cookie = next();
    else if (value === '--header') { const [name, headerValue] = parseHeader(next()); options.headers[name] = headerValue; }
    else if (value === '--immutable-prefix') options.immutablePrefix = next();
    else if (value === '--stable-prefix') options.stablePrefix = next();
    else throw new Error(`Unknown option: ${value}`);
  }
  if (!['inventory', 'upload'].includes(options.command)) throw new Error(`Unknown command: ${options.command}`);
  if (options.limit !== Infinity && (!Number.isSafeInteger(options.limit) || options.limit < 1)) {
    throw new Error('--limit must be a positive integer');
  }
  if (options.execute && options.command !== 'upload') throw new Error('--execute is valid only with upload');
  if (options.execute && !options.apiBase) throw new Error('--execute requires --api-base');
  return options;
}

function createPayload(entry, inventory, options) {
  const candidateLabel = entry.candidateMetadata?.chromeCandidate?.label
    ?? entry.candidateMetadata?.nativeRail?.label;
  const payload = {
    slot: entry.slot,
    domain: entry.domain,
    role: entry.role,
    label: candidateLabel || `ADR-0085 Git cutover: ${entry.sourcePath}`,
    metadata: {
      ...(entry.candidateMetadata ?? {}),
      migrationDisposition: entry.migrationDisposition,
      originalRepositoryPath: entry.sourcePath,
      mediaType: entry.mediaType,
      byteLength: entry.byteLength,
      width: entry.width,
      height: entry.height,
    },
    provenance: {
      ...(entry.candidateProvenance ?? {}),
      migration: {
        kind: 'git-media-cutover',
        namespace: entry.namespace,
        repositoryCommit: inventory.repositoryCommit,
        originalRepositoryPath: entry.sourcePath,
        sha256: entry.sha256,
        byteExact: true,
      },
    },
  };
  if (entry.activationSourceSlot) {
    payload.metadata.activationSourceSlot = entry.activationSourceSlot;
    payload.metadata.displacedSourcePath = entry.displacedSourcePath;
    payload.provenance.migration.activationSourceSlot = entry.activationSourceSlot;
    payload.provenance.migration.displacedSourcePath = entry.displacedSourcePath;
  }
  if (entry.chromeDefaultActivation) {
    payload.metadata.chromeDefaultActivation = entry.chromeDefaultActivation;
    payload.provenance.migration.chromeDefaultActivation = entry.chromeDefaultActivation;
  }
  if (entry.acceptance) payload.slotMetadata = { acceptance: entry.acceptance };
  if (entry.slot) payload.provenance.migration.targetSlot = entry.slot;
  payload.sourcePath = entry.sourcePath;
  if (entry.slot !== null) payload.availabilityPolicy = entry.availabilityPolicy;
  if (entry.nativeEvidence) payload.nativeEvidence = entry.nativeEvidence;
  return payload;
}

function migrationKey(repositoryCommit, sourcePath, namespace, slot) {
  return `${repositoryCommit}\0${sourcePath}\0${namespace}\0${slot ?? '<private>'}`;
}

export function migrationIdempotencyKey(entry, inventory) {
  return `adr0085-${sha256Text(migrationKey(
    inventory.repositoryCommit, entry.sourcePath, entry.namespace, entry.slot,
  )).slice(0, 48)}`;
}

export function existingMigrationIndex(catalog) {
  const result = new Map();
  for (const version of catalog.versions) {
    const migration = version?.provenance?.migration;
    if (migration?.kind !== 'git-media-cutover' || !migration.repositoryCommit || !migration.originalRepositoryPath) continue;
    if (!migration.namespace) throw new Error(`Git cutover version ${version.id} is missing migration.namespace`);
    const key = migrationKey(
      migration.repositoryCommit, migration.originalRepositoryPath, migration.namespace, version.slot ?? null,
    );
    if (result.has(key)) {
      throw new Error(`Duplicate Git cutover versions already exist for ${migration.originalRepositoryPath} -> ${version.slot ?? '<private>'} at ${migration.repositoryCommit}`);
    }
    result.set(key, version);
  }
  return result;
}

export function assertExistingMatches(entry, inventory, version, slotRecord = null) {
  const migration = version?.provenance?.migration;
  const expectedSourcePath = entry.sourcePath;
  const mismatches = [];
  if (migration?.kind !== 'git-media-cutover') mismatches.push('migration.kind');
  if (migration?.namespace !== entry.namespace) mismatches.push('migration.namespace');
  if (migration?.repositoryCommit !== inventory.repositoryCommit) mismatches.push('repositoryCommit');
  if (migration?.originalRepositoryPath !== entry.sourcePath) mismatches.push('originalRepositoryPath');
  if (migration?.sha256 !== entry.sha256) mismatches.push('sha256');
  if ((version.slot ?? null) !== entry.slot) mismatches.push('slot');
  if ((version.sourcePath ?? null) !== expectedSourcePath) mismatches.push('sourcePath');
  if (version.domain !== entry.domain) mismatches.push('domain');
  if (version.role !== entry.role) mismatches.push('role');
  if ((version.metadata?.activationSourceSlot ?? null) !== (entry.activationSourceSlot ?? null)) mismatches.push('metadata.activationSourceSlot');
  if ((version.metadata?.displacedSourcePath ?? null) !== (entry.displacedSourcePath ?? null)) mismatches.push('metadata.displacedSourcePath');
  if ((migration?.activationSourceSlot ?? null) !== (entry.activationSourceSlot ?? null)) mismatches.push('migration.activationSourceSlot');
  if ((migration?.displacedSourcePath ?? null) !== (entry.displacedSourcePath ?? null)) mismatches.push('migration.displacedSourcePath');
  if (JSON.stringify(version.metadata?.chromeDefaultActivation ?? null)
    !== JSON.stringify(entry.chromeDefaultActivation ?? null)) mismatches.push('metadata.chromeDefaultActivation');
  if (JSON.stringify(migration?.chromeDefaultActivation ?? null)
    !== JSON.stringify(entry.chromeDefaultActivation ?? null)) mismatches.push('migration.chromeDefaultActivation');
  for (const key of ['chromeCandidate', 'nativeRail']) {
    if (JSON.stringify(version.metadata?.[key] ?? null) !== JSON.stringify(entry.candidateMetadata?.[key] ?? null)) {
      mismatches.push(`metadata.${key}`);
    }
  }
  for (const key of ['chromeCandidateManifest', 'nativeRailManifest']) {
    if (JSON.stringify(version.provenance?.[key] ?? null) !== JSON.stringify(entry.candidateProvenance?.[key] ?? null)) {
      mismatches.push(`provenance.${key}`);
    }
  }
  if (entry.nativeEvidence
    && JSON.stringify(version.nativeEvidence ?? null) !== JSON.stringify(entry.nativeEvidence)) mismatches.push('nativeEvidence');
  if (JSON.stringify(slotRecord?.metadata?.acceptance ?? null) !== JSON.stringify(entry.acceptance ?? null)) {
    mismatches.push('slotMetadata.acceptance');
  }
  if (version.media) {
    if (version.media.sha256 !== entry.sha256) mismatches.push('media.sha256');
    if (Number(version.media.byteLength) !== entry.byteLength) mismatches.push('media.byteLength');
    if (version.media.mediaType !== entry.mediaType) mismatches.push('media.mediaType');
    if ((version.media.width ?? null) !== entry.width) mismatches.push('media.width');
    if ((version.media.height ?? null) !== entry.height) mismatches.push('media.height');
  }
  if (mismatches.length) throw new Error(`Existing migration version mismatches ${entry.sourcePath}: ${mismatches.join(', ')}`);
}

function activeSlotConflict(entry, catalog, existing) {
  if (entry.slot === null) return null;
  const slot = catalog.slots.find((candidate) => candidate.slot === entry.slot);
  if (!slot?.activeVersionId) return null;
  if (existing && String(slot.activeVersionId) === String(existing.id)) return null;
  return slot;
}

async function verifyEntryUrl(client, url, entry) {
  return client.verifyMedia({ url, sha256: entry.sha256, byteLength: entry.byteLength, mediaType: entry.mediaType });
}

async function postMigrationAction(client, routeTemplate, id, body, operation) {
  const route = routeTemplate.replaceAll('{id}', encodeURIComponent(id));
  const result = await client.request(route, {
    method: 'POST',
    headers: { ...client.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'manual',
  }, operation);
  const row = mediaVersionFrom(result.body);
  const revision = Number(row?.rowRevision);
  if (!row?.id || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error(`${operation} did not return a media version revision`);
  }
  return { ...result, row, revision };
}

async function verifyFinalEntry(client, entry, version, options, reused, uploadedVerification = null) {
  const expectedStatus = ({
    'legacy-bridge': 'legacy-bridge',
    'private-archive': 'archived',
    candidate: 'candidate',
  })[entry.migrationDisposition];
  if (!expectedStatus) throw new Error(`Unsupported migration disposition ${entry.migrationDisposition}: ${entry.sourcePath}`);
  if (version.status !== expectedStatus) {
    throw new Error(`Migration may only finish as ${expectedStatus}, got ${version.status}: ${entry.sourcePath}`);
  }
  if (!version.media?.url) throw new Error(`Final media URL is missing for ${entry.sourcePath}`);
  if (version.status === 'legacy-bridge' && version.media.url !== `${options.immutablePrefix}/${entry.sha256}`) {
    throw new Error(`Active version did not resolve to its immutable content route: ${entry.sourcePath}`);
  }
  const finalMediaVerification = entry.migrationDisposition === 'candidate' && uploadedVerification
    ? uploadedVerification
    : await verifyEntryUrl(client, version.media.url, entry);
  return {
    sourcePath: entry.sourcePath,
    slot: entry.slot,
    id: String(version.id),
    action: entry.migrationDisposition,
    revision: Number(version.rowRevision),
    reused,
    uploadedVerification: uploadedVerification || finalMediaVerification,
    immutable: finalMediaVerification,
    // Stable routes are deliberately verified only after the entire inventory
    // has converged. Checking one here would make the first member of a required
    // group render the public catalog intentionally incomplete, and remapped
    // slots cannot be proven against the packaged pre-cutover namespace.
    stable: null,
  };
}

export async function verifyStableMigrationResults(entries, results, options, client) {
  if (!Array.isArray(entries) || !Array.isArray(results) || entries.length !== results.length) {
    throw new Error('Stable migration verification requires one result for every inventory entry');
  }
  const completed = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const result = results[index];
    if (result.sourcePath !== entry.sourcePath || (result.slot ?? null) !== (entry.slot ?? null)) {
      throw new Error(`Migration result order differs from inventory at index ${index}`);
    }
    if (entry.migrationDisposition !== 'legacy-bridge') {
      completed.push(result);
      continue;
    }
    const encodedSlot = entry.slot.split('/').map(encodeURIComponent).join('/');
    const stable = await verifyEntryUrl(client, `${options.stablePrefix}/${encodedSlot}`, entry);
    completed.push({ ...result, stable });
  }
  return completed;
}

function migrationSourceBytes(entry, inventory, options) {
  const absolutePath = path.join(options.repoRoot, entry.sourcePath);
  const workingBytes = fs.readFileSync(absolutePath);
  const context = inventory?.[CANONICAL_GIT_BYTE_CONTEXT] ?? null;
  if (!context) return workingBytes;
  if (context.reader.head !== inventory.repositoryCommit) {
    throw new Error(`Canonical Git reader HEAD differs from inventory commit: ${entry.sourcePath}`);
  }
  const observed = context.workingBytesBySource.get(entry.sourcePath);
  if (!observed) throw new Error(`Canonical Git byte snapshot is missing source: ${entry.sourcePath}`);
  if (workingBytes.length !== observed.byteLength || sha256(workingBytes) !== observed.sha256) {
    throw new Error(`Tracked migration source changed after inventory: ${entry.sourcePath}`);
  }
  if (context.reader.changedPaths.has(entry.sourcePath)) {
    throw new Error(`Tracked migration source differs from ${inventory.repositoryCommit}: ${entry.sourcePath}`);
  }
  return context.reader.read(entry.sourcePath, workingBytes);
}

export async function migrateEntry(entry, inventory, options, client, catalog, existing) {
  if (!['legacy-bridge', 'private-archive', 'candidate'].includes(entry.migrationDisposition)) {
    throw new Error(`Unsupported migration disposition ${entry.migrationDisposition}: ${entry.sourcePath}`);
  }
  const bytes = migrationSourceBytes(entry, inventory, options);
  if (bytes.length !== entry.byteLength || sha256(bytes) !== entry.sha256) {
    throw new Error(`Local bytes changed after inventory: ${entry.sourcePath}`);
  }
  if (existing) {
    const slotRecord = entry.slot === null ? null : catalog.slots.find((candidate) => candidate.slot === entry.slot) ?? null;
    assertExistingMatches(entry, inventory, existing, slotRecord);
  }
  const conflict = activeSlotConflict(entry, catalog, existing);
  if (conflict) {
    throw new Error(`Stable slot ${entry.slot} is already active at version ${conflict.activeVersionId}; refusing to overwrite it`);
  }

  const finalStatus = ({ 'legacy-bridge': 'legacy-bridge', 'private-archive': 'archived', candidate: 'candidate' })[
    entry.migrationDisposition
  ];
  if (existing && existing.status === finalStatus
    && (entry.migrationDisposition !== 'candidate' || existing.media)) {
    return verifyFinalEntry(client, entry, existing, options, true);
  }
  if (existing && existing.status !== 'candidate') {
    throw new Error(`Existing migration version ${existing.id} has non-resumable status ${existing.status} for ${entry.sourcePath}`);
  }

  let id;
  let revision;
  let current = existing;
  if (existing) {
    id = String(existing.id);
    revision = Number(existing.rowRevision);
  } else {
    const created = await client.createVersion(createPayload(entry, inventory, options), {
      idempotencyKey: migrationIdempotencyKey(entry, inventory),
    });
    id = created.id;
    revision = created.revision;
    current = created.row;
  }

  if (current.status !== 'candidate') {
    throw new Error(`Importer may only mutate a candidate, got ${current.status}: ${entry.sourcePath}`);
  }
  if (!current.media) {
    const uploaded = await client.uploadContent({ id, revision, bytes, mediaType: entry.mediaType });
    revision = uploaded.revision;
    current = uploaded.row;
  }
  if (current.status !== 'candidate') {
    throw new Error(`Upload changed migration version to forbidden status ${current.status}: ${entry.sourcePath}`);
  }
  const currentMedia = current.media ?? mediaRecordFrom(current);
  if (!currentMedia?.url || currentMedia.sha256 !== entry.sha256) {
    throw new Error(`Uploaded media response is incomplete or hash-mismatched for ${entry.sourcePath}`);
  }
  const uploadedVerification = await verifyEntryUrl(client, currentMedia.url, entry);
  if (entry.migrationDisposition === 'candidate') {
    return verifyFinalEntry(client, entry, current, options, false, uploadedVerification);
  }
  let actionResult;
  if (entry.migrationDisposition === 'legacy-bridge') {
    actionResult = await postMigrationAction(
      client,
      BRIDGE_PATH, id, { expectedRevision: revision }, `bridge ${entry.sourcePath}`,
    );
  } else {
    actionResult = await postMigrationAction(
      client,
      ARCHIVE_PATH, id, {
        expectedRevision: revision,
        reason: 'ADR-0085 private source/review archive; not a runtime semantic slot',
        evidence: {
          schema: 'adr-0085-private-archive-v1',
          repositoryCommit: inventory.repositoryCommit,
          sourcePath: entry.sourcePath,
          sha256: entry.sha256,
        },
      }, `archive ${entry.sourcePath}`,
    );
  }
  return verifyFinalEntry(client, entry, actionResult.row, options, false, uploadedVerification);
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const inventory = buildMigrationInventory(options);
  if (options.command === 'inventory') {
    if (options.json) console.log(JSON.stringify(inventory, null, 2));
    else console.log(JSON.stringify({ schema: inventory.schema, repositoryCommit: inventory.repositoryCommit, totals: inventory.totals }, null, 2));
    return;
  }

  const plan = inventory.entries.map((entry) => ({
    sourcePath: entry.sourcePath,
    slot: entry.slot,
    sha256: entry.sha256,
    action: entry.migrationDisposition,
  }));
  if (!options.execute) {
    const output = { dryRun: true, schema: inventory.schema, repositoryCommit: inventory.repositoryCommit, totals: inventory.totals, plan };
    console.log(JSON.stringify(options.json ? output : { ...output, plan: plan.slice(0, 25), omittedPlanEntries: Math.max(0, plan.length - 25) }, null, 2));
    return;
  }

  const client = new LiveMediaAdminClient({
    apiBase: options.apiBase,
    headers: options.headers,
    paths: {
      adminCatalog: ADMIN_CATALOG_PATH,
      create: CREATE_PATH,
      content: CONTENT_PATH,
    },
  });
  const catalog = await client.adminCatalog();
  const existingByMigration = existingMigrationIndex(catalog);
  let results = [];
  for (let index = 0; index < inventory.entries.length; index += 1) {
    const entry = inventory.entries[index];
    console.error(`[${index + 1}/${inventory.entries.length}] ${entry.sourcePath}`);
    const existing = existingByMigration.get(migrationKey(
      inventory.repositoryCommit, entry.sourcePath, entry.namespace, entry.slot,
    )) ?? null;
    const result = await migrateEntry(entry, inventory, options, client, catalog, existing);
    results.push(result);
    console.error(JSON.stringify({ migrationProgress: index + 1, total: inventory.entries.length, result }));
  }
  // Required groups and canonical remaps are now complete, so the public
  // catalog can resolve every semantic route without a partial-state failure.
  results = await verifyStableMigrationResults(inventory.entries, results, options, client);
  console.log(JSON.stringify({
    schema: 'adr-0085-media-migration-result-v1',
    repositoryCommit: inventory.repositoryCommit,
    migratedAt: new Date().toISOString(),
    totals: inventory.totals,
    results,
  }, null, 2));
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) run().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
