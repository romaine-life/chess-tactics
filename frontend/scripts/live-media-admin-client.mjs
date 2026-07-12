// Canonical Node/tooling client for archiving exact source bytes and creating
// live-media candidates. Its supported CLI deliberately stops at private source
// archival or candidate upload: it cannot manufacture owner review, accept a
// version, or activate a legacy bridge.
// Generators should write only to a temporary/ignored work directory, then call
// this client with that file as the upload source.
// Set LIVE_MEDIA_COOKIE for CLI authentication; --cookie exists for controlled
// local use but exposes its value in the process list.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DEFAULT_PATHS = {
  adminCatalog: '/api/admin/media-assets',
  create: '/api/admin/media-versions',
  content: '/api/admin/media-versions/{id}/content',
  archive: '/api/admin/media-versions/{id}/archive',
};
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');
const CANDIDATE_BATCH_SCHEMA = 'live-media-candidate-batch-v1';
const CANDIDATE_BATCH_RESULT_SCHEMA = 'live-media-candidate-batch-result-v1';
const BATCH_PROVENANCE_SCHEMA = 'live-media-candidate-batch-provenance-v1';
const BATCH_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,119}$/;

const MEDIA_TYPES = new Map(Object.entries({
  '.aac': 'audio/aac', '.avif': 'image/avif', '.bmp': 'image/bmp', '.eot': 'application/vnd.ms-fontobject',
  '.flac': 'audio/flac', '.gif': 'image/gif', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.heic': 'image/heic', '.heif': 'image/heif', '.ico': 'image/x-icon', '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg', '.json': 'application/json', '.m4a': 'audio/mp4', '.m4v': 'video/mp4',
  '.md': 'text/markdown', '.mid': 'audio/midi', '.midi': 'audio/midi', '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg', '.ogv': 'video/ogg', '.otf': 'font/otf', '.pdf': 'application/pdf',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.tif': 'image/tiff', '.tiff': 'image/tiff',
  '.ttf': 'font/ttf', '.txt': 'text/plain', '.wav': 'audio/wav', '.webm': 'video/webm',
  '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
}));

export function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function mediaTypeFromPath(filePath) {
  return MEDIA_TYPES.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream';
}

export function mediaTypeFromBytes(filePath, bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp'
    && /^(?:avif|avis)$/.test(bytes.toString('ascii', 8, 12))) return 'image/avif';
  if (bytes.subarray(0, 512).toString('utf8').trimStart().startsWith('<svg')) return 'image/svg+xml';
  return mediaTypeFromPath(filePath);
}

export function mediaVersionFrom(body) {
  return body?.version ?? body?.mediaVersion ?? body?.media_version ?? body;
}

export function mediaRecordFrom(body) {
  const row = mediaVersionFrom(body);
  return row?.media ?? body?.media ?? null;
}

function parseResponseRevision(response, body, operation) {
  const row = mediaVersionFrom(body);
  const value = row?.revision ?? row?.rowRevision ?? row?.row_revision;
  if (Number.isSafeInteger(Number(value)) && Number(value) >= 0) return Number(value);
  const etag = response.headers.get('etag')?.match(/^(?:W\/)?"?(\d+)"?$/)?.[1];
  if (etag !== undefined) return Number(etag);
  throw new Error(`${operation} did not return a row revision`);
}

async function decodeBody(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export class LiveMediaAdminClient {
  constructor({ apiBase, headers = {}, fetchImpl = globalThis.fetch, paths = {} }) {
    if (!apiBase) throw new Error('LiveMediaAdminClient requires apiBase');
    if (typeof fetchImpl !== 'function') throw new Error('LiveMediaAdminClient requires fetch');
    const parsedBase = new URL(apiBase);
    const loopback = parsedBase.hostname === 'localhost' || parsedBase.hostname === '[::1]'
      || /^127(?:\.\d{1,3}){3}$/.test(parsedBase.hostname);
    if (parsedBase.protocol !== 'https:' && !(parsedBase.protocol === 'http:' && loopback)) {
      throw new Error('Live media admin API must use HTTPS except on loopback');
    }
    if (parsedBase.username || parsedBase.password) throw new Error('Do not embed credentials in apiBase');
    this.apiBase = parsedBase.toString().replace(/\/$/, '');
    this.headers = { ...headers };
    this.fetchImpl = fetchImpl;
    this.paths = { ...DEFAULT_PATHS, ...paths };
  }

  url(template, values = {}) {
    let route = template;
    for (const [name, value] of Object.entries(values)) route = route.replaceAll(`{${name}}`, encodeURIComponent(value));
    return new URL(route, `${this.apiBase}/`).toString();
  }

  async request(route, init, operation) {
    const response = await this.fetchImpl(this.url(route), init);
    const body = await decodeBody(response);
    if (!response.ok) throw new Error(`${operation} failed (${response.status}): ${JSON.stringify(body)}`);
    return { response, body };
  }

  async adminCatalog() {
    const { body } = await this.request(this.paths.adminCatalog, {
      method: 'GET', headers: this.headers, redirect: 'manual',
    }, 'read admin media catalog');
    if (!body || !Array.isArray(body.slots) || !Array.isArray(body.versions)) {
      throw new Error('Admin media catalog response is missing slots/versions');
    }
    return body;
  }

  async createVersion(payload, { idempotencyKey = '' } = {}) {
    const headers = { ...this.headers, 'Content-Type': 'application/json' };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const result = await this.request(this.paths.create, {
      method: 'POST', headers, body: JSON.stringify(payload), redirect: 'manual',
    }, 'create media version');
    const row = mediaVersionFrom(result.body);
    if (!row?.id) throw new Error('Create response did not return a version id');
    return { ...result, row, id: String(row.id), revision: parseResponseRevision(result.response, result.body, 'create') };
  }

  async uploadContent({ id, revision, bytes, mediaType }) {
    if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error('uploadContent requires non-empty Buffer bytes');
    const route = this.paths.content.replaceAll('{id}', encodeURIComponent(id));
    const result = await this.request(route, {
      method: 'PUT',
      headers: { ...this.headers, 'Content-Type': mediaType, 'If-Match': `"${revision}"` },
      body: bytes,
      redirect: 'manual',
    }, 'upload media content');
    const row = mediaVersionFrom(result.body);
    return { ...result, row, revision: parseResponseRevision(result.response, result.body, 'upload') };
  }

  async archiveVersion({ id, revision, reason, evidence }) {
    if (!reason || !evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
      throw new Error('archiveVersion requires a reason and structured evidence');
    }
    const route = this.paths.archive.replaceAll('{id}', encodeURIComponent(id));
    const result = await this.request(route, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json', 'If-Match': `"${revision}"` },
      body: JSON.stringify({ expectedRevision: revision, reason, evidence }),
      redirect: 'manual',
    }, 'archive media version');
    const row = mediaVersionFrom(result.body);
    return { ...result, row, revision: parseResponseRevision(result.response, result.body, 'archive') };
  }

  async downloadVerifiedMedia({ url, sha256, byteLength, mediaType }) {
    const response = await this.fetchImpl(this.url(url), { method: 'GET', headers: this.headers, redirect: 'follow' });
    if (!response.ok) throw new Error(`Media verification failed (${response.status}) for ${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const actualHash = sha256Bytes(bytes);
    if (actualHash !== sha256 || bytes.length !== byteLength) {
      throw new Error(`Media verification mismatch: ${actualHash}/${bytes.length} != ${sha256}/${byteLength}`);
    }
    const actualType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || null;
    if (actualType && actualType !== 'application/octet-stream' && actualType !== mediaType) {
      throw new Error(`Media type mismatch: ${actualType} != ${mediaType}`);
    }
    return {
      bytes,
      verification: { sha256: actualHash, byteLength: bytes.length, mediaType: actualType, url: response.url },
    };
  }

  async verifyMedia(expected) {
    const result = await this.downloadVerifiedMedia(expected);
    return result.verification;
  }
}

function exactUploadedMedia(row, expected, operation) {
  const media = mediaRecordFrom(row);
  if (!media?.url) throw new Error(`${operation} did not include an admin media URL`);
  const mismatches = [];
  if (media.sha256 !== expected.sha256) mismatches.push('sha256');
  if (Number(media.byteLength) !== expected.byteLength) mismatches.push('byteLength');
  if (media.mediaType !== expected.mediaType) mismatches.push('mediaType');
  if (mismatches.length) throw new Error(`${operation} media differs from local bytes: ${mismatches.join(', ')}`);
  return media;
}

export async function uploadCandidateBytes({
  client,
  payload,
  bytes,
  mediaType,
  idempotencyKey = '',
  resumableStatuses = ['candidate'],
}) {
  if (!(client instanceof LiveMediaAdminClient)) throw new Error('uploadCandidateBytes requires LiveMediaAdminClient');
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new Error('uploadCandidateBytes requires payload');
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error('uploadCandidateBytes requires non-empty Buffer bytes');
  const magicMediaType = mediaTypeFromBytes('', bytes);
  if (magicMediaType.startsWith('image/') && mediaType !== magicMediaType) {
    throw new Error(`Declared media type ${mediaType} conflicts with image content magic ${magicMediaType}`);
  }
  const expected = { sha256: sha256Bytes(bytes), byteLength: bytes.length, mediaType };
  const created = await client.createVersion(payload, { idempotencyKey });
  const status = created.row?.status || 'candidate';
  if (!resumableStatuses.includes(status)) {
    throw new Error(`Idempotent media version has non-resumable status ${status}`);
  }
  const existingMedia = mediaRecordFrom(created.row);
  if (existingMedia) {
    const media = exactUploadedMedia(created.row, expected, 'Idempotent replay');
    const verification = await client.verifyMedia({ url: media.url, ...expected });
    return {
      id: created.id,
      revision: created.revision,
      row: created.row,
      media,
      verification,
      reused: true,
    };
  }
  if (status !== 'candidate') throw new Error(`Media version ${created.id} has no content in status ${status}`);
  const uploaded = await client.uploadContent({ id: created.id, revision: created.revision, bytes, mediaType });
  if (uploaded.row?.status && uploaded.row.status !== 'candidate') {
    throw new Error(`Upload unexpectedly changed media version to ${uploaded.row.status}`);
  }
  const media = exactUploadedMedia(uploaded.row ?? uploaded.body, expected, 'Upload response');
  const verification = await client.verifyMedia({ url: media.url, ...expected });
  return {
    id: created.id,
    revision: uploaded.revision,
    row: uploaded.row,
    media,
    verification,
    reused: Boolean(created.body?.idempotentReplay),
  };
}

/** Source binaries are durable private archived versions, never loose local files. */
export async function archiveSourceBytes({
  client,
  payload,
  bytes,
  mediaType,
  idempotencyKey = '',
  reason,
  evidence,
}) {
  if (payload?.slot) throw new Error('archiveSourceBytes accepts private source versions only');
  if (!payload?.sourcePath || payload.role !== 'source') {
    throw new Error('archiveSourceBytes requires sourcePath and role=source');
  }
  const uploaded = await uploadCandidateBytes({
    client,
    payload,
    bytes,
    mediaType,
    idempotencyKey,
    resumableStatuses: ['candidate', 'archived'],
  });
  if (uploaded.row?.status === 'archived') {
    return { ...uploaded, archived: uploaded.row, revision: uploaded.revision, reused: true };
  }
  const archived = await client.archiveVersion({
    id: uploaded.id,
    revision: uploaded.revision,
    reason,
    evidence: { ...evidence, contentSha256: uploaded.verification.sha256 },
  });
  if (archived.row?.status !== 'archived') throw new Error('Backend did not archive the source version');
  return { ...uploaded, archived: archived.row, revision: archived.revision };
}

export function latestArchivedSourceVersion(catalog, sourcePath, domain = '') {
  const candidates = catalog.versions.filter((version) => version.sourcePath === sourcePath
    && version.status === 'archived'
    && version.role === 'source'
    && version.media?.url
    && (!domain || version.domain === domain));
  if (!candidates.length) throw new Error(`No archived source media exists for exact sourcePath: ${sourcePath}`);
  const ordered = candidates.map((version) => ({ version, timestamp: Date.parse(version.updatedAt) }))
    .sort((left, right) => right.timestamp - left.timestamp);
  if (!Number.isFinite(ordered[0].timestamp)) throw new Error(`Archived source has no valid updatedAt: ${sourcePath}`);
  if (ordered.length > 1 && ordered[0].timestamp === ordered[1].timestamp) {
    throw new Error(`Latest archived source is ambiguous for sourcePath: ${sourcePath}`);
  }
  return ordered[0].version;
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function deterministicIdempotencyKey(prefix, value) {
  const digest = sha256Bytes(Buffer.from(canonicalJson(value), 'utf8'));
  return `${prefix}-${digest.slice(0, 56)}`;
}

function manifestText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function manifestObject(value, label, { required = false } = {}) {
  if (value === undefined && !required) return {};
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${label} must be an object`);
  if (required && !Object.keys(value).length) throw new Error(`${label} must not be empty`);
  return value;
}

function manifestFile(baseDir, value, label) {
  const filePath = path.resolve(baseDir, manifestText(value, label));
  let stat;
  try { stat = fs.statSync(filePath); } catch { throw new Error(`${label} does not exist: ${filePath}`); }
  if (!stat.isFile()) throw new Error(`${label} is not a file: ${filePath}`);
  return filePath;
}

function normalizeBatchManifest(raw, manifestPath) {
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') throw new Error('Candidate batch manifest must be an object');
  if (raw.schema !== CANDIDATE_BATCH_SCHEMA) throw new Error(`Unsupported candidate batch schema: ${raw.schema}`);
  const batchId = manifestText(raw.batchId, 'batchId');
  if (!BATCH_ID_PATTERN.test(batchId)) throw new Error('batchId contains unsupported characters');
  const sourceRows = raw.sources === undefined ? [] : raw.sources;
  const candidateRows = raw.candidates;
  if (!Array.isArray(sourceRows)) throw new Error('sources must be an array');
  if (!Array.isArray(candidateRows) || !candidateRows.length) throw new Error('candidates must be a non-empty array');
  if (sourceRows.length + candidateRows.length > 1000) throw new Error('Candidate batch exceeds 1000 entries');
  const baseDir = path.dirname(manifestPath);
  const ids = new Set();
  const normalizeId = (value, label) => {
    const id = manifestText(value, label);
    if (!BATCH_ID_PATTERN.test(id)) throw new Error(`${label} contains unsupported characters`);
    if (ids.has(id)) throw new Error(`Duplicate candidate batch id: ${id}`);
    ids.add(id);
    return id;
  };
  const sources = sourceRows.map((row, index) => {
    const label = `sources[${index}]`;
    if (!row || Array.isArray(row) || typeof row !== 'object') throw new Error(`${label} must be an object`);
    return {
      id: normalizeId(row.id, `${label}.id`),
      filePath: manifestFile(baseDir, row.file, `${label}.file`),
      sourcePath: manifestText(row.sourcePath, `${label}.sourcePath`),
      domain: manifestText(row.domain, `${label}.domain`),
      label: manifestText(row.label, `${label}.label`),
      mediaType: row.mediaType ? manifestText(row.mediaType, `${label}.mediaType`) : '',
      metadata: manifestObject(row.metadata, `${label}.metadata`),
      provenance: manifestObject(row.provenance, `${label}.provenance`),
      reason: manifestText(row.reason, `${label}.reason`),
      evidence: manifestObject(row.evidence, `${label}.evidence`, { required: true }),
    };
  });
  const sourceIds = new Set(sources.map((entry) => entry.id));
  const candidates = candidateRows.map((row, index) => {
    const label = `candidates[${index}]`;
    if (!row || Array.isArray(row) || typeof row !== 'object') throw new Error(`${label} must be an object`);
    const refs = row.sourceIds === undefined ? [] : row.sourceIds;
    if (!Array.isArray(refs) || refs.some((id) => typeof id !== 'string' || !id.trim())) {
      throw new Error(`${label}.sourceIds must be an array of source ids`);
    }
    const normalizedRefs = refs.map((id) => id.trim());
    if (new Set(normalizedRefs).size !== normalizedRefs.length) throw new Error(`${label}.sourceIds contains duplicates`);
    for (const sourceId of normalizedRefs) {
      if (!sourceIds.has(sourceId)) throw new Error(`${label}.sourceIds references unknown source ${sourceId}`);
    }
    const availabilityPolicy = row.availabilityPolicy === undefined
      ? '' : manifestText(row.availabilityPolicy, `${label}.availabilityPolicy`);
    if (availabilityPolicy && !['critical', 'decorative'].includes(availabilityPolicy)) {
      throw new Error(`${label}.availabilityPolicy must be critical or decorative`);
    }
    const role = manifestText(row.role, `${label}.role`);
    if (role === 'source') throw new Error(`${label}.role=source belongs in the archived sources array`);
    return {
      id: normalizeId(row.id, `${label}.id`),
      filePath: manifestFile(baseDir, row.file, `${label}.file`),
      slot: manifestText(row.slot, `${label}.slot`),
      domain: manifestText(row.domain, `${label}.domain`),
      role,
      label: manifestText(row.label, `${label}.label`),
      availabilityPolicy,
      mediaType: row.mediaType ? manifestText(row.mediaType, `${label}.mediaType`) : '',
      metadata: manifestObject(row.metadata, `${label}.metadata`),
      provenance: manifestObject(row.provenance, `${label}.provenance`),
      nativeEvidence: manifestObject(row.nativeEvidence, `${label}.nativeEvidence`),
      slotMetadata: row.slotMetadata === undefined ? null : manifestObject(row.slotMetadata, `${label}.slotMetadata`),
      sourceIds: normalizedRefs,
    };
  });
  return { schema: CANDIDATE_BATCH_SCHEMA, batchId, manifestPath, sources, candidates };
}

export function readCandidateBatchManifest(filename) {
  const requested = path.resolve(filename);
  const manifestPath = fs.realpathSync(requested);
  const actualRepoRoot = fs.realpathSync(repoRoot);
  if (isWithin(actualRepoRoot, manifestPath)) {
    throw new Error('Candidate batch manifest must live outside the Git repository');
  }
  return normalizeBatchManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), manifestPath);
}

function batchMediaReport(entry, result, idempotencyKey, extra = {}) {
  return {
    id: entry.id,
    versionId: result.id,
    revision: result.revision,
    sha256: result.verification.sha256,
    byteLength: result.verification.byteLength,
    mediaType: result.media.mediaType,
    idempotencyKey,
    reused: Boolean(result.reused),
    ...extra,
  };
}

export async function uploadCandidateBatch({ client, manifest }) {
  if (!(client instanceof LiveMediaAdminClient)) throw new Error('uploadCandidateBatch requires LiveMediaAdminClient');
  if (!manifest || manifest.schema !== CANDIDATE_BATCH_SCHEMA) {
    throw new Error('uploadCandidateBatch requires a validated candidate batch manifest');
  }
  const sourceReports = [];
  const sourceReportById = new Map();
  for (const source of manifest.sources) {
    const bytes = fs.readFileSync(source.filePath);
    if (!bytes.length) throw new Error(`Refusing to archive empty source file: ${source.filePath}`);
    const mediaType = source.mediaType || mediaTypeFromBytes(source.filePath, bytes);
    const contentSha256 = sha256Bytes(bytes);
    const archiveEvidenceSha256 = sha256Bytes(Buffer.from(canonicalJson({
      reason: source.reason,
      evidence: source.evidence,
    }), 'utf8'));
    const idempotencyKey = deterministicIdempotencyKey('livebatch-source', {
      batchId: manifest.batchId, id: source.id,
    });
    const archived = await archiveSourceBytes({
      client,
      payload: {
        sourcePath: source.sourcePath,
        domain: source.domain,
        role: 'source',
        label: source.label,
        metadata: source.metadata,
        provenance: {
          ...source.provenance,
          liveMediaBatch: {
            schema: BATCH_PROVENANCE_SCHEMA,
            batchId: manifest.batchId,
            entryId: source.id,
            kind: 'source',
            contentSha256,
            archiveEvidenceSha256,
          },
        },
      },
      bytes,
      mediaType,
      idempotencyKey,
      reason: source.reason,
      evidence: {
        ...source.evidence,
        batchId: manifest.batchId,
        batchEntryId: source.id,
      },
    });
    const report = batchMediaReport(source, archived, idempotencyKey, {
      sourcePath: source.sourcePath,
      status: archived.archived.status,
    });
    sourceReports.push(report);
    sourceReportById.set(source.id, report);
  }

  const candidateReports = [];
  for (const candidate of manifest.candidates) {
    const bytes = fs.readFileSync(candidate.filePath);
    if (!bytes.length) throw new Error(`Refusing to upload empty candidate file: ${candidate.filePath}`);
    const mediaType = candidate.mediaType || mediaTypeFromBytes(candidate.filePath, bytes);
    const contentSha256 = sha256Bytes(bytes);
    const sourceVersions = candidate.sourceIds.map((id) => {
      const source = sourceReportById.get(id);
      return {
        entryId: id,
        sourcePath: source.sourcePath,
        versionId: source.versionId,
        sha256: source.sha256,
      };
    });
    const payload = {
      slot: candidate.slot,
      domain: candidate.domain,
      role: candidate.role,
      label: candidate.label,
      metadata: candidate.metadata,
      provenance: {
        ...candidate.provenance,
        liveMediaBatch: {
          schema: BATCH_PROVENANCE_SCHEMA,
          batchId: manifest.batchId,
          entryId: candidate.id,
          kind: 'candidate',
          contentSha256,
          sources: sourceVersions,
        },
      },
      nativeEvidence: candidate.nativeEvidence,
    };
    if (candidate.availabilityPolicy) payload.availabilityPolicy = candidate.availabilityPolicy;
    if (candidate.slotMetadata) payload.slotMetadata = candidate.slotMetadata;
    const idempotencyKey = deterministicIdempotencyKey('livebatch-candidate', {
      batchId: manifest.batchId, id: candidate.id,
    });
    const uploaded = await uploadCandidateBytes({ client, payload, bytes, mediaType, idempotencyKey });
    candidateReports.push(batchMediaReport(candidate, uploaded, idempotencyKey, {
      slot: candidate.slot,
      status: uploaded.row?.status || 'candidate',
      sourceVersions,
    }));
  }
  return {
    schema: CANDIDATE_BATCH_RESULT_SCHEMA,
    batchId: manifest.batchId,
    completedAt: new Date().toISOString(),
    sources: sourceReports,
    candidates: candidateReports,
  };
}

function assertSafeExplicitOutput(outputPath) {
  if (!isWithin(repoRoot, outputPath)) return;
  const allowedRoots = [
    path.join(repoRoot, '.unit-art-output'),
    path.join(repoRoot, 'frontend', 'tmp'),
    path.join(repoRoot, 'tmp'),
  ];
  if (!allowedRoots.some((root) => isWithin(root, outputPath))) {
    throw new Error('Repository outputs are allowed only beneath .unit-art-output, frontend/tmp, or tmp; use an explicit OS temp path');
  }
}

function parseHeader(value) {
  const index = value.indexOf(':');
  if (index <= 0) throw new Error(`--header must be "Name: value", got: ${value}`);
  return [value.slice(0, index).trim(), value.slice(index + 1).trim()];
}

function readJsonObject(filePath, option) {
  if (!filePath) return undefined;
  const value = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${option} must contain a JSON object`);
  return value;
}

export function parseCli(argv) {
  const options = {
    command: '',
    headers: process.env.LIVE_MEDIA_COOKIE ? { Cookie: process.env.LIVE_MEDIA_COOKIE } : {},
    metadata: '', provenance: '', nativeEvidence: '', evidence: '', force: false,
  };
  let index = 0;
  if (argv[0] && !argv[0].startsWith('-')) options.command = argv[index++];
  for (; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${flag} requires a value`);
      return value;
    };
    if (flag === '--api-base') options.apiBase = next();
    else if (flag === '--cookie') options.headers.Cookie = next();
    else if (flag === '--header') { const [name, value] = parseHeader(next()); options.headers[name] = value; }
    else if (flag === '--file') options.file = path.resolve(next());
    else if (flag === '--manifest') options.manifest = path.resolve(next());
    else if (flag === '--out') options.out = path.resolve(next());
    else if (flag === '--slot') options.slot = next();
    else if (flag === '--source-path') options.sourcePath = next();
    else if (flag === '--domain') options.domain = next();
    else if (flag === '--role') options.role = next();
    else if (flag === '--label') options.label = next();
    else if (flag === '--availability-policy') options.availabilityPolicy = next();
    else if (flag === '--media-type') options.mediaType = next();
    else if (flag === '--metadata-json') options.metadata = next();
    else if (flag === '--provenance-json') options.provenance = next();
    else if (flag === '--native-evidence-json') options.nativeEvidence = next();
    else if (flag === '--evidence-json') options.evidence = next();
    else if (flag === '--reason') options.reason = next();
    else if (flag === '--idempotency-key') options.idempotencyKey = next();
    else if (flag === '--force') options.force = true;
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!['upload-candidate', 'archive-source', 'upload-candidate-batch', 'fetch-source'].includes(options.command)) {
    throw new Error('Usage: live-media-admin-client.mjs upload-candidate|archive-source|upload-candidate-batch|fetch-source [options]');
  }
  const required = ({
    'upload-candidate': ['apiBase', 'file', 'domain', 'role', 'label'],
    'archive-source': ['apiBase', 'file', 'sourcePath', 'domain', 'label', 'reason', 'evidence'],
    'upload-candidate-batch': ['apiBase', 'manifest'],
    'fetch-source': ['apiBase', 'sourcePath', 'out'],
  })[options.command];
  for (const name of required) {
    if (!options[name]) throw new Error(`--${name.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`)} is required`);
  }
  if (options.command === 'upload-candidate' && Boolean(options.slot) === Boolean(options.sourcePath)) {
    throw new Error('Provide exactly one of --slot or --source-path');
  }
  if (options.command === 'archive-source' && options.slot) throw new Error('archive-source does not accept --slot');
  if (options.command === 'archive-source' && options.role && options.role !== 'source') {
    throw new Error('archive-source role is always source');
  }
  if (options.availabilityPolicy && !['critical', 'decorative'].includes(options.availabilityPolicy)) {
    throw new Error('--availability-policy must be critical or decorative');
  }
  return options;
}

async function runCli() {
  const options = parseCli(process.argv.slice(2));
  const client = new LiveMediaAdminClient({ apiBase: options.apiBase, headers: options.headers });
  if (options.command === 'upload-candidate-batch') {
    const manifest = readCandidateBatchManifest(options.manifest);
    console.log(JSON.stringify(await uploadCandidateBatch({ client, manifest }), null, 2));
    return;
  }
  if (options.command === 'fetch-source') {
    assertSafeExplicitOutput(options.out);
    if (fs.existsSync(options.out) && !options.force) throw new Error(`Output already exists; pass --force to replace it: ${options.out}`);
    const catalog = await client.adminCatalog();
    const version = latestArchivedSourceVersion(catalog, options.sourcePath, options.domain);
    const downloaded = await client.downloadVerifiedMedia({
      url: version.media.url,
      sha256: version.media.sha256,
      byteLength: Number(version.media.byteLength),
      mediaType: version.media.mediaType,
    });
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    const temporary = `${options.out}.${process.pid}.tmp`;
    let temporaryCreated = false;
    try {
      fs.writeFileSync(temporary, downloaded.bytes, { flag: 'wx' });
      temporaryCreated = true;
      if (options.force) fs.rmSync(options.out, { force: true });
      fs.renameSync(temporary, options.out);
      temporaryCreated = false;
    } finally {
      if (temporaryCreated) fs.rmSync(temporary, { force: true });
    }
    const written = fs.readFileSync(options.out);
    if (written.length !== Number(version.media.byteLength) || sha256Bytes(written) !== version.media.sha256) {
      throw new Error(`Written source failed verification: ${options.out}`);
    }
    console.log(JSON.stringify({
      status: 'source-fetched',
      id: version.id,
      sourcePath: version.sourcePath,
      outputPath: options.out,
      media: downloaded.verification,
    }, null, 2));
    return;
  }

  const bytes = fs.readFileSync(options.file);
  if (!bytes.length) throw new Error('Refusing to upload an empty file');
  const mediaType = options.mediaType || mediaTypeFromBytes(options.file, bytes);
  const payload = {
    slot: options.slot || null,
    domain: options.domain,
    role: options.role,
    label: options.label,
  };
  if (options.sourcePath) payload.sourcePath = options.sourcePath;
  if (options.availabilityPolicy) payload.availabilityPolicy = options.availabilityPolicy;
  const metadata = readJsonObject(options.metadata, '--metadata-json');
  const provenance = readJsonObject(options.provenance, '--provenance-json');
  const nativeEvidence = readJsonObject(options.nativeEvidence, '--native-evidence-json');
  if (metadata) payload.metadata = metadata;
  if (provenance) payload.provenance = provenance;
  if (nativeEvidence) payload.nativeEvidence = nativeEvidence;

  if (options.command === 'archive-source') {
    payload.slot = null;
    payload.role = 'source';
    const evidence = readJsonObject(options.evidence, '--evidence-json');
    const idempotencyKey = options.idempotencyKey || deterministicIdempotencyKey('archive-source', {
      payload,
      sha256: sha256Bytes(bytes),
      reason: options.reason,
      evidence,
    });
    const archived = await archiveSourceBytes({
      client,
      payload,
      bytes,
      mediaType,
      idempotencyKey,
      reason: options.reason,
      evidence,
    });
    console.log(JSON.stringify({
      status: 'source-archived',
      id: archived.id,
      revision: archived.revision,
      sourcePath: options.sourcePath,
      idempotencyKey,
      reused: Boolean(archived.reused),
      media: archived.verification,
    }, null, 2));
    return;
  }

  const uploaded = await uploadCandidateBytes({
    client,
    payload,
    bytes,
    mediaType,
    idempotencyKey: options.idempotencyKey,
  });
  console.log(JSON.stringify({
    status: 'candidate-uploaded',
    id: uploaded.id,
    revision: uploaded.revision,
    slot: options.slot || null,
    sourcePath: options.sourcePath || null,
    reused: Boolean(uploaded.reused),
    media: uploaded.verification,
  }, null, 2));
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) runCli().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
