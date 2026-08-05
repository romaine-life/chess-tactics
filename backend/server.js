const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');

// Shared DOM-free board-render geometry. server.js is hot-copied to and run
// from a temp dir by supervisor.js, so sibling backend assets must resolve from
// the baked backend dir instead of this process' __dirname.
const bakedBackendDir = process.env.BAKED_BACKEND_DIR || __dirname;
const { createDevGrantSessionReader } = require(path.join(bakedBackendDir, 'devAuthGrant'));
const { createOIDCSessionManager } = require(path.join(bakedBackendDir, 'oidcAuth'));
const { createByteReadBudget } = require(path.join(bakedBackendDir, 'liveMediaReadBudget'));
const { createRenderCriticalSection } = require(path.join(bakedBackendDir, 'renderCriticalSection'));
const { createAsyncWorkLimiter } = require(path.join(bakedBackendDir, 'asyncWorkLimiter'));
const { THUMBNAIL_DEPENDENCY_SCHEMA_VERSION, thumbnailContentVersionForPlan } = require(path.join(bakedBackendDir, 'thumbnailVersion'));
const { createRevisionMemo } = require(path.join(bakedBackendDir, 'revisionMemo'));
const { backgroundStoreSchemaViolation } = require(path.join(bakedBackendDir, 'backgroundStoreError'));
const {
  BGM_SAS_START_SKEW_MS,
  BGM_SAS_TTL_MS,
  createAzureBgmStorage,
  createBgmDelivery,
} = require(path.join(bakedBackendDir, 'bgmDelivery'));
const {
  prepareGenerationAttemptArchiveThumbnail,
} = require(path.join(bakedBackendDir, 'generationAttemptArchiveThumbnail'));
const {
  loadRendererSnapshotSources,
} = require(path.join(bakedBackendDir, 'rendererSnapshotLoader'));
const {
  formatMigrationRunFailure,
  formatMigrationRunResult,
  MigrationExecutionError,
  MigrationIntegrityError,
  migrationChecksum,
  migrationExecutionFailure,
  migrationManifest,
  migrationRunResult,
  planMigrationExecution,
} = require(path.join(bakedBackendDir, 'schemaMigrationIntegrity'));
const {
  schemaMigrationIdentityBoundaryIssues,
  schemaMigrationIdentityBoundaryIssuesPresent,
  schemaMigrationIdentityRepair,
} = require(path.join(bakedBackendDir, 'schemaMigrationBoundary'));
const {
  generationAttemptRetryContractIssues,
  generationAttemptRetryContractIssuesPresent,
} = require(path.join(bakedBackendDir, 'generationAttemptRetryContract'));
const {
  generationAttemptMoveHighlightContractIssues,
  generationAttemptMoveHighlightContractIssuesPresent,
} = require(path.join(bakedBackendDir, 'generationAttemptMoveHighlightContract'));
const {
  formatSchemaMigrationTarget,
  schemaMigrationTarget,
} = require(path.join(bakedBackendDir, 'schemaMigrationTarget'));
const {
  resolveDefaultOgImage,
  resolveLevelCardPresentation,
  resolveLipsanonIcon,
} = require(path.join(bakedBackendDir, 'thumbnailPresentation'));
const {
  ataraxiaNumeralMediaIssue,
  ataraxiaNumeralOwnerProofIssue,
  ataraxiaNumeralSlot,
  cardTypeRowTextureAcceptanceGroupIssue,
  cardTypeRowTextureMediaIssue,
  cardTypeRowTextureSlot,
  liveCatalogReadinessIssue,
  gameConditionIconMediaIssue,
  gameConditionIconSlot,
  levelEditorBrushIconMediaIssue,
  levelEditorBrushIconOwnerProofIssue,
  levelEditorBrushIconSlot,
  nativeMediaEvidenceIssue,
  predrawnBoardMediaIssue,
  predrawnBoardOwnerProofIssue,
  predrawnBoardSlotSlug,
  preservesNativeEvidenceForUpload,
  runLipsanonIconMediaIssue,
  runLipsanonIconSlotId,
  runCardCostCoinMediaIssue,
  runCardCostCoinSlot,
  runCardBackMediaIssue,
  runCardBackOwnerProofIssue,
  runCardBackSlot,
  runResourceIconMediaIssue,
  runResourceIconSlotId,
  runSectioWrapMediaIssue,
  workspaceBackgroundSlotId,
  workspaceBackgroundMediaIssue,
  runLipsanonMatSlot,
  runLipsanonMatMediaIssue,
  runSectioWrapSlotId,
  sfxSampleMediaIssue,
  sfxSampleOwnerProofIssue,
  sfxSampleSlot,
  strategikonBackgroundMediaIssue,
  strategikonBackgroundOwnerProofIssue,
  strategikonBackgroundSlot,
  wallMaterialMediaIssue,
  wallMaterialOwnerProofIssue,
  wallMaterialSlot,
} = require(path.join(bakedBackendDir, 'liveMediaPolicy'));
const {
  ATTEMPT_PIPELINE_SOURCE_REQUEST_SCHEMA,
  ATTEMPT_SOURCE_REQUEST_SCHEMA,
  ENVIRONMENT_GEOMETRY_SCHEMA,
  LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA,
  MOVE_HIGHLIGHT_COORDINATE_BASIS,
  MOVE_HIGHLIGHT_PROFILE_SCHEMA,
  PREDRAWN_COORDINATE_BASIS,
  SOURCE_SEMANTIC_REQUEST_SCHEMA,
  backgroundVersionAttemptStageIssue,
  backgroundVersionEnvironmentGeometry,
  backgroundVersionLineageIssue,
  backgroundVersionStoredContractIssue,
  backgroundVersionStoredOcclusionChain,
  backgroundVersionV2GeometrySha256,
  generationAttemptSelectionDisposition,
  generationAttemptSourceRequestIssue,
  normalizeBackgroundVersionCreate,
  normalizeBackgroundVersionIdempotencyKey,
  normalizeMoveHighlightProfile,
  normalizePredrawnVersionSurface,
  normalizedUuid: backgroundVersionId,
  parseBackgroundVersionUploadPath,
  sameWorldBounds: sameBackgroundWorldBounds,
  sourceArtworkVersionContractIssue,
} = require(path.join(bakedBackendDir, 'backgroundVersionPolicy'));
let serverRender = null;
try {
  serverRender = require('@chess-tactics/board-render');
} catch (error) {
  console.error('board-render package unavailable; level thumbnails will return 503:', error && error.message);
}
const withServerRenderCriticalSection = createRenderCriticalSection();
const LEVEL_THUMBNAIL_RENDER_CONCURRENCY = 2;
const withLevelThumbnailRenderSlot = createAsyncWorkLimiter(LEVEL_THUMBNAIL_RENDER_CONCURRENCY);
// ADR-0258: thumbnail URL manifests are memoized per authority. Reads consult
// this memo; the per-level plan/fingerprint derivation runs only when a document
// or catalog revision actually moved.
const thumbnailManifestMemo = createRevisionMemo({
  onBackgroundError: (error, key) => {
    console.error(`thumbnail manifest refresh failed (${key}):`, error && error.message);
  },
});
const backgroundVersionUploadsInFlight = new Set();

const app = express();
const port = process.env.PORT || 3000;
// ADR-0258: a slow endpoint must scream in the pod log before a person finds it.
// Log the path only — query strings can carry private editor document ids.
const SLOW_REQUEST_LOG_MS = Number(process.env.SLOW_REQUEST_LOG_MS || 2000);
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const elapsedMs = Number((process.hrtime.bigint() - startedAt) / 1000000n);
    if (elapsedMs >= SLOW_REQUEST_LOG_MS) {
      console.warn(`slow request: ${req.method} ${req.path} ${res.statusCode} ${elapsedMs}ms`);
    }
  });
  next();
});
const frontendDir = process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend', 'dist');
const staticFrontendDir = process.env.STATIC_FRONTEND_DIR || '';
const authBaseUrl = (process.env.AUTH_BASE_URL || 'https://auth.romaine.life').replace(/\/+$/, '');
const publicOrigin = (process.env.PUBLIC_ORIGIN || 'https://chess-tactics.com').replace(/\/+$/, '');
const oidcSessions = createOIDCSessionManager({
  issuer: authBaseUrl,
  clientId: process.env.OIDC_CLIENT_ID || 'chess-tactics',
  publicOrigin,
});
// Multiplayer lobbies + netplay relay live entirely in process: this Map is the
// authoritative store and the SSE subscriber sets below hold live connections.
// This is only correct because the deployment runs a SINGLE replica
// (k8s/templates/deployment.yaml:17 `replicas: 1`, a hard invariant) — a second
// pod would split the lobby state and the relay. No Redis; in-memory is fine for v1.
const lobbies = new Map();
const parsedLobbyTombstoneTtl = Number.parseInt(process.env.LOBBY_TOMBSTONE_TTL_MS, 10);
const LOBBY_TOMBSTONE_TTL_MS = Number.isFinite(parsedLobbyTombstoneTtl) && parsedLobbyTombstoneTtl > 0
  ? parsedLobbyTombstoneTtl
  : 5 * 60 * 1000;

// Production derives lobby eligibility only from the canonical official workspace.
// The DB-free protocol smoke has no workspace store, so tests may inject a tiny metadata
// map only under an explicit test process. Merely setting the metadata variable in any
// non-test environment has no effect.
let lobbyTestLevelMetadata = null;
if (process.env.NODE_ENV === 'test' && process.env.LOBBY_TEST_LEVEL_METADATA) {
  try {
    const parsed = JSON.parse(process.env.LOBBY_TEST_LEVEL_METADATA);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) lobbyTestLevelMetadata = parsed;
  } catch (error) {
    console.warn('LOBBY_TEST_LEVEL_METADATA is invalid JSON and will be ignored:', error.message);
  }
}
// SSE subscribers. Global list channel (lobby list changed) and per-lobby game
// channels. Each per-lobby entry is { res, email } so the lobby frame can be
// projected per-viewer (your_side / viewer_role depend on the viewer's email).
const lobbyListSubscribers = new Set(); // Set<res>
const lobbyChannelSubscribers = new Map(); // Map<lobbyId, Set<{ res, email }>>

// Background music is anonymous app content backed by a private Blob container.
// The workload identity lists metadata for /api/bgm and requests user-delegation
// keys. Playlist entries expose only stable same-origin app routes; each playback
// request receives a fresh blob-specific, read-only, short-lived SAS redirect so
// Azure—not this pod—carries the audio bytes and range traffic (ADR-0200).
const bgmContainerUrl = String(process.env.BGM_CONTAINER_URL || '').trim().replace(/\/+$/, '');
const bgmSignals = {
  capabilitySuccess: 0,
  capabilityFailure: 0,
  unknownTrack: 0,
  capabilityLatencyMs: 0,
};

function recordBgmSignal(event, details = {}) {
  if (event === 'catalog_refresh_success') {
    console.info(`bgm catalog refresh success tracks=${details.trackCount} latency_ms=${details.durationMs}`);
    return;
  }
  if (event === 'catalog_refresh_failure') {
    console.warn(`bgm catalog refresh failure code=${details.errorCode} last_good=${details.usedLastGood ? 1 : 0} latency_ms=${details.durationMs}`);
    return;
  }
  if (event === 'delegation_key_refresh_success') {
    console.info(`bgm delegation-key refresh success latency_ms=${details.durationMs}`);
    return;
  }
  if (event === 'delegation_key_refresh_failure') {
    console.warn(`bgm delegation-key refresh failure code=${details.errorCode} latency_ms=${details.durationMs}`);
    return;
  }
  if (event === 'capability_success') {
    bgmSignals.capabilitySuccess += 1;
    bgmSignals.capabilityLatencyMs += details.durationMs || 0;
  } else if (event === 'capability_failure') {
    bgmSignals.capabilityFailure += 1;
    bgmSignals.capabilityLatencyMs += details.durationMs || 0;
  } else if (event === 'unknown_track') {
    bgmSignals.unknownTrack += 1;
  } else {
    return;
  }
  const totalCapabilities = bgmSignals.capabilitySuccess + bgmSignals.capabilityFailure;
  const count = event === 'unknown_track' ? bgmSignals.unknownTrack : totalCapabilities;
  if (count !== 1 && count % 100 !== 0 && event !== 'capability_failure') return;
  const averageLatency = totalCapabilities
    ? Math.round(bgmSignals.capabilityLatencyMs / totalCapabilities)
    : 0;
  console.info(
    `bgm capability counters issued=${bgmSignals.capabilitySuccess}`
    + ` failed=${bgmSignals.capabilityFailure} unknown=${bgmSignals.unknownTrack}`
    + ` avg_latency_ms=${averageLatency}`,
  );
}

function createTestBgmStorage() {
  if (process.env.NODE_ENV !== 'test' || !process.env.BGM_TEST_CATALOG_JSON) return null;
  const entries = JSON.parse(process.env.BGM_TEST_CATALOG_JSON);
  if (!Array.isArray(entries)) throw new Error('BGM_TEST_CATALOG_JSON must be an array');
  const capabilityBaseUrl = String(process.env.BGM_TEST_CAPABILITY_BASE_URL || '').replace(/\/+$/, '');
  const signingSecret = String(process.env.BGM_TEST_SIGNING_SECRET || '');
  if (!capabilityBaseUrl || !signingSecret) {
    throw new Error('BGM test capability configuration is incomplete');
  }
  return {
    listTracks: async () => entries,
    signTrack: async (track) => {
      const nowMs = Date.now();
      const starts = Math.floor((nowMs - BGM_SAS_START_SKEW_MS) / 1000);
      const expires = Math.floor((nowMs + BGM_SAS_TTL_MS) / 1000);
      const signature = crypto
        .createHmac('sha256', signingSecret)
        .update(`${track.blobName}\0${starts}\0${expires}`)
        .digest('hex');
      const target = new URL(`${encodeURIComponent(track.blobName)}`, `${capabilityBaseUrl}/`);
      target.searchParams.set('st', String(starts));
      target.searchParams.set('exp', String(expires));
      target.searchParams.set('sig', signature);
      return target.toString();
    },
  };
}

function createConfiguredBgmDelivery() {
  try {
    const storage = createTestBgmStorage() || (bgmContainerUrl
      ? createAzureBgmStorage({ containerUrl: bgmContainerUrl, onEvent: recordBgmSignal })
      : { listTracks: async () => [], signTrack: async () => { throw new Error('bgm_not_configured'); } });
    return createBgmDelivery({ ...storage, onEvent: recordBgmSignal });
  } catch (error) {
    const code = String(error && (error.code || error.name) || 'configuration_error')
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .slice(0, 80);
    console.warn(`bgm configuration unavailable code=${code}`);
    return createBgmDelivery({
      listTracks: async () => [],
      signTrack: async () => { throw new Error('bgm_not_configured'); },
      onEvent: recordBgmSignal,
    });
  }
}

const bgmDelivery = createConfiguredBgmDelivery();

// Live Unit Studio art. Metadata and accepted pointers live in Postgres; PNG
// bytes are content-addressed in this private container. UNIT_ASSET_STORAGE_DIR
// is the deterministic local/CI implementation of the same blob-key contract.
const unitAssetContainerUrl = (process.env.UNIT_ASSET_CONTAINER_URL || '').replace(/\/+$/, '');
const unitAssetStorageDir = String(process.env.UNIT_ASSET_STORAGE_DIR || '').trim();
const unitAssetSeedCatalogUrl = String(process.env.UNIT_ASSET_SEED_CATALOG_URL || '').trim();
const UNIT_ASSET_MAX_BYTES = 10 * 1024 * 1024;
const UNIT_SPRITE_CACHE_MAX_BYTES = Math.max(
  0,
  Number.parseInt(process.env.UNIT_SPRITE_CACHE_BYTES || '', 10) || 24 * 1024 * 1024,
);
let unitAssetContainerClient = null;

// Shared live-media storage. Postgres owns stable semantic slots and accepted
// version pointers; immutable bytes live in a private content-addressed object
// store. LIVE_MEDIA_STORAGE_DIR is the local/CI/test-slot implementation of the
// same key contract. The optional seed URLs hydrate an empty ephemeral catalog
// from another live backend and fetch immutable objects lazily -- never from Git
// or a packaged frontend directory.
const liveMediaContainerUrl = (process.env.LIVE_MEDIA_CONTAINER_URL || '').replace(/\/+$/, '');
const liveMediaStorageDir = String(process.env.LIVE_MEDIA_STORAGE_DIR || '').trim();
const liveMediaSeedCatalogUrl = String(process.env.LIVE_MEDIA_SEED_CATALOG_URL || '').trim();
const liveMediaSeedBaseUrl = String(process.env.LIVE_MEDIA_SEED_MEDIA_BASE_URL || '').trim().replace(/\/+$/, '');
const propSeatsSeedUrl = String(process.env.PROP_SEATS_SEED_URL || '').trim();
// Raw uploads are deliberately capped well below the pod's 256 MiB memory
// limit. The current migration inventory peaks below 12 MiB; larger future
// objects need a streaming upload path instead of raising this buffered limit.
const LIVE_MEDIA_MAX_BYTES = 32 * 1024 * 1024;
const LIVE_MEDIA_SEED_CATALOG_MAX_BYTES = 16 * 1024 * 1024;
const LIVE_MEDIA_CACHE_MAX_BYTES = Math.max(
  0,
  Number.parseInt(process.env.LIVE_MEDIA_CACHE_BYTES || '', 10) || 32 * 1024 * 1024,
);
const LIVE_MEDIA_READ_BUDGET_BYTES = Math.max(
  LIVE_MEDIA_MAX_BYTES,
  Number.parseInt(process.env.LIVE_MEDIA_READ_BUDGET_BYTES || '', 10) || 64 * 1024 * 1024,
);
const LIVE_MEDIA_READ_TIMEOUT_MS = Math.min(
  60_000,
  Math.max(1_000, Number.parseInt(process.env.LIVE_MEDIA_READ_TIMEOUT_MS || '', 10) || 15_000),
);
let liveMediaContainerClient = null;

function validateLiveMediaEnvironment() {
  if (liveMediaStorageDir && liveMediaContainerUrl) {
    throw new Error('LIVE_MEDIA_STORAGE_DIR and LIVE_MEDIA_CONTAINER_URL are mutually exclusive');
  }
  if (liveMediaSeedBaseUrl && !liveMediaSeedCatalogUrl) {
    throw new Error('LIVE_MEDIA_SEED_MEDIA_BASE_URL requires LIVE_MEDIA_SEED_CATALOG_URL');
  }
  if ((liveMediaSeedCatalogUrl || liveMediaSeedBaseUrl) && (!liveMediaStorageDir || liveMediaContainerUrl)) {
    throw new Error('live media seed URLs require isolated LIVE_MEDIA_STORAGE_DIR storage');
  }
  if (propSeatsSeedUrl && (!liveMediaStorageDir || liveMediaContainerUrl || process.env.LIVE_MEDIA_ISOLATED_DATABASE !== 'test-slot')) {
    throw new Error('PROP_SEATS_SEED_URL is allowed only for an isolated test-slot data plane');
  }
  if (liveMediaStorageDir && !path.isAbsolute(liveMediaStorageDir)) {
    throw new Error('LIVE_MEDIA_STORAGE_DIR must be an absolute path');
  }
  if (liveMediaStorageDir && !String(process.env.DATABASE_URL || '').trim()) {
    throw new Error('LIVE_MEDIA_STORAGE_DIR requires an isolated DATABASE_URL');
  }
  if (liveMediaStorageDir) {
    let databaseHost = '';
    try { databaseHost = new URL(process.env.DATABASE_URL).hostname.toLowerCase(); } catch {
      throw new Error('LIVE_MEDIA_STORAGE_DIR requires a valid isolated DATABASE_URL');
    }
    if (databaseHost.endsWith('.postgres.database.azure.com')) {
      throw new Error('LIVE_MEDIA_STORAGE_DIR cannot use an Azure production DATABASE_URL');
    }
    const loopback = databaseHost === 'localhost' || databaseHost === '127.0.0.1' || databaseHost === '::1';
    if (!loopback && process.env.LIVE_MEDIA_ISOLATED_DATABASE !== 'test-slot') {
      throw new Error('non-loopback isolated live-media databases require LIVE_MEDIA_ISOLATED_DATABASE=test-slot');
    }
  }
  if (liveMediaStorageDir && (
    process.env.POSTGRES_HOST || process.env.POSTGRES_DATABASE || process.env.POSTGRES_DB || process.env.POSTGRES_USER
  )) {
    throw new Error('LIVE_MEDIA_STORAGE_DIR cannot be combined with production Postgres host settings');
  }
  if (liveMediaContainerUrl) {
    let url;
    try { url = new URL(liveMediaContainerUrl); } catch { throw new Error('LIVE_MEDIA_CONTAINER_URL must be a valid URL'); }
    if (url.protocol !== 'https:' || !url.hostname || !url.pathname.replace(/^\/+|\/+$/g, '') || url.search || url.hash) {
      throw new Error('LIVE_MEDIA_CONTAINER_URL must be an HTTPS container URL without query or fragment');
    }
  }
  for (const [name, value] of [
    ['LIVE_MEDIA_SEED_CATALOG_URL', liveMediaSeedCatalogUrl],
    ['LIVE_MEDIA_SEED_MEDIA_BASE_URL', liveMediaSeedBaseUrl],
    ['PROP_SEATS_SEED_URL', propSeatsSeedUrl],
  ]) {
    if (!value) continue;
    let url;
    try { url = new URL(value); } catch { throw new Error(`${name} must be a valid HTTP(S) URL`); }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`${name} must be a valid HTTP(S) URL`);
  }
}

validateLiveMediaEnvironment();

// Game Lab runs carry whole recorded-game batches (validateLabRun allows up to
// ~8 MB of JSON), far past the global 256kb ceiling. Mount their larger parser
// first: once it has consumed the body, the global parser below sees the
// request as already read and skips it, so every other route keeps the 256kb
// limit.
app.use('/api/lab-runs', express.json({ limit: '10mb' }));
// Training run specs embed a whole level object (+ optionally a generated book), so
// they exceed the 256kb global ceiling; mount a larger parser first, like lab-runs.
app.use('/api/train-runs', express.json({ limit: '10mb' }));
// Solve run specs embed a whole level object (SolveSpec.level), same as train-runs, so
// they exceed the 256kb global ceiling; mount a larger parser first.
app.use('/api/solve-runs', express.json({ limit: '10mb' }));
// Opening-book blobs carry every book's capped training trajectory (up to a few
// hundred points each across several books), which can exceed the global 256kb
// ceiling. Mount a larger parser first, same as lab-runs; the global parser below
// then sees the body as already read and skips it.
app.use('/api/opening-books', express.json({ limit: '4mb' }));
// Official-campaigns holds the ENTIRE official workspace (every campaign + all their level
// docs, each carrying a full per-cell terrain array + boardCode), so it grows well past the
// 256kb ceiling. Mount a larger parser first, same as lab-runs; the global parser below skips it.
app.use('/api/official-campaigns', express.json({ limit: '10mb' }));
// Editor documents hold one complete Level working copy. They need the same
// headroom as a single level document (boardCode + layer arrays).
app.use('/api/editor-documents', express.json({ limit: '4mb' }));
// Authenticate byte-upload routes before a raw parser allocates their request
// bodies. This is deliberately mounted ahead of the global JSON parser: an
// unauthenticated caller must not be able to make a 256 MiB pod buffer many
// concurrent 10/32 MiB payloads merely by targeting an admin URL.
async function requireAdminBeforeRawUpload(req, res, next) {
  const user = await requireAdmin(req, res);
  if (!user) return;
  req.rawUploadAdmin = user;
  next();
}

async function requireBackgroundVersionOwnerBeforeRawUpload(req, res, next) {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    // Regex-mounted Express middleware rewrites req.path to "/" while it is
    // handling the matched URL. Use originalUrl so the authorization guard
    // validates the real collection owner instead of rejecting every valid
    // raster upload before its body is consumed.
    const upload = parseBackgroundVersionUploadPath(req.originalUrl);
    if (!upload) {
      res.status(400).json({ error: 'invalid_background_version_upload_path' });
      return;
    }
    const documentId = editorDocumentId(upload.documentId);
    const versionId = backgroundVersionId(upload.versionId);
    if (!documentId || !versionId) {
      res.status(400).json({ error: 'invalid_background_version_upload_path' });
      return;
    }
    if (mediaType(req.headers['content-type']) !== 'image/png') {
      res.status(415).json({ error: 'unsupported_media_type' });
      return;
    }
    const document = await dbGetEditorDocument(user.email, documentId);
    if (!document) {
      res.status(404).json({ error: 'editor_document_not_found' });
      return;
    }
    if (!editorDocumentRowIsAuthorized(document, user, res)) return;
    const authority = backgroundVersionMutationAuthority(req, res);
    if (!authority) return;
    await dbAssertBackgroundVersionWriter(document, authority);
    const version = await dbBackgroundVersionRow(documentId, versionId);
    if (!version || version.owner_email !== document.owner_email || version.level_id !== document.level_id) {
      res.status(404).json({ error: 'background_version_not_found' });
      return;
    }
    const expectedHeader = String(req.headers['if-match'] || '').trim().replace(/^W\//, '').replace(/^"|"$/g, '');
    if (!/^\d+$/.test(expectedHeader)) {
      res.status(428).json({ error: 'background_version_expected_revision_required' });
      return;
    }
    if (!version.blob_sha256 && Number(version.row_revision) !== Number(expectedHeader)) {
      res.status(409).json({
        error: 'background_version_conflict',
        details: { current_revision: Number(version.row_revision) },
      });
      return;
    }
    if (!version.blob_sha256 && version.status !== 'ready') {
      res.status(409).json({ error: 'background_version_locked', details: { status: version.status } });
      return;
    }
    if (backgroundVersionUploadsInFlight.has(documentId)) {
      res.status(409).json({ error: 'background_version_upload_busy' });
      return;
    }
    backgroundVersionUploadsInFlight.add(documentId);
    let released = false;
    const releaseUploadSlot = () => {
      if (released) return;
      released = true;
      backgroundVersionUploadsInFlight.delete(documentId);
    };
    res.once('finish', releaseUploadSlot);
    res.once('close', releaseUploadSlot);
    req.once('aborted', releaseUploadSlot);
    req.rawUploadUser = user;
    req.backgroundVersionAuthority = authority;
    next();
  } catch (error) {
    respondBackgroundVersionError(res, error, 'upload authorization');
  }
}

// Unit sprites are the only raw requests under the Unit Art API. Candidate
// metadata remains JSON and therefore continues through to express.json below.
app.use(
  /^\/api\/admin\/unit-assets\/[0-9a-f-]+\/sprites\/[^/]+\/[^/]+$/,
  requireAdminBeforeRawUpload,
  express.raw({ type: 'image/png', limit: '10mb' }),
);
// Generic media uploads may be images, fonts, audio, or opaque private source
// binaries. Parse only this exact authenticated content route as raw bytes.
app.use(
  /^\/api\/admin\/media-versions\/[0-9a-f-]+\/content$/,
  requireAdminBeforeRawUpload,
  express.raw({ type: () => true, limit: '32mb' }),
);
// Private pre-drawn background candidates use the shared content-addressed blob
// store, but authoring authority comes from their owning editor document rather
// than the global media-admin catalog.
app.use(
  /^\/api\/editor-documents\/[^/]+\/background-versions\/[0-9a-f-]+\/content$/,
  requireBackgroundVersionOwnerBeforeRawUpload,
  express.raw({ type: () => true, limit: '32mb' }),
);
app.use(express.json({ limit: '256kb' }));

// ---------------------------------------------------------------------------
// Durable store: Azure Database for PostgreSQL (replaces the pod-ephemeral file
// stores, which had no PVC and were wiped on every restart/rollout). Two
// connection modes, chosen by environment:
//   - DATABASE_URL set            -> password mode (CI Postgres service,
//                                    ephemeral test-slot Postgres, local dev).
//   - POSTGRES_HOST/DATABASE/USER -> Entra (AAD) workload-identity mode (prod):
//                                    a fresh AAD access token is presented as
//                                    the password on each new connection,
//                                    acquired via DefaultAzureCredential from
//                                    the projected ServiceAccount token. No app
//                                    password is ever stored.
// This lives inline on purpose: the supervisor reloads only server.js, so the
// DB layer must travel with it (pg + @azure/identity resolve from the baked
// node_modules via NODE_PATH).
// ---------------------------------------------------------------------------
const databaseUrl = process.env.DATABASE_URL || '';
const pgHost = process.env.POSTGRES_HOST || '';
const pgDatabase = process.env.POSTGRES_DATABASE || '';
const pgUser = process.env.POSTGRES_USER || '';
const AAD_DB_TOKEN_SCOPE = 'https://ossrdbms-aad.database.windows.net/.default';
// Fixed key so concurrent pods (a rolling update briefly runs two) serialize
// schema migration via a Postgres session advisory lock.
const MIGRATION_ADVISORY_LOCK_KEY = 4300193001;
const SCHEMA_MIGRATION_MODES = new Set(['check', 'auto', 'off']);

function schemaMigrationModeFromEnv(raw) {
  const value = String(raw || 'check').trim().toLowerCase();
  if (SCHEMA_MIGRATION_MODES.has(value)) return value;
  console.warn(`invalid SCHEMA_MIGRATIONS="${raw}"; using read-only check mode`);
  return 'check';
}

const schemaMigrationMode = schemaMigrationModeFromEnv(process.env.SCHEMA_MIGRATIONS);
const schemaMigrationCommand = process.env.SCHEMA_MIGRATION_COMMAND === '1';

const MIGRATIONS = [
  {
    version: 1,
    name: 'init document stores',
    sql: `
      CREATE TABLE IF NOT EXISTS levels (
        owner_email text        NOT NULL,
        id          text        NOT NULL,
        name        text,
        cols        integer,
        rows        integer,
        revision    integer     NOT NULL DEFAULT 0,
        body        jsonb       NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (owner_email, id)
      );
      CREATE TABLE IF NOT EXISTS campaign_workspaces (
        owner_email text        PRIMARY KEY,
        body        jsonb       NOT NULL,
        updated_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS design_portfolios (
        id                    text        PRIMARY KEY,
        data                  jsonb       NOT NULL,
        client_schema_version integer,
        metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
        revision              integer     NOT NULL DEFAULT 0,
        created_at            timestamptz NOT NULL DEFAULT now(),
        updated_at            timestamptz NOT NULL DEFAULT now(),
        updated_by            text
      );
    `,
  },
  {
    version: 2,
    name: 'reserved: db asset store removed before adoption',
    sql: 'SELECT 1;',
  },
  {
    version: 3,
    name: 'legacy campaign documents and code-owned assets',
    sql: `
      DROP TABLE IF EXISTS design_assets;
      CREATE TABLE IF NOT EXISTS campaigns (
        owner_email text        NOT NULL,
        id          text        NOT NULL,
        body        jsonb       NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (owner_email, id)
      );
    `,
  },
  {
    version: 4,
    name: 'official campaigns global tier',
    // The global OFFICIAL campaign tier (ADR-0038): one upserted row per id (PK id
    // alone ⇒ global, mirroring design_portfolios), holding a complete Workspace
    // {campaigns,levels}. Public GET / admin-gated PUT. This row is the SOLE source of
    // official campaigns — there is no committed fixture fallback.
    sql: `
      CREATE TABLE IF NOT EXISTS official_campaigns (
        id                    text        PRIMARY KEY,
        data                  jsonb       NOT NULL,
        client_schema_version integer,
        revision              integer     NOT NULL DEFAULT 0,
        created_at            timestamptz NOT NULL DEFAULT now(),
        updated_at            timestamptz NOT NULL DEFAULT now(),
        updated_by            text
      );
    `,
  },
  {
    version: 5,
    name: 'per-user editable display name',
    // The editable account username (the name shown in the account menu / in-game).
    // The identity (email) is owned by upstream auth and is immutable; this is a
    // per-account override keyed by that email. A null/absent display_name means
    // "no override" — fall back to the upstream name, then the email.
    sql: `
      CREATE TABLE IF NOT EXISTS user_profiles (
        email        text        PRIMARY KEY,
        display_name text,
        updated_at   timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    version: 6,
    name: 'game lab runs',
    // Account-scoped Game Lab run archive: append-only run documents. `meta` is
    // the small list-view summary (listing never returns `body`); `body` is the
    // full run payload, fetched per run. The composite index serves the
    // owner-scoped newest-first listing.
    sql: `
      CREATE TABLE IF NOT EXISTS lab_runs (
        id          text        PRIMARY KEY,
        owner_email text        NOT NULL,
        meta        jsonb       NOT NULL,
        body        jsonb       NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS lab_runs_owner_idx ON lab_runs (owner_email, created_at DESC);
    `,
  },
  {
    version: 7,
    name: 'shareable public maps + account campaign progress',
    // public_maps: a global, owner-free address for a user's map so a pasted /play?map=<id> link
    // resolves for an anonymous crawler/visitor (the per-owner l<n> id has no global meaning). Stores
    // a SNAPSHOT of the level body (decoupled from the owner's live workspace — re-publish updates it)
    // + the board content hash for the thumbnail/og cache key. The unguessable public_id is the
    // share capability (maps are intentionally public-by-link).
    // campaign_progress: account-scoped cleared/stars, mirroring the per-owner campaign_workspaces blob.
    sql: `
      CREATE TABLE IF NOT EXISTS public_maps (
        public_id    text        PRIMARY KEY,
        owner_email  text        NOT NULL,
        level_id     text        NOT NULL,
        name         text,
        content_hash text,
        body         jsonb       NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS public_maps_owner_idx ON public_maps (owner_email, level_id);
      CREATE TABLE IF NOT EXISTS campaign_progress (
        owner_email text        PRIMARY KEY,
        body        jsonb       NOT NULL,
        updated_at  timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    version: 8,
    name: 'training gym opening books',
    // Account-scoped Training Gym opening books, one blob row per (owner, level),
    // mirroring the per-owner campaign_workspaces model: a single JSON `data` column
    // holding the level's whole BooksBlob {nextId, books}, upserted on save. Replaces
    // the former per-browser localStorage store so books follow the account.
    sql: `
      CREATE TABLE IF NOT EXISTS opening_books (
        owner_email text        NOT NULL,
        level_id    text        NOT NULL,
        data        jsonb       NOT NULL,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (owner_email, level_id)
      );
    `,
  },
  {
    version: 9,
    name: 'prop seats global tier',
    // The global PROP-SEAT tuning tier (ADR-0061): one upserted row per id (PK id
    // alone ⇒ global, cloning official_campaigns), holding the complete map of
    // propId → seat {anchorX,anchorY,scale,w?,h?,base?}. Public GET / admin-gated
    // PUT. ADR-0085 removed the committed baseline; `default` is required live content.
    sql: `
      CREATE TABLE IF NOT EXISTS prop_seats (
        id                    text        PRIMARY KEY,
        data                  jsonb       NOT NULL,
        client_schema_version integer,
        revision              integer     NOT NULL DEFAULT 0,
        created_at            timestamptz NOT NULL DEFAULT now(),
        updated_at            timestamptz NOT NULL DEFAULT now(),
        updated_by            text
      );
    `,
  },
  {
    version: 10,
    name: 'training runs',
    // Account-scoped headless AI training runs. `spec` is the immutable run config
    // (level + SPSA/book/search settings) the trainer Job reads; `body` is the
    // progressively-updated result (champion, trajectory, restart scores); `status`
    // is pending|running|done|error|cancelled; `job_name` is the k8s Job the backend
    // launched (so a cancel can delete it). Owner-scoped newest-first listing.
    sql: `
      CREATE TABLE IF NOT EXISTS train_runs (
        id          text        PRIMARY KEY,
        owner_email text        NOT NULL,
        spec        jsonb       NOT NULL,
        body        jsonb       NOT NULL DEFAULT '{}'::jsonb,
        status      text        NOT NULL DEFAULT 'pending',
        job_name    text,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS train_runs_owner_idx ON train_runs (owner_email, created_at DESC);
    `,
  },
  {
    version: 11,
    name: 'shipped per-level AI weights',
    // The GLOBAL admin-tuned AI-weight tier (ship-to-everyone). One upserted row per
    // level id (PK id alone ⇒ global, cloning prop_seats/official_campaigns) holding
    // the encoded eval-weight vector every player's live AI uses on that level —
    // unless the player has personally adopted their own. Public GET / admin PUT.
    sql: `
      CREATE TABLE IF NOT EXISTS level_ai_weights (
        level_id   text        PRIMARY KEY,
        weights    jsonb       NOT NULL,
        updated_by text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    version: 12,
    name: 'wall art global tier',
    // Historical intermediate store. Migration 23 projects its live document
    // into drawable_assets and drops this table.
    sql: `
      CREATE TABLE IF NOT EXISTS wall_art (
        id                    text        PRIMARY KEY,
        data                  jsonb       NOT NULL,
        client_schema_version integer,
        revision              integer     NOT NULL DEFAULT 0,
        created_at            timestamptz NOT NULL DEFAULT now(),
        updated_at            timestamptz NOT NULL DEFAULT now(),
        updated_by            text
      );
    `,
  },
  {
    version: 13,
    name: 'live editor maps and misc pool',
    // Live editor maps: a public-by-link Level document for the Level Editor.
    // owner_email gates writes; public_id gates reads. Anonymous/agent-created rows
    // live in the misc pool and expire unless somebody saves/adopts them.
    sql: `
      CREATE TABLE IF NOT EXISTS editor_maps (
        public_id   text        PRIMARY KEY,
        owner_email text,
        anonymous_user_hash text,
        anonymous_label text,
        edit_key_hash text,
        listed      boolean     NOT NULL DEFAULT false,
        name        text,
        body        jsonb       NOT NULL,
        revision    integer     NOT NULL DEFAULT 0,
        saved_at    timestamptz,
        saved_by    text,
        expires_at  timestamptz,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS editor_maps_owner_idx ON editor_maps (owner_email, updated_at DESC);
      CREATE INDEX IF NOT EXISTS editor_maps_anonymous_idx ON editor_maps (anonymous_user_hash, updated_at DESC)
        WHERE anonymous_user_hash IS NOT NULL;
      CREATE INDEX IF NOT EXISTS editor_maps_misc_idx ON editor_maps (expires_at, updated_at DESC)
        WHERE listed = true AND saved_at IS NULL;
      CREATE TABLE IF NOT EXISTS editor_map_audit_events (
        id                  bigserial   PRIMARY KEY,
        public_id           text        NOT NULL REFERENCES editor_maps(public_id) ON DELETE CASCADE,
        action              text        NOT NULL,
        actor_email         text,
        anonymous_user_hash text,
        anonymous_label     text,
        created_at          timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS editor_map_audit_public_idx ON editor_map_audit_events (public_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS editor_map_audit_anonymous_idx ON editor_map_audit_events (anonymous_user_hash, created_at DESC)
        WHERE anonymous_user_hash IS NOT NULL;
    `,
  },
  {
    version: 14,
    name: 'live unit art catalog',
    // Six stable chess-piece families point at their currently accepted art.
    // Candidate rows are replaceable art sets, not gameplay identities: levels
    // continue to mean pawn/rook/etc. regardless of which sprite set is live.
    // PNG bytes live in Azure Blob Storage; Postgres owns only catalog metadata,
    // geometry, content hashes, acceptance, and the audit trail.
    sql: `
      CREATE TABLE IF NOT EXISTS unit_assets (
        id                      uuid        PRIMARY KEY,
        family                  text        NOT NULL CHECK (family IN ('pawn', 'rook', 'knight', 'bishop', 'queen', 'king')),
        label                   text        NOT NULL,
        method                  text        NOT NULL DEFAULT 'Imported',
        notes                   text        NOT NULL DEFAULT '',
        status                  text        NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'archived')),
        footprint_shape         text        NOT NULL DEFAULT 'circle' CHECK (footprint_shape IN ('circle', 'square')),
        source_canvas_width     integer     NOT NULL CHECK (source_canvas_width > 0 AND source_canvas_width <= 4096),
        source_canvas_height    integer     NOT NULL CHECK (source_canvas_height > 0 AND source_canvas_height <= 4096),
        source_footprint_px     numeric     NOT NULL CHECK (source_footprint_px > 0 AND source_footprint_px <= 4096),
        anchor_x                numeric     NOT NULL DEFAULT 0.5 CHECK (anchor_x >= 0 AND anchor_x <= 1),
        anchor_y                numeric     NOT NULL DEFAULT 0.80241 CHECK (anchor_y >= 0 AND anchor_y <= 1),
        row_revision            integer     NOT NULL DEFAULT 0,
        created_at              timestamptz NOT NULL DEFAULT now(),
        updated_at              timestamptz NOT NULL DEFAULT now(),
        updated_by              text,
        UNIQUE (id, family)
      );

      CREATE TABLE IF NOT EXISTS unit_families (
        family                  text        PRIMARY KEY CHECK (family IN ('pawn', 'rook', 'knight', 'bishop', 'queen', 'king')),
        accepted_asset_id       uuid,
        display_scale_percent   integer     NOT NULL DEFAULT 100 CHECK (display_scale_percent >= 60 AND display_scale_percent <= 140),
        row_revision            integer     NOT NULL DEFAULT 0,
        updated_at              timestamptz NOT NULL DEFAULT now(),
        updated_by              text,
        FOREIGN KEY (accepted_asset_id, family) REFERENCES unit_assets (id, family)
      );

      CREATE TABLE IF NOT EXISTS unit_sprites (
        asset_id                uuid        NOT NULL REFERENCES unit_assets (id) ON DELETE CASCADE,
        palette                 text        NOT NULL CHECK (palette IN ('navy-blue', 'crimson', 'golden', 'emerald', 'black', 'white')),
        direction               text        NOT NULL CHECK (direction IN ('north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west')),
        sha256                  text        NOT NULL CHECK (char_length(sha256) = 64),
        blob_key                text        NOT NULL,
        content_type            text        NOT NULL DEFAULT 'image/png' CHECK (content_type = 'image/png'),
        width                   integer     NOT NULL CHECK (width > 0 AND width <= 4096),
        height                  integer     NOT NULL CHECK (height > 0 AND height <= 4096),
        byte_length             integer     NOT NULL CHECK (byte_length > 0 AND byte_length <= 10485760),
        created_at              timestamptz NOT NULL DEFAULT now(),
        updated_at              timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (asset_id, palette, direction)
      );
      CREATE INDEX IF NOT EXISTS unit_assets_family_status_idx ON unit_assets (family, status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS unit_sprites_sha_idx ON unit_sprites (sha256);

      CREATE TABLE IF NOT EXISTS unit_catalog_state (
        singleton               boolean     PRIMARY KEY DEFAULT true CHECK (singleton),
        revision                bigint      NOT NULL DEFAULT 0,
        updated_at              timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO unit_catalog_state (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;

      INSERT INTO unit_families (family) VALUES
        ('pawn'), ('rook'), ('knight'), ('bishop'), ('queen'), ('king')
      ON CONFLICT (family) DO NOTHING;

      CREATE TABLE IF NOT EXISTS unit_asset_events (
        id                      bigserial   PRIMARY KEY,
        family                  text        NOT NULL,
        asset_id                uuid,
        action                  text        NOT NULL,
        actor_email             text,
        details                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
        created_at              timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS unit_asset_events_family_idx ON unit_asset_events (family, created_at DESC);
    `,
  },
  {
    version: 15,
    name: 'solve runs',
    // Account-scoped headless BOARD-SOLVER runs (ADR-0069 §5), mirroring train_runs.
    // `spec` is the immutable SolveSpec (level + bounds + mode) the solver Job reads;
    // `body` is the progressively-patched result (feasibility, tightening rootBounds,
    // proven census, final rootValue + piece values + tablebase ref); `status` is
    // pending|running|done|error|cancelled; `job_name` is the k8s Job the backend
    // launched (so a cancel can delete it). DELETE is cancel-not-purge (keeps body).
    sql: `
      CREATE TABLE IF NOT EXISTS solve_runs (
        id          text        PRIMARY KEY,
        owner_email text        NOT NULL,
        spec        jsonb       NOT NULL,
        body        jsonb       NOT NULL DEFAULT '{}'::jsonb,
        status      text        NOT NULL DEFAULT 'pending',
        job_name    text,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS solve_runs_owner_idx ON solve_runs (owner_email, created_at DESC);
    `,
  },
  {
    version: 16,
    name: 'durable account-owned level working copies',
    // A working copy is private account data with an opaque global document id;
    // account-local level ids (l1, l2, ...) are not safe URL identities. It never
    // expires and is never public-by-link.
    // revision is the compare-and-swap token; saved_revision equals revision exactly
    // when the working copy is known to match the canonical saved Level. baseline_hash
    // identifies the canonical Level the working copy was based on, so a later external
    // workspace write cannot be silently overwritten by a stale editor document.
    //
    // Preserve signed-in v13 rows: newest per real user/official level, and every
    // standalone "draft" under a unique legacy id. Then remove the superseded
    // public/edit-key subsystem.
    sql: `
      CREATE TABLE IF NOT EXISTS level_working_copies (
        document_id     text        PRIMARY KEY,
        owner_email     text        NOT NULL,
        workspace_kind  text        NOT NULL CHECK (workspace_kind IN ('user', 'official')),
        workspace_id    text        NOT NULL,
        level_id        text        NOT NULL,
        body            jsonb       NOT NULL,
        revision        bigint      NOT NULL DEFAULT 1 CHECK (revision >= 1),
        saved_revision  bigint      NOT NULL DEFAULT 0 CHECK (saved_revision >= 0 AND saved_revision <= revision),
        baseline_hash   text,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        UNIQUE (owner_email, workspace_kind, workspace_id, level_id),
        CHECK (
          (workspace_kind = 'user' AND workspace_id = 'campaign') OR
          (workspace_kind = 'official' AND char_length(workspace_id) > 0)
        )
      );
      CREATE INDEX IF NOT EXISTS level_working_copies_owner_updated_idx
        ON level_working_copies (owner_email, updated_at DESC);

      ALTER TABLE level_working_copies
        ADD COLUMN IF NOT EXISTS baseline_hash text;

      ALTER TABLE campaign_workspaces
        ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;

      WITH migratable AS (
        SELECT
          em.*,
          CASE
            -- The old editor created unrelated standalone maps with the shared
            -- placeholder id "draft". Give each one a distinct account-local id
            -- so the uniqueness constraint cannot collapse recoverable work.
            WHEN COALESCE(em.body->>'id', '') = 'draft'
              OR COALESCE(em.body->>'id', '') !~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$'
              THEN 'legacy-' || em.public_id
            ELSE em.body->>'id'
          END AS migrated_level_id,
          CASE WHEN COALESCE(em.body->>'id', '') ~ '^off-' THEN 'official' ELSE 'user' END AS migrated_workspace_kind,
          CASE WHEN COALESCE(em.body->>'id', '') ~ '^off-' THEN 'default' ELSE 'campaign' END AS migrated_workspace_id
        FROM editor_maps em
        WHERE em.owner_email IS NOT NULL
          AND jsonb_typeof(em.body) = 'object'
          AND em.public_id ~ '^[abcdefghijkmnpqrstuvwxyz23456789]{8,24}$'
      ), ranked AS (
        SELECT
          migratable.*,
          row_number() OVER (
            PARTITION BY owner_email, migrated_workspace_kind, migrated_workspace_id, migrated_level_id
            ORDER BY updated_at DESC, public_id
          ) AS level_rank
        FROM migratable
      ), prepared AS (
        SELECT
          ranked.*,
          jsonb_set(ranked.body, '{id}', to_jsonb(migrated_level_id), true) AS migrated_body,
          CASE
            WHEN migrated_workspace_kind = 'official'
              THEN (oc.data->'levels')->migrated_level_id
            ELSE (cw.body->'levels')->migrated_level_id
          END AS canonical_body
        FROM ranked
        LEFT JOIN campaign_workspaces cw
          ON migrated_workspace_kind = 'user' AND cw.owner_email = ranked.owner_email
        LEFT JOIN official_campaigns oc
          ON migrated_workspace_kind = 'official' AND oc.id = migrated_workspace_id
        WHERE level_rank = 1
      )
      INSERT INTO level_working_copies
        (document_id, owner_email, workspace_kind, workspace_id, level_id, body, revision, saved_revision, baseline_hash, created_at, updated_at)
      SELECT
        'legacy-' || public_id,
        owner_email,
        migrated_workspace_kind,
        migrated_workspace_id,
        migrated_level_id,
        migrated_body,
        CASE
          WHEN canonical_body IS NOT NULL AND canonical_body <> migrated_body THEN GREATEST(revision, 2)
          ELSE GREATEST(revision, 1)
        END,
        CASE
          WHEN canonical_body = migrated_body THEN GREATEST(revision, 1)
          -- Synthetic revision 1 represents the canonical baseline; revision
          -- 2+ is the recovered differing draft. This keeps saved_revision=0
          -- reserved for documents that truly have never had a saved Level.
          WHEN canonical_body IS NOT NULL THEN 1
          ELSE 0
        END,
        md5(canonical_body::text),
        created_at,
        updated_at
      FROM prepared
      ON CONFLICT (owner_email, workspace_kind, workspace_id, level_id) DO NOTHING;

      DROP TABLE IF EXISTS editor_map_audit_events;
      DROP TABLE IF EXISTS editor_maps;
    `,
  },
  {
    version: 17,
    name: 'block spatially resampled unit acceptance',
    // ADR-0076 keeps accepted-sprite recapture as a calibration instrument but forbids
    // promoting its resized pixels. This server-owned flag is monotonic: editing the human
    // method/notes later cannot erase the reason a candidate is ineligible for production.
    sql: `
      ALTER TABLE unit_assets
        ADD COLUMN IF NOT EXISTS acceptance_block_reason text;

      UPDATE unit_assets
         SET acceptance_block_reason = 'spatial-resampling'
       WHERE acceptance_block_reason IS NULL
         AND (
           method = 'Accepted sprite smooth recapture'
           OR notes ~ '"pipeline"[[:space:]]*:[[:space:]]*"accepted-sprite-recapture"'
           OR notes ~ '"spatialResampling"[[:space:]]*:[[:space:]]*true'
         );

      ALTER TABLE unit_assets
        ADD CONSTRAINT unit_assets_acceptance_block_reason_check
        CHECK (acceptance_block_reason IS NULL OR acceptance_block_reason = 'spatial-resampling');
    `,
  },
  {
    version: 18,
    name: 'shared live media catalog',
    // One content-addressed substrate for runtime, review, candidate, and source
    // media. Domain-specific consumers retain their own typed metadata in JSON,
    // while the shared tables own acceptance, revisions, immutable blob metadata,
    // native-pixel evidence, owner proof, and audit history.
    sql: `
      CREATE TABLE IF NOT EXISTS media_slots (
        slot                    text        PRIMARY KEY,
        domain                  text        NOT NULL,
        role                    text        NOT NULL,
        availability_policy     text        NOT NULL DEFAULT 'critical'
          CHECK (availability_policy IN ('critical', 'decorative')),
        lifecycle_state         text        NOT NULL DEFAULT 'staging'
          CHECK (lifecycle_state IN ('staging', 'active', 'retired')),
        active_version_id       uuid,
        activated_at            timestamptz,
        retired_at              timestamptz,
        retirement_evidence     jsonb       NOT NULL DEFAULT '{}'::jsonb,
        metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
        row_revision            bigint      NOT NULL DEFAULT 0 CHECK (row_revision >= 0),
        created_at              timestamptz NOT NULL DEFAULT now(),
        updated_at              timestamptz NOT NULL DEFAULT now(),
        updated_by              text,
        CHECK (char_length(slot) BETWEEN 1 AND 512),
        CHECK (slot ~ '^[A-Za-z0-9_][A-Za-z0-9._@+-]*(/[A-Za-z0-9_][A-Za-z0-9._@+-]*)*$'),
        CHECK (slot !~ '(^|/)\\.\\.?(/|$)' AND slot !~ '//' AND right(slot, 1) <> '/'),
        CHECK (slot <> 'level-thumb' AND slot NOT LIKE 'level-thumb/%'),
        CHECK (
          (lifecycle_state = 'staging' AND active_version_id IS NULL AND activated_at IS NULL AND retired_at IS NULL) OR
          (lifecycle_state = 'active' AND active_version_id IS NOT NULL AND activated_at IS NOT NULL AND retired_at IS NULL) OR
          (lifecycle_state = 'retired' AND active_version_id IS NULL AND retired_at IS NOT NULL)
        )
      );

      CREATE TABLE IF NOT EXISTS media_blobs (
        sha256                  text        PRIMARY KEY CHECK (sha256 ~ '^[0-9a-f]{64}$'),
        blob_key                text        NOT NULL UNIQUE,
        media_type              text        NOT NULL,
        byte_length             bigint      NOT NULL CHECK (byte_length > 0 AND byte_length <= 33554432),
        width                   integer     CHECK (width IS NULL OR (width > 0 AND width <= 32768)),
        height                  integer     CHECK (height IS NULL OR (height > 0 AND height <= 32768)),
        published_at            timestamptz,
        created_at              timestamptz NOT NULL DEFAULT now(),
        CHECK ((width IS NULL) = (height IS NULL)),
        CHECK (width IS NULL OR width::bigint * height::bigint <= 8388608),
        CHECK (blob_key = 'objects/' || left(sha256, 2) || '/' || sha256)
      );

      CREATE TABLE IF NOT EXISTS media_versions (
        id                      uuid        PRIMARY KEY,
        slot                    text        REFERENCES media_slots(slot) ON DELETE RESTRICT,
        source_path             text,
        domain                  text        NOT NULL,
        role                    text        NOT NULL,
        label                   text        NOT NULL,
        status                  text        NOT NULL DEFAULT 'candidate'
          CHECK (status IN ('candidate', 'accepted', 'legacy-bridge', 'archived')),
        blob_sha256             text        REFERENCES media_blobs(sha256) ON DELETE RESTRICT,
        metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
        provenance              jsonb       NOT NULL DEFAULT '{}'::jsonb,
        native_evidence         jsonb       NOT NULL DEFAULT '{}'::jsonb,
        review_evidence         jsonb       NOT NULL DEFAULT '{}'::jsonb,
        idempotency_actor       text,
        idempotency_key         text,
        request_fingerprint     text,
        row_revision            bigint      NOT NULL DEFAULT 0 CHECK (row_revision >= 0),
        created_at              timestamptz NOT NULL DEFAULT now(),
        updated_at              timestamptz NOT NULL DEFAULT now(),
        updated_by              text,
        UNIQUE (id, slot),
        CHECK (slot IS NOT NULL OR source_path IS NOT NULL),
        CHECK (status NOT IN ('accepted', 'legacy-bridge') OR slot IS NOT NULL),
        CHECK (source_path IS NULL OR (char_length(source_path) BETWEEN 1 AND 1024)),
        CHECK (
          (idempotency_actor IS NULL AND idempotency_key IS NULL AND request_fingerprint IS NULL) OR
          (char_length(idempotency_actor) BETWEEN 1 AND 320
            AND char_length(idempotency_key) BETWEEN 1 AND 200
            AND request_fingerprint ~ '^[0-9a-f]{64}$')
        )
      );
      CREATE INDEX IF NOT EXISTS media_versions_slot_status_idx
        ON media_versions (slot, status, updated_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS media_versions_one_active_idx
        ON media_versions (slot) WHERE status IN ('accepted', 'legacy-bridge');
      CREATE UNIQUE INDEX IF NOT EXISTS media_versions_idempotency_idx
        ON media_versions (idempotency_actor, idempotency_key)
        WHERE idempotency_key IS NOT NULL;

      ALTER TABLE media_slots
        ADD CONSTRAINT media_slots_active_version_fk
        FOREIGN KEY (active_version_id, slot) REFERENCES media_versions (id, slot);

      CREATE TABLE IF NOT EXISTS media_catalog_state (
        singleton               boolean     PRIMARY KEY DEFAULT true CHECK (singleton),
        revision                bigint      NOT NULL DEFAULT 0,
        updated_at              timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO media_catalog_state (singleton) VALUES (true)
        ON CONFLICT (singleton) DO NOTHING;

      CREATE TABLE IF NOT EXISTS media_asset_events (
        id                      bigserial   PRIMARY KEY,
        slot                    text,
        source_path             text,
        version_id              uuid,
        action                  text        NOT NULL,
        actor_email             text,
        details                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
        created_at              timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS media_asset_events_slot_idx
        ON media_asset_events (slot, created_at DESC, id DESC);
    `,
  },
  {
    version: 19,
    name: 'global SFX profile',
    // One complete, owner-editable SFX document. The row is intentionally not
    // seeded: absence means decorative silence, while sound-set identity, mix
    // gains, terrain assignments, and arrival behavior remain DB-authoritative.
    sql: `
      CREATE TABLE IF NOT EXISTS sfx_profiles (
        id                    text        PRIMARY KEY CHECK (id = 'default'),
        data                  jsonb       NOT NULL,
        client_schema_version integer     NOT NULL CHECK (client_schema_version = 1),
        revision              bigint      NOT NULL DEFAULT 0 CHECK (revision >= 0),
        created_at            timestamptz NOT NULL DEFAULT now(),
        updated_at            timestamptz NOT NULL DEFAULT now(),
        updated_by            text
      );
    `,
  },
  {
    version: 20,
    name: 'database-owned drawable catalog',
    // Logical installed content is distinct from its media roles. Git owns the
    // renderer's behavior vocabulary; these rows own the installed inventory,
    // labels, ordering, configuration, and semantic-slot membership.
    sql: `
      CREATE TABLE IF NOT EXISTS drawable_assets (
        id                  text        PRIMARY KEY,
        kind                text        NOT NULL,
        label               text        NOT NULL,
        sort_order          integer     NOT NULL DEFAULT 0,
        lifecycle_state     text        NOT NULL DEFAULT 'active'
          CHECK (lifecycle_state IN ('active', 'retired')),
        behavior            jsonb       NOT NULL DEFAULT '{}'::jsonb,
        metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
        row_revision        bigint      NOT NULL DEFAULT 0 CHECK (row_revision >= 0),
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now(),
        updated_by          text,
        CHECK (id ~ '^[a-z][a-z0-9._-]{0,127}$'),
        CHECK (kind ~ '^[a-z][a-z0-9._-]{0,63}$'),
        CHECK (char_length(label) BETWEEN 1 AND 160)
      );

      CREATE TABLE IF NOT EXISTS drawable_asset_media (
        asset_id            text        NOT NULL REFERENCES drawable_assets(id) ON DELETE CASCADE,
        role                text        NOT NULL CHECK (role ~ '^[a-z][a-z0-9._-]{0,63}$'),
        slot                text        NOT NULL REFERENCES media_slots(slot) ON DELETE RESTRICT,
        PRIMARY KEY (asset_id, role),
        UNIQUE (asset_id, slot)
      );
      CREATE INDEX IF NOT EXISTS drawable_asset_media_slot_idx ON drawable_asset_media (slot);

      CREATE TABLE IF NOT EXISTS drawable_catalog_state (
        singleton           boolean     PRIMARY KEY DEFAULT true CHECK (singleton),
        revision            bigint      NOT NULL DEFAULT 0 CHECK (revision >= 0),
        updated_at          timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO drawable_catalog_state (singleton) VALUES (true)
        ON CONFLICT (singleton) DO NOTHING;

      CREATE TABLE IF NOT EXISTS drawable_asset_events (
        id                  bigserial   PRIMARY KEY,
        asset_id            text        NOT NULL,
        action              text        NOT NULL,
        actor_email         text,
        details             jsonb       NOT NULL DEFAULT '{}'::jsonb,
        created_at          timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS drawable_asset_events_asset_idx
        ON drawable_asset_events (asset_id, created_at DESC, id DESC);
    `,
  },
  {
    version: 21,
    name: 'immutable level thumbnail derivatives',
    sql: `
      CREATE TABLE IF NOT EXISTS level_thumbnail_derivatives (
        authority_key       text        PRIMARY KEY,
        content_version     text        NOT NULL,
        blob_sha256         text        NOT NULL REFERENCES media_blobs(sha256) ON DELETE RESTRICT,
        width               integer     NOT NULL CHECK (width > 0),
        height              integer     NOT NULL CHECK (height > 0),
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now(),
        CHECK (char_length(authority_key) BETWEEN 1 AND 512),
        CHECK (char_length(content_version) BETWEEN 1 AND 512)
      );
      CREATE INDEX IF NOT EXISTS level_thumbnail_derivatives_blob_idx
        ON level_thumbnail_derivatives (blob_sha256);
    `,
  },
  {
    version: 22,
    name: 'repair immutable level thumbnail derivative schema',
    // Production had already recorded migration number 21 from an earlier
    // deployment state without this relation. Never rewrite recorded history:
    // a new idempotent migration repairs the required schema deterministically.
    sql: `
      CREATE TABLE IF NOT EXISTS level_thumbnail_derivatives (
        authority_key       text        PRIMARY KEY,
        content_version     text        NOT NULL,
        blob_sha256         text        NOT NULL REFERENCES media_blobs(sha256) ON DELETE RESTRICT,
        width               integer     NOT NULL CHECK (width > 0),
        height              integer     NOT NULL CHECK (height > 0),
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now(),
        CHECK (char_length(authority_key) BETWEEN 1 AND 512),
        CHECK (char_length(content_version) BETWEEN 1 AND 512)
      );
      CREATE INDEX IF NOT EXISTS level_thumbnail_derivatives_blob_idx
        ON level_thumbnail_derivatives (blob_sha256);
    `,
  },
  {
    version: 23,
    name: 'wall art joins the drawable catalog',
    // Preserve the live owner-authored document by projecting each member into
    // the canonical installed-content catalog, then retire the parallel store.
    // No concrete wall-art identity or fallback is introduced by this migration.
    sql: `
      CREATE TABLE IF NOT EXISTS wall_art (
        id text PRIMARY KEY, data jsonb NOT NULL, client_schema_version integer,
        revision integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(), updated_by text
      );
      WITH source AS (
        SELECT entry.key AS id, entry.value AS definition,
               row_number() OVER (ORDER BY entry.key) - 1 AS sort_order
          FROM wall_art document
          CROSS JOIN LATERAL jsonb_each(document.data) entry
         WHERE document.id = 'default'
      ), migrated AS (
        INSERT INTO drawable_assets
          (id, kind, label, sort_order, lifecycle_state, behavior, metadata, row_revision, updated_by)
        SELECT id, 'wall-art', definition->>'label', sort_order, 'active',
               definition - 'label', '{}'::jsonb, 1, 'wall-art-store-migration'
          FROM source
         WHERE definition ? 'label' AND definition ? 'slots'
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      )
      UPDATE drawable_catalog_state
         SET revision = revision + (SELECT count(*) FROM migrated), updated_at = now()
       WHERE singleton = true AND EXISTS (SELECT 1 FROM migrated);

      DROP TABLE wall_art;
    `,
  },
  {
    version: 24,
    name: 'durable level working copy revision history',
    // The working-copy row remains the latest value and CAS authority. This table
    // preserves prior acknowledged values so recovery is a normal owner operation,
    // not browser-database forensics. Keep the newest 200 revisions, one daily
    // checkpoint, and every explicit lifecycle boundary (Save/Discard/Restore).
    sql: `
      CREATE TABLE IF NOT EXISTS level_working_copy_revisions (
        document_id           text        NOT NULL REFERENCES level_working_copies(document_id) ON DELETE CASCADE,
        revision              bigint      NOT NULL CHECK (revision >= 1),
        body                  jsonb       NOT NULL,
        saved_revision        bigint      NOT NULL CHECK (saved_revision >= 0 AND saved_revision <= revision),
        baseline_hash         text,
        reason                text        NOT NULL CHECK (reason IN (
          'migration', 'resolve', 'create', 'autosave', 'save', 'discard',
          'restore', 'canonical-refresh'
        )),
        restored_from_revision bigint     CHECK (restored_from_revision IS NULL OR restored_from_revision >= 1),
        created_at            timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (document_id, revision)
      );
      CREATE INDEX IF NOT EXISTS level_working_copy_revisions_document_created_idx
        ON level_working_copy_revisions (document_id, created_at DESC, revision DESC);

      INSERT INTO level_working_copy_revisions
        (document_id, revision, body, saved_revision, baseline_hash, reason, created_at)
      SELECT document_id, revision, body, saved_revision, baseline_hash, 'migration', updated_at
        FROM level_working_copies
      ON CONFLICT (document_id, revision) DO NOTHING;
    `,
  },
  {
    version: 25,
    name: 'attributed fenced level editor sessions',
    // Content revision protects the working body from stale writes. edit_generation is
    // deliberately separate: it is a fencing token for the one tab/device currently
    // authorized to write, and takeover advances it without pretending the Level changed.
    // Every displaced server-acknowledged branch is retained independently so acquiring
    // the edit lease never destroys the prior editor's recoverable state.
    sql: `
      ALTER TABLE level_working_copies
        ADD COLUMN IF NOT EXISTS edit_generation bigint NOT NULL DEFAULT 0
        CHECK (edit_generation >= 0);

      CREATE TABLE IF NOT EXISTS editor_document_edit_sessions (
        session_id              uuid        PRIMARY KEY,
        document_id             text        NOT NULL REFERENCES level_working_copies(document_id) ON DELETE CASCADE,
        owner_email             text        NOT NULL,
        actor_name              text        NOT NULL,
        device_hash             text        NOT NULL,
        session_key_hash        text        NOT NULL,
        client_label            text        NOT NULL DEFAULT '',
        state                   text        NOT NULL CHECK (state IN ('active', 'waiting', 'displaced', 'expired', 'closed')),
        edit_generation         bigint      NOT NULL CHECK (edit_generation >= 0),
        draft_body              jsonb       NOT NULL,
        document_revision       bigint      NOT NULL CHECK (document_revision >= 1),
        opened_at               timestamptz NOT NULL DEFAULT now(),
        last_seen_at            timestamptz NOT NULL DEFAULT now(),
        last_edit_at            timestamptz,
        body_checkpoint_at      timestamptz NOT NULL DEFAULT now(),
        lease_expires_at        timestamptz,
        displaced_at            timestamptz,
        displaced_by_session_id uuid,
        CHECK (char_length(device_hash) = 64),
        CONSTRAINT editor_document_edit_sessions_session_key_hash_check
          CHECK (char_length(session_key_hash) = 64),
        CHECK (char_length(client_label) <= 120),
        CHECK (
          (state = 'active' AND lease_expires_at IS NOT NULL) OR
          state <> 'active'
        )
      );
      CREATE UNIQUE INDEX IF NOT EXISTS editor_document_one_active_session_idx
        ON editor_document_edit_sessions (document_id) WHERE state = 'active';
      CREATE INDEX IF NOT EXISTS editor_document_sessions_document_seen_idx
        ON editor_document_edit_sessions (document_id, last_seen_at DESC);

      CREATE TABLE IF NOT EXISTS editor_document_recoveries (
        recovery_id             uuid        PRIMARY KEY,
        document_id             text        NOT NULL REFERENCES level_working_copies(document_id) ON DELETE CASCADE,
        source_session_id       uuid        NOT NULL,
        displaced_by_session_id uuid,
        owner_email             text        NOT NULL,
        actor_name              text        NOT NULL,
        source_client_label     text        NOT NULL DEFAULT '',
        body                    jsonb       NOT NULL,
        document_revision       bigint      NOT NULL CHECK (document_revision >= 1),
        edit_generation         bigint      NOT NULL CHECK (edit_generation >= 0),
        capture_source          text        NOT NULL CHECK (capture_source IN ('server-acknowledged', 'displaced-client-upload')),
        body_checkpoint_at      timestamptz NOT NULL,
        reason                  text        NOT NULL CHECK (reason IN ('takeover', 'lease-expired', 'displaced-upload', 'pre-restore')),
        created_at              timestamptz NOT NULL DEFAULT now(),
        resolved_at             timestamptz
      );
      CREATE INDEX IF NOT EXISTS editor_document_recoveries_document_created_idx
        ON editor_document_recoveries (document_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS editor_document_recoveries_session_created_idx
        ON editor_document_recoveries (source_session_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS editor_document_edit_events (
        id                      bigserial   PRIMARY KEY,
        document_id             text        NOT NULL,
        session_id              uuid,
        action                  text        NOT NULL,
        actor_email             text        NOT NULL,
        actor_name              text        NOT NULL,
        details                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
        created_at              timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS editor_document_edit_events_document_idx
        ON editor_document_edit_events (document_id, created_at DESC, id DESC);
    `,
  },
  {
    version: 26,
    name: 'record resolved editor recovery checkpoints',
    // Restoring a recovery does not delete or rewrite its captured branch. The
    // nullable timestamp only records that the owner has applied it, while the
    // immutable source body and provenance remain available until explicit delete.
    sql: `
      ALTER TABLE editor_document_recoveries
        ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
    `,
  },
  {
    version: 27,
    name: 'bind editor sessions to private page keys',
    // Any sessions created before the private bearer key existed are deliberately
    // made unusable. Their opaque ids remain attribution, while no raw key is
    // recoverable from the sentinel hash and their short leases expire normally.
    sql: `
      ALTER TABLE editor_document_edit_sessions
        ADD COLUMN IF NOT EXISTS session_key_hash text;
      UPDATE editor_document_edit_sessions
         SET session_key_hash = repeat('0', 64)
       WHERE session_key_hash IS NULL;
      ALTER TABLE editor_document_edit_sessions
        ALTER COLUMN session_key_hash SET NOT NULL;
      ALTER TABLE editor_document_edit_sessions
        DROP CONSTRAINT IF EXISTS editor_document_edit_sessions_session_key_hash_check;
      ALTER TABLE editor_document_edit_sessions
        ADD CONSTRAINT editor_document_edit_sessions_session_key_hash_check
        CHECK (char_length(session_key_hash) = 64);
    `,
  },
  {
    version: 28,
    name: 'immutable editor background versions',
    // Raw generation results, deterministic warps, and derived occlusion masks
    // are immutable document-owned artifacts. The Level stores only selected
    // ids; official or public-map publication exposes exact referenced rows
    // atomically, while private Save keeps them owner-scoped.
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS level_working_copies_document_owner_level_idx
        ON level_working_copies (document_id, owner_email, level_id);

      CREATE TABLE IF NOT EXISTS predrawn_background_versions (
        id                            uuid        PRIMARY KEY,
        document_id                   text        NOT NULL,
        owner_email                   text        NOT NULL,
        level_id                      text        NOT NULL,
        kind                          text        NOT NULL CHECK (kind IN ('raw', 'warped', 'occlusion')),
        label                         text        NOT NULL CHECK (char_length(label) BETWEEN 1 AND 160),
        parent_version_id             uuid,
        source_background_version_id  uuid,
        blob_sha256                   text        REFERENCES media_blobs(sha256) ON DELETE RESTRICT,
        width                         integer     CHECK (width IS NULL OR (width > 0 AND width <= 32768)),
        height                        integer     CHECK (height IS NULL OR (height > 0 AND height <= 32768)),
        world_bounds                  jsonb       NOT NULL CHECK (jsonb_typeof(world_bounds) = 'object'),
        operation                     jsonb       NOT NULL CHECK (jsonb_typeof(operation) = 'object' AND operation <> '{}'::jsonb),
        provenance                    jsonb       NOT NULL CHECK (jsonb_typeof(provenance) = 'object' AND provenance <> '{}'::jsonb),
        status                        text        NOT NULL DEFAULT 'ready'
          CHECK (status IN ('ready', 'archived', 'published')),
        idempotency_actor             text,
        idempotency_key               text,
        request_fingerprint           text,
        row_revision                  bigint      NOT NULL DEFAULT 0 CHECK (row_revision >= 0),
        created_by_email              text        NOT NULL,
        created_by_name               text        NOT NULL,
        created_at                    timestamptz NOT NULL DEFAULT now(),
        updated_at                    timestamptz NOT NULL DEFAULT now(),
        updated_by                    text        NOT NULL,
        archived_at                   timestamptz,
        archived_by                   text,
        published_at                  timestamptz,
        published_by                  text,
        UNIQUE (id, document_id),
        FOREIGN KEY (document_id, owner_email, level_id)
          REFERENCES level_working_copies(document_id, owner_email, level_id) ON DELETE CASCADE,
        FOREIGN KEY (parent_version_id, document_id)
          REFERENCES predrawn_background_versions(id, document_id) ON DELETE CASCADE,
        FOREIGN KEY (source_background_version_id, document_id)
          REFERENCES predrawn_background_versions(id, document_id) ON DELETE CASCADE,
        CHECK ((blob_sha256 IS NULL AND width IS NULL AND height IS NULL)
          OR (blob_sha256 IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL)),
        CHECK (width IS NULL OR width::bigint * height::bigint <= 8388608),
        CHECK (
          (kind = 'raw' AND parent_version_id IS NULL AND source_background_version_id IS NULL) OR
          (kind = 'warped' AND parent_version_id IS NOT NULL) OR
          (kind = 'occlusion' AND source_background_version_id IS NOT NULL)
        ),
        CHECK (
          (idempotency_actor IS NULL AND idempotency_key IS NULL AND request_fingerprint IS NULL) OR
          (char_length(idempotency_actor) BETWEEN 1 AND 320
            AND char_length(idempotency_key) BETWEEN 1 AND 200
            AND request_fingerprint ~ '^[0-9a-f]{64}$')
        ),
        CHECK (
          (status = 'ready' AND archived_at IS NULL AND archived_by IS NULL AND published_at IS NULL AND published_by IS NULL) OR
          (status = 'archived' AND archived_at IS NOT NULL AND archived_by IS NOT NULL AND published_at IS NULL AND published_by IS NULL) OR
          (status = 'published' AND blob_sha256 IS NOT NULL AND archived_at IS NULL AND archived_by IS NULL
            AND published_at IS NOT NULL AND published_by IS NOT NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS predrawn_background_versions_document_created_idx
        ON predrawn_background_versions (document_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS predrawn_background_versions_blob_idx
        ON predrawn_background_versions (blob_sha256) WHERE blob_sha256 IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS predrawn_background_versions_idempotency_idx
        ON predrawn_background_versions (idempotency_actor, idempotency_key)
        WHERE idempotency_key IS NOT NULL;

      CREATE TABLE IF NOT EXISTS predrawn_background_version_events (
        id                  bigserial   PRIMARY KEY,
        document_id         text        NOT NULL,
        version_id          uuid        NOT NULL,
        action              text        NOT NULL CHECK (action IN ('created', 'content-uploaded', 'archived', 'published')),
        actor_email         text        NOT NULL,
        actor_name          text        NOT NULL,
        details             jsonb       NOT NULL DEFAULT '{}'::jsonb,
        created_at          timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (version_id, document_id)
          REFERENCES predrawn_background_versions(id, document_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS predrawn_background_version_events_version_idx
        ON predrawn_background_version_events (version_id, created_at DESC, id DESC);
    `,
  },
  {
    version: 29,
    name: 'observation-only level editor sessions',
    sql: `
      ALTER TABLE editor_document_edit_sessions
        DROP CONSTRAINT IF EXISTS editor_document_edit_sessions_state_check;
      ALTER TABLE editor_document_edit_sessions
        ADD CONSTRAINT editor_document_edit_sessions_state_check
        CHECK (state IN ('active', 'waiting', 'observing', 'displaced', 'expired', 'closed'));
    `,
  },
  {
    version: 30,
    name: 'bind legacy predrawn geometry fingerprints to cover-independent v2',
    // Immutable v1 artifacts included live cover in their environment digest. A
    // transaction may bind one only after reproducing that exact v1 digest from
    // the server-held Level. The external binding preserves immutable version
    // metadata while giving every later canonical boundary one stable v2 digest.
    sql: `
      CREATE TABLE IF NOT EXISTS predrawn_background_geometry_bindings (
        version_id                           uuid        PRIMARY KEY,
        document_id                          text        NOT NULL,
        legacy_environment_geometry_schema   text        NOT NULL
          CHECK (legacy_environment_geometry_schema = 'predrawn-environment-geometry-v1'),
        legacy_environment_geometry_sha256   text        NOT NULL
          CHECK (legacy_environment_geometry_sha256 ~ '^[0-9a-f]{64}$'),
        environment_geometry_schema          text        NOT NULL
          CHECK (environment_geometry_schema = 'predrawn-environment-geometry-v2'),
        environment_geometry_sha256          text        NOT NULL
          CHECK (environment_geometry_sha256 ~ '^[0-9a-f]{64}$'),
        bound_by_email                        text        NOT NULL,
        bound_by_name                         text        NOT NULL,
        bound_at                              timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (version_id, document_id)
          REFERENCES predrawn_background_versions(id, document_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS predrawn_background_geometry_bindings_document_idx
        ON predrawn_background_geometry_bindings (document_id, version_id);
    `,
  },
  {
    version: 31,
    name: 'source artwork and bounded generation attempts',
    // Source inputs share the immutable, quota-accounted artwork store. A
    // generation attempt owns at most one result for each committed stage.
    // Existing version graphs predate saved source inputs, so the migration
    // records them honestly as read-only history instead of inventing lineage.
    sql: `
      ALTER TABLE predrawn_background_versions
        DROP CONSTRAINT IF EXISTS predrawn_background_versions_kind_check;
      ALTER TABLE predrawn_background_versions
        ADD CONSTRAINT predrawn_background_versions_kind_check
        CHECK (kind IN ('source', 'raw', 'warped', 'occlusion'));
      ALTER TABLE predrawn_background_versions
        DROP CONSTRAINT IF EXISTS predrawn_background_versions_check2;
      ALTER TABLE predrawn_background_versions
        DROP CONSTRAINT IF EXISTS predrawn_background_versions_lineage_check;
      ALTER TABLE predrawn_background_versions
        ADD CONSTRAINT predrawn_background_versions_lineage_check
        CHECK (
          (kind IN ('source', 'raw') AND parent_version_id IS NULL AND source_background_version_id IS NULL) OR
          (kind = 'warped' AND parent_version_id IS NOT NULL) OR
          (kind = 'occlusion' AND source_background_version_id IS NOT NULL)
        );

      CREATE TABLE IF NOT EXISTS predrawn_generation_attempts (
        id                      uuid        PRIMARY KEY,
        document_id             text        NOT NULL,
        owner_email             text        NOT NULL,
        level_id                text        NOT NULL,
        label                   text        NOT NULL CHECK (char_length(label) BETWEEN 1 AND 160),
        origin                  text        NOT NULL CHECK (origin IN ('source', 'migrated-history')),
        source_version_id       uuid,
        generated_version_id    uuid,
        warped_version_id       uuid,
        occlusion_version_id    uuid,
        status                  text        NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'archived')),
        idempotency_actor       text,
        idempotency_key         text,
        request_fingerprint     text,
        row_revision            bigint      NOT NULL DEFAULT 0 CHECK (row_revision >= 0),
        created_by_email        text        NOT NULL,
        created_by_name         text        NOT NULL,
        created_at              timestamptz NOT NULL DEFAULT now(),
        updated_at              timestamptz NOT NULL DEFAULT now(),
        updated_by              text        NOT NULL,
        archived_at             timestamptz,
        archived_by             text,
        UNIQUE (id, document_id),
        FOREIGN KEY (document_id, owner_email, level_id)
          REFERENCES level_working_copies(document_id, owner_email, level_id) ON DELETE CASCADE,
        FOREIGN KEY (source_version_id, document_id)
          REFERENCES predrawn_background_versions(id, document_id) ON DELETE RESTRICT,
        FOREIGN KEY (generated_version_id, document_id)
          REFERENCES predrawn_background_versions(id, document_id) ON DELETE RESTRICT,
        FOREIGN KEY (warped_version_id, document_id)
          REFERENCES predrawn_background_versions(id, document_id) ON DELETE RESTRICT,
        FOREIGN KEY (occlusion_version_id, document_id)
          REFERENCES predrawn_background_versions(id, document_id) ON DELETE RESTRICT,
        CHECK (
          (origin = 'source' AND source_version_id IS NOT NULL) OR
          (origin = 'migrated-history' AND source_version_id IS NULL)
        ),
        CHECK (warped_version_id IS NULL OR generated_version_id IS NOT NULL),
        CHECK (occlusion_version_id IS NULL OR warped_version_id IS NOT NULL),
        CHECK (
          (idempotency_actor IS NULL AND idempotency_key IS NULL AND request_fingerprint IS NULL) OR
          (char_length(idempotency_actor) BETWEEN 1 AND 320
            AND char_length(idempotency_key) BETWEEN 1 AND 200
            AND request_fingerprint ~ '^[0-9a-f]{64}$')
        ),
        CHECK (
          (status = 'active' AND archived_at IS NULL AND archived_by IS NULL) OR
          (status = 'archived' AND archived_at IS NOT NULL AND archived_by IS NOT NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS predrawn_generation_attempts_document_created_idx
        ON predrawn_generation_attempts (document_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS predrawn_generation_attempts_source_idx
        ON predrawn_generation_attempts (source_version_id)
        WHERE source_version_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS predrawn_generation_attempts_idempotency_idx
        ON predrawn_generation_attempts (idempotency_actor, idempotency_key)
        WHERE idempotency_key IS NOT NULL;

      CREATE TABLE IF NOT EXISTS predrawn_generation_attempt_events (
        id                  bigserial   PRIMARY KEY,
        document_id         text        NOT NULL,
        attempt_id          uuid        NOT NULL,
        action              text        NOT NULL
          CHECK (action IN ('created', 'stage-attached', 'archived')),
        actor_email         text        NOT NULL,
        actor_name          text        NOT NULL,
        details             jsonb       NOT NULL DEFAULT '{}'::jsonb,
        created_at          timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (attempt_id, document_id)
          REFERENCES predrawn_generation_attempts(id, document_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS predrawn_generation_attempt_events_attempt_idx
        ON predrawn_generation_attempt_events (attempt_id, created_at DESC, id DESC);

      WITH terminal_versions AS (
        SELECT terminal.*
          FROM predrawn_background_versions terminal
         WHERE terminal.kind IN ('raw', 'warped', 'occlusion')
           AND NOT EXISTS (
             SELECT 1
               FROM predrawn_background_versions child
              WHERE child.document_id = terminal.document_id
                AND (
                  (terminal.kind = 'raw'
                    AND child.kind = 'warped'
                    AND child.parent_version_id = terminal.id)
                  OR
                  (terminal.kind = 'warped'
                    AND child.kind = 'occlusion'
                    AND child.source_background_version_id = terminal.id)
                  OR
                  (terminal.kind = 'occlusion'
                    AND child.kind = 'occlusion'
                    AND child.parent_version_id = terminal.id)
                )
           )
      ),
      migrated_attempts AS (
        SELECT
          overlay(overlay(md5('predrawn-migrated-attempt:' || terminal.id::text)
            placing '4' from 13) placing '8' from 17)::uuid AS id,
          terminal.document_id,
          terminal.owner_email,
          terminal.level_id,
          ('Historical artwork ' || left(terminal.id::text, 8))::text AS label,
          CASE
            WHEN terminal.kind = 'raw' THEN terminal.id
            WHEN terminal.kind = 'warped' THEN terminal.parent_version_id
            ELSE warped.parent_version_id
          END AS generated_version_id,
          CASE
            WHEN terminal.kind = 'warped' THEN terminal.id
            WHEN terminal.kind = 'occlusion' THEN terminal.source_background_version_id
            ELSE NULL
          END AS warped_version_id,
          CASE WHEN terminal.kind = 'occlusion' THEN terminal.id ELSE NULL END
            AS occlusion_version_id,
          CASE WHEN terminal.status = 'archived' THEN 'archived' ELSE 'active' END AS status,
          terminal.created_by_email,
          terminal.created_by_name,
          terminal.created_at,
          terminal.updated_at,
          terminal.updated_by,
          CASE WHEN terminal.status = 'archived'
            THEN COALESCE(terminal.archived_at, terminal.updated_at) ELSE NULL END AS archived_at,
          CASE WHEN terminal.status = 'archived'
            THEN COALESCE(terminal.archived_by, terminal.updated_by) ELSE NULL END AS archived_by
        FROM terminal_versions terminal
        LEFT JOIN predrawn_background_versions warped
          ON terminal.kind = 'occlusion'
         AND warped.document_id = terminal.document_id
         AND warped.id = terminal.source_background_version_id
         AND warped.kind = 'warped'
      )
      INSERT INTO predrawn_generation_attempts (
        id, document_id, owner_email, level_id, label, origin,
        source_version_id, generated_version_id, warped_version_id, occlusion_version_id,
        status, created_by_email, created_by_name, created_at,
        updated_at, updated_by, archived_at, archived_by
      )
      SELECT
        id, document_id, owner_email, level_id, label, 'migrated-history',
        NULL, generated_version_id, warped_version_id, occlusion_version_id,
        status, created_by_email, created_by_name, created_at,
        updated_at, updated_by, archived_at, archived_by
      FROM migrated_attempts
      WHERE generated_version_id IS NOT NULL
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO predrawn_generation_attempt_events (
        document_id, attempt_id, action, actor_email, actor_name, details, created_at
      )
      SELECT
        attempt.document_id,
        attempt.id,
        'created',
        attempt.created_by_email,
        attempt.created_by_name,
        jsonb_build_object('origin', 'migrated-history', 'source_available', false),
        attempt.created_at
      FROM predrawn_generation_attempts attempt
      WHERE attempt.origin = 'migrated-history'
        AND NOT EXISTS (
          SELECT 1 FROM predrawn_generation_attempt_events event
           WHERE event.attempt_id = attempt.id AND event.action = 'created'
        );
    `,
  },
  {
    version: 32,
    name: 'generation attempts bind immutable source requests',
    // Existing source attempts predate reconstructable semantic snapshots. Keep
    // them visible but unbound so the application can fail closed honestly;
    // every newly created attempt stores the exact validated Source Artwork
    // request that all later deterministic processing must use.
    sql: `
      ALTER TABLE predrawn_generation_attempts
        ADD COLUMN IF NOT EXISTS source_request jsonb;
      ALTER TABLE predrawn_generation_attempts
        DROP CONSTRAINT IF EXISTS predrawn_generation_attempts_source_request_check;
      ALTER TABLE predrawn_generation_attempts
        ADD CONSTRAINT predrawn_generation_attempts_source_request_check
        CHECK (source_request IS NULL OR jsonb_typeof(source_request) = 'object');
    `,
  },
  {
    version: 33,
    name: 'generation attempts may reuse an exact raw pipeline source',
    // Reuse is a new attempt input role, not another stage on the source
    // attempt. The exact retained raw version remains immutable and the
    // document-scoped self-reference records which slot supplied it.
    sql: `
      ALTER TABLE predrawn_generation_attempts
        ADD COLUMN IF NOT EXISTS source_attempt_id uuid;

      DO $$
      DECLARE constraint_name text;
      BEGIN
        FOR constraint_name IN
          SELECT conname
            FROM pg_constraint
           WHERE conrelid = 'predrawn_generation_attempts'::regclass
             AND contype = 'c'
             AND pg_get_constraintdef(oid) LIKE '%origin%'
        LOOP
          EXECUTE format(
            'ALTER TABLE predrawn_generation_attempts DROP CONSTRAINT %I',
            constraint_name
          );
        END LOOP;
      END $$;

      ALTER TABLE predrawn_generation_attempts
        ADD CONSTRAINT predrawn_generation_attempts_origin_check
        CHECK (origin IN ('source', 'pipeline-source', 'migrated-history'));
      ALTER TABLE predrawn_generation_attempts
        ADD CONSTRAINT predrawn_generation_attempts_input_check
        CHECK (
          (origin = 'source'
            AND source_version_id IS NOT NULL
            AND source_attempt_id IS NULL)
          OR
          (origin = 'pipeline-source'
            AND source_version_id IS NOT NULL
            AND source_attempt_id IS NOT NULL)
          OR
          (origin = 'migrated-history'
            AND source_version_id IS NULL
            AND source_attempt_id IS NULL)
        );
      ALTER TABLE predrawn_generation_attempts
        DROP CONSTRAINT IF EXISTS predrawn_generation_attempts_source_attempt_fk;
      ALTER TABLE predrawn_generation_attempts
        ADD CONSTRAINT predrawn_generation_attempts_source_attempt_fk
        FOREIGN KEY (source_attempt_id, document_id)
        REFERENCES predrawn_generation_attempts(id, document_id) ON DELETE RESTRICT;

      CREATE INDEX IF NOT EXISTS predrawn_generation_attempts_source_attempt_idx
        ON predrawn_generation_attempts (source_attempt_id)
        WHERE source_attempt_id IS NOT NULL;
    `,
  },
  {
    version: 34,
    name: 'reused raw pipeline sources immediately seed processing attempts',
    // Migrations 33 and 34 ship together before this attempt origin is exposed.
    // Refuse to reinterpret any row written by the superseded development
    // contract: its request digest described another model run and cannot be
    // honestly rewritten as deterministic processing in SQL.
    sql: `
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
            FROM predrawn_generation_attempts
           WHERE origin = 'pipeline-source'
        ) THEN
          RAISE EXCEPTION
            'superseded pipeline-source attempts require explicit repair before migration 34';
        END IF;
      END $$;

      ALTER TABLE predrawn_generation_attempts
        DROP CONSTRAINT IF EXISTS predrawn_generation_attempts_input_check;
      ALTER TABLE predrawn_generation_attempts
        ADD CONSTRAINT predrawn_generation_attempts_input_check
        CHECK (
          (origin = 'source'
            AND source_version_id IS NOT NULL
            AND source_attempt_id IS NULL)
          OR
          (origin = 'pipeline-source'
            AND source_version_id IS NOT NULL
            AND source_attempt_id IS NOT NULL
            AND generated_version_id = source_version_id)
          OR
          (origin = 'migrated-history'
            AND source_version_id IS NULL
            AND source_attempt_id IS NULL)
        );
    `,
  },
  {
    version: 35,
    name: 'bind incomplete historical raw coordinate contracts externally',
    // Some retained untouched raws were written before raw-generated-v2
    // persisted the otherwise implicit board-world basis and viewing pane.
    // Their operation and provenance remain immutable. A fenced processing
    // attempt may create this sidecar only after reproducing the exact legacy
    // geometry digest and canonical frame from the server-held saved Level.
    sql: `
      CREATE TABLE IF NOT EXISTS predrawn_background_raw_contract_bindings (
        version_id                uuid        PRIMARY KEY,
        document_id               text        NOT NULL,
        legacy_operation_kind     text        NOT NULL
          CHECK (legacy_operation_kind = 'raw-generated-v2'),
        legacy_operation_sha256   text        NOT NULL
          CHECK (legacy_operation_sha256 ~ '^[0-9a-f]{64}$'),
        coordinate_basis          text        NOT NULL
          CHECK (coordinate_basis = 'board-world-pixels-v1'),
        viewing_pane              jsonb       NOT NULL
          CHECK (jsonb_typeof(viewing_pane) = 'object'),
        bound_by_email            text        NOT NULL,
        bound_by_name             text        NOT NULL,
        bound_at                  timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (version_id, document_id)
          REFERENCES predrawn_background_versions(id, document_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS predrawn_background_raw_contract_bindings_document_idx
        ON predrawn_background_raw_contract_bindings (document_id, version_id);
    `,
  },
  {
    version: 36,
    name: 'allow one drawable media slot to satisfy multiple roles',
    // A single flat-contact source-art raster intentionally supplies both the
    // back and front render roles for one facing. Role identity remains unique
    // per drawable; the same immutable semantic slot may therefore be bound to
    // more than one role without duplicating media bytes or inventing aliases.
    sql: `
      ALTER TABLE drawable_asset_media
        DROP CONSTRAINT IF EXISTS drawable_asset_media_asset_id_slot_key;
    `,
  },
  {
    version: 37,
    name: 'checksummed schema history and registered working copy revision reasons',
    // Numeric-only history cannot distinguish an already-applied migration from
    // later source code that reuses its number. New history rows therefore carry
    // their immutable identity. Working-copy revision reasons move to a queryable
    // catalog so readiness can prove every server-owned reason before serving.
    sql: `
      ALTER TABLE schema_migrations
        ADD COLUMN IF NOT EXISTS name text,
        ADD COLUMN IF NOT EXISTS checksum text;
      ALTER TABLE schema_migrations
        DROP CONSTRAINT IF EXISTS schema_migrations_identity_check;
      ALTER TABLE schema_migrations
        ADD CONSTRAINT schema_migrations_identity_check CHECK (
          (name IS NULL AND checksum IS NULL)
          OR (
            char_length(name) BETWEEN 1 AND 200
            AND checksum ~ '^[0-9a-f]{64}$'
          )
        );

      CREATE TABLE IF NOT EXISTS level_working_copy_revision_reasons (
        reason text PRIMARY KEY
      );
      INSERT INTO level_working_copy_revision_reasons (reason)
      SELECT reason
        FROM unnest(ARRAY[
          'migration', 'resolve', 'create', 'autosave', 'save', 'discard',
          'restore', 'canonical-refresh', 'generation-attempt-archive'
        ]::text[]) AS allowed(reason)
      ON CONFLICT (reason) DO NOTHING;

      ALTER TABLE level_working_copy_revisions
        DROP CONSTRAINT IF EXISTS level_working_copy_revisions_reason_check;
      ALTER TABLE level_working_copy_revisions
        DROP CONSTRAINT IF EXISTS level_working_copy_revisions_reason_fk;
      ALTER TABLE level_working_copy_revisions
        ADD CONSTRAINT level_working_copy_revisions_reason_fk
        FOREIGN KEY (reason)
        REFERENCES level_working_copy_revision_reasons(reason)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT;
    `,
  },
  {
    version: 38,
    name: 'require identified schema migration history',
    // Migration 37 must temporarily admit null identity metadata while the
    // runner seals numeric-only rows 1-36. Once that one-time bridge has run,
    // every history row is identified and future numeric-only inserts must
    // fail at the database boundary rather than become silently sealable.
    sql: `
      ALTER TABLE schema_migrations
        DROP CONSTRAINT IF EXISTS schema_migrations_identity_check;
      ALTER TABLE schema_migrations
        ALTER COLUMN name SET NOT NULL,
        ALTER COLUMN checksum SET NOT NULL;
      ALTER TABLE schema_migrations
        ADD CONSTRAINT schema_migrations_identity_check CHECK (
          char_length(name) BETWEEN 1 AND 200
          AND checksum ~ '^[0-9a-f]{64}$'
        );
    `,
  },
  {
    version: 39,
    name: 'same-slot warped retries advance a processing revision',
    // A rejected unpublished warp may be detached without replacing its Raw
    // Pipeline Source or creation-slot identity. The processing revision is
    // stable while a stage is attached/uploaded and advances only when that
    // stage is discarded, giving identical deterministic retries a fresh
    // idempotency scope without breaking a pending upload resume.
    sql: `
      ALTER TABLE predrawn_generation_attempts
        ADD COLUMN IF NOT EXISTS processing_revision bigint;
      UPDATE predrawn_generation_attempts
         SET processing_revision = 0
       WHERE processing_revision IS NULL;
      ALTER TABLE predrawn_generation_attempts
        ALTER COLUMN processing_revision TYPE bigint
          USING processing_revision::bigint,
        ALTER COLUMN processing_revision SET DEFAULT 0,
        ALTER COLUMN processing_revision SET NOT NULL;

      DO $$
      DECLARE constraint_name text;
      BEGIN
        FOR constraint_name IN
          SELECT conname
            FROM pg_constraint
           WHERE conrelid = 'predrawn_generation_attempts'::regclass
             AND contype = 'c'
             AND pg_get_constraintdef(oid) ~ '\\mprocessing_revision\\M'
        LOOP
          EXECUTE format(
            'ALTER TABLE predrawn_generation_attempts DROP CONSTRAINT %I',
            constraint_name
          );
        END LOOP;
      END $$;
      ALTER TABLE predrawn_generation_attempts
        ADD CONSTRAINT predrawn_generation_attempts_processing_revision_check
        CHECK (processing_revision >= 0);

      DO $$
      DECLARE constraint_name text;
      BEGIN
        FOR constraint_name IN
          SELECT conname
            FROM pg_constraint
           WHERE conrelid = 'predrawn_generation_attempt_events'::regclass
             AND contype = 'c'
             AND pg_get_constraintdef(oid) ~ '\\maction\\M'
        LOOP
          EXECUTE format(
            'ALTER TABLE predrawn_generation_attempt_events DROP CONSTRAINT %I',
            constraint_name
          );
        END LOOP;
      END $$;
      ALTER TABLE predrawn_generation_attempt_events
        ADD CONSTRAINT predrawn_generation_attempt_events_action_check
        CHECK (action IN ('created', 'stage-attached', 'stage-discarded', 'archived'));
    `,
  },
  {
    version: 40,
    name: 'attempt-owned cyan move-highlight calibration',
    // Cyan footprint fitting is mutable attempt authoring state, not another
    // raster or media version. Exact Level selections embed a canonical
    // snapshot, while these columns retain the latest fenced draft bound to
    // the slot's exact current warp.
    sql: `
      ALTER TABLE predrawn_generation_attempts
        ADD COLUMN IF NOT EXISTS move_highlight_profile jsonb,
        ADD COLUMN IF NOT EXISTS move_highlight_profile_sha256 text,
        ADD COLUMN IF NOT EXISTS move_highlight_profile_warped_version_id uuid;

      ALTER TABLE predrawn_generation_attempts
        DROP CONSTRAINT IF EXISTS predrawn_generation_attempts_move_highlight_profile_bundle_check,
        DROP CONSTRAINT IF EXISTS predrawn_generation_attempts_move_highlight_profile_warp_fk;
      ALTER TABLE predrawn_generation_attempts
        ADD CONSTRAINT predrawn_generation_attempts_move_highlight_profile_bundle_check
        CHECK (
          (
            move_highlight_profile IS NULL
            AND move_highlight_profile_sha256 IS NULL
            AND move_highlight_profile_warped_version_id IS NULL
          )
          OR
          (
            move_highlight_profile IS NOT NULL
            AND move_highlight_profile_sha256 IS NOT NULL
            AND move_highlight_profile_warped_version_id IS NOT NULL
            AND jsonb_typeof(move_highlight_profile) = 'object'
            AND move_highlight_profile_sha256 ~ '^[0-9a-f]{64}$'
            AND move_highlight_profile_warped_version_id = warped_version_id
          )
        ),
        ADD CONSTRAINT predrawn_generation_attempts_move_highlight_profile_warp_fk
        FOREIGN KEY (move_highlight_profile_warped_version_id, document_id)
        REFERENCES predrawn_background_versions(id, document_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT;

      DO $$
      DECLARE constraint_name text;
      BEGIN
        FOR constraint_name IN
          SELECT conname
            FROM pg_constraint
           WHERE conrelid = 'predrawn_generation_attempt_events'::regclass
             AND contype = 'c'
             AND pg_get_constraintdef(oid) ~ '\\maction\\M'
        LOOP
          EXECUTE format(
            'ALTER TABLE predrawn_generation_attempt_events DROP CONSTRAINT %I',
            constraint_name
          );
        END LOOP;
      END $$;
      ALTER TABLE predrawn_generation_attempt_events
        ADD CONSTRAINT predrawn_generation_attempt_events_action_check
        CHECK (action IN (
          'created',
          'stage-attached',
          'stage-discarded',
          'move-highlight-profile-updated',
          'archived'
        ));
    `,
  },
  {
    version: 41,
    name: 'use a stable move-highlight constraint identifier',
    // PostgreSQL truncates identifiers after 63 bytes. Migration 40's source
    // name crossed that boundary, so the resulting catalog identifier could
    // not satisfy the exact readiness contract. Preserve the applied migration
    // and append the correction under an intentionally bounded name.
    sql: `
      ALTER TABLE predrawn_generation_attempts
        DROP CONSTRAINT IF EXISTS predrawn_generation_attempts_move_highlight_profile_bundle_chec,
        DROP CONSTRAINT IF EXISTS predrawn_generation_attempts_move_highlight_bundle_check;
      ALTER TABLE predrawn_generation_attempts
        ADD CONSTRAINT predrawn_generation_attempts_move_highlight_bundle_check
        CHECK (
          (
            move_highlight_profile IS NULL
            AND move_highlight_profile_sha256 IS NULL
            AND move_highlight_profile_warped_version_id IS NULL
          )
          OR
          (
            move_highlight_profile IS NOT NULL
            AND move_highlight_profile_sha256 IS NOT NULL
            AND move_highlight_profile_warped_version_id IS NOT NULL
            AND jsonb_typeof(move_highlight_profile) = 'object'
            AND move_highlight_profile_sha256 ~ '^[0-9a-f]{64}$'
            AND move_highlight_profile_warped_version_id = warped_version_id
          )
        );
    `,
  },
  {
    version: 42,
    name: 'record occlusion-stage discard audit',
    // Discarding a mask may also move the private working Level back to its
    // exact warped parent. Give that server-owned revision a distinct durable
    // reason instead of misreporting it as a generic autosave or slot archive.
    sql: `
      INSERT INTO level_working_copy_revision_reasons (reason)
      VALUES ('generation-attempt-occlusion-discard')
      ON CONFLICT (reason) DO NOTHING;

      DO $$
      DECLARE constraint_name text;
      BEGIN
        FOR constraint_name IN
          SELECT conname
            FROM pg_constraint
           WHERE conrelid = 'predrawn_background_version_events'::regclass
             AND contype = 'c'
             AND pg_get_constraintdef(oid) ~ '\\maction\\M'
        LOOP
          EXECUTE format(
            'ALTER TABLE predrawn_background_version_events DROP CONSTRAINT %I',
            constraint_name
          );
        END LOOP;
      END $$;
      ALTER TABLE predrawn_background_version_events
        ADD CONSTRAINT predrawn_background_version_events_action_check
        CHECK (action IN (
          'created',
          'content-uploaded',
          'archived',
          'published',
          'attempt-detached'
        ));
    `,
  },
  {
    version: 43,
    name: 'repair generation attempt schema from final state',
    // Required-schema repair may run long after pipeline-source attempts and
    // move-highlight audit events exist. Replaying transitional migrations
    // would temporarily reinstall superseded constraints that reject those
    // valid rows. This migration therefore owns one forward-compatible,
    // idempotent definition of the complete current attempt schema.
    sql: `
      CREATE TABLE IF NOT EXISTS predrawn_generation_attempts (
        id                      uuid        PRIMARY KEY,
        document_id             text        NOT NULL,
        owner_email             text        NOT NULL,
        level_id                text        NOT NULL,
        label                   text        NOT NULL CHECK (char_length(label) BETWEEN 1 AND 160),
        origin                  text        NOT NULL,
        source_version_id       uuid,
        source_attempt_id       uuid,
        source_request          jsonb,
        generated_version_id    uuid,
        warped_version_id       uuid,
        occlusion_version_id    uuid,
        move_highlight_profile  jsonb,
        move_highlight_profile_sha256 text,
        move_highlight_profile_warped_version_id uuid,
        status                  text        NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'archived')),
        idempotency_actor       text,
        idempotency_key         text,
        request_fingerprint     text,
        row_revision            bigint      NOT NULL DEFAULT 0 CHECK (row_revision >= 0),
        processing_revision     bigint      NOT NULL DEFAULT 0,
        created_by_email        text        NOT NULL,
        created_by_name         text        NOT NULL,
        created_at              timestamptz NOT NULL DEFAULT now(),
        updated_at              timestamptz NOT NULL DEFAULT now(),
        updated_by              text        NOT NULL,
        archived_at             timestamptz,
        archived_by             text,
        UNIQUE (id, document_id),
        FOREIGN KEY (document_id, owner_email, level_id)
          REFERENCES level_working_copies(document_id, owner_email, level_id) ON DELETE CASCADE,
        FOREIGN KEY (source_version_id, document_id)
          REFERENCES predrawn_background_versions(id, document_id) ON DELETE RESTRICT,
        FOREIGN KEY (generated_version_id, document_id)
          REFERENCES predrawn_background_versions(id, document_id) ON DELETE RESTRICT,
        FOREIGN KEY (warped_version_id, document_id)
          REFERENCES predrawn_background_versions(id, document_id) ON DELETE RESTRICT,
        FOREIGN KEY (occlusion_version_id, document_id)
          REFERENCES predrawn_background_versions(id, document_id) ON DELETE RESTRICT,
        CONSTRAINT predrawn_generation_attempts_origin_check
          CHECK (origin IN ('source', 'pipeline-source', 'migrated-history')),
        CONSTRAINT predrawn_generation_attempts_input_check
          CHECK (
            (origin = 'source'
              AND source_version_id IS NOT NULL
              AND source_attempt_id IS NULL)
            OR
            (origin = 'pipeline-source'
              AND source_version_id IS NOT NULL
              AND source_attempt_id IS NOT NULL
              AND generated_version_id = source_version_id)
            OR
            (origin = 'migrated-history'
              AND source_version_id IS NULL
              AND source_attempt_id IS NULL)
          ),
        CHECK (warped_version_id IS NULL OR generated_version_id IS NOT NULL),
        CHECK (occlusion_version_id IS NULL OR warped_version_id IS NOT NULL),
        CONSTRAINT predrawn_generation_attempts_source_request_check
          CHECK (source_request IS NULL OR jsonb_typeof(source_request) = 'object'),
        CONSTRAINT predrawn_generation_attempts_processing_revision_check
          CHECK (processing_revision >= 0),
        CONSTRAINT predrawn_generation_attempts_move_highlight_bundle_check
          CHECK (
            (
              move_highlight_profile IS NULL
              AND move_highlight_profile_sha256 IS NULL
              AND move_highlight_profile_warped_version_id IS NULL
            )
            OR
            (
              move_highlight_profile IS NOT NULL
              AND move_highlight_profile_sha256 IS NOT NULL
              AND move_highlight_profile_warped_version_id IS NOT NULL
              AND jsonb_typeof(move_highlight_profile) = 'object'
              AND move_highlight_profile_sha256 ~ '^[0-9a-f]{64}$'
              AND move_highlight_profile_warped_version_id = warped_version_id
            )
          ),
        CONSTRAINT predrawn_generation_attempts_source_attempt_fk
          FOREIGN KEY (source_attempt_id, document_id)
          REFERENCES predrawn_generation_attempts(id, document_id) ON DELETE RESTRICT,
        CONSTRAINT predrawn_generation_attempts_move_highlight_profile_warp_fk
          FOREIGN KEY (move_highlight_profile_warped_version_id, document_id)
          REFERENCES predrawn_background_versions(id, document_id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT,
        CHECK (
          (idempotency_actor IS NULL AND idempotency_key IS NULL AND request_fingerprint IS NULL)
          OR
          (char_length(idempotency_actor) BETWEEN 1 AND 320
            AND char_length(idempotency_key) BETWEEN 1 AND 200
            AND request_fingerprint ~ '^[0-9a-f]{64}$')
        ),
        CHECK (
          (status = 'active' AND archived_at IS NULL AND archived_by IS NULL)
          OR
          (status = 'archived' AND archived_at IS NOT NULL AND archived_by IS NOT NULL)
        )
      );

      ALTER TABLE predrawn_generation_attempts
        ADD COLUMN IF NOT EXISTS source_attempt_id uuid,
        ADD COLUMN IF NOT EXISTS source_request jsonb,
        ADD COLUMN IF NOT EXISTS processing_revision bigint,
        ADD COLUMN IF NOT EXISTS move_highlight_profile jsonb,
        ADD COLUMN IF NOT EXISTS move_highlight_profile_sha256 text,
        ADD COLUMN IF NOT EXISTS move_highlight_profile_warped_version_id uuid;
      UPDATE predrawn_generation_attempts
         SET processing_revision = 0
       WHERE processing_revision IS NULL;
      ALTER TABLE predrawn_generation_attempts
        ALTER COLUMN processing_revision TYPE bigint
          USING processing_revision::bigint,
        ALTER COLUMN processing_revision SET DEFAULT 0,
        ALTER COLUMN processing_revision SET NOT NULL;

      DO $$
      DECLARE constraint_name text;
      BEGIN
        FOR constraint_name IN
          SELECT conname
            FROM pg_constraint
           WHERE conrelid = 'predrawn_generation_attempts'::regclass
             AND contype = 'c'
             AND (
               pg_get_constraintdef(oid) ~ '\\morigin\\M'
               OR pg_get_constraintdef(oid) ~ '\\msource_request\\M'
               OR pg_get_constraintdef(oid) ~ '\\mprocessing_revision\\M'
               OR pg_get_constraintdef(oid) ~ '\\mmove_highlight_profile\\M'
             )
        LOOP
          EXECUTE format(
            'ALTER TABLE predrawn_generation_attempts DROP CONSTRAINT %I',
            constraint_name
          );
        END LOOP;
        FOR constraint_name IN
          SELECT conname
            FROM pg_constraint
           WHERE conrelid = 'predrawn_generation_attempts'::regclass
             AND contype = 'f'
             AND (
               pg_get_constraintdef(oid) ~ '\\msource_attempt_id\\M'
               OR pg_get_constraintdef(oid) ~ '\\mmove_highlight_profile_warped_version_id\\M'
             )
        LOOP
          EXECUTE format(
            'ALTER TABLE predrawn_generation_attempts DROP CONSTRAINT %I',
            constraint_name
          );
        END LOOP;
      END $$;

      ALTER TABLE predrawn_generation_attempts
        ALTER COLUMN move_highlight_profile TYPE jsonb
          USING move_highlight_profile::jsonb,
        ALTER COLUMN move_highlight_profile DROP NOT NULL,
        ALTER COLUMN move_highlight_profile_sha256 TYPE text
          USING move_highlight_profile_sha256::text,
        ALTER COLUMN move_highlight_profile_sha256 DROP NOT NULL,
        ALTER COLUMN move_highlight_profile_warped_version_id TYPE uuid
          USING move_highlight_profile_warped_version_id::uuid,
        ALTER COLUMN move_highlight_profile_warped_version_id DROP NOT NULL;

      ALTER TABLE predrawn_generation_attempts
        ADD CONSTRAINT predrawn_generation_attempts_origin_check
          CHECK (origin IN ('source', 'pipeline-source', 'migrated-history')),
        ADD CONSTRAINT predrawn_generation_attempts_input_check
          CHECK (
            (origin = 'source'
              AND source_version_id IS NOT NULL
              AND source_attempt_id IS NULL)
            OR
            (origin = 'pipeline-source'
              AND source_version_id IS NOT NULL
              AND source_attempt_id IS NOT NULL
              AND generated_version_id = source_version_id)
            OR
            (origin = 'migrated-history'
              AND source_version_id IS NULL
              AND source_attempt_id IS NULL)
          ),
        ADD CONSTRAINT predrawn_generation_attempts_source_request_check
          CHECK (source_request IS NULL OR jsonb_typeof(source_request) = 'object'),
        ADD CONSTRAINT predrawn_generation_attempts_processing_revision_check
          CHECK (processing_revision >= 0),
        ADD CONSTRAINT predrawn_generation_attempts_move_highlight_bundle_check
          CHECK (
            (
              move_highlight_profile IS NULL
              AND move_highlight_profile_sha256 IS NULL
              AND move_highlight_profile_warped_version_id IS NULL
            )
            OR
            (
              move_highlight_profile IS NOT NULL
              AND move_highlight_profile_sha256 IS NOT NULL
              AND move_highlight_profile_warped_version_id IS NOT NULL
              AND jsonb_typeof(move_highlight_profile) = 'object'
              AND move_highlight_profile_sha256 ~ '^[0-9a-f]{64}$'
              AND move_highlight_profile_warped_version_id = warped_version_id
            )
          ),
        ADD CONSTRAINT predrawn_generation_attempts_source_attempt_fk
          FOREIGN KEY (source_attempt_id, document_id)
          REFERENCES predrawn_generation_attempts(id, document_id) ON DELETE RESTRICT,
        ADD CONSTRAINT predrawn_generation_attempts_move_highlight_profile_warp_fk
          FOREIGN KEY (move_highlight_profile_warped_version_id, document_id)
          REFERENCES predrawn_background_versions(id, document_id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT;

      CREATE INDEX IF NOT EXISTS predrawn_generation_attempts_document_created_idx
        ON predrawn_generation_attempts (document_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS predrawn_generation_attempts_source_idx
        ON predrawn_generation_attempts (source_version_id)
        WHERE source_version_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS predrawn_generation_attempts_source_attempt_idx
        ON predrawn_generation_attempts (source_attempt_id)
        WHERE source_attempt_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS predrawn_generation_attempts_idempotency_idx
        ON predrawn_generation_attempts (idempotency_actor, idempotency_key)
        WHERE idempotency_key IS NOT NULL;

      WITH terminal_versions AS (
        SELECT terminal.*
          FROM predrawn_background_versions terminal
         WHERE terminal.kind IN ('raw', 'warped', 'occlusion')
           AND NOT EXISTS (
             SELECT 1
               FROM predrawn_background_versions child
              WHERE child.document_id = terminal.document_id
                AND (
                  (terminal.kind = 'raw'
                    AND child.kind = 'warped'
                    AND child.parent_version_id = terminal.id)
                  OR
                  (terminal.kind = 'warped'
                    AND child.kind = 'occlusion'
                    AND child.source_background_version_id = terminal.id)
                  OR
                  (terminal.kind = 'occlusion'
                    AND child.kind = 'occlusion'
                    AND child.parent_version_id = terminal.id)
                )
           )
      ),
      migrated_attempts AS (
        SELECT
          overlay(overlay(md5('predrawn-migrated-attempt:' || terminal.id::text)
            placing '4' from 13) placing '8' from 17)::uuid AS id,
          terminal.document_id,
          terminal.owner_email,
          terminal.level_id,
          ('Historical artwork ' || left(terminal.id::text, 8))::text AS label,
          CASE
            WHEN terminal.kind = 'raw' THEN terminal.id
            WHEN terminal.kind = 'warped' THEN terminal.parent_version_id
            ELSE warped.parent_version_id
          END AS generated_version_id,
          CASE
            WHEN terminal.kind = 'warped' THEN terminal.id
            WHEN terminal.kind = 'occlusion' THEN terminal.source_background_version_id
            ELSE NULL
          END AS warped_version_id,
          CASE WHEN terminal.kind = 'occlusion' THEN terminal.id ELSE NULL END
            AS occlusion_version_id,
          CASE WHEN terminal.status = 'archived' THEN 'archived' ELSE 'active' END AS status,
          terminal.created_by_email,
          terminal.created_by_name,
          terminal.created_at,
          terminal.updated_at,
          terminal.updated_by,
          CASE WHEN terminal.status = 'archived'
            THEN COALESCE(terminal.archived_at, terminal.updated_at) ELSE NULL END AS archived_at,
          CASE WHEN terminal.status = 'archived'
            THEN COALESCE(terminal.archived_by, terminal.updated_by) ELSE NULL END AS archived_by
        FROM terminal_versions terminal
        LEFT JOIN predrawn_background_versions warped
          ON terminal.kind = 'occlusion'
         AND warped.document_id = terminal.document_id
         AND warped.id = terminal.source_background_version_id
         AND warped.kind = 'warped'
      )
      INSERT INTO predrawn_generation_attempts (
        id, document_id, owner_email, level_id, label, origin,
        source_version_id, generated_version_id, warped_version_id, occlusion_version_id,
        status, created_by_email, created_by_name, created_at,
        updated_at, updated_by, archived_at, archived_by
      )
      SELECT
        id, document_id, owner_email, level_id, label, 'migrated-history',
        NULL, generated_version_id, warped_version_id, occlusion_version_id,
        status, created_by_email, created_by_name, created_at,
        updated_at, updated_by, archived_at, archived_by
      FROM migrated_attempts
      WHERE generated_version_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM predrawn_generation_attempts)
      ON CONFLICT (id) DO NOTHING;

      CREATE TABLE IF NOT EXISTS predrawn_generation_attempt_events (
        id                  bigserial   PRIMARY KEY,
        document_id         text        NOT NULL,
        attempt_id          uuid        NOT NULL,
        action              text        NOT NULL,
        actor_email         text        NOT NULL,
        actor_name          text        NOT NULL,
        details             jsonb       NOT NULL DEFAULT '{}'::jsonb,
        created_at          timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT predrawn_generation_attempt_events_action_check
          CHECK (action IN (
            'created',
            'stage-attached',
            'stage-discarded',
            'move-highlight-profile-updated',
            'archived'
          )),
        FOREIGN KEY (attempt_id, document_id)
          REFERENCES predrawn_generation_attempts(id, document_id) ON DELETE CASCADE
      );

      DO $$
      DECLARE constraint_name text;
      BEGIN
        FOR constraint_name IN
          SELECT conname
            FROM pg_constraint
           WHERE conrelid = 'predrawn_generation_attempt_events'::regclass
             AND contype = 'c'
             AND pg_get_constraintdef(oid) ~ '\\maction\\M'
        LOOP
          EXECUTE format(
            'ALTER TABLE predrawn_generation_attempt_events DROP CONSTRAINT %I',
            constraint_name
          );
        END LOOP;
      END $$;
      ALTER TABLE predrawn_generation_attempt_events
        ADD CONSTRAINT predrawn_generation_attempt_events_action_check
        CHECK (action IN (
          'created',
          'stage-attached',
          'stage-discarded',
          'move-highlight-profile-updated',
          'archived'
        ));
      CREATE INDEX IF NOT EXISTS predrawn_generation_attempt_events_attempt_idx
        ON predrawn_generation_attempt_events (attempt_id, created_at DESC, id DESC);

      INSERT INTO predrawn_generation_attempt_events (
        document_id, attempt_id, action, actor_email, actor_name, details, created_at
      )
      SELECT
        attempt.document_id,
        attempt.id,
        'created',
        attempt.created_by_email,
        attempt.created_by_name,
        jsonb_build_object('origin', 'migrated-history', 'source_available', false),
        attempt.created_at
      FROM predrawn_generation_attempts attempt
      WHERE attempt.origin = 'migrated-history'
        AND NOT EXISTS (
          SELECT 1 FROM predrawn_generation_attempt_events event
           WHERE event.attempt_id = attempt.id AND event.action = 'created'
        );
    `,
  },
  {
    version: 44,
    name: 'wars in canonical workspaces + account active runs',
    // ADR-0193 keeps Wars in the same revisioned canonical workspace transaction as
    // Campaigns/Levels while the UI exposes a separate library. Active Run progress is
    // account state, not authored content, so it gets one owner-scoped CAS document.
    sql: `
      UPDATE campaign_workspaces
         SET body = jsonb_set(body, '{wars}', '[]'::jsonb, true)
       WHERE NOT (body ? 'wars');

      UPDATE official_campaigns
         SET data = jsonb_set(data, '{wars}', '[]'::jsonb, true)
       WHERE NOT (data ? 'wars');

      CREATE TABLE IF NOT EXISTS active_runs (
        owner_email text        PRIMARY KEY,
        body        jsonb       NOT NULL,
        revision    integer     NOT NULL DEFAULT 0 CHECK (revision >= 0),
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    version: 45,
    name: 'owner-scoped idempotent Run relic statistics',
    // This identity already exists in the shared development ledger. ADR-0174
    // requires its version, name, and SQL to remain byte-for-byte canonical.
    // ADR-0231 explains why lifetime relic facts remain separate from the one
    // mutable active Run document and why deterministic event ids make retries safe.
    sql: `
      CREATE TABLE IF NOT EXISTS run_relic_stat_events (
        owner_email text        NOT NULL,
        event_id    text        NOT NULL,
        relic_id    text        NOT NULL,
        event_kind  text        NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (owner_email, event_id, relic_id),
        CONSTRAINT run_relic_stat_events_kind_check
          CHECK (event_kind IN ('picked', 'battle-win'))
      );

      CREATE INDEX IF NOT EXISTS run_relic_stat_events_owner_relic_idx
        ON run_relic_stat_events (owner_email, relic_id, event_kind);
    `,
  },
  {
    version: 46,
    name: 'installed play menu entry lands on the play hub root',
    // This identity already exists in the shared development ledger. ADR-0174
    // requires its version, name, and SQL to remain byte-for-byte canonical.
    // ADR-0257: the Play entry navigates to the bare selector root, where the
    // client resumes the one in-progress activity or reveals the neutral hub.
    // The update is guarded to the retired canonical default so an
    // owner-authored route is never overwritten, and a database without the
    // installed row (fresh smoke environments seed their own) is a clean no-op.
    sql: `
      WITH changed AS (
        UPDATE drawable_assets
           SET behavior = jsonb_set(behavior, '{route}', '"/play/select"'::jsonb),
               row_revision = row_revision + 1,
               updated_at = now(),
               updated_by = 'play-hub-root-migration'
         WHERE kind = 'menu-mode'
           AND behavior->>'value' = 'play'
           AND behavior->>'route' = '/play/select/skirmish'
        RETURNING id
      ), logged AS (
        INSERT INTO drawable_asset_events (asset_id, action, actor_email, details)
        SELECT id, 'updated', 'play-hub-root-migration',
               jsonb_build_object('route', '/play/select', 'previousRoute', '/play/select/skirmish')
          FROM changed
        RETURNING asset_id
      )
      UPDATE drawable_catalog_state
         SET revision = revision + 1, updated_at = now()
       WHERE singleton = true
         AND EXISTS (SELECT 1 FROM logged);
    `,
  },
  {
    version: 47,
    name: 'owner-authored Run card scene overrides',
    // One complete, owner-editable card-scenes document (the sfx_profiles shape).
    // The row is intentionally not seeded: absence means every card shows its
    // deterministic generated scene, and there is no committed override fallback.
    sql: `
      CREATE TABLE IF NOT EXISTS card_scene_documents (
        id                    text        PRIMARY KEY CHECK (id = 'default'),
        data                  jsonb       NOT NULL,
        client_schema_version integer     NOT NULL CHECK (client_schema_version = 1),
        revision              bigint      NOT NULL DEFAULT 0 CHECK (revision >= 0),
        created_at            timestamptz NOT NULL DEFAULT now(),
        updated_at            timestamptz NOT NULL DEFAULT now(),
        updated_by            text
      );
    `,
  },
  {
    version: 48,
    name: 'retire the Run card scene overrides table',
    // The card-scene authoring feature was removed (ADR-0277) before any scene was
    // authored in production; migration 47 stays in immutable applied history, so the
    // retirement is this append-only drop rather than an edit of the shipped past.
    sql: `
      DROP TABLE IF EXISTS card_scene_documents;
    `,
  },
  {
    version: 49,
    name: 'account-scoped Ataraxia progression',
    // Ataraxia unlocks outlive the one mutable active Run. The value is monotonic:
    // -1 means no completed Run; completing tier N records at least N.
    sql: `
      CREATE TABLE IF NOT EXISTS run_progression (
        owner_email                       text        PRIMARY KEY,
        highest_completed_ataraxia_tier  integer     NOT NULL DEFAULT -1
          CHECK (highest_completed_ataraxia_tier >= -1),
        updated_at                        timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    version: 50,
    name: 'content-addressed Run craft links',
    // ADR-0354: a crafted Run state is handed over as /run/craft/<id>. The spec lives here so
    // the address stays short and opaque however large the spec grows, and the id is the
    // fingerprint of the spec's own canonical text — so the same requested state always mints
    // the same link, and re-minting it is an insert that does nothing.
    sql: `
      CREATE TABLE IF NOT EXISTS run_craft_links (
        id         text        PRIMARY KEY,
        spec       jsonb       NOT NULL,
        created_by text        NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    version: 51,
    name: 'sfx profile owns interface cue assignments',
    // ADR-0375: which sound an interface event makes was hardcoded in components, so changing
    // it needed a commit — the exact condition ADR-0089 removed for terrain and ADR-0071
    // forbids generally. The document gains one explicit assignment per cue, carrying today's
    // audible behaviour forward so the migration changes nothing a player hears; the owner
    // then re-assigns any of them by ear in the SFX Studio.
    //
    // A cue resolves to null when its set is absent, because the validator refuses an
    // assignment naming an undeclared sound set. The constraint is loosened before the
    // rewrite and re-tightened after, since a CHECK for the new version cannot be added
    // while the stored row still carries the old one.
    sql: `
      ALTER TABLE sfx_profiles DROP CONSTRAINT IF EXISTS sfx_profiles_client_schema_version_check;
      UPDATE sfx_profiles
         SET data = (data - 'schemaVersion')
                    || jsonb_build_object('schemaVersion', 2)
                    || jsonb_build_object('interfaceAssignments', jsonb_build_object(
                         'activate', CASE WHEN jsonb_exists(data->'soundSets', 'click')
                           THEN to_jsonb('click'::text) ELSE 'null'::jsonb END,
                         'card', CASE WHEN jsonb_exists(data->'soundSets', 'card-purchase')
                           THEN to_jsonb('card-purchase'::text) ELSE 'null'::jsonb END,
                         'gold', CASE WHEN jsonb_exists(data->'soundSets', 'gold-sell')
                           THEN to_jsonb('gold-sell'::text) ELSE 'null'::jsonb END
                       )),
             client_schema_version = 2,
             revision = revision + 1,
             updated_at = now()
       WHERE id = 'default' AND data->>'schemaVersion' = '1';
      ALTER TABLE sfx_profiles ADD CONSTRAINT sfx_profiles_client_schema_version_check
        CHECK (client_schema_version = 2);
    `,
  },
  {
    version: 52,
    name: 'relics are Lipsana end to end',
    // ADR-0376: the held-relic register was already The Lipsanotheca — Greek leipsanon
    // (relic) + theke (case) — while its contents kept the plain English word. The vocabulary
    // is now one root everywhere, which means the storage layer moves too: the old spelling
    // survives nowhere, per docs/migration-policy.md.
    //
    // media_slots.slot is a primary key that media_versions.slot and the composite
    // media_slots_active_version_fk both reference with no ON UPDATE clause, so the parent
    // key cannot be rewritten while those constraints stand. They are dropped, all three
    // slot-bearing tables move together inside this transaction, and the constraints are
    // restored identically — the graph is never observable in a torn state.
    //
    // Run documents are NOT rewritten. CURRENT_RUN_SAVE_VERSION accepts only its exact save
    // shape, so an in-progress Run is discarded rather than migrated; converting it here
    // would be the compatibility path the policy forbids, and the owner's active Run is disposable.
    // Minted craft links are rewritten instead, because a link is a durable address the
    // owner holds and its spec is data this migration can canonicalize exactly.
    sql: `
      -- media_versions' slot FK was created inline, so its name is whatever Postgres
      -- generated. Guessing it and passing IF EXISTS would drop nothing on a mismatch and
      -- then fail the UPDATE against a constraint still standing, so it is looked up.
      DO $$
      DECLARE constraint_name text;
      BEGIN
        SELECT conname INTO constraint_name
          FROM pg_constraint
         WHERE conrelid = 'media_versions'::regclass
           AND confrelid = 'media_slots'::regclass
           AND contype = 'f'
           AND conkey = ARRAY[(
                 SELECT attnum FROM pg_attribute
                  WHERE attrelid = 'media_versions'::regclass AND attname = 'slot'
               )]::smallint[];
        IF constraint_name IS NULL THEN
          RAISE EXCEPTION 'media_versions has no single-column slot foreign key to drop';
        END IF;
        EXECUTE format('ALTER TABLE media_versions DROP CONSTRAINT %I', constraint_name);
      END $$;
      ALTER TABLE media_slots DROP CONSTRAINT IF EXISTS media_slots_active_version_fk;

      UPDATE media_slots
         SET slot = 'ui/run/lipsana/' || substring(slot from '^ui/run/relics/(.*)$')
       WHERE slot LIKE 'ui/run/relics/%';
      UPDATE media_versions
         SET slot = 'ui/run/lipsana/' || substring(slot from '^ui/run/relics/(.*)$')
       WHERE slot LIKE 'ui/run/relics/%';
      UPDATE media_asset_events
         SET slot = 'ui/run/lipsana/' || substring(slot from '^ui/run/relics/(.*)$')
       WHERE slot LIKE 'ui/run/relics/%';

      ALTER TABLE media_versions
        ADD CONSTRAINT media_versions_slot_fkey
        FOREIGN KEY (slot) REFERENCES media_slots(slot) ON DELETE RESTRICT;
      ALTER TABLE media_slots
        ADD CONSTRAINT media_slots_active_version_fk
        FOREIGN KEY (active_version_id, slot) REFERENCES media_versions (id, slot);

      UPDATE media_slots SET role = 'run-lipsanon-icon' WHERE role = 'run-relic-icon';
      UPDATE media_slots SET role = 'run-lipsanon-mat'  WHERE role = 'run-relic-mat';
      UPDATE media_versions SET role = 'run-lipsanon-icon' WHERE role = 'run-relic-icon';
      UPDATE media_versions SET role = 'run-lipsanon-mat'  WHERE role = 'run-relic-mat';

      UPDATE media_slots
         SET metadata = jsonb_set(
               jsonb_set(metadata, '{runtime,component}', to_jsonb(
                 replace(metadata->'runtime'->>'component', 'run-relic-', 'run-lipsanon-'))),
               '{runtime,nativeRole}', to_jsonb(
                 replace(metadata->'runtime'->>'nativeRole', 'run-relic-', 'run-lipsanon-')))
       WHERE metadata->'runtime'->>'component' LIKE 'run-relic-%'
          OR metadata->'runtime'->>'nativeRole' LIKE 'run-relic-%';
      UPDATE media_versions
         SET metadata = jsonb_set(
               jsonb_set(metadata, '{runtime,component}', to_jsonb(
                 replace(metadata->'runtime'->>'component', 'run-relic-', 'run-lipsanon-'))),
               '{runtime,nativeRole}', to_jsonb(
                 replace(metadata->'runtime'->>'nativeRole', 'run-relic-', 'run-lipsanon-')))
       WHERE metadata->'runtime'->>'component' LIKE 'run-relic-%'
          OR metadata->'runtime'->>'nativeRole' LIKE 'run-relic-%';

      -- Migration 45 is byte-for-byte canonical (ADR-0174), so the old names are still
      -- what exists on disk. Postgres does not carry index or constraint names along with
      -- a table rename, so each is renamed explicitly rather than left as the one place
      -- the retired word survives.
      ALTER TABLE IF EXISTS run_relic_stat_events RENAME TO lipsanon_stat_events;
      ALTER TABLE IF EXISTS lipsanon_stat_events RENAME COLUMN relic_id TO lipsanon_id;
      ALTER INDEX IF EXISTS run_relic_stat_events_owner_relic_idx
        RENAME TO lipsanon_stat_events_owner_lipsanon_idx;
      ALTER TABLE IF EXISTS lipsanon_stat_events
        RENAME CONSTRAINT run_relic_stat_events_kind_check TO lipsanon_stat_events_kind_check;

      UPDATE run_craft_links
         SET spec = (spec - 'relics') || jsonb_build_object('lipsana', spec->'relics')
       WHERE jsonb_exists(spec, 'relics');

      UPDATE media_catalog_state
         SET revision = revision + 1, updated_at = now()
       WHERE singleton;
    `,
  },
  {
    version: 53,
    name: 'the drawable catalog follows the Lipsana slot rename',
    // Migration 52 renames media_slots.slot, a primary key. Three tables reference it, and 52
    // carried two: it drops media_versions' slot FK and media_slots_active_version_fk, moves
    // media_slots / media_versions / media_asset_events, and restores both constraints.
    //
    // drawable_asset_media.slot references it too (drawable_asset_media_slot_fkey, ON DELETE
    // RESTRICT, no ON UPDATE), and was not carried. On a database with no accepted relic media
    // the rename matches no child row and 52 applies cleanly, which is every fresh and CI
    // database — so this only bites where the catalog is real, and production is the only one
    // of those. There, 52 fails its own parent UPDATE and rolls back on every deploy.
    //
    // 52 is immutable (ADR-0174), so this is the follow-up that repairs it: it moves the table
    // 52 left behind and restores the constraint. Both halves are idempotent, because on a
    // fresh database 52 already succeeded and there is nothing here left to do.
    sql: `
      UPDATE drawable_asset_media
         SET slot = 'ui/run/lipsana/' || substring(slot from '^ui/run/relics/(.*)$')
       WHERE slot LIKE 'ui/run/relics/%';

      -- Re-adding a constraint that is already there would abort the transaction, and the
      -- name is Postgres-generated from an inline REFERENCES, so presence is decided by
      -- shape from the catalog rather than by guessing the name.
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conrelid = 'drawable_asset_media'::regclass
             AND confrelid = 'media_slots'::regclass
             AND contype = 'f'
             AND conkey = ARRAY[(
                   SELECT attnum FROM pg_attribute
                    WHERE attrelid = 'drawable_asset_media'::regclass AND attname = 'slot'
                 )]::smallint[]
        ) THEN
          ALTER TABLE drawable_asset_media
            ADD CONSTRAINT drawable_asset_media_slot_fkey
            FOREIGN KEY (slot) REFERENCES media_slots(slot) ON DELETE RESTRICT;
        END IF;
      END $$;

      UPDATE media_catalog_state
         SET revision = revision + 1, updated_at = now()
       WHERE singleton;
    `,
  },
  {
    version: 54,
    name: 'active Runs name their save version',
    // ADR-0379: RunSaveVersion 17 changes only the persisted schema marker's name.
    // Account Runs are durable user data, so this exact transform advances the CAS revision
    // and leaves every gameplay field byte-for-byte equivalent instead of discarding the Run.
    sql: `
      UPDATE active_runs
         SET body = (body - 'formatVersion')
                    || jsonb_build_object('runSaveVersion', 17),
             revision = revision + 1,
             updated_at = now()
       WHERE body->'formatVersion' = '16'::jsonb
         AND NOT (body ? 'runSaveVersion');
    `,
  },
  {
    version: 55,
    name: 'Sectio, Adlectio, and Alienatio name the Run exchange phase',
    // ADR-0392/0393: this is one vocabulary migration, not a display alias. Durable Run
    // documents, minted craft specs, and the live-media graph all move in the same
    // transaction. Seed labels are code-owned deterministic inputs and intentionally do
    // not appear here: changing them would redeal an otherwise identical Run.
    sql: `
      CREATE OR REPLACE FUNCTION pg_temp.migrate_run_army_unit_to_adlectio(unit_value jsonb)
      RETURNS jsonb
      LANGUAGE sql
      IMMUTABLE
      STRICT
      AS $function$
        SELECT CASE
          WHEN jsonb_typeof(unit_value) = 'object' AND unit_value->>'source' = 'shop'
            THEN jsonb_set(unit_value, '{source}', '"adlectio"'::jsonb, false)
          ELSE unit_value
        END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_run_army_to_adlectio(army_value jsonb)
      RETURNS jsonb
      LANGUAGE sql
      IMMUTABLE
      STRICT
      AS $function$
        SELECT CASE
          WHEN jsonb_typeof(army_value) = 'array' THEN COALESCE(
            (
              SELECT jsonb_agg(
                pg_temp.migrate_run_army_unit_to_adlectio(entry.value)
                ORDER BY entry.ordinality
              )
                FROM jsonb_array_elements(army_value) WITH ORDINALITY AS entry(value, ordinality)
            ),
            '[]'::jsonb
          )
          ELSE army_value
        END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_run_offer_id_to_sectio(offer_id jsonb)
      RETURNS jsonb
      LANGUAGE sql
      IMMUTABLE
      STRICT
      AS $function$
        SELECT CASE
          WHEN jsonb_typeof(offer_id) = 'string' AND offer_id #>> '{}' LIKE 'shop-%'
            THEN to_jsonb('sectio-' || substring(offer_id #>> '{}' from 6))
          ELSE offer_id
        END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_active_run_to_sectio(run_value jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      AS $function$
      DECLARE
        migrated jsonb;
        sectio_value jsonb;
        entry_snapshot jsonb;
      BEGIN
        IF run_value->'runSaveVersion' <> '17'::jsonb THEN
          RETURN run_value;
        END IF;
        IF NOT (run_value ? 'shop') THEN
          RAISE EXCEPTION 'RunSaveVersion 17 document has no shop property';
        END IF;

        sectio_value := run_value->'shop';
        IF jsonb_typeof(sectio_value) = 'object' THEN
          IF jsonb_typeof(sectio_value->'cardOffers') = 'array' THEN
            sectio_value := jsonb_set(
              sectio_value,
              '{cardOffers}',
              COALESCE((
                SELECT jsonb_agg(
                  CASE
                    WHEN jsonb_typeof(entry.value) = 'object' AND entry.value ? 'offerId'
                      THEN jsonb_set(
                        entry.value,
                        '{offerId}',
                        pg_temp.migrate_run_offer_id_to_sectio(entry.value->'offerId'),
                        false
                      )
                    ELSE entry.value
                  END
                  ORDER BY entry.ordinality
                )
                  FROM jsonb_array_elements(sectio_value->'cardOffers')
                    WITH ORDINALITY AS entry(value, ordinality)
              ), '[]'::jsonb),
              false
            );
          END IF;
          IF sectio_value ? 'purchasedCardOfferIds' THEN
            sectio_value := (sectio_value - 'purchasedCardOfferIds') || jsonb_build_object(
              'adlectedCardOfferIds',
              CASE
                WHEN jsonb_typeof(sectio_value->'purchasedCardOfferIds') = 'array' THEN COALESCE((
                  SELECT jsonb_agg(
                    pg_temp.migrate_run_offer_id_to_sectio(entry.value)
                    ORDER BY entry.ordinality
                  )
                    FROM jsonb_array_elements(sectio_value->'purchasedCardOfferIds')
                      WITH ORDINALITY AS entry(value, ordinality)
                ), '[]'::jsonb)
                ELSE sectio_value->'purchasedCardOfferIds'
              END
            );
          END IF;
          IF sectio_value ? 'soldUnits' THEN
            sectio_value := (sectio_value - 'soldUnits') || jsonb_build_object(
              'alienatedUnits',
              CASE
                WHEN jsonb_typeof(sectio_value->'soldUnits') = 'array' THEN COALESCE((
                  SELECT jsonb_agg(
                    CASE
                      WHEN jsonb_typeof(entry.value) = 'object' AND entry.value ? 'unit'
                        THEN jsonb_set(
                          entry.value,
                          '{unit}',
                          pg_temp.migrate_run_army_unit_to_adlectio(entry.value->'unit'),
                          false
                        )
                      ELSE entry.value
                    END
                    ORDER BY entry.ordinality
                  )
                    FROM jsonb_array_elements(sectio_value->'soldUnits')
                      WITH ORDINALITY AS entry(value, ordinality)
                ), '[]'::jsonb)
                ELSE sectio_value->'soldUnits'
              END
            );
          END IF;
          entry_snapshot := sectio_value->'entrySnapshot';
          IF jsonb_typeof(entry_snapshot) = 'object' AND entry_snapshot ? 'army' THEN
            sectio_value := jsonb_set(
              sectio_value,
              '{entrySnapshot,army}',
              pg_temp.migrate_run_army_to_adlectio(entry_snapshot->'army'),
              false
            );
          END IF;
        END IF;

        migrated := (run_value - 'shop') || jsonb_build_object(
          'runSaveVersion', 18,
          'sectio', sectio_value
        );
        IF migrated->>'phase' = 'shop' THEN
          migrated := jsonb_set(migrated, '{phase}', '"sectio"'::jsonb, false);
        END IF;
        IF migrated ? 'army' THEN
          migrated := jsonb_set(
            migrated,
            '{army}',
            pg_temp.migrate_run_army_to_adlectio(migrated->'army'),
            false
          );
        END IF;
        IF jsonb_typeof(migrated->'pestiferousLosses') = 'array' THEN
          migrated := jsonb_set(
            migrated,
            '{pestiferousLosses}',
            COALESCE((
              SELECT jsonb_agg(
                CASE
                  WHEN jsonb_typeof(entry.value) = 'object' AND entry.value ? 'unit'
                    THEN jsonb_set(
                      entry.value,
                      '{unit}',
                      pg_temp.migrate_run_army_unit_to_adlectio(entry.value->'unit'),
                      false
                    )
                  ELSE entry.value
                END
                ORDER BY entry.ordinality
              )
                FROM jsonb_array_elements(migrated->'pestiferousLosses')
                  WITH ORDINALITY AS entry(value, ordinality)
            ), '[]'::jsonb),
            false
          );
        END IF;
        RETURN migrated;
      END
      $function$;

      UPDATE active_runs
         SET body = pg_temp.migrate_active_run_to_sectio(body),
             revision = revision + 1,
             updated_at = now()
       WHERE body->'runSaveVersion' = '17'::jsonb;

      UPDATE run_craft_links
         SET spec = jsonb_set(spec, '{phase}', '"sectio"'::jsonb, false)
       WHERE spec->>'phase' = 'shop';

      -- The slot primary key has three referencing relations. Drop every edge,
      -- move the complete graph, then restore the same restrictive topology.
      DO $$
      DECLARE constraint_name text;
      BEGIN
        SELECT conname INTO constraint_name
          FROM pg_constraint
         WHERE conrelid = 'media_versions'::regclass
           AND confrelid = 'media_slots'::regclass
           AND contype = 'f'
           AND conkey = ARRAY[(
                 SELECT attnum FROM pg_attribute
                  WHERE attrelid = 'media_versions'::regclass AND attname = 'slot'
               )]::smallint[];
        IF constraint_name IS NULL THEN
          RAISE EXCEPTION 'media_versions has no single-column slot foreign key to drop';
        END IF;
        EXECUTE format('ALTER TABLE media_versions DROP CONSTRAINT %I', constraint_name);

        SELECT conname INTO constraint_name
          FROM pg_constraint
         WHERE conrelid = 'drawable_asset_media'::regclass
           AND confrelid = 'media_slots'::regclass
           AND contype = 'f'
           AND conkey = ARRAY[(
                 SELECT attnum FROM pg_attribute
                  WHERE attrelid = 'drawable_asset_media'::regclass AND attname = 'slot'
               )]::smallint[];
        IF constraint_name IS NULL THEN
          RAISE EXCEPTION 'drawable_asset_media has no single-column slot foreign key to drop';
        END IF;
        EXECUTE format('ALTER TABLE drawable_asset_media DROP CONSTRAINT %I', constraint_name);
      END $$;
      ALTER TABLE media_slots DROP CONSTRAINT IF EXISTS media_slots_active_version_fk;

      UPDATE media_slots
         SET slot = CASE
           WHEN slot LIKE 'review/run-shop-wrap/%'
             THEN 'review/run-sectio-wrap/' || substring(slot from '^review/run-shop-wrap/(.*)$')
           WHEN slot LIKE 'review/run-screen-art/sell/%'
             THEN 'review/run-screen-art/alienatio/' || substring(slot from '^review/run-screen-art/sell/(.*)$')
           ELSE 'ui/run/sectio-wrap/' || substring(slot from '^ui/run/shop-wrap/(.*)$')
         END
       WHERE slot LIKE 'review/run-shop-wrap/%'
          OR slot LIKE 'ui/run/shop-wrap/%'
          OR slot LIKE 'review/run-screen-art/sell/%';
      UPDATE media_versions
         SET slot = CASE
           WHEN slot LIKE 'review/run-shop-wrap/%'
             THEN 'review/run-sectio-wrap/' || substring(slot from '^review/run-shop-wrap/(.*)$')
           WHEN slot LIKE 'review/run-screen-art/sell/%'
             THEN 'review/run-screen-art/alienatio/' || substring(slot from '^review/run-screen-art/sell/(.*)$')
           ELSE 'ui/run/sectio-wrap/' || substring(slot from '^ui/run/shop-wrap/(.*)$')
         END
       WHERE slot LIKE 'review/run-shop-wrap/%'
          OR slot LIKE 'ui/run/shop-wrap/%'
          OR slot LIKE 'review/run-screen-art/sell/%';
      UPDATE media_asset_events
         SET slot = CASE
           WHEN slot LIKE 'review/run-shop-wrap/%'
             THEN 'review/run-sectio-wrap/' || substring(slot from '^review/run-shop-wrap/(.*)$')
           WHEN slot LIKE 'review/run-screen-art/sell/%'
             THEN 'review/run-screen-art/alienatio/' || substring(slot from '^review/run-screen-art/sell/(.*)$')
           ELSE 'ui/run/sectio-wrap/' || substring(slot from '^ui/run/shop-wrap/(.*)$')
         END
       WHERE slot LIKE 'review/run-shop-wrap/%'
          OR slot LIKE 'ui/run/shop-wrap/%'
          OR slot LIKE 'review/run-screen-art/sell/%';
      UPDATE drawable_asset_media
         SET slot = CASE
           WHEN slot LIKE 'review/run-shop-wrap/%'
             THEN 'review/run-sectio-wrap/' || substring(slot from '^review/run-shop-wrap/(.*)$')
           WHEN slot LIKE 'review/run-screen-art/sell/%'
             THEN 'review/run-screen-art/alienatio/' || substring(slot from '^review/run-screen-art/sell/(.*)$')
           ELSE 'ui/run/sectio-wrap/' || substring(slot from '^ui/run/shop-wrap/(.*)$')
         END
       WHERE slot LIKE 'review/run-shop-wrap/%'
          OR slot LIKE 'ui/run/shop-wrap/%'
          OR slot LIKE 'review/run-screen-art/sell/%';

      ALTER TABLE media_versions
        ADD CONSTRAINT media_versions_slot_fkey
        FOREIGN KEY (slot) REFERENCES media_slots(slot) ON DELETE RESTRICT;
      ALTER TABLE drawable_asset_media
        ADD CONSTRAINT drawable_asset_media_slot_fkey
        FOREIGN KEY (slot) REFERENCES media_slots(slot) ON DELETE RESTRICT;
      ALTER TABLE media_slots
        ADD CONSTRAINT media_slots_active_version_fk
        FOREIGN KEY (active_version_id, slot) REFERENCES media_versions (id, slot);

      UPDATE media_slots SET role = 'sectio-wrap' WHERE role = 'shop-wrap';
      UPDATE media_versions SET role = 'sectio-wrap' WHERE role = 'shop-wrap';

      UPDATE media_slots
         SET metadata = jsonb_set(
               jsonb_set(metadata, '{runtime,component}', '"run-sectio-wrap"'::jsonb, false),
               '{runtime,nativeRole}', '"run-sectio-wrap"'::jsonb, false)
       WHERE metadata->'runtime'->>'component' = 'run-shop-wrap'
          OR metadata->'runtime'->>'nativeRole' = 'run-shop-wrap';
      UPDATE media_versions
         SET metadata = jsonb_set(
               jsonb_set(metadata, '{runtime,component}', '"run-sectio-wrap"'::jsonb, false),
               '{runtime,nativeRole}', '"run-sectio-wrap"'::jsonb, false)
       WHERE metadata->'runtime'->>'component' = 'run-shop-wrap'
          OR metadata->'runtime'->>'nativeRole' = 'run-shop-wrap';
      UPDATE media_slots
         SET metadata = jsonb_set(
               metadata,
               '{schema}',
               to_jsonb(replace(metadata->>'schema', 'run-shop-wrap-', 'run-sectio-wrap-')),
               false)
       WHERE metadata->>'schema' LIKE 'run-shop-wrap-%';
      UPDATE media_versions
         SET metadata = jsonb_set(
               metadata,
               '{schema}',
               to_jsonb(replace(metadata->>'schema', 'run-shop-wrap-', 'run-sectio-wrap-')),
               false)
       WHERE metadata->>'schema' LIKE 'run-shop-wrap-%';

      UPDATE media_catalog_state
         SET revision = revision + 1, updated_at = now()
       WHERE singleton;
    `,
  },
  {
    version: 56,
    name: 'Klerosis starter cards and one general deployment zone',
    // ADR-0395/0396/0406: RunSaveVersion 19 makes the
    // starter Chartulary and the persisted deal/queue explicit. A pre-19 Battle cannot
    // supply exact automatic destinations because those lived only in browser match state,
    // so it returns to the pre-information Klerosis boundary with its roster, deck, seed,
    // economy, and War progress intact. The same migration retires Pawn-only deployment
    // geometry from every durable playable Level representation, including boardCode.
    sql: `
      CREATE OR REPLACE FUNCTION pg_temp.migrate_run_army_to_primogeniture(army_value jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      DECLARE
        unit_value jsonb;
        abilities jsonb;
        migrated jsonb := '[]'::jsonb;
      BEGIN
        IF jsonb_typeof(army_value) <> 'array' THEN RETURN army_value; END IF;
        FOR unit_value IN SELECT value FROM jsonb_array_elements(army_value) LOOP
          IF jsonb_typeof(unit_value) = 'object' AND unit_value->>'type' = 'king' THEN
            abilities := CASE
              WHEN jsonb_typeof(unit_value->'abilities') = 'array' THEN unit_value->'abilities'
              ELSE '[]'::jsonb
            END;
            IF NOT abilities @> '["primogeniture"]'::jsonb THEN
              unit_value := jsonb_set(unit_value, '{abilities}', abilities || '["primogeniture"]'::jsonb, true);
            END IF;
          END IF;
          migrated := migrated || jsonb_build_array(unit_value);
        END LOOP;
        RETURN migrated;
      END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_run_cards_to_starters(
        cards_value jsonb,
        army_value jsonb
      )
      RETURNS jsonb
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      DECLARE
        cards jsonb := CASE WHEN jsonb_typeof(cards_value) = 'array' THEN cards_value ELSE '[]'::jsonb END;
        king_id text;
        starting_pawn_ids jsonb := '[]'::jsonb;
        his_grace jsonb;
        front_lines jsonb;
      BEGIN
        SELECT unit_value->>'id'
          INTO king_id
          FROM jsonb_array_elements(army_value) AS unit_value
         WHERE jsonb_typeof(unit_value) = 'object'
           AND unit_value->>'type' = 'king'
           AND unit_value ? 'id'
         LIMIT 1;
        SELECT COALESCE(jsonb_agg(to_jsonb(unit_value->>'id') ORDER BY ordinality), '[]'::jsonb)
          INTO starting_pawn_ids
          FROM jsonb_array_elements(army_value) WITH ORDINALITY AS entry(unit_value, ordinality)
         WHERE jsonb_typeof(unit_value) = 'object'
           AND unit_value->>'type' = 'pawn'
           AND unit_value->>'source' = 'starting'
           AND unit_value ? 'id';
        IF king_id IS NULL THEN RETURN cards; END IF;

        his_grace := jsonb_build_object(
          'id', 'run-card-his-grace',
          'coreId', 'his-grace',
          'cardType', NULL,
          'effectSeed', 0,
          'effectTargetUnitId', NULL,
          'unitIds', jsonb_build_array(king_id),
          'lostUnitIds', '[]'::jsonb,
          'cacochymicUnitId', NULL,
          'acquiredAfterBattleIndex', 0
        );
        front_lines := jsonb_build_object(
          'id', 'run-card-front-lines',
          'coreId', 'front-lines',
          'cardType', NULL,
          'effectSeed', 0,
          'effectTargetUnitId', NULL,
          'unitIds', starting_pawn_ids,
          'lostUnitIds', '[]'::jsonb,
          'cacochymicUnitId', NULL,
          'acquiredAfterBattleIndex', 0
        );
        RETURN jsonb_build_array(his_grace, front_lines) || cards;
      END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_active_run_to_klerosis(run_value jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      AS $function$
      DECLARE
        migrated jsonb;
        army_value jsonb;
        sectio_value jsonb;
        entry_snapshot jsonb;
        entry_army jsonb;
      BEGIN
        IF run_value->'runSaveVersion' <> '18'::jsonb THEN RETURN run_value; END IF;
        army_value := pg_temp.migrate_run_army_to_primogeniture(run_value->'army');
        migrated := jsonb_set(run_value, '{army}', army_value, false);
        migrated := jsonb_set(
          migrated,
          '{cards}',
          pg_temp.migrate_run_cards_to_starters(run_value->'cards', army_value),
          false
        );
        migrated := jsonb_set(migrated, '{runSaveVersion}', '19'::jsonb, false);

        IF jsonb_typeof(migrated->'sectio') = 'object'
           AND jsonb_typeof(migrated->'sectio'->'entrySnapshot') = 'object' THEN
          sectio_value := migrated->'sectio';
          entry_snapshot := sectio_value->'entrySnapshot';
          entry_army := pg_temp.migrate_run_army_to_primogeniture(entry_snapshot->'army');
          entry_snapshot := jsonb_set(entry_snapshot, '{army}', entry_army, false);
          entry_snapshot := jsonb_set(
            entry_snapshot,
            '{cards}',
            pg_temp.migrate_run_cards_to_starters(entry_snapshot->'cards', entry_army),
            false
          );
          sectio_value := jsonb_set(sectio_value, '{entrySnapshot}', entry_snapshot, false);
          migrated := jsonb_set(migrated, '{sectio}', sectio_value, false);
        END IF;

        IF migrated->>'phase' IN ('deployment', 'battle') THEN
          migrated := jsonb_set(migrated, '{phase}', '"deployment"'::jsonb, false);
          migrated := jsonb_set(migrated, '{deployment}', 'null'::jsonb, false);
          migrated := jsonb_set(migrated, '{battleRuntime}', 'null'::jsonb, false);
          migrated := jsonb_set(migrated, '{aftermath}', 'null'::jsonb, false);
        END IF;
        RETURN migrated;
      END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.jsonb_distinct_array_concat(left_value jsonb, right_value jsonb)
      RETURNS jsonb
      LANGUAGE sql
      IMMUTABLE
      AS $function$
        SELECT COALESCE(jsonb_agg(value ORDER BY first_ordinality), '[]'::jsonb)
          FROM (
            SELECT value, min(ordinality) AS first_ordinality
              FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(left_value) = 'array' THEN left_value ELSE '[]'::jsonb END
                || CASE WHEN jsonb_typeof(right_value) = 'array' THEN right_value ELSE '[]'::jsonb END
              ) WITH ORDINALITY AS item(value, ordinality)
             GROUP BY value
          ) AS distinct_items
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.without_pawn_exclusion(excluded_value jsonb)
      RETURNS jsonb
      LANGUAGE sql
      IMMUTABLE
      AS $function$
        SELECT COALESCE(jsonb_agg(value ORDER BY ordinality), '[]'::jsonb)
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(excluded_value) = 'array' THEN excluded_value ELSE '[]'::jsonb END
          ) WITH ORDINALITY AS item(value, ordinality)
         WHERE value <> '"pawn"'::jsonb
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_level_layer_zones(zones_value jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      DECLARE
        zone_value jsonb;
        pawn_tiles jsonb := '[]'::jsonb;
        first_pawn jsonb := NULL;
        migrated jsonb := '[]'::jsonb;
        merged boolean := false;
        excluded jsonb;
      BEGIN
        IF jsonb_typeof(zones_value) <> 'array' THEN RETURN zones_value; END IF;
        FOR zone_value IN SELECT value FROM jsonb_array_elements(zones_value) LOOP
          IF jsonb_typeof(zone_value) = 'object' AND zone_value->>'type' = 'player-pawn-spawn' THEN
            IF first_pawn IS NULL THEN first_pawn := zone_value; END IF;
            pawn_tiles := pg_temp.jsonb_distinct_array_concat(pawn_tiles, zone_value->'tiles');
          END IF;
        END LOOP;
        FOR zone_value IN SELECT value FROM jsonb_array_elements(zones_value) LOOP
          IF jsonb_typeof(zone_value) = 'object' AND zone_value->>'type' = 'player-pawn-spawn' THEN CONTINUE; END IF;
          IF jsonb_typeof(zone_value) = 'object' AND zone_value->>'type' = 'player-spawn' THEN
            excluded := pg_temp.without_pawn_exclusion(zone_value->'excludedPieceTypes');
            zone_value := CASE WHEN jsonb_array_length(excluded) = 0
              THEN zone_value - 'excludedPieceTypes'
              ELSE jsonb_set(zone_value, '{excludedPieceTypes}', excluded, true)
            END;
            IF NOT merged AND jsonb_array_length(pawn_tiles) > 0 THEN
              zone_value := jsonb_set(
                zone_value,
                '{tiles}',
                pg_temp.jsonb_distinct_array_concat(zone_value->'tiles', pawn_tiles),
                true
              );
              merged := true;
            END IF;
          END IF;
          migrated := migrated || jsonb_build_array(zone_value);
        END LOOP;
        IF NOT merged AND first_pawn IS NOT NULL THEN
          first_pawn := jsonb_set(first_pawn, '{type}', '"player-spawn"'::jsonb, false)
            - 'excludedPieceTypes';
          first_pawn := jsonb_set(first_pawn, '{tiles}', pawn_tiles, true);
          migrated := migrated || jsonb_build_array(first_pawn);
        END IF;
        RETURN migrated;
      END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_board_wire_zones(wire_value jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      DECLARE
        migrated jsonb := wire_value;
        entry_value jsonb;
        pawn_tiles jsonb := '[]'::jsonb;
        first_pawn jsonb := NULL;
        entries jsonb := '[]'::jsonb;
        merged boolean := false;
        excluded jsonb;
        legacy_zones jsonb;
      BEGIN
        IF jsonb_typeof(wire_value) <> 'object' THEN RETURN wire_value; END IF;
        IF jsonb_typeof(wire_value->'zn') = 'array' THEN
          FOR entry_value IN SELECT value FROM jsonb_array_elements(wire_value->'zn') LOOP
            IF jsonb_typeof(entry_value) = 'array' AND entry_value->>1 = 'player-pawn-spawn' THEN
              IF first_pawn IS NULL THEN first_pawn := entry_value; END IF;
              pawn_tiles := pg_temp.jsonb_distinct_array_concat(pawn_tiles, entry_value->2);
            END IF;
          END LOOP;
          FOR entry_value IN SELECT value FROM jsonb_array_elements(wire_value->'zn') LOOP
            IF jsonb_typeof(entry_value) = 'array' AND entry_value->>1 = 'player-pawn-spawn' THEN CONTINUE; END IF;
            IF jsonb_typeof(entry_value) = 'array' AND entry_value->>1 = 'player-spawn' THEN
              IF jsonb_typeof(entry_value->5) = 'array' THEN
                excluded := pg_temp.without_pawn_exclusion(entry_value->5);
                entry_value := jsonb_set(entry_value, '{5}', excluded, false);
              END IF;
              IF NOT merged AND jsonb_array_length(pawn_tiles) > 0 THEN
                entry_value := jsonb_set(
                  entry_value,
                  '{2}',
                  pg_temp.jsonb_distinct_array_concat(entry_value->2, pawn_tiles),
                  false
                );
                merged := true;
              END IF;
            END IF;
            entries := entries || jsonb_build_array(entry_value);
          END LOOP;
          IF NOT merged AND first_pawn IS NOT NULL THEN
            first_pawn := jsonb_set(first_pawn, '{1}', '"player-spawn"'::jsonb, false);
            first_pawn := jsonb_set(first_pawn, '{2}', pawn_tiles, false);
            IF jsonb_typeof(first_pawn->5) = 'array' THEN
              first_pawn := jsonb_set(first_pawn, '{5}', '[]'::jsonb, false);
            END IF;
            entries := entries || jsonb_build_array(first_pawn);
          END IF;
          migrated := jsonb_set(migrated, '{zn}', entries, false);
        END IF;
        IF jsonb_typeof(wire_value->'z') = 'object' THEN
          SELECT COALESCE(jsonb_object_agg(
            key,
            CASE WHEN value = '"player-pawn-spawn"'::jsonb THEN '"player-spawn"'::jsonb ELSE value END
          ), '{}'::jsonb)
            INTO legacy_zones
            FROM jsonb_each(wire_value->'z');
          migrated := jsonb_set(migrated, '{z}', legacy_zones, false);
        END IF;
        RETURN migrated;
      END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_level_board_code(code_value text)
      RETURNS text
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      DECLARE
        padded text;
        wire_value jsonb;
        encoded text;
      BEGIN
        padded := translate(code_value, '-_', '+/')
          || repeat('=', (4 - length(code_value) % 4) % 4);
        wire_value := convert_from(decode(padded, 'base64'), 'UTF8')::jsonb;
        wire_value := pg_temp.migrate_board_wire_zones(wire_value);
        encoded := encode(convert_to(wire_value::text, 'UTF8'), 'base64');
        RETURN replace(replace(replace(replace(replace(encoded, '+', '-'), '/', '_'), E'\n', ''), E'\r', ''), '=', '');
      EXCEPTION WHEN others THEN
        RETURN code_value;
      END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_level_object(level_value jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      DECLARE
        migrated jsonb := level_value;
        layers_value jsonb;
      BEGIN
        IF jsonb_typeof(level_value) <> 'object' THEN RETURN level_value; END IF;
        IF jsonb_typeof(migrated->'layers') = 'object'
           AND jsonb_typeof(migrated->'layers'->'zones') = 'array' THEN
          layers_value := jsonb_set(
            migrated->'layers',
            '{zones}',
            pg_temp.migrate_level_layer_zones(migrated->'layers'->'zones'),
            false
          );
          migrated := jsonb_set(migrated, '{layers}', layers_value, false);
        END IF;
        IF jsonb_typeof(migrated->'boardCode') = 'string' THEN
          migrated := jsonb_set(
            migrated,
            '{boardCode}',
            to_jsonb(pg_temp.migrate_level_board_code(migrated->>'boardCode')),
            false
          );
        END IF;
        RETURN migrated;
      END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_nested_levels(document_value jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      DECLARE
        migrated jsonb;
      BEGIN
        IF jsonb_typeof(document_value) = 'array' THEN
          SELECT COALESCE(jsonb_agg(pg_temp.migrate_nested_levels(value) ORDER BY ordinality), '[]'::jsonb)
            INTO migrated
            FROM jsonb_array_elements(document_value) WITH ORDINALITY AS entry(value, ordinality);
          RETURN migrated;
        END IF;
        IF jsonb_typeof(document_value) = 'object' THEN
          SELECT COALESCE(jsonb_object_agg(key, pg_temp.migrate_nested_levels(value)), '{}'::jsonb)
            INTO migrated
            FROM jsonb_each(document_value);
          IF migrated->'formatVersion' = '1'::jsonb
             AND (migrated ? 'layers' OR migrated ? 'boardCode') THEN
            migrated := pg_temp.migrate_level_object(migrated);
          END IF;
          RETURN migrated;
        END IF;
        RETURN document_value;
      END
      $function$;

      UPDATE active_runs
         SET body = pg_temp.migrate_nested_levels(pg_temp.migrate_active_run_to_klerosis(body)),
             revision = revision + 1,
             updated_at = now()
       WHERE body->'runSaveVersion' = '18'::jsonb;

      UPDATE levels
         SET body = pg_temp.migrate_nested_levels(body),
             revision = revision + 1,
             updated_at = now()
       WHERE pg_temp.migrate_nested_levels(body) IS DISTINCT FROM body;
      UPDATE campaign_workspaces
         SET body = pg_temp.migrate_nested_levels(body),
             revision = revision + 1,
             updated_at = now()
       WHERE pg_temp.migrate_nested_levels(body) IS DISTINCT FROM body;
      UPDATE official_campaigns
         SET data = pg_temp.migrate_nested_levels(data),
             revision = revision + 1,
             updated_at = now(),
             updated_by = 'migration-56'
       WHERE pg_temp.migrate_nested_levels(data) IS DISTINCT FROM data;
      UPDATE public_maps
         SET body = pg_temp.migrate_nested_levels(body), updated_at = now()
       WHERE pg_temp.migrate_nested_levels(body) IS DISTINCT FROM body;

      UPDATE level_working_copy_revisions
         SET body = pg_temp.migrate_nested_levels(body)
       WHERE pg_temp.migrate_nested_levels(body) IS DISTINCT FROM body;
      WITH changed AS (
        UPDATE level_working_copies
           SET body = pg_temp.migrate_nested_levels(body),
               saved_revision = CASE WHEN saved_revision = revision THEN revision + 1 ELSE saved_revision END,
               revision = revision + 1,
               baseline_hash = NULL,
               updated_at = now()
         WHERE pg_temp.migrate_nested_levels(body) IS DISTINCT FROM body
        RETURNING document_id, revision, body, saved_revision, baseline_hash, updated_at
      )
      INSERT INTO level_working_copy_revisions
        (document_id, revision, body, saved_revision, baseline_hash, reason, created_at)
      SELECT document_id, revision, body, saved_revision, baseline_hash, 'migration', updated_at
        FROM changed
      ON CONFLICT (document_id, revision) DO NOTHING;
      UPDATE editor_document_edit_sessions
         SET draft_body = pg_temp.migrate_nested_levels(draft_body)
       WHERE pg_temp.migrate_nested_levels(draft_body) IS DISTINCT FROM draft_body;
      UPDATE editor_document_recoveries
         SET body = pg_temp.migrate_nested_levels(body)
       WHERE pg_temp.migrate_nested_levels(body) IS DISTINCT FROM body;

      UPDATE lab_runs SET body = pg_temp.migrate_nested_levels(body)
       WHERE pg_temp.migrate_nested_levels(body) IS DISTINCT FROM body;
      UPDATE train_runs
         SET spec = pg_temp.migrate_nested_levels(spec), body = pg_temp.migrate_nested_levels(body), updated_at = now()
       WHERE pg_temp.migrate_nested_levels(spec) IS DISTINCT FROM spec
          OR pg_temp.migrate_nested_levels(body) IS DISTINCT FROM body;
      UPDATE solve_runs
         SET spec = pg_temp.migrate_nested_levels(spec), body = pg_temp.migrate_nested_levels(body), updated_at = now()
       WHERE pg_temp.migrate_nested_levels(spec) IS DISTINCT FROM spec
          OR pg_temp.migrate_nested_levels(body) IS DISTINCT FROM body;
    `,
  },
  {
    version: 57,
    name: 'Expunctio Sectio transaction',
    // ADR-0407: RunSaveVersion 20 persists the once-per-Sectio card-removal
    // transaction. The reset snapshot also gains the Run's exact Pestiferous losses so
    // striking a Pestiferous card remains fully reversible until the player continues.
    sql: `
      CREATE OR REPLACE FUNCTION pg_temp.migrate_active_run_to_expunctio(run_value jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      DECLARE
        migrated jsonb := run_value;
        sectio_value jsonb;
        entry_snapshot jsonb;
      BEGIN
        IF run_value->'runSaveVersion' <> '19'::jsonb THEN RETURN run_value; END IF;
        migrated := jsonb_set(migrated, '{runSaveVersion}', '20'::jsonb, false);
        IF jsonb_typeof(migrated->'sectio') = 'object' THEN
          sectio_value := migrated->'sectio';
          sectio_value := jsonb_set(sectio_value, '{expunctedCard}', 'null'::jsonb, true);
          IF jsonb_typeof(sectio_value->'entrySnapshot') = 'object' THEN
            entry_snapshot := sectio_value->'entrySnapshot';
            entry_snapshot := jsonb_set(
              entry_snapshot,
              '{pestiferousLosses}',
              CASE WHEN jsonb_typeof(migrated->'pestiferousLosses') = 'array'
                THEN migrated->'pestiferousLosses'
                ELSE '[]'::jsonb
              END,
              true
            );
            sectio_value := jsonb_set(sectio_value, '{entrySnapshot}', entry_snapshot, false);
          END IF;
          migrated := jsonb_set(migrated, '{sectio}', sectio_value, false);
        END IF;
        RETURN migrated;
      END
      $function$;

      UPDATE active_runs
         SET body = pg_temp.migrate_active_run_to_expunctio(body),
             revision = revision + 1,
             updated_at = now()
       WHERE body->'runSaveVersion' = '19'::jsonb;
    `,
  },
  {
    version: 58,
    name: 'card-ordered deployment state',
    // ADR-0419: RunSaveVersion 21 retires Primogeniture and the independent
    // Klerosis/Farrago queue. Cards gain stable nullable unit seats; an in-flight
    // Deployment or Battle returns to the new pre-information empty battlefield.
    sql: `
      CREATE OR REPLACE FUNCTION pg_temp.migrate_run_unit_from_primogeniture(unit_value jsonb)
      RETURNS jsonb
      LANGUAGE sql
      IMMUTABLE
      STRICT
      AS $function$
        SELECT CASE WHEN jsonb_typeof(unit_value) <> 'object' THEN unit_value ELSE
          jsonb_set(
            unit_value,
            '{abilities}',
            COALESCE((
              SELECT jsonb_agg(ability ORDER BY ordinal)
                FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(unit_value->'abilities') = 'array'
                    THEN unit_value->'abilities' ELSE '[]'::jsonb END
                ) WITH ORDINALITY AS abilities(ability, ordinal)
               WHERE ability <> '"primogeniture"'::jsonb
            ), '[]'::jsonb),
            true
          )
        END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_run_army_from_primogeniture(army_value jsonb)
      RETURNS jsonb
      LANGUAGE sql
      IMMUTABLE
      STRICT
      AS $function$
        SELECT CASE WHEN jsonb_typeof(army_value) <> 'array' THEN army_value ELSE
          COALESCE((
            SELECT jsonb_agg(pg_temp.migrate_run_unit_from_primogeniture(unit_value) ORDER BY ordinal)
              FROM jsonb_array_elements(army_value) WITH ORDINALITY AS units(unit_value, ordinal)
          ), '[]'::jsonb)
        END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_run_card_to_unit_seats(card_value jsonb, army_value jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      DECLARE
        unit_ids jsonb := CASE WHEN jsonb_typeof(card_value->'unitIds') = 'array'
          THEN card_value->'unitIds' ELSE '[]'::jsonb END;
        core_id text := card_value->>'coreId';
        piece_types text[] := ARRAY[]::text[];
        used_unit_ids text[] := ARRAY[]::text[];
        unit_seats jsonb := '[]'::jsonb;
        piece_code text;
        piece_type text;
        candidate_unit_id text;
        candidate_type text;
        selected_unit_id text;
        piece_index integer;
      BEGIN
        IF jsonb_typeof(card_value) <> 'object' THEN RETURN card_value; END IF;
        IF core_id = 'his-grace' THEN
          piece_types := ARRAY['king'];
        ELSIF core_id = 'front-lines' THEN
          piece_types := ARRAY['pawn', 'pawn'];
        ELSIF core_id ~ '^[pkbrq]+$' THEN
          FOR piece_index IN 1..length(core_id) LOOP
            piece_code := substr(core_id, piece_index, 1);
            piece_types := array_append(piece_types, CASE piece_code
              WHEN 'p' THEN 'pawn'
              WHEN 'k' THEN 'knight'
              WHEN 'b' THEN 'bishop'
              WHEN 'r' THEN 'rook'
              WHEN 'q' THEN 'queen'
            END);
          END LOOP;
        ELSE
          RETURN (card_value - 'unitIds') || jsonb_build_object('unitSeats', unit_ids);
        END IF;
        -- A complete predecessor already owns an order. Only a sold-down card needs
        -- its typed definition expanded back to stable nullable seats.
        IF jsonb_array_length(unit_ids) >= cardinality(piece_types) THEN
          RETURN (card_value - 'unitIds') || jsonb_build_object('unitSeats', unit_ids);
        END IF;
        FOREACH piece_type IN ARRAY piece_types LOOP
          selected_unit_id := NULL;
          FOR candidate_unit_id IN
            SELECT unit_id #>> '{}'
              FROM jsonb_array_elements(unit_ids) WITH ORDINALITY AS ids(unit_id, ordinal)
             WHERE jsonb_typeof(unit_id) = 'string'
               AND NOT ((unit_id #>> '{}') = ANY(used_unit_ids))
             ORDER BY ordinal
          LOOP
            SELECT unit_value->>'type'
              INTO candidate_type
              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(army_value) = 'array'
                THEN army_value ELSE '[]'::jsonb END) AS units(unit_value)
             WHERE unit_value->>'id' = candidate_unit_id
             LIMIT 1;
            IF candidate_type = piece_type THEN
              selected_unit_id := candidate_unit_id;
              used_unit_ids := array_append(used_unit_ids, selected_unit_id);
              EXIT;
            END IF;
          END LOOP;
          unit_seats := unit_seats || jsonb_build_array(
            CASE WHEN selected_unit_id IS NULL THEN 'null'::jsonb ELSE to_jsonb(selected_unit_id) END
          );
        END LOOP;
        -- Preserve malformed but still-referenced predecessor data for validation rather
        -- than silently dropping a unit that could not be associated with a typed seat.
        IF cardinality(used_unit_ids) <> jsonb_array_length(unit_ids) THEN
          unit_seats := unit_ids;
        END IF;
        RETURN (card_value - 'unitIds') || jsonb_build_object('unitSeats', unit_seats);
      END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_run_cards_to_unit_seats(cards_value jsonb, army_value jsonb)
      RETURNS jsonb
      LANGUAGE sql
      IMMUTABLE
      STRICT
      AS $function$
        SELECT CASE WHEN jsonb_typeof(cards_value) <> 'array' THEN cards_value ELSE
          COALESCE((
            SELECT jsonb_agg(pg_temp.migrate_run_card_to_unit_seats(card_value, army_value) ORDER BY ordinal)
              FROM jsonb_array_elements(cards_value) WITH ORDINALITY AS cards(card_value, ordinal)
          ), '[]'::jsonb)
        END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_run_losses_from_primogeniture(losses_value jsonb)
      RETURNS jsonb
      LANGUAGE sql
      IMMUTABLE
      STRICT
      AS $function$
        SELECT CASE WHEN jsonb_typeof(losses_value) <> 'array' THEN losses_value ELSE
          COALESCE((
            SELECT jsonb_agg(
              CASE WHEN jsonb_typeof(loss_value) = 'object'
                THEN jsonb_set(
                  loss_value,
                  '{unit}',
                  pg_temp.migrate_run_unit_from_primogeniture(loss_value->'unit'),
                  false
                )
                ELSE loss_value
              END
              ORDER BY ordinal
            )
              FROM jsonb_array_elements(losses_value) WITH ORDINALITY AS losses(loss_value, ordinal)
          ), '[]'::jsonb)
        END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_run_sectio_to_card_order(sectio_value jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      DECLARE
        migrated jsonb := sectio_value;
        entry_snapshot jsonb;
        expuncted jsonb;
      BEGIN
        IF jsonb_typeof(sectio_value) <> 'object' THEN RETURN sectio_value; END IF;
        IF jsonb_typeof(migrated->'alienatedUnits') = 'array' THEN
          migrated := jsonb_set(migrated, '{alienatedUnits}', COALESCE((
            SELECT jsonb_agg(
              CASE WHEN jsonb_typeof(alienated) = 'object' THEN jsonb_set(
                alienated,
                '{unit}',
                pg_temp.migrate_run_unit_from_primogeniture(alienated->'unit'),
                false
              ) ELSE alienated END
              ORDER BY ordinal
            ) FROM jsonb_array_elements(migrated->'alienatedUnits')
              WITH ORDINALITY AS values(alienated, ordinal)
          ), '[]'::jsonb), false);
        END IF;
        IF jsonb_typeof(migrated->'expunctedCard') = 'object' THEN
          expuncted := migrated->'expunctedCard';
          expuncted := jsonb_set(
            expuncted,
            '{card}',
            pg_temp.migrate_run_card_to_unit_seats(expuncted->'card', expuncted->'units'),
            false
          );
          expuncted := jsonb_set(
            expuncted,
            '{units}',
            pg_temp.migrate_run_army_from_primogeniture(expuncted->'units'),
            false
          );
          migrated := jsonb_set(migrated, '{expunctedCard}', expuncted, false);
        END IF;
        IF jsonb_typeof(migrated->'entrySnapshot') = 'object' THEN
          entry_snapshot := migrated->'entrySnapshot';
          entry_snapshot := jsonb_set(
            entry_snapshot,
            '{army}',
            pg_temp.migrate_run_army_from_primogeniture(entry_snapshot->'army'),
            false
          );
          entry_snapshot := jsonb_set(
            entry_snapshot,
            '{cards}',
            pg_temp.migrate_run_cards_to_unit_seats(entry_snapshot->'cards', entry_snapshot->'army'),
            false
          );
          entry_snapshot := jsonb_set(
            entry_snapshot,
            '{pestiferousLosses}',
            pg_temp.migrate_run_losses_from_primogeniture(entry_snapshot->'pestiferousLosses'),
            false
          );
          migrated := jsonb_set(migrated, '{entrySnapshot}', entry_snapshot, false);
        END IF;
        RETURN migrated;
      END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_active_run_to_card_order(run_value jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      DECLARE
        migrated jsonb := run_value;
        reenter_deployment boolean;
      BEGIN
        IF run_value->'runSaveVersion' <> '20'::jsonb THEN RETURN run_value; END IF;
        reenter_deployment := run_value->>'phase' IN ('deployment', 'battle');
        migrated := jsonb_set(migrated, '{runSaveVersion}', '21'::jsonb, false);
        migrated := jsonb_set(
          migrated,
          '{army}',
          pg_temp.migrate_run_army_from_primogeniture(migrated->'army'),
          false
        );
        migrated := jsonb_set(
          migrated,
          '{cards}',
          pg_temp.migrate_run_cards_to_unit_seats(migrated->'cards', migrated->'army'),
          false
        );
        migrated := jsonb_set(
          migrated,
          '{pestiferousLosses}',
          pg_temp.migrate_run_losses_from_primogeniture(migrated->'pestiferousLosses'),
          false
        );
        IF jsonb_typeof(migrated->'sectio') = 'object' THEN
          migrated := jsonb_set(
            migrated,
            '{sectio}',
            pg_temp.migrate_run_sectio_to_card_order(migrated->'sectio'),
            false
          );
        END IF;
        IF reenter_deployment THEN
          migrated := jsonb_set(migrated, '{phase}', '"deployment"'::jsonb, false);
          migrated := jsonb_set(migrated, '{deployment}', 'null'::jsonb, false);
          migrated := jsonb_set(migrated, '{battleRuntime}', 'null'::jsonb, false);
          migrated := jsonb_set(migrated, '{aftermath}', 'null'::jsonb, true);
        END IF;
        RETURN migrated;
      END
      $function$;

      UPDATE active_runs
         SET body = pg_temp.migrate_active_run_to_card_order(body),
             revision = revision + 1,
             updated_at = now()
       WHERE body->'runSaveVersion' = '20'::jsonb;
    `,
  },
  {
    version: 59,
    name: 'complete Primogeniture retirement',
    // ADR-0419 retires the ability as one installed-content graph change. Remove
    // the app-ui consumer before retiring the semantic slot so no catalog snapshot
    // can retain a dangling role. Every write is conditional, making the migration
    // safe after an owner has already completed the same canonical transactions.
    sql: `
      WITH removed_media AS (
        DELETE FROM drawable_asset_media
         WHERE asset_id = 'app-ui'
           AND role = 'ui-kit-icons-game-primogeniture-png'
        RETURNING asset_id
      ), updated_asset AS (
        UPDATE drawable_assets
           SET behavior = jsonb_set(
                 COALESCE(behavior, '{}'::jsonb),
                 '{requiredRoles}',
                 COALESCE((
                   SELECT jsonb_agg(required_role ORDER BY ordinal)
                     FROM jsonb_array_elements(
                       CASE WHEN jsonb_typeof(behavior->'requiredRoles') = 'array'
                         THEN behavior->'requiredRoles' ELSE '[]'::jsonb END
                     ) WITH ORDINALITY AS required(required_role, ordinal)
                    WHERE required_role <> to_jsonb('ui-kit-icons-game-primogeniture-png'::text)
                 ), '[]'::jsonb),
                 true
               ),
               row_revision = row_revision + 1,
               updated_at = now(),
               updated_by = 'migration-59'
         WHERE id = 'app-ui'
           AND (
             EXISTS (SELECT 1 FROM removed_media)
             OR (
               jsonb_typeof(behavior->'requiredRoles') = 'array'
               AND (behavior->'requiredRoles') ? 'ui-kit-icons-game-primogeniture-png'
             )
           )
        RETURNING id
      )
      UPDATE drawable_catalog_state
         SET revision = revision + 1,
             updated_at = now()
       WHERE singleton = true
         AND (
           EXISTS (SELECT 1 FROM removed_media)
           OR EXISTS (SELECT 1 FROM updated_asset)
         );

      WITH target_slot AS (
        SELECT slot, active_version_id
          FROM media_slots
         WHERE slot = 'ui/kit/icons/game/primogeniture.png'
           AND lifecycle_state <> 'retired'
      ), archived_version AS (
        UPDATE media_versions AS version
           SET status = 'archived',
               row_revision = row_revision + 1,
               updated_at = now(),
               updated_by = 'migration-59'
          FROM target_slot
         WHERE version.id = target_slot.active_version_id
           AND version.status <> 'archived'
        RETURNING version.id
      ), retired_slot AS (
        UPDATE media_slots AS slot
           SET active_version_id = NULL,
               lifecycle_state = 'retired',
               retired_at = now(),
               retirement_evidence = jsonb_build_object(
                 'reason', 'Primogeniture retired by ADR-0419',
                 'evidence', jsonb_build_object(
                   'decision', 'ADR-0419',
                   'replacement', 'Praecipuus and persisted dealt-card order'
                 ),
                 'retiredBy', 'migration-59',
                 'retiredAt', now(),
                 'previousVersionId', target_slot.active_version_id
               ),
               row_revision = row_revision + 1,
               updated_at = now(),
               updated_by = 'migration-59'
          FROM target_slot
         WHERE slot.slot = target_slot.slot
        RETURNING slot.slot, target_slot.active_version_id
      ), retirement_event AS (
        INSERT INTO media_asset_events (
          slot, source_path, version_id, action, actor_email, details
        )
        SELECT retired_slot.slot, NULL, retired_slot.active_version_id,
               'slot-retired', 'migration-59',
               jsonb_build_object(
                 'reason', 'Primogeniture retired by ADR-0419',
                 'decision', 'ADR-0419',
                 'previousVersionId', retired_slot.active_version_id
               )
          FROM retired_slot
        RETURNING id
      )
      UPDATE media_catalog_state
         SET revision = revision + 1,
             updated_at = now()
       WHERE singleton = true
         AND EXISTS (SELECT 1 FROM retired_slot);
    `,
  },
  {
    version: 60,
    name: 'deployment deal and transport state',
    // ADR-0422: RunSaveVersion 22 makes the pre-deal boundary explicit and
    // replaces the old one-time mode choice with paused/play/full transport.
    // Every predecessor already past the deal keeps its exact revealed and
    // committed information, but resumes paused rather than moving on its own.
    sql: `
      CREATE OR REPLACE FUNCTION pg_temp.migrate_active_run_to_deployment_transport(run_value jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      DECLARE
        migrated jsonb := run_value;
        deployment_value jsonb;
        deployment_stage text;
      BEGIN
        IF run_value->'runSaveVersion' <> '21'::jsonb THEN RETURN run_value; END IF;
        migrated := jsonb_set(migrated, '{runSaveVersion}', '22'::jsonb, false);
        IF jsonb_typeof(migrated->'deployment') = 'object' THEN
          deployment_value := (migrated->'deployment') - 'mode'::text;
          deployment_stage := deployment_value->>'stage';
          IF deployment_stage = 'dealing' THEN
            deployment_value := jsonb_set(deployment_value, '{stage}', '"awaiting-deal"'::jsonb, false);
          ELSIF deployment_stage = 'pace' THEN
            deployment_value := jsonb_set(deployment_value, '{stage}', '"card"'::jsonb, false);
          END IF;
          deployment_value := jsonb_set(deployment_value, '{transport}', '"paused"'::jsonb, true);
          migrated := jsonb_set(migrated, '{deployment}', deployment_value, false);
        END IF;
        RETURN migrated;
      END
      $function$;

      UPDATE active_runs
         SET body = pg_temp.migrate_active_run_to_deployment_transport(body),
             revision = revision + 1,
             updated_at = now()
       WHERE body->'runSaveVersion' = '21'::jsonb;
    `,
  },
  {
    version: 61,
    name: 'Level format 2 and saved editor baselines',
    // ADR-0429: Level format 2 gives migration 56's Pawn-zone retirement an
    // explicit document-version edge. RunSaveVersion 23 advances every embedded
    // Battle Level with it. Saved working copies reconstruct their migrated
    // baseline from the retained saved revision; true never-saved drafts remain null.
    sql: `
      CREATE OR REPLACE FUNCTION pg_temp.level_v2_distinct_array_concat(left_value jsonb, right_value jsonb)
      RETURNS jsonb
      LANGUAGE sql
      IMMUTABLE
      AS $function$
        SELECT COALESCE(jsonb_agg(value ORDER BY first_ordinality), '[]'::jsonb)
          FROM (
            SELECT value, min(ordinality) AS first_ordinality
              FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(left_value) = 'array' THEN left_value ELSE '[]'::jsonb END
                || CASE WHEN jsonb_typeof(right_value) = 'array' THEN right_value ELSE '[]'::jsonb END
              ) WITH ORDINALITY AS item(value, ordinality)
             GROUP BY value
          ) AS distinct_items
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.level_v2_without_pawn_exclusion(excluded_value jsonb)
      RETURNS jsonb
      LANGUAGE sql
      IMMUTABLE
      AS $function$
        SELECT COALESCE(jsonb_agg(value ORDER BY ordinality), '[]'::jsonb)
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(excluded_value) = 'array' THEN excluded_value ELSE '[]'::jsonb END
          ) WITH ORDINALITY AS item(value, ordinality)
         WHERE value <> '"pawn"'::jsonb
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_level_v2_layer_zones(zones_value jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      DECLARE
        zone_value jsonb;
        pawn_tiles jsonb := '[]'::jsonb;
        first_pawn jsonb := NULL;
        migrated jsonb := '[]'::jsonb;
        merged boolean := false;
        excluded jsonb;
      BEGIN
        IF jsonb_typeof(zones_value) <> 'array' THEN RETURN zones_value; END IF;
        FOR zone_value IN SELECT value FROM jsonb_array_elements(zones_value) LOOP
          IF jsonb_typeof(zone_value) = 'object' AND zone_value->>'type' = 'player-pawn-spawn' THEN
            IF first_pawn IS NULL THEN first_pawn := zone_value; END IF;
            pawn_tiles := pg_temp.level_v2_distinct_array_concat(pawn_tiles, zone_value->'tiles');
          END IF;
        END LOOP;
        FOR zone_value IN SELECT value FROM jsonb_array_elements(zones_value) LOOP
          IF jsonb_typeof(zone_value) = 'object' AND zone_value->>'type' = 'player-pawn-spawn' THEN CONTINUE; END IF;
          IF jsonb_typeof(zone_value) = 'object' AND zone_value->>'type' = 'player-spawn' THEN
            IF jsonb_typeof(zone_value->'excludedPieceTypes') = 'array'
               AND (
                 first_pawn IS NOT NULL
                 OR zone_value->'excludedPieceTypes' @> '["pawn"]'::jsonb
               ) THEN
              excluded := pg_temp.level_v2_without_pawn_exclusion(zone_value->'excludedPieceTypes');
              zone_value := CASE WHEN jsonb_array_length(excluded) = 0
                THEN zone_value - 'excludedPieceTypes'
                ELSE jsonb_set(zone_value, '{excludedPieceTypes}', excluded, true)
              END;
            END IF;
            IF NOT merged AND first_pawn IS NOT NULL THEN
              zone_value := jsonb_set(
                zone_value,
                '{tiles}',
                pg_temp.level_v2_distinct_array_concat(zone_value->'tiles', pawn_tiles),
                true
              );
              merged := true;
            END IF;
          END IF;
          migrated := migrated || jsonb_build_array(zone_value);
        END LOOP;
        IF NOT merged AND first_pawn IS NOT NULL THEN
          first_pawn := jsonb_set(first_pawn, '{type}', '"player-spawn"'::jsonb, false)
            - 'excludedPieceTypes';
          first_pawn := jsonb_set(first_pawn, '{tiles}', pawn_tiles, true);
          migrated := migrated || jsonb_build_array(first_pawn);
        END IF;
        RETURN migrated;
      END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_level_v2_board_wire(wire_value jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      DECLARE
        migrated jsonb := wire_value;
        entry_value jsonb;
        pawn_tiles jsonb := '[]'::jsonb;
        first_pawn jsonb := NULL;
        entries jsonb := '[]'::jsonb;
        merged boolean := false;
        excluded jsonb;
        legacy_zones jsonb;
      BEGIN
        IF jsonb_typeof(wire_value) <> 'object' THEN RETURN wire_value; END IF;
        IF jsonb_typeof(wire_value->'zn') = 'array' THEN
          FOR entry_value IN SELECT value FROM jsonb_array_elements(wire_value->'zn') LOOP
            IF jsonb_typeof(entry_value) = 'array' AND entry_value->>1 = 'player-pawn-spawn' THEN
              IF first_pawn IS NULL THEN first_pawn := entry_value; END IF;
              pawn_tiles := pg_temp.level_v2_distinct_array_concat(pawn_tiles, entry_value->2);
            END IF;
          END LOOP;
          FOR entry_value IN SELECT value FROM jsonb_array_elements(wire_value->'zn') LOOP
            IF jsonb_typeof(entry_value) = 'array' AND entry_value->>1 = 'player-pawn-spawn' THEN CONTINUE; END IF;
            IF jsonb_typeof(entry_value) = 'array' AND entry_value->>1 = 'player-spawn' THEN
              IF jsonb_typeof(entry_value->5) = 'array' THEN
                excluded := pg_temp.level_v2_without_pawn_exclusion(entry_value->5);
                entry_value := jsonb_set(entry_value, '{5}', excluded, false);
              END IF;
              IF NOT merged AND first_pawn IS NOT NULL THEN
                entry_value := jsonb_set(
                  entry_value,
                  '{2}',
                  pg_temp.level_v2_distinct_array_concat(entry_value->2, pawn_tiles),
                  false
                );
                merged := true;
              END IF;
            END IF;
            entries := entries || jsonb_build_array(entry_value);
          END LOOP;
          IF NOT merged AND first_pawn IS NOT NULL THEN
            first_pawn := jsonb_set(first_pawn, '{1}', '"player-spawn"'::jsonb, false);
            first_pawn := jsonb_set(first_pawn, '{2}', pawn_tiles, false);
            IF jsonb_typeof(first_pawn->5) = 'array' THEN
              first_pawn := jsonb_set(first_pawn, '{5}', '[]'::jsonb, false);
            END IF;
            entries := entries || jsonb_build_array(first_pawn);
          END IF;
          migrated := jsonb_set(migrated, '{zn}', entries, false);
        END IF;
        IF jsonb_typeof(wire_value->'z') = 'object' THEN
          SELECT COALESCE(jsonb_object_agg(
            key,
            CASE WHEN value = '"player-pawn-spawn"'::jsonb THEN '"player-spawn"'::jsonb ELSE value END
          ), '{}'::jsonb)
            INTO legacy_zones
            FROM jsonb_each(wire_value->'z');
          migrated := jsonb_set(migrated, '{z}', legacy_zones, false);
        END IF;
        RETURN migrated;
      END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_level_v2_board_code(code_value text)
      RETURNS text
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      DECLARE
        padded text;
        wire_value jsonb;
        encoded text;
      BEGIN
        padded := translate(code_value, '-_', '+/')
          || repeat('=', (4 - length(code_value) % 4) % 4);
        wire_value := convert_from(decode(padded, 'base64'), 'UTF8')::jsonb;
        wire_value := pg_temp.migrate_level_v2_board_wire(wire_value);
        encoded := encode(convert_to(wire_value::text, 'UTF8'), 'base64');
        RETURN replace(replace(replace(replace(replace(encoded, '+', '-'), '/', '_'), E'\n', ''), E'\r', ''), '=', '');
      EXCEPTION WHEN others THEN
        RETURN code_value;
      END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_level_object_v2(level_value jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      DECLARE
        migrated jsonb := level_value;
        layers_value jsonb;
      BEGIN
        IF jsonb_typeof(level_value) <> 'object' OR level_value->'formatVersion' <> '1'::jsonb THEN
          RETURN level_value;
        END IF;
        IF jsonb_typeof(migrated->'layers') = 'object'
           AND jsonb_typeof(migrated->'layers'->'zones') = 'array' THEN
          layers_value := jsonb_set(
            migrated->'layers',
            '{zones}',
            pg_temp.migrate_level_v2_layer_zones(migrated->'layers'->'zones'),
            false
          );
          migrated := jsonb_set(migrated, '{layers}', layers_value, false);
        END IF;
        IF jsonb_typeof(migrated->'boardCode') = 'string' THEN
          migrated := jsonb_set(
            migrated,
            '{boardCode}',
            to_jsonb(pg_temp.migrate_level_v2_board_code(migrated->>'boardCode')),
            false
          );
        END IF;
        RETURN jsonb_set(migrated, '{formatVersion}', '2'::jsonb, false);
      END
      $function$;

      CREATE OR REPLACE FUNCTION pg_temp.migrate_nested_levels_v2(document_value jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      DECLARE
        migrated jsonb;
      BEGIN
        IF jsonb_typeof(document_value) = 'array' THEN
          SELECT COALESCE(jsonb_agg(pg_temp.migrate_nested_levels_v2(value) ORDER BY ordinality), '[]'::jsonb)
            INTO migrated
            FROM jsonb_array_elements(document_value) WITH ORDINALITY AS entry(value, ordinality);
          RETURN migrated;
        END IF;
        IF jsonb_typeof(document_value) = 'object' THEN
          SELECT COALESCE(jsonb_object_agg(key, pg_temp.migrate_nested_levels_v2(value)), '{}'::jsonb)
            INTO migrated
            FROM jsonb_each(document_value);
          IF migrated->'formatVersion' = '1'::jsonb
             AND (migrated ? 'layers' OR migrated ? 'boardCode') THEN
            migrated := pg_temp.migrate_level_object_v2(migrated);
          END IF;
          IF migrated->'runSaveVersion' = '22'::jsonb AND migrated ? 'war' THEN
            migrated := jsonb_set(migrated, '{runSaveVersion}', '23'::jsonb, false);
          END IF;
          RETURN migrated;
        END IF;
        RETURN document_value;
      END
      $function$;

      DROP TABLE IF EXISTS pg_temp.level_migration_61_baselines;
      CREATE TEMP TABLE level_migration_61_baselines ON COMMIT DROP AS
      SELECT working.document_id,
             working.baseline_hash AS old_baseline_hash,
             working.saved_revision,
             md5(saved.body::text) AS old_saved_hash,
             md5(pg_temp.migrate_nested_levels_v2(saved.body)::text) AS new_saved_hash,
             pg_temp.migrate_nested_levels_v2(working.body) AS migrated_body
        FROM level_working_copies working
        LEFT JOIN LATERAL (
          SELECT revision.body
            FROM level_working_copy_revisions revision
           WHERE revision.document_id = working.document_id
             AND revision.revision = working.saved_revision
          UNION ALL
          SELECT working.body
           WHERE working.revision = working.saved_revision
          LIMIT 1
        ) saved ON true;

      UPDATE active_runs
         SET body = pg_temp.migrate_nested_levels_v2(body),
             revision = revision + 1,
             updated_at = now()
       WHERE pg_temp.migrate_nested_levels_v2(body) IS DISTINCT FROM body;
      UPDATE levels
         SET body = pg_temp.migrate_nested_levels_v2(body),
             revision = revision + 1,
             updated_at = now()
       WHERE pg_temp.migrate_nested_levels_v2(body) IS DISTINCT FROM body;
      UPDATE campaign_workspaces
         SET body = pg_temp.migrate_nested_levels_v2(body),
             revision = revision + 1,
             updated_at = now()
       WHERE pg_temp.migrate_nested_levels_v2(body) IS DISTINCT FROM body;
      UPDATE official_campaigns
         SET data = pg_temp.migrate_nested_levels_v2(data),
             revision = revision + 1,
             updated_at = now(),
             updated_by = 'migration-61'
       WHERE pg_temp.migrate_nested_levels_v2(data) IS DISTINCT FROM data;
      UPDATE public_maps
         SET body = pg_temp.migrate_nested_levels_v2(body), updated_at = now()
       WHERE pg_temp.migrate_nested_levels_v2(body) IS DISTINCT FROM body;

      UPDATE level_working_copy_revisions
         SET body = pg_temp.migrate_nested_levels_v2(body)
       WHERE pg_temp.migrate_nested_levels_v2(body) IS DISTINCT FROM body;
      WITH candidates AS (
        SELECT working.document_id,
               evidence.migrated_body,
               CASE
                 WHEN evidence.saved_revision > 0
                  AND evidence.new_saved_hash IS NOT NULL
                  AND (
                    evidence.old_baseline_hash IS NULL
                    OR evidence.old_baseline_hash = evidence.old_saved_hash
                  )
                 THEN evidence.new_saved_hash
                 ELSE evidence.old_baseline_hash
               END AS migrated_baseline_hash
          FROM level_working_copies working
          JOIN level_migration_61_baselines evidence USING (document_id)
      ), changed AS (
        UPDATE level_working_copies working
           SET body = candidate.migrated_body,
               saved_revision = CASE
                 WHEN working.saved_revision = working.revision THEN working.revision + 1
                 ELSE working.saved_revision
               END,
               revision = working.revision + 1,
               baseline_hash = candidate.migrated_baseline_hash,
               updated_at = now()
          FROM candidates candidate
         WHERE candidate.document_id = working.document_id
           AND (
             candidate.migrated_body IS DISTINCT FROM working.body
             OR candidate.migrated_baseline_hash IS DISTINCT FROM working.baseline_hash
           )
        RETURNING working.document_id, working.revision, working.body,
                  working.saved_revision, working.baseline_hash, working.updated_at
      )
      INSERT INTO level_working_copy_revisions
        (document_id, revision, body, saved_revision, baseline_hash, reason, created_at)
      SELECT document_id, revision, body, saved_revision, baseline_hash, 'migration', updated_at
        FROM changed
      ON CONFLICT (document_id, revision) DO NOTHING;

      UPDATE editor_document_edit_sessions
         SET draft_body = pg_temp.migrate_nested_levels_v2(draft_body)
       WHERE pg_temp.migrate_nested_levels_v2(draft_body) IS DISTINCT FROM draft_body;
      UPDATE editor_document_recoveries
         SET body = pg_temp.migrate_nested_levels_v2(body)
       WHERE pg_temp.migrate_nested_levels_v2(body) IS DISTINCT FROM body;
      UPDATE lab_runs
         SET body = pg_temp.migrate_nested_levels_v2(body)
       WHERE pg_temp.migrate_nested_levels_v2(body) IS DISTINCT FROM body;
      UPDATE train_runs
         SET spec = pg_temp.migrate_nested_levels_v2(spec),
             body = pg_temp.migrate_nested_levels_v2(body),
             updated_at = now()
       WHERE pg_temp.migrate_nested_levels_v2(spec) IS DISTINCT FROM spec
          OR pg_temp.migrate_nested_levels_v2(body) IS DISTINCT FROM body;
      UPDATE solve_runs
         SET spec = pg_temp.migrate_nested_levels_v2(spec),
             body = pg_temp.migrate_nested_levels_v2(body),
             updated_at = now()
       WHERE pg_temp.migrate_nested_levels_v2(spec) IS DISTINCT FROM spec
          OR pg_temp.migrate_nested_levels_v2(body) IS DISTINCT FROM body;
    `,
  },
  {
    version: 62,
    name: 'Retained saved editor baseline evidence',
    // ADR-0430: migration 61 can reconstruct a baseline from the exact saved
    // revision, but production history retention predates that invariant. When
    // the saved revision itself is gone, a later retained revision carrying the
    // same saved_revision and a non-null baseline_hash is still direct evidence
    // of that save boundary. Restore the newest such hash and preserve the
    // resulting conflict until the owner explicitly Discards or resolves it.
    sql: `
      WITH candidates AS (
        SELECT working.document_id,
               evidence.baseline_hash AS recovered_baseline_hash
          FROM level_working_copies working
          JOIN LATERAL (
            SELECT revision.baseline_hash
              FROM level_working_copy_revisions revision
             WHERE revision.document_id = working.document_id
               AND revision.saved_revision = working.saved_revision
               AND revision.baseline_hash IS NOT NULL
             ORDER BY revision.revision DESC
             LIMIT 1
          ) evidence ON true
         WHERE working.saved_revision > 0
           AND working.baseline_hash IS NULL
      ), changed AS (
        UPDATE level_working_copies working
           SET revision = working.revision + 1,
               baseline_hash = candidate.recovered_baseline_hash,
               updated_at = now()
          FROM candidates candidate
         WHERE candidate.document_id = working.document_id
        RETURNING working.document_id, working.revision, working.body,
                  working.saved_revision, working.baseline_hash, working.updated_at
      )
      INSERT INTO level_working_copy_revisions
        (document_id, revision, body, saved_revision, baseline_hash, reason, created_at)
      SELECT document_id, revision, body, saved_revision, baseline_hash, 'migration', updated_at
        FROM changed
      ON CONFLICT (document_id, revision) DO NOTHING;
    `,
  },
];

let pool = null;
let dbReady = false;
let schemaReadinessPromise = null;
const REQUIRED_SCHEMA_MIGRATION_VERSIONS = MIGRATIONS.map((migration) => migration.version);
const REQUIRED_EDITOR_DOCUMENT_REVISION_REASONS = Object.freeze([
  'migration',
  'resolve',
  'create',
  'autosave',
  'save',
  'discard',
  'restore',
  'canonical-refresh',
  'generation-attempt-archive',
  'generation-attempt-occlusion-discard',
]);
const CHECKSUMMED_SCHEMA_HISTORY_MIGRATION_VERSION = 37;
const LEGACY_SCHEMA_HISTORY_MAX_VERSION = 36;
const LEGACY_SPARSE_SCHEMA_HISTORY_VERSIONS = Object.freeze([36]);
const REQUIRED_SCHEMA_RELATIONS = [
  'level_thumbnail_derivatives',
  'level_working_copy_revisions',
  'level_working_copy_revision_reasons',
  'editor_document_edit_sessions',
  'editor_document_recoveries',
  'editor_document_edit_events',
  'predrawn_background_versions',
  'predrawn_background_version_events',
  'predrawn_background_geometry_bindings',
  'predrawn_background_raw_contract_bindings',
  'predrawn_generation_attempts',
  'predrawn_generation_attempt_events',
  'lipsanon_stat_events',
  'run_progression',
  'active_runs',
  // run_craft_links (migration 50) is deliberately absent. This list drives auto-repair of
  // relations the app cannot serve a single route without; craft links are a debugging
  // instrument, so a database missing that one table fails craft links alone with a message
  // naming the migration, rather than being repaired out from under an operator.
];
const REQUIRED_SCHEMA_REPAIR_MIGRATIONS = new Map([
  ['level_thumbnail_derivatives', 22],
  ['level_working_copy_revisions', [24, 37]],
  ['level_working_copy_revision_reasons', 37],
  ['editor_document_edit_sessions', 25],
  ['editor_document_recoveries', 25],
  ['editor_document_edit_events', 25],
  ['predrawn_background_versions', 28],
  ['predrawn_background_version_events', 28],
  ['predrawn_background_geometry_bindings', 30],
  ['predrawn_background_raw_contract_bindings', 35],
  ['predrawn_generation_attempts', 43],
  ['predrawn_generation_attempt_events', 43],
  // Migration 45 creates this relation under its original name and 52 renames it, so a
  // repair must replay both — replaying 45 alone would rebuild the retired spelling.
  ['lipsanon_stat_events', [45, 52]],
  ['run_progression', 49],
  ['active_runs', 44],
]);

function buildPool() {
  if (databaseUrl) {
    // Azure managed Postgres requires TLS. Prod connects through the POSTGRES_HOST
    // (AAD) branch below, so this only affects DATABASE_URL targets: turn SSL on when
    // the URL points at an Azure Postgres or asks for it (sslmode=require); a local/CI
    // Postgres (localhost) stays plaintext, unchanged.
    const needsSsl = /sslmode=require/i.test(databaseUrl) || /\.postgres\.database\.azure\.com/i.test(databaseUrl);
    return new Pool({
      connectionString: databaseUrl,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
      max: 8,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  if (pgHost && pgDatabase && pgUser) {
    // Lazy require so password-mode environments don't need @azure/identity.
    const { DefaultAzureCredential } = require('@azure/identity');
    const credential = new DefaultAzureCredential();
    return new Pool({
      host: pgHost,
      port: 5432,
      database: pgDatabase,
      user: pgUser,
      // pg evaluates this per new connection; @azure/identity caches the token
      // and refreshes it before the ~1h expiry.
      password: async () => {
        const token = await credential.getToken(AAD_DB_TOKEN_SCOPE);
        if (!token || !token.token) throw new Error('failed to acquire AAD token for Postgres');
        return token.token;
      },
      // sslmode=require equivalent: encrypt in transit. The server is reachable
      // only through the Azure-internal firewall rule, never the public internet.
      ssl: { rejectUnauthorized: false },
      max: 8,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      // Recycle connections before the AAD token TTL so reconnects fetch a fresh
      // token.
      maxLifetimeSeconds: 50 * 60,
    });
  }
  return null;
}

async function schemaMigrationIdentityColumnsAvailable(client) {
  const { rows } = await client.query(
    `SELECT count(*)::integer AS count
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'schema_migrations'
        AND column_name IN ('name', 'checksum')`,
  );
  return Number(rows[0]?.count) === 2;
}

async function schemaMigrationHistoryRows(client) {
  const hasIdentity = await schemaMigrationIdentityColumnsAvailable(client);
  const { rows } = await client.query(hasIdentity
    ? 'SELECT version, name, checksum FROM schema_migrations ORDER BY version'
    : 'SELECT version, NULL::text AS name, NULL::text AS checksum FROM schema_migrations ORDER BY version');
  if (
    !hasIdentity
    && rows.some((row) => Number(row.version) >= CHECKSUMMED_SCHEMA_HISTORY_MIGRATION_VERSION)
  ) {
    throw new MigrationIntegrityError(
      `schema migration ${CHECKSUMMED_SCHEMA_HISTORY_MIGRATION_VERSION} is recorded but its identity columns are absent`,
      {
        recorded_identity_migration: CHECKSUMMED_SCHEMA_HISTORY_MIGRATION_VERSION,
        missing_identity_columns: ['name', 'checksum'],
      },
    );
  }
  return { rows, hasIdentity };
}

async function insertSchemaMigrationHistory(client, migration) {
  if (await schemaMigrationIdentityColumnsAvailable(client)) {
    await client.query(
      `INSERT INTO schema_migrations (version, name, checksum)
       VALUES ($1, $2, $3)`,
      [migration.version, migration.name, migrationChecksum(migration)],
    );
    return;
  }
  await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [migration.version]);
}

async function sealLegacySchemaMigrationHistory(client) {
  if (!(await schemaMigrationIdentityColumnsAvailable(client))) return [];
  const sealedVersions = [];
  for (const migration of migrationManifest(MIGRATIONS)) {
    if (migration.version > LEGACY_SCHEMA_HISTORY_MAX_VERSION) continue;
    const result = await client.query(
      `UPDATE schema_migrations
          SET name = $2,
              checksum = $3
        WHERE version = $1
          AND name IS NULL
          AND checksum IS NULL
        RETURNING version`,
      [migration.version, migration.name, migration.checksum],
    );
    if (result.rowCount > 0) sealedVersions.push(migration.version);
  }
  return sealedVersions;
}

function schemaMigrationHistoryCanSealLegacy(history) {
  if (!history.hasIdentity) return true;
  const unsealed = history.rows.filter(
    (row) => row.name === null || row.checksum === null,
  );
  if (!unsealed.length) return false;
  const identityMigration = migrationManifest(MIGRATIONS).find(
    (migration) => migration.version === CHECKSUMMED_SCHEMA_HISTORY_MIGRATION_VERSION,
  );
  const recordedIdentityMigration = history.rows.find(
    (row) => Number(row.version) === CHECKSUMMED_SCHEMA_HISTORY_MIGRATION_VERSION,
  );
  return Boolean(
    identityMigration
    && recordedIdentityMigration
    && recordedIdentityMigration.name === identityMigration.name
    && recordedIdentityMigration.checksum === identityMigration.checksum
    && unsealed.every((row) => (
      Number(row.version) <= LEGACY_SCHEMA_HISTORY_MAX_VERSION
      && row.name === null
      && row.checksum === null
    )),
  );
}

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);
    try {
      let plan = null;
      const appliedVersions = [];
      const completedRelationRepairSteps = [];
      const completedContractRepairSteps = [];
      const sealedLegacyVersions = new Set();
      let failingMigration = null;
      let failurePhase = '';
      const activity = () => ({
        completedRelationRepairSteps,
        completedContractRepairSteps,
        sealedLegacyVersions: [...sealedLegacyVersions],
      });
      const executeRepairMigration = async (migration, phase) => {
        failingMigration = migration;
        failurePhase = phase;
        await client.query(migration.sql);
      };
      const markInspectionPhase = (phase) => {
        failingMigration = null;
        failurePhase = phase;
      };
      const sealLegacyHistory = async (migration, phase) => {
        failingMigration = migration;
        failurePhase = phase;
        const sealed = await sealLegacySchemaMigrationHistory(client);
        sealed.forEach((version) => sealedLegacyVersions.add(version));
      };
      try {
        await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
        let history = await schemaMigrationHistoryRows(client);
        const canSealLegacyHistory = schemaMigrationHistoryCanSealLegacy(history);
        plan = planMigrationExecution(MIGRATIONS, history.rows, {
          allowUnsealed: canSealLegacyHistory,
          allowLegacySparseVersions: canSealLegacyHistory
            ? LEGACY_SPARSE_SCHEMA_HISTORY_VERSIONS
            : [],
        });
        if (history.hasIdentity && canSealLegacyHistory) {
          const identityMigration = MIGRATIONS.find(
            (migration) => migration.version === CHECKSUMMED_SCHEMA_HISTORY_MIGRATION_VERSION,
          );
          await sealLegacyHistory(identityMigration, 'seal legacy migration identities');
          markInspectionPhase('verify sealed legacy migration history');
          history = await schemaMigrationHistoryRows(client);
          plan = planMigrationExecution(MIGRATIONS, history.rows);
        }
        const migrationByVersion = new Map(MIGRATIONS.map((migration) => [migration.version, migration]));
        for (const pending of plan.pending) {
          const migration = migrationByVersion.get(pending.version);
          failingMigration = migration;
          failurePhase = 'apply';
          await client.query('BEGIN');
          try {
            await client.query(migration.sql);
            await insertSchemaMigrationHistory(client, migration);
            await client.query('COMMIT');
            appliedVersions.push(migration.version);
            if (migration.version === CHECKSUMMED_SCHEMA_HISTORY_MIGRATION_VERSION) {
              await sealLegacyHistory(
                migration,
                `seal legacy migration identities after migration ${migration.version}`,
              );
              markInspectionPhase(
                `verify legacy migration identities sealed after migration ${migration.version}`,
              );
              const sealedIdentityHistory = await schemaMigrationHistoryRows(client);
              planMigrationExecution(MIGRATIONS, sealedIdentityHistory.rows);
            }
            failingMigration = null;
            failurePhase = '';
          } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
          }
        }
        await repairRequiredSchemaRelations(
          client,
          executeRepairMigration,
          markInspectionPhase,
          completedRelationRepairSteps,
        );
        await repairRequiredSchemaContracts(
          client,
          executeRepairMigration,
          markInspectionPhase,
          completedContractRepairSteps,
        );
        failingMigration = null;
        failurePhase = 'verify required schema postconditions';
        await checkRequiredSchemaRelations(client);
        await checkRequiredSchemaContracts(client);
        const identityMigration = MIGRATIONS.find(
          (migration) => migration.version === CHECKSUMMED_SCHEMA_HISTORY_MIGRATION_VERSION,
        );
        await sealLegacyHistory(identityMigration, 'seal legacy migration identities');
        failingMigration = null;
        failurePhase = 'verify sealed migration history';
        const sealedHistory = await schemaMigrationHistoryRows(client);
        const sealedPlan = planMigrationExecution(MIGRATIONS, sealedHistory.rows);
        if (sealedPlan.pending.length) {
          throw new SchemaMigrationRequiredError(
            `schema migrations remain pending after apply: ${sealedPlan.pending.map((entry) => entry.version).join(', ')}`,
            { missing_versions: sealedPlan.pending.map((entry) => entry.version) },
          );
        }
        return migrationRunResult(plan, appliedVersions, activity());
      } catch (error) {
        if (error instanceof MigrationExecutionError || !plan) throw error;
        throw migrationExecutionFailure(
          plan,
          appliedVersions,
          failingMigration,
          failurePhase,
          error,
          activity(),
        );
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK_KEY]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

class SchemaMigrationRequiredError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SchemaMigrationRequiredError';
    this.code = 'schema_migration_required';
    this.details = details;
  }
}

async function missingRequiredSchemaRelations(client) {
  const { rows } = await client.query(
    `SELECT relation
       FROM unnest($1::text[]) AS required(relation)
      WHERE to_regclass('public.' || relation) IS NULL`,
    [REQUIRED_SCHEMA_RELATIONS],
  );
  return rows.map((row) => row.relation);
}

async function repairRequiredSchemaRelations(
  client,
  executeMigration = (migration) => client.query(migration.sql),
  markInspection = () => {},
  completedSteps = [],
) {
  markInspection('inspect required relation repairs');
  const missing = await missingRequiredSchemaRelations(client);
  for (const relation of missing) {
    const configuredVersions = REQUIRED_SCHEMA_REPAIR_MIGRATIONS.get(relation);
    const migrationVersions = Array.isArray(configuredVersions)
      ? configuredVersions
      : [configuredVersions];
    for (const migrationVersion of migrationVersions) {
      const migration = MIGRATIONS.find((candidate) => candidate.version === migrationVersion);
      if (!migration) throw new Error(`required schema repair migration is unavailable for ${relation}`);
      // Numeric migration history can outlive an earlier definition of the same
      // version. Required runtime state is therefore repaired from its immutable,
      // idempotent DDL while the migration advisory lock is held.
      await executeMigration(migration, `repair relation ${relation}`);
      completedSteps.push(Object.freeze({
        relation,
        migration_version: migration.version,
      }));
      markInspection(`inspect remaining required relation repairs after migration ${migration.version}`);
    }
  }
  return Object.freeze(completedSteps);
}

async function checkRequiredSchemaRelations(client) {
  const missing = await missingRequiredSchemaRelations(client);
  if (missing.length) {
    throw new SchemaMigrationRequiredError(`required schema relations missing: ${missing.join(', ')}`, {
      missing_relations: missing,
    });
  }
}

async function missingRequiredSchemaRevisionReasons(client) {
  const { rows } = await client.query(
    `SELECT required.reason
       FROM unnest($1::text[]) AS required(reason)
       LEFT JOIN level_working_copy_revision_reasons stored
         ON stored.reason = required.reason
      WHERE stored.reason IS NULL
      ORDER BY required.reason`,
    [REQUIRED_EDITOR_DOCUMENT_REVISION_REASONS],
  );
  return rows.map((row) => row.reason);
}

async function workingCopyRevisionReasonConstraintRows(client) {
  const { rows } = await client.query(
    `SELECT
       constraint_entry.conname AS constraint_name,
       constraint_entry.contype AS constraint_type,
       constraint_entry.convalidated AS validated,
       constraint_entry.confupdtype AS update_action,
       constraint_entry.confdeltype AS delete_action,
       referenced_namespace.nspname AS referenced_schema,
       referenced_table.relname AS referenced_table,
       ARRAY(
         SELECT local_attribute.attname::text
           FROM unnest(constraint_entry.conkey) WITH ORDINALITY
             AS local_key(attnum, position)
           JOIN pg_attribute local_attribute
             ON local_attribute.attrelid = constraint_entry.conrelid
            AND local_attribute.attnum = local_key.attnum
          ORDER BY local_key.position
       ) AS local_columns,
       ARRAY(
         SELECT referenced_attribute.attname::text
           FROM unnest(constraint_entry.confkey) WITH ORDINALITY
             AS referenced_key(attnum, position)
           JOIN pg_attribute referenced_attribute
             ON referenced_attribute.attrelid = constraint_entry.confrelid
            AND referenced_attribute.attnum = referenced_key.attnum
          ORDER BY referenced_key.position
       ) AS referenced_columns,
       pg_get_constraintdef(constraint_entry.oid) AS definition
     FROM pg_constraint constraint_entry
     JOIN pg_class local_table
       ON local_table.oid = constraint_entry.conrelid
     JOIN pg_namespace local_namespace
       ON local_namespace.oid = local_table.relnamespace
     LEFT JOIN pg_class referenced_table
       ON referenced_table.oid = constraint_entry.confrelid
     LEFT JOIN pg_namespace referenced_namespace
       ON referenced_namespace.oid = referenced_table.relnamespace
    WHERE local_namespace.nspname = 'public'
      AND local_table.relname = 'level_working_copy_revisions'
      AND constraint_entry.contype IN ('c', 'f')`,
  );
  return rows;
}

async function generationAttemptRetryContractRows(client) {
  const columns = await client.query(
    `SELECT column_name, is_nullable, data_type, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'predrawn_generation_attempts'
        AND column_name = 'processing_revision'`,
  );
  const constraints = await client.query(
    `SELECT
       local_table.relname AS table_name,
       constraint_entry.conname AS constraint_name,
       constraint_entry.convalidated AS validated,
       pg_get_constraintdef(constraint_entry.oid) AS definition
     FROM pg_constraint constraint_entry
     JOIN pg_class local_table
       ON local_table.oid = constraint_entry.conrelid
     JOIN pg_namespace local_namespace
       ON local_namespace.oid = local_table.relnamespace
    WHERE local_namespace.nspname = 'public'
      AND local_table.relname IN (
        'predrawn_generation_attempts',
        'predrawn_generation_attempt_events'
      )
      AND constraint_entry.contype = 'c'`,
  );
  return Object.freeze({
    columns: columns.rows,
    constraints: constraints.rows,
  });
}

async function generationAttemptMoveHighlightContractRows(client) {
  const columns = await client.query(
    `SELECT column_name, is_nullable, data_type, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'predrawn_generation_attempts'
        AND column_name IN (
          'move_highlight_profile',
          'move_highlight_profile_sha256',
          'move_highlight_profile_warped_version_id'
        )
      ORDER BY ordinal_position`,
  );
  const constraints = await client.query(
    `SELECT
       local_table.relname AS table_name,
       constraint_entry.conname AS constraint_name,
       constraint_entry.contype AS constraint_type,
       constraint_entry.convalidated AS validated,
       constraint_entry.confupdtype AS update_action,
       constraint_entry.confdeltype AS delete_action,
       referenced_namespace.nspname AS referenced_schema,
       referenced_table.relname AS referenced_table,
       ARRAY(
         SELECT local_attribute.attname::text
           FROM unnest(constraint_entry.conkey) WITH ORDINALITY
             AS local_key(attnum, position)
           JOIN pg_attribute local_attribute
             ON local_attribute.attrelid = constraint_entry.conrelid
            AND local_attribute.attnum = local_key.attnum
          ORDER BY local_key.position
       ) AS local_columns,
       ARRAY(
         SELECT referenced_attribute.attname::text
           FROM unnest(constraint_entry.confkey) WITH ORDINALITY
             AS referenced_key(attnum, position)
           JOIN pg_attribute referenced_attribute
             ON referenced_attribute.attrelid = constraint_entry.confrelid
            AND referenced_attribute.attnum = referenced_key.attnum
          ORDER BY referenced_key.position
       ) AS referenced_columns,
       pg_get_constraintdef(constraint_entry.oid) AS definition
     FROM pg_constraint constraint_entry
     JOIN pg_class local_table
       ON local_table.oid = constraint_entry.conrelid
     JOIN pg_namespace local_namespace
       ON local_namespace.oid = local_table.relnamespace
     LEFT JOIN pg_class referenced_table
       ON referenced_table.oid = constraint_entry.confrelid
     LEFT JOIN pg_namespace referenced_namespace
       ON referenced_namespace.oid = referenced_table.relnamespace
    WHERE local_namespace.nspname = 'public'
      AND local_table.relname IN (
        'predrawn_generation_attempts',
        'predrawn_generation_attempt_events'
      )
      AND constraint_entry.contype IN ('c', 'f')`,
  );
  return Object.freeze({
    columns: columns.rows,
    constraints: constraints.rows,
  });
}

async function schemaMigrationIdentityBoundaryRows(client) {
  const columns = await client.query(
    `SELECT column_name, is_nullable, data_type
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'schema_migrations'
        AND column_name IN ('name', 'checksum')
      ORDER BY ordinal_position`,
  );
  const constraints = await client.query(
    `SELECT
       constraint_entry.conname AS constraint_name,
       constraint_entry.contype AS constraint_type,
       constraint_entry.convalidated AS validated,
       constraint_entry.conislocal AS is_local,
       constraint_entry.coninhcount AS inheritance_count,
       constraint_entry.connoinherit AS no_inherit,
       ARRAY(
         SELECT local_attribute.attname::text
           FROM unnest(constraint_entry.conkey) WITH ORDINALITY
             AS local_key(attnum, position)
           JOIN pg_attribute local_attribute
             ON local_attribute.attrelid = constraint_entry.conrelid
            AND local_attribute.attnum = local_key.attnum
          ORDER BY local_key.position
       ) AS local_columns,
       pg_get_constraintdef(constraint_entry.oid) AS definition
     FROM pg_constraint constraint_entry
     JOIN pg_class local_table
       ON local_table.oid = constraint_entry.conrelid
     JOIN pg_namespace local_namespace
       ON local_namespace.oid = local_table.relnamespace
    WHERE local_namespace.nspname = 'public'
      AND local_table.relname = 'schema_migrations'
      AND constraint_entry.contype = 'c'`,
  );
  return Object.freeze({
    columns: columns.rows,
    constraints: constraints.rows,
  });
}

async function unmigratedActiveRunSaveCounts(client) {
  const { rows } = await client.query(
    `SELECT
       count(*) FILTER (
         WHERE body->'formatVersion' = '16'::jsonb
           AND NOT (body ? 'runSaveVersion')
       )::integer AS version_16_count,
       count(*) FILTER (
         WHERE body->'runSaveVersion' = '17'::jsonb
       )::integer AS version_17_count,
       count(*) FILTER (
         WHERE body->'runSaveVersion' = '18'::jsonb
       )::integer AS version_18_count,
       count(*) FILTER (
         WHERE body->'runSaveVersion' = '19'::jsonb
       )::integer AS version_19_count,
       count(*) FILTER (
         WHERE body->'runSaveVersion' = '20'::jsonb
       )::integer AS version_20_count,
       count(*) FILTER (
         WHERE body->'runSaveVersion' = '21'::jsonb
       )::integer AS version_21_count,
       count(*) FILTER (
         WHERE body->'runSaveVersion' = '22'::jsonb
       )::integer AS version_22_count
       FROM active_runs`,
  );
  return Object.freeze({
    version_16_count: Number(rows[0]?.version_16_count) || 0,
    version_17_count: Number(rows[0]?.version_17_count) || 0,
    version_18_count: Number(rows[0]?.version_18_count) || 0,
    version_19_count: Number(rows[0]?.version_19_count) || 0,
    version_20_count: Number(rows[0]?.version_20_count) || 0,
    version_21_count: Number(rows[0]?.version_21_count) || 0,
    version_22_count: Number(rows[0]?.version_22_count) || 0,
  });
}

async function unmigratedLevelDocumentCount(client) {
  const { rows } = await client.query(
    `WITH documents(value) AS (
       SELECT body FROM levels
       UNION ALL SELECT body FROM campaign_workspaces
       UNION ALL SELECT data FROM official_campaigns
       UNION ALL SELECT body FROM public_maps
       UNION ALL SELECT body FROM level_working_copies
       UNION ALL SELECT body FROM level_working_copy_revisions
       UNION ALL SELECT draft_body FROM editor_document_edit_sessions
       UNION ALL SELECT body FROM editor_document_recoveries
       UNION ALL SELECT body FROM active_runs
       UNION ALL SELECT body FROM lab_runs
       UNION ALL SELECT spec FROM train_runs
       UNION ALL SELECT body FROM train_runs
       UNION ALL SELECT spec FROM solve_runs
       UNION ALL SELECT body FROM solve_runs
     )
     SELECT count(*)::integer AS count
       FROM documents document
       CROSS JOIN LATERAL jsonb_path_query(document.value, '$.**') nested(value)
      WHERE jsonb_typeof(nested.value) = 'object'
        AND nested.value->'formatVersion' = '1'::jsonb
        AND (nested.value ? 'layers' OR nested.value ? 'boardCode')`,
  );
  return Number(rows[0]?.count) || 0;
}

async function unrepairedSavedEditorBaselineCount(client) {
  const { rows } = await client.query(
    `SELECT count(*)::integer AS count
       FROM level_working_copies
      WHERE saved_revision > 0
        AND baseline_hash IS NULL`,
  );
  return Number(rows[0]?.count) || 0;
}

async function primogenitureRetirementContractRows(client) {
  const { rows } = await client.query(
    `SELECT
       (SELECT count(*)::integer
          FROM media_slots
         WHERE slot = 'ui/kit/icons/game/primogeniture.png'
           AND lifecycle_state <> 'retired') AS non_retired_slot_count,
       (SELECT count(*)::integer
          FROM drawable_asset_media
         WHERE asset_id = 'app-ui'
           AND role = 'ui-kit-icons-game-primogeniture-png') AS drawable_binding_count,
       (SELECT count(*)::integer
          FROM drawable_assets
         WHERE id = 'app-ui'
           AND jsonb_typeof(behavior->'requiredRoles') = 'array'
           AND (behavior->'requiredRoles') ? 'ui-kit-icons-game-primogeniture-png')
         AS required_role_count`,
  );
  return Object.freeze({
    non_retired_slot_count: Number(rows[0]?.non_retired_slot_count) || 0,
    drawable_binding_count: Number(rows[0]?.drawable_binding_count) || 0,
    required_role_count: Number(rows[0]?.required_role_count) || 0,
  });
}

async function requiredSchemaContractIssues(client) {
  const missingReasons = await missingRequiredSchemaRevisionReasons(client);
  const constraints = await workingCopyRevisionReasonConstraintRows(client);
  const retryContractRows = await generationAttemptRetryContractRows(client);
  const moveHighlightContractRows = await generationAttemptMoveHighlightContractRows(client);
  const migrationIdentityRows = await schemaMigrationIdentityBoundaryRows(client);
  const unmigratedActiveRunSaves = await unmigratedActiveRunSaveCounts(client);
  const unmigratedLevelDocuments = await unmigratedLevelDocumentCount(client);
  const unrepairedSavedEditorBaselines = await unrepairedSavedEditorBaselineCount(client);
  const primogenitureRetirement = await primogenitureRetirementContractRows(client);
  const migrationIdentityIssues = schemaMigrationIdentityBoundaryIssues(
    migrationIdentityRows.columns,
    migrationIdentityRows.constraints,
  );
  const reasonChecks = constraints.filter(
    (constraint) => (
      constraint.constraint_type === 'c'
      && /\breason\b/i.test(String(constraint.definition || ''))
    ),
  );
  const reasonForeignKeys = constraints.filter(
    (constraint) => (
      constraint.constraint_type === 'f'
      && Array.isArray(constraint.local_columns)
      && constraint.local_columns.includes('reason')
    ),
  );
  const canonicalForeignKeys = reasonForeignKeys.filter(
    (constraint) => (
      constraint.constraint_name === 'level_working_copy_revisions_reason_fk'
      && constraint.validated === true
      && constraint.referenced_schema === 'public'
      && constraint.referenced_table === 'level_working_copy_revision_reasons'
      && JSON.stringify(constraint.local_columns) === '["reason"]'
      && JSON.stringify(constraint.referenced_columns) === '["reason"]'
      && constraint.update_action === 'r'
      && constraint.delete_action === 'r'
    ),
  );
  const unexpectedReasonForeignKeys = reasonForeignKeys.filter(
    (constraint) => !canonicalForeignKeys.includes(constraint),
  );
  return Object.freeze({
    missing_revision_reasons: Object.freeze(missingReasons),
    reason_check_constraints: Object.freeze(
      reasonChecks.map((constraint) => constraint.constraint_name),
    ),
    canonical_reason_foreign_key_count: canonicalForeignKeys.length,
    unexpected_reason_foreign_keys: Object.freeze(
      unexpectedReasonForeignKeys.map((constraint) => constraint.constraint_name),
    ),
    unmigrated_active_run_save_count:
      unmigratedActiveRunSaves.version_16_count
      + unmigratedActiveRunSaves.version_17_count
      + unmigratedActiveRunSaves.version_18_count
      + unmigratedActiveRunSaves.version_19_count
      + unmigratedActiveRunSaves.version_20_count
      + unmigratedActiveRunSaves.version_21_count
      + unmigratedActiveRunSaves.version_22_count,
    unmigrated_active_run_version_16_count: unmigratedActiveRunSaves.version_16_count,
    unmigrated_active_run_version_17_count: unmigratedActiveRunSaves.version_17_count,
    unmigrated_active_run_version_18_count: unmigratedActiveRunSaves.version_18_count,
    unmigrated_active_run_version_19_count: unmigratedActiveRunSaves.version_19_count,
    unmigrated_active_run_version_20_count: unmigratedActiveRunSaves.version_20_count,
    unmigrated_active_run_version_21_count: unmigratedActiveRunSaves.version_21_count,
    unmigrated_active_run_version_22_count: unmigratedActiveRunSaves.version_22_count,
    unmigrated_level_format_1_count: unmigratedLevelDocuments,
    unrepaired_saved_editor_baseline_count: unrepairedSavedEditorBaselines,
    primogeniture_non_retired_slot_count: primogenitureRetirement.non_retired_slot_count,
    primogeniture_drawable_binding_count: primogenitureRetirement.drawable_binding_count,
    primogeniture_required_role_count: primogenitureRetirement.required_role_count,
    ...generationAttemptRetryContractIssues(
      retryContractRows.columns,
      retryContractRows.constraints,
    ),
    ...generationAttemptMoveHighlightContractIssues(
      moveHighlightContractRows.columns,
      moveHighlightContractRows.constraints,
    ),
    ...migrationIdentityIssues,
  });
}

function primogenitureRetirementContractIssuesPresent(issues) {
  return (
    issues.primogeniture_non_retired_slot_count > 0
    || issues.primogeniture_drawable_binding_count > 0
    || issues.primogeniture_required_role_count > 0
  );
}

function workingCopyReasonContractIssuesPresent(issues) {
  return (
    issues.missing_revision_reasons.length > 0
    || issues.reason_check_constraints.length > 0
    || issues.canonical_reason_foreign_key_count !== 1
    || issues.unexpected_reason_foreign_keys.length > 0
  );
}

function schemaContractIssuesPresent(issues) {
  return (
    workingCopyReasonContractIssuesPresent(issues)
    || generationAttemptRetryContractIssuesPresent(issues)
    || generationAttemptMoveHighlightContractIssuesPresent(issues)
    || schemaMigrationIdentityBoundaryIssuesPresent(issues)
    || issues.unmigrated_active_run_save_count > 0
    || issues.unmigrated_level_format_1_count > 0
    || issues.unrepaired_saved_editor_baseline_count > 0
    || primogenitureRetirementContractIssuesPresent(issues)
  );
}

async function repairRequiredSchemaContracts(
  client,
  executeMigration = (migration) => client.query(migration.sql),
  markInspection = () => {},
  completedSteps = [],
) {
  markInspection('inspect required contract repairs');
  let issues = await requiredSchemaContractIssues(client);
  if (workingCopyReasonContractIssuesPresent(issues)) {
    const occlusionDiscardReason = 'generation-attempt-occlusion-discard';
    const baseReasonContractDrift = (
      issues.reason_check_constraints.length > 0
      || issues.canonical_reason_foreign_key_count !== 1
      || issues.unexpected_reason_foreign_keys.length > 0
      || issues.missing_revision_reasons.some((reason) => reason !== occlusionDiscardReason)
    );
    if (baseReasonContractDrift) {
      const migration = MIGRATIONS.find((candidate) => candidate.version === 37);
      if (!migration) throw new Error('working-copy revision reason repair migration is unavailable');
      await executeMigration(migration, 'repair working-copy revision reason contract');
      completedSteps.push(Object.freeze({
        contract: 'working-copy revision reasons',
        migration_version: migration.version,
      }));
      // Migration 37 deliberately reopens the one-time nullable bridge. Re-read
      // the database before deciding whether migration 38 must close it again.
      markInspection(`inspect required contract repairs after migration ${migration.version}`);
      issues = await requiredSchemaContractIssues(client);
    }
    if (issues.missing_revision_reasons.includes(occlusionDiscardReason)) {
      const migration = MIGRATIONS.find((candidate) => candidate.version === 42);
      if (!migration) throw new Error('occlusion-discard revision reason repair migration is unavailable');
      await executeMigration(migration, 'repair occlusion-discard revision reason contract');
      completedSteps.push(Object.freeze({
        contract: 'occlusion-discard working-copy revision reason',
        migration_version: migration.version,
      }));
      markInspection(`inspect required contract repairs after migration ${migration.version}`);
      issues = await requiredSchemaContractIssues(client);
    }
  }
  if (issues.unmigrated_active_run_version_16_count > 0) {
    const migration = MIGRATIONS.find((candidate) => candidate.version === 54);
    if (!migration) throw new Error('active Run save repair migration is unavailable');
    await executeMigration(migration, 'repair active Run save version contract');
    completedSteps.push(Object.freeze({
      contract: 'active Run save version',
      migration_version: migration.version,
    }));
    markInspection(`inspect required contract repairs after migration ${migration.version}`);
    issues = await requiredSchemaContractIssues(client);
  }
  if (issues.unmigrated_active_run_version_17_count > 0) {
    const migration = MIGRATIONS.find((candidate) => candidate.version === 55);
    if (!migration) throw new Error('Sectio Run save repair migration is unavailable');
    await executeMigration(migration, 'repair active Run Sectio operation vocabulary contract');
    completedSteps.push(Object.freeze({
      contract: 'active Run Sectio operation vocabulary',
      migration_version: migration.version,
    }));
    markInspection(`inspect required contract repairs after migration ${migration.version}`);
    issues = await requiredSchemaContractIssues(client);
  }
  if (issues.unmigrated_active_run_version_18_count > 0) {
    const migration = MIGRATIONS.find((candidate) => candidate.version === 56);
    if (!migration) throw new Error('starter Chartulary active Run save repair migration is unavailable');
    await executeMigration(migration, 'repair active Run starter Chartulary contract');
    completedSteps.push(Object.freeze({
      contract: 'active Run starter Chartulary save version',
      migration_version: migration.version,
    }));
    markInspection(`inspect required contract repairs after migration ${migration.version}`);
    issues = await requiredSchemaContractIssues(client);
  }
  if (issues.unmigrated_active_run_version_19_count > 0) {
    const migration = MIGRATIONS.find((candidate) => candidate.version === 57);
    if (!migration) throw new Error('Expunctio active Run save repair migration is unavailable');
    await executeMigration(migration, 'repair active Run Expunctio contract');
    completedSteps.push(Object.freeze({
      contract: 'active Run Expunctio save version',
      migration_version: migration.version,
    }));
    markInspection(`inspect required contract repairs after migration ${migration.version}`);
    issues = await requiredSchemaContractIssues(client);
  }
  if (issues.unmigrated_active_run_version_20_count > 0) {
    const migration = MIGRATIONS.find((candidate) => candidate.version === 58);
    if (!migration) throw new Error('card-ordered Deployment active Run repair migration is unavailable');
    await executeMigration(migration, 'repair active Run card-ordered Deployment contract');
    completedSteps.push(Object.freeze({
      contract: 'active Run card-ordered Deployment save version',
      migration_version: migration.version,
    }));
    markInspection(`inspect required contract repairs after migration ${migration.version}`);
    issues = await requiredSchemaContractIssues(client);
  }
  if (issues.unmigrated_active_run_version_21_count > 0) {
    const migration = MIGRATIONS.find((candidate) => candidate.version === 60);
    if (!migration) throw new Error('Deployment transport active Run repair migration is unavailable');
    await executeMigration(migration, 'repair active Run Deployment transport contract');
    completedSteps.push(Object.freeze({
      contract: 'active Run Deployment transport save version',
      migration_version: migration.version,
    }));
    markInspection(`inspect required contract repairs after migration ${migration.version}`);
    issues = await requiredSchemaContractIssues(client);
  }
  if (
    issues.unmigrated_active_run_version_22_count > 0
    || issues.unmigrated_level_format_1_count > 0
    || issues.unrepaired_saved_editor_baseline_count > 0
  ) {
    const migration = MIGRATIONS.find((candidate) => candidate.version === 61);
    if (!migration) throw new Error('Level format 2 and exact saved editor baseline repair migration is unavailable');
    await executeMigration(migration, 'repair Level format 2 and exact saved editor baseline contract');
    completedSteps.push(Object.freeze({
      contract: 'Level format 2, embedded Run save version, and exact saved editor baselines',
      migration_version: migration.version,
    }));
    markInspection(`inspect required contract repairs after migration ${migration.version}`);
    issues = await requiredSchemaContractIssues(client);
  }
  if (issues.unrepaired_saved_editor_baseline_count > 0) {
    const migration = MIGRATIONS.find((candidate) => candidate.version === 62);
    if (!migration) throw new Error('retained saved editor baseline evidence repair migration is unavailable');
    await executeMigration(migration, 'repair retained saved editor baseline evidence contract');
    completedSteps.push(Object.freeze({
      contract: 'retained saved editor baseline evidence',
      migration_version: migration.version,
    }));
    markInspection(`inspect required contract repairs after migration ${migration.version}`);
    issues = await requiredSchemaContractIssues(client);
  }
  if (primogenitureRetirementContractIssuesPresent(issues)) {
    const migration = MIGRATIONS.find((candidate) => candidate.version === 59);
    if (!migration) throw new Error('Primogeniture retirement repair migration is unavailable');
    await executeMigration(migration, 'repair complete Primogeniture retirement contract');
    completedSteps.push(Object.freeze({
      contract: 'complete Primogeniture installed-content retirement',
      migration_version: migration.version,
    }));
    markInspection(`inspect required contract repairs after migration ${migration.version}`);
    issues = await requiredSchemaContractIssues(client);
  }
  const identityRepair = schemaMigrationIdentityRepair(issues);
  if (identityRepair) {
    const migration = MIGRATIONS.find(
      (candidate) => candidate.version === identityRepair.migration_version,
    );
    if (!migration) throw new Error('schema migration identity repair migration is unavailable');
    await executeMigration(migration, 'repair schema migration identity contract');
    completedSteps.push(identityRepair);
    markInspection(`inspect remaining required contract repairs after migration ${migration.version}`);
    issues = await requiredSchemaContractIssues(client);
  }
  if (generationAttemptRetryContractIssuesPresent(issues)) {
    const migration = MIGRATIONS.find((candidate) => candidate.version === 43);
    if (!migration) throw new Error('generation-attempt retry repair migration is unavailable');
    await executeMigration(migration, 'repair generation-attempt retry contract');
    completedSteps.push(Object.freeze({
      contract: 'generation-attempt same-slot retry',
      migration_version: migration.version,
    }));
    markInspection(`inspect remaining required contract repairs after migration ${migration.version}`);
    issues = await requiredSchemaContractIssues(client);
  }
  if (generationAttemptMoveHighlightContractIssuesPresent(issues)) {
    const migration = MIGRATIONS.find((candidate) => candidate.version === 43);
    if (!migration) {
      throw new Error('generation-attempt move-highlight repair migrations are unavailable');
    }
    await executeMigration(migration, 'repair generation-attempt move-highlight contract');
    completedSteps.push(Object.freeze({
      contract: 'generation-attempt cyan move-highlight contract',
      migration_version: migration.version,
    }));
    markInspection(`inspect remaining required contract repairs after migration ${migration.version}`);
  }
  return Object.freeze(completedSteps);
}

async function checkRequiredSchemaContracts(client) {
  const issues = await requiredSchemaContractIssues(client);
  if (schemaContractIssuesPresent(issues)) {
    throw new SchemaMigrationRequiredError(
      'required database schema contract is incomplete',
      issues,
    );
  }
}

async function checkMigrations() {
  const client = await pool.connect();
  try {
    const registry = await client.query("SELECT to_regclass('public.schema_migrations') AS table_name");
    if (!registry.rows[0] || !registry.rows[0].table_name) {
      throw new SchemaMigrationRequiredError('schema_migrations table is missing', {
        missing_versions: REQUIRED_SCHEMA_MIGRATION_VERSIONS,
      });
    }
    const history = await schemaMigrationHistoryRows(client);
    const plan = planMigrationExecution(MIGRATIONS, history.rows, {
      allowUnsealed: !history.hasIdentity,
      allowLegacySparseVersions: !history.hasIdentity
        ? LEGACY_SPARSE_SCHEMA_HISTORY_VERSIONS
        : [],
    });
    if (plan.pending.length) {
      const missing = plan.pending.map((entry) => entry.version);
      throw new SchemaMigrationRequiredError(`schema migrations missing versions: ${missing.join(', ')}`, {
        missing_versions: missing,
      });
    }
    await checkRequiredSchemaRelations(client);
    await checkRequiredSchemaContracts(client);
    return migrationRunResult(plan, []);
  } finally {
    client.release();
  }
}

let schemaMigrationRunReport = null;

async function prepareDbSchema() {
  if (schemaMigrationMode === 'off') {
    // The caller explicitly owns schema readiness.
    schemaMigrationRunReport = null;
  } else if (schemaMigrationMode === 'auto') {
    schemaMigrationRunReport = await runMigrations();
  } else {
    schemaMigrationRunReport = await checkMigrations();
  }
  if (unitAssetSeedCatalogUrl) await seedUnitCatalogFromLiveSource();
  if (liveMediaSeedCatalogUrl) await seedLiveMediaCatalogFromLiveSource();
  if (propSeatsSeedUrl) await seedPropSeatsFromLiveSource();
  if (schemaMigrationMode !== 'off') {
    const activeMedia = await pool.query("SELECT count(*) AS count FROM media_slots WHERE lifecycle_state = 'active'");
    if (Number(activeMedia.rows[0]?.count) > 0 && !liveMediaStorageConfigured()) {
      throw new Error('live media catalog has active slots but no live media object store is configured');
    }
  }
  dbReady = true;
}

function schemaReadyMessage() {
  if (schemaMigrationMode === 'off') return 'schema migrations skipped';
  return formatMigrationRunResult(schemaMigrationRunReport);
}

// Idempotent, self-healing readiness: schema readiness runs once; a failed
// attempt is retried on the next request rather than wedging persistence until a
// redeploy. In local-default check mode this is read-only and never applies DDL.
async function ensureDbReady() {
  if (!pool) throw new Error('database_not_configured');
  if (dbReady) return;
  if (!schemaReadinessPromise) {
    schemaReadinessPromise = prepareDbSchema()
      .catch((error) => { schemaReadinessPromise = null; throw error; });
  }
  await schemaReadinessPromise;
}

function dbUnavailable(res, message, error, code) {
  console.error(`${message}:`, error);
  const schemaError = error && (
    error.code === 'schema_migration_required'
    || error.code === 'schema_migration_history_invalid'
    || error.code === 'schema_migration_execution_failed'
  );
  const responseCode = schemaError ? error.code : code;
  const details = schemaError && error.details ? { details: error.details } : {};
  res.status(503).json({ error: responseCode, ...details });
}

const LEVEL_ROLES = new Set(['player', 'enemy', 'terrain']);
const LEVEL_PIECES = new Set(['pawn', 'knight', 'bishop', 'rook', 'queen']);
const LEVEL_TERRAIN = new Set(['rock', 'random-rock']);
const MISC_ZONE_TYPES = new Set(['falling-rock']);
const PLAYER_SPAWN_MIN_CELLS = 3;
const PLAYER_1_SPAWN_ZONE_ID = 'player-1-spawn';
const PLAYER_2_SPAWN_ZONE_ID = 'player-2-spawn';
const DESIGN_PORTFOLIO_STORE_SCHEMA_VERSION = 1;
const DESIGN_PORTFOLIO_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const MIGRATED_RAW_ASSET_PATHS = new Set(['/app.js', '/style.css']);

function safeReturnPath(raw) {
  if (!raw || typeof raw !== 'string') return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

function gravatarUrl(email, size = 96) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const hash = crypto.createHash('md5').update(normalized).digest('hex');
  // d=retro — the 8-bit pixel-art fallback for users with no Gravatar set, which
  // matches the game's pixel aesthetic (was d=identicon, smooth geometric tiles).
  return `https://www.gravatar.com/avatar/${hash}?d=retro&s=${size}`;
}

// Admins who may author the global OFFICIAL campaign tier (ADR-0038). Comma-separated
// allowlist, parsed once into a lowercased Set. FAIL-CLOSED: unset/empty ⇒ nobody can
// publish officials and no official campaigns are shown (the DB row is the sole source).
// There is no admin role upstream; this is the honest gate, swappable to a role check later.
const adminEmails = new Set(
  String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),
);
function isAdminEmail(email) {
  return Boolean(email) && adminEmails.has(String(email).toLowerCase());
}

function publicUser(session) {
  const user = session && session.user;
  if (!user || !user.email) return { signed_in: false };
  const gravatar = gravatarUrl(user.email);
  return {
    signed_in: true,
    email: user.email,
    name: user.name || user.email,
    image: user.image || null,
    gravatar_url: gravatar,
    avatar_url: user.image || gravatar,
    role: user.role || 'pending',
    // UI affordance only (gates inline editing + "Publish to all players" for official
    // campaigns); the real gate is server-side requireAdmin. The allowlist itself is
    // never sent to the client.
    is_admin: isAdminEmail(user.email),
  };
}

function publicLobbyUser(user) {
  if (!user || !user.email) return null;
  return {
    email: user.email,
    name: user.name || user.email,
    avatar_url: user.avatar_url || gravatarUrl(user.email),
  };
}

function publicLobby(lobby, viewerEmail, { includeLevelSnapshot = false } = {}) {
  const reports = lobby.resultReports || {};
  const viewerSide = lobbySideForEmail(lobby, viewerEmail);
  const projected = {
    id: lobby.id,
    name: lobby.name,
    phase: lobby.phase,
    created_at: lobby.createdAt,
    updated_at: lobby.updatedAt,
    host: publicLobbyUser(lobby.host),
    guest: publicLobbyUser(lobby.guest),
    seats: {
      filled: lobby.guest ? 2 : 1,
      total: 2,
    },
    viewer_role: viewerEmail === lobby.host.email ? 'host' : (lobby.guest && viewerEmail === lobby.guest.email ? 'guest' : 'observer'),
    level_id: lobby.levelId ?? null,
    level_timed: typeof lobby.levelTimed === 'boolean' ? lobby.levelTimed : null,
    level_name: lobby.levelName ?? null,
    level_objective: lobby.levelObjective ?? null,
    seed: lobby.seed ?? null,
    move_count: lobby.moves ? lobby.moves.length : 0,
    // Terminal outcome in canonical board terms, or null while the match is live.
    result: lobby.result ?? null,
    // A deterministic result is authoritative only after both occupied seats report the
    // exact same outcome. Expose the pending state without leaking either private report.
    result_pending: !lobby.result && !lobby.resultDisputed && Boolean(reports.player || reports.enemy),
    result_disputed: !lobby.result && Boolean(lobby.resultDisputed),
    your_side: viewerSide,
  };
  if (includeLevelSnapshot && viewerSide) {
    projected.level_snapshot = lobby.levelSnapshot ?? null;
    projected.level_fingerprint = lobby.levelFingerprint ?? null;
  }
  return projected;
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function designPortfolioId(raw) {
  const id = String(raw || '').trim();
  return DESIGN_PORTFOLIO_ID_PATTERN.test(id) ? id : null;
}

async function dbGetDesignPortfolio(id) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT data, client_schema_version, metadata, revision, created_at, updated_at, updated_by FROM design_portfolios WHERE id = $1',
    [id],
  );
  return rows[0] || null;
}

async function dbUpsertDesignPortfolio(id, input) {
  await ensureDbReady();
  const { rows } = await pool.query(
    `INSERT INTO design_portfolios (id, data, client_schema_version, metadata, revision, updated_by)
       VALUES ($1, $2::jsonb, $3, $4::jsonb, 1, $5)
     ON CONFLICT (id) DO UPDATE SET
       data = EXCLUDED.data,
       client_schema_version = EXCLUDED.client_schema_version,
       metadata = EXCLUDED.metadata,
       revision = design_portfolios.revision + 1,
       updated_at = now(),
       updated_by = EXCLUDED.updated_by
     RETURNING data, client_schema_version, metadata, revision, created_at, updated_at, updated_by`,
    [id, JSON.stringify(input.data), input.client_schema_version, JSON.stringify(input.metadata || {}), input.updated_by],
  );
  return rows[0];
}

function publicDesignPortfolioDocument(id, document) {
  return {
    id,
    data: isObjectRecord(document && document.data) ? document.data : {},
    client_schema_version: document && Object.hasOwn(document, 'client_schema_version') ? document.client_schema_version : null,
    metadata: isObjectRecord(document && document.metadata) ? document.metadata : {},
    revision: Number.isInteger(document && document.revision) ? document.revision : 0,
    created_at: document && document.created_at ? document.created_at : null,
    updated_at: document && document.updated_at ? document.updated_at : null,
    updated_by: document && document.updated_by ? document.updated_by : null,
  };
}

function clampText(value, fallback, maxLength) {
  const text = String(value || '').trim();
  return (text || fallback).slice(0, maxLength);
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function campaignSummary(campaign) {
  return {
    id: campaign.id,
    title: campaign.title,
    description: campaign.description,
    created_at: campaign.createdAt,
    updated_at: campaign.updatedAt,
    owner_email: campaign.owner.email,
    level_count: campaign.levels.length,
    levels: campaign.levels.map(publicLevel),
  };
}

function publicLevel(level) {
  const zones = ensureRequiredSpawnZones(Array.isArray(level.zones) ? level.zones : normalizeLevelZones(null, level.width, level.height, level.layout), level.width, level.height);
  const zoneAssignments = normalizeZoneAssignments(level.zoneAssignments, zones, level.layout);
  return {
    id: level.id,
    name: level.name,
    objective: level.objective,
    difficulty: level.difficulty,
    width: level.width,
    height: level.height,
    enemy_budget: level.enemyBudget,
    notes: level.notes,
    layout: level.layout.map(publicLevelCell),
    random_rocks_count: level.randomRocksCount ?? 0,
    zones: zones.map(publicZone),
    zone_assignments: publicZoneAssignments(zoneAssignments),
  };
}

function publicLevelCell(cell) {
  return {
    x: cell.x,
    y: cell.y,
    role: cell.role,
    type: cell.type,
  };
}

function publicZone(zone) {
  return {
    id: zone.id,
    name: zone.name,
    selections: zone.selections.map((selection) => ({ ...selection })),
  };
}

function publicZoneAssignments(assignments) {
  return {
    player_1_spawn_zone_id: assignments.player1SpawnZoneId,
    player_2_spawn_zone_id: assignments.player2SpawnZoneId,
    misc_zones: assignments.miscZones.map((zone) => ({ ...zone })),
  };
}

function timestampString(value, fallback = new Date().toISOString()) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) return value;
  return fallback;
}

function nullableTimestampString(value) {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('invalid database timestamp');
  return parsed.toISOString();
}

function campaignFromRow(row) {
  if (!row || !isObjectRecord(row.body)) return null;
  const fallbackUpdatedAt = timestampString(row.updated_at);
  const campaign = row.body;
  return {
    ...campaign,
    id: typeof campaign.id === 'string' ? campaign.id : row.id,
    title: typeof campaign.title === 'string' ? campaign.title : 'Untitled Campaign',
    description: typeof campaign.description === 'string' ? campaign.description : '',
    createdAt: timestampString(campaign.createdAt, timestampString(row.created_at, fallbackUpdatedAt)),
    updatedAt: timestampString(campaign.updatedAt, fallbackUpdatedAt),
    owner: {
      ...(isObjectRecord(campaign.owner) ? campaign.owner : {}),
      email: row.owner_email,
    },
    levels: Array.isArray(campaign.levels) ? campaign.levels : [],
  };
}

async function dbListCampaigns(ownerEmail) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT owner_email, id, body, created_at, updated_at FROM campaigns WHERE owner_email = $1 ORDER BY updated_at DESC',
    [ownerEmail],
  );
  return rows.map(campaignFromRow).filter(Boolean);
}

async function dbGetCampaign(ownerEmail, id) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT owner_email, id, body, created_at, updated_at FROM campaigns WHERE owner_email = $1 AND id = $2',
    [ownerEmail, id],
  );
  return campaignFromRow(rows[0]);
}

async function dbPutCampaign(ownerEmail, campaign) {
  await ensureDbReady();
  const { rows } = await pool.query(
    `INSERT INTO campaigns (owner_email, id, body, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (owner_email, id) DO UPDATE SET
       body = EXCLUDED.body,
       updated_at = EXCLUDED.updated_at
     RETURNING owner_email, id, body, created_at, updated_at`,
    [ownerEmail, campaign.id, JSON.stringify(campaign), campaign.createdAt, campaign.updatedAt],
  );
  return campaignFromRow(rows[0]);
}

async function dbDeleteCampaign(ownerEmail, id) {
  await ensureDbReady();
  const result = await pool.query(
    'DELETE FROM campaigns WHERE owner_email = $1 AND id = $2',
    [ownerEmail, id],
  );
  return result.rowCount > 0;
}

function defaultLevelLayout(width, height) {
  return [
    { x: Math.floor(width / 2), y: height - 1, role: 'player', type: 'pawn' },
    { x: Math.floor(width / 2), y: 0, role: 'enemy', type: 'pawn' },
    { x: Math.max(0, Math.floor(width / 2) - 1), y: Math.max(0, Math.floor(height / 2) - 1), role: 'terrain', type: 'rock' },
  ];
}

function normalizeCoordinate(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const rounded = Math.round(number);
  if (rounded < 0 || rounded >= max) return null;
  return rounded;
}

function normalizeLevelCell(raw, width, height) {
  if (!raw || typeof raw !== 'object') return null;
  const role = String(raw.role || '').trim().toLowerCase();
  const type = String(raw.type || '').trim().toLowerCase();
  const x = normalizeCoordinate(raw.x, width);
  const y = normalizeCoordinate(raw.y, height);
  if (x === null || y === null || !LEVEL_ROLES.has(role)) return null;
  if (role === 'terrain') {
    if (!LEVEL_TERRAIN.has(type)) return null;
  } else if (!LEVEL_PIECES.has(type)) {
    return null;
  }
  return { x, y, role, type };
}

function normalizeLevelLayout(rawLayout, width, height) {
  const cells = Array.isArray(rawLayout) ? rawLayout : defaultLevelLayout(width, height);
  const byCoord = new Map();
  cells.forEach((raw) => {
    const cell = normalizeLevelCell(raw, width, height);
    if (cell) byCoord.set(`${cell.x},${cell.y}`, cell);
  });
  return Array.from(byCoord.values()).sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

function normalizeZoneSelection(raw, width, height, index) {
  if (!raw || typeof raw !== 'object') return null;
  const type = String(raw.type || '').trim().toLowerCase();
  const id = clampText(raw.id, `selection-${index + 1}`, 64);
  if (type === 'cell') {
    const x = normalizeCoordinate(raw.x, width);
    const y = normalizeCoordinate(raw.y, height);
    if (x === null || y === null) return null;
    return { id, type, x, y };
  }
  if (type === 'rect') {
    const x1 = normalizeCoordinate(raw.x1, width);
    const y1 = normalizeCoordinate(raw.y1, height);
    const x2 = normalizeCoordinate(raw.x2, width);
    const y2 = normalizeCoordinate(raw.y2, height);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
    return { id, type, x1, y1, x2, y2 };
  }
  return null;
}

function defaultSpawnZones(width, height) {
  return [
    {
      id: PLAYER_1_SPAWN_ZONE_ID,
      name: 'Player 1 Spawn',
      selections: [{ id: 'selection-1', type: 'rect', x1: 0, y1: height - 1, x2: width - 1, y2: height - 1 }],
    },
    {
      id: PLAYER_2_SPAWN_ZONE_ID,
      name: 'Player 2 Spawn',
      selections: [{ id: 'selection-1', type: 'rect', x1: 0, y1: 0, x2: width - 1, y2: 0 }],
    },
  ];
}

function ensureRequiredSpawnZones(zones, width, height) {
  const next = Array.isArray(zones) ? zones.map((zone) => ({ ...zone, selections: [...zone.selections] })) : [];
  const ids = new Set(next.map((zone) => zone.id));
  defaultSpawnZones(width, height).forEach((zone) => {
    if (!ids.has(zone.id)) next.unshift(zone);
  });
  return next;
}

function randomRockZoneFromLayout(layout, id = 'falling-rock-zone') {
  const randomRocks = layout.filter((cell) => cell.role === 'terrain' && cell.type === 'random-rock');
  if (!randomRocks.length) return null;
  return {
    id,
    name: 'Falling Rock Zone',
    selections: randomRocks.map((cell, index) => ({
      id: `selection-${index + 1}`,
      type: 'cell',
      x: cell.x,
      y: cell.y,
    })),
  };
}

function normalizeLevelZones(rawZones, width, height, layout) {
  const zones = Array.isArray(rawZones) ? rawZones : [];
  const normalized = zones.map((raw, index) => {
    if (!raw || typeof raw !== 'object') return null;
    const id = clampText(raw.id, `zone-${index + 1}`, 64);
    const selections = Array.isArray(raw.selections) ? raw.selections : [];
    return {
      id,
      name: clampText(raw.name, `Zone ${index + 1}`, 40),
      selections: selections
        .map((selection, selectionIndex) => normalizeZoneSelection(selection, width, height, selectionIndex))
        .filter(Boolean)
        .slice(0, 500),
    };
  }).filter(Boolean).slice(0, 50);

  if (!Array.isArray(rawZones)) {
    const defaultZones = defaultSpawnZones(width, height);
    normalized.unshift(...defaultZones);
    const migrated = randomRockZoneFromLayout(layout);
    if (migrated) normalized.push(migrated);
  }

  return normalized;
}

function normalizeZoneId(value, zoneIds) {
  const id = String(value || '').trim();
  return id && zoneIds.has(id) ? id : null;
}

function normalizeZoneAssignments(raw, zones, layout) {
  const zoneIds = new Set(zones.map((zone) => zone.id));
  const source = raw && typeof raw === 'object' ? raw : {};
  const player1SpawnZoneId = zoneIds.has(PLAYER_1_SPAWN_ZONE_ID) ? PLAYER_1_SPAWN_ZONE_ID : null;
  const player2SpawnZoneId = zoneIds.has(PLAYER_2_SPAWN_ZONE_ID) ? PLAYER_2_SPAWN_ZONE_ID : null;
  const rawMisc = Array.isArray(source.misc_zones) ? source.misc_zones : (Array.isArray(source.miscZones) ? source.miscZones : []);
  const miscZones = rawMisc.map((rawZone, index) => {
    if (!rawZone || typeof rawZone !== 'object') return null;
    const type = String(rawZone.type || '').trim().toLowerCase();
    const zoneId = normalizeZoneId(rawZone.zone_id ?? rawZone.zoneId, zoneIds);
    if (!MISC_ZONE_TYPES.has(type) || !zoneId) return null;
    return {
      id: clampText(rawZone.id, `misc-zone-${index + 1}`, 64),
      type,
      zone_id: zoneId,
    };
  }).filter(Boolean).slice(0, 50);

  const migrated = randomRockZoneFromLayout(layout);
  if (!raw && migrated && zoneIds.has(migrated.id)) {
    miscZones.push({ id: 'misc-zone-1', type: 'falling-rock', zone_id: migrated.id });
  }

  return { player1SpawnZoneId, player2SpawnZoneId, miscZones };
}

function zoneCells(zone, width, height) {
  const cells = new Set();
  (zone && Array.isArray(zone.selections) ? zone.selections : []).forEach((selection) => {
    if (selection.type === 'cell') {
      if (normalizeCoordinate(selection.x, width) !== null && normalizeCoordinate(selection.y, height) !== null) {
        cells.add(`${selection.x},${selection.y}`);
      }
    } else if (selection.type === 'rect') {
      const x1 = normalizeCoordinate(selection.x1, width);
      const y1 = normalizeCoordinate(selection.y1, height);
      const x2 = normalizeCoordinate(selection.x2, width);
      const y2 = normalizeCoordinate(selection.y2, height);
      if (x1 === null || y1 === null || x2 === null || y2 === null) return;
      const startX = Math.min(x1, x2);
      const endX = Math.max(x1, x2);
      const startY = Math.min(y1, y2);
      const endY = Math.max(y1, y2);
      for (let y = startY; y <= endY; y += 1) {
        for (let x = startX; x <= endX; x += 1) {
          cells.add(`${x},${y}`);
        }
      }
    }
  });
  return cells;
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validateLevelZones(level) {
  const zoneById = new Map(level.zones.map((zone) => [zone.id, zone]));
  [
    ['player_1_spawn_zone_id', PLAYER_1_SPAWN_ZONE_ID],
    ['player_2_spawn_zone_id', PLAYER_2_SPAWN_ZONE_ID],
  ].forEach(([field, zoneId]) => {
    if (!zoneById.has(zoneId)) {
      throw validationError(`${field}_required`);
    }
    const count = zoneCells(zoneById.get(zoneId), level.width, level.height).size;
    if (count < PLAYER_SPAWN_MIN_CELLS) {
      throw validationError(`${field}_needs_${PLAYER_SPAWN_MIN_CELLS}_cells`);
    }
  });
}

function buildLevel(raw, index) {
  const width = clampNumber(raw && raw.width, 8, 4, 16);
  const height = clampNumber(raw && raw.height, 12, 4, 20);
  const layout = normalizeLevelLayout(raw && raw.layout, width, height);
  const zones = normalizeLevelZones(raw && raw.zones, width, height, layout);
  const level = {
    id: crypto.randomUUID(),
    name: clampText(raw && raw.name, `Level ${index + 1}`, 48),
    objective: clampText(raw && raw.objective, 'Defeat all enemies', 96),
    difficulty: clampText(raw && raw.difficulty, 'normal', 20),
    width,
    height,
    enemyBudget: clampNumber(raw && (raw.enemy_budget ?? raw.enemyBudget), 3, 1, 24),
    notes: clampText(raw && raw.notes, '', 400),
    layout,
    randomRocksCount: clampNumber(raw && (raw.random_rocks_count ?? raw.randomRocksCount), 0, 0, 100),
    zones,
    zoneAssignments: normalizeZoneAssignments(raw && (raw.zone_assignments ?? raw.zoneAssignments), zones, layout),
  };
  validateLevelZones(level);
  return level;
}

function applyLevelPatch(level, raw) {
  if (!raw || typeof raw !== 'object') return;
  const next = {
    ...level,
    layout: [...level.layout],
    zones: Array.isArray(level.zones) ? level.zones.map((zone) => ({ ...zone, selections: [...zone.selections] })) : normalizeLevelZones(null, level.width, level.height, level.layout),
    zoneAssignments: null,
  };
  next.zoneAssignments = normalizeZoneAssignments(level.zoneAssignments, next.zones, next.layout);
  if (Object.hasOwn(raw, 'name')) next.name = clampText(raw.name, next.name, 48);
  if (Object.hasOwn(raw, 'objective')) next.objective = clampText(raw.objective, next.objective, 96);
  if (Object.hasOwn(raw, 'difficulty')) next.difficulty = clampText(raw.difficulty, next.difficulty, 20);
  if (Object.hasOwn(raw, 'width')) next.width = clampNumber(raw.width, next.width, 4, 16);
  if (Object.hasOwn(raw, 'height')) next.height = clampNumber(raw.height, next.height, 4, 20);
  if (Object.hasOwn(raw, 'enemy_budget') || Object.hasOwn(raw, 'enemyBudget')) {
    next.enemyBudget = clampNumber(raw.enemy_budget ?? raw.enemyBudget, next.enemyBudget, 1, 24);
  }
  if (Object.hasOwn(raw, 'notes')) next.notes = clampText(raw.notes, next.notes, 400);
  if (Object.hasOwn(raw, 'width') || Object.hasOwn(raw, 'height')) {
    next.layout = normalizeLevelLayout(next.layout, next.width, next.height);
    next.zones = normalizeLevelZones(next.zones, next.width, next.height, next.layout);
    next.zoneAssignments = normalizeZoneAssignments(next.zoneAssignments, next.zones, next.layout);
  }
  if (Object.hasOwn(raw, 'layout')) {
    next.layout = normalizeLevelLayout(raw.layout, next.width, next.height);
  }
  if (Object.hasOwn(raw, 'random_rocks_count') || Object.hasOwn(raw, 'randomRocksCount')) {
    next.randomRocksCount = clampNumber(raw.random_rocks_count ?? raw.randomRocksCount, next.randomRocksCount, 0, 100);
  }
  if (Object.hasOwn(raw, 'zones')) {
    next.zones = normalizeLevelZones(raw.zones, next.width, next.height, next.layout);
    next.zoneAssignments = normalizeZoneAssignments(next.zoneAssignments, next.zones, next.layout);
  }
  if (Object.hasOwn(raw, 'zone_assignments') || Object.hasOwn(raw, 'zoneAssignments')) {
    next.zoneAssignments = normalizeZoneAssignments(raw.zone_assignments ?? raw.zoneAssignments, next.zones, next.layout);
  }
  validateLevelZones(next);
  Object.assign(level, next);
}

// Dev sign-in bypass — skips the Microsoft round-trip so sign-in is testable
// off-network. Two triggers, BOTH dev-only:
//   - a *.tank.dev.romaine.life host — the deployed dev-slot domain (unchanged), and
//   - a loopback host when DEV_AUTH=1 — a local `node server.js` for exercising the
//     real sign-in flow / lobbies without Postgres or Microsoft (see CLAUDE.md).
// Prod pods never set DEV_AUTH and their ingress Host is chess-tactics.com, so a
// spoofed `Host: localhost` header cannot switch this on in production.
function isDevAuthHost(req) {
  const host = (req.get('host') || '').toLowerCase();
  if (host.includes('.tank.dev.romaine.life')) return true;
  if (process.env.DEV_AUTH === '1') {
    const bare = host.replace(/:\d+$/, ''); // strip :port (IPv6 stays bracketed)
    if (bare === 'localhost' || bare === '127.0.0.1' || bare === '[::1]') return true;
  }
  return false;
}

function isLoopbackRequest(req) {
  const forwarded = (req.get('x-forwarded-for') || '').split(',')[0].trim();
  const address = forwarded || req.socket.remoteAddress || '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

const verifiedDevGrantSession = createDevGrantSessionReader({
  authBaseUrl,
  credentialPath: process.env.DEV_AUTH_TOKEN_FILE,
  enabled: process.env.DEV_AUTH === '1',
});

async function readSession(req, res) {
  if (isDevAuthHost(req)) {
    const cookie = req.get('cookie') || '';
    if (cookie.includes('better-auth.session=mock-dev-session')) {
      // Who the dev session signs in as. Defaults to a throwaway player; set
      // DEV_AUTH_EMAIL (+ DEV_AUTH_NAME) to sign in as a real account so its
      // owner-scoped data shows. Admin affordances still come from ADMIN_EMAILS.
      return {
        user: {
          email: process.env.DEV_AUTH_EMAIL || 'player@example.com',
          name: process.env.DEV_AUTH_NAME || 'Tactics Player',
          role: 'pending',
        }
      };
    }
    const granted = isLoopbackRequest(req) ? await verifiedDevGrantSession() : null;
    if (granted) return granted;
  }
  return oidcSessions.readSession(req.get('cookie') || '', res);
}

async function requireUser(req, res) {
  let session;
  try {
    session = await readSession(req, res);
  } catch (error) {
    console.error('auth session check failed:', error);
    res.status(error.statusCode || 502).json({ error: 'auth_unavailable' });
    return null;
  }
  const user = publicUser(session);
  if (!user.signed_in) {
    res.status(401).json({ error: 'sign_in_required' });
    return null;
  }
  return user;
}

// Gate for authoring the global OFFICIAL campaign tier (ADR-0038). requireUser first
// (reusing its 401/502 behavior), then allowlist membership. Fail-closed when
// ADMIN_EMAILS is unset. Deliberately NOT requireDesignPortfolioWriter, which falls
// through to any-signed-in-user in prod.
async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!isAdminEmail(user.email)) {
    res.status(403).json({ error: 'admin_required' });
    return null;
  }
  return user;
}

async function requireDesignPortfolioWriter(req, res) {
  if (isDevAuthHost(req)) {
    return {
      email: 'test-slot@chess-tactics.local',
      name: 'Test Slot',
      role: 'designer',
    };
  }
  return requireUser(req, res);
}

function activeLobbies() {
  purgeExpiredLobbyTombstones();
  return Array.from(lobbies.values())
    .filter((lobby) => lobby.phase !== 'closed')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function userActiveLobby(email) {
  return activeLobbies().find((lobby) => lobby.host.email === email || (lobby.guest && lobby.guest.email === email)) || null;
}

function userRecoverableLobbies(email) {
  purgeExpiredLobbyTombstones();
  return Array.from(lobbies.values())
    .filter((lobby) => {
      if (lobby.phase !== 'closed') return false;
      const side = lobbySideForEmail(lobby, email);
      return Boolean(side && !(lobby.departed && lobby.departed[side]));
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function lobbySideForEmail(lobby, email) {
  if (lobby.host && lobby.host.email === email) return 'player';
  if (lobby.guest && lobby.guest.email === email) return 'enemy';
  return null;
}

function touchLobby(lobby) {
  lobby.stateRevision = Number.isInteger(lobby.stateRevision) ? lobby.stateRevision + 1 : 1;
  lobby.updatedAt = new Date().toISOString();
}

function lobbyStateMatches(lobby, expected) {
  const current = lobbies.get(expected.id);
  if (current !== lobby) return false;
  if (lobby.stateRevision !== expected.revision) return false;
  if (lobby.phase !== expected.phase) return false;
  if ((lobby.host && lobby.host.email) !== expected.hostEmail) return false;
  if ((lobby.guest && lobby.guest.email) !== expected.guestEmail) return false;
  if (Object.hasOwn(expected, 'levelId') && lobby.levelId !== expected.levelId) return false;
  return true;
}

function endLobbyStreams(lobbyId) {
  const subs = lobbyChannelSubscribers.get(lobbyId);
  if (!subs) return;
  for (const sub of subs) {
    try { sub.res.end(); } catch { /* already closed */ }
  }
  lobbyChannelSubscribers.delete(lobbyId);
}

// Closing a lobby turns its retained snapshot, moves, and result reports into
// seat-private recovery data. Observers admitted while the lobby was public must
// be disconnected before the first closed frame is broadcast.
function restrictClosedLobbyStreams(lobby) {
  if (lobby.phase !== 'closed') return;
  const subs = lobbyChannelSubscribers.get(lobby.id);
  if (!subs) return;
  for (const sub of [...subs]) {
    if (lobbySideForEmail(lobby, sub.email)) continue;
    subs.delete(sub);
    try { sub.res.end(); } catch { /* already closed */ }
  }
  if (subs.size === 0) lobbyChannelSubscribers.delete(lobby.id);
}

function deleteLobbyRecord(lobby, notify = true) {
  endLobbyStreams(lobby.id);
  lobbies.delete(lobby.id);
  if (notify) broadcastLobbies();
}

function purgeExpiredLobbyTombstones() {
  const now = Date.now();
  let changed = false;
  for (const lobby of lobbies.values()) {
    if (lobby.phase !== 'closed' || !lobby.closedAt) continue;
    const closedAt = Date.parse(lobby.closedAt);
    if (Number.isFinite(closedAt) && now - closedAt >= LOBBY_TOMBSTONE_TTL_MS) {
      endLobbyStreams(lobby.id);
      lobbies.delete(lobby.id);
      changed = true;
    }
  }
  if (changed) broadcastLobbies();
}

function lobbyRecord(id) {
  purgeExpiredLobbyTombstones();
  return lobbies.get(id) || null;
}

function bothLobbySeatsDeparted(lobby) {
  // A two-seat tombstone can be collected immediately once both original participants
  // acknowledge it. A host-only tombstone remains until TTL because no enemy identity
  // ever existed to acknowledge the second canonical seat.
  return Boolean(
    lobby.guest
    && lobby.departed
    && lobby.departed.player
    && lobby.departed.enemy,
  );
}

function isStartedLobbyLifecycle(lobby) {
  return lobby.phase === 'started'
    || (lobby.phase === 'closed' && lobby.closedFromPhase === 'started');
}

// ---------------------------------------------------------------------------
// SSE relay for lobbies + netplay. Two channels:
//   - the global lobby-list channel (lobbyListSubscribers): a viewer-neutral
//     `{type:'lobbies-changed'}` ping; clients refetch GET /api/lobbies.
//   - per-lobby game channels (lobbyChannelSubscribers): move relay + lobby
//     state, projected per-subscriber (your_side/viewer_role need the viewer).
// Every write is guarded — a dead socket throws — and the subscriber is dropped
// on failure so the sets never leak. Single-replica invariant (see the lobbies
// Map above) is what makes an in-process relay correct.
// ---------------------------------------------------------------------------
function sseWrite(res, payload) {
  try {
    res.write(payload);
    return true;
  } catch (_error) {
    return false;
  }
}

// Ping every global subscriber so clients refetch the lobby list. Called after
// EVERY lobby mutation (create/join/leave/start/level/move).
function broadcastLobbies() {
  const payload = 'data: {"type":"lobbies-changed"}\n\n';
  for (const res of lobbyListSubscribers) {
    if (!sseWrite(res, payload)) {
      lobbyListSubscribers.delete(res);
    }
  }
}

// Send a frame to every subscriber of one lobby's game channel. `frame` may be a
// static object, or a function (sub) => frame to project per-subscriber (used for
// lobby frames whose your_side/viewer_role depend on the viewer's email).
function broadcastToLobby(lobbyId, frame) {
  const subs = lobbyChannelSubscribers.get(lobbyId);
  if (!subs) return;
  for (const sub of subs) {
    const value = typeof frame === 'function' ? frame(sub) : frame;
    if (!sseWrite(sub.res, `data: ${JSON.stringify(value)}\n\n`)) {
      subs.delete(sub);
    }
  }
  if (subs.size === 0) lobbyChannelSubscribers.delete(lobbyId);
}

// Push the current lobby state to every game-channel subscriber, each correctly
// projected for its own viewer. Use after any lobby-state change (start/leave/etc).
function broadcastLobbyState(lobby) {
  broadcastToLobby(lobby.id, (sub) => ({
    type: 'lobby',
    lobby: publicLobby(lobby, sub.email, { includeLevelSnapshot: true }),
  }));
}

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
};
// Kept comfortably under any proxy/gateway timeout. The lobby SSE routes disable
// Envoy Gateway's default 15s HTTPRoute request timeout (k8s/templates/httproute.yaml);
// this heartbeat is the belt-and-suspenders for any other idle timer in the path.
const SSE_KEEPALIVE_MS = 10000;

// Start an SSE response: write headers, kick off a heartbeat, and wire cleanup on
// close. Returns the interval so the route can clear it in its own close handler.
function startSse(res) {
  res.writeHead(200, SSE_HEADERS);
  res.flushHeaders?.();
  const heartbeat = setInterval(() => {
    if (!sseWrite(res, ':keepalive\n\n')) clearInterval(heartbeat);
  }, SSE_KEEPALIVE_MS);
  return heartbeat;
}

function lobbyNameFor(user) {
  const base = (user.name || user.email || 'Player').split('@')[0].trim();
  return `${base}'s lobby`;
}

function frontendIndexFile() {
  if (staticFrontendDir) {
    const overrideIndex = path.join(staticFrontendDir, 'index.html');
    if (fs.existsSync(overrideIndex)) return overrideIndex;
  }
  return path.join(frontendDir, 'index.html');
}

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

// Exact local-process identity for the named development supervisor. The route
// is absent outside a supervised dev environment and carries no credentials.
app.get('/api/__devctl/health', (_req, res, next) => {
  if (process.env.DEVCTL_MANAGED !== '1') {
    next();
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    managed: true,
    environment: process.env.DEVCTL_ENVIRONMENT_NAME || '',
    project: process.env.DEVCTL_PROJECT || '',
    repo_dir: process.env.DEVCTL_REPO_DIR || '',
    revision: process.env.DEVCTL_SOURCE_REVISION || '',
    configuration_id: process.env.DEVCTL_CONFIGURATION_ID || '',
    port: Number(port),
    pid: process.pid,
  });
});

// Process liveness and application readiness are deliberately separate. The
// process can stay alive to recover from a transient database or Blob failure,
// but it must not receive game traffic until the schema, live catalog, and
// backend-owned object store are all usable. There is no packaged-media
// fallback once live media owns /assets.
app.get('/ready', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const readiness = await liveMediaReadiness();
    res.status(200).json({ status: 'ready', ...readiness });
  } catch (error) {
    console.error('application readiness check failed:', error && error.message);
    res.status(503).json({ error: 'application_not_ready' });
  }
});

// Human-facing build/deploy provenance for Settings → About. The frontend bakes
// the app semver at build time; the deploy-time PR/commit are not knowable then
// (the frontend builds inside Docker with no .git), so they ride as env stamped
// into k8s/values.yaml's `build:` block by .github/workflows/build-and-deploy.yaml
// on each deploy — the SAME commit that bumps the image tag. That means the labels
// stay correct even when a content-identical rebuild is skipped and the old image
// is reused (the image bytes never carry this — only the k8s manifest does). Pure
// chrome: never 500s; unset fields degrade to '' and the client shows just the
// baked version.
app.get('/api/build-info', (_req, res) => {
  res.status(200).json({
    prTitle: process.env.BUILD_PR_TITLE || '',
    prNumber: process.env.BUILD_PR_NUMBER || '',
    prUrl: process.env.BUILD_PR_URL || '',
    commit: process.env.BUILD_COMMIT || '',
  });
});

app.get('/api/__devctl/health', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    managed: process.env.DEVCTL_MANAGED === '1',
    environment: process.env.DEVCTL_ENVIRONMENT_NAME || null,
    project: process.env.DEVCTL_PROJECT || null,
    repo_dir: process.env.DEVCTL_REPO_DIR || null,
    revision: process.env.DEVCTL_SOURCE_REVISION || null,
    configuration_id: process.env.DEVCTL_CONFIGURATION_ID || null,
    pid: process.pid,
  });
});

// Background-music playlist. The cached internal catalog retains Blob identity;
// this public projection contains only display metadata plus stable app routes.
// Listing failure serves the coherent last-good catalog, then graceful empty.
app.get('/api/bgm', async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60, stale-if-error=300');
  res.status(200).json(await bgmDelivery.playlist());
});

// Anonymous app-owned playback route. It never accepts a Blob name or URL from
// the client. A current opaque catalog id receives one fresh capability; Azure
// serves the redirected GET/HEAD and any Range request.
app.get('/api/bgm/tracks/:trackId', async (req, res) => {
  const startedAt = Date.now();
  res.setHeader('Cache-Control', 'no-store');
  try {
    const location = await bgmDelivery.playbackLocation(req.params.trackId);
    if (!location) {
      recordBgmSignal('unknown_track');
      res.status(404).json({ error: 'bgm_track_not_found' });
      return;
    }
    recordBgmSignal('capability_success', { durationMs: Date.now() - startedAt });
    // Avoid Express's convenience redirect body: it repeats the complete
    // credential-bearing Location in HTML/text even though the client needs
    // only the header.
    res.status(302).setHeader('Location', location);
    res.end();
  } catch {
    recordBgmSignal('capability_failure', { durationMs: Date.now() - startedAt });
    res.status(503).json({ error: 'bgm_capability_unavailable' });
  }
});

// --- Editable account username ---------------------------------------------
// The display name shown for a signed-in user is editable: the email is the
// immutable upstream identity, but the name is a per-account override stored here.
const DISPLAY_NAME_MAX = 40;

async function dbGetDisplayName(email) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT display_name FROM user_profiles WHERE email = $1',
    [email],
  );
  return rows[0] ? rows[0].display_name : null;
}

async function dbPutDisplayName(email, displayName) {
  await ensureDbReady();
  await pool.query(
    `INSERT INTO user_profiles (email, display_name)
       VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       updated_at = now()`,
    [email, displayName],
  );
}

// Overlay the user's chosen name onto the public user shape. A DB hiccup must never
// break the identity read, so a failed/disabled lookup just yields the upstream name.
async function withDisplayName(user) {
  if (!user || !user.signed_in || !pool) return user;
  try {
    const displayName = await dbGetDisplayName(user.email);
    if (displayName) return { ...user, name: displayName };
  } catch (error) {
    console.warn('display-name lookup failed; using upstream name:', error.message);
  }
  return user;
}

app.get('/api/auth/me', async (req, res) => {
  try {
    const session = await readSession(req, res);
    res.status(200).json(await withDisplayName(publicUser(session)));
  } catch (error) {
    console.error('auth session check failed:', error);
    res.status(502).json({ signed_in: false, error: 'auth_unavailable' });
  }
});

// Set or clear the signed-in user's display name. Body: { name }. An empty/whitespace
// name clears the override, falling back to the upstream name then the email. The email
// is the identity and is never editable here.
app.patch('/api/auth/me', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const raw = req.body && typeof req.body.name === 'string' ? req.body.name : '';
  const name = clampText(raw, '', DISPLAY_NAME_MAX);
  try {
    await dbPutDisplayName(user.email, name || null);
    res.status(200).json(name ? { ...user, name } : user);
  } catch (error) {
    dbUnavailable(res, 'display name write failed', error, 'profile_unavailable');
  }
});

app.get('/api/lobbies', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const current = userActiveLobby(user.email);
  res.status(200).json({
    lobbies: activeLobbies().map((lobby) => publicLobby(lobby, user.email)),
    current: current ? publicLobby(current, user.email) : null,
    recoverable: userRecoverableLobbies(user.email).map((lobby) => publicLobby(lobby, user.email)),
  });
});

app.post('/api/lobbies', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const existing = userActiveLobby(user.email);
  if (existing) {
    res.status(200).json({ lobby: publicLobby(existing, user.email, { includeLevelSnapshot: true }) });
    return;
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const lobby = {
    id,
    name: lobbyNameFor(user),
    phase: 'waiting',
    createdAt: now,
    updatedAt: now,
    stateRevision: 0,
    host: user,
    guest: null,
    levelId: null,
    levelTimed: null,
    levelName: null,
    levelObjective: null,
    levelSnapshot: null,
    levelFingerprint: null,
    seed: null,
    moves: [],
    // Terminal outcome reported by deterministic gameplay or caused by resignation.
    // Once set, both clients read it off the lobby frame, so it survives reconnect and
    // late join the way the authoritative move log does.
    result: null,
    resultReports: { player: null, enemy: null },
    resultDisputed: false,
    departed: { player: false, enemy: false },
    closedAt: null,
    closedFromPhase: null,
  };
  lobbies.set(id, lobby);
  broadcastLobbies();
  res.status(201).json({ lobby: publicLobby(lobby, user.email) });
});

// GLOBAL lobby-list SSE channel. Registered BEFORE `/api/lobbies/:id` so the
// literal `/events` path is not swallowed by the :id param route. Auth before
// headers; a viewer-neutral ping on every lobby mutation → clients refetch.
app.get('/api/lobbies/events', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const heartbeat = startSse(res);
  lobbyListSubscribers.add(res);
  // Connect-time snapshot: push an immediate change ping so the client refetches the
  // current list the instant the stream opens (mirrors the per-lobby channel's on-connect
  // frame at the /:id/events route). Combined with the client's onopen refetch, this makes
  // every (re)connection self-healing — a mutation missed while the socket was down is
  // recovered on reconnect instead of being lost until a manual Refresh.
  sseWrite(res, 'data: {"type":"lobbies-changed"}\n\n');
  req.on('close', () => {
    clearInterval(heartbeat);
    lobbyListSubscribers.delete(res);
  });
});

app.get('/api/lobbies/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbyRecord(req.params.id);
  if (!lobby || (lobby.phase === 'closed' && !lobbySideForEmail(lobby, user.email))) {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  res.status(200).json({ lobby: publicLobby(lobby, user.email, { includeLevelSnapshot: true }) });
});

app.post('/api/lobbies/:id/join', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbyRecord(req.params.id);
  if (!lobby || lobby.phase === 'closed') {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  if (lobby.host.email === user.email) {
    res.status(409).json({ error: 'host_cannot_join_own_lobby' });
    return;
  }
  const existing = userActiveLobby(user.email);
  if (existing && existing.id !== lobby.id) {
    res.status(409).json({ error: 'already_in_lobby', lobby: publicLobby(existing, user.email) });
    return;
  }
  if (lobby.phase !== 'waiting' || lobby.guest) {
    res.status(409).json({ error: 'lobby_unavailable' });
    return;
  }
  lobby.guest = user;
  lobby.departed.enemy = false;
  lobby.phase = 'ready';
  touchLobby(lobby);
  broadcastLobbies();
  broadcastLobbyState(lobby);
  res.status(200).json({ lobby: publicLobby(lobby, user.email) });
});

async function canonicalLobbyLevelMetadata(levelId) {
  if (process.env.NODE_ENV === 'test' && lobbyTestLevelMetadata) {
    const testEntry = lobbyTestLevelMetadata[levelId];
    if (isObjectRecord(testEntry) && isObjectRecord(testEntry.level)) {
      if (Number.isInteger(testEntry.delayMs) && testEntry.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, testEntry.delayMs));
      }
      return { timed: Boolean(testEntry.level.timeControl), level: testEntry.level };
    }
  }
  // Do not use the OG/thumbnail last-good cache here. Match authority must read the
  // current canonical document at both selection and Start and fail closed on DB loss.
  try {
    const document = await dbGetOfficialCampaigns('default');
    const data = document && document.data;
    const level = data && isObjectRecord(data.levels) && data.levels[levelId];
    if (!isObjectRecord(level)) return null;
    return { timed: Boolean(level.timeControl), level };
  } catch (error) {
    console.warn('canonical lobby level lookup failed:', error.message);
    return null;
  }
}

function immutableLobbyLevelSnapshot(level) {
  const serialized = JSON.stringify(level);
  return {
    level: JSON.parse(serialized),
    fingerprint: `sha256:${crypto.createHash('sha256').update(serialized).digest('hex')}`,
  };
}

// Host picks a canonical official level (before start). Timing eligibility is derived
// server-side from that level; request metadata is never trusted.
app.post('/api/lobbies/:id/level', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbyRecord(req.params.id);
  if (!lobby || lobby.phase === 'closed') {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  if (lobby.host.email !== user.email) {
    res.status(403).json({ error: 'host_only' });
    return;
  }
  if (lobby.phase !== 'waiting' && lobby.phase !== 'ready') {
    res.status(409).json({ error: 'lobby_already_started' });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const levelId = typeof body.levelId === 'string' ? body.levelId.trim() : '';
  if (!levelId) {
    res.status(400).json({ error: 'missing_level_id' });
    return;
  }
  const expectedState = {
    id: lobby.id,
    revision: lobby.stateRevision,
    phase: lobby.phase,
    hostEmail: lobby.host.email,
    guestEmail: lobby.guest && lobby.guest.email,
  };
  const metadata = await canonicalLobbyLevelMetadata(levelId);
  if (!lobbyStateMatches(lobby, expectedState)) {
    res.status(409).json({ error: 'lobby_state_changed' });
    return;
  }
  if (!metadata) {
    res.status(404).json({ error: 'level_not_found' });
    return;
  }
  lobby.levelId = levelId;
  lobby.levelTimed = metadata.timed;
  lobby.levelName = typeof metadata.level.name === 'string' ? metadata.level.name : levelId;
  lobby.levelObjective = typeof metadata.level.objective === 'string' ? metadata.level.objective : null;
  lobby.levelSnapshot = null;
  lobby.levelFingerprint = null;
  touchLobby(lobby);
  broadcastLobbies();
  broadcastLobbyState(lobby);
  res.status(200).json({ lobby: publicLobby(lobby, user.email) });
});

app.post('/api/lobbies/:id/start', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbyRecord(req.params.id);
  if (!lobby) {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  if (lobby.phase === 'closed') {
    const isSeated = Boolean(lobbySideForEmail(lobby, user.email));
    res.status(isSeated ? 409 : 404).json({ error: isSeated ? 'lobby_closed' : 'lobby_not_found' });
    return;
  }
  if (lobby.host.email !== user.email) {
    res.status(403).json({ error: 'host_only' });
    return;
  }
  if (lobby.phase === 'started') {
    res.status(409).json({ error: 'lobby_already_started' });
    return;
  }
  if (lobby.phase !== 'ready') {
    res.status(409).json({ error: 'lobby_not_ready' });
    return;
  }
  if (!lobby.guest) {
    res.status(409).json({ error: 'missing_opponent' });
    return;
  }
  if (!lobby.levelId) {
    res.status(409).json({ error: 'no_level' });
    return;
  }
  const selectedLevelId = lobby.levelId;
  const expectedState = {
    id: lobby.id,
    revision: lobby.stateRevision,
    phase: 'ready',
    hostEmail: lobby.host.email,
    guestEmail: lobby.guest && lobby.guest.email,
    levelId: selectedLevelId,
  };
  // Re-resolve at the transition boundary: official content can be republished between
  // selection and Start, so cached eligibility is presentation only, never authority.
  const currentLevelMetadata = await canonicalLobbyLevelMetadata(selectedLevelId);
  if (!lobbyStateMatches(lobby, expectedState)) {
    res.status(409).json({ error: 'lobby_state_changed' });
    return;
  }
  if (!currentLevelMetadata) {
    res.status(409).json({ error: 'level_not_found' });
    return;
  }
  lobby.levelTimed = currentLevelMetadata.timed;
  lobby.levelName = typeof currentLevelMetadata.level.name === 'string'
    ? currentLevelMetadata.level.name
    : selectedLevelId;
  lobby.levelObjective = typeof currentLevelMetadata.level.objective === 'string'
    ? currentLevelMetadata.level.objective
    : null;
  if (lobby.levelTimed) {
    touchLobby(lobby);
    broadcastLobbies();
    broadcastLobbyState(lobby);
    res.status(409).json({ error: 'timed_level_unsupported' });
    return;
  }
  const pinnedLevel = immutableLobbyLevelSnapshot(currentLevelMetadata.level);
  lobby.levelSnapshot = pinnedLevel.level;
  lobby.levelFingerprint = pinnedLevel.fingerprint;
  // Lock a positive-integer seed for deterministic shared placement (crypto so it
  // is not predictable). Both clients build the identical board from (level, seed).
  lobby.seed = 1 + (crypto.randomInt ? crypto.randomInt(900000) : Math.floor(Math.random() * 900000));
  // Initialize the one match owned by this ready lobby. A started lobby cannot be reset;
  // rematch requires a new coordinated server operation.
  lobby.moves = [];
  lobby.result = null;
  lobby.resultReports = { player: null, enemy: null };
  lobby.resultDisputed = false;
  lobby.departed = { player: false, enemy: false };
  lobby.closedAt = null;
  lobby.closedFromPhase = null;
  lobby.phase = 'started';
  touchLobby(lobby);
  broadcastLobbies();
  broadcastLobbyState(lobby);
  res.status(200).json({ lobby: publicLobby(lobby, user.email, { includeLevelSnapshot: true }) });
});

const LOBBY_INTENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const LOBBY_PROMOTIONS = new Set(['queen', 'rook', 'bishop', 'knight']);

function sameLobbyRelayMove(a, b) {
  return Boolean(
    a && b
    && a.x === b.x
    && a.y === b.y
    && (a.promotion ?? null) === (b.promotion ?? null),
  );
}

// Relay one applyMove. Caller must be host/guest; lobby must be started. The
// server does NOT validate chess legality — clients do (deterministic replay).
app.post('/api/lobbies/:id/moves', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbyRecord(req.params.id);
  if (!lobby) {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  const callerSide = lobbySideForEmail(lobby, user.email);
  if (!callerSide) {
    res.status(409).json({ error: 'not_in_lobby' });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const expectedMoveCount = body.expectedMoveCount;
  if (!Number.isInteger(expectedMoveCount) || expectedMoveCount < 0) {
    res.status(400).json({ error: 'bad_expected_move_count', move_count: lobby.moves.length });
    return;
  }
  const intentId = body.intentId;
  if (typeof intentId !== 'string' || !LOBBY_INTENT_ID_PATTERN.test(intentId)) {
    res.status(400).json({ error: 'bad_intent_id' });
    return;
  }
  const pieceId = typeof body.pieceId === 'string' ? body.pieceId : '';
  const move = body.move;
  if (
    !pieceId ||
    !move || typeof move !== 'object' || Array.isArray(move) ||
    typeof move.x !== 'number' || !Number.isFinite(move.x) ||
    typeof move.y !== 'number' || !Number.isFinite(move.y) ||
    (move.promotion !== undefined && !LOBBY_PROMOTIONS.has(move.promotion))
  ) {
    res.status(400).json({ error: 'bad_move' });
    return;
  }
  const relayMove = move.promotion === undefined
    ? { x: move.x, y: move.y }
    : { x: move.x, y: move.y, promotion: move.promotion };

  // Intent identity is checked before terminal/count/turn gates. An HTTP retry of the
  // original body therefore returns the original ordered event even though its expected
  // index is now stale; reusing the id for any different request is a protocol conflict.
  const priorIntent = lobby.moves.find((event) => event.intentId === intentId);
  if (priorIntent) {
    const identical = priorIntent.side === callerSide
      && priorIntent.i === expectedMoveCount
      && priorIntent.pieceId === pieceId
      && sameLobbyRelayMove(priorIntent.move, relayMove);
    if (!identical) {
      res.status(409).json({ error: 'intent_id_conflict', move_count: lobby.moves.length, move: priorIntent });
      return;
    }
    res.status(200).json({ move: priorIntent });
    return;
  }

  if (lobby.phase === 'closed') {
    res.status(409).json({ error: 'lobby_closed' });
    return;
  }
  if (lobby.phase !== 'started') {
    res.status(409).json({ error: 'lobby_not_started' });
    return;
  }

  // The match is already decided by a published deterministic result or resignation —
  // no new intents are relayed. This guards a stale/racing POST from re-opening it.
  if (lobby.result) {
    res.status(409).json({ error: 'match_over' });
    return;
  }
  if (lobby.resultDisputed) {
    res.status(409).json({ error: 'result_disputed', move_count: lobby.moves.length });
    return;
  }
  const pendingReports = lobby.resultReports || {};
  if (pendingReports.player || pendingReports.enemy) {
    res.status(409).json({ error: 'result_pending', move_count: lobby.moves.length });
    return;
  }
  // expectedMoveCount gates only a genuinely new intent.
  if (expectedMoveCount !== lobby.moves.length) {
    res.status(409).json({ error: 'stale_move', move_count: lobby.moves.length });
    return;
  }
  // Turn integrity: the client store applies moves without AP mode, so every move flips
  // the turn — strict one-move-per-turn alternation. Host ('player') therefore posts at
  // EVEN relay indices, guest ('enemy') at odd. Reject a post from the side whose turn it
  // isn't, so a tampered/misbehaving client can't move out of turn (which desyncs boards).
  const expectedSide = lobby.moves.length % 2 === 0 ? 'player' : 'enemy';
  if (callerSide !== expectedSide) {
    res.status(409).json({ error: 'not_your_turn' });
    return;
  }
  const event = {
    i: lobby.moves.length,
    side: callerSide,
    intentId,
    pieceId,
    move: relayMove,
  };
  lobby.moves.push(event);
  touchLobby(lobby);
  broadcastToLobby(lobby.id, { type: 'move', move: event });
  res.status(200).json({ move: event });
});

const LOBBY_PLAYING_SIDES = new Set(['player', 'enemy']);
const LOBBY_DRAW_REASONS = new Set(['stalemate', 'fifty-move', 'threefold']);
const LOBBY_WIN_REASONS = new Set(['victory-rule', 'checkmate']);

function sameLobbyResult(a, b) {
  return Boolean(a && b && a.winner === b.winner && a.reason === b.reason);
}

function sameLobbyResultReport(a, b) {
  return Boolean(
    a && b
    && a.expectedMoveCount === b.expectedMoveCount
    && sameLobbyResult(a, b),
  );
}

// Persist and publish an authoritative terminal result while the current seats/phase
// still exist. Deterministic callers reach this only after matching two-seat consensus;
// explicit resignation/Leave are server-authored concessions and clear any dispute.
function publishLobbyResult(lobby, result) {
  if (lobby.result) return sameLobbyResult(lobby.result, result) ? 'identical' : 'conflict';
  lobby.result = result;
  lobby.resultDisputed = false;
  touchLobby(lobby);
  broadcastLobbyState(lobby);
  broadcastLobbies();
  return 'published';
}

function parseDeterministicLobbyResult(lobby, raw) {
  const body = isObjectRecord(raw) ? raw : {};
  const expectedMoveCount = body.expectedMoveCount;
  if (!Number.isInteger(expectedMoveCount) || expectedMoveCount < 0) {
    return { status: 400, body: { error: 'bad_expected_move_count', move_count: lobby.moves.length } };
  }
  if (expectedMoveCount !== lobby.moves.length) {
    return { status: 409, body: { error: 'stale_result', move_count: lobby.moves.length } };
  }

  const winner = body.winner;
  const reason = body.reason;
  const isDraw = winner === 'draw' && LOBBY_DRAW_REASONS.has(reason);
  const isWin = LOBBY_PLAYING_SIDES.has(winner) && LOBBY_WIN_REASONS.has(reason);
  if (!isDraw && !isWin) {
    return { status: 400, body: { error: 'bad_result' } };
  }
  return { report: { expectedMoveCount, winner, reason } };
}

function recordDeterministicLobbyResult(lobby, reportingSide, raw) {
  const parsed = parseDeterministicLobbyResult(lobby, raw);
  if (!parsed.report) return parsed;
  const reports = lobby.resultReports || (lobby.resultReports = { player: null, enemy: null });
  const previous = reports[reportingSide];
  if (previous) {
    if (!sameLobbyResultReport(previous, parsed.report)) {
      return {
        status: 409,
        body: { error: 'conflicting_result_report', move_count: lobby.moves.length, report: previous },
      };
    }
    // Critical for SSE stability: a same-seat retry is a read-only acknowledgement.
    return {
      report: previous,
      publication: lobby.result ? 'published' : (lobby.resultDisputed ? 'disputed' : 'pending'),
    };
  }

  if (lobby.result) {
    return {
      status: 409,
      body: { error: 'match_over', move_count: lobby.moves.length, result: lobby.result },
    };
  }

  const otherSide = reportingSide === 'player' ? 'enemy' : 'player';
  const other = reports[otherSide];
  if (other && !sameLobbyResultReport(other, parsed.report)) {
    // Both deterministic clients have stopped on different terminal states. Preserve
    // both immutable reports and freeze the exact prefix for explicit user resolution.
    reports[reportingSide] = parsed.report;
    lobby.resultDisputed = true;
    touchLobby(lobby);
    broadcastLobbyState(lobby);
    broadcastLobbies();
    return {
      status: 409,
      body: {
        error: 'conflicting_result_report',
        move_count: lobby.moves.length,
        report: other,
        result_disputed: true,
      },
    };
  }

  reports[reportingSide] = parsed.report;
  if (other) {
    publishLobbyResult(lobby, { winner: parsed.report.winner, reason: parsed.report.reason });
    return { report: parsed.report, publication: 'published' };
  }

  touchLobby(lobby);
  broadcastLobbyState(lobby);
  broadcastLobbies();
  return { report: parsed.report, publication: 'pending' };
}

// Resign the match. Caller must be host/guest; lobby must be started. Records a
// terminal result (the OTHER side wins) on the lobby and pushes it to both clients
// over the game channel — they end the game from their own seat's perspective. Unlike
// a move, resignation isn't turn-gated (a player may resign any time) and it's stored
// on the lobby (not the move log) so a reconnecting/late client learns the match ended.
app.post('/api/lobbies/:id/resign', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbyRecord(req.params.id);
  if (!lobby || lobby.phase === 'closed') {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  const isHost = lobby.host.email === user.email;
  const isGuest = lobby.guest && lobby.guest.email === user.email;
  if (!isHost && !isGuest) {
    res.status(409).json({ error: 'not_in_lobby' });
    return;
  }
  if (lobby.phase !== 'started') {
    res.status(409).json({ error: 'lobby_not_started' });
    return;
  }
  // Idempotent: a double-tap (or both players racing to resign) keeps the first result.
  publishLobbyResult(lobby, {
    winner: isHost ? 'enemy' : 'player',
    reason: 'resign',
  });
  res.status(200).json({ lobby: publicLobby(lobby, user.email, { includeLevelSnapshot: true }) });
});

// Publish a terminal outcome reached by deterministic gameplay. Either seated client
// may report it, but it must describe the exact authoritative relay index. Identical
// reports are idempotent; a conflicting report is surfaced instead of replacing the
// first result.
app.post('/api/lobbies/:id/result', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbyRecord(req.params.id);
  if (!lobby) {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  const reportingSide = lobbySideForEmail(lobby, user.email);
  if (!reportingSide) {
    res.status(403).json({ error: 'not_in_lobby' });
    return;
  }
  if (!isStartedLobbyLifecycle(lobby)) {
    res.status(409).json({ error: 'lobby_not_started' });
    return;
  }
  const accepted = recordDeterministicLobbyResult(lobby, reportingSide, req.body);
  if (!accepted.report) {
    res.status(accepted.status).json(accepted.body);
    return;
  }
  res.status(200).json({ lobby: publicLobby(lobby, user.email, { includeLevelSnapshot: true }) });
});

// Backfill relayed moves since index N. Open lobbies are observer-readable; closed
// tombstones retain backfill only for their two original seats.
app.get('/api/lobbies/:id/moves', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbyRecord(req.params.id);
  if (!lobby || (lobby.phase === 'closed' && !lobbySideForEmail(lobby, user.email))) {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  const parsed = Number.parseInt(req.query.since, 10);
  const since = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  res.status(200).json({ moves: lobby.moves.slice(since) });
});

// PER-LOBBY game SSE channel. Open lobbies admit observers; a closed tombstone admits
// original seats only. Sends the current projected frame immediately, then live frames.
app.get('/api/lobbies/:id/events', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbyRecord(req.params.id);
  if (!lobby || (lobby.phase === 'closed' && !lobbySideForEmail(lobby, user.email))) {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  const heartbeat = startSse(res);
  const sub = { res, email: user.email };
  let subs = lobbyChannelSubscribers.get(lobby.id);
  if (!subs) {
    subs = new Set();
    lobbyChannelSubscribers.set(lobby.id, subs);
  }
  subs.add(sub);
  // Immediate current-state frame so the client has state without a refetch.
  sseWrite(res, `data: ${JSON.stringify({ type: 'lobby', lobby: publicLobby(lobby, user.email, { includeLevelSnapshot: true }) })}\n\n`);
  req.on('close', () => {
    clearInterval(heartbeat);
    const set = lobbyChannelSubscribers.get(lobby.id);
    if (set) {
      set.delete(sub);
      if (set.size === 0) lobbyChannelSubscribers.delete(lobby.id);
    }
  });
});

app.post('/api/lobbies/:id/leave', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbyRecord(req.params.id);
  if (!lobby) {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  const leavingSide = lobbySideForEmail(lobby, user.email);
  if (!leavingSide) {
    res.status(403).json({ error: 'not_in_lobby' });
    return;
  }

  const leaveBody = isObjectRecord(req.body) ? req.body : {};
  const hasCompletion = ['expectedMoveCount', 'winner', 'reason']
    .some((key) => Object.prototype.hasOwnProperty.call(leaveBody, key));
  if (hasCompletion) {
    if (!isStartedLobbyLifecycle(lobby)) {
      res.status(409).json({ error: 'lobby_not_started' });
      return;
    }
    // Completion is one seat's report, not authority. It suppresses resignation for this
    // navigation, but only an independent matching report from the other seat publishes.
    const accepted = recordDeterministicLobbyResult(lobby, leavingSide, leaveBody);
    if (!accepted.report) {
      res.status(accepted.status).json(accepted.body);
      return;
    }
  }

  // Preserve the pregame guest-leave behavior: no match exists, so the seat can simply
  // reopen. Once a match starts, neither identity is removed; the closed tombstone owns
  // the move/result history until both original participants acknowledge it or TTL.
  if (leavingSide === 'enemy' && (lobby.phase === 'waiting' || lobby.phase === 'ready')) {
    lobby.guest = null;
    lobby.departed.enemy = false;
    lobby.phase = 'waiting';
    touchLobby(lobby);
    broadcastLobbies();
    broadcastLobbyState(lobby);
    res.status(200).json({ lobby: publicLobby(lobby, user.email, { includeLevelSnapshot: true }) });
    return;
  }

  const isLiveLifecycle = isStartedLobbyLifecycle(lobby);
  // A completion-bearing Leave is a normal-finish report. Without one, explicit Leave
  // from a live lifecycle remains resignation and is published before the tombstone.
  if (!hasCompletion && isLiveLifecycle && lobby.guest && !lobby.result) {
    publishLobbyResult(lobby, {
      winner: leavingSide === 'player' ? 'enemy' : 'player',
      reason: 'resign',
    });
  }

  if (lobby.phase !== 'closed') {
    lobby.closedFromPhase = lobby.phase;
    lobby.phase = 'closed';
    lobby.closedAt = new Date().toISOString();
  }
  lobby.departed = lobby.departed || { player: false, enemy: false };
  lobby.departed[leavingSide] = true;
  touchLobby(lobby);
  const snapshot = publicLobby(lobby, user.email, { includeLevelSnapshot: true });
  restrictClosedLobbyStreams(lobby);
  broadcastLobbyState(lobby);
  broadcastLobbies();

  if (bothLobbySeatsDeparted(lobby)) {
    deleteLobbyRecord(lobby);
    res.status(204).end();
    return;
  }

  if (leavingSide === 'player') res.status(204).end();
  else res.status(200).json({ lobby: snapshot });
});

app.get('/api/campaigns', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const campaigns = await dbListCampaigns(user.email);
    res.status(200).json({ campaigns: campaigns.map(campaignSummary) });
  } catch (error) {
    dbUnavailable(res, 'campaign list failed', error, 'campaign_store_unavailable');
  }
});

app.post('/api/campaigns', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const now = new Date().toISOString();
  const raw = req.body && typeof req.body === 'object' ? req.body : {};
  let level;
  try {
    level = buildLevel(raw.level, 0);
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || 'invalid_level' });
    return;
  }
  const campaign = {
    id: crypto.randomUUID(),
    title: clampText(raw.title, 'Untitled Campaign', 64),
    description: clampText(raw.description, '', 220),
    createdAt: now,
    updatedAt: now,
    owner: user,
    levels: [level],
  };
  try {
    const saved = await dbPutCampaign(user.email, campaign);
    res.status(201).json({ campaign: campaignSummary(saved) });
  } catch (error) {
    dbUnavailable(res, 'campaign create failed', error, 'campaign_store_unavailable');
  }
});

app.get('/api/campaigns/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const campaign = await dbGetCampaign(user.email, req.params.id);
    if (!campaign) {
      res.status(404).json({ error: 'campaign_not_found' });
      return;
    }
    res.status(200).json({ campaign: campaignSummary(campaign) });
  } catch (error) {
    dbUnavailable(res, 'campaign read failed', error, 'campaign_store_unavailable');
  }
});

app.patch('/api/campaigns/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const campaign = await dbGetCampaign(user.email, req.params.id);
    if (!campaign) {
      res.status(404).json({ error: 'campaign_not_found' });
      return;
    }
    const raw = req.body && typeof req.body === 'object' ? req.body : {};
    if (Object.hasOwn(raw, 'title')) campaign.title = clampText(raw.title, campaign.title, 64);
    if (Object.hasOwn(raw, 'description')) campaign.description = clampText(raw.description, campaign.description, 220);
    campaign.updatedAt = new Date().toISOString();
    const saved = await dbPutCampaign(user.email, campaign);
    res.status(200).json({ campaign: campaignSummary(saved) });
  } catch (error) {
    dbUnavailable(res, 'campaign update failed', error, 'campaign_store_unavailable');
  }
});

app.delete('/api/campaigns/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const deleted = await dbDeleteCampaign(user.email, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'campaign_not_found' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    dbUnavailable(res, 'campaign delete failed', error, 'campaign_store_unavailable');
  }
});

app.post('/api/campaigns/:id/levels', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const campaign = await dbGetCampaign(user.email, req.params.id);
    if (!campaign) {
      res.status(404).json({ error: 'campaign_not_found' });
      return;
    }
    let level;
    try {
      level = buildLevel(req.body, campaign.levels.length);
    } catch (error) {
      res.status(error.statusCode || 400).json({ error: error.message || 'invalid_level' });
      return;
    }
    campaign.levels.push(level);
    campaign.updatedAt = new Date().toISOString();
    const saved = await dbPutCampaign(user.email, campaign);
    res.status(201).json({ campaign: campaignSummary(saved), level: publicLevel(level) });
  } catch (error) {
    dbUnavailable(res, 'campaign level create failed', error, 'campaign_store_unavailable');
  }
});

app.patch('/api/campaigns/:id/levels/:levelId', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const campaign = await dbGetCampaign(user.email, req.params.id);
    if (!campaign) {
      res.status(404).json({ error: 'campaign_not_found' });
      return;
    }
    const level = campaign.levels.find((item) => item.id === req.params.levelId);
    if (!level) {
      res.status(404).json({ error: 'level_not_found' });
      return;
    }
    try {
      applyLevelPatch(level, req.body);
    } catch (error) {
      res.status(error.statusCode || 400).json({ error: error.message || 'invalid_level' });
      return;
    }
    campaign.updatedAt = new Date().toISOString();
    const saved = await dbPutCampaign(user.email, campaign);
    res.status(200).json({ campaign: campaignSummary(saved), level: publicLevel(level) });
  } catch (error) {
    dbUnavailable(res, 'campaign level update failed', error, 'campaign_store_unavailable');
  }
});

app.delete('/api/campaigns/:id/levels/:levelId', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const campaign = await dbGetCampaign(user.email, req.params.id);
    if (!campaign) {
      res.status(404).json({ error: 'campaign_not_found' });
      return;
    }
    if (campaign.levels.length <= 1) {
      res.status(409).json({ error: 'campaign_needs_level' });
      return;
    }
    const index = campaign.levels.findIndex((level) => level.id === req.params.levelId);
    if (index === -1) {
      res.status(404).json({ error: 'level_not_found' });
      return;
    }
    campaign.levels.splice(index, 1);
    campaign.updatedAt = new Date().toISOString();
    const saved = await dbPutCampaign(user.email, campaign);
    res.status(200).json({ campaign: campaignSummary(saved) });
  } catch (error) {
    dbUnavailable(res, 'campaign level delete failed', error, 'campaign_store_unavailable');
  }
});

app.get('/api/design-portfolios/:id', async (req, res) => {
  const id = designPortfolioId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_design_portfolio_id' });
    return;
  }
  try {
    const document = await dbGetDesignPortfolio(id);
    res.status(200).json({
      portfolio: publicDesignPortfolioDocument(id, document),
      store_schema_version: DESIGN_PORTFOLIO_STORE_SCHEMA_VERSION,
    });
  } catch (error) {
    dbUnavailable(res, 'design portfolio read failed', error, 'design_portfolio_store_unavailable');
  }
});

app.put('/api/design-portfolios/:id', async (req, res) => {
  const user = await requireDesignPortfolioWriter(req, res);
  if (!user) return;
  const id = designPortfolioId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_design_portfolio_id' });
    return;
  }
  const raw = req.body && typeof req.body === 'object' ? req.body : {};
  if (!isObjectRecord(raw.data)) {
    res.status(400).json({ error: 'design_portfolio_data_object_required' });
    return;
  }

  try {
    const document = await dbUpsertDesignPortfolio(id, {
      data: raw.data,
      client_schema_version: Object.hasOwn(raw, 'client_schema_version') ? raw.client_schema_version : null,
      metadata: isObjectRecord(raw.metadata) ? raw.metadata : {},
      updated_by: user.email,
    });
    res.status(200).json({
      portfolio: publicDesignPortfolioDocument(id, document),
      store_schema_version: DESIGN_PORTFOLIO_STORE_SCHEMA_VERSION,
    });
  } catch (error) {
    dbUnavailable(res, 'design portfolio write failed', error, 'design_portfolio_store_unavailable');
  }
});

app.get('/api/auth/sign-in', async (req, res) => {
  if (isDevAuthHost(req)) {
    res.setHeader('Set-Cookie', 'better-auth.session=mock-dev-session; Path=/; HttpOnly');
    const returnTo = req.query.returnTo || '/';
    res.redirect(302, returnTo);
    return;
  }
  try {
    const authorizeURL = await oidcSessions.startLogin(safeReturnPath(req.query.returnTo), res);
    res.redirect(302, authorizeURL);
  } catch (error) {
    console.error('OIDC sign-in start failed:', error);
    res.status(error.statusCode || 502).send('sign-in unavailable');
  }
});

app.get('/api/auth/callback', async (req, res) => {
  try {
    const returnTo = await oidcSessions.completeLogin({
      code: req.query.code,
      state: req.query.state,
      cookieHeader: req.get('cookie') || '',
    }, res);
    res.redirect(302, returnTo);
  } catch (error) {
    console.error('OIDC callback failed:', error);
    res.status(error.statusCode || 502).send('sign-in failed');
  }
});

app.post('/api/auth/sign-out', (req, res) => {
  oidcSessions.clearSession(res);
  // Local DEV_AUTH uses the legacy-shaped mock cookie only inside loopback and
  // test-slot lanes; clear it alongside the production OIDC cookies.
  res.append('Set-Cookie', 'better-auth.session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.status(204).end();
});

// --- New-format level persistence (Phase 4) --------------------------------
// Durable, per-user document store for the new Level JSON schema, backed by the
// Postgres `levels` table (relational metadata columns + a jsonb body). Scoped
// to the signed-in owner: each user has their own level id namespace.
const LEVEL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
function levelStoreId(raw) {
  const id = String(raw || '').trim();
  return LEVEL_ID_PATTERN.test(id) ? id : '';
}
function isLevelBody(body) {
  return Boolean(
    body && typeof body === 'object' && body.board && typeof body.board.cols === 'number'
    && typeof body.board.rows === 'number' && body.layers && typeof body.layers === 'object',
  );
}

// `rival-kings` is the ADR-0050 addition (both sides field a King). The stored objective
// ids stay the legacy set deliberately — they exist in the live DB, and a rename would
// force a prod data migration (docs/migration-policy.md).
const WORKSPACE_OBJECTIVES = new Set(['capture-all', 'capture-king', 'rival-kings', 'survive', 'reach']);
const WORKSPACE_TERRAIN = new Set(['grass', 'water', 'stone', 'road', 'bridge', 'cliff', 'rock', 'sand', 'dirt', 'pebble', 'void']);
// Mirror of core/level.ts ZONE_TYPES. `workspaceZoneTypes.test.js` fails when this drifts from
// the shared source: a zone type the editor can author but this set does not know is rejected
// as an invalid level body, which surfaces to the author only as "Cloud autosave is unavailable".
const WORKSPACE_ZONE_TYPES = new Set(['region', 'player-spawn', 'player-king-spawn', 'enemy-spawn', 'enemy-threat', 'objective', 'falling-rock', 'pawn-promotion']);
const WORKSPACE_PIECES = new Set(['pawn', 'knight', 'bishop', 'rook', 'queen', 'king', 'rock', 'random-rock']);
const WORKSPACE_SIDES = new Set(['player', 'enemy', 'neutral']);
// Playable-only piece types for a random-placement roster (no rocks) — mirrors the
// frontend `isPlayablePieceType` gate on `Level.roster` (core/level.ts + core/pieces.ts).
const WORKSPACE_ROSTER_PIECES = new Set(['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']);
// ADR-0064 victory-condition kinds — mirror of core/level.ts VictoryCondition.
const WORKSPACE_CONDITION_KINDS = new Set(['eliminate', 'reach', 'turnLimit']);
const WORKSPACE_PROMOTION_PIECES = new Set(['queen', 'rook', 'bishop', 'knight']);

/** Structural check for one ADR-0064 victory condition. Returns an error string or null. Shape/enum
 * only, mirroring the frontend's conditionErrors (core/level.ts). */
function validateWorkspaceCondition(c, label) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return `${label} must be a condition object`;
  if (!WORKSPACE_CONDITION_KINDS.has(c.kind)) return `${label}.kind is invalid`;
  if (c.kind === 'eliminate') {
    if (c.side !== 'player' && c.side !== 'enemy') return `${label}.side is invalid`;
    if (c.filter !== undefined) {
      if (!c.filter || typeof c.filter !== 'object' || Array.isArray(c.filter)) return `${label}.filter is invalid`;
      if (c.filter.type !== undefined && !WORKSPACE_ROSTER_PIECES.has(c.filter.type)) return `${label}.filter.type is invalid`;
    }
  } else if (c.kind === 'reach') {
    if (c.side !== 'player' && c.side !== 'enemy') return `${label}.side is invalid`;
  } else if (c.kind === 'turnLimit') {
    if (!isFiniteInteger(c.turns) || c.turns < 1) return `${label}.turns is invalid`;
  }
  return null;
}

/** Structural check for an authored `Level.victory` (ADR-0064) — an ORDERED array of if-then rules.
 * An empty list is legal shape here (the editor's validatePlayability P6 gates unwinnable/unlosable
 * sets); this only checks each rule has a conditions array + a valid `then`, and every condition is
 * well-formed. Returns an error string or null. */
function validateWorkspaceVictory(victory, key) {
  if (!Array.isArray(victory)) return `levels.${key}.victory is invalid`;
  for (let i = 0; i < victory.length; i += 1) {
    const rule = victory[i];
    const label = `levels.${key}.victory[${i}]`;
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return `${label} must be a rule object`;
    if (!Array.isArray(rule.if)) return `${label}.if is invalid`;
    for (let j = 0; j < rule.if.length; j += 1) {
      const err = validateWorkspaceCondition(rule.if[j], `${label}.if[${j}]`);
      if (err) return err;
    }
    if (!Array.isArray(rule.do)) return `${label}.do is invalid`;
    for (let j = 0; j < rule.do.length; j += 1) {
      const a = rule.do[j];
      if (!a || typeof a !== 'object' || Array.isArray(a)) return `${label}.do[${j}] must be an action object`;
      if (a.kind !== 'win' && a.kind !== 'lose') return `${label}.do[${j}].kind is invalid`;
      if (a.side !== 'player' && a.side !== 'enemy') return `${label}.do[${j}].side is invalid`;
    }
  }
  return null;
}

function validateWorkspaceRosterCounts(roster, label) {
  if (!roster || typeof roster !== 'object' || Array.isArray(roster)) return `${label} is invalid`;
  for (const [type, count] of Object.entries(roster)) {
    if (!WORKSPACE_ROSTER_PIECES.has(type) || !isFiniteInteger(count) || count < 1) return `${label} contains an invalid piece count`;
  }
  return null;
}

function validateWorkspaceEventTrigger(trigger, label) {
  if (!trigger || typeof trigger !== 'object' || Array.isArray(trigger)) return `${label} is invalid`;
  if (trigger.kind !== 'setup' && trigger.kind !== 'unit-enters-zone') return `${label}.kind is invalid`;
  if (trigger.kind === 'unit-enters-zone') {
    if (typeof trigger.zoneId !== 'string' || !trigger.zoneId.trim()) return `${label}.zoneId is invalid`;
    const unit = trigger.unit;
    if (!unit || typeof unit !== 'object' || Array.isArray(unit)) return `${label}.unit is invalid`;
    if (unit.type !== 'pawn') return `${label}.unit.type is invalid`;
    if (unit.side !== undefined && unit.side !== 'player' && unit.side !== 'enemy') return `${label}.unit.side is invalid`;
  }
  return null;
}

function validateWorkspaceSpawnAction(action, label, triggerKind) {
  if (triggerKind !== 'setup') return `${label}.kind spawn requires setup trigger`;
  if (action.side !== 'player' && action.side !== 'enemy') return `${label}.side is invalid`;
  const rosterErr = validateWorkspaceRosterCounts(action.roster, `${label}.roster`);
  if (rosterErr) return rosterErr;
  // Working-copy autosave accepts an incomplete deployment draft. The frontend's one
  // playability authority blocks canonical Save until usable zone geometry exists (ADR-0287).
  if (!Array.isArray(action.zoneIds) || action.zoneIds.some((id) => typeof id !== 'string' || !id.trim())) {
    return `${label}.zoneIds is invalid`;
  }
  return null;
}

function validateWorkspacePromoteAction(action, label, triggerKind) {
  if (triggerKind !== 'unit-enters-zone') return `${label}.kind promote requires unit-enters-zone trigger`;
  if (!action.target || typeof action.target !== 'object' || Array.isArray(action.target) || action.target.kind !== 'triggering-unit') {
    return `${label}.target is invalid`;
  }
  return null;
}

/** Structural check for an ADR-0072 castle action — mirror of the frontend's
 * levelEventActionErrors (core/level.ts). Shape/enum only; alignment and board bounds
 * stay editor-side like the other gameplay gates. */
function validateWorkspaceCastleAction(action, label, triggerKind) {
  if (triggerKind !== 'setup') return `${label}.kind castle requires setup trigger`;
  if (action.side !== 'player' && action.side !== 'enemy') return `${label}.side is invalid`;
  for (const field of ['king', 'rook', 'kingTo', 'rookTo']) {
    const cell = action[field];
    if (!cell || typeof cell !== 'object' || Array.isArray(cell) || !isFiniteInteger(cell.x) || !isFiniteInteger(cell.y)) {
      return `${label}.${field} is invalid`;
    }
  }
  return null;
}

/** Structural check for an ADR-0072 chess-draws action (50-move rule / threefold repetition flags). */
function validateWorkspaceChessDrawsAction(action, label, triggerKind) {
  if (triggerKind !== 'setup') return `${label}.kind chess-draws requires setup trigger`;
  if (action.fiftyMove !== undefined && typeof action.fiftyMove !== 'boolean') return `${label}.fiftyMove is invalid`;
  if (action.threefold !== undefined && typeof action.threefold !== 'boolean') return `${label}.threefold is invalid`;
  return null;
}

function validateWorkspaceEvents(events, key) {
  if (!Array.isArray(events)) return `levels.${key}.events is invalid`;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const label = `levels.${key}.events[${i}]`;
    if (!event || typeof event !== 'object' || Array.isArray(event)) return `${label} must be an event object`;
    if (event.id !== undefined && typeof event.id !== 'string') return `${label}.id is invalid`;
    if (event.name !== undefined && typeof event.name !== 'string') return `${label}.name is invalid`;
    if (event.kind !== undefined) {
      if (event.kind !== 'spawn' && event.kind !== 'pawn-promotion') return `${label}.kind is invalid`;
      const triggerErr = validateWorkspaceEventTrigger(event.trigger, `${label}.trigger`);
      if (triggerErr) return triggerErr;
      if (event.kind === 'spawn') {
        const spawnErr = validateWorkspaceSpawnAction(event, label, event.trigger && event.trigger.kind);
        if (spawnErr) return spawnErr;
      } else {
        if (event.trigger.kind !== 'unit-enters-zone') return `${label}.trigger.kind is invalid`;
        if (event.choices !== undefined) {
          if (!Array.isArray(event.choices) || event.choices.length === 0 || event.choices.some((choice) => !WORKSPACE_PROMOTION_PIECES.has(choice))) return `${label}.choices is invalid`;
        }
        if (event.defaultPromotion !== undefined && !WORKSPACE_PROMOTION_PIECES.has(event.defaultPromotion)) return `${label}.defaultPromotion is invalid`;
        if (event.defaultPromotion !== undefined && Array.isArray(event.choices) && !event.choices.includes(event.defaultPromotion)) return `${label}.defaultPromotion is invalid`;
      }
      continue;
    }
    const triggerErr = validateWorkspaceEventTrigger(event.trigger, `${label}.trigger`);
    if (triggerErr) return triggerErr;
    if (!Array.isArray(event.do) || event.do.length === 0) return `${label}.do is invalid`;
    for (let j = 0; j < event.do.length; j += 1) {
      const action = event.do[j];
      const actionLabel = `${label}.do[${j}]`;
      if (!action || typeof action !== 'object' || Array.isArray(action)) return `${actionLabel} must be an action object`;
      if (action.kind === 'spawn') {
        const spawnErr = validateWorkspaceSpawnAction(action, actionLabel, event.trigger.kind);
        if (spawnErr) return spawnErr;
      } else if (action.kind === 'promote') {
        const promoteErr = validateWorkspacePromoteAction(action, actionLabel, event.trigger.kind);
        if (promoteErr) return promoteErr;
      } else if (action.kind === 'castle') {
        const castleErr = validateWorkspaceCastleAction(action, actionLabel, event.trigger.kind);
        if (castleErr) return castleErr;
      } else if (action.kind === 'chess-draws') {
        const drawsErr = validateWorkspaceChessDrawsAction(action, actionLabel, event.trigger.kind);
        if (drawsErr) return drawsErr;
      } else {
        return `${actionLabel}.kind is invalid`;
      }
    }
  }
  return null;
}
// Board floor dropped to 1×1 (ADR-0050): the old 4×4 clamp was an arbitrary guardrail with
// no technical basis, and tiny boards are legitimate for several modes. Mirrors the frontend
// BOARD_COLS / BOARD_ROWS consts in core/level.ts.
const WORKSPACE_BOARD_COLS = { min: 1, max: 48 };
const WORKSPACE_BOARD_ROWS = { min: 1, max: 48 };
const WORKSPACE_LEVEL_FORMAT_VERSION = serverRender?.LEVEL_FORMAT_VERSION ?? 2;

function isFiniteInteger(value) {
  return Number.isInteger(value) && Number.isFinite(value);
}

function validateWorkspaceCoord(cell, cols, rows) {
  return cell && isFiniteInteger(cell.x) && isFiniteInteger(cell.y)
    && cell.x >= 0 && cell.x < cols && cell.y >= 0 && cell.y < rows;
}

function validateWorkspaceLevel(level, key) {
  if (!level || typeof level !== 'object') return `levels.${key} must be an object`;
  if (level.formatVersion !== WORKSPACE_LEVEL_FORMAT_VERSION) {
    return `levels.${key}.formatVersion must be ${WORKSPACE_LEVEL_FORMAT_VERSION}`;
  }
  if (typeof level.id !== 'string' || !level.id) return `levels.${key}.id is required`;
  if (level.id !== key) return `levels.${key}.id must match its workspace key`;
  if (typeof level.name !== 'string') return `levels.${key}.name is required`;
  if (level.notes !== undefined && typeof level.notes !== 'string') return `levels.${key}.notes must be a string`;
  if (!WORKSPACE_OBJECTIVES.has(level.objective)) return `levels.${key}.objective is invalid`;
  const board = level.board;
  if (!board || !isFiniteInteger(board.cols) || !isFiniteInteger(board.rows)) return `levels.${key}.board is invalid`;
  if (board.cols < WORKSPACE_BOARD_COLS.min || board.cols > WORKSPACE_BOARD_COLS.max) return `levels.${key}.board.cols is out of range`;
  if (board.rows < WORKSPACE_BOARD_ROWS.min || board.rows > WORKSPACE_BOARD_ROWS.max) return `levels.${key}.board.rows is out of range`;
  if (board.heightLevels !== undefined && (!isFiniteInteger(board.heightLevels) || board.heightLevels < 1)) return `levels.${key}.board.heightLevels is invalid`;

  // ADR-0050 placement-axis fields — optional (absent ⇒ 'fixed', same back-compat pattern as
  // boardCode / layers.props: legacy bodies omit them and stay valid). These are STRUCTURAL
  // checks only (shape / enum / range), mirroring the frontend's validateLevel. The gameplay
  // rules (roster vs spawn-zone capacity, exactly-one-King, non-empty sides — validatePlayability
  // P1–P4) deliberately do NOT run here: this PUT carries the WHOLE workspace, so one legacy
  // unplayable level would brick saving every other level; the editor's per-level save gate is
  // the trust boundary for playability (ADR-0050 "Enforcement: the editor gates saves per level;
  // the backend stays structural").
  if (level.placement !== undefined && level.placement !== 'fixed' && level.placement !== 'random') {
    return `levels.${key}.placement is invalid`;
  }
  if (level.surviveTurns !== undefined && (!isFiniteInteger(level.surviveTurns) || level.surviveTurns < 1)) {
    return `levels.${key}.surviveTurns is invalid`;
  }
  if (level.timeControl !== undefined) {
    const tc = level.timeControl;
    if (!tc || typeof tc !== 'object' || Array.isArray(tc)
      || !isFiniteInteger(tc.initialSeconds) || tc.initialSeconds < 1
      || !isFiniteInteger(tc.incrementSeconds) || tc.incrementSeconds < 0) {
      return `levels.${key}.timeControl is invalid`;
    }
  }
  if (level.battle !== undefined) {
    const battle = level.battle;
    if (!battle || typeof battle !== 'object' || Array.isArray(battle)
      || (battle.loot !== undefined && typeof battle.loot !== 'boolean')) {
      return `levels.${key}.battle is invalid`;
    }
  }
  // ADR-0064 authored victory — optional, structural mirror of the frontend's validateLevel
  // (shape/enum only; the win/lose-non-empty gate stays editor-side, like P1–P6). Absent ⇒ the
  // objective preset defines win/lose; legacy bodies omit it and stay valid.
  if (level.victory !== undefined) {
    const victoryErr = validateWorkspaceVictory(level.victory, key);
    if (victoryErr) return victoryErr;
  }
  if (level.events !== undefined) {
    const eventsErr = validateWorkspaceEvents(level.events, key);
    if (eventsErr) return eventsErr;
  }
  if (level.roster !== undefined) {
    if (!level.roster || typeof level.roster !== 'object' || Array.isArray(level.roster)) {
      return `levels.${key}.roster is invalid`;
    }
    for (const side of ['player', 'enemy']) {
      const counts = level.roster[side];
      if (!counts || typeof counts !== 'object' || Array.isArray(counts)) {
        return `levels.${key}.roster.${side} is invalid`;
      }
      for (const [type, count] of Object.entries(counts)) {
        // Playable piece types only (no rocks) and non-negative integer counts.
        if (!WORKSPACE_ROSTER_PIECES.has(type) || !isFiniteInteger(count) || count < 0) {
          return `levels.${key}.roster.${side} contains an invalid piece count`;
        }
      }
    }
  }

  const layers = level.layers;
  if (!layers || typeof layers !== 'object') return `levels.${key}.layers is required`;
  for (const layerName of ['terrain', 'decals', 'zones', 'units']) {
    if (!Array.isArray(layers[layerName])) return `levels.${key}.layers.${layerName} must be an array`;
  }
  for (const tile of layers.terrain) {
    if (!validateWorkspaceCoord(tile, board.cols, board.rows) || !WORKSPACE_TERRAIN.has(tile.terrain)) return `levels.${key}.layers.terrain contains an invalid tile`;
    if (tile.elevation !== undefined && !isFiniteInteger(tile.elevation)) return `levels.${key}.layers.terrain contains an invalid elevation`;
  }
  for (const unit of layers.units) {
    if (!validateWorkspaceCoord(unit, board.cols, board.rows) || !WORKSPACE_PIECES.has(unit.type) || !WORKSPACE_SIDES.has(unit.side)) return `levels.${key}.layers.units contains an invalid unit`;
  }
  for (const zone of layers.zones) {
    if (!zone || typeof zone.id !== 'string' || !WORKSPACE_ZONE_TYPES.has(zone.type) || !Array.isArray(zone.tiles)) return `levels.${key}.layers.zones contains an invalid zone`;
    // ADR-0367: the piece types a Player Deployment zone bars from automatic placement.
    if (zone.excludedPieceTypes !== undefined) {
      if (!Array.isArray(zone.excludedPieceTypes) || zone.excludedPieceTypes.some((type) => type !== 'king')) {
        return `levels.${key}.layers.zones contains an invalid excludedPieceTypes`;
      }
    }
    for (const tile of zone.tiles) {
      if (!Array.isArray(tile) || tile.length !== 2 || !isFiniteInteger(tile[0]) || !isFiniteInteger(tile[1]) || tile[0] < 0 || tile[0] >= board.cols || tile[1] < 0 || tile[1] >= board.rows) {
        return `levels.${key}.layers.zones contains an out-of-bounds tile`;
      }
    }
  }
  // Props are an OPTIONAL layer (like the frontend's Level: legacy bodies omit it, so it is NOT
  // in the required-array loop above). Historically the backend never checked it at all while the
  // frontend's validateLevel did — a known drift (ADR-0050 "props already drifted"). Mirror the
  // frontend structural check WHEN PRESENT: an array of { string propId, integer x,y in bounds }.
  // An off-board anchor would otherwise stamp off-board rock colliders at game-build time.
  if (layers.props !== undefined) {
    if (!Array.isArray(layers.props)) return `levels.${key}.layers.props must be an array`;
    for (const prop of layers.props) {
      if (!prop || typeof prop.propId !== 'string' || !isFiniteInteger(prop.x) || !isFiniteInteger(prop.y)
        || prop.x < 0 || prop.x >= board.cols || prop.y < 0 || prop.y >= board.rows) {
        return `levels.${key}.layers.props contains an invalid prop`;
      }
    }
  }
  return null;
}

function validateWorkspaceBody(raw) {
  if (!Array.isArray(raw.campaigns)
    || (raw.wars !== undefined && !Array.isArray(raw.wars))
    || !raw.levels || typeof raw.levels !== 'object' || Array.isArray(raw.levels)) {
    return 'invalid_workspace';
  }
  const wars = raw.wars ?? [];
  const levelEntries = Object.entries(raw.levels);
  if (levelEntries.length > 200) return 'workspace_too_large';
  for (const [key, level] of levelEntries) {
    const levelError = validateWorkspaceLevel(level, key);
    if (levelError) return levelError;
  }
  if (raw.campaigns.length > 100) return 'workspace_too_large';
  const campaignIds = new Set();
  const levelMembership = new Map();
  for (const campaign of raw.campaigns) {
    if (!campaign || typeof campaign !== 'object') return 'campaigns must contain objects';
    if (campaign.formatVersion !== 1) return `campaigns.${campaign.id || '?'} formatVersion must be 1`;
    if (typeof campaign.id !== 'string' || !campaign.id) return 'campaign id is required';
    if (campaignIds.has(campaign.id)) return `duplicate campaign id ${campaign.id}`;
    campaignIds.add(campaign.id);
    if (typeof campaign.name !== 'string') return `campaigns.${campaign.id}.name is required`;
    if (!Array.isArray(campaign.levels)) return `campaigns.${campaign.id}.levels must be an array`;
    for (const ref of campaign.levels) {
      if (!ref || typeof ref !== 'object' || typeof ref.levelId !== 'string' || !raw.levels[ref.levelId]) return `campaigns.${campaign.id}.levels contains a missing level reference`;
      if (!isFiniteInteger(ref.ordinal) || ref.ordinal < 0) return `campaigns.${campaign.id}.levels contains an invalid ordinal`;
      if (ref.objective !== undefined && !WORKSPACE_OBJECTIVES.has(ref.objective)) return `campaigns.${campaign.id}.levels contains an invalid objective`;
      if (ref.stars !== undefined && (!isFiniteInteger(ref.stars) || ref.stars < 0 || ref.stars > 3)) return `campaigns.${campaign.id}.levels contains invalid stars`;
      const owner = levelMembership.get(ref.levelId);
      if (owner) return `level ${ref.levelId} belongs to both ${owner} and campaign ${campaign.id}`;
      levelMembership.set(ref.levelId, `campaign ${campaign.id}`);
    }
  }
  if (wars.length > 100) return 'workspace_too_large';
  const warIds = new Set();
  for (const war of wars) {
    if (!war || typeof war !== 'object') return 'wars must contain objects';
    if (war.formatVersion !== 1) return `wars.${war.id || '?'} formatVersion must be 1`;
    if (typeof war.id !== 'string' || !war.id) return 'war id is required';
    if (warIds.has(war.id)) return `duplicate war id ${war.id}`;
    warIds.add(war.id);
    if (typeof war.name !== 'string') return `wars.${war.id}.name is required`;
    if (typeof war.description !== 'string') return `wars.${war.id}.description is required`;
    if (war.eligibleForRun !== undefined && typeof war.eligibleForRun !== 'boolean') {
      return `wars.${war.id}.eligibleForRun must be a boolean`;
    }
    if (!Array.isArray(war.battles)) return `wars.${war.id}.battles must be an array`;
    const localRefs = new Set();
    const localOrdinals = new Set();
    for (const ref of war.battles) {
      if (!ref || typeof ref !== 'object' || typeof ref.levelId !== 'string' || !raw.levels[ref.levelId]) {
        return `wars.${war.id}.battles contains a missing level reference`;
      }
      if (!isFiniteInteger(ref.ordinal) || ref.ordinal < 0) return `wars.${war.id}.battles contains an invalid ordinal`;
      if (localRefs.has(ref.levelId)) return `wars.${war.id}.battles contains duplicate level ${ref.levelId}`;
      if (localOrdinals.has(ref.ordinal)) return `wars.${war.id}.battles contains duplicate ordinal ${ref.ordinal}`;
      localRefs.add(ref.levelId);
      localOrdinals.add(ref.ordinal);
      const owner = levelMembership.get(ref.levelId);
      if (owner) return `level ${ref.levelId} belongs to both ${owner} and war ${war.id}`;
      levelMembership.set(ref.levelId, `war ${war.id}`);
    }
    if ([...localOrdinals].some((ordinal) => ordinal >= war.battles.length)) {
      return `wars.${war.id}.battles ordinals must be contiguous from zero`;
    }
    if (war.eligibleForRun === true) {
      if (war.battles.length === 0) return `wars.${war.id} is eligible for Run but has no battles`;
      for (const ref of war.battles) {
        const level = raw.levels[ref.levelId];
        const zones = level && level.layers && Array.isArray(level.layers.zones) ? level.layers.zones : [];
        const blocked = new Set([
          ...(level.layers.terrain || [])
            .filter((cell) => cell.terrain === 'cliff' || cell.terrain === 'rock' || cell.terrain === 'void')
            .map((cell) => `${cell.x},${cell.y}`),
          ...(level.layers.units || []).map((unit) => `${unit.x},${unit.y}`),
        ]);
        const edgeSquare = zones
          .filter((zone) => zone.type === 'player-spawn')
          .flatMap((zone) => zone.tiles)
          .some(([x, y]) => (
            (x === 0 || y === 0 || x === level.board.cols - 1 || y === level.board.rows - 1)
            && !blocked.has(`${x},${y}`)
          ));
        if (!edgeSquare) return `wars.${war.id} battle ${ref.levelId} needs a usable player placement-zone square on the board edge`;
      }
    }
  }
  return null;
}

async function dbListLevels(ownerEmail) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT id, name, cols, rows, updated_at FROM levels WHERE owner_email = $1 ORDER BY updated_at DESC',
    [ownerEmail],
  );
  return rows;
}

async function dbGetLevel(ownerEmail, id) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT body, revision, updated_at FROM levels WHERE owner_email = $1 AND id = $2',
    [ownerEmail, id],
  );
  return rows[0] || null;
}

async function dbUpsertLevel(ownerEmail, id, body) {
  await ensureDbReady();
  const board = body.board || {};
  const { rows } = await pool.query(
    `INSERT INTO levels (owner_email, id, name, cols, rows, revision, body)
       VALUES ($1, $2, $3, $4, $5, 1, $6::jsonb)
     ON CONFLICT (owner_email, id) DO UPDATE SET
       name = EXCLUDED.name,
       cols = EXCLUDED.cols,
       rows = EXCLUDED.rows,
       revision = levels.revision + 1,
       body = EXCLUDED.body,
       updated_at = now()
     RETURNING revision, updated_at`,
    [ownerEmail, id, body.name ?? null, board.cols ?? null, board.rows ?? null, JSON.stringify(body)],
  );
  return rows[0];
}

app.get('/api/levels', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    res.status(200).json({ levels: await dbListLevels(user.email) });
  } catch (error) {
    dbUnavailable(res, 'level list failed', error, 'level_store_unavailable');
  }
});

app.get('/api/levels/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const id = levelStoreId(req.params.id);
  if (!id) { res.status(400).json({ error: 'invalid_level_id' }); return; }
  try {
    const doc = await dbGetLevel(user.email, id);
    if (!doc) { res.status(404).json({ error: 'level_not_found' }); return; }
    res.status(200).json({ level: doc.body, revision: doc.revision, updated_at: doc.updated_at });
  } catch (error) {
    dbUnavailable(res, 'level read failed', error, 'level_store_unavailable');
  }
});

app.put('/api/levels/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const id = levelStoreId(req.params.id);
  if (!id) { res.status(400).json({ error: 'invalid_level_id' }); return; }
  const raw = req.body && typeof req.body === 'object' ? req.body : {};
  if (!isLevelBody(raw.level)) { res.status(400).json({ error: 'invalid_level_body' }); return; }
  try {
    const result = await dbUpsertLevel(user.email, id, { ...raw.level, id });
    res.status(200).json({ ok: true, id, revision: result.revision, updated_at: result.updated_at });
  } catch (error) {
    dbUnavailable(res, 'level write failed', error, 'level_store_unavailable');
  }
});

// --- Durable Level editor documents ---------------------------------------
// One private, non-expiring working copy per (account, workspace, level). An
// opaque global document id is the address. Copying that address has no backend
// effect; only these explicit editor persistence calls mutate state (ADR-0068).
const USER_EDITOR_WORKSPACE_ID = 'campaign';
const EDITOR_DOCUMENT_ID_PATTERN = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|legacy-[abcdefghijkmnpqrstuvwxyz23456789]{8,24})$/i;
const EDITOR_EDIT_SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EDITOR_DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EDITOR_SESSION_KEY_PATTERN = /^[0-9a-f]{64}$/i;
const EDITOR_SESSION_LEASE_SECONDS = 60;
const EDITOR_DOCUMENT_COLUMNS = 'document_id, owner_email, workspace_kind, workspace_id, level_id, body, revision, saved_revision, baseline_hash, edit_generation, created_at, updated_at';
const EDITOR_DOCUMENT_HISTORY_RECENT_LIMIT = 200;
const EDITOR_DOCUMENT_HISTORY_PAGE_LIMIT = 100;
const EDITOR_EDIT_SESSION_COLUMNS = `session_id, document_id, owner_email, actor_name, device_hash, session_key_hash,
  client_label, state, edit_generation, draft_body, document_revision, opened_at,
  last_seen_at, last_edit_at, body_checkpoint_at, lease_expires_at, displaced_at,
  displaced_by_session_id`;
const EDITOR_RECOVERY_COLUMNS = `recovery_id, document_id, source_session_id,
  displaced_by_session_id, owner_email, actor_name, source_client_label, body, document_revision,
  edit_generation, capture_source, body_checkpoint_at, reason, created_at, resolved_at`;
const BACKGROUND_VERSION_COLUMNS = `v.id, v.document_id, v.owner_email, v.level_id, v.kind, v.label,
  v.parent_version_id, v.source_background_version_id, v.blob_sha256, v.width, v.height,
  v.world_bounds, v.operation, v.provenance, v.status, v.row_revision,
  v.created_by_email, v.created_by_name, v.created_at, v.updated_at, v.updated_by,
  v.archived_at, v.archived_by, v.published_at, v.published_by,
  b.blob_key, b.media_type, b.byte_length, b.published_at AS blob_published_at,
  (SELECT jsonb_build_object(
      'legacy_environment_geometry_schema', binding.legacy_environment_geometry_schema,
      'legacy_environment_geometry_sha256', binding.legacy_environment_geometry_sha256,
      'environment_geometry_schema', binding.environment_geometry_schema,
      'environment_geometry_sha256', binding.environment_geometry_sha256,
      'bound_at', binding.bound_at
    )
     FROM predrawn_background_geometry_bindings binding
    WHERE binding.version_id = v.id) AS environment_geometry_binding,
  (SELECT jsonb_build_object(
      'legacy_operation_kind', binding.legacy_operation_kind,
      'legacy_operation_sha256', binding.legacy_operation_sha256,
      'coordinate_basis', binding.coordinate_basis,
      'viewing_pane', binding.viewing_pane,
      'bound_at', binding.bound_at
    )
     FROM predrawn_background_raw_contract_bindings binding
    WHERE binding.version_id = v.id) AS raw_contract_binding,
  EXISTS (
    SELECT 1
      FROM predrawn_generation_attempts source_attempt
     WHERE source_attempt.document_id = v.document_id
       AND source_attempt.owner_email = v.owner_email
       AND source_attempt.level_id = v.level_id
       AND source_attempt.generated_version_id = v.id
  ) AS pipeline_source_retained`;
const GENERATION_ATTEMPT_COLUMNS = `attempt.id, attempt.document_id, attempt.owner_email,
  attempt.level_id, attempt.label, attempt.origin, attempt.source_version_id,
  attempt.source_attempt_id,
  attempt.source_request,
  attempt.generated_version_id, attempt.warped_version_id, attempt.occlusion_version_id,
  attempt.move_highlight_profile, attempt.move_highlight_profile_sha256,
  attempt.move_highlight_profile_warped_version_id,
  attempt.status, attempt.row_revision, attempt.processing_revision,
  attempt.created_by_email, attempt.created_by_name,
  attempt.created_at, attempt.updated_at, attempt.updated_by,
  attempt.archived_at, attempt.archived_by`;
const BACKGROUND_VERSION_DOCUMENT_ROW_LIMIT = 256;
const BACKGROUND_VERSION_OWNER_BLOB_BYTE_LIMIT = 1024n * 1024n * 1024n;
const GENERATION_ATTEMPT_DOCUMENT_ROW_LIMIT = 128;

function editorDocumentId(raw) {
  const id = String(raw || '').trim();
  return EDITOR_DOCUMENT_ID_PATTERN.test(id) ? id : '';
}

function editorDocumentWorkspace(raw) {
  const source = isObjectRecord(raw) ? raw : {};
  const nested = isObjectRecord(source.workspace) ? source.workspace : {};
  const kind = String(source.workspace_kind ?? nested.kind ?? 'user').trim().toLowerCase();
  if (kind === 'user') return { kind, id: USER_EDITOR_WORKSPACE_ID };
  if (kind !== 'official') return { error: 'invalid_editor_workspace' };
  const id = officialCampaignsRowId(source.workspace_id ?? nested.id);
  return id ? { kind, id } : { error: 'invalid_official_campaign_id' };
}

function editorDocumentRevision(raw) {
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 1 ? raw : null;
}

function editorEditGeneration(raw) {
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
}

function editorEditSessionId(raw) {
  const id = String(raw || '').trim();
  return EDITOR_EDIT_SESSION_ID_PATTERN.test(id) ? id.toLowerCase() : '';
}

function editorRecoveryIds(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const recoveryIds = raw.map((value) => editorEditSessionId(value));
  if (recoveryIds.some((recoveryId) => !recoveryId)) return null;
  if (new Set(recoveryIds).size !== recoveryIds.length) return null;
  return recoveryIds;
}

function editorDeviceId(raw) {
  const id = String(raw || '').trim();
  return EDITOR_DEVICE_ID_PATTERN.test(id) ? id : '';
}

function editorDeviceHash(deviceId) {
  return crypto.createHash('sha256').update(`level-editor-device\0${deviceId}`).digest('hex');
}

function editorSessionKey(raw) {
  const key = String(raw || '').trim();
  return EDITOR_SESSION_KEY_PATTERN.test(key) ? key : '';
}

function editorSessionKeyHash(sessionKey) {
  return crypto.createHash('sha256').update(`level-editor-session\0${sessionKey}`).digest('hex');
}

function editorDocumentLevel(raw, levelId, { rewriteId = false } = {}) {
  if (!isObjectRecord(raw)) return { error: 'invalid_level_body' };
  if (!rewriteId && raw.id !== levelId) {
    return { error: 'invalid_level_body', details: `levels.${levelId}.id must match its workspace key` };
  }
  const level = { ...raw, id: levelId };
  const details = validateWorkspaceLevel(level, levelId);
  return details ? { error: 'invalid_level_body', details } : { level };
}

function publicEditorDocument(row) {
  const revision = Number(row && row.revision) || 0;
  const savedRevision = Number(row && row.saved_revision) || 0;
  const hasSavedBaseline = Boolean(row && row.baseline_hash);
  return {
    document_id: row.document_id,
    level_id: row.level_id,
    workspace_kind: row.workspace_kind,
    workspace_id: row.workspace_id,
    level: isObjectRecord(row.body) ? row.body : {},
    revision,
    saved_revision: savedRevision,
    dirty: revision !== savedRevision,
    has_saved_baseline: hasSavedBaseline,
    never_saved: savedRevision === 0,
    baseline_conflict: Boolean(row && row.baseline_conflict),
    edit_generation: Number(row && row.edit_generation) || 0,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function publicEditorDocumentSummary(row) {
  const revision = Number(row && row.revision) || 0;
  const savedRevision = Number(row && row.saved_revision) || 0;
  const hasSavedBaseline = Boolean(row && row.baseline_hash);
  return {
    document_id: row.document_id,
    level_id: row.level_id,
    workspace_kind: row.workspace_kind,
    workspace_id: row.workspace_id,
    name: typeof row.name === 'string' ? row.name : '',
    revision,
    saved_revision: savedRevision,
    dirty: revision !== savedRevision,
    has_saved_baseline: hasSavedBaseline,
    never_saved: savedRevision === 0,
    edit_generation: Number(row && row.edit_generation) || 0,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function publicEditorDocumentRevision(row) {
  return {
    revision: Number(row && row.revision) || 0,
    saved_revision: Number(row && row.saved_revision) || 0,
    name: typeof row.name === 'string' ? row.name : '',
    reason: typeof row.reason === 'string' ? row.reason : 'autosave',
    restored_from_revision: row && row.restored_from_revision !== null
      ? Number(row.restored_from_revision)
      : null,
    body_hash: typeof row.body_hash === 'string' ? row.body_hash : '',
    body_bytes: Number(row && row.body_bytes) || 0,
    created_at: row && row.created_at ? row.created_at : null,
  };
}

function publicEditorEditSession(row) {
  if (!row) return null;
  return {
    session_id: row.session_id,
    document_id: row.document_id,
    state: row.state,
    edit_generation: Number(row.edit_generation) || 0,
    name: row.actor_name,
    email: row.owner_email,
    client_label: row.client_label || '',
    opened_at: row.opened_at ?? null,
    last_seen_at: row.last_seen_at ?? null,
    last_edit_at: row.last_edit_at ?? null,
    lease_expires_at: row.lease_expires_at ?? null,
  };
}

function publicEditorRecovery(row) {
  if (!row) return null;
  return {
    recovery_id: row.recovery_id,
    document_id: row.document_id,
    source_session_id: row.source_session_id,
    displaced_by_session_id: row.displaced_by_session_id ?? null,
    source_editor: {
      session_id: row.source_session_id,
      name: row.actor_name,
      email: row.owner_email,
      client_label: row.source_client_label || '',
    },
    level: isObjectRecord(row.body) ? row.body : {},
    document_revision: Number(row.document_revision) || 0,
    edit_generation: Number(row.edit_generation) || 0,
    capture_source: row.capture_source,
    body_checkpoint_at: row.body_checkpoint_at ?? null,
    reason: row.reason,
    created_at: row.created_at ?? null,
    resolved_at: row.resolved_at ?? null,
  };
}

function publicEditorAttribution(session, requesterSession, requesterDeviceHash) {
  return {
    session_id: session.session_id,
    name: session.actor_name,
    email: session.owner_email,
    client_label: session.client_label || '',
    opened_at: session.opened_at ?? null,
    last_seen_at: session.last_seen_at ?? null,
    last_edit_at: session.last_edit_at ?? null,
    relationship: session.session_id === requesterSession?.session_id
      ? 'this_tab'
      : requesterDeviceHash && session.device_hash === requesterDeviceHash
        ? 'same_device'
        : 'other_device',
  };
}

function publicEditorPresence(documentRow, activeSession, requesterSession, requesterDeviceHash, lastEditorSession = null) {
  const active = activeSession
    ? publicEditorAttribution(activeSession, requesterSession, requesterDeviceHash)
    : null;
  const lastEditor = !activeSession && lastEditorSession ? {
    ...publicEditorAttribution(lastEditorSession, requesterSession, requesterDeviceHash),
    state: lastEditorSession.state,
    live: false,
  } : null;
  return {
    document_id: documentRow.document_id,
    edit_generation: Number(documentRow.edit_generation) || 0,
    active_editor: active,
    // This is durable attribution for the most recent session that actually held
    // authority, not a presence or lease claim. Keep it structurally separate so
    // clients cannot accidentally present a terminal session as a live writer.
    last_editor: lastEditor,
    can_take_over: false,
    // Session-bearing callers lock the document through dbLockEditorDocument,
    // which captures this timestamp from PostgreSQL's authority clock. Keep the
    // defensive fallback for error serialization of any legacy/non-transaction row.
    server_time: documentRow.editor_server_time instanceof Date
      ? documentRow.editor_server_time.toISOString()
      : documentRow.editor_server_time || new Date().toISOString(),
  };
}

function editorDocumentError(statusCode, code, row = null, details = null, context = {}) {
  const error = new Error(code);
  error.statusCode = statusCode;
  error.responseCode = code;
  error.row = row;
  error.details = details;
  error.session = context.session || null;
  error.presence = context.presence || null;
  return error;
}

function respondEditorDocumentError(res, error, operation) {
  if (error && error.statusCode && error.responseCode) {
    res.status(error.statusCode).json({
      error: error.responseCode,
      ...(error.details ? { details: error.details } : {}),
      ...(error.row ? { document: publicEditorDocument(error.row) } : {}),
      ...(error.session ? { session: publicEditorEditSession(error.session) } : {}),
      ...(error.presence ? { presence: error.presence } : {}),
    });
    return;
  }
  dbUnavailable(res, `editor document ${operation} failed`, error, 'editor_document_store_unavailable');
}

async function withEditorDocumentTransaction(fn) {
  await ensureDbReady();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    if (error?.commitEditorSessionExpiry) {
      try {
        await client.query('COMMIT');
      } catch (commitError) {
        try { await client.query('ROLLBACK'); } catch { /* preserve commit error */ }
        throw commitError;
      }
      throw error;
    }
    try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    throw error;
  } finally {
    client.release();
  }
}

async function dbRecordEditorDocumentRevision(
  client,
  row,
  reason,
  { restoredFromRevision = null } = {},
) {
  await client.query(
    `INSERT INTO level_working_copy_revisions
       (document_id, revision, body, saved_revision, baseline_hash, reason, restored_from_revision)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
     ON CONFLICT (document_id, revision) DO NOTHING`,
    [
      row.document_id,
      Number(row.revision),
      JSON.stringify(row.body),
      Number(row.saved_revision),
      row.baseline_hash ?? null,
      reason,
      restoredFromRevision,
    ],
  );

  // Keep granular recent recovery plus one checkpoint per UTC day forever.
  // Explicit lifecycle boundaries remain even after they age out of both sets.
  await client.query(
    `WITH ranked AS (
       SELECT revision,
              reason,
              row_number() OVER (ORDER BY revision DESC) AS recent_rank,
              row_number() OVER (
                PARTITION BY (created_at AT TIME ZONE 'UTC')::date
                ORDER BY revision DESC
              ) AS daily_rank
         FROM level_working_copy_revisions
        WHERE document_id = $1
     )
     DELETE FROM level_working_copy_revisions AS history
      USING ranked
      WHERE history.document_id = $1
        AND history.revision = ranked.revision
        AND ranked.recent_rank > $2
        AND ranked.daily_rank > 1
        AND ranked.reason NOT IN (
          'migration', 'resolve', 'create', 'save', 'discard', 'restore',
          'canonical-refresh', 'generation-attempt-archive'
        )`,
    [row.document_id, EDITOR_DOCUMENT_HISTORY_RECENT_LIMIT],
  );
}

async function dbListEditorDocumentRevisions(ownerEmail, documentId, {
  limit = EDITOR_DOCUMENT_HISTORY_PAGE_LIMIT,
  beforeRevision = null,
} = {}) {
  await ensureDbReady();
  const { rows } = await pool.query(
    `SELECT history.revision,
            history.saved_revision,
            history.body->>'name' AS name,
            history.reason,
            history.restored_from_revision,
            md5(history.body::text) AS body_hash,
            octet_length(history.body::text) AS body_bytes,
            history.created_at
       FROM level_working_copy_revisions AS history
       JOIN level_working_copies AS document
         ON document.document_id = history.document_id
      WHERE document.owner_email = $1
        AND history.document_id = $2
        AND ($3::bigint IS NULL OR history.revision < $3)
      ORDER BY history.revision DESC
      LIMIT $4`,
    [ownerEmail, documentId, beforeRevision, limit + 1],
  );
  return rows;
}

async function dbRestoreEditorDocumentRevision(
  ownerEmail,
  documentId,
  expectedRevision,
  targetRevision,
  sessionId,
  editGeneration,
  sessionKeyHash,
) {
  return withEditorDocumentTransaction(async (client) => {
    const current = await dbLockEditorDocument(client, ownerEmail, documentId);
    if (!current) throw editorDocumentError(404, 'editor_document_not_found');
    const session = await assertActiveEditorEditSession(
      client,
      current,
      sessionId,
      editGeneration,
      sessionKeyHash,
    );
    assertEditorDocumentRevision(current, expectedRevision, currentEditorSessionContext(current, session));
    const targetResult = await client.query(
      `SELECT body
         FROM level_working_copy_revisions
        WHERE document_id = $1 AND revision = $2`,
      [documentId, targetRevision],
    );
    const target = targetResult.rows[0];
    if (!target) throw editorDocumentError(404, 'editor_document_revision_not_found');
    const parsed = editorDocumentLevel(target.body, current.level_id);
    if (parsed.error) throw editorDocumentError(409, 'editor_document_revision_invalid', current, parsed.details);
    const { rows } = await client.query(
      `UPDATE level_working_copies
          SET body = $3::jsonb,
              revision = revision + 1,
              saved_revision = CASE
                WHEN md5(($3::jsonb)::text) = baseline_hash THEN revision + 1
                ELSE saved_revision
              END,
              updated_at = now()
        WHERE owner_email = $1 AND document_id = $2
        RETURNING ${EDITOR_DOCUMENT_COLUMNS}`,
      [ownerEmail, documentId, JSON.stringify(parsed.level)],
    );
    const restored = await dbAnnotateEditorDocumentBaseline(rows[0], client);
    await dbRecordEditorDocumentRevision(client, restored, 'restore', {
      restoredFromRevision: targetRevision,
    });
    await dbTouchEditorSessionAfterWrite(
      client,
      session,
      restored,
      'document_history_restored',
      current.revision,
      { restored_from_revision: targetRevision },
    );
    return restored;
  });
}

async function dbGetEditorDocument(ownerEmail, documentId, client = pool) {
  await ensureDbReady();
  const { rows } = await client.query(
    `SELECT ${EDITOR_DOCUMENT_COLUMNS}
       FROM level_working_copies
      WHERE owner_email = $1 AND document_id = $2`,
    [ownerEmail, documentId],
  );
  return rows[0] || null;
}

async function dbGetEditorDocumentForViewer(viewerEmail, documentId, client = pool) {
  if (!isAdminEmail(viewerEmail)) {
    return dbGetEditorDocument(viewerEmail, documentId, client);
  }
  await ensureDbReady();
  const { rows } = await client.query(
    `SELECT ${EDITOR_DOCUMENT_COLUMNS}
       FROM level_working_copies
      WHERE document_id = $1`,
    [documentId],
  );
  return rows[0] || null;
}

async function dbListEditorDocuments(ownerEmail, {
  includeOfficial = false,
  status = 'all',
  limit = 100,
  offset = 0,
} = {}) {
  await ensureDbReady();
  const { rows } = await pool.query(
    `SELECT document_id, workspace_kind, workspace_id, level_id,
            body->>'name' AS name, revision, saved_revision, baseline_hash, edit_generation, created_at, updated_at
       FROM level_working_copies
      WHERE owner_email = $1
        AND ($2::boolean OR workspace_kind = 'user')
        AND (
          $3::text = 'all' OR
          ($3::text = 'dirty' AND revision <> saved_revision) OR
          ($3::text = 'never-saved' AND baseline_hash IS NULL)
        )
      ORDER BY (revision <> saved_revision) DESC, updated_at DESC, document_id
      LIMIT $4 OFFSET $5`,
    [ownerEmail, includeOfficial, status, limit + 1, offset],
  );
  return rows;
}

async function dbGetEditorDocumentByLevel(ownerEmail, workspace, levelId, client = pool, { lock = false } = {}) {
  await ensureDbReady();
  const { rows } = await client.query(
    `SELECT ${EDITOR_DOCUMENT_COLUMNS}
       FROM level_working_copies
      WHERE owner_email = $1 AND workspace_kind = $2 AND workspace_id = $3 AND level_id = $4
      ${lock ? 'FOR UPDATE' : ''}`,
    [ownerEmail, workspace.kind, workspace.id, levelId],
  );
  return rows[0] || null;
}

async function dbLockEditorDocument(client, ownerEmail, documentId) {
  const { rows } = await client.query(
    `SELECT ${EDITOR_DOCUMENT_COLUMNS}
       FROM level_working_copies
      WHERE owner_email = $1 AND document_id = $2
      FOR UPDATE`,
    [ownerEmail, documentId],
  );
  if (!rows[0]) return null;
  const serverClock = await client.query('SELECT clock_timestamp() AS editor_server_time');
  return { ...rows[0], editor_server_time: serverClock.rows[0].editor_server_time };
}

function assertEditorDocumentRevision(row, expectedRevision, context = {}) {
  if (!row) throw editorDocumentError(404, 'editor_document_not_found');
  if (Number(row.revision) !== expectedRevision) {
    throw editorDocumentError(409, 'editor_document_revision_conflict', row, null, context);
  }
}

function currentEditorSessionContext(documentRow, session) {
  return {
    session,
    presence: publicEditorPresence(documentRow, session, session, session.device_hash),
  };
}

async function dbGetEditorEditSession(client, ownerEmail, documentId, sessionId, { lock = false } = {}) {
  const { rows } = await client.query(
    `SELECT ${EDITOR_EDIT_SESSION_COLUMNS}
       FROM editor_document_edit_sessions
      WHERE owner_email = $1 AND document_id = $2 AND session_id = $3
      ${lock ? 'FOR UPDATE' : ''}`,
    [ownerEmail, documentId, sessionId],
  );
  return rows[0] || null;
}

async function dbGetActiveEditorSession(client, documentId, { lock = false } = {}) {
  // Callers first resolve expiry while holding the document row. Do not apply a
  // second wall-clock predicate here: a lease crossing its deadline between the
  // two statements must remain active for this transaction's decision, or the
  // partial unique index would still see the old `state = 'active'` row while
  // acquisition incorrectly tries to insert another one.
  const { rows } = await client.query(
    `SELECT ${EDITOR_EDIT_SESSION_COLUMNS}
       FROM editor_document_edit_sessions
      WHERE document_id = $1 AND state = 'active'
      ${lock ? 'FOR UPDATE' : ''}`,
    [documentId],
  );
  return rows[0] || null;
}

async function dbGetLastAuthoritativeEditorSession(client, documentId) {
  const { rows } = await client.query(
    `SELECT ${EDITOR_EDIT_SESSION_COLUMNS}
       FROM editor_document_edit_sessions AS candidate
      WHERE candidate.document_id = $1
        AND candidate.state IN ('expired', 'displaced', 'closed')
        AND EXISTS (
          SELECT 1
            FROM editor_document_edit_events AS authority_event
           WHERE authority_event.document_id = candidate.document_id
             AND authority_event.session_id = candidate.session_id
             AND (
               authority_event.action IN ('session_acquired', 'session_takeover')
               OR (
                 authority_event.action = 'session_opened'
                 AND authority_event.details->>'state' = 'active'
               )
             )
        )
      ORDER BY candidate.edit_generation DESC, candidate.session_id DESC
      LIMIT 1`,
    [documentId],
  );
  return rows[0] || null;
}

async function dbPublicEditorPresence(
  client,
  documentRow,
  activeSession,
  requesterSession,
  requesterDeviceHash,
  knownLastEditorSession,
) {
  const lastEditorSession = activeSession
    ? null
    : knownLastEditorSession === undefined
      ? await dbGetLastAuthoritativeEditorSession(client, documentRow.document_id)
      : knownLastEditorSession;
  return publicEditorPresence(
    documentRow,
    activeSession,
    requesterSession,
    requesterDeviceHash,
    lastEditorSession,
  );
}

async function dbGetLatestEditorRecovery(client, documentId, sourceSessionId) {
  const { rows } = await client.query(
    `SELECT ${EDITOR_RECOVERY_COLUMNS}
       FROM editor_document_recoveries
      WHERE document_id = $1 AND source_session_id = $2
      ORDER BY created_at DESC, recovery_id DESC
      LIMIT 1`,
    [documentId, sourceSessionId],
  );
  return rows[0] || null;
}

async function dbRecordEditorEditEvent(client, session, action, details = {}) {
  await client.query(
    `INSERT INTO editor_document_edit_events
       (document_id, session_id, action, actor_email, actor_name, details, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, clock_timestamp())`,
    [session.document_id, session.session_id, action, session.owner_email, session.actor_name, JSON.stringify(details)],
  );
}

async function dbPreserveEditorSessionRecovery(client, session, displacedBySessionId, reason) {
  const { rows } = await client.query(
    `INSERT INTO editor_document_recoveries
       (recovery_id, document_id, source_session_id, displaced_by_session_id,
        owner_email, actor_name, source_client_label, body, document_revision, edit_generation,
        capture_source, body_checkpoint_at, reason, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10,
             'server-acknowledged', $11, $12, clock_timestamp())
     RETURNING ${EDITOR_RECOVERY_COLUMNS}`,
    [
      crypto.randomUUID(),
      session.document_id,
      session.session_id,
      displacedBySessionId || null,
      session.owner_email,
      session.actor_name,
      session.client_label || '',
      JSON.stringify(session.draft_body),
      Number(session.document_revision),
      Number(session.edit_generation),
      session.body_checkpoint_at,
      reason,
    ],
  );
  return rows[0];
}

async function dbExpireEditorSession(client, documentRow) {
  // Page presence is no longer mutation authority. A browser disappearing simply stops
  // heartbeating; it must never manufacture a recovery branch or block another open editor.
  void client;
  void documentRow;
  return null;
}

async function dbEditorSessionState(client, documentRow, requesterSessionId, requesterDeviceHash, { lock = false } = {}) {
  let requesterSession = requesterSessionId
    ? await dbGetEditorEditSession(client, documentRow.owner_email, documentRow.document_id, requesterSessionId, { lock })
    : null;
  // Read-only observation cannot perform authority maintenance. In particular,
  // looking at presence must not expire another writer and create a recovery.
  const expiredAuthority = requesterSession?.state === 'observing'
    ? null
    : await dbExpireEditorSession(client, documentRow);
  if (expiredAuthority && requesterSession) {
    requesterSession = await dbGetEditorEditSession(
      client,
      documentRow.owner_email,
      documentRow.document_id,
      requesterSessionId,
      { lock },
    );
  }
  const activeSession = await dbGetActiveEditorSession(client, documentRow.document_id, { lock });
  const lastEditorSession = activeSession
    ? null
    : expiredAuthority?.session || await dbGetLastAuthoritativeEditorSession(client, documentRow.document_id);
  return {
    requesterSession,
    activeSession,
    lastEditorSession,
    recovery: null,
    presence: publicEditorPresence(
      documentRow,
      activeSession,
      requesterSession,
      requesterDeviceHash,
      lastEditorSession,
    ),
  };
}

async function dbAdvanceEditorGeneration(client, documentRow) {
  const { rows } = await client.query(
    `UPDATE level_working_copies
        SET edit_generation = edit_generation + 1
      WHERE owner_email = $1 AND document_id = $2
      RETURNING ${EDITOR_DOCUMENT_COLUMNS}`,
    [documentRow.owner_email, documentRow.document_id],
  );
  return { ...rows[0], editor_server_time: documentRow.editor_server_time };
}

function editorSessionKeyMatches(session, sessionKeyHash) {
  const stored = typeof session?.session_key_hash === 'string' ? Buffer.from(session.session_key_hash, 'hex') : null;
  const supplied = typeof sessionKeyHash === 'string' ? Buffer.from(sessionKeyHash, 'hex') : null;
  return Boolean(stored && supplied && stored.length === supplied.length && crypto.timingSafeEqual(stored, supplied));
}

function assertEditorSessionKey(session, sessionKeyHash, documentRow = null) {
  if (!editorSessionKeyMatches(session, sessionKeyHash)) {
    throw editorDocumentError(403, 'editor_document_edit_session_key_invalid', documentRow);
  }
}

async function editorObserverOnlyError(client, documentRow, session) {
  const active = await dbGetActiveEditorSession(client, documentRow.document_id, { lock: true });
  return editorDocumentError(
    409,
    'editor_document_session_observe_only',
    documentRow,
    'open this page session with write intent before requesting editing authority',
    {
      session,
      presence: await dbPublicEditorPresence(client, documentRow, active, session, session.device_hash),
      recovery: null,
    },
  );
}

async function dbOpenEditorEditSession(owner, documentId, input) {
  return withEditorDocumentTransaction(async (client) => {
    let documentRow = await dbLockEditorDocument(client, owner.email, documentId);
    if (!documentRow) throw editorDocumentError(404, 'editor_document_not_found');
    const observeOnly = input.intent === 'observe';
    // Observation must not turn a stale lease into a recovery as a side effect.
    const expiredAuthority = observeOnly ? null : await dbExpireEditorSession(client, documentRow);

    const existingResult = await client.query(
      `SELECT ${EDITOR_EDIT_SESSION_COLUMNS}
         FROM editor_document_edit_sessions
        WHERE session_id = $1
        FOR UPDATE`,
      [input.sessionId],
    );
    let session = existingResult.rows[0] || null;
    if (session && (
      session.owner_email !== owner.email
      || session.document_id !== documentId
      || session.device_hash !== input.deviceHash
      || !editorSessionKeyMatches(session, input.sessionKeyHash)
    )) {
      throw editorDocumentError(409, 'editor_document_edit_session_id_conflict');
    }
    if (observeOnly && session && session.state !== 'observing') {
      throw editorDocumentError(409, 'editor_document_edit_session_intent_conflict', documentRow);
    }
    let active = await dbGetActiveEditorSession(client, documentId, { lock: true });
    if (session?.state === 'closed') {
      throw editorDocumentError(409, 'editor_document_session_not_active', documentRow, 'closed session ids cannot be reopened', {
        session,
        presence: await dbPublicEditorPresence(client, documentRow, active, session, input.deviceHash),
      });
    }
    let opened = false;

    if (!session) {
      opened = true;
      const state = observeOnly ? 'observing' : 'waiting';
      const { rows } = await client.query(
        `INSERT INTO editor_document_edit_sessions
           (session_id, document_id, owner_email, actor_name, device_hash, session_key_hash,
            client_label, state, edit_generation, draft_body, document_revision,
            opened_at, last_seen_at, body_checkpoint_at, lease_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11,
                 clock_timestamp(), clock_timestamp(), clock_timestamp(), NULL)
         RETURNING ${EDITOR_EDIT_SESSION_COLUMNS}`,
        [
          input.sessionId,
          documentId,
          owner.email,
          owner.name || owner.email,
          input.deviceHash,
          input.sessionKeyHash,
          input.clientLabel,
          state,
          Number(documentRow.edit_generation),
          JSON.stringify(documentRow.body),
          Number(documentRow.revision),
        ],
      );
      session = rows[0];
    } else if (observeOnly) {
      const { rows } = await client.query(
        `UPDATE editor_document_edit_sessions
            SET actor_name = $2,
                client_label = $3,
                last_seen_at = clock_timestamp()
          WHERE session_id = $1
          RETURNING ${EDITOR_EDIT_SESSION_COLUMNS}`,
        [session.session_id, owner.name || owner.email, input.clientLabel],
      );
      session = rows[0];
    } else if (session.state !== 'active') {
      const { rows } = await client.query(
        `UPDATE editor_document_edit_sessions
            SET actor_name = $2,
                client_label = $3,
                state = 'waiting',
                edit_generation = $4,
                draft_body = $5::jsonb,
                document_revision = $6,
                last_seen_at = clock_timestamp(),
                body_checkpoint_at = clock_timestamp(),
                lease_expires_at = NULL,
                displaced_at = NULL,
                displaced_by_session_id = NULL
          WHERE session_id = $1
          RETURNING ${EDITOR_EDIT_SESSION_COLUMNS}`,
        [session.session_id, owner.name || owner.email, input.clientLabel, Number(documentRow.edit_generation), JSON.stringify(documentRow.body), Number(documentRow.revision)],
      );
      session = rows[0];
    } else {
      const { rows } = await client.query(
        `UPDATE editor_document_edit_sessions
            SET actor_name = $2,
                client_label = $3,
                last_seen_at = clock_timestamp(),
                lease_expires_at = CASE
                  WHEN state = 'active' THEN clock_timestamp() + ($4::text || ' seconds')::interval
                  ELSE lease_expires_at
                END
          WHERE session_id = $1
          RETURNING ${EDITOR_EDIT_SESSION_COLUMNS}`,
        [session.session_id, owner.name || owner.email, input.clientLabel, EDITOR_SESSION_LEASE_SECONDS],
      );
      session = rows[0];
    }

    if (opened) {
      await dbRecordEditorEditEvent(client, session, 'session_opened', {
        state: session.state,
        intent: input.intent,
        edit_generation: Number(session.edit_generation),
        client_label: session.client_label,
      });
    }
    active = await dbGetActiveEditorSession(client, documentId);
    return {
      session,
      presence: publicEditorPresence(documentRow, active, session, input.deviceHash),
      recovery: null,
    };
  });
}

async function dbHeartbeatEditorEditSession(owner, documentId, sessionId, sessionKeyHash) {
  const outcome = await withEditorDocumentTransaction(async (client) => {
    const documentRow = await dbLockEditorDocument(client, owner.email, documentId);
    if (!documentRow) throw editorDocumentError(404, 'editor_document_not_found');
    let session = await dbGetEditorEditSession(client, owner.email, documentId, sessionId, { lock: true });
    if (!session) throw editorDocumentError(404, 'editor_document_edit_session_not_found');
    assertEditorSessionKey(session, sessionKeyHash, documentRow);
    if (session.state === 'observing') throw await editorObserverOnlyError(client, documentRow, session);
    const expiredAuthority = await dbExpireEditorSession(client, documentRow);
    if (expiredAuthority) {
      session = await dbGetEditorEditSession(client, owner.email, documentId, sessionId, { lock: true });
    }

    if (session.state === 'active' && Number(session.edit_generation) === Number(documentRow.edit_generation)) {
      const { rows } = await client.query(
        `UPDATE editor_document_edit_sessions
            SET actor_name = $2,
                last_seen_at = clock_timestamp(),
                lease_expires_at = clock_timestamp() + ($3::text || ' seconds')::interval
          WHERE session_id = $1
          RETURNING ${EDITOR_EDIT_SESSION_COLUMNS}`,
        [session.session_id, owner.name || owner.email, EDITOR_SESSION_LEASE_SECONDS],
      );
      session = rows[0];
    } else if (session.state === 'waiting') {
      const { rows } = await client.query(
        `UPDATE editor_document_edit_sessions
            SET actor_name = $2, last_seen_at = clock_timestamp()
          WHERE session_id = $1
          RETURNING ${EDITOR_EDIT_SESSION_COLUMNS}`,
        [session.session_id, owner.name || owner.email],
      );
      session = rows[0];
    }

    const active = await dbGetActiveEditorSession(client, documentId);
    const presence = publicEditorPresence(
      documentRow,
      active,
      session,
      session.device_hash,
    );
    const errorCode = session.state === 'displaced'
      ? 'editor_document_session_displaced'
      : session.state === 'expired'
        ? 'editor_document_session_expired'
        : session.state !== 'active' && session.state !== 'waiting'
          ? 'editor_document_session_not_active'
          : null;
    return { session, presence, recovery: null, errorCode, documentRow };
  });
  if (outcome.errorCode) {
    throw editorDocumentError(409, outcome.errorCode, outcome.documentRow, null, outcome);
  }
  return {
    session: outcome.session,
    presence: outcome.presence,
    recovery: outcome.recovery,
  };
}

async function dbCloseEditorEditSession(ownerEmail, documentId, sessionId, sessionKeyHash) {
  return withEditorDocumentTransaction(async (client) => {
    const documentRow = await dbLockEditorDocument(client, ownerEmail, documentId);
    if (!documentRow) throw editorDocumentError(404, 'editor_document_not_found');
    let session = await dbGetEditorEditSession(client, ownerEmail, documentId, sessionId, { lock: true });
    if (!session) throw editorDocumentError(404, 'editor_document_edit_session_not_found');
    assertEditorSessionKey(session, sessionKeyHash, documentRow);
    const expiredAuthority = session.state === 'observing'
      ? null
      : await dbExpireEditorSession(client, documentRow);
    if (expiredAuthority) {
      session = await dbGetEditorEditSession(client, ownerEmail, documentId, sessionId, { lock: true });
    }

    const priorState = session.state;
    if (priorState !== 'closed') {
      const { rows } = await client.query(
        `UPDATE editor_document_edit_sessions
            SET state = 'closed',
                last_seen_at = clock_timestamp(),
                lease_expires_at = NULL
          WHERE session_id = $1
          RETURNING ${EDITOR_EDIT_SESSION_COLUMNS}`,
        [session.session_id],
      );
      session = rows[0];
      await dbRecordEditorEditEvent(client, session, 'session_closed', {
        prior_state: priorState,
        edit_generation: Number(session.edit_generation),
      });
    }

    const active = await dbGetActiveEditorSession(client, documentId);
    return {
      session,
      presence: {
        ...await dbPublicEditorPresence(client, documentRow, active, session, session.device_hash),
        can_take_over: false,
      },
      recovery: null,
    };
  });
}

async function dbGetEditorPresence(ownerEmail, documentId, sessionId, deviceHash, sessionKeyHash) {
  return withEditorDocumentTransaction(async (client) => {
    const documentRow = await dbLockEditorDocument(client, ownerEmail, documentId);
    if (!documentRow) throw editorDocumentError(404, 'editor_document_not_found');
    const state = await dbEditorSessionState(client, documentRow, sessionId, deviceHash);
    if (!state.requesterSession) throw editorDocumentError(404, 'editor_document_edit_session_not_found');
    assertEditorSessionKey(state.requesterSession, sessionKeyHash, documentRow);
    if (state.requesterSession.device_hash !== deviceHash) {
      throw editorDocumentError(409, 'editor_document_edit_session_id_conflict', documentRow);
    }
    return {
      ...state,
      presence: state.presence,
    };
  });
}

async function dbTakeOverEditorSession(owner, documentId, sessionId, expectedGeneration, sessionKeyHash) {
  return withEditorDocumentTransaction(async (client) => {
    let documentRow = await dbLockEditorDocument(client, owner.email, documentId);
    if (!documentRow) throw editorDocumentError(404, 'editor_document_not_found');
    let requester = await dbGetEditorEditSession(client, owner.email, documentId, sessionId, { lock: true });
    if (!requester) throw editorDocumentError(404, 'editor_document_edit_session_not_found');
    assertEditorSessionKey(requester, sessionKeyHash, documentRow);
    if (requester.state === 'observing') throw await editorObserverOnlyError(client, documentRow, requester);
    const expiredAuthority = await dbExpireEditorSession(client, documentRow);
    if (expiredAuthority) {
      requester = await dbGetEditorEditSession(client, owner.email, documentId, sessionId, { lock: true });
    }
    let active = await dbGetActiveEditorSession(client, documentId, { lock: true });
    const previousTerminalAuthority = active
      ? null
      : expiredAuthority?.session || await dbGetLastAuthoritativeEditorSession(client, documentId);

    if (requester.state === 'closed') {
      const recovery = expiredAuthority?.recovery
        || await dbGetLatestEditorRecovery(client, documentId, requester.session_id);
      throw editorDocumentError(409, 'editor_document_session_not_active', documentRow, 'closed sessions cannot take over editing', {
        session: requester,
        presence: await dbPublicEditorPresence(client, documentRow, active, requester, requester.device_hash),
        recovery,
      });
    }

    if (Number(documentRow.edit_generation) !== expectedGeneration) {
      const recovery = expiredAuthority?.recovery
        || await dbGetLatestEditorRecovery(client, documentId, requester.session_id);
      const presence = await dbPublicEditorPresence(client, documentRow, active, requester, requester.device_hash);
      throw editorDocumentError(409, 'editor_document_takeover_conflict', documentRow, 'the active editor changed before takeover', { session: requester, presence, recovery });
    }

    if (active && active.session_id === requester.session_id) {
      const { rows } = await client.query(
        `UPDATE editor_document_edit_sessions
            SET last_seen_at = clock_timestamp(), lease_expires_at = clock_timestamp() + ($2::text || ' seconds')::interval
          WHERE session_id = $1
          RETURNING ${EDITOR_EDIT_SESSION_COLUMNS}`,
        [requester.session_id, EDITOR_SESSION_LEASE_SECONDS],
      );
      requester = rows[0];
      return {
        session: requester,
        presence: publicEditorPresence(documentRow, requester, requester, requester.device_hash),
        recovery: await dbGetLatestEditorRecovery(client, documentId, requester.session_id),
      };
    }

    let displacedRecovery = expiredAuthority?.recovery || null;
    if (
      !displacedRecovery
      && !active
      && previousTerminalAuthority?.state === 'expired'
      && Number(previousTerminalAuthority.edit_generation) === expectedGeneration
    ) {
      displacedRecovery = await dbGetLatestEditorRecovery(
        client,
        documentId,
        previousTerminalAuthority.session_id,
      );
    }
    if (active) {
      displacedRecovery = await dbPreserveEditorSessionRecovery(client, active, requester.session_id, 'takeover');
      const displaced = await client.query(
        `UPDATE editor_document_edit_sessions
            SET state = 'displaced',
                displaced_at = clock_timestamp(),
                displaced_by_session_id = $2,
                lease_expires_at = NULL
          WHERE session_id = $1
          RETURNING ${EDITOR_EDIT_SESSION_COLUMNS}`,
        [active.session_id, requester.session_id],
      );
      await dbRecordEditorEditEvent(client, displaced.rows[0], 'session_displaced', {
        displaced_by_session_id: requester.session_id,
        recovery_id: displacedRecovery.recovery_id,
      });
    }

    documentRow = await dbAdvanceEditorGeneration(client, documentRow);
    const activated = await client.query(
      `UPDATE editor_document_edit_sessions
          SET actor_name = $2,
              state = 'active',
              edit_generation = $3,
              draft_body = $4::jsonb,
              document_revision = $5,
              last_seen_at = clock_timestamp(),
              body_checkpoint_at = clock_timestamp(),
              lease_expires_at = clock_timestamp() + ($6::text || ' seconds')::interval,
              displaced_at = NULL,
              displaced_by_session_id = NULL
        WHERE session_id = $1
        RETURNING ${EDITOR_EDIT_SESSION_COLUMNS}`,
      [requester.session_id, owner.name || owner.email, Number(documentRow.edit_generation), JSON.stringify(documentRow.body), Number(documentRow.revision), EDITOR_SESSION_LEASE_SECONDS],
    );
    requester = activated.rows[0];
    await dbRecordEditorEditEvent(client, requester, active ? 'session_takeover' : 'session_acquired', {
      prior_session_id: active?.session_id || null,
      prior_edit_generation: expectedGeneration,
      edit_generation: Number(documentRow.edit_generation),
      recovery_id: displacedRecovery?.recovery_id || null,
    });
    return {
      session: requester,
      presence: publicEditorPresence(documentRow, requester, requester, requester.device_hash),
      recovery: displacedRecovery,
    };
  });
}

async function assertActiveEditorEditSession(client, documentRow, sessionId, editGeneration, sessionKeyHash) {
  const session = await dbGetEditorEditSession(
    client,
    documentRow.owner_email,
    documentRow.document_id,
    sessionId,
    { lock: true },
  );
  if (!session) throw editorDocumentError(404, 'editor_document_edit_session_not_found', documentRow);
  assertEditorSessionKey(session, sessionKeyHash, documentRow);
  if (session.state === 'observing') throw await editorObserverOnlyError(client, documentRow, session);
  if (session.state === 'closed') {
    throw editorDocumentError(409, 'editor_document_session_not_active', documentRow, 'closed page sessions cannot mutate');
  }
  // `editGeneration` remains accepted while deployed clients roll forward, but it no longer
  // fences one tab out of the shared working copy. Authenticated owner pages are peers.
  void editGeneration;
  return session;
}

async function dbTouchEditorSessionAfterWrite(client, session, documentRow, action, priorRevision, eventDetails = {}) {
  const { rows } = await client.query(
    `UPDATE editor_document_edit_sessions
        SET draft_body = $2::jsonb,
            document_revision = $3,
            last_seen_at = clock_timestamp(),
            last_edit_at = clock_timestamp(),
            body_checkpoint_at = clock_timestamp()
      WHERE session_id = $1 AND state <> 'observing' AND state <> 'closed'
      RETURNING ${EDITOR_EDIT_SESSION_COLUMNS}`,
    [session.session_id, JSON.stringify(documentRow.body), Number(documentRow.revision)],
  );
  const touched = rows[0] || session;
  await dbRecordEditorEditEvent(client, touched, action, {
    from_revision: Number(priorRevision),
    to_revision: Number(documentRow.revision),
    edit_generation: Number(documentRow.edit_generation),
    ...eventDetails,
  });
  return touched;
}

async function dbListEditorRecoveries(ownerEmail, documentId) {
  await ensureDbReady();
  const { rows } = await pool.query(
    `SELECT ${EDITOR_RECOVERY_COLUMNS}
       FROM editor_document_recoveries
      WHERE owner_email = $1 AND document_id = $2
      ORDER BY created_at DESC, recovery_id DESC`,
    [ownerEmail, documentId],
  );
  return rows;
}

async function dbAppendDisplacedEditorRecovery(owner, documentId, sessionId, observedRevision, observedGeneration, sessionKeyHash, level) {
  return withEditorDocumentTransaction(async (client) => {
    const documentRow = await dbLockEditorDocument(client, owner.email, documentId);
    if (!documentRow) throw editorDocumentError(404, 'editor_document_not_found');
    let session = await dbGetEditorEditSession(client, owner.email, documentId, sessionId, { lock: true });
    if (!session) throw editorDocumentError(404, 'editor_document_edit_session_not_found');
    assertEditorSessionKey(session, sessionKeyHash, documentRow);
    if (session.state === 'observing') throw await editorObserverOnlyError(client, documentRow, session);
    const expiredAuthority = await dbExpireEditorSession(client, documentRow);
    if (expiredAuthority) {
      session = await dbGetEditorEditSession(client, owner.email, documentId, sessionId, { lock: true });
    }
    const state = await dbEditorSessionState(client, documentRow, sessionId, session.device_hash);
    if (
      !(
        ['displaced', 'expired'].includes(session.state)
        || (session.state === 'closed' && session.displaced_at)
      )
      || Number(session.edit_generation) !== observedGeneration
    ) {
      throw editorDocumentError(409, 'editor_document_session_not_displaced', documentRow, null, {
        session,
        presence: state.presence,
        recovery: state.recovery,
      });
    }
    const { rows } = await client.query(
      `INSERT INTO editor_document_recoveries
         (recovery_id, document_id, source_session_id, displaced_by_session_id,
          owner_email, actor_name, source_client_label, body, document_revision,
          edit_generation, capture_source, body_checkpoint_at, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10,
               'displaced-client-upload', clock_timestamp(), 'displaced-upload', clock_timestamp())
       RETURNING ${EDITOR_RECOVERY_COLUMNS}`,
      [
        crypto.randomUUID(),
        documentId,
        session.session_id,
        session.displaced_by_session_id || null,
        session.owner_email,
        session.actor_name,
        session.client_label || '',
        JSON.stringify(level),
        observedRevision,
        observedGeneration,
      ],
    );
    await dbRecordEditorEditEvent(client, session, 'recovery_uploaded', {
      recovery_id: rows[0].recovery_id,
      document_revision: observedRevision,
      edit_generation: observedGeneration,
      capture_source: 'displaced-client-upload',
    });
    return {
      recovery: rows[0],
      session,
      presence: state.presence,
    };
  });
}

async function dbDeleteEditorRecovery(
  ownerEmail,
  documentId,
  recoveryId,
  sessionId,
  editGeneration,
  sessionKeyHash,
) {
  return withEditorDocumentTransaction(async (client) => {
    const documentRow = await dbLockEditorDocument(client, ownerEmail, documentId);
    if (!documentRow) throw editorDocumentError(404, 'editor_document_not_found');
    const session = await assertActiveEditorEditSession(
      client,
      documentRow,
      sessionId,
      editGeneration,
      sessionKeyHash,
    );
    const { rows } = await client.query(
      `DELETE FROM editor_document_recoveries
        WHERE recovery_id = $1 AND document_id = $2 AND owner_email = $3
      RETURNING ${EDITOR_RECOVERY_COLUMNS}`,
      [recoveryId, documentId, ownerEmail],
    );
    if (!rows[0]) throw editorDocumentError(404, 'editor_document_recovery_not_found');
    await dbRecordEditorEditEvent(client, session, 'recovery_deleted', {
      recovery_id: recoveryId,
      edit_generation: editGeneration,
    });
    return rows[0];
  });
}

async function dbDeleteEditorRecoveries(
  ownerEmail,
  documentId,
  recoveryIds,
  sessionId,
  editGeneration,
  sessionKeyHash,
) {
  return withEditorDocumentTransaction(async (client) => {
    const documentRow = await dbLockEditorDocument(client, ownerEmail, documentId);
    if (!documentRow) throw editorDocumentError(404, 'editor_document_not_found');
    const session = await assertActiveEditorEditSession(
      client,
      documentRow,
      sessionId,
      editGeneration,
      sessionKeyHash,
    );
    const locked = await client.query(
      `SELECT recovery_id
         FROM editor_document_recoveries
        WHERE owner_email = $1 AND document_id = $2 AND recovery_id = ANY($3::uuid[])
        FOR UPDATE`,
      [ownerEmail, documentId, recoveryIds],
    );
    if (locked.rows.length !== recoveryIds.length) {
      throw editorDocumentError(
        409,
        'editor_document_recovery_snapshot_conflict',
        documentRow,
        'one or more selected recoveries no longer belong to this document',
        currentEditorSessionContext(documentRow, session),
      );
    }
    const deleted = await client.query(
      `DELETE FROM editor_document_recoveries
        WHERE owner_email = $1 AND document_id = $2 AND recovery_id = ANY($3::uuid[])
      RETURNING recovery_id`,
      [ownerEmail, documentId, recoveryIds],
    );
    if (deleted.rows.length !== recoveryIds.length) {
      throw editorDocumentError(
        409,
        'editor_document_recovery_snapshot_conflict',
        documentRow,
        'the recovery selection changed before deletion',
        currentEditorSessionContext(documentRow, session),
      );
    }
    await dbRecordEditorEditEvent(client, session, 'recoveries_deleted', {
      recovery_ids: recoveryIds,
      recovery_count: recoveryIds.length,
      edit_generation: editGeneration,
    });
    return recoveryIds;
  });
}

async function dbRestoreEditorRecovery(ownerEmail, documentId, recoveryId, expectedRevision, sessionId, editGeneration, sessionKeyHash) {
  return withEditorDocumentTransaction(async (client) => {
    const current = await dbLockEditorDocument(client, ownerEmail, documentId);
    if (!current) throw editorDocumentError(404, 'editor_document_not_found');
    const session = await assertActiveEditorEditSession(client, current, sessionId, editGeneration, sessionKeyHash);
    assertEditorDocumentRevision(current, expectedRevision, currentEditorSessionContext(current, session));
    const recoveryResult = await client.query(
      `SELECT ${EDITOR_RECOVERY_COLUMNS}
         FROM editor_document_recoveries
        WHERE recovery_id = $1 AND document_id = $2 AND owner_email = $3
        FOR UPDATE`,
      [recoveryId, documentId, ownerEmail],
    );
    const recovery = recoveryResult.rows[0];
    if (!recovery) throw editorDocumentError(404, 'editor_document_recovery_not_found');
    const canonical = await dbCanonicalLevel(
      client,
      ownerEmail,
      { kind: current.workspace_kind, id: current.workspace_id },
      current.level_id,
      { lock: true },
    );

    const currentCheckpoint = {
      ...session,
      draft_body: current.body,
      document_revision: current.revision,
      body_checkpoint_at: current.updated_at,
    };
    const preservedCurrent = await dbPreserveEditorSessionRecovery(client, currentCheckpoint, session.session_id, 'pre-restore');
    const { rows } = await client.query(
      `UPDATE level_working_copies
          SET body = $3::jsonb,
              revision = revision + 1,
              saved_revision = CASE
                WHEN md5(($3::jsonb)::text) = baseline_hash AND baseline_hash = $4 THEN revision + 1
                ELSE saved_revision
              END,
              updated_at = clock_timestamp()
        WHERE owner_email = $1 AND document_id = $2
        RETURNING ${EDITOR_DOCUMENT_COLUMNS}`,
      [ownerEmail, documentId, JSON.stringify(recovery.body), canonical.hash],
    );
    const restored = await dbAnnotateEditorDocumentBaseline(rows[0], client);
    await dbRecordEditorDocumentRevision(client, restored, 'restore');
    await dbTouchEditorSessionAfterWrite(client, session, restored, 'recovery_restored', current.revision, {
      recovery_id: recoveryId,
      preserved_current_recovery_id: preservedCurrent.recovery_id,
    });
    const resolvedRecovery = await client.query(
      `UPDATE editor_document_recoveries
          SET resolved_at = COALESCE(resolved_at, clock_timestamp())
        WHERE recovery_id = $1 AND document_id = $2 AND owner_email = $3
        RETURNING ${EDITOR_RECOVERY_COLUMNS}`,
      [recoveryId, documentId, ownerEmail],
    );
    return { row: restored, recovery: resolvedRecovery.rows[0], preservedCurrent };
  });
}

async function dbCanonicalLevel(client, ownerEmail, workspace, levelId, { lock = false } = {}) {
  if (workspace.kind === 'user') {
    const { rows } = await client.query(
      `SELECT body, revision, updated_at, md5(((body->'levels')->$2)::text) AS level_hash
         FROM campaign_workspaces WHERE owner_email = $1${lock ? ' FOR UPDATE' : ''}`,
      [ownerEmail, levelId],
    );
    const body = isObjectRecord(rows[0] && rows[0].body) ? rows[0].body : null;
    const levels = body && isObjectRecord(body.levels) ? body.levels : null;
    return {
      level: levels && isObjectRecord(levels[levelId]) ? levels[levelId] : null,
      hash: rows[0] && rows[0].level_hash ? rows[0].level_hash : null,
      body,
      row: rows[0] || null,
    };
  }
  const { rows } = await client.query(
    `SELECT data, client_schema_version, revision, created_at, updated_at, updated_by,
            md5(((data->'levels')->$2)::text) AS level_hash
       FROM official_campaigns WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [workspace.id, levelId],
  );
  const body = isObjectRecord(rows[0] && rows[0].data) ? rows[0].data : null;
  const levels = body && isObjectRecord(body.levels) ? body.levels : null;
  return {
    level: levels && isObjectRecord(levels[levelId]) ? levels[levelId] : null,
    hash: rows[0] && rows[0].level_hash ? rows[0].level_hash : null,
    body,
    row: rows[0] || null,
  };
}

function editorDocumentBaselineChanged(row, canonical) {
  return (row && row.baseline_hash ? row.baseline_hash : null) !== (canonical && canonical.hash ? canonical.hash : null);
}

async function dbJsonbHash(client, value) {
  const { rows } = await client.query('SELECT md5(($1::jsonb)::text) AS hash', [JSON.stringify(value)]);
  return rows[0] && rows[0].hash ? rows[0].hash : null;
}

async function dbReconcileEditorDocument(client, row, { lockCanonical = true } = {}) {
  if (!row) throw editorDocumentError(404, 'editor_document_not_found');
  const workspace = { kind: row.workspace_kind, id: row.workspace_id };
  const canonical = await dbCanonicalLevel(client, row.owner_email, workspace, row.level_id, { lock: lockCanonical });
  if (!editorDocumentBaselineChanged(row, canonical)) return { ...row, baseline_conflict: false };

  // Loading or resolving an existing document is read-only. Even when the
  // working copy is clean, adopting a changed canonical body would replace
  // editor content without a session fence. Report the independent baseline
  // conflict and leave explicit, fenced Discard as the sole adoption path.
  return { ...row, baseline_conflict: true };
}

async function dbResolveEditorDocument(ownerEmail, workspace, levelId) {
  return withEditorDocumentTransaction(async (client) => {
    let row = await dbGetEditorDocumentByLevel(ownerEmail, workspace, levelId, client, { lock: true });
    if (row) return { row: await dbReconcileEditorDocument(client, row), created: false };
    const canonical = await dbCanonicalLevel(client, ownerEmail, workspace, levelId, { lock: true });
    if (!canonical.level) throw editorDocumentError(404, 'saved_level_not_found');
    const parsed = editorDocumentLevel(canonical.level, levelId);
    if (parsed.error) throw editorDocumentError(409, 'saved_level_invalid', null, parsed.details);
    const inserted = await client.query(
      `INSERT INTO level_working_copies
         (document_id, owner_email, workspace_kind, workspace_id, level_id, body, revision, saved_revision, baseline_hash)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 1, 1, $7)
       ON CONFLICT (owner_email, workspace_kind, workspace_id, level_id) DO NOTHING
       RETURNING ${EDITOR_DOCUMENT_COLUMNS}`,
      [crypto.randomUUID(), ownerEmail, workspace.kind, workspace.id, levelId, JSON.stringify(parsed.level), canonical.hash],
    );
    row = inserted.rows[0] || await dbGetEditorDocumentByLevel(ownerEmail, workspace, levelId, client, { lock: true });
    if (inserted.rows[0]) await dbRecordEditorDocumentRevision(client, inserted.rows[0], 'resolve');
    return {
      row: inserted.rows[0] ? { ...inserted.rows[0], baseline_conflict: false } : await dbReconcileEditorDocument(client, row),
      created: Boolean(inserted.rows[0]),
    };
  });
}

function nextUserLevelId(workspaceBody, workingLevelIds) {
  let max = 0n;
  const usedNumericSuffixes = new Set();
  const ids = [
    ...Object.keys(isObjectRecord(workspaceBody && workspaceBody.levels) ? workspaceBody.levels : {}),
    ...(Array.isArray(workspaceBody && workspaceBody.campaigns)
      ? workspaceBody.campaigns.map((campaign) => campaign && campaign.id)
      : []),
    ...workingLevelIds,
  ];
  for (const raw of ids) {
    const match = /^[cl](\d+)$/.exec(String(raw || ''));
    // Generated ids are at most 80 characters (`l` + 79 digits). Longer
    // imported/campaign ids cannot collide and must not trigger a huge BigInt parse.
    if (!match || match[1].length > 79) continue;
    const value = BigInt(match[1]);
    usedNumericSuffixes.add(value.toString());
    if (value > max) max = value;
  }
  const next = max + 1n;
  if (`l${next}`.length <= 80) return `l${next}`;

  // A malicious or imported 79-digit suffix can exhaust the increasing end of
  // the id format, but it must not make Number round or emit an invalid 81-char
  // id. With a finite set of existing rows, one of the first N+1 suffixes is free.
  for (let candidate = 1n; candidate <= BigInt(usedNumericSuffixes.size + 1); candidate += 1n) {
    if (!usedNumericSuffixes.has(candidate.toString())) return `l${candidate}`;
  }
  throw editorDocumentError(409, 'level_id_allocation_failed');
}

async function dbCreateEditorDocument(ownerEmail, initialLevel) {
  return withEditorDocumentTransaction(async (client) => {
    // Serialize allocation per owner without a separate mutable counter table.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [ownerEmail]);
    await client.query(
      `INSERT INTO campaign_workspaces (owner_email, body)
       VALUES ($1, '{"campaigns":[],"wars":[],"levels":{}}'::jsonb)
       ON CONFLICT (owner_email) DO NOTHING`,
      [ownerEmail],
    );
    const workspaceResult = await client.query(
      'SELECT body FROM campaign_workspaces WHERE owner_email = $1 FOR UPDATE',
      [ownerEmail],
    );
    const workspaceBody = isObjectRecord(workspaceResult.rows[0] && workspaceResult.rows[0].body)
      ? workspaceResult.rows[0].body
      : { campaigns: [], wars: [], levels: {} };
    const workingResult = await client.query(
      "SELECT level_id FROM level_working_copies WHERE owner_email = $1 AND workspace_kind = 'user' AND workspace_id = 'campaign'",
      [ownerEmail],
    );
    const levelId = nextUserLevelId(workspaceBody, workingResult.rows.map((row) => row.level_id));
    const parsed = editorDocumentLevel(initialLevel, levelId, { rewriteId: true });
    if (parsed.error) throw editorDocumentError(400, parsed.error, null, parsed.details);
    const { rows } = await client.query(
      `INSERT INTO level_working_copies
         (document_id, owner_email, workspace_kind, workspace_id, level_id, body, revision, saved_revision, baseline_hash)
       VALUES ($1, $2, 'user', 'campaign', $3, $4::jsonb, 1, 0, NULL)
       RETURNING ${EDITOR_DOCUMENT_COLUMNS}`,
      [crypto.randomUUID(), ownerEmail, levelId, JSON.stringify(parsed.level)],
    );
    await dbRecordEditorDocumentRevision(client, rows[0], 'create');
    return rows[0];
  });
}

async function dbLoadEditorDocument(ownerEmail, documentId) {
  const row = await dbGetEditorDocument(ownerEmail, documentId);
  if (!row) return null;
  return dbReconcileEditorDocument(pool, row, { lockCanonical: false });
}

async function dbAnnotateEditorDocumentBaseline(row, client = pool) {
  if (!row) return row;
  const workspace = { kind: row.workspace_kind, id: row.workspace_id };
  const canonical = await dbCanonicalLevel(client, row.owner_email, workspace, row.level_id);
  return { ...row, baseline_conflict: editorDocumentBaselineChanged(row, canonical) };
}

async function dbAutosaveEditorDocument(ownerEmail, documentId, expectedRevision, baseLevel, level, sessionId, editGeneration, sessionKeyHash) {
  return withEditorDocumentTransaction(async (client) => {
    const current = await dbLockEditorDocument(client, ownerEmail, documentId);
    if (!current) throw editorDocumentError(404, 'editor_document_not_found');
    const session = await assertActiveEditorEditSession(client, current, sessionId, editGeneration, sessionKeyHash);
    if (expectedRevision > Number(current.revision)) {
      assertEditorDocumentRevision(current, expectedRevision, currentEditorSessionContext(current, session));
    }
    let sharedLevel = level;
    if (expectedRevision < Number(current.revision)) {
      if (!baseLevel || typeof serverRender?.mergeSharedLevel !== 'function') {
        throw editorDocumentError(
          409,
          'editor_document_revision_conflict',
          current,
          'the shared working copy advanced and this client supplied no merge base',
          currentEditorSessionContext(current, session),
        );
      }
      const merged = serverRender.mergeSharedLevel(baseLevel, level, current.body);
      const parsedMerged = editorDocumentLevel(merged, current.level_id);
      if (parsedMerged.error) {
        throw editorDocumentError(400, parsedMerged.error, current, parsedMerged.details);
      }
      sharedLevel = parsedMerged.level;
    }
    // Bind a legacy selected lineage before replacing the server-held body. V1
    // included cover, so this is the last trustworthy moment to prove an exact
    // old digest when the incoming first edit changes only live cover.
    await withThumbnailRenderInputs(() => dbTryBindStoredLevelLegacyBackgroundGeometry(
      client,
      current,
      current.body,
      ownerEmail,
      session.actor_name,
    ), client);
    const canonical = await dbCanonicalLevel(
      client,
      ownerEmail,
      { kind: current.workspace_kind, id: current.workspace_id },
      current.level_id,
      { lock: true },
    );
    const { rows } = await client.query(
      `UPDATE level_working_copies
          SET body = $3::jsonb,
              revision = revision + 1,
              saved_revision = CASE
                WHEN md5(($3::jsonb)::text) = baseline_hash AND baseline_hash = $4 THEN revision + 1
                ELSE saved_revision
              END,
              updated_at = clock_timestamp()
        WHERE owner_email = $1 AND document_id = $2
        RETURNING ${EDITOR_DOCUMENT_COLUMNS}`,
      [ownerEmail, documentId, JSON.stringify(sharedLevel), canonical.hash],
    );
    const row = await dbAnnotateEditorDocumentBaseline(rows[0], client);
    await dbRecordEditorDocumentRevision(client, row, 'autosave');
    await dbTouchEditorSessionAfterWrite(client, session, row, 'document_autosaved', current.revision);
    return row;
  });
}

function editorDocumentCampaignsWithAssignment(campaigns, levelId, level, campaignId) {
  if (campaignId === undefined) return campaigns;
  const target = campaignId === null
    ? null
    : campaigns.find((campaign) => campaign.id === campaignId);
  if (campaignId !== null && !target) {
    throw editorDocumentError(409, 'campaign_not_found', null, `campaign ${campaignId} is not in this workspace`);
  }
  if (target && target.id.startsWith('off-') !== levelId.startsWith('off-')) {
    throw editorDocumentError(409, 'campaign_tier_mismatch');
  }

  return campaigns.map((campaign) => {
    const priorRef = campaign.levels.find((ref) => ref.levelId === levelId);
    const withoutLevel = campaign.levels
      .filter((ref) => ref.levelId !== levelId)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((ref, ordinal) => ({ ...ref, ordinal }));
    if (campaign.id !== target?.id) return { ...campaign, levels: withoutLevel };
    return {
      ...campaign,
      levels: [
        ...withoutLevel,
        {
          ...(priorRef || {}),
          levelId,
          ordinal: withoutLevel.length,
          objective: level.objective,
        },
      ],
    };
  });
}

async function dbPromoteCanonicalLevel(client, ownerEmail, workspace, levelId, level, campaignId) {
  let canonical = await dbCanonicalLevel(client, ownerEmail, workspace, levelId, { lock: true });
  if (workspace.kind === 'user' && !canonical.row) {
    // Materialize and lock the owner's workspace before merging a first-saved
    // unassigned Level. This prevents a concurrent workspace write from being
    // replaced by a snapshot built from an assumed empty row.
    await client.query(
      `INSERT INTO campaign_workspaces (owner_email, body)
       VALUES ($1, '{"campaigns":[],"wars":[],"levels":{}}'::jsonb)
       ON CONFLICT (owner_email) DO NOTHING`,
      [ownerEmail],
    );
    canonical = await dbCanonicalLevel(client, ownerEmail, workspace, levelId, { lock: true });
  }
  const existing = canonical.body || { campaigns: [], wars: [], levels: {} };
  const existingCampaigns = Array.isArray(existing.campaigns) ? existing.campaigns : [];
  const nextBody = {
    campaigns: editorDocumentCampaignsWithAssignment(existingCampaigns, levelId, level, campaignId),
    wars: Array.isArray(existing.wars) ? existing.wars : [],
    levels: { ...(isObjectRecord(existing.levels) ? existing.levels : {}), [levelId]: level },
  };
  const validation = validateWorkspaceBody(nextBody);
  if (validation) throw editorDocumentError(409, 'canonical_workspace_invalid', null, validation);
  if (workspace.kind === 'user') {
    const { rows } = await client.query(
      `INSERT INTO campaign_workspaces (owner_email, body, revision)
       VALUES ($1, $2::jsonb, 1)
       ON CONFLICT (owner_email) DO UPDATE SET
         body = EXCLUDED.body,
         revision = campaign_workspaces.revision + 1,
         updated_at = now()
       RETURNING revision`,
      [ownerEmail, JSON.stringify(nextBody)],
    );
    return Number(rows[0].revision);
  }
  const idError = validateOfficialWorkspaceIds(nextBody);
  if (idError) throw editorDocumentError(400, 'invalid_official_ids', null, idError);
  if (!canonical.row) throw editorDocumentError(404, 'official_workspace_not_found');
  const { rows } = await client.query(
    `UPDATE official_campaigns
        SET data = $2::jsonb, revision = revision + 1, updated_at = now(), updated_by = $3
      WHERE id = $1
      RETURNING revision`,
    [workspace.id, JSON.stringify(nextBody), ownerEmail],
  );
  return Number(rows[0].revision);
}

async function dbBackgroundVersionRow(documentId, versionId, queryable = pool, { lock = false } = {}) {
  const { rows } = await queryable.query(
    `SELECT ${BACKGROUND_VERSION_COLUMNS}
       FROM predrawn_background_versions v
       LEFT JOIN media_blobs b ON b.sha256 = v.blob_sha256
      WHERE v.document_id = $1 AND v.id = $2${lock ? ' FOR UPDATE OF v' : ''}`,
    [documentId, versionId],
  );
  return rows[0] || null;
}

async function dbAnyBackgroundVersionRow(versionId, queryable = pool) {
  await ensureDbReady();
  const { rows } = await queryable.query(
    `SELECT ${BACKGROUND_VERSION_COLUMNS}
       FROM predrawn_background_versions v
       LEFT JOIN media_blobs b ON b.sha256 = v.blob_sha256
      WHERE v.id = $1`,
    [versionId],
  );
  return rows[0] || null;
}

async function dbRecordBackgroundVersionEvent(
  client,
  row,
  action,
  actorEmail,
  actorName,
  details = {},
) {
  await client.query(
    `INSERT INTO predrawn_background_version_events
       (document_id, version_id, action, actor_email, actor_name, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [row.document_id, row.id, action, actorEmail, actorName || actorEmail, JSON.stringify(details)],
  );
}

function publicBackgroundVersion(row) {
  const hasContent = Boolean(row.blob_sha256 && row.width && row.height);
  const pipelineSourceIssue = row.kind === 'raw'
    ? backgroundVersionPipelineSourceIssue(row)
    : null;
  const documentContentUrl = `/api/editor-documents/${encodeURIComponent(row.document_id)}`
    + `/background-versions/${encodeURIComponent(String(row.id))}/content`;
  return {
    id: String(row.id),
    document_id: row.document_id,
    level_id: row.level_id,
    kind: row.kind,
    label: row.label,
    parent_version_id: row.parent_version_id ? String(row.parent_version_id) : null,
    source_background_version_id: row.source_background_version_id
      ? String(row.source_background_version_id)
      : null,
    content_sha256: row.blob_sha256 || null,
    frame_width: row.width === null ? null : Number(row.width),
    frame_height: row.height === null ? null : Number(row.height),
    byte_length: row.byte_length === null || row.byte_length === undefined ? null : Number(row.byte_length),
    world_bounds: row.world_bounds,
    operation: row.operation,
    provenance: row.provenance,
    // New versions already carry v2 in immutable metadata. A migrated v1 row
    // exposes the separately persisted v2 binding without rewriting its bytes,
    // operation, or provenance.
    environment_geometry_sha256_v2: backgroundVersionV2GeometrySha256(row),
    pipeline_source_eligible: row.kind === 'raw' && pipelineSourceIssue === null,
    pipeline_source_issue: pipelineSourceIssue,
    // Metadata creation and byte upload are separate HTTP operations. Keep the
    // durable status vocabulary small, but identify that bounded transient to
    // the UI instead of calling a row with no PNG "ready".
    status: row.status === 'ready' && !hasContent ? 'draft' : row.status,
    content_ready: hasContent,
    content_url: hasContent ? `/api/background-versions/${encodeURIComponent(String(row.id))}/content` : null,
    document_content_url: hasContent ? documentContentUrl : null,
    public_content_url: hasContent && row.status === 'published'
      ? `/api/background-versions/${encodeURIComponent(String(row.id))}/content`
      : null,
    row_revision: Number(row.row_revision),
    created_by: row.created_by_name,
    created_by_email: row.created_by_email,
    created_at: nullableTimestampString(row.created_at),
    updated_at: nullableTimestampString(row.updated_at),
    archived_at: nullableTimestampString(row.archived_at),
    archived_by: row.archived_by || null,
    published_at: nullableTimestampString(row.published_at),
    published_by: row.published_by || null,
  };
}

function publicGenerationAttempt(row) {
  return {
    id: String(row.id),
    document_id: row.document_id,
    level_id: row.level_id,
    label: row.label,
    origin: row.origin,
    source_version_id: row.source_version_id ? String(row.source_version_id) : null,
    source_attempt_id: row.source_attempt_id ? String(row.source_attempt_id) : null,
    source_request: isObjectRecord(row.source_request) ? row.source_request : null,
    generated_version_id: row.generated_version_id ? String(row.generated_version_id) : null,
    warped_version_id: row.warped_version_id ? String(row.warped_version_id) : null,
    occlusion_version_id: row.occlusion_version_id ? String(row.occlusion_version_id) : null,
    move_highlight_profile: isObjectRecord(row.move_highlight_profile)
      ? row.move_highlight_profile
      : null,
    move_highlight_profile_sha256: row.move_highlight_profile_sha256 || null,
    move_highlight_profile_warped_version_id: row.move_highlight_profile_warped_version_id
      ? String(row.move_highlight_profile_warped_version_id)
      : null,
    status: row.status,
    row_revision: Number(row.row_revision),
    processing_revision: Number(row.processing_revision),
    created_by: row.created_by_name,
    created_by_email: row.created_by_email,
    created_at: nullableTimestampString(row.created_at),
    updated_at: nullableTimestampString(row.updated_at),
    archived_at: nullableTimestampString(row.archived_at),
    archived_by: row.archived_by || null,
  };
}

async function dbGenerationAttemptRow(documentId, attemptId, queryable = pool, { lock = false } = {}) {
  const { rows } = await queryable.query(
    `SELECT ${GENERATION_ATTEMPT_COLUMNS}
       FROM predrawn_generation_attempts attempt
      WHERE attempt.document_id = $1 AND attempt.id = $2${lock ? ' FOR UPDATE OF attempt' : ''}`,
    [documentId, attemptId],
  );
  return rows[0] || null;
}

async function dbRecordGenerationAttemptEvent(
  client,
  row,
  action,
  actorEmail,
  actorName,
  details = {},
) {
  await client.query(
    `INSERT INTO predrawn_generation_attempt_events
       (document_id, attempt_id, action, actor_email, actor_name, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [row.document_id, row.id, action, actorEmail, actorName || actorEmail, JSON.stringify(details)],
  );
}

function canonicalLevelSha256(level) {
  return crypto.createHash('sha256').update(canonicalJson(level)).digest('hex');
}

function predrawnSourceCanonicalFields(level, { levelId, documentRevision }) {
  if (!level?.boardCode || typeof level.boardCode !== 'string' || !serverRender?.decodeBoard) {
    throw editorDocumentError(503, 'board_renderer_unavailable');
  }
  const board = serverRender.decodeBoard(level.boardCode);
  if (!board) {
    throw backgroundVersionError(
      409,
      'background_source_board_invalid',
      'The saved Level board could not be decoded with the current live artwork catalog.',
    );
  }
  const frameValidation = typeof serverRender.validatePredrawnGenerationFrame === 'function'
    ? serverRender.validatePredrawnGenerationFrame(board, board?.predrawnGenerationFrame)
    : null;
  const frame = frameValidation?.ok ? frameValidation.frame : null;
  if (!frame) {
    throw backgroundVersionError(
      409,
      'background_source_generation_frame_required',
      frameValidation?.errors || 'Save a valid generation frame before creating a Generation Reference.',
    );
  }
  const backgroundMode = typeof serverRender.boardBackgroundMode === 'function'
    ? serverRender.boardBackgroundMode(board)
    : board?.backgroundMode === 'legacy'
      ? 'legacy'
      : board?.surface?.kind === 'predrawn'
        ? 'ai'
        : 'legacy';
  const surface = board?.surface ? normalizePredrawnVersionSurface(board.surface) : null;
  if (backgroundMode === 'ai' && (!surface || surface.error)) {
    throw backgroundVersionError(
      409,
      'background_source_ai_selection_required',
      'The saved AI background mode has no complete immutable artwork selection.',
    );
  }
  const sourceBackgroundVersionId = backgroundMode === 'ai'
    ? surface.value.background_version_id
    : null;
  const sourceOcclusionVersionId = backgroundMode === 'ai'
    ? surface.value.occlusion_version_id
    : null;
  if (typeof serverRender.encodeBoard !== 'function') {
    throw editorDocumentError(503, 'board_renderer_unavailable');
  }
  const semanticSurface = board.surface?.schemaVersion === 3
    ? {
        kind: 'predrawn',
        schemaVersion: 2,
        backgroundVersionId: board.surface.backgroundVersionId,
        ...(board.surface.occlusionVersionId
          ? { occlusionVersionId: board.surface.occlusionVersionId }
          : {}),
        frameWidth: board.surface.frameWidth,
        frameHeight: board.surface.frameHeight,
        worldBounds: { ...board.surface.worldBounds },
      }
    : board.surface;
  const semanticBoardCode = serverRender.encodeBoard({
    ...board,
    surface: semanticSurface,
    units: {},
    cover: {},
    coverTypes: {},
  });
  const semanticBoardSha256 = crypto.createHash('sha256').update(semanticBoardCode, 'utf8').digest('hex');
  const canonicalLevelDigest = canonicalLevelSha256(level);
  const environmentGeometryDigests = predrawnEnvironmentGeometryDigests(level);
  const semanticRequest = {
    schema: SOURCE_SEMANTIC_REQUEST_SCHEMA,
    levelId,
    canonicalDocumentRevision: Number(documentRevision),
    canonicalLevelSha256: canonicalLevelDigest,
    boardCode: semanticBoardCode,
    boardSha256: semanticBoardSha256,
    generationFrame: {
      version: frame.version,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    },
    worldBounds: {
      minX: frame.x,
      minY: frame.y,
      width: frame.width,
      height: frame.height,
    },
    backgroundMode,
    sourceBackgroundVersionId,
    sourceOcclusionVersionId,
    environmentGeometrySchema: ENVIRONMENT_GEOMETRY_SCHEMA,
    environmentGeometrySha256: environmentGeometryDigests.v2,
  };
  return {
    backgroundMode,
    frame: {
      version: frame.version,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    },
    worldBounds: {
      minX: frame.x,
      minY: frame.y,
      width: frame.width,
      height: frame.height,
    },
    sourceBackgroundVersionId,
    sourceOcclusionVersionId,
    canonicalDocumentRevision: Number(documentRevision),
    canonicalLevelSha256: canonicalLevelDigest,
    environmentGeometrySha256: semanticRequest.environmentGeometrySha256,
    environmentGeometryDigests,
    semanticBoardSha256,
    semanticRequest,
    semanticRequestSha256: crypto.createHash('sha256')
      .update(canonicalJson(semanticRequest))
      .digest('hex'),
  };
}

async function dbCanonicalPredrawnAttemptFields(client, documentRow) {
  if (
    Number(documentRow.revision) !== Number(documentRow.saved_revision)
    || !documentRow.baseline_hash
  ) {
    throw backgroundVersionError(
      409,
      'background_source_level_unsaved',
      'Save the current Level before creating a Generation Reference.',
    );
  }
  const canonical = await dbCanonicalLevel(
    client,
    documentRow.owner_email,
    { kind: documentRow.workspace_kind, id: documentRow.workspace_id },
    documentRow.level_id,
    { lock: true },
  );
  if (!canonical.level || editorDocumentBaselineChanged(documentRow, canonical)) {
    throw backgroundVersionError(
      409,
      'background_source_level_changed',
      'The saved Level changed before the Generation Reference could be created.',
    );
  }
  // Board-code normalization consults the live drawable catalog (macro tiles
  // are one example). Perform every decode, validation, re-encode, and geometry
  // digest under one bounded server-render snapshot so a cold backend cannot
  // misreport a valid saved frame as missing.
  return withThumbnailRenderInputs(() => predrawnSourceCanonicalFields(canonical.level, {
    levelId: documentRow.level_id,
    documentRevision: documentRow.saved_revision,
  }), client);
}

async function dbCanonicalizePredrawnSourceVersion(client, documentRow, value) {
  const fields = await dbCanonicalPredrawnAttemptFields(client, documentRow);
  const operation = {
    ...value.operation,
    kind: 'generation-source-v1',
    coordinateBasis: 'board-world-pixels-v1',
    viewingPane: fields.worldBounds,
    generationFrame: fields.frame,
    backgroundMode: fields.backgroundMode,
    sourceBackgroundVersionId: fields.sourceBackgroundVersionId,
    sourceOcclusionVersionId: fields.sourceOcclusionVersionId,
    canonicalDocumentRevision: fields.canonicalDocumentRevision,
    canonicalLevelSha256: fields.canonicalLevelSha256,
    environmentGeometrySchema: ENVIRONMENT_GEOMETRY_SCHEMA,
    environmentGeometrySha256: fields.environmentGeometrySha256,
    semanticBoardSha256: fields.semanticBoardSha256,
    semanticRequest: fields.semanticRequest,
    semanticRequestSha256: fields.semanticRequestSha256,
  };
  const provenance = {
    ...value.provenance,
    canonicalDocumentRevision: fields.canonicalDocumentRevision,
    canonicalLevelSha256: fields.canonicalLevelSha256,
    backgroundMode: fields.backgroundMode,
    sourceBackgroundVersionId: fields.sourceBackgroundVersionId,
    sourceOcclusionVersionId: fields.sourceOcclusionVersionId,
    generationFrame: fields.frame,
    environmentGeometrySha256: fields.environmentGeometrySha256,
    semanticBoardSha256: fields.semanticBoardSha256,
    semanticRequestSha256: fields.semanticRequestSha256,
  };
  const canonicalValue = {
    ...value,
    world_bounds: fields.worldBounds,
    operation,
    provenance,
  };
  const issue = sourceArtworkVersionContractIssue(canonicalValue);
  if (issue) throw backgroundVersionError(409, 'invalid_background_source', issue);
  return canonicalValue;
}

function sourceVersionCanonicalMetadataMatches(current, canonicalValue) {
  return current.kind === 'source'
    && sameBackgroundWorldBounds(current.world_bounds, canonicalValue.world_bounds)
    && canonicalJson(current.operation) === canonicalJson(canonicalValue.operation)
    && canonicalJson(current.provenance) === canonicalJson(canonicalValue.provenance);
}

function generationAttemptSourceRequest(sourceArtwork) {
  const request = {
    schema: ATTEMPT_SOURCE_REQUEST_SCHEMA,
    sourceArtworkVersionId: String(sourceArtwork.id),
    sourceArtworkSha256: sourceArtwork.blob_sha256,
    semanticRequestSha256: sourceArtwork.operation.semanticRequestSha256,
    semanticRequest: sourceArtwork.operation.semanticRequest,
  };
  return {
    ...request,
    requestSha256: crypto.createHash('sha256').update(canonicalJson(request)).digest('hex'),
  };
}

function generationAttemptPipelineSourceRequest(sourceVersion, sourceAttempt, fields) {
  const request = {
    schema: ATTEMPT_PIPELINE_SOURCE_REQUEST_SCHEMA,
    inputRole: 'raw-pipeline-source',
    inputVersionId: String(sourceVersion.id),
    inputSha256: sourceVersion.blob_sha256,
    sourceAttemptId: String(sourceAttempt.id),
    semanticRequestSha256: fields.semanticRequestSha256,
    semanticRequest: fields.semanticRequest,
  };
  return {
    ...request,
    requestSha256: crypto.createHash('sha256').update(canonicalJson(request)).digest('hex'),
  };
}

function backgroundVersionError(statusCode, code, details = null) {
  const error = new Error(code);
  error.backgroundVersionStatus = statusCode;
  error.backgroundVersionCode = code;
  error.backgroundVersionDetails = details;
  return error;
}

function respondBackgroundVersionError(res, error, operation) {
  if (error?.statusCode && error?.responseCode) {
    respondEditorDocumentError(res, error, operation);
    return;
  }
  if (error?.backgroundVersionCode) {
    res.status(error.backgroundVersionStatus || 400).json({
      error: error.backgroundVersionCode,
      ...(error.backgroundVersionDetails === null ? {} : { details: error.backgroundVersionDetails }),
    });
    return;
  }
  const schemaViolation = backgroundStoreSchemaViolation(error);
  if (schemaViolation) {
    console.error(`background version ${operation} violated a database schema contract:`, error);
    res.status(500).json({
      error: 'background_version_schema_contract_violation',
      details: {
        operation,
        ...schemaViolation,
      },
    });
    return;
  }
  dbUnavailable(res, `background version ${operation} failed`, error, 'background_version_store_unavailable');
}

function decodedBoardBackgroundMode(board) {
  if (typeof serverRender?.boardBackgroundMode === 'function') {
    return serverRender.boardBackgroundMode(board);
  }
  if (board?.backgroundMode === 'legacy') return 'legacy';
  return board?.surface?.kind === 'predrawn' ? 'ai' : 'legacy';
}

function decodedVersionedPredrawnSurface(level, { activeOnly = false } = {}) {
  if (!level?.boardCode || typeof level.boardCode !== 'string') return null;
  if (!serverRender?.decodeBoard) {
    throw editorDocumentError(503, 'board_renderer_unavailable');
  }
  const board = serverRender.decodeBoard(level.boardCode);
  if (!board) {
    throw backgroundVersionError(
      409,
      'background_version_reference_check_failed',
      'the Level boardCode could not be decoded against the authoritative render catalog',
    );
  }
  if (!board.surface) return null;
  if (activeOnly && decodedBoardBackgroundMode(board) !== 'ai') return null;
  const normalized = normalizePredrawnVersionSurface(board.surface);
  if (!normalized) return null;
  if (normalized.error) throw editorDocumentError(409, 'predrawn_background_surface_invalid', null, normalized.error);
  return normalized.value;
}

function generationAttemptArchiveLevelPlan(level, ownedVersionIds) {
  const selected = decodedVersionedPredrawnSurface(level);
  if (!selected) {
    return {
      level,
      kind: 'unrelated',
      matchedVersionIds: [],
    };
  }
  if (!serverRender?.decodeBoard) {
    throw editorDocumentError(503, 'board_renderer_unavailable');
  }
  const board = serverRender.decodeBoard(level.boardCode);
  if (!board) {
    throw backgroundVersionError(
      409,
      'background_version_reference_check_failed',
      'the Level boardCode is invalid',
    );
  }
  const disposition = generationAttemptSelectionDisposition(
    decodedBoardBackgroundMode(board),
    selected,
    ownedVersionIds,
  );
  if (disposition.kind !== 'dormant') {
    return {
      level,
      kind: disposition.kind,
      matchedVersionIds: disposition.matched_version_ids,
    };
  }
  if (typeof serverRender.withoutPredrawnBoardSurface !== 'function') {
    throw editorDocumentError(503, 'board_renderer_unavailable');
  }
  return {
    level: serverRender.withoutPredrawnBoardSurface(level),
    kind: 'dormant',
    matchedVersionIds: disposition.matched_version_ids,
  };
}

function generationAttemptOcclusionDiscardLevelPlan(
  level,
  expectedWarpedVersionId,
  expectedOcclusionVersionId,
) {
  const selected = decodedVersionedPredrawnSurface(level);
  if (!selected || selected.occlusion_version_id !== expectedOcclusionVersionId) {
    return { level, referencesOcclusion: false };
  }
  if (selected.background_version_id !== expectedWarpedVersionId) {
    throw backgroundVersionError(
      409,
      'generation_attempt_occlusion_reference_invalid',
      'The Level references this mask with a different warped background.',
    );
  }
  if (typeof serverRender?.withoutPredrawnBoardOcclusionMask !== 'function') {
    throw editorDocumentError(503, 'board_renderer_unavailable');
  }
  return {
    level: serverRender.withoutPredrawnBoardOcclusionMask(
      level,
      expectedWarpedVersionId,
      expectedOcclusionVersionId,
    ),
    referencesOcclusion: true,
  };
}

function predrawnEnvironmentGeometryDigests(level) {
  if (
    !level?.boardCode || typeof level.boardCode !== 'string'
    || !serverRender?.decodeBoard
    || typeof serverRender.predrawnEnvironmentGeometryFingerprintInputV1 !== 'function'
    || typeof serverRender.predrawnEnvironmentGeometryFingerprintInputV2 !== 'function'
  ) {
    throw editorDocumentError(503, 'board_renderer_unavailable');
  }
  const board = serverRender.decodeBoard(level.boardCode);
  const sha256 = (fingerprint) => crypto.createHash('sha256').update(fingerprint, 'utf8').digest('hex');
  return {
    v1: sha256(serverRender.predrawnEnvironmentGeometryFingerprintInputV1(board)),
    v2: sha256(serverRender.predrawnEnvironmentGeometryFingerprintInputV2(board)),
  };
}

function backgroundVersionHasEnvironmentGeometry(row, expectedV2Sha256) {
  return backgroundVersionV2GeometrySha256(row) === expectedV2Sha256;
}

function legacyBackgroundVersionNeedsGeometryBinding(row) {
  const geometry = backgroundVersionEnvironmentGeometry(row);
  return geometry?.schema === LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA
    && !row.environment_geometry_binding;
}

async function dbBindLegacyBackgroundVersionGeometry(
  client,
  rows,
  geometryDigests,
  actorEmail,
  actorName,
) {
  const versions = [...new Map(rows.filter(Boolean).map((row) => [String(row.id), row])).values()];
  const pending = [];
  for (const row of versions) {
    const geometry = backgroundVersionEnvironmentGeometry(row);
    if (!geometry) return false;
    if (geometry.schema === ENVIRONMENT_GEOMETRY_SCHEMA) {
      if (geometry.sha256 !== geometryDigests.v2) return false;
      continue;
    }
    if (geometry.schema !== LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA) return false;
    if (row.environment_geometry_binding) {
      if (backgroundVersionV2GeometrySha256(row) !== geometryDigests.v2) return false;
      continue;
    }
    // This is the one proof that authorizes migration. It is evaluated from the
    // server-held pre-mutation Level, never from client-declared provenance.
    if (geometry.sha256 !== geometryDigests.v1) return false;
    pending.push({ row, geometry });
  }

  for (const { row, geometry } of pending) {
    await client.query(
      `INSERT INTO predrawn_background_geometry_bindings (
         version_id, document_id,
         legacy_environment_geometry_schema, legacy_environment_geometry_sha256,
         environment_geometry_schema, environment_geometry_sha256,
         bound_by_email, bound_by_name
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (version_id) DO NOTHING`,
      [
        row.id,
        row.document_id,
        LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA,
        geometry.sha256,
        ENVIRONMENT_GEOMETRY_SCHEMA,
        geometryDigests.v2,
        actorEmail,
        actorName || actorEmail,
      ],
    );
  }
  if (!pending.length) return true;

  const bound = await client.query(
    `SELECT version_id, legacy_environment_geometry_schema,
            legacy_environment_geometry_sha256, environment_geometry_schema,
            environment_geometry_sha256, bound_at
       FROM predrawn_background_geometry_bindings
      WHERE version_id = ANY($1::uuid[])`,
    [pending.map(({ row }) => String(row.id))],
  );
  const bindingByVersion = new Map(bound.rows.map((binding) => [String(binding.version_id), binding]));
  for (const { row, geometry } of pending) {
    const binding = bindingByVersion.get(String(row.id));
    if (
      binding?.legacy_environment_geometry_schema !== LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA
      || binding?.legacy_environment_geometry_sha256 !== geometry.sha256
      || binding?.environment_geometry_schema !== ENVIRONMENT_GEOMETRY_SCHEMA
      || binding?.environment_geometry_sha256 !== geometryDigests.v2
    ) {
      throw editorDocumentError(
        409,
        'predrawn_background_geometry_binding_conflict',
        null,
        'the immutable background version already has a different geometry migration binding',
      );
    }
    row.environment_geometry_binding = binding;
  }
  return true;
}

function backgroundVersionContentDigestMatches(row) {
  const declared = row?.kind === 'raw' || row?.kind === 'source'
    ? row?.provenance?.sourceSha256
    : row?.operation?.outputSha256;
  return /^[0-9a-f]{64}$/.test(declared || '')
    && declared === row?.blob_sha256
    && (
      row?.kind === 'raw'
      || row?.kind === 'source'
      || row?.provenance?.outputSha256 === declared
  );
}

function legacyRawContractBindingCandidate(row) {
  const operation = row?.operation;
  const geometry = backgroundVersionEnvironmentGeometry(row);
  if (
    row?.kind !== 'raw'
    || row.raw_contract_binding
    || !isObjectRecord(operation)
    || operation.kind !== 'raw-generated-v2'
    || Object.hasOwn(operation, 'coordinateBasis')
    || Object.hasOwn(operation, 'viewingPane')
    || geometry?.schema !== LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA
    || !isObjectRecord(row.world_bounds)
  ) return null;
  return {
    legacy_operation_kind: operation.kind,
    legacy_operation_sha256: crypto.createHash('sha256')
      .update(canonicalJson(operation))
      .digest('hex'),
    coordinate_basis: PREDRAWN_COORDINATE_BASIS,
    viewing_pane: row.world_bounds,
  };
}

function backgroundVersionPipelineSourceIssue(row) {
  if (row?.kind !== 'raw') return 'Only Raw Pipeline Sources can start a processing attempt.';
  if (!row.blob_sha256 || !row.width || !row.height) {
    return 'This Raw Pipeline Source has no complete PNG content.';
  }
  if (!['ready', 'published'].includes(row.status)) {
    return `This Raw Pipeline Source is ${row.status || 'not ready'}.`;
  }
  if (!row.pipeline_source_retained) {
    return 'This Raw Pipeline Source is not attached to retained processing history for this Level.';
  }
  if (!backgroundVersionContentDigestMatches(row)) {
    return 'This Raw Pipeline Source content digest does not match its immutable provenance.';
  }
  const storedIssue = backgroundVersionStoredContractIssue(row);
  if (!storedIssue) return null;
  const candidate = legacyRawContractBindingCandidate(row);
  if (candidate) {
    const repairedIssue = backgroundVersionStoredContractIssue({
      ...row,
      raw_contract_binding: candidate,
    });
    if (!repairedIssue) return null;
    return `This historical Raw Pipeline Source cannot be bound: ${repairedIssue}`;
  }
  return `This Raw Pipeline Source is invalid: ${storedIssue}`;
}

async function dbBindLegacyRawContract(
  client,
  row,
  expectedWorldBounds,
  geometryDigests,
  actorEmail,
  actorName,
) {
  const candidate = legacyRawContractBindingCandidate(row);
  const geometry = backgroundVersionEnvironmentGeometry(row);
  const geometryBinding = row?.environment_geometry_binding;
  if (
    !candidate
    || !sameBackgroundWorldBounds(row.world_bounds, expectedWorldBounds)
    || geometry?.schema !== LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA
    || geometry.sha256 !== geometryDigests.v1
    || geometryBinding?.legacy_environment_geometry_schema !== LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA
    || geometryBinding?.legacy_environment_geometry_sha256 !== geometryDigests.v1
    || geometryBinding?.environment_geometry_schema !== ENVIRONMENT_GEOMETRY_SCHEMA
    || geometryBinding?.environment_geometry_sha256 !== geometryDigests.v2
  ) {
    return {
      bound: false,
      issue: backgroundVersionStoredContractIssue(row)
        || 'the legacy raw coordinate contract could not be proven against the saved Level',
    };
  }
  const candidateIssue = backgroundVersionStoredContractIssue({
    ...row,
    raw_contract_binding: candidate,
  });
  if (candidateIssue) return { bound: false, issue: candidateIssue };

  await client.query(
    `INSERT INTO predrawn_background_raw_contract_bindings (
       version_id, document_id, legacy_operation_kind, legacy_operation_sha256,
       coordinate_basis, viewing_pane, bound_by_email, bound_by_name
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     ON CONFLICT (version_id) DO NOTHING`,
    [
      row.id,
      row.document_id,
      candidate.legacy_operation_kind,
      candidate.legacy_operation_sha256,
      candidate.coordinate_basis,
      JSON.stringify(candidate.viewing_pane),
      actorEmail,
      actorName || actorEmail,
    ],
  );
  const bound = await client.query(
    `SELECT legacy_operation_kind, legacy_operation_sha256,
            coordinate_basis, viewing_pane, bound_at
       FROM predrawn_background_raw_contract_bindings
      WHERE version_id = $1 AND document_id = $2`,
    [row.id, row.document_id],
  );
  row.raw_contract_binding = bound.rows[0] || null;
  const storedIssue = backgroundVersionStoredContractIssue(row);
  if (storedIssue) {
    throw editorDocumentError(
      409,
      'predrawn_background_raw_contract_binding_conflict',
      null,
      storedIssue,
    );
  }
  return { bound: true, issue: null };
}

async function dbBackgroundVersionLineageRows(client, requestedIds) {
  const { rows } = await client.query(
    // UNION (not UNION ALL) makes a corrupt cycle finite; the ordered policy
    // walk still reports that cycle explicitly instead of accepting it.
    `WITH RECURSIVE lineage_ids(id) AS (
       SELECT unnest($1::uuid[])
       UNION
       SELECT version.parent_version_id
         FROM predrawn_background_versions version
         JOIN lineage_ids lineage ON lineage.id = version.id
        WHERE version.parent_version_id IS NOT NULL
     )
     SELECT ${BACKGROUND_VERSION_COLUMNS},
            source_document.workspace_kind AS source_workspace_kind,
            source_document.workspace_id AS source_workspace_id,
            source_document.level_id AS source_level_id
       FROM predrawn_background_versions v
       JOIN level_working_copies source_document
         ON source_document.document_id = v.document_id
       LEFT JOIN media_blobs b ON b.sha256 = v.blob_sha256
      WHERE v.id IN (SELECT id FROM lineage_ids)
      ORDER BY v.id
      FOR UPDATE OF v`,
    [requestedIds],
  );
  return rows;
}

async function dbTryBindStoredLevelLegacyBackgroundGeometry(
  client,
  documentRow,
  level,
  actorEmail,
  actorName,
) {
  const surface = decodedVersionedPredrawnSurface(level, { activeOnly: true });
  if (!surface) return false;
  const requestedIds = [surface.background_version_id, surface.occlusion_version_id].filter(Boolean);
  const rows = await dbBackgroundVersionLineageRows(client, requestedIds);
  const versions = new Map(rows.map((row) => [String(row.id), row]));
  if (requestedIds.some((id) => !versions.has(id))) return false;

  const background = versions.get(surface.background_version_id);
  const rawParent = background?.kind === 'warped' && background.parent_version_id
    ? versions.get(String(background.parent_version_id)) || null
    : null;
  const occlusion = surface.occlusion_version_id ? versions.get(surface.occlusion_version_id) : null;
  const sourceDocumentId = background?.document_id;
  const scoped = rows.every((row) => {
    if (row.document_id !== sourceDocumentId) return false;
    if (row.document_id === documentRow.document_id) {
      return row.owner_email === documentRow.owner_email && row.level_id === documentRow.level_id;
    }
    return row.status === 'published'
      && documentRow.workspace_kind === 'official'
      && row.source_workspace_kind === 'official'
      && row.source_workspace_id === documentRow.workspace_id
      && row.source_level_id === documentRow.level_id;
  });
  if (!scoped) return false;

  const backgroundIssue = background?.kind === 'warped'
    ? (
      rawParent
        ? backgroundVersionStoredContractIssue(rawParent)
          || backgroundVersionStoredContractIssue(background, rawParent, rawParent)
        : 'missing raw parent'
    )
    : backgroundVersionStoredContractIssue(background);
  if (backgroundIssue) return false;
  let occlusionLineage = [];
  if (occlusion) {
    const resolved = backgroundVersionStoredOcclusionChain(occlusion, versions, background);
    if (resolved.error) return false;
    occlusionLineage = resolved.value;
  }
  const lineage = [background, rawParent, ...occlusionLineage].filter(Boolean);
  if (!lineage.some(legacyBackgroundVersionNeedsGeometryBinding)) return true;
  return dbBindLegacyBackgroundVersionGeometry(
    client,
    lineage,
    predrawnEnvironmentGeometryDigests(level),
    actorEmail,
    actorName,
  );
}

async function dbPublishLevelBackgroundVersions(
  client,
  documentRow,
  level,
  actorEmail,
  actorName,
  { makePublic = documentRow.workspace_kind === 'official' } = {},
) {
  const surface = decodedVersionedPredrawnSurface(level, { activeOnly: true });
  if (!surface) return [];
  const requestedIds = [surface.background_version_id, surface.occlusion_version_id].filter(Boolean);
  const rows = await dbBackgroundVersionLineageRows(client, requestedIds);
  const versions = new Map(rows.map((row) => [String(row.id), row]));
  if (requestedIds.some((id) => !versions.has(id))) {
    throw editorDocumentError(
      409,
      'predrawn_background_version_not_found',
      documentRow,
      'the selected background versions do not belong to this editor document',
    );
  }
  const background = versions.get(surface.background_version_id);
  const occlusion = surface.occlusion_version_id ? versions.get(surface.occlusion_version_id) : null;
  const rawParent = background?.kind === 'warped' && background.parent_version_id
    ? versions.get(String(background.parent_version_id)) || null
    : null;
  const environmentGeometryDigests = predrawnEnvironmentGeometryDigests(level);
  const selectable = (row) => row && ['ready', 'published'].includes(row.status) && row.blob_sha256;
  const scopedToDocument = (row) => {
    if (!row) return false;
    if (row.document_id === documentRow.document_id) {
      return row.owner_email === documentRow.owner_email && row.level_id === documentRow.level_id;
    }
    // Official publication is collaborative across administrators. A later
    // admin may retain an already-public exact selection created from another
    // admin's working copy for this same official Level. Ready/private rows
    // never cross that document boundary.
    return row.status === 'published'
      && documentRow.workspace_kind === 'official'
      && row.source_workspace_kind === 'official'
      && row.source_workspace_id === documentRow.workspace_id
      && row.source_level_id === documentRow.level_id;
  };
  const supportedBackgroundOperation = background?.kind === 'raw'
    ? background.operation?.kind === 'raw-generated-v2'
    : ['grid-warp-v1', 'grid-warp-v2'].includes(background?.operation?.kind);
  if (
    !selectable(background) || !['raw', 'warped'].includes(background.kind)
    || !supportedBackgroundOperation
    || !backgroundVersionContentDigestMatches(background)
    || !scopedToDocument(background)
  ) {
    throw editorDocumentError(
      409,
      'predrawn_background_version_not_ready',
      documentRow,
      'the selected background is not a ready background version for this level',
    );
  }
  const backgroundContractIssue = background.kind === 'warped'
    ? (
      rawParent
        ? backgroundVersionStoredContractIssue(rawParent)
          || (!backgroundVersionContentDigestMatches(rawParent)
            ? 'warped raw parent content digest does not match its immutable bytes'
            : null)
          || backgroundVersionStoredContractIssue(background, rawParent, rawParent)
        : 'warped source version was not found in its document'
    )
    : backgroundVersionStoredContractIssue(background);
  if (backgroundContractIssue) {
    throw editorDocumentError(
      409,
      'predrawn_background_contract_mismatch',
      documentRow,
      backgroundContractIssue,
    );
  }
  if (
    Number(background.width) !== surface.frame_width
    || Number(background.height) !== surface.frame_height
    || !sameBackgroundWorldBounds(background.world_bounds, surface.world_bounds)
  ) {
    throw editorDocumentError(
      409,
      'predrawn_background_surface_mismatch',
      documentRow,
      'the Level surface dimensions or world bounds do not match the selected background bytes',
    );
  }
  let occlusionLineage = { value: [] };
  if (occlusion) {
    occlusionLineage = backgroundVersionStoredOcclusionChain(occlusion, versions, background);
    const invalidDigest = occlusionLineage.value?.find((row) => (
      !backgroundVersionContentDigestMatches(row)
    ));
    const occlusionContractIssue = occlusionLineage.error
      || (invalidDigest ? 'occlusion lineage content digest does not match its immutable bytes' : null);
    if (occlusionContractIssue) {
      throw editorDocumentError(
        409,
        'predrawn_occlusion_contract_mismatch',
        documentRow,
        occlusionContractIssue,
      );
    }
  }
  if (occlusion && (
    !selectable(occlusion) || occlusion.kind !== 'occlusion'
    || !scopedToDocument(occlusion)
    || String(occlusion.source_background_version_id) !== String(background.id)
    || occlusion.operation?.kind !== 'occlusion-depth-v1'
    || occlusion.operation?.encoding !== 'rgb24-signed-half-depth-alpha'
    || backgroundVersionId(occlusion.operation?.sourceBackgroundVersionId) !== String(background.id)
    || !backgroundVersionContentDigestMatches(occlusion)
    || Number(occlusion.width) !== Number(background.width)
    || Number(occlusion.height) !== Number(background.height)
    || !sameBackgroundWorldBounds(occlusion.world_bounds, background.world_bounds)
  )) {
    throw editorDocumentError(
      409,
      'predrawn_occlusion_version_mismatch',
      documentRow,
      'the selected occlusion output is not a ready mask for the selected background',
    );
  }
  const backgroundGeometryBound = await dbBindLegacyBackgroundVersionGeometry(
    client,
    [background, rawParent, ...(occlusionLineage.value || [])],
    environmentGeometryDigests,
    actorEmail,
    actorName,
  );
  if (
    !backgroundGeometryBound
    || !backgroundVersionHasEnvironmentGeometry(background, environmentGeometryDigests.v2)
    || (rawParent && !backgroundVersionHasEnvironmentGeometry(rawParent, environmentGeometryDigests.v2))
  ) {
    throw editorDocumentError(
      409,
      'predrawn_background_geometry_mismatch',
      documentRow,
      'the selected background was generated for different terrain or scenery geometry',
    );
  }
  if (
    occlusion
    && (occlusionLineage.value || []).some((row) => (
      !backgroundVersionHasEnvironmentGeometry(row, environmentGeometryDigests.v2)
    ))
  ) {
    throw editorDocumentError(
      409,
      'predrawn_occlusion_geometry_mismatch',
      documentRow,
      'the selected occlusion output was generated for different terrain or scenery geometry',
    );
  }
  if (surface.move_highlight_profile) {
    const board = serverRender?.decodeBoard?.(level.boardCode);
    const moveHighlightProfile = board
      ? normalizeMoveHighlightProfile(surface.move_highlight_profile, {
          backgroundVersionId: String(background.id),
          boardColumns: board.cols,
          boardRows: board.rows,
          environmentGeometrySha256: environmentGeometryDigests.v2,
          playableCellKeys: new Set(Object.keys(board.cells)),
        })
      : { error: 'the Level board could not be decoded' };
    if (
      background.kind !== 'warped'
      || moveHighlightProfile.error
      || moveHighlightProfile.value?.profileSha256
        !== surface.move_highlight_profile.profileSha256
    ) {
      throw editorDocumentError(
        409,
        'predrawn_move_highlight_profile_mismatch',
        documentRow,
        moveHighlightProfile.error
          || 'the cyan move-highlight profile is not bound to this exact warped board',
      );
    }
  }

  // A private account Save has a canonical Level but is not a public
  // publication. Its exact references are validated and committed while the
  // bytes remain owner-scoped. Official publication and an explicit public-map
  // snapshot are the only boundaries that make selected bytes anonymous.
  if (!makePublic) return requestedIds;

  const newlyPublished = [background, occlusion].filter((row) => row && row.status === 'ready');
  if (newlyPublished.length) {
    const ids = newlyPublished.map((row) => String(row.id));
    await client.query(
      `UPDATE predrawn_background_versions
          SET status = 'published', published_at = now(), published_by = $2,
              row_revision = row_revision + 1, updated_at = now(), updated_by = $2
        WHERE id = ANY($1::uuid[])`,
      [ids, actorEmail],
    );
    await client.query(
      `UPDATE media_blobs SET published_at = COALESCE(published_at, now())
        WHERE sha256 = ANY($1::text[])`,
      [newlyPublished.map((row) => row.blob_sha256)],
    );
    for (const row of newlyPublished) {
      await dbRecordBackgroundVersionEvent(client, row, 'published', actorEmail, actorName, {
        content_sha256: row.blob_sha256,
        publication_boundary: documentRow.workspace_kind === 'official' ? 'official' : 'public-map',
      });
    }
  }
  return requestedIds;
}

async function dbApplyWorkspaceBackgroundVersionBoundary(
  client,
  {
    workspaceKind,
    workspaceId,
    ownerEmail,
    levels,
    actorEmail,
    actorName,
    makePublic,
  },
) {
  for (const [levelId, level] of Object.entries(levels)) {
    const surface = decodedVersionedPredrawnSurface(level, { activeOnly: true });
    if (!surface) continue;
    const sourceDocumentResult = await client.query(
      `SELECT source_document.document_id, source_document.owner_email,
               source_document.workspace_kind, source_document.workspace_id,
               source_document.level_id
         FROM predrawn_background_versions v
         JOIN level_working_copies source_document
           ON source_document.document_id = v.document_id
        WHERE v.id = $1`,
      [surface.background_version_id],
    );
    const sourceDocument = sourceDocumentResult.rows[0];
    const inWorkspace = sourceDocument
      && sourceDocument.workspace_kind === workspaceKind
      && sourceDocument.workspace_id === workspaceId
      && sourceDocument.level_id === levelId
      && (workspaceKind !== 'user' || sourceDocument.owner_email === ownerEmail);
    if (!inWorkspace) {
      throw editorDocumentError(
        409,
        'predrawn_background_version_not_found',
        null,
        'the selected background is not owned by this exact workspace Level',
      );
    }
    const requestedIds = [surface.background_version_id, surface.occlusion_version_id].filter(Boolean);
    const selectedVersions = await client.query(
      `SELECT id, document_id, status
         FROM predrawn_background_versions
        WHERE id = ANY($1::uuid[])`,
      [requestedIds],
    );
    const allFromSourceDocument = selectedVersions.rows.length === requestedIds.length
      && selectedVersions.rows.every((row) => row.document_id === sourceDocument.document_id);
    const mayUseForeignOfficialSelection = workspaceKind !== 'official'
      || sourceDocument.owner_email === actorEmail
      || (allFromSourceDocument && selectedVersions.rows.every((row) => row.status === 'published'));
    if (!allFromSourceDocument || !mayUseForeignOfficialSelection) {
      throw editorDocumentError(
        409,
        'predrawn_background_version_not_found',
        null,
        'the selected background is not owned by this actor or already published for this exact official Level',
      );
    }
    try {
      await dbPublishLevelBackgroundVersions(
        client,
        sourceDocument,
        level,
        actorEmail,
        actorName,
        { makePublic },
      );
    } catch (error) {
      // Whole-workspace writers have no editor-document recovery contract. Do
      // not project a different admin's private working copy through a crafted
      // global payload when exact-version validation fails.
      if (error?.statusCode && error?.responseCode) {
        error.row = null;
        error.session = null;
        error.presence = null;
        error.recovery = null;
      }
      throw error;
    }
  }
}

async function dbSaveEditorDocument(ownerEmail, documentId, expectedRevision, requestedLevel, campaignId, sessionId, editGeneration, sessionKeyHash) {
  return withEditorDocumentTransaction(async (client) => {
    const current = await dbLockEditorDocument(client, ownerEmail, documentId);
    if (!current) throw editorDocumentError(404, 'editor_document_not_found');
    const session = await assertActiveEditorEditSession(client, current, sessionId, editGeneration, sessionKeyHash);
    assertEditorDocumentRevision(current, expectedRevision, currentEditorSessionContext(current, session));
    const workspace = { kind: current.workspace_kind, id: current.workspace_id };
    const levelId = current.level_id;
    const level = requestedLevel || current.body;
    if (workspace.kind === 'user') {
      // PostgreSQL cannot row-lock an absent workspace. Materialize the empty
      // owner row first so a concurrent whole-workspace insert must serialize
      // before the baseline check for a never-saved document.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [ownerEmail]);
      await client.query(
        `INSERT INTO campaign_workspaces (owner_email, body)
         VALUES ($1, '{"campaigns":[],"wars":[],"levels":{}}'::jsonb)
         ON CONFLICT (owner_email) DO NOTHING`,
        [ownerEmail],
      );
    }
    const canonical = await dbCanonicalLevel(client, ownerEmail, workspace, levelId, { lock: true });
    if (editorDocumentBaselineChanged(current, canonical)) {
      throw editorDocumentError(
        409,
        'editor_document_baseline_conflict',
        { ...current, baseline_conflict: true },
        'canonical Level changed after this working copy was based on it',
      );
    }
    await withThumbnailRenderInputs(() => dbPublishLevelBackgroundVersions(
      client,
      current,
      level,
      ownerEmail,
      session.actor_name,
    ), client);
    const workspaceRevision = await dbPromoteCanonicalLevel(client, ownerEmail, workspace, levelId, level, campaignId);
    const baselineHash = await dbJsonbHash(client, level);
    const { rows } = await client.query(
      `UPDATE level_working_copies
          SET body = $3::jsonb,
              revision = revision + 1,
              saved_revision = revision + 1,
              baseline_hash = $4,
              updated_at = clock_timestamp()
        WHERE owner_email = $1 AND document_id = $2
        RETURNING ${EDITOR_DOCUMENT_COLUMNS}`,
      [ownerEmail, documentId, JSON.stringify(level), baselineHash],
    );
    await dbRecordEditorDocumentRevision(client, rows[0], 'save');
    await dbTouchEditorSessionAfterWrite(client, session, rows[0], 'document_saved', current.revision);
    return { row: rows[0], workspaceRevision };
  });
}

async function dbDiscardEditorDocument(ownerEmail, documentId, expectedRevision, sessionId, editGeneration, sessionKeyHash) {
  return withEditorDocumentTransaction(async (client) => {
    const current = await dbLockEditorDocument(client, ownerEmail, documentId);
    if (!current) throw editorDocumentError(404, 'editor_document_not_found');
    const session = await assertActiveEditorEditSession(client, current, sessionId, editGeneration, sessionKeyHash);
    assertEditorDocumentRevision(current, expectedRevision, currentEditorSessionContext(current, session));
    const workspace = { kind: current.workspace_kind, id: current.workspace_id };
    const levelId = current.level_id;
    const canonical = await dbCanonicalLevel(client, ownerEmail, workspace, levelId, { lock: true });
    if (!canonical.level) throw editorDocumentError(409, 'no_saved_level');
    const parsed = editorDocumentLevel(canonical.level, levelId);
    if (parsed.error) throw editorDocumentError(409, 'saved_level_invalid', null, parsed.details);
    const { rows } = await client.query(
      `UPDATE level_working_copies
          SET body = $3::jsonb,
              revision = revision + 1,
              saved_revision = revision + 1,
              baseline_hash = $4,
              updated_at = clock_timestamp()
        WHERE owner_email = $1 AND document_id = $2
        RETURNING ${EDITOR_DOCUMENT_COLUMNS}`,
      [ownerEmail, documentId, JSON.stringify(parsed.level), canonical.hash],
    );
    await dbRecordEditorDocumentRevision(client, rows[0], 'discard');
    await dbTouchEditorSessionAfterWrite(client, session, rows[0], 'document_discarded', current.revision);
    return rows[0];
  });
}

async function dbDeleteNeverSavedEditorDocument(ownerEmail, documentId, expectedRevision, sessionId, editGeneration, sessionKeyHash, { allowOfficial = false } = {}) {
  return withEditorDocumentTransaction(async (client) => {
    const current = await dbLockEditorDocument(client, ownerEmail, documentId);
    if (!current) throw editorDocumentError(404, 'editor_document_not_found');
    if (current.workspace_kind === 'official' && !allowOfficial) {
      throw editorDocumentError(403, 'admin_required');
    }
    const session = await assertActiveEditorEditSession(client, current, sessionId, editGeneration, sessionKeyHash);
    assertEditorDocumentRevision(current, expectedRevision, currentEditorSessionContext(current, session));
    // Deleting a saved-baseline document would discard its stable editor address and
    // blur the boundary between private working-copy cleanup and canonical Level deletion.
    // This operation is intentionally limited to documents that have never crossed Save.
    if (current.baseline_hash !== null || Number(current.saved_revision) !== 0) {
      throw editorDocumentError(
        409,
        'editor_document_delete_requires_never_saved',
        current,
        'only a never-saved working copy can be deleted',
      );
    }
    const { rows } = await client.query(
      `DELETE FROM level_working_copies
        WHERE owner_email = $1
          AND document_id = $2
          AND revision = $3
          AND baseline_hash IS NULL
          AND saved_revision = 0
      RETURNING ${EDITOR_DOCUMENT_COLUMNS}`,
      [ownerEmail, documentId, expectedRevision],
    );
    if (!rows[0]) {
      throw editorDocumentError(
        409,
        'editor_document_delete_requires_never_saved',
        current,
        'only a never-saved working copy can be deleted',
      );
    }
    await dbRecordEditorEditEvent(client, session, 'document_deleted', {
      revision: expectedRevision,
      edit_generation: editGeneration,
    });
    return rows[0];
  });
}

function editorDocumentResolveRequest(req, res) {
  const raw = isObjectRecord(req.body) ? req.body : {};
  const workspace = editorDocumentWorkspace(raw);
  if (workspace.error) { res.status(400).json({ error: workspace.error }); return null; }
  const rawLevelId = raw.level_id;
  const levelId = rawLevelId === undefined || rawLevelId === null || rawLevelId === '' ? '' : levelStoreId(rawLevelId);
  if (rawLevelId && !levelId) { res.status(400).json({ error: 'invalid_level_id' }); return null; }
  return { raw, workspace, levelId };
}

function editorDocumentOperationRequest(req, res) {
  const documentId = editorDocumentId(req.params.documentId);
  if (!documentId) { res.status(400).json({ error: 'invalid_editor_document_id' }); return null; }
  return { documentId, raw: isObjectRecord(req.body) ? req.body : {} };
}

function editorEditSessionOpenRequest(req, res) {
  const operation = editorDocumentOperationRequest(req, res);
  if (!operation) return null;
  const sessionId = editorEditSessionId(operation.raw.session_id);
  const deviceId = editorDeviceId(operation.raw.device_id);
  const sessionKey = editorSessionKey(operation.raw.session_key);
  const rawIntent = operation.raw.intent ?? req.get('x-level-editor-session-intent') ?? 'write';
  const intent = rawIntent === 'write' || rawIntent === 'observe' ? rawIntent : null;
  if (!sessionId || !deviceId || !sessionKey) {
    res.status(400).json({ error: 'invalid_editor_document_edit_session' });
    return null;
  }
  if (!intent) {
    res.status(400).json({ error: 'invalid_editor_document_edit_session_intent' });
    return null;
  }
  return {
    ...operation,
    sessionId,
    deviceHash: editorDeviceHash(deviceId),
    sessionKeyHash: editorSessionKeyHash(sessionKey),
    clientLabel: clampText(operation.raw.client_label, '', 120),
    intent,
  };
}

function editorEditSessionOperationRequest(req, res) {
  const operation = editorDocumentOperationRequest(req, res);
  if (!operation) return null;
  const sessionId = editorEditSessionId(req.params.sessionId);
  const sessionKey = editorSessionKey(operation.raw.session_key);
  if (!sessionId || !sessionKey) { res.status(400).json({ error: 'invalid_editor_document_edit_session' }); return null; }
  return { ...operation, sessionId, sessionKeyHash: editorSessionKeyHash(sessionKey) };
}

function editorEditPresenceRequest(req, res) {
  const documentId = editorDocumentId(req.params.documentId);
  const raw = isObjectRecord(req.body) ? req.body : {};
  const sessionId = editorEditSessionId(raw.session_id);
  const deviceId = editorDeviceId(raw.device_id);
  const sessionKey = editorSessionKey(raw.session_key);
  if (!documentId) { res.status(400).json({ error: 'invalid_editor_document_id' }); return null; }
  if (!sessionId || !deviceId || !sessionKey) {
    res.status(400).json({ error: 'invalid_editor_document_edit_session' });
    return null;
  }
  return {
    documentId,
    sessionId,
    deviceHash: editorDeviceHash(deviceId),
    sessionKeyHash: editorSessionKeyHash(sessionKey),
  };
}

function editorDocumentMutationAuthority(raw, res) {
  const sessionId = editorEditSessionId(raw.edit_session_id);
  const editGeneration = editorEditGeneration(raw.edit_generation);
  const sessionKey = editorSessionKey(raw.edit_session_key);
  if (!sessionId || editGeneration === null || !sessionKey) {
    res.status(400).json({ error: 'editor_document_edit_session_required' });
    return null;
  }
  return { sessionId, editGeneration, sessionKeyHash: editorSessionKeyHash(sessionKey) };
}

function backgroundVersionMutationAuthority(req, res) {
  const raw = isObjectRecord(req.body) ? req.body : {};
  const sessionId = editorEditSessionId(
    raw.edit_session_id ?? req.get('x-editor-edit-session-id'),
  );
  const suppliedGeneration = raw.edit_generation ?? req.get('x-editor-edit-generation');
  const parsedGeneration = typeof suppliedGeneration === 'string' && /^\d+$/.test(suppliedGeneration)
    ? Number(suppliedGeneration)
    : suppliedGeneration;
  const editGeneration = editorEditGeneration(parsedGeneration);
  const sessionKey = editorSessionKey(
    raw.edit_session_key ?? req.get('x-editor-edit-session-key'),
  );
  if (!sessionId || editGeneration === null || !sessionKey) {
    res.status(400).json({ error: 'editor_document_edit_session_required' });
    return null;
  }
  return { sessionId, editGeneration, sessionKeyHash: editorSessionKeyHash(sessionKey) };
}

function editorRecoveryOperationRequest(req, res) {
  const documentId = editorDocumentId(req.params.documentId);
  const recoveryId = editorEditSessionId(req.params.recoveryId);
  if (!documentId) { res.status(400).json({ error: 'invalid_editor_document_id' }); return null; }
  if (!recoveryId) { res.status(400).json({ error: 'invalid_editor_document_recovery_id' }); return null; }
  return { documentId, recoveryId, raw: isObjectRecord(req.body) ? req.body : {} };
}

function editorRecoveryIds(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const recoveryIds = raw.map((value) => editorEditSessionId(value));
  if (recoveryIds.some((recoveryId) => !recoveryId)) return null;
  if (new Set(recoveryIds).size !== recoveryIds.length) return null;
  return recoveryIds;
}

function editorSessionResponse(result) {
  return {
    session: publicEditorEditSession(result.session),
    presence: result.presence,
  };
}

function editorDocumentListRequest(req, res) {
  const status = String(req.query.status || 'all').trim().toLowerCase();
  if (!['all', 'dirty', 'never-saved'].includes(status)) {
    res.status(400).json({ error: 'invalid_editor_document_status' });
    return null;
  }
  const parseInteger = (raw, fallback) => {
    if (raw === undefined) return fallback;
    const text = String(raw);
    if (!/^\d+$/.test(text)) return null;
    const value = Number(text);
    return Number.isSafeInteger(value) ? value : null;
  };
  const limit = parseInteger(req.query.limit, 100);
  const offset = parseInteger(req.query.offset, 0);
  if (limit === null || limit < 1 || limit > 200 || offset === null || offset < 0) {
    res.status(400).json({ error: 'invalid_editor_document_page' });
    return null;
  }
  return { status, limit, offset };
}

function editorDocumentHistoryRequest(req, res) {
  const parseInteger = (raw, fallback) => {
    if (raw === undefined) return fallback;
    const text = String(raw);
    if (!/^\d+$/.test(text)) return null;
    const value = Number(text);
    return Number.isSafeInteger(value) ? value : null;
  };
  const limit = parseInteger(req.query.limit, EDITOR_DOCUMENT_HISTORY_PAGE_LIMIT);
  const beforeRevision = parseInteger(req.query.before, null);
  if (
    limit === null || limit < 1 || limit > EDITOR_DOCUMENT_HISTORY_PAGE_LIMIT
    || (beforeRevision !== null && beforeRevision < 1)
  ) {
    res.status(400).json({ error: 'invalid_editor_document_history_page' });
    return null;
  }
  return { limit, beforeRevision };
}

async function requireEditorDocumentUser(req, res, workspace) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (workspace.kind === 'official' && !isAdminEmail(user.email)) {
    res.status(403).json({ error: 'admin_required' });
    return null;
  }
  return user;
}

function editorDocumentRowIsAuthorized(row, user, res) {
  if (row.workspace_kind === 'official' && !isAdminEmail(user.email)) {
    res.status(403).json({ error: 'admin_required' });
    return false;
  }
  return true;
}

app.post('/api/editor-documents/resolve', async (req, res) => {
  const input = editorDocumentResolveRequest(req, res);
  if (!input) return;
  const user = await requireEditorDocumentUser(req, res, input.workspace);
  if (!user) return;
  try {
    if (!input.levelId) {
      if (input.workspace.kind !== 'user') { res.status(400).json({ error: 'level_id_required' }); return; }
      if (!isObjectRecord(input.raw.level)) { res.status(400).json({ error: 'invalid_level_body' }); return; }
      const row = await dbCreateEditorDocument(user.email, input.raw.level);
      res.status(201).json({ document: publicEditorDocument(row) });
      return;
    }
    const result = await dbResolveEditorDocument(user.email, input.workspace, input.levelId);
    res.status(result.created ? 201 : 200).json({ document: publicEditorDocument(result.row) });
  } catch (error) {
    respondEditorDocumentError(res, error, 'resolve');
  }
});

app.get('/api/editor-documents', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const page = editorDocumentListRequest(req, res);
  if (!page) return;
  try {
    const rows = await dbListEditorDocuments(user.email, {
      includeOfficial: isAdminEmail(user.email),
      ...page,
    });
    const hasMore = rows.length > page.limit;
    const documents = rows.slice(0, page.limit).map(publicEditorDocumentSummary);
    res.status(200).json({
      documents,
      next_offset: hasMore ? page.offset + page.limit : null,
    });
  } catch (error) {
    respondEditorDocumentError(res, error, 'list');
  }
});

app.get('/api/editor-documents/:documentId/revisions', async (req, res) => {
  const input = editorDocumentOperationRequest(req, res);
  if (!input) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const page = editorDocumentHistoryRequest(req, res);
  if (!page) return;
  try {
    // Revision discovery and restore are owner operations. ADR-0132's exact-link
    // admin exception remains limited to the current-document GET.
    const current = await dbGetEditorDocument(user.email, input.documentId);
    if (!current) { res.status(404).json({ error: 'editor_document_not_found' }); return; }
    if (!editorDocumentRowIsAuthorized(current, user, res)) return;
    const rows = await dbListEditorDocumentRevisions(user.email, input.documentId, page);
    const hasMore = rows.length > page.limit;
    const revisions = rows.slice(0, page.limit).map(publicEditorDocumentRevision);
    res.status(200).json({
      revisions,
      next_before: hasMore && revisions.length ? revisions[revisions.length - 1].revision : null,
    });
  } catch (error) {
    respondEditorDocumentError(res, error, 'history list');
  }
});

app.post('/api/editor-documents/:documentId/revisions/restore', async (req, res) => {
  const input = editorDocumentOperationRequest(req, res);
  if (!input) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const revision = editorDocumentRevision(input.raw.revision);
  const targetRevision = editorDocumentRevision(input.raw.target_revision);
  if (revision === null) { res.status(400).json({ error: 'revision_required' }); return; }
  if (targetRevision === null) { res.status(400).json({ error: 'target_revision_required' }); return; }
  try {
    const current = await dbGetEditorDocument(user.email, input.documentId);
    if (!current) { res.status(404).json({ error: 'editor_document_not_found' }); return; }
    if (!editorDocumentRowIsAuthorized(current, user, res)) return;
    const authority = editorDocumentMutationAuthority(input.raw, res);
    if (!authority) return;
    const row = await dbRestoreEditorDocumentRevision(
      user.email,
      input.documentId,
      revision,
      targetRevision,
      authority.sessionId,
      authority.editGeneration,
      authority.sessionKeyHash,
    );
    res.status(200).json({ document: publicEditorDocument(row) });
  } catch (error) {
    respondEditorDocumentError(res, error, 'history restore');
  }
});

app.get('/api/editor-documents/:documentId', async (req, res) => {
  const input = editorDocumentOperationRequest(req, res);
  if (!input) return;
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    // An opaque document link is sufficient discovery for an authenticated admin,
    // but it does not broaden the owner-scoped list or any mutation endpoint.
    const stored = await dbGetEditorDocumentForViewer(user.email, input.documentId);
    if (!stored) { res.status(404).json({ error: 'editor_document_not_found' }); return; }
    if (!editorDocumentRowIsAuthorized(stored, user, res)) return;
    const row = await dbLoadEditorDocument(stored.owner_email, input.documentId);
    if (!row) { res.status(404).json({ error: 'editor_document_not_found' }); return; }
    res.status(200).json({ document: publicEditorDocument(row) });
  } catch (error) {
    respondEditorDocumentError(res, error, 'read');
  }
});

app.post('/api/editor-documents/:documentId/edit-sessions', async (req, res) => {
  const input = editorEditSessionOpenRequest(req, res);
  if (!input) return;
  const authenticated = await requireUser(req, res);
  if (!authenticated) return;
  try {
    const stored = await dbGetEditorDocument(authenticated.email, input.documentId);
    if (!stored) { res.status(404).json({ error: 'editor_document_not_found' }); return; }
    if (!editorDocumentRowIsAuthorized(stored, authenticated, res)) return;
    const owner = await withDisplayName(authenticated);
    const result = await dbOpenEditorEditSession(owner, input.documentId, input);
    res.status(200).json(editorSessionResponse(result));
  } catch (error) {
    respondEditorDocumentError(res, error, 'open edit session');
  }
});

app.post('/api/editor-documents/:documentId/edit-sessions/:sessionId/heartbeat', async (req, res) => {
  const input = editorEditSessionOperationRequest(req, res);
  if (!input) return;
  const authenticated = await requireUser(req, res);
  if (!authenticated) return;
  try {
    const stored = await dbGetEditorDocument(authenticated.email, input.documentId);
    if (!stored) { res.status(404).json({ error: 'editor_document_not_found' }); return; }
    if (!editorDocumentRowIsAuthorized(stored, authenticated, res)) return;
    const owner = await withDisplayName(authenticated);
    const result = await dbHeartbeatEditorEditSession(owner, input.documentId, input.sessionId, input.sessionKeyHash);
    res.status(200).json(editorSessionResponse(result));
  } catch (error) {
    respondEditorDocumentError(res, error, 'heartbeat edit session');
  }
});

app.delete('/api/editor-documents/:documentId/edit-sessions/:sessionId', async (req, res) => {
  const input = editorEditSessionOperationRequest(req, res);
  if (!input) return;
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const stored = await dbGetEditorDocument(user.email, input.documentId);
    if (!stored) { res.status(404).json({ error: 'editor_document_not_found' }); return; }
    if (!editorDocumentRowIsAuthorized(stored, user, res)) return;
    const result = await dbCloseEditorEditSession(user.email, input.documentId, input.sessionId, input.sessionKeyHash);
    res.status(200).json(editorSessionResponse(result));
  } catch (error) {
    respondEditorDocumentError(res, error, 'close edit session');
  }
});

app.post('/api/editor-documents/:documentId/edit-presence', async (req, res) => {
  const input = editorEditPresenceRequest(req, res);
  if (!input) return;
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const stored = await dbGetEditorDocument(user.email, input.documentId);
    if (!stored) { res.status(404).json({ error: 'editor_document_not_found' }); return; }
    if (!editorDocumentRowIsAuthorized(stored, user, res)) return;
    const result = await dbGetEditorPresence(
      user.email,
      input.documentId,
      input.sessionId,
      input.deviceHash,
      input.sessionKeyHash,
    );
    res.status(200).json(editorSessionResponse({
      session: result.requesterSession,
      presence: result.presence,
      recovery: result.recovery,
    }));
  } catch (error) {
    respondEditorDocumentError(res, error, 'read edit presence');
  }
});

app.put('/api/editor-documents/:documentId', async (req, res) => {
  const input = editorDocumentOperationRequest(req, res);
  if (!input) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const revision = editorDocumentRevision(input.raw.revision);
  if (revision === null) { res.status(400).json({ error: 'revision_required' }); return; }
  try {
    const current = await dbGetEditorDocument(user.email, input.documentId);
    if (!current) { res.status(404).json({ error: 'editor_document_not_found' }); return; }
    if (!editorDocumentRowIsAuthorized(current, user, res)) return;
    const authority = editorDocumentMutationAuthority(input.raw, res);
    if (!authority) return;
    const parsed = editorDocumentLevel(input.raw.level, current.level_id);
    if (parsed.error) { res.status(400).json({ error: parsed.error, ...(parsed.details ? { details: parsed.details } : {}) }); return; }
    const parsedBase = editorDocumentLevel(input.raw.base_level, current.level_id);
    if (parsedBase.error) { res.status(400).json({ error: 'base_level_required', ...(parsedBase.details ? { details: parsedBase.details } : {}) }); return; }
    const row = await dbAutosaveEditorDocument(
      user.email,
      input.documentId,
      revision,
      parsedBase.level,
      parsed.level,
      authority.sessionId,
      authority.editGeneration,
      authority.sessionKeyHash,
    );
    res.status(200).json({ document: publicEditorDocument(row) });
  } catch (error) {
    respondEditorDocumentError(res, error, 'autosave');
  }
});

app.delete('/api/editor-documents/:documentId', async (req, res) => {
  const input = editorDocumentOperationRequest(req, res);
  if (!input) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const revision = editorDocumentRevision(input.raw.revision);
  if (revision === null) { res.status(400).json({ error: 'revision_required' }); return; }
  try {
    const current = await dbGetEditorDocument(user.email, input.documentId);
    if (!current) { res.status(404).json({ error: 'editor_document_not_found' }); return; }
    if (!editorDocumentRowIsAuthorized(current, user, res)) return;
    const authority = editorDocumentMutationAuthority(input.raw, res);
    if (!authority) return;
    const row = await dbDeleteNeverSavedEditorDocument(
      user.email,
      input.documentId,
      revision,
      authority.sessionId,
      authority.editGeneration,
      authority.sessionKeyHash,
      { allowOfficial: isAdminEmail(user.email) },
    );
    res.status(200).json({ document: publicEditorDocument(row) });
  } catch (error) {
    respondEditorDocumentError(res, error, 'delete');
  }
});

app.post('/api/editor-documents/:documentId/save', async (req, res) => {
  const input = editorDocumentOperationRequest(req, res);
  if (!input) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const revision = editorDocumentRevision(input.raw.revision);
  if (revision === null) { res.status(400).json({ error: 'revision_required' }); return; }
  try {
    const current = await dbGetEditorDocument(user.email, input.documentId);
    if (!current) { res.status(404).json({ error: 'editor_document_not_found' }); return; }
    if (!editorDocumentRowIsAuthorized(current, user, res)) return;
    const authority = editorDocumentMutationAuthority(input.raw, res);
    if (!authority) return;
    let level = null;
    if (Object.hasOwn(input.raw, 'level')) {
      const parsed = editorDocumentLevel(input.raw.level, current.level_id);
      if (parsed.error) { res.status(400).json({ error: parsed.error, ...(parsed.details ? { details: parsed.details } : {}) }); return; }
      level = parsed.level;
    }
    let campaignId;
    if (Object.hasOwn(input.raw, 'campaign_id')) {
      if (input.raw.campaign_id === null) {
        campaignId = null;
      } else if (typeof input.raw.campaign_id === 'string' && input.raw.campaign_id.trim() && input.raw.campaign_id.length <= 200) {
        campaignId = input.raw.campaign_id.trim();
      } else {
        res.status(400).json({ error: 'invalid_campaign_id' });
        return;
      }
    }
    const saved = await dbSaveEditorDocument(
      user.email,
      input.documentId,
      revision,
      level,
      campaignId,
      authority.sessionId,
      authority.editGeneration,
      authority.sessionKeyHash,
    );
    const thumbnailAuthority = current.workspace_kind === 'official'
      ? `official:${current.workspace_id}:${current.level_id}`
      : `user:${user.email}:${current.level_id}`;
    let thumbnailReady = true;
    try {
      await ensureLevelThumbnailDerivative(thumbnailAuthority, saved.row.body);
    } catch (thumbnailError) {
      // The canonical save has already committed. Never report that durable user
      // work failed merely because its disposable list derivative could not be
      // prepared; the read-through route will retry generation on the next read.
      thumbnailReady = false;
      console.error('saved level thumbnail preparation failed:', thumbnailError && thumbnailError.message);
    }
    res.status(200).json({
      document: publicEditorDocument(saved.row),
      workspace_revision: saved.workspaceRevision,
      thumbnail_ready: thumbnailReady,
    });
  } catch (error) {
    respondEditorDocumentError(res, error, 'save');
  }
});

app.post('/api/editor-documents/:documentId/discard', async (req, res) => {
  const input = editorDocumentOperationRequest(req, res);
  if (!input) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const revision = editorDocumentRevision(input.raw.revision);
  if (revision === null) { res.status(400).json({ error: 'revision_required' }); return; }
  try {
    const current = await dbGetEditorDocument(user.email, input.documentId);
    if (!current) { res.status(404).json({ error: 'editor_document_not_found' }); return; }
    if (!editorDocumentRowIsAuthorized(current, user, res)) return;
    const authority = editorDocumentMutationAuthority(input.raw, res);
    if (!authority) return;
    const row = await dbDiscardEditorDocument(
      user.email,
      input.documentId,
      revision,
      authority.sessionId,
      authority.editGeneration,
      authority.sessionKeyHash,
    );
    res.status(200).json({ document: publicEditorDocument(row) });
  } catch (error) {
    respondEditorDocumentError(res, error, 'discard');
  }
});

function backgroundVersionIdempotencyKey(req, raw) {
  const header = req.get('idempotency-key');
  const body = isObjectRecord(raw) ? raw.idempotency_key ?? raw.idempotencyKey : undefined;
  if (header !== undefined && body !== undefined && String(header).trim() !== String(body).trim()) {
    throw backgroundVersionError(400, 'invalid_background_version_idempotency_key', 'header and body keys differ');
  }
  if (header === undefined && body === undefined) return null;
  const value = normalizeBackgroundVersionIdempotencyKey(header ?? body);
  if (!value) {
    throw backgroundVersionError(400, 'invalid_background_version_idempotency_key');
  }
  return value;
}

function requireBackgroundVersionExpectedRevision(req) {
  const expected = mediaExpectedRevision(req);
  if (expected === null) throw backgroundVersionError(428, 'background_version_expected_revision_required');
  return expected;
}

function assertBackgroundVersionRevision(row, expected) {
  if (Number(row.row_revision) !== expected) {
    throw backgroundVersionError(409, 'background_version_conflict', {
      current_revision: Number(row.row_revision),
    });
  }
}

function normalizeGenerationAttemptCreate(raw) {
  if (!isObjectRecord(raw)) return { error: 'body must be an object' };
  const allowed = new Set([
    'label',
    'source_version_id', 'sourceVersionId',
    'pipeline_source_version_id', 'pipelineSourceVersionId',
    'idempotency_key', 'idempotencyKey',
    'edit_session_id', 'edit_session_key', 'edit_generation',
  ]);
  const unsupported = Object.keys(raw).filter((key) => !allowed.has(key));
  if (unsupported.length) return { error: `unsupported fields: ${unsupported.sort().join(', ')}` };
  if (Object.hasOwn(raw, 'source_version_id') && Object.hasOwn(raw, 'sourceVersionId')) {
    return { error: 'source_version_id must not be supplied twice' };
  }
  if (
    Object.hasOwn(raw, 'pipeline_source_version_id')
    && Object.hasOwn(raw, 'pipelineSourceVersionId')
  ) {
    return { error: 'pipeline_source_version_id must not be supplied twice' };
  }
  const sourceVersionRaw = raw.source_version_id ?? raw.sourceVersionId;
  const pipelineSourceVersionRaw = raw.pipeline_source_version_id ?? raw.pipelineSourceVersionId;
  const hasGenerationReference = sourceVersionRaw !== undefined;
  const hasPipelineSource = pipelineSourceVersionRaw !== undefined;
  if (hasGenerationReference === hasPipelineSource) {
    return {
      error: 'supply either source_version_id or pipeline_source_version_id, not both',
    };
  }
  let sourceVersionId;
  let origin;
  if (hasGenerationReference) {
    sourceVersionId = backgroundVersionId(sourceVersionRaw);
    if (!sourceVersionId) return { error: 'source_version_id must be a UUID' };
    origin = 'source';
  } else {
    sourceVersionId = backgroundVersionId(pipelineSourceVersionRaw);
    if (!sourceVersionId) return { error: 'pipeline_source_version_id must be a UUID' };
    origin = 'pipeline-source';
  }
  const label = raw.label === undefined ? 'AI artwork attempt' : String(raw.label).trim();
  if (!label || label.length > 160) return { error: 'label must contain 1 to 160 characters' };
  return {
    value: {
      label,
      origin,
      source_version_id: sourceVersionId,
    },
  };
}

function generationAttemptIdempotencyKey(req, raw) {
  const header = req.get('idempotency-key');
  const body = isObjectRecord(raw) ? raw.idempotency_key ?? raw.idempotencyKey : undefined;
  if (header !== undefined && body !== undefined && String(header).trim() !== String(body).trim()) {
    throw backgroundVersionError(400, 'invalid_generation_attempt_idempotency_key', 'header and body keys differ');
  }
  if (header === undefined && body === undefined) return null;
  const value = normalizeBackgroundVersionIdempotencyKey(header ?? body);
  if (!value) throw backgroundVersionError(400, 'invalid_generation_attempt_idempotency_key');
  return value;
}

async function dbListGenerationAttempts(documentRow, status = 'all') {
  await ensureDbReady();
  const { rows } = await pool.query(
    `SELECT ${GENERATION_ATTEMPT_COLUMNS}
       FROM predrawn_generation_attempts attempt
      WHERE attempt.document_id = $1
        AND ($2::text = 'all' OR attempt.status = $2)
      ORDER BY attempt.created_at DESC, attempt.id DESC`,
    [documentRow.document_id, status],
  );
  return rows;
}

async function dbValidatedPipelineSourceAttemptInput(
  client,
  currentDocument,
  documentRow,
  user,
  writerSession,
  source,
  preferredSourceAttempt = null,
) {
  if (!source) {
    throw backgroundVersionError(
      404,
      'generation_attempt_pipeline_source_not_found',
      'The selected Raw Pipeline Source was not found in this Level document.',
    );
  }
  if (
    source.owner_email !== documentRow.owner_email
    || source.level_id !== documentRow.level_id
  ) {
    throw backgroundVersionError(
      409,
      'generation_attempt_pipeline_source_wrong_level',
      'The selected Raw Pipeline Source does not belong to this Level.',
    );
  }
  const pipelineSourceIssue = backgroundVersionPipelineSourceIssue(source);
  if (pipelineSourceIssue) {
    throw backgroundVersionError(
      409,
      'generation_attempt_pipeline_source_not_ready',
      pipelineSourceIssue,
    );
  }

  let sourceAttempt = preferredSourceAttempt;
  if (!sourceAttempt) {
    const sourceAttemptResult = await client.query(
      `SELECT id
         FROM predrawn_generation_attempts
        WHERE document_id = $1
          AND owner_email = $2
          AND level_id = $3
          AND generated_version_id = $4
        ORDER BY
          CASE WHEN origin = 'pipeline-source' THEN 1 ELSE 0 END,
          created_at ASC,
          id ASC
        LIMIT 1
        FOR UPDATE`,
      [
        documentRow.document_id,
        documentRow.owner_email,
        documentRow.level_id,
        source.id,
      ],
    );
    sourceAttempt = sourceAttemptResult.rows[0]
      ? await dbGenerationAttemptRow(
          documentRow.document_id,
          sourceAttemptResult.rows[0].id,
          client,
          { lock: true },
        )
      : null;
  }
  if (
    !sourceAttempt
    || sourceAttempt.document_id !== documentRow.document_id
    || sourceAttempt.owner_email !== documentRow.owner_email
    || sourceAttempt.level_id !== documentRow.level_id
    || String(sourceAttempt.generated_version_id || '') !== String(source.id)
  ) {
    throw backgroundVersionError(
      409,
      'generation_attempt_pipeline_source_not_owned',
      'Choose a retained Raw Pipeline Source from this Level.',
    );
  }

  const fields = await dbCanonicalPredrawnAttemptFields(client, currentDocument);
  if (!sameBackgroundWorldBounds(source.world_bounds, fields.worldBounds)) {
    throw backgroundVersionError(
      409,
      'generation_attempt_pipeline_source_stale',
      'This Raw Pipeline Source uses a different viewing pane than the saved Level.',
    );
  }
  const geometryDigests = fields.environmentGeometryDigests;
  if (legacyBackgroundVersionNeedsGeometryBinding(source)) {
    const bound = await dbBindLegacyBackgroundVersionGeometry(
      client,
      [source],
      geometryDigests,
      user.email,
      writerSession.actor_name,
    );
    if (!bound) {
      throw backgroundVersionError(
        409,
        'generation_attempt_pipeline_source_stale',
        'This Raw Pipeline Source belongs to a different board layout.',
      );
    }
  }
  if (!backgroundVersionHasEnvironmentGeometry(source, fields.environmentGeometrySha256)) {
    throw backgroundVersionError(
      409,
      'generation_attempt_pipeline_source_stale',
      'This Raw Pipeline Source uses a different board layout than the saved Level.',
    );
  }
  const sourceContractIssue = backgroundVersionStoredContractIssue(source);
  if (sourceContractIssue) {
    const binding = await dbBindLegacyRawContract(
      client,
      source,
      fields.worldBounds,
      geometryDigests,
      user.email,
      writerSession.actor_name,
    );
    if (!binding.bound) {
      throw backgroundVersionError(
        409,
        'generation_attempt_pipeline_source_contract_invalid',
        `This Raw Pipeline Source cannot be reused: ${binding.issue || sourceContractIssue}`,
      );
    }
  }
  const boundContractIssue = backgroundVersionStoredContractIssue(source);
  if (boundContractIssue) {
    throw backgroundVersionError(
      409,
      'generation_attempt_pipeline_source_contract_invalid',
      `This Raw Pipeline Source cannot be reused: ${boundContractIssue}`,
    );
  }
  const sourceRequest = generationAttemptPipelineSourceRequest(source, sourceAttempt, fields);
  const sourceRequestIssue = generationAttemptSourceRequestIssue(
    {
      document_id: documentRow.document_id,
      level_id: documentRow.level_id,
      origin: 'pipeline-source',
      source_version_id: source.id,
      source_attempt_id: sourceAttempt.id,
      source_request: sourceRequest,
    },
    source,
  );
  if (sourceRequestIssue) {
    throw backgroundVersionError(
      409,
      'generation_attempt_source_request_invalid',
      sourceRequestIssue,
    );
  }
  return { sourceAttempt, sourceRequest };
}

async function dbCreateGenerationAttempt(documentRow, user, authority, value, idempotencyKey) {
  const actor = String(user.email).trim().toLowerCase();
  const fingerprint = crypto.createHash('sha256').update(canonicalJson({
    document_id: documentRow.document_id,
    ...value,
  })).digest('hex');
  return withEditorDocumentTransaction(async (client) => {
    const currentDocument = await dbLockEditorDocument(
      client,
      documentRow.owner_email,
      documentRow.document_id,
    );
    if (!currentDocument) throw editorDocumentError(404, 'editor_document_not_found');
    const writerSession = await assertActiveEditorEditSession(
      client,
      currentDocument,
      authority.sessionId,
      authority.editGeneration,
      authority.sessionKeyHash,
    );
    if (idempotencyKey) {
      const replay = await client.query(
        `SELECT document_id, id, request_fingerprint
           FROM predrawn_generation_attempts
          WHERE idempotency_actor = $1 AND idempotency_key = $2`,
        [actor, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (
          replay.rows[0].document_id !== documentRow.document_id
          || replay.rows[0].request_fingerprint !== fingerprint
        ) throw backgroundVersionError(409, 'generation_attempt_idempotency_conflict');
        return {
          created: false,
          row: await dbGenerationAttemptRow(documentRow.document_id, replay.rows[0].id, client),
        };
      }
    }
    const count = await client.query(
      'SELECT count(*)::integer AS count FROM predrawn_generation_attempts WHERE document_id = $1',
      [documentRow.document_id],
    );
    if (Number(count.rows[0]?.count || 0) >= GENERATION_ATTEMPT_DOCUMENT_ROW_LIMIT) {
      throw backgroundVersionError(409, 'generation_attempt_document_quota_exceeded', {
        limit: GENERATION_ATTEMPT_DOCUMENT_ROW_LIMIT,
      });
    }
    let source = await dbBackgroundVersionRow(
      documentRow.document_id,
      value.source_version_id,
      client,
      { lock: true },
    );
    let sourceAttempt = null;
    let sourceRequest;
    if (value.origin === 'pipeline-source') {
      ({ sourceAttempt, sourceRequest } = await dbValidatedPipelineSourceAttemptInput(
        client,
        currentDocument,
        documentRow,
        user,
        writerSession,
        source,
      ));
    } else {
      if (
        !source
        || source.kind !== 'source'
        || !source.blob_sha256
        || !['ready', 'published'].includes(source.status)
        || source.owner_email !== documentRow.owner_email
        || source.level_id !== documentRow.level_id
        || sourceArtworkVersionContractIssue(source)
        || !backgroundVersionContentDigestMatches(source)
      ) {
        throw backgroundVersionError(
          409,
          'generation_attempt_source_not_ready',
          'Choose a ready Generation Reference from this Level.',
        );
      }
      sourceRequest = generationAttemptSourceRequest(source);
    }
    if (value.origin !== 'pipeline-source') {
      const sourceRequestIssue = generationAttemptSourceRequestIssue(
        {
          document_id: documentRow.document_id,
          level_id: documentRow.level_id,
          origin: value.origin,
          source_version_id: value.source_version_id,
          source_attempt_id: sourceAttempt?.id ?? null,
          source_request: sourceRequest,
        },
        source,
      );
      if (sourceRequestIssue) {
        throw backgroundVersionError(
          409,
          'generation_attempt_source_request_invalid',
          sourceRequestIssue,
        );
      }
    }
    const requestedId = crypto.randomUUID();
    const inserted = await client.query(
      `INSERT INTO predrawn_generation_attempts (
         id, document_id, owner_email, level_id, label, origin, source_version_id,
         source_attempt_id, source_request, generated_version_id,
         idempotency_actor, idempotency_key, request_fingerprint,
         created_by_email, created_by_name, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $14)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        requestedId,
        documentRow.document_id,
        documentRow.owner_email,
        documentRow.level_id,
        value.label,
        value.origin,
        value.source_version_id,
        sourceAttempt?.id ?? null,
        JSON.stringify(sourceRequest),
        value.origin === 'pipeline-source' ? value.source_version_id : null,
        idempotencyKey ? actor : null,
        idempotencyKey,
        idempotencyKey ? fingerprint : null,
        user.email,
        user.name || user.email,
      ],
    );
    if (!inserted.rows[0]) {
      if (!idempotencyKey) throw new Error('generation attempt insert unexpectedly conflicted');
      const replay = await client.query(
        `SELECT document_id, id, request_fingerprint
           FROM predrawn_generation_attempts
          WHERE idempotency_actor = $1 AND idempotency_key = $2`,
        [actor, idempotencyKey],
      );
      if (
        !replay.rows[0]
        || replay.rows[0].document_id !== documentRow.document_id
        || replay.rows[0].request_fingerprint !== fingerprint
      ) throw backgroundVersionError(409, 'generation_attempt_idempotency_conflict');
      return {
        created: false,
        row: await dbGenerationAttemptRow(documentRow.document_id, replay.rows[0].id, client),
      };
    }
    const row = await dbGenerationAttemptRow(documentRow.document_id, requestedId, client);
    await dbRecordGenerationAttemptEvent(client, row, 'created', user.email, user.name, {
      input_role: value.origin === 'pipeline-source'
        ? 'raw-pipeline-source'
        : 'generation-reference',
      source_version_id: value.source_version_id,
      source_attempt_id: sourceAttempt?.id ?? null,
      raw_pipeline_source_version_id: value.origin === 'pipeline-source'
        ? value.source_version_id
        : null,
      waiting_for_ai_result: value.origin !== 'pipeline-source',
      source_request_sha256: sourceRequest.requestSha256,
      edit_session_id: writerSession.session_id,
      edit_generation: Number(writerSession.edit_generation),
    });
    return { created: true, row };
  });
}

async function authorizedBackgroundVersionDocument(req, res, { mutate = false, authenticatedUser = null } = {}) {
  const documentId = editorDocumentId(req.params.documentId);
  if (!documentId) {
    res.status(400).json({ error: 'invalid_editor_document_id' });
    return null;
  }
  const user = authenticatedUser || await requireUser(req, res);
  if (!user) return null;
  const row = mutate
    ? await dbGetEditorDocument(user.email, documentId)
    : await dbGetEditorDocumentForViewer(user.email, documentId);
  if (!row) {
    res.status(404).json({ error: 'editor_document_not_found' });
    return null;
  }
  if (!editorDocumentRowIsAuthorized(row, user, res)) return null;
  const authority = mutate
    ? req.backgroundVersionAuthority || backgroundVersionMutationAuthority(req, res)
    : null;
  if (mutate && !authority) return null;
  return { documentId, row, user, authority };
}

async function dbAssertBackgroundVersionWriter(documentRow, authority) {
  return withEditorDocumentTransaction(async (client) => {
    const current = await dbLockEditorDocument(
      client,
      documentRow.owner_email,
      documentRow.document_id,
    );
    if (!current) throw editorDocumentError(404, 'editor_document_not_found');
    return assertActiveEditorEditSession(
      client,
      current,
      authority.sessionId,
      authority.editGeneration,
      authority.sessionKeyHash,
    );
  });
}

async function dbListBackgroundVersions(documentRow, status = 'all', kind = 'all') {
  await ensureDbReady();
  const { rows } = await pool.query(
    `SELECT ${BACKGROUND_VERSION_COLUMNS}
       FROM predrawn_background_versions v
       JOIN level_working_copies source_document
         ON source_document.document_id = v.document_id
       LEFT JOIN media_blobs b ON b.sha256 = v.blob_sha256
      WHERE (
          v.document_id = $1
          OR (
            $2::text = 'official'
            AND v.status = 'published'
            AND source_document.workspace_kind = 'official'
            AND source_document.workspace_id = $3
            AND source_document.level_id = $4
          )
        )
        AND (
          $5::text = 'all'
          OR ($5::text = 'draft' AND v.status = 'ready' AND v.blob_sha256 IS NULL)
          OR ($5::text = 'ready' AND v.status = 'ready' AND v.blob_sha256 IS NOT NULL)
          OR ($5::text IN ('archived', 'published') AND v.status = $5)
        )
        AND ($6::text = 'all' OR v.kind = $6)
      ORDER BY v.created_at DESC, v.id DESC`,
    [
      documentRow.document_id,
      documentRow.workspace_kind,
      documentRow.workspace_id,
      documentRow.level_id,
      status,
      kind,
    ],
  );
  return rows;
}

async function dbCreateBackgroundVersion(documentRow, user, authority, value, idempotencyKey) {
  const actor = String(user.email).trim().toLowerCase();
  const fingerprint = crypto.createHash('sha256').update(canonicalJson({
    document_id: documentRow.document_id,
    ...value,
  })).digest('hex');
  return withEditorDocumentTransaction(async (client) => {
    const currentDocument = await dbLockEditorDocument(
      client,
      documentRow.owner_email,
      documentRow.document_id,
    );
    if (!currentDocument) throw editorDocumentError(404, 'editor_document_not_found');
    const writerSession = await assertActiveEditorEditSession(
      client,
      currentDocument,
      authority.sessionId,
      authority.editGeneration,
      authority.sessionKeyHash,
    );
    const attemptId = value.attempt_id || null;
    if (value.kind === 'source' ? Boolean(attemptId) : !attemptId) {
      throw backgroundVersionError(
        400,
        'background_version_attempt_required',
        value.kind === 'source'
          ? 'a Generation Reference is saved independently and cannot belong to a pipeline slot'
          : 'generated, warped, and occlusion artwork require a generation attempt',
      );
    }
    if (idempotencyKey) {
      const replay = await client.query(
        `SELECT document_id, id, request_fingerprint
           FROM predrawn_background_versions
          WHERE idempotency_actor = $1 AND idempotency_key = $2`,
        [actor, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (
          replay.rows[0].document_id !== documentRow.document_id
          || replay.rows[0].request_fingerprint !== fingerprint
        ) throw backgroundVersionError(409, 'background_version_idempotency_conflict');
        let replayAttempt = null;
        if (attemptId) {
          replayAttempt = await dbGenerationAttemptRow(documentRow.document_id, attemptId, client);
          const stageColumn = {
            raw: 'generated_version_id',
            warped: 'warped_version_id',
            occlusion: 'occlusion_version_id',
          }[value.kind];
          if (!replayAttempt || String(replayAttempt[stageColumn] || '') !== String(replay.rows[0].id)) {
            throw backgroundVersionError(409, 'background_version_attempt_conflict');
          }
        }
        return {
          created: false,
          row: await dbBackgroundVersionRow(documentRow.document_id, replay.rows[0].id, client),
          attempt: replayAttempt,
        };
      }
    }

    let storedValue = value.kind === 'source'
      ? await dbCanonicalizePredrawnSourceVersion(client, currentDocument, value)
      : { ...value };
    let attempt = null;
    let attemptSource = null;
    let attemptGenerated = null;
    let attemptWarped = null;
    if (attemptId) {
      attempt = await dbGenerationAttemptRow(documentRow.document_id, attemptId, client, { lock: true });
      if (
        !attempt
        || attempt.owner_email !== documentRow.owner_email
        || attempt.level_id !== documentRow.level_id
      ) {
        throw backgroundVersionError(404, 'generation_attempt_not_found');
      }
      if (attempt.status !== 'active') {
        throw backgroundVersionError(409, 'generation_attempt_archived');
      }
      if (!['source', 'pipeline-source'].includes(attempt.origin) || !attempt.source_version_id) {
        throw backgroundVersionError(
          409,
          'generation_attempt_historical_locked',
          'Historical attempts do not have a proven source and cannot accept new stages.',
        );
      }
      attemptSource = await dbBackgroundVersionRow(
        documentRow.document_id,
        attempt.source_version_id,
        client,
      );
      attemptGenerated = attempt.generated_version_id
        ? await dbBackgroundVersionRow(documentRow.document_id, attempt.generated_version_id, client)
        : null;
      attemptWarped = attempt.warped_version_id
        ? await dbBackgroundVersionRow(documentRow.document_id, attempt.warped_version_id, client)
        : null;
      if (storedValue.kind === 'raw' && attemptSource && attempt.origin === 'source') {
        const inputMetadata = {
          sourceArtworkVersionId: String(attemptSource.id),
          sourceArtworkSha256: attemptSource.blob_sha256,
        };
        storedValue = {
          ...storedValue,
          operation: {
            ...storedValue.operation,
            ...inputMetadata,
          },
          provenance: {
            ...storedValue.provenance,
            ...inputMetadata,
          },
        };
      }
      if (storedValue.kind === 'warped') {
        const attemptProcessingRevision = Number(attempt.processing_revision);
        if (
          !Number.isSafeInteger(attemptProcessingRevision)
          || attemptProcessingRevision < 0
        ) {
          throw backgroundVersionError(
            409,
            'generation_attempt_processing_revision_invalid',
          );
        }
        storedValue = {
          ...storedValue,
          operation: {
            ...storedValue.operation,
            attemptProcessingRevision,
          },
          provenance: {
            ...storedValue.provenance,
            attemptProcessingRevision,
          },
        };
      }
    }

    const countResult = await client.query(
      'SELECT count(*)::integer AS count FROM predrawn_background_versions WHERE document_id = $1',
      [documentRow.document_id],
    );
    if (Number(countResult.rows[0]?.count || 0) >= BACKGROUND_VERSION_DOCUMENT_ROW_LIMIT) {
      throw backgroundVersionError(409, 'background_version_document_quota_exceeded', {
        limit: BACKGROUND_VERSION_DOCUMENT_ROW_LIMIT,
      });
    }

    const lineageIds = [
      storedValue.parent_version_id,
      storedValue.source_background_version_id,
    ].filter(Boolean);
    const lineage = lineageIds.length
      ? await client.query(
        `WITH RECURSIVE lineage_ids(id) AS (
           SELECT id
             FROM predrawn_background_versions
            WHERE document_id = $1 AND id = ANY($2::uuid[])
           UNION
           SELECT version.parent_version_id
             FROM predrawn_background_versions version
             JOIN lineage_ids lineage_id ON lineage_id.id = version.id
            WHERE version.document_id = $1 AND version.parent_version_id IS NOT NULL
         )
         SELECT v.*,
                (SELECT jsonb_build_object(
                    'legacy_environment_geometry_schema', binding.legacy_environment_geometry_schema,
                    'legacy_environment_geometry_sha256', binding.legacy_environment_geometry_sha256,
                    'environment_geometry_schema', binding.environment_geometry_schema,
                    'environment_geometry_sha256', binding.environment_geometry_sha256,
                    'bound_at', binding.bound_at
                  )
                   FROM predrawn_background_geometry_bindings binding
                  WHERE binding.version_id = v.id) AS environment_geometry_binding,
                (SELECT jsonb_build_object(
                    'legacy_operation_kind', binding.legacy_operation_kind,
                    'legacy_operation_sha256', binding.legacy_operation_sha256,
                    'coordinate_basis', binding.coordinate_basis,
                    'viewing_pane', binding.viewing_pane,
                    'bound_at', binding.bound_at
                  )
                   FROM predrawn_background_raw_contract_bindings binding
                  WHERE binding.version_id = v.id) AS raw_contract_binding
           FROM predrawn_background_versions v
          WHERE v.document_id = $1 AND v.id IN (SELECT id FROM lineage_ids)
          FOR SHARE`,
        [documentRow.document_id, lineageIds],
      )
      : { rows: [] };
    const byId = new Map(lineage.rows.map((row) => [String(row.id), row]));
    const parent = storedValue.parent_version_id ? byId.get(storedValue.parent_version_id) || null : null;
    const source = storedValue.source_background_version_id
      ? byId.get(storedValue.source_background_version_id) || null
      : null;
    const legacyLineage = [...new Map(
      lineage.rows
        .filter((row) => backgroundVersionEnvironmentGeometry(row)?.schema === LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA)
        .map((row) => [String(row.id), row]),
    ).values()];
    if (legacyLineage.length) {
      await withThumbnailRenderInputs(() => dbBindLegacyBackgroundVersionGeometry(
        client,
        legacyLineage,
        predrawnEnvironmentGeometryDigests(currentDocument.body),
        user.email,
        writerSession.actor_name,
      ), client);
      // Attempt-stage rows were loaded before the lineage walk. Reuse the
      // just-bound lineage objects so the attempt validator observes the exact
      // v2 binding created in this transaction.
      if (attemptGenerated) {
        attemptGenerated = byId.get(String(attemptGenerated.id)) || attemptGenerated;
      }
      if (attemptWarped) {
        attemptWarped = byId.get(String(attemptWarped.id)) || attemptWarped;
      }
    }
    const lineageIssue = backgroundVersionLineageIssue(storedValue, parent, source);
    if (lineageIssue) throw backgroundVersionError(409, 'invalid_background_version_lineage', lineageIssue);
    if (attempt) {
      const attemptIssue = backgroundVersionAttemptStageIssue(
        { ...storedValue, document_id: documentRow.document_id },
        attempt,
        {
          sourceArtwork: attemptSource,
          generated: attemptGenerated,
          warped: attemptWarped,
        },
      );
      if (attemptIssue) {
        throw backgroundVersionError(409, 'invalid_generation_attempt_stage', attemptIssue);
      }
    }

    const requestedId = crypto.randomUUID();
    const inserted = await client.query(
      `INSERT INTO predrawn_background_versions (
         id, document_id, owner_email, level_id, kind, label,
         parent_version_id, source_background_version_id, world_bounds,
         operation, provenance, idempotency_actor, idempotency_key, request_fingerprint,
         created_by_email, created_by_name, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb,
         $12, $13, $14, $15, $16, $15)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        requestedId, documentRow.document_id, documentRow.owner_email, documentRow.level_id,
        storedValue.kind, storedValue.label,
        storedValue.parent_version_id, storedValue.source_background_version_id,
        JSON.stringify(storedValue.world_bounds),
        JSON.stringify(storedValue.operation),
        JSON.stringify(storedValue.provenance),
        idempotencyKey ? actor : null, idempotencyKey, idempotencyKey ? fingerprint : null,
        user.email, user.name || user.email,
      ],
    );
    if (inserted.rows[0]) {
      if (attempt) {
        const stageColumn = {
          raw: 'generated_version_id',
          warped: 'warped_version_id',
          occlusion: 'occlusion_version_id',
        }[storedValue.kind];
        const attached = await client.query(
          `UPDATE predrawn_generation_attempts attempt
              SET ${stageColumn} = $3,
                  row_revision = row_revision + 1,
                  updated_at = now(),
                  updated_by = $4
            WHERE document_id = $1 AND id = $2
              AND status = 'active' AND ${stageColumn} IS NULL
            RETURNING ${GENERATION_ATTEMPT_COLUMNS}`,
          [documentRow.document_id, attempt.id, requestedId, user.email],
        );
        if (!attached.rows[0]) {
          throw backgroundVersionError(409, 'generation_attempt_stage_conflict');
        }
        attempt = attached.rows[0];
        await dbRecordGenerationAttemptEvent(
          client,
          attempt,
          'stage-attached',
          user.email,
          user.name,
          {
            kind: storedValue.kind,
            version_id: requestedId,
            edit_session_id: writerSession.session_id,
            edit_generation: Number(writerSession.edit_generation),
          },
        );
      }
      const row = await dbBackgroundVersionRow(documentRow.document_id, requestedId, client);
      await dbRecordBackgroundVersionEvent(client, row, 'created', user.email, user.name, {
        kind: storedValue.kind,
        parent_version_id: storedValue.parent_version_id,
        source_background_version_id: storedValue.source_background_version_id,
        attempt_id: attempt?.id || null,
        idempotency_key: idempotencyKey,
        edit_session_id: writerSession.session_id,
        edit_generation: Number(writerSession.edit_generation),
      });
      return {
        created: true,
        row,
        attempt,
      };
    }
    if (!idempotencyKey) throw new Error('background version insert unexpectedly conflicted');
    const replay = await client.query(
      `SELECT document_id, id, request_fingerprint
         FROM predrawn_background_versions
        WHERE idempotency_actor = $1 AND idempotency_key = $2`,
      [actor, idempotencyKey],
    );
    if (
      !replay.rows[0] || replay.rows[0].document_id !== documentRow.document_id
      || replay.rows[0].request_fingerprint !== fingerprint
    ) throw backgroundVersionError(409, 'background_version_idempotency_conflict');
    let replayAttempt = null;
    if (attemptId) {
      replayAttempt = await dbGenerationAttemptRow(documentRow.document_id, attemptId, client);
      const stageColumn = {
        raw: 'generated_version_id',
        warped: 'warped_version_id',
        occlusion: 'occlusion_version_id',
      }[storedValue.kind];
      if (!replayAttempt || String(replayAttempt[stageColumn] || '') !== String(replay.rows[0].id)) {
        throw backgroundVersionError(409, 'background_version_attempt_conflict');
      }
    }
    return {
      created: false,
      row: await dbBackgroundVersionRow(documentRow.document_id, replay.rows[0].id, client),
      attempt: replayAttempt,
    };
  });
}

async function dbUploadBackgroundVersionContent(
  documentRow,
  versionId,
  expectedRevision,
  user,
  authority,
  body,
  inspected,
  sha256,
) {
  const blobKey = liveMediaBlobKey(sha256);
  return withEditorDocumentTransaction(async (client) => {
    // Serialize the exact unique-byte accounting across every document owned by
    // this account. This lock is acquired before any row lock in the upload
    // transaction, matching the owner-first order of whole-workspace writers.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('predrawn-background-owner:' || $1, 0))",
      [documentRow.owner_email],
    );
    const currentDocument = await dbLockEditorDocument(
      client,
      documentRow.owner_email,
      documentRow.document_id,
    );
    if (!currentDocument) throw editorDocumentError(404, 'editor_document_not_found');
    const writerSession = await assertActiveEditorEditSession(
      client,
      currentDocument,
      authority.sessionId,
      authority.editGeneration,
      authority.sessionKeyHash,
    );
    const current = await dbBackgroundVersionRow(documentRow.document_id, versionId, client, { lock: true });
    if (!current || current.owner_email !== documentRow.owner_email || current.level_id !== documentRow.level_id) {
      throw backgroundVersionError(404, 'background_version_not_found');
    }
    if (current.blob_sha256) {
      if (
        current.blob_sha256 === sha256
        && Number(current.width) === inspected.width && Number(current.height) === inspected.height
      ) return { row: current, idempotentReplay: true };
      throw backgroundVersionError(409, 'background_version_content_immutable');
    }
    const expectedContentSha256 = current.kind === 'raw' || current.kind === 'source'
      ? current.provenance?.sourceSha256
      : current.operation?.outputSha256;
    if (expectedContentSha256 !== sha256) {
      throw backgroundVersionError(
        409,
        'background_version_content_hash_mismatch',
        'the uploaded PNG bytes do not match the immutable content digest declared at version creation',
      );
    }
    assertBackgroundVersionRevision(current, expectedRevision);
    if (current.status !== 'ready') {
      throw backgroundVersionError(409, 'background_version_locked', { status: current.status });
    }
    if (current.kind === 'source') {
      const canonicalValue = await dbCanonicalizePredrawnSourceVersion(client, currentDocument, {
        kind: current.kind,
        label: current.label,
        parent_version_id: null,
        source_background_version_id: null,
        world_bounds: current.world_bounds,
        operation: current.operation,
        provenance: current.provenance,
      });
      if (!sourceVersionCanonicalMetadataMatches(current, canonicalValue)) {
        throw backgroundVersionError(
          409,
          'background_source_level_changed',
          'The saved Level changed after this Generation Reference record was created.',
        );
      }
      if (
        Number(current.world_bounds?.width) !== inspected.width
        || Number(current.world_bounds?.height) !== inspected.height
      ) {
        throw backgroundVersionError(
          409,
          'background_source_content_dimensions_mismatch',
          'Generation Reference pixels must exactly match the saved generation frame.',
        );
      }
    }
    const usageResult = await client.query(
      `SELECT COALESCE(sum(usage.byte_length), 0)::text AS used_bytes,
              COALESCE(bool_or(usage.blob_sha256 = $2), false) AS already_referenced
         FROM (
           SELECT DISTINCT v.blob_sha256, b.byte_length
             FROM predrawn_background_versions v
             JOIN media_blobs b ON b.sha256 = v.blob_sha256
            WHERE v.owner_email = $1 AND v.blob_sha256 IS NOT NULL
         ) usage`,
      [documentRow.owner_email, sha256],
    );
    const usedBytes = BigInt(usageResult.rows[0]?.used_bytes || '0');
    const additionalBytes = usageResult.rows[0]?.already_referenced ? 0n : BigInt(body.length);
    if (
      additionalBytes > 0n
      && usedBytes + additionalBytes > BACKGROUND_VERSION_OWNER_BLOB_BYTE_LIMIT
    ) {
      throw backgroundVersionError(413, 'background_version_owner_blob_quota_exceeded', {
        limit_bytes: String(BACKGROUND_VERSION_OWNER_BLOB_BYTE_LIMIT),
        used_bytes: String(usedBytes),
        attempted_additional_bytes: String(additionalBytes),
      });
    }
    if (current.kind === 'occlusion') {
      const source = await dbBackgroundVersionRow(
        documentRow.document_id,
        current.source_background_version_id,
        client,
      );
      if (
        !source?.blob_sha256 || !['raw', 'warped'].includes(source.kind)
        || Number(source.width) !== inspected.width || Number(source.height) !== inspected.height
      ) {
        throw backgroundVersionError(
          409,
          'background_version_content_mismatch',
          'an occlusion PNG must have exactly the same dimensions as its source background',
        );
      }
    }
    await writeLiveMediaBlob(blobKey, body, sha256, 'image/png');
    await client.query(
      `INSERT INTO media_blobs (sha256, blob_key, media_type, byte_length, width, height)
       VALUES ($1, $2, 'image/png', $3, $4, $5)
       ON CONFLICT (sha256) DO NOTHING`,
      [sha256, blobKey, body.length, inspected.width, inspected.height],
    );
    const stored = await mediaBlobRecord(sha256, { queryable: client });
    if (
      !stored || stored.blob_key !== blobKey || stored.media_type !== 'image/png'
      || Number(stored.byte_length) !== body.length
      || Number(stored.width) !== inspected.width || Number(stored.height) !== inspected.height
    ) throw new Error('background version blob metadata conflicts with its content hash');
    await client.query(
      `UPDATE predrawn_background_versions
          SET blob_sha256 = $2, width = $3, height = $4,
              row_revision = row_revision + 1, updated_at = now(), updated_by = $5
        WHERE document_id = $1 AND id = $6 AND blob_sha256 IS NULL`,
      [documentRow.document_id, sha256, inspected.width, inspected.height, user.email, versionId],
    );
    const row = await dbBackgroundVersionRow(documentRow.document_id, versionId, client);
    await dbRecordBackgroundVersionEvent(client, row, 'content-uploaded', user.email, user.name, {
      content_sha256: sha256,
      frame_width: inspected.width,
      frame_height: inspected.height,
      byte_length: body.length,
      edit_session_id: writerSession.session_id,
      edit_generation: Number(writerSession.edit_generation),
    });
    return {
      row,
      idempotentReplay: false,
    };
  });
}

async function dbArchiveBackgroundVersion(documentRow, versionId, expectedRevision, user, authority) {
  return withEditorDocumentTransaction(async (client) => {
    const freshDocument = await dbLockEditorDocument(
      client,
      documentRow.owner_email,
      documentRow.document_id,
    );
    if (!freshDocument) throw editorDocumentError(404, 'editor_document_not_found');
    const writerSession = await assertActiveEditorEditSession(
      client,
      freshDocument,
      authority.sessionId,
      authority.editGeneration,
      authority.sessionKeyHash,
    );
    const canonical = await dbCanonicalLevel(
      client,
      freshDocument.owner_email,
      { kind: freshDocument.workspace_kind, id: freshDocument.workspace_id },
      freshDocument.level_id,
      { lock: true },
    );
    await withThumbnailRenderInputs(() => {
      try {
        for (const level of [freshDocument.body, canonical.level].filter(Boolean)) {
          const selected = decodedVersionedPredrawnSurface(level);
          if (
            selected
            && (selected.background_version_id === versionId || selected.occlusion_version_id === versionId)
          ) {
            throw backgroundVersionError(
              409,
              'background_version_in_use',
              'a working or canonical Level currently selects this version',
            );
          }
        }
      } catch (error) {
        if (error?.backgroundVersionCode || (error?.statusCode && error?.responseCode)) throw error;
        throw backgroundVersionError(409, 'background_version_reference_check_failed', error.message);
      }
    }, client);
    const current = await dbBackgroundVersionRow(documentRow.document_id, versionId, client, { lock: true });
    if (!current || current.owner_email !== documentRow.owner_email || current.level_id !== documentRow.level_id) {
      throw backgroundVersionError(404, 'background_version_not_found');
    }
    if (current.status === 'archived') return { row: current, idempotentReplay: true };
    assertBackgroundVersionRevision(current, expectedRevision);
    if (current.status === 'published') {
      throw backgroundVersionError(409, 'background_version_published', 'published history cannot be archived');
    }
    const activeAttemptUse = await client.query(
      `SELECT id, source_version_id, generated_version_id, warped_version_id, occlusion_version_id
         FROM predrawn_generation_attempts
        WHERE document_id = $1 AND status = 'active'
          AND $2::uuid IN (
            source_version_id,
            generated_version_id,
            warped_version_id,
            occlusion_version_id
          )
        LIMIT 1
        FOR UPDATE`,
      [documentRow.document_id, versionId],
    );
    if (activeAttemptUse.rows[0]) {
      throw backgroundVersionError(
        409,
        current.kind === 'source'
          ? 'background_source_attempt_in_use'
          : 'background_version_attempt_in_use',
        'Archive every active attempt that references this artwork before archiving it.',
      );
    }
    await client.query(
      `UPDATE predrawn_background_versions
          SET status = 'archived', archived_at = now(), archived_by = $3,
              row_revision = row_revision + 1, updated_at = now(), updated_by = $3
        WHERE document_id = $1 AND id = $2`,
      [documentRow.document_id, versionId, user.email],
    );
    const row = await dbBackgroundVersionRow(documentRow.document_id, versionId, client);
    await dbRecordBackgroundVersionEvent(client, row, 'archived', user.email, user.name, {
      edit_session_id: writerSession.session_id,
      edit_generation: Number(writerSession.edit_generation),
    });
    return {
      row,
      idempotentReplay: false,
    };
  });
}

async function dbDiscardGenerationAttemptWarp(
  documentRow,
  attemptId,
  expectedWarpedVersionId,
  expectedRevision,
  user,
  authority,
) {
  return withEditorDocumentTransaction(async (client) => {
    const currentDocument = await dbLockEditorDocument(
      client,
      documentRow.owner_email,
      documentRow.document_id,
    );
    if (!currentDocument) throw editorDocumentError(404, 'editor_document_not_found');
    const writerSession = await assertActiveEditorEditSession(
      client,
      currentDocument,
      authority.sessionId,
      authority.editGeneration,
      authority.sessionKeyHash,
    );
    let attempt = await dbGenerationAttemptRow(
      documentRow.document_id,
      attemptId,
      client,
      { lock: true },
    );
    if (
      !attempt
      || attempt.owner_email !== documentRow.owner_email
      || attempt.level_id !== documentRow.level_id
    ) {
      throw backgroundVersionError(404, 'generation_attempt_not_found');
    }
    if (attempt.status !== 'active') {
      throw backgroundVersionError(409, 'generation_attempt_archived');
    }
    if (!['source', 'pipeline-source'].includes(attempt.origin) || !attempt.generated_version_id) {
      throw backgroundVersionError(
        409,
        'generation_attempt_historical_locked',
        'Historical attempts do not have a proven Raw Pipeline Source and cannot retry processing.',
      );
    }

    if (!attempt.warped_version_id) {
      const [discardedVersion, discardedEvent] = await Promise.all([
        dbBackgroundVersionRow(
          documentRow.document_id,
          expectedWarpedVersionId,
          client,
          { lock: true },
        ),
        client.query(
          `SELECT id
             FROM predrawn_generation_attempt_events
            WHERE document_id = $1
              AND attempt_id = $2
              AND action = 'stage-discarded'
              AND details->>'kind' = 'warped'
              AND details->>'version_id' = $3
            ORDER BY id DESC
            LIMIT 1`,
          [documentRow.document_id, attempt.id, expectedWarpedVersionId],
        ),
      ]);
      if (
        discardedVersion?.status === 'archived'
        && discardedVersion.kind === 'warped'
        && discardedEvent.rows[0]
      ) {
        return {
          attempt,
          discardedVersion,
          idempotentReplay: true,
        };
      }
      throw backgroundVersionError(409, 'generation_attempt_warp_conflict', {
        current_revision: Number(attempt.row_revision),
        current_warped_version_id: null,
      });
    }
    if (Number(attempt.row_revision) !== expectedRevision) {
      throw backgroundVersionError(409, 'generation_attempt_conflict', {
        current_revision: Number(attempt.row_revision),
      });
    }
    if (String(attempt.warped_version_id) !== String(expectedWarpedVersionId)) {
      throw backgroundVersionError(409, 'generation_attempt_warp_conflict', {
        current_revision: Number(attempt.row_revision),
        current_warped_version_id: String(attempt.warped_version_id),
      });
    }
    if (attempt.occlusion_version_id) {
      throw backgroundVersionError(
        409,
        'generation_attempt_occlusion_exists',
        'Discard the board with an occlusion mask before retrying its warped board.',
      );
    }

    const warped = await dbBackgroundVersionRow(
      documentRow.document_id,
      expectedWarpedVersionId,
      client,
      { lock: true },
    );
    if (
      !warped
      || warped.owner_email !== documentRow.owner_email
      || warped.level_id !== documentRow.level_id
      || warped.kind !== 'warped'
      || String(warped.parent_version_id || '') !== String(attempt.generated_version_id)
      || String(warped.source_background_version_id || '') !== String(attempt.generated_version_id)
    ) {
      throw backgroundVersionError(409, 'generation_attempt_warp_not_found');
    }
    if (warped.status === 'published') {
      throw backgroundVersionError(
        409,
        'generation_attempt_warp_published',
        'Published warped artwork cannot be discarded from its pipeline slot.',
      );
    }
    if (warped.status === 'archived') {
      throw backgroundVersionError(409, 'generation_attempt_warp_conflict', {
        current_revision: Number(attempt.row_revision),
        current_warped_version_id: String(attempt.warped_version_id),
      });
    }

    const canonical = await dbCanonicalLevel(
      client,
      currentDocument.owner_email,
      { kind: currentDocument.workspace_kind, id: currentDocument.workspace_id },
      currentDocument.level_id,
      { lock: true },
    );
    await withThumbnailRenderInputs(() => {
      try {
        for (const level of [currentDocument.body, canonical.level].filter(Boolean)) {
          const selected = decodedVersionedPredrawnSurface(level);
          if (
            selected
            && (
              selected.background_version_id === expectedWarpedVersionId
              || selected.occlusion_version_id === expectedWarpedVersionId
            )
          ) {
            throw backgroundVersionError(
              409,
              'generation_attempt_warp_in_use',
              'A working or canonical Level currently selects this warped board.',
            );
          }
        }
      } catch (error) {
        if (error?.backgroundVersionCode || (error?.statusCode && error?.responseCode)) throw error;
        throw backgroundVersionError(409, 'background_version_reference_check_failed', error.message);
      }
    }, client);

    const discardedProcessingRevision = Number(attempt.processing_revision);
    if (
      !Number.isSafeInteger(discardedProcessingRevision)
      || discardedProcessingRevision < 0
    ) {
      throw backgroundVersionError(
        409,
        'generation_attempt_processing_revision_invalid',
      );
    }
    const archived = await client.query(
      `UPDATE predrawn_background_versions
          SET status = 'archived',
              archived_at = now(),
              archived_by = $3,
              row_revision = row_revision + 1,
              updated_at = now(),
              updated_by = $3
        WHERE document_id = $1
          AND id = $2
          AND status NOT IN ('archived', 'published')
        RETURNING id`,
      [documentRow.document_id, expectedWarpedVersionId, user.email],
    );
    if (!archived.rows[0]) {
      throw backgroundVersionError(409, 'generation_attempt_warp_conflict', {
        current_revision: Number(attempt.row_revision),
        current_warped_version_id: String(attempt.warped_version_id),
      });
    }
    const detached = await client.query(
      `UPDATE predrawn_generation_attempts attempt
          SET warped_version_id = NULL,
              move_highlight_profile = NULL,
              move_highlight_profile_sha256 = NULL,
              move_highlight_profile_warped_version_id = NULL,
              processing_revision = processing_revision + 1,
              row_revision = row_revision + 1,
              updated_at = now(),
              updated_by = $5
        WHERE document_id = $1
          AND id = $2
          AND status = 'active'
          AND warped_version_id = $3
          AND occlusion_version_id IS NULL
          AND row_revision = $4
        RETURNING ${GENERATION_ATTEMPT_COLUMNS}`,
      [
        documentRow.document_id,
        attempt.id,
        expectedWarpedVersionId,
        expectedRevision,
        user.email,
      ],
    );
    if (!detached.rows[0]) {
      throw backgroundVersionError(409, 'generation_attempt_warp_conflict', {
        current_revision: Number(attempt.row_revision),
        current_warped_version_id: String(attempt.warped_version_id),
      });
    }
    attempt = detached.rows[0];
    const discardedVersion = await dbBackgroundVersionRow(
      documentRow.document_id,
      expectedWarpedVersionId,
      client,
    );
    await dbRecordBackgroundVersionEvent(
      client,
      discardedVersion,
      'archived',
      user.email,
      user.name,
      {
        reason: 'generation-attempt-warp-discard',
        attempt_id: String(attempt.id),
        edit_session_id: writerSession.session_id,
        edit_generation: Number(writerSession.edit_generation),
      },
    );
    await dbRecordGenerationAttemptEvent(
      client,
      attempt,
      'stage-discarded',
      user.email,
      user.name,
      {
        kind: 'warped',
        version_id: String(expectedWarpedVersionId),
        discarded_processing_revision: discardedProcessingRevision,
        processing_revision: Number(attempt.processing_revision),
        edit_session_id: writerSession.session_id,
        edit_generation: Number(writerSession.edit_generation),
      },
    );
    return {
      attempt,
      discardedVersion,
      idempotentReplay: false,
    };
  });
}

async function dbDiscardGenerationAttemptOcclusion(
  documentRow,
  attemptId,
  expectedOcclusionVersionId,
  expectedRevision,
  expectedDocumentRevision,
  user,
  authority,
) {
  return withEditorDocumentTransaction(async (client) => {
    const currentDocument = await dbLockEditorDocument(
      client,
      documentRow.owner_email,
      documentRow.document_id,
    );
    if (!currentDocument) throw editorDocumentError(404, 'editor_document_not_found');
    const writerSession = await assertActiveEditorEditSession(
      client,
      currentDocument,
      authority.sessionId,
      authority.editGeneration,
      authority.sessionKeyHash,
    );
    let attempt = await dbGenerationAttemptRow(
      documentRow.document_id,
      attemptId,
      client,
      { lock: true },
    );
    if (
      !attempt
      || attempt.owner_email !== documentRow.owner_email
      || attempt.level_id !== documentRow.level_id
    ) {
      throw backgroundVersionError(404, 'generation_attempt_not_found');
    }
    if (attempt.status !== 'active') {
      throw backgroundVersionError(409, 'generation_attempt_archived');
    }
    if (!attempt.warped_version_id) {
      throw backgroundVersionError(
        409,
        'generation_attempt_occlusion_parent_missing',
        'This slot no longer has the warped board required by its mask.',
      );
    }
    const expectedWarpedVersionId = String(attempt.warped_version_id);

    if (!attempt.occlusion_version_id) {
      const [detachedVersion, discardedEvent] = await Promise.all([
        dbBackgroundVersionRow(
          documentRow.document_id,
          expectedOcclusionVersionId,
          client,
          { lock: true },
        ),
        client.query(
          `SELECT details
             FROM predrawn_generation_attempt_events
            WHERE document_id = $1
              AND attempt_id = $2
              AND action = 'stage-discarded'
              AND details->>'kind' = 'occlusion'
              AND details->>'version_id' = $3
            ORDER BY id DESC
            LIMIT 1`,
          [documentRow.document_id, attempt.id, expectedOcclusionVersionId],
        ),
      ]);
      const replayDetails = discardedEvent.rows[0]?.details;
      if (
        detachedVersion
        && detachedVersion.kind === 'occlusion'
        && isObjectRecord(replayDetails)
      ) {
        const canonical = await dbCanonicalLevel(
          client,
          currentDocument.owner_email,
          { kind: currentDocument.workspace_kind, id: currentDocument.workspace_id },
          currentDocument.level_id,
        );
        return {
          attempt,
          detachedVersion,
          document: {
            ...currentDocument,
            baseline_conflict: editorDocumentBaselineChanged(currentDocument, canonical),
          },
          canonicalLevel: canonical.level,
          workspaceRevision: Number.isSafeInteger(Number(canonical.row?.revision))
            ? Number(canonical.row.revision)
            : null,
          workingCopyFellBack: replayDetails.working_copy_fell_back === true,
          canonicalReferenceRetained: replayDetails.canonical_reference_retained === true,
          versionArchived: detachedVersion.status === 'archived',
          retainedReason: typeof replayDetails.retained_reason === 'string'
            ? replayDetails.retained_reason
            : null,
          idempotentReplay: true,
        };
      }
      throw backgroundVersionError(409, 'generation_attempt_occlusion_conflict', {
        current_revision: Number(attempt.row_revision),
        current_occlusion_version_id: null,
      });
    }
    if (Number(attempt.row_revision) !== expectedRevision) {
      throw backgroundVersionError(409, 'generation_attempt_conflict', {
        current_revision: Number(attempt.row_revision),
      });
    }
    if (String(attempt.occlusion_version_id) !== String(expectedOcclusionVersionId)) {
      throw backgroundVersionError(409, 'generation_attempt_occlusion_conflict', {
        current_revision: Number(attempt.row_revision),
        current_occlusion_version_id: String(attempt.occlusion_version_id),
      });
    }
    assertEditorDocumentRevision(
      currentDocument,
      expectedDocumentRevision,
      currentEditorSessionContext(currentDocument, writerSession),
    );

    const occlusion = await dbBackgroundVersionRow(
      documentRow.document_id,
      expectedOcclusionVersionId,
      client,
      { lock: true },
    );
    if (
      !occlusion
      || occlusion.owner_email !== documentRow.owner_email
      || occlusion.level_id !== documentRow.level_id
      || occlusion.kind !== 'occlusion'
      || String(occlusion.source_background_version_id || '') !== expectedWarpedVersionId
    ) {
      throw backgroundVersionError(409, 'generation_attempt_occlusion_not_found');
    }
    if (occlusion.status === 'archived') {
      throw backgroundVersionError(409, 'generation_attempt_occlusion_conflict', {
        current_revision: Number(attempt.row_revision),
        current_occlusion_version_id: String(attempt.occlusion_version_id),
      });
    }

    const canonical = await dbCanonicalLevel(
      client,
      currentDocument.owner_email,
      { kind: currentDocument.workspace_kind, id: currentDocument.workspace_id },
      currentDocument.level_id,
      { lock: true },
    );
    let workingPlan;
    let canonicalPlan;
    [workingPlan, canonicalPlan] = await withThumbnailRenderInputs(() => {
      try {
        return [
          generationAttemptOcclusionDiscardLevelPlan(
            currentDocument.body,
            expectedWarpedVersionId,
            expectedOcclusionVersionId,
          ),
          canonical.level
            ? generationAttemptOcclusionDiscardLevelPlan(
              canonical.level,
              expectedWarpedVersionId,
              expectedOcclusionVersionId,
            )
            : { level: null, referencesOcclusion: false },
        ];
      } catch (error) {
        if (error?.backgroundVersionCode || (error?.statusCode && error?.responseCode)) throw error;
        throw backgroundVersionError(409, 'background_version_reference_check_failed', error.message);
      }
    }, client);

    const canonicalReferenceRetained = canonicalPlan.referencesOcclusion;
    const versionArchived = occlusion.status !== 'published' && !canonicalReferenceRetained;
    const retainedReason = canonicalReferenceRetained
      ? 'canonical-reference'
      : occlusion.status === 'published'
        ? 'published-history'
        : null;
    if (versionArchived) {
      const archived = await client.query(
        `UPDATE predrawn_background_versions
            SET status = 'archived',
                archived_at = now(),
                archived_by = $3,
                row_revision = row_revision + 1,
                updated_at = now(),
                updated_by = $3
          WHERE document_id = $1
            AND id = $2
            AND status NOT IN ('archived', 'published')
          RETURNING id`,
        [documentRow.document_id, expectedOcclusionVersionId, user.email],
      );
      if (!archived.rows[0]) {
        throw backgroundVersionError(409, 'generation_attempt_occlusion_conflict', {
          current_revision: Number(attempt.row_revision),
          current_occlusion_version_id: String(attempt.occlusion_version_id),
        });
      }
    }

    let updatedDocument = currentDocument;
    if (workingPlan.referencesOcclusion) {
      const nextRevision = Number(currentDocument.revision) + 1;
      const nextBodyHash = await dbJsonbHash(client, workingPlan.level);
      const canonicalStillTracked = Boolean(
        currentDocument.baseline_hash
        && canonical.hash
        && currentDocument.baseline_hash === canonical.hash,
      );
      const nextSavedRevision = canonicalStillTracked
        && nextBodyHash === currentDocument.baseline_hash
        ? nextRevision
        : Number(currentDocument.saved_revision);
      const updatedWorking = await client.query(
        `UPDATE level_working_copies
            SET body = $3::jsonb,
                revision = $4,
                saved_revision = $5,
                updated_at = clock_timestamp()
          WHERE owner_email = $1
            AND document_id = $2
            AND revision = $6
          RETURNING ${EDITOR_DOCUMENT_COLUMNS}`,
        [
          currentDocument.owner_email,
          currentDocument.document_id,
          JSON.stringify(workingPlan.level),
          nextRevision,
          nextSavedRevision,
          expectedDocumentRevision,
        ],
      );
      if (!updatedWorking.rows[0]) {
        throw editorDocumentError(
          409,
          'editor_document_revision_conflict',
          currentDocument,
        );
      }
      updatedDocument = updatedWorking.rows[0];
      await dbRecordEditorDocumentRevision(
        client,
        updatedDocument,
        'generation-attempt-occlusion-discard',
      );
      await dbTouchEditorSessionAfterWrite(
        client,
        writerSession,
        updatedDocument,
        'generation_attempt_occlusion_selection_fell_back',
        currentDocument.revision,
        {
          generation_attempt_id: attemptId,
          detached_occlusion_version_id: expectedOcclusionVersionId,
          fallback_warped_version_id: expectedWarpedVersionId,
        },
      );
    }

    const discardedProcessingRevision = Number(attempt.processing_revision);
    if (
      !Number.isSafeInteger(discardedProcessingRevision)
      || discardedProcessingRevision < 0
    ) {
      throw backgroundVersionError(
        409,
        'generation_attempt_processing_revision_invalid',
      );
    }
    const detached = await client.query(
      `UPDATE predrawn_generation_attempts attempt
          SET occlusion_version_id = NULL,
              processing_revision = processing_revision + 1,
              row_revision = row_revision + 1,
              updated_at = now(),
              updated_by = $5
        WHERE document_id = $1
          AND id = $2
          AND status = 'active'
          AND occlusion_version_id = $3
          AND row_revision = $4
        RETURNING ${GENERATION_ATTEMPT_COLUMNS}`,
      [
        documentRow.document_id,
        attempt.id,
        expectedOcclusionVersionId,
        expectedRevision,
        user.email,
      ],
    );
    if (!detached.rows[0]) {
      throw backgroundVersionError(409, 'generation_attempt_occlusion_conflict', {
        current_revision: Number(attempt.row_revision),
        current_occlusion_version_id: String(attempt.occlusion_version_id),
      });
    }
    attempt = detached.rows[0];
    const detachedVersion = await dbBackgroundVersionRow(
      documentRow.document_id,
      expectedOcclusionVersionId,
      client,
    );
    await dbRecordBackgroundVersionEvent(
      client,
      detachedVersion,
      versionArchived ? 'archived' : 'attempt-detached',
      user.email,
      user.name,
      {
        reason: 'generation-attempt-occlusion-discard',
        attempt_id: String(attempt.id),
        retained_reason: retainedReason,
        edit_session_id: writerSession.session_id,
        edit_generation: Number(writerSession.edit_generation),
      },
    );
    await dbRecordGenerationAttemptEvent(
      client,
      attempt,
      'stage-discarded',
      user.email,
      user.name,
      {
        kind: 'occlusion',
        version_id: String(expectedOcclusionVersionId),
        warped_version_id: expectedWarpedVersionId,
        discarded_processing_revision: discardedProcessingRevision,
        processing_revision: Number(attempt.processing_revision),
        working_copy_fell_back: workingPlan.referencesOcclusion,
        canonical_reference_retained: canonicalReferenceRetained,
        version_archived: versionArchived,
        retained_reason: retainedReason,
        edit_session_id: writerSession.session_id,
        edit_generation: Number(writerSession.edit_generation),
      },
    );
    return {
      attempt,
      detachedVersion,
      document: {
        ...updatedDocument,
        baseline_conflict: editorDocumentBaselineChanged(updatedDocument, canonical),
      },
      canonicalLevel: canonical.level,
      workspaceRevision: Number.isSafeInteger(Number(canonical.row?.revision))
        ? Number(canonical.row.revision)
        : null,
      workingCopyFellBack: workingPlan.referencesOcclusion,
      canonicalReferenceRetained,
      versionArchived,
      retainedReason,
      idempotentReplay: false,
    };
  });
}

async function dbUpdateGenerationAttemptMoveHighlightProfile(
  documentRow,
  attemptId,
  expectedWarpedVersionId,
  expectedRevision,
  rawCells,
  user,
  authority,
) {
  return withEditorDocumentTransaction(async (client) => {
    const currentDocument = await dbLockEditorDocument(
      client,
      documentRow.owner_email,
      documentRow.document_id,
    );
    if (!currentDocument) throw editorDocumentError(404, 'editor_document_not_found');
    const writerSession = await assertActiveEditorEditSession(
      client,
      currentDocument,
      authority.sessionId,
      authority.editGeneration,
      authority.sessionKeyHash,
    );
    const attempt = await dbGenerationAttemptRow(
      documentRow.document_id,
      attemptId,
      client,
      { lock: true },
    );
    if (
      !attempt
      || attempt.owner_email !== documentRow.owner_email
      || attempt.level_id !== documentRow.level_id
    ) {
      throw backgroundVersionError(404, 'generation_attempt_not_found');
    }
    if (attempt.status !== 'active') {
      throw backgroundVersionError(409, 'generation_attempt_archived');
    }
    if (
      !['source', 'pipeline-source'].includes(attempt.origin)
      || !attempt.source_request?.semanticRequest?.boardCode
    ) {
      throw backgroundVersionError(
        409,
        'generation_attempt_move_highlight_profile_unavailable',
        'This historical slot has no exact semantic board proof for cyan cell fitting.',
      );
    }
    if (
      !attempt.warped_version_id
      || String(attempt.warped_version_id) !== String(expectedWarpedVersionId)
    ) {
      throw backgroundVersionError(409, 'generation_attempt_warp_conflict', {
        current_revision: Number(attempt.row_revision),
        current_warped_version_id: attempt.warped_version_id
          ? String(attempt.warped_version_id)
          : null,
      });
    }
    const warped = await dbBackgroundVersionRow(
      documentRow.document_id,
      expectedWarpedVersionId,
      client,
      { lock: true },
    );
    if (
      !warped
      || warped.kind !== 'warped'
      || warped.owner_email !== documentRow.owner_email
      || warped.level_id !== documentRow.level_id
      || !warped.blob_sha256
      || !['ready', 'published'].includes(warped.status)
    ) {
      throw backgroundVersionError(409, 'generation_attempt_warp_not_found');
    }
    const environmentGeometrySha256 = backgroundVersionV2GeometrySha256(warped);
    if (!environmentGeometrySha256) {
      throw backgroundVersionError(
        409,
        'generation_attempt_move_highlight_profile_geometry_unavailable',
        'The warped board has no proven current geometry binding.',
      );
    }
    const board = await withThumbnailRenderInputs(
      () => serverRender.decodeBoard(attempt.source_request.semanticRequest.boardCode),
      client,
    );
    if (!board) {
      throw backgroundVersionError(
        409,
        'generation_attempt_move_highlight_profile_board_invalid',
        'The exact semantic board for this warped result cannot be decoded.',
      );
    }
    const profile = normalizeMoveHighlightProfile({
      schema: MOVE_HIGHLIGHT_PROFILE_SCHEMA,
      backgroundVersionId: String(warped.id),
      coordinateBasis: MOVE_HIGHLIGHT_COORDINATE_BASIS,
      environmentGeometrySha256,
      cells: rawCells,
    }, {
      backgroundVersionId: String(warped.id),
      boardColumns: board.cols,
      boardRows: board.rows,
      environmentGeometrySha256,
      playableCellKeys: new Set(Object.keys(board.cells)),
    });
    if (profile.error) {
      throw backgroundVersionError(
        400,
        'invalid_generation_attempt_move_highlight_profile',
        profile.error,
      );
    }
    const currentProfile = normalizeMoveHighlightProfile(
      attempt.move_highlight_profile,
      {
        backgroundVersionId: String(warped.id),
        boardColumns: board.cols,
        boardRows: board.rows,
        environmentGeometrySha256,
        playableCellKeys: new Set(Object.keys(board.cells)),
      },
    );
    if (
      !currentProfile.error
      && currentProfile.value.profileSha256 === profile.value.profileSha256
      && attempt.move_highlight_profile_sha256 === profile.value.profileSha256
      && String(attempt.move_highlight_profile_warped_version_id || '') === String(warped.id)
    ) {
      return { attempt, idempotentReplay: true };
    }
    if (Number(attempt.row_revision) !== expectedRevision) {
      throw backgroundVersionError(409, 'generation_attempt_conflict', {
        current_revision: Number(attempt.row_revision),
      });
    }
    const updated = await client.query(
      `UPDATE predrawn_generation_attempts attempt
          SET move_highlight_profile = $3::jsonb,
              move_highlight_profile_sha256 = $4,
              move_highlight_profile_warped_version_id = $5,
              row_revision = row_revision + 1,
              updated_at = now(),
              updated_by = $6
        WHERE document_id = $1
          AND id = $2
          AND status = 'active'
          AND warped_version_id = $5
          AND row_revision = $7
        RETURNING ${GENERATION_ATTEMPT_COLUMNS}`,
      [
        documentRow.document_id,
        attempt.id,
        JSON.stringify(profile.value),
        profile.value.profileSha256,
        warped.id,
        user.email,
        expectedRevision,
      ],
    );
    if (!updated.rows[0]) {
      throw backgroundVersionError(409, 'generation_attempt_conflict', {
        current_revision: Number(attempt.row_revision),
      });
    }
    await dbRecordGenerationAttemptEvent(
      client,
      updated.rows[0],
      'move-highlight-profile-updated',
      user.email,
      user.name,
      {
        warped_version_id: String(warped.id),
        previous_profile_sha256: attempt.move_highlight_profile_sha256 || null,
        profile_sha256: profile.value.profileSha256,
        overridden_cell_count: Object.keys(profile.value.cells).length,
        edit_session_id: writerSession.session_id,
        edit_generation: Number(writerSession.edit_generation),
      },
    );
    return { attempt: updated.rows[0], idempotentReplay: false };
  });
}

async function dbArchiveGenerationAttempt(
  documentRow,
  attemptId,
  expectedRevision,
  expectedDocumentRevision,
  user,
  authority,
) {
  return withEditorDocumentTransaction(async (client) => {
    const currentDocument = await dbLockEditorDocument(
      client,
      documentRow.owner_email,
      documentRow.document_id,
    );
    if (!currentDocument) throw editorDocumentError(404, 'editor_document_not_found');
    const writerSession = await assertActiveEditorEditSession(
      client,
      currentDocument,
      authority.sessionId,
      authority.editGeneration,
      authority.sessionKeyHash,
    );
    const attempt = await dbGenerationAttemptRow(
      documentRow.document_id,
      attemptId,
      client,
      { lock: true },
    );
    if (
      !attempt
      || attempt.owner_email !== documentRow.owner_email
      || attempt.level_id !== documentRow.level_id
    ) {
      throw backgroundVersionError(404, 'generation_attempt_not_found');
    }
    const archivedReplay = attempt.status === 'archived';
    if (!archivedReplay) {
      assertEditorDocumentRevision(
        currentDocument,
        expectedDocumentRevision,
        currentEditorSessionContext(currentDocument, writerSession),
      );
      if (Number(attempt.row_revision) !== expectedRevision) {
        throw backgroundVersionError(409, 'generation_attempt_conflict', {
          current_revision: Number(attempt.row_revision),
        });
      }
    }

    const canonical = await dbCanonicalLevel(
      client,
      currentDocument.owner_email,
      { kind: currentDocument.workspace_kind, id: currentDocument.workspace_id },
      currentDocument.level_id,
      { lock: true },
    );
    const ownedVersionIds = new Set([
      attempt.warped_version_id,
      attempt.occlusion_version_id,
    ].filter(Boolean).map(String));
    let ownsPublishedVersion = false;
    if (ownedVersionIds.size) {
      const ownedVersions = await client.query(
        `SELECT id, status
           FROM predrawn_background_versions
          WHERE document_id = $1 AND id = ANY($2::uuid[])
          FOR UPDATE`,
        [documentRow.document_id, [...ownedVersionIds]],
      );
      ownsPublishedVersion = ownedVersions.rows.some((row) => row.status === 'published');
      if (!archivedReplay && ownsPublishedVersion) {
        throw backgroundVersionError(
          409,
          'generation_attempt_published',
          'Published artwork history cannot be archived with its pipeline slot.',
        );
      }
    }

    let workingPlan;
    let canonicalPlan;
    [workingPlan, canonicalPlan] = await withThumbnailRenderInputs(() => {
      try {
        return [
          generationAttemptArchiveLevelPlan(currentDocument.body, ownedVersionIds),
          canonical.level
            ? generationAttemptArchiveLevelPlan(canonical.level, ownedVersionIds)
            : { level: null, kind: 'unrelated', matchedVersionIds: [] },
        ];
      } catch (error) {
        if (error?.backgroundVersionCode || (error?.statusCode && error?.responseCode)) throw error;
        throw backgroundVersionError(409, 'background_version_reference_check_failed', error.message);
      }
    }, client);
    if (workingPlan.kind === 'invalid' || canonicalPlan.kind === 'invalid') {
      throw backgroundVersionError(
        409,
        'background_version_reference_check_failed',
        'the Level background mode is invalid',
      );
    }
    if (workingPlan.kind === 'active' || canonicalPlan.kind === 'active') {
      throw backgroundVersionError(
        409,
        'generation_attempt_in_use',
        'A working or canonical Level actively uses artwork from this attempt.',
      );
    }

    const workingChanged = workingPlan.kind === 'dormant';
    const canonicalChanged = canonicalPlan.kind === 'dormant';
    if (archivedReplay && !workingChanged && !canonicalChanged) {
      return {
        row: attempt,
        document: {
          ...currentDocument,
          baseline_conflict: editorDocumentBaselineChanged(currentDocument, canonical),
        },
        canonicalLevel: canonical.level,
        // A lost first response may have carried the revision advanced by the canonical detach.
        // Return the current CAS token on replay so the client cannot adopt the canonical Level
        // while retaining its older whole-workspace revision.
        workspaceRevision: Number.isSafeInteger(Number(canonical.row?.revision))
          ? Number(canonical.row.revision)
          : null,
        canonicalChanged: false,
        forgottenSelection: {
          working_copy: false,
          canonical: false,
          version_ids: [],
        },
        idempotentReplay: true,
        canonicalThumbnailRequiresEnsure: Boolean(canonical.level),
      };
    }
    if (archivedReplay) {
      // An older server could archive the slot while silently missing a dormant
      // database-catalog-dependent selection. Retrying the same explicit archive
      // intent heals that incomplete transaction without revising the slot twice.
      assertEditorDocumentRevision(
        currentDocument,
        expectedDocumentRevision,
        currentEditorSessionContext(currentDocument, writerSession),
      );
      const currentAttemptRevision = Number(attempt.row_revision);
      if (
        expectedRevision !== currentAttemptRevision
        && expectedRevision !== currentAttemptRevision - 1
      ) {
        throw backgroundVersionError(409, 'generation_attempt_conflict', {
          current_revision: currentAttemptRevision,
        });
      }
      if (ownsPublishedVersion) {
        throw backgroundVersionError(
          409,
          'generation_attempt_published',
          'Published artwork history cannot be detached by replaying its pipeline-slot archive.',
        );
      }
    }

    const canonicalWasTracked = !editorDocumentBaselineChanged(currentDocument, canonical);
    let canonicalAfter = canonical;
    let workspaceRevision = Number.isSafeInteger(Number(canonical.row?.revision))
      ? Number(canonical.row.revision)
      : null;
    if (canonicalChanged) {
      workspaceRevision = await dbPromoteCanonicalLevel(
        client,
        currentDocument.owner_email,
        { kind: currentDocument.workspace_kind, id: currentDocument.workspace_id },
        currentDocument.level_id,
        canonicalPlan.level,
        undefined,
      );
      canonicalAfter = await dbCanonicalLevel(
        client,
        currentDocument.owner_email,
        { kind: currentDocument.workspace_kind, id: currentDocument.workspace_id },
        currentDocument.level_id,
        { lock: true },
      );
    }

    const nextBaselineHash = canonicalWasTracked
      ? canonicalAfter.hash
      : currentDocument.baseline_hash;
    const baselineChanged = nextBaselineHash !== currentDocument.baseline_hash;
    let updatedDocument = currentDocument;
    if (workingChanged || baselineChanged) {
      const nextRevision = Number(currentDocument.revision) + (workingChanged ? 1 : 0);
      const nextBodyHash = await dbJsonbHash(client, workingPlan.level);
      const nextSavedRevision = nextBaselineHash && nextBodyHash === nextBaselineHash
        ? nextRevision
        : Number(currentDocument.saved_revision);
      const updatedWorking = await client.query(
        `UPDATE level_working_copies
            SET body = $3::jsonb,
                revision = $4,
                saved_revision = $5,
                baseline_hash = $6,
                updated_at = CASE WHEN $7::boolean THEN clock_timestamp() ELSE updated_at END
          WHERE owner_email = $1 AND document_id = $2
          RETURNING ${EDITOR_DOCUMENT_COLUMNS}`,
        [
          currentDocument.owner_email,
          currentDocument.document_id,
          JSON.stringify(workingPlan.level),
          nextRevision,
          nextSavedRevision,
          nextBaselineHash,
          workingChanged,
        ],
      );
      updatedDocument = updatedWorking.rows[0];
      if (workingChanged) {
        await dbRecordEditorDocumentRevision(
          client,
          updatedDocument,
          'generation-attempt-archive',
        );
        await dbTouchEditorSessionAfterWrite(
          client,
          writerSession,
          updatedDocument,
          'generation_attempt_selection_forgotten',
          currentDocument.revision,
          {
            generation_attempt_id: attemptId,
            forgotten_background_version_ids: [
              ...new Set([
                ...workingPlan.matchedVersionIds,
                ...canonicalPlan.matchedVersionIds,
              ]),
            ].sort(),
          },
        );
      }
    }
    updatedDocument = {
      ...updatedDocument,
      baseline_conflict: editorDocumentBaselineChanged(updatedDocument, canonicalAfter),
    };

    let row = attempt;
    if (!archivedReplay) {
      const updated = await client.query(
        `UPDATE predrawn_generation_attempts attempt
            SET status = 'archived',
                archived_at = now(),
                archived_by = $3,
                row_revision = row_revision + 1,
                updated_at = now(),
                updated_by = $3
          WHERE document_id = $1 AND id = $2
          RETURNING ${GENERATION_ATTEMPT_COLUMNS}`,
        [documentRow.document_id, attemptId, user.email],
      );
      row = updated.rows[0];
    }
    await dbRecordGenerationAttemptEvent(client, row, 'archived', user.email, user.name, {
      edit_session_id: writerSession.session_id,
      edit_generation: Number(writerSession.edit_generation),
      repaired_incomplete_selection_detach: archivedReplay,
      forgotten_working_copy_selection: workingChanged,
      forgotten_canonical_selection: canonicalChanged,
      forgotten_background_version_ids: [
        ...new Set([
          ...workingPlan.matchedVersionIds,
          ...canonicalPlan.matchedVersionIds,
        ]),
      ].sort(),
    });
    return {
      row,
      document: updatedDocument,
      canonicalLevel: canonicalAfter.level,
      workspaceRevision,
      canonicalChanged,
      forgottenSelection: {
        working_copy: workingChanged,
        canonical: canonicalChanged,
        version_ids: [
          ...new Set([
            ...workingPlan.matchedVersionIds,
            ...canonicalPlan.matchedVersionIds,
          ]),
        ].sort(),
      },
      idempotentReplay: archivedReplay,
      canonicalThumbnailRequiresEnsure: canonicalChanged || archivedReplay,
    };
  });
}

async function sendBackgroundVersionContent(res, row, { published = false } = {}) {
  if (!row?.blob_sha256 || !row.blob_key) {
    throw backgroundVersionError(409, 'background_version_content_not_ready');
  }
  if (!liveMediaStorageConfigured()) {
    throw backgroundVersionError(503, 'live_media_storage_unavailable');
  }
  const record = { ...row, sha256: row.blob_sha256 };
  const bytes = await mediaBytesBySha(row.blob_sha256, record, { publicOnly: published });
  if (!bytes) throw backgroundVersionError(404, 'background_version_content_not_found');
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Length', String(bytes.length));
  res.setHeader('ETag', `"${row.blob_sha256}"`);
  res.setHeader('Cache-Control', published
    ? 'public, max-age=31536000, immutable'
    : 'private, max-age=31536000, immutable');
  res.status(200).send(bytes);
}

app.get('/api/editor-documents/:documentId/generation-attempts', async (req, res) => {
  try {
    const access = await authorizedBackgroundVersionDocument(req, res);
    if (!access) return;
    const status = String(req.query.status || 'all').trim().toLowerCase();
    if (!['all', 'active', 'archived'].includes(status)) {
      res.status(400).json({ error: 'invalid_generation_attempt_status' });
      return;
    }
    const rows = await dbListGenerationAttempts(access.row, status);
    res.status(200).json({ attempts: rows.map(publicGenerationAttempt) });
  } catch (error) {
    respondBackgroundVersionError(res, error, 'generation attempt list');
  }
});

app.post('/api/editor-documents/:documentId/generation-attempts', async (req, res) => {
  try {
    const access = await authorizedBackgroundVersionDocument(req, res, { mutate: true });
    if (!access) return;
    const normalized = normalizeGenerationAttemptCreate(req.body);
    if (normalized.error) {
      res.status(400).json({ error: 'invalid_generation_attempt', details: normalized.error });
      return;
    }
    const idempotencyKey = generationAttemptIdempotencyKey(req, req.body);
    const result = await dbCreateGenerationAttempt(
      access.row,
      access.user,
      access.authority,
      normalized.value,
      idempotencyKey,
    );
    res.setHeader(
      'Location',
      `/api/editor-documents/${encodeURIComponent(access.documentId)}/generation-attempts`,
    );
    res.status(result.created ? 201 : 200).json({
      attempt: publicGenerationAttempt(result.row),
      idempotent_replay: !result.created,
    });
  } catch (error) {
    respondBackgroundVersionError(res, error, 'generation attempt create');
  }
});

app.post('/api/editor-documents/:documentId/generation-attempts/:attemptId/discard-warp', async (req, res) => {
  try {
    const access = await authorizedBackgroundVersionDocument(req, res, { mutate: true });
    if (!access) return;
    const attemptId = backgroundVersionId(req.params.attemptId);
    if (!attemptId) {
      res.status(400).json({ error: 'invalid_generation_attempt_id' });
      return;
    }
    const expectedWarpedVersionId = backgroundVersionId(
      isObjectRecord(req.body)
        ? req.body.expected_warped_version_id ?? req.body.expectedWarpedVersionId
        : null,
    );
    if (!expectedWarpedVersionId) {
      res.status(400).json({ error: 'invalid_background_version_id' });
      return;
    }
    const expected = requireBackgroundVersionExpectedRevision(req);
    const result = await dbDiscardGenerationAttemptWarp(
      access.row,
      attemptId,
      expectedWarpedVersionId,
      expected,
      access.user,
      access.authority,
    );
    res.status(200).json({
      attempt: publicGenerationAttempt(result.attempt),
      discarded_version: publicBackgroundVersion(result.discardedVersion),
      idempotent_replay: result.idempotentReplay,
    });
  } catch (error) {
    respondBackgroundVersionError(res, error, 'generation attempt warp discard');
  }
});

app.post('/api/editor-documents/:documentId/generation-attempts/:attemptId/discard-occlusion', async (req, res) => {
  try {
    const access = await authorizedBackgroundVersionDocument(req, res, { mutate: true });
    if (!access) return;
    const attemptId = backgroundVersionId(req.params.attemptId);
    if (!attemptId) {
      res.status(400).json({ error: 'invalid_generation_attempt_id' });
      return;
    }
    const expectedOcclusionVersionId = backgroundVersionId(
      isObjectRecord(req.body)
        ? req.body.expected_occlusion_version_id ?? req.body.expectedOcclusionVersionId
        : null,
    );
    if (!expectedOcclusionVersionId) {
      res.status(400).json({ error: 'invalid_background_version_id' });
      return;
    }
    const expected = requireBackgroundVersionExpectedRevision(req);
    const documentRevision = editorDocumentRevision(
      isObjectRecord(req.body) ? req.body.document_revision : undefined,
    );
    if (documentRevision === null) {
      res.status(428).json({ error: 'editor_document_revision_required' });
      return;
    }
    const result = await dbDiscardGenerationAttemptOcclusion(
      access.row,
      attemptId,
      expectedOcclusionVersionId,
      expected,
      documentRevision,
      access.user,
      access.authority,
    );
    res.status(200).json({
      attempt: publicGenerationAttempt(result.attempt),
      detached_version: publicBackgroundVersion(result.detachedVersion),
      document: publicEditorDocument(result.document),
      forgotten_selection: {
        working_copy: result.workingCopyFellBack,
        canonical: false,
        version_ids: result.workingCopyFellBack
          ? [String(result.detachedVersion.id)]
          : [],
      },
      canonical_level: result.canonicalLevel,
      workspace_revision: result.workspaceRevision,
      thumbnail_ready: true,
      selection: {
        working_copy_fell_back: result.workingCopyFellBack,
        canonical_reference_retained: result.canonicalReferenceRetained,
      },
      detached_version_archived: result.versionArchived,
      retained_reason: result.retainedReason,
      idempotent_replay: result.idempotentReplay,
    });
  } catch (error) {
    respondBackgroundVersionError(res, error, 'generation attempt occlusion discard');
  }
});

app.put('/api/editor-documents/:documentId/generation-attempts/:attemptId/move-highlight-profile', async (req, res) => {
  try {
    const access = await authorizedBackgroundVersionDocument(req, res, { mutate: true });
    if (!access) return;
    const attemptId = backgroundVersionId(req.params.attemptId);
    if (!attemptId) {
      res.status(400).json({ error: 'invalid_generation_attempt_id' });
      return;
    }
    const raw = isObjectRecord(req.body) ? req.body : null;
    const expectedWarpedVersionId = backgroundVersionId(
      raw?.expected_warped_version_id ?? raw?.expectedWarpedVersionId,
    );
    if (!expectedWarpedVersionId) {
      res.status(400).json({ error: 'invalid_background_version_id' });
      return;
    }
    if (!isObjectRecord(raw?.cells)) {
      res.status(400).json({
        error: 'invalid_generation_attempt_move_highlight_profile',
        details: 'cells must be an object keyed by playable x,y cell',
      });
      return;
    }
    const expected = requireBackgroundVersionExpectedRevision(req);
    const result = await dbUpdateGenerationAttemptMoveHighlightProfile(
      access.row,
      attemptId,
      expectedWarpedVersionId,
      expected,
      raw.cells,
      access.user,
      access.authority,
    );
    res.status(200).json({
      attempt: publicGenerationAttempt(result.attempt),
      idempotent_replay: result.idempotentReplay,
    });
  } catch (error) {
    respondBackgroundVersionError(res, error, 'generation attempt move-highlight profile update');
  }
});

app.post('/api/editor-documents/:documentId/generation-attempts/:attemptId/archive', async (req, res) => {
  try {
    const access = await authorizedBackgroundVersionDocument(req, res, { mutate: true });
    if (!access) return;
    const attemptId = backgroundVersionId(req.params.attemptId);
    if (!attemptId) {
      res.status(400).json({ error: 'invalid_generation_attempt_id' });
      return;
    }
    const expected = requireBackgroundVersionExpectedRevision(req);
    const documentRevision = editorDocumentRevision(
      isObjectRecord(req.body) ? req.body.document_revision : undefined,
    );
    if (documentRevision === null) {
      res.status(428).json({ error: 'editor_document_revision_required' });
      return;
    }
    const result = await dbArchiveGenerationAttempt(
      access.row,
      attemptId,
      expected,
      documentRevision,
      access.user,
      access.authority,
    );
    const thumbnailAuthority = result.document.workspace_kind === 'official'
      ? `official:${result.document.workspace_id}:${result.document.level_id}`
      : `user:${result.document.owner_email}:${result.document.level_id}`;
    const thumbnail = await prepareGenerationAttemptArchiveThumbnail(
      result,
      thumbnailAuthority,
      ensureLevelThumbnailDerivative,
    );
    if (thumbnail.error) {
      console.error(
        'archived generation attempt thumbnail preparation failed:',
        thumbnail.error && thumbnail.error.message,
      );
    }
    res.status(200).json({
      attempt: publicGenerationAttempt(result.row),
      document: publicEditorDocument(result.document),
      forgotten_selection: result.forgottenSelection,
      canonical_level: result.canonicalLevel,
      workspace_revision: result.workspaceRevision,
      thumbnail_ready: thumbnail.ready,
      idempotent_replay: result.idempotentReplay,
    });
  } catch (error) {
    respondBackgroundVersionError(res, error, 'generation attempt archive');
  }
});

app.get('/api/editor-documents/:documentId/background-versions', async (req, res) => {
  try {
    const access = await authorizedBackgroundVersionDocument(req, res);
    if (!access) return;
    const status = String(req.query.status || 'all').trim().toLowerCase();
    if (!['all', 'draft', 'ready', 'archived', 'published'].includes(status)) {
      res.status(400).json({ error: 'invalid_background_version_status' });
      return;
    }
    const kind = String(req.query.kind || 'all').trim().toLowerCase();
    if (!['all', 'source', 'raw', 'warped', 'occlusion'].includes(kind)) {
      res.status(400).json({ error: 'invalid_background_version_kind' });
      return;
    }
    const rows = await dbListBackgroundVersions(access.row, status, kind);
    res.status(200).json({ versions: rows.map(publicBackgroundVersion) });
  } catch (error) {
    respondBackgroundVersionError(res, error, 'list');
  }
});

app.post('/api/editor-documents/:documentId/background-versions', async (req, res) => {
  try {
    const access = await authorizedBackgroundVersionDocument(req, res, { mutate: true });
    if (!access) return;
    const normalized = normalizeBackgroundVersionCreate(req.body);
    if (normalized.error) {
      res.status(400).json({ error: 'invalid_background_version', details: normalized.error });
      return;
    }
    const idempotencyKey = backgroundVersionIdempotencyKey(req, req.body);
    const result = await dbCreateBackgroundVersion(
      access.row,
      access.user,
      access.authority,
      normalized.value,
      idempotencyKey,
    );
    res.setHeader('Location', `/api/editor-documents/${encodeURIComponent(access.documentId)}/background-versions`);
    res.status(result.created ? 201 : 200).json({
      version: publicBackgroundVersion(result.row),
      ...(result.attempt ? { attempt: publicGenerationAttempt(result.attempt) } : {}),
      idempotent_replay: !result.created,
    });
  } catch (error) {
    respondBackgroundVersionError(res, error, 'create');
  }
});

app.put('/api/editor-documents/:documentId/background-versions/:versionId/content', async (req, res) => {
  try {
    const access = await authorizedBackgroundVersionDocument(req, res, {
      mutate: true,
      authenticatedUser: req.rawUploadUser,
    });
    if (!access) return;
    const versionId = backgroundVersionId(req.params.versionId);
    if (!versionId) {
      res.status(400).json({ error: 'invalid_background_version_id' });
      return;
    }
    if (mediaType(req.headers['content-type']) !== 'image/png') {
      res.status(415).json({ error: 'unsupported_media_type' });
      return;
    }
    const inspected = await inspectLiveMedia(req.body, 'image/png');
    if (inspected.error) {
      res.status(400).json({ error: 'invalid_background_version_content', details: inspected.error });
      return;
    }
    if (!liveMediaStorageConfigured()) {
      res.status(503).json({ error: 'live_media_storage_unavailable' });
      return;
    }
    const expected = requireBackgroundVersionExpectedRevision(req);
    const sha256 = crypto.createHash('sha256').update(req.body).digest('hex');
    const result = await dbUploadBackgroundVersionContent(
      access.row,
      versionId,
      expected,
      access.user,
      access.authority,
      req.body,
      inspected,
      sha256,
    );
    res.status(200).json({
      version: publicBackgroundVersion(result.row),
      idempotent_replay: result.idempotentReplay,
    });
  } catch (error) {
    respondBackgroundVersionError(res, error, 'content upload');
  }
});

app.post('/api/editor-documents/:documentId/background-versions/:versionId/archive', async (req, res) => {
  try {
    const access = await authorizedBackgroundVersionDocument(req, res, { mutate: true });
    if (!access) return;
    const versionId = backgroundVersionId(req.params.versionId);
    if (!versionId) {
      res.status(400).json({ error: 'invalid_background_version_id' });
      return;
    }
    const expected = requireBackgroundVersionExpectedRevision(req);
    const result = await dbArchiveBackgroundVersion(
      access.row,
      versionId,
      expected,
      access.user,
      access.authority,
    );
    res.status(200).json({
      version: publicBackgroundVersion(result.row),
      idempotent_replay: result.idempotentReplay,
    });
  } catch (error) {
    respondBackgroundVersionError(res, error, 'archive');
  }
});

app.get('/api/editor-documents/:documentId/background-versions/:versionId/content', async (req, res) => {
  try {
    const access = await authorizedBackgroundVersionDocument(req, res);
    if (!access) return;
    const versionId = backgroundVersionId(req.params.versionId);
    if (!versionId) {
      res.status(400).json({ error: 'invalid_background_version_id' });
      return;
    }
    const row = await dbBackgroundVersionRow(access.documentId, versionId);
    if (!row) {
      res.status(404).json({ error: 'background_version_not_found' });
      return;
    }
    await sendBackgroundVersionContent(res, row, { published: row.status === 'published' });
  } catch (error) {
    respondBackgroundVersionError(res, error, 'content read');
  }
});

app.get('/api/background-versions/:versionId/content', async (req, res) => {
  try {
    const versionId = backgroundVersionId(req.params.versionId);
    if (!versionId) {
      res.status(404).json({ error: 'background_version_not_found' });
      return;
    }
    const row = await dbAnyBackgroundVersionRow(versionId);
    if (!row) {
      res.status(404).json({ error: 'background_version_not_found' });
      return;
    }
    if (row.status !== 'published') {
      const user = await requireUser(req, res);
      if (!user) return;
      const document = await dbGetEditorDocumentForViewer(user.email, row.document_id);
      if (!document || !editorDocumentRowIsAuthorized(document, user, res)) {
        if (!res.headersSent) res.status(404).json({ error: 'background_version_not_found' });
        return;
      }
    }
    await sendBackgroundVersionContent(res, row, { published: row.status === 'published' });
  } catch (error) {
    respondBackgroundVersionError(res, error, 'public content read');
  }
});

// Campaign-editor workspace persistence (Phase 4 cont.): the whole campaign +
// level set as one per-user document in the Postgres `campaign_workspaces`
// table (one row per signed-in owner).
async function dbGetWorkspace(ownerEmail) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT body, revision, updated_at FROM campaign_workspaces WHERE owner_email = $1',
    [ownerEmail],
  );
  return rows[0] || null;
}

function campaignWorkspaceRevision(raw) {
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
}

function publicCampaignWorkspace(row) {
  const body = row && isObjectRecord(row.body) ? row.body : { campaigns: [], wars: [], levels: {} };
  return {
    campaigns: Array.isArray(body.campaigns) ? body.campaigns : [],
    wars: Array.isArray(body.wars) ? body.wars : [],
    levels: isObjectRecord(body.levels) ? body.levels : {},
    revision: Number(row && row.revision) || 0,
    updated_at: row && row.updated_at ? row.updated_at : null,
  };
}

async function dbPutWorkspace(ownerEmail, actorName, body, expectedRevision) {
  return withEditorDocumentTransaction(async (client) => {
    // Uses the same owner lock as new editor-document id allocation, so a whole
    // workspace write cannot race the scan and claim a newly allocated level id.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [ownerEmail]);
    const currentResult = await client.query(
      'SELECT body, revision, updated_at FROM campaign_workspaces WHERE owner_email = $1 FOR UPDATE',
      [ownerEmail],
    );
    const current = currentResult.rows[0] || null;
    if ((Number(current && current.revision) || 0) !== expectedRevision) {
      return { conflict: 'revision', row: current };
    }

    const levelIds = Object.keys(body.levels);
    if (levelIds.length) {
      const reserved = await client.query(
        `SELECT document_id, level_id
           FROM level_working_copies
          WHERE owner_email = $1
            AND workspace_kind = 'user'
            AND workspace_id = 'campaign'
            AND baseline_hash IS NULL
            AND saved_revision = 0
            AND level_id = ANY($2::text[])
          ORDER BY level_id`,
        [ownerEmail, levelIds],
      );
      if (reserved.rows.length) return { conflict: 'reserved', row: current, reserved: reserved.rows };
    }

    await withThumbnailRenderInputs(() => dbApplyWorkspaceBackgroundVersionBoundary(client, {
      workspaceKind: 'user',
      workspaceId: USER_EDITOR_WORKSPACE_ID,
      ownerEmail,
      levels: body.levels,
      actorEmail: ownerEmail,
      actorName,
      makePublic: false,
    }), client);

    if (!current) {
      const { rows } = await client.query(
        `INSERT INTO campaign_workspaces (owner_email, body, revision)
         VALUES ($1, $2::jsonb, 1)
         RETURNING body, revision, updated_at`,
        [ownerEmail, JSON.stringify(body)],
      );
      return { row: rows[0] };
    }
    const { rows } = await client.query(
      `UPDATE campaign_workspaces
          SET body = $2::jsonb,
              revision = revision + 1,
              updated_at = now()
        WHERE owner_email = $1
        RETURNING body, revision, updated_at`,
      [ownerEmail, JSON.stringify(body)],
    );
    return { row: rows[0] };
  });
}

app.get('/api/campaign-workspace', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const row = await dbGetWorkspace(user.email);
    const workspace = publicCampaignWorkspace(row);
    workspace.thumbnail_urls = await memoizedLevelThumbnailUrls(
      `user:${user.email}`,
      `v${workspace.revision}`,
      Object.entries(workspace.levels).map(([levelId, level]) => [`user:${user.email}:${levelId}`, levelId, level]),
    );
    res.status(200).json(workspace);
  } catch (error) {
    dbUnavailable(res, 'campaign workspace read failed', error, 'workspace_unavailable');
  }
});

app.put('/api/campaign-workspace', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const raw = req.body && typeof req.body === 'object' ? req.body : {};
  const expectedRevision = campaignWorkspaceRevision(raw.revision);
  if (expectedRevision === null) {
    res.status(400).json({ error: 'workspace_revision_required' });
    return;
  }
  const validationError = validateWorkspaceBody(raw);
  if (validationError) {
    res.status(400).json({ error: 'invalid_workspace', details: validationError });
    return;
  }
  try {
    const owner = await withDisplayName(user);
    const result = await dbPutWorkspace(
      user.email,
      owner.name,
      { campaigns: raw.campaigns, wars: raw.wars ?? [], levels: raw.levels },
      expectedRevision,
    );
    if (result.conflict === 'revision') {
      res.status(409).json({ error: 'workspace_revision_conflict', workspace: publicCampaignWorkspace(result.row) });
      return;
    }
    if (result.conflict === 'reserved') {
      res.status(409).json({
        error: 'workspace_level_reserved',
        level_ids: result.reserved.map((entry) => entry.level_id),
        workspace: publicCampaignWorkspace(result.row),
      });
      return;
    }
    const workspace = publicCampaignWorkspace(result.row);
    res.status(200).json({ ok: true, campaigns: workspace.campaigns.length, revision: workspace.revision, updated_at: workspace.updated_at });
  } catch (error) {
    if (error?.statusCode && error?.responseCode) {
      respondEditorDocumentError(res, error, 'campaign workspace write');
      return;
    }
    dbUnavailable(res, 'campaign workspace write failed', error, 'workspace_unavailable');
  }
});

// Game Lab run persistence: account-scoped, append-only run documents in the
// Postgres `lab_runs` table. `meta` is the small list-view summary; `body` is
// the full run payload (list responses never include it). Every query filters
// by owner_email so a user can never read or delete another user's run.
const LAB_RUN_BODY_MAX_JSON_CHARS = 8_000_000;

function validateLabRun(raw) {
  if (!isObjectRecord(raw.meta)) return 'meta must be an object';
  if (!isObjectRecord(raw.body)) return 'body must be an object';
  if (JSON.stringify(raw.body).length > LAB_RUN_BODY_MAX_JSON_CHARS) return 'body_too_large';
  return null;
}

async function dbListLabRuns(ownerEmail) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT id, meta, created_at FROM lab_runs WHERE owner_email = $1 ORDER BY created_at DESC LIMIT 100',
    [ownerEmail],
  );
  return rows;
}

async function dbGetLabRun(ownerEmail, id) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT id, meta, body, created_at FROM lab_runs WHERE owner_email = $1 AND id = $2',
    [ownerEmail, id],
  );
  return rows[0] || null;
}

async function dbInsertLabRun(ownerEmail, id, meta, body) {
  await ensureDbReady();
  const { rows } = await pool.query(
    `INSERT INTO lab_runs (id, owner_email, meta, body)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)
     RETURNING created_at`,
    [id, ownerEmail, JSON.stringify(meta), JSON.stringify(body)],
  );
  return rows[0].created_at;
}

async function dbDeleteLabRun(ownerEmail, id) {
  await ensureDbReady();
  const { rowCount } = await pool.query(
    'DELETE FROM lab_runs WHERE owner_email = $1 AND id = $2',
    [ownerEmail, id],
  );
  return rowCount > 0;
}

// ── Training runs (headless cluster AI tuning) ────────────────────────────────
async function dbListTrainRuns(ownerEmail) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT id, spec, status, created_at, updated_at FROM train_runs WHERE owner_email = $1 ORDER BY created_at DESC LIMIT 100',
    [ownerEmail],
  );
  return rows;
}

async function dbGetTrainRun(ownerEmail, id) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT id, spec, body, status, job_name, created_at, updated_at FROM train_runs WHERE owner_email = $1 AND id = $2',
    [ownerEmail, id],
  );
  return rows[0] || null;
}

async function dbInsertTrainRun(ownerEmail, id, spec) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'INSERT INTO train_runs (id, owner_email, spec) VALUES ($1, $2, $3::jsonb) RETURNING created_at',
    [id, ownerEmail, JSON.stringify(spec)],
  );
  return rows[0].created_at;
}

async function dbSetTrainRunJob(id, jobName, status) {
  await ensureDbReady();
  await pool.query('UPDATE train_runs SET job_name = $2, status = $3, updated_at = now() WHERE id = $1', [id, jobName, status]);
}

async function dbDeleteTrainRun(ownerEmail, id) {
  await ensureDbReady();
  const { rowCount } = await pool.query('DELETE FROM train_runs WHERE owner_email = $1 AND id = $2', [ownerEmail, id]);
  return rowCount > 0;
}

// ── Board-solver runs (headless cluster solving) ──────────────────────────────
// Two DISTINCT projections (F4): the list omits `body` + `job_name` (heavy + private);
// the single-row read includes them.
async function dbListSolveRuns(ownerEmail) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT id, spec, status, created_at, updated_at FROM solve_runs WHERE owner_email = $1 ORDER BY created_at DESC LIMIT 100',
    [ownerEmail],
  );
  return rows;
}

async function dbGetSolveRun(ownerEmail, id) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT id, spec, body, status, job_name, created_at, updated_at FROM solve_runs WHERE owner_email = $1 AND id = $2',
    [ownerEmail, id],
  );
  return rows[0] || null;
}

async function dbInsertSolveRun(ownerEmail, id, spec) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'INSERT INTO solve_runs (id, owner_email, spec) VALUES ($1, $2, $3::jsonb) RETURNING created_at',
    [id, ownerEmail, JSON.stringify(spec)],
  );
  return rows[0].created_at;
}

async function dbSetSolveRunJob(id, jobName, status) {
  await ensureDbReady();
  await pool.query('UPDATE solve_runs SET job_name = $2, status = $3, updated_at = now() WHERE id = $1', [id, jobName, status]);
}

// Cancel-not-purge (ADR §5, ruling 8): mark cancelled but KEEP the partial body so the
// run stays viewable. The k8s Job is deleted separately in the DELETE route.
async function dbCancelSolveRun(ownerEmail, id) {
  await ensureDbReady();
  const { rowCount } = await pool.query(
    "UPDATE solve_runs SET status = 'cancelled', updated_at = now() WHERE owner_email = $1 AND id = $2",
    [ownerEmail, id],
  );
  return rowCount > 0;
}

// ── Global shipped per-level AI weights (ship-to-everyone) ────────────────────
async function dbGetAllAiWeights() {
  await ensureDbReady();
  const { rows } = await pool.query('SELECT level_id, weights FROM level_ai_weights');
  const out = {};
  for (const r of rows) out[r.level_id] = r.weights;
  return out;
}

async function dbUpsertAiWeights(levelId, weights, updatedBy) {
  await ensureDbReady();
  await pool.query(
    `INSERT INTO level_ai_weights (level_id, weights, updated_by, updated_at) VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (level_id) DO UPDATE SET weights = EXCLUDED.weights, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [levelId, JSON.stringify(weights), updatedBy],
  );
}

async function dbDeleteAiWeights(levelId) {
  await ensureDbReady();
  await pool.query('DELETE FROM level_ai_weights WHERE level_id = $1', [levelId]);
}

app.get('/api/lab-runs', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    res.status(200).json({ runs: await dbListLabRuns(user.email) });
  } catch (error) {
    dbUnavailable(res, 'lab run list failed', error, 'lab_runs_unavailable');
  }
});

app.post('/api/lab-runs', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const raw = req.body && typeof req.body === 'object' ? req.body : {};
  const validationError = validateLabRun(raw);
  if (validationError) {
    res.status(400).json({ error: 'invalid_lab_run', details: validationError });
    return;
  }
  const id = crypto.randomUUID();
  try {
    const createdAt = await dbInsertLabRun(user.email, id, raw.meta, raw.body);
    res.status(200).json({ ok: true, id, created_at: createdAt });
  } catch (error) {
    dbUnavailable(res, 'lab run write failed', error, 'lab_runs_unavailable');
  }
});

app.get('/api/lab-runs/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const run = await dbGetLabRun(user.email, req.params.id);
    if (!run) { res.status(404).json({ error: 'run_not_found' }); return; }
    res.status(200).json({ id: run.id, meta: run.meta, body: run.body, created_at: run.created_at });
  } catch (error) {
    dbUnavailable(res, 'lab run read failed', error, 'lab_runs_unavailable');
  }
});

// Idempotent: deleting an unknown (or another owner's) run still answers
// {ok:true} — the owner filter in dbDeleteLabRun means it simply deletes
// nothing in that case.
app.delete('/api/lab-runs/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    await dbDeleteLabRun(user.email, req.params.id);
    res.status(200).json({ ok: true });
  } catch (error) {
    dbUnavailable(res, 'lab run delete failed', error, 'lab_runs_unavailable');
  }
});

// ── Training runs: launch a headless cluster tuning Job, read status, cancel ───
// POST persists the run spec then creates a k8s Job on the D8als_v7 trainer pool
// (the worker reads its own train_runs row via TRAIN_RUN_ID and writes progress
// back). In local dev (not in-cluster) the row persists as 'pending' and simply
// isn't launched, so dev stays functional without a cluster.
app.post('/api/train-runs', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const spec = req.body && typeof req.body === 'object' ? req.body : null;
  if (!spec || !spec.level || typeof spec.level !== 'object') {
    res.status(400).json({ error: 'invalid_train_spec', details: 'spec.level (a level object) is required' });
    return;
  }
  const id = crypto.randomUUID();
  try {
    await dbInsertTrainRun(user.email, id, spec);
  } catch (error) {
    dbUnavailable(res, 'train run write failed', error, 'train_runs_unavailable');
    return;
  }
  try {
    const k8s = await import('./train/k8s.mjs');
    if (k8s.inCluster()) {
      const jobName = await k8s.createTrainerJob(id);
      await dbSetTrainRunJob(id, jobName, 'running');
      res.status(200).json({ ok: true, id, status: 'running', job: jobName });
    } else {
      res.status(200).json({ ok: true, id, status: 'pending', note: 'not in-cluster: run persisted but not launched' });
    }
  } catch (error) {
    try { await dbSetTrainRunJob(id, null, 'error'); } catch { /* best effort */ }
    console.error('train job launch failed', error);
    res.status(502).json({ error: 'train_launch_failed', id, details: String((error && error.message) || error) });
  }
});

app.get('/api/train-runs', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    res.status(200).json({ runs: await dbListTrainRuns(user.email) });
  } catch (error) {
    dbUnavailable(res, 'train run list failed', error, 'train_runs_unavailable');
  }
});

app.get('/api/train-runs/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const run = await dbGetTrainRun(user.email, req.params.id);
    if (!run) { res.status(404).json({ error: 'run_not_found' }); return; }
    res.status(200).json(run);
  } catch (error) {
    dbUnavailable(res, 'train run read failed', error, 'train_runs_unavailable');
  }
});

// Cancel: delete the k8s Job (stops the run, releases the node) then the row.
app.delete('/api/train-runs/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const run = await dbGetTrainRun(user.email, req.params.id);
    if (run && run.job_name) {
      try { const k8s = await import('./train/k8s.mjs'); await k8s.deleteTrainerJob(run.job_name); }
      catch (e) { console.warn('trainer job delete failed', e && e.message); }
    }
    await dbDeleteTrainRun(user.email, req.params.id);
    res.status(200).json({ ok: true });
  } catch (error) {
    dbUnavailable(res, 'train run delete failed', error, 'train_runs_unavailable');
  }
});

// ── Board-solver runs: launch a headless bounded/anytime solve Job, read status,
// cancel ─── Clone of /api/train-runs (ADR-0069 §5). POST persists the SolveSpec then
// creates a k8s Job on the trainer pool running `node backend/solve-worker.mjs` (the
// worker reads its own solve_runs row via SOLVE_RUN_ID and JSONB-patches progress
// back). In local dev (not in-cluster) the row persists as 'pending' and isn't launched.
app.post('/api/solve-runs', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const spec = req.body && typeof req.body === 'object' ? req.body : null;
  if (!spec || !spec.level || typeof spec.level !== 'object') {
    res.status(400).json({ error: 'invalid_solve_spec', details: 'spec.level (a level object) is required' });
    return;
  }
  const id = crypto.randomUUID();
  try {
    await dbInsertSolveRun(user.email, id, spec);
  } catch (error) {
    dbUnavailable(res, 'solve run write failed', error, 'solve_runs_unavailable');
    return;
  }
  try {
    const k8s = await import('./solve/k8s.mjs');
    if (k8s.inCluster()) {
      const jobName = await k8s.createSolverJob(id);
      await dbSetSolveRunJob(id, jobName, 'running');
      res.status(200).json({ ok: true, id, status: 'running', job: jobName });
    } else {
      res.status(200).json({ ok: true, id, status: 'pending', note: 'not in-cluster: run persisted but not launched' });
    }
  } catch (error) {
    try { await dbSetSolveRunJob(id, null, 'error'); } catch { /* best effort */ }
    console.error('solve job launch failed', error);
    res.status(502).json({ error: 'solve_launch_failed', id, details: String((error && error.message) || error) });
  }
});

app.get('/api/solve-runs', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    res.status(200).json({ runs: await dbListSolveRuns(user.email) });
  } catch (error) {
    dbUnavailable(res, 'solve run list failed', error, 'solve_runs_unavailable');
  }
});

app.get('/api/solve-runs/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const run = await dbGetSolveRun(user.email, req.params.id);
    if (!run) { res.status(404).json({ error: 'run_not_found' }); return; }
    res.status(200).json(run);
  } catch (error) {
    dbUnavailable(res, 'solve run read failed', error, 'solve_runs_unavailable');
  }
});

// Cancel-not-purge (ADR §5, ruling 8): delete the k8s Job (stops the run, releases the
// node) then mark the row `cancelled` while KEEPING the partial body — the client/UI
// treat a cancelled run as still-viewable. A hard-purge is intentionally NOT offered.
app.delete('/api/solve-runs/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const run = await dbGetSolveRun(user.email, req.params.id);
    if (run && run.job_name) {
      try { const k8s = await import('./solve/k8s.mjs'); await k8s.deleteSolverJob(run.job_name); }
      catch (e) { console.warn('solver job delete failed', e && e.message); }
    }
    await dbCancelSolveRun(user.email, req.params.id);
    res.status(200).json({ ok: true });
  } catch (error) {
    dbUnavailable(res, 'solve run delete failed', error, 'solve_runs_unavailable');
  }
});

// Training Gym opening-book persistence: account-scoped, one blob row per (owner,
// level) in the Postgres `opening_books` table, mirroring the per-owner
// campaign_workspaces model. `data` is the level's whole BooksBlob {nextId, books}.
// Every query filters by owner_email so a user can never read another user's books.
const OPENING_BOOKS_LEVEL_ID_MAX = 256;

function validOpeningBooksLevelId(raw) {
  const id = String(raw ?? '').trim();
  if (!id || id.length > OPENING_BOOKS_LEVEL_ID_MAX) return null;
  return id;
}

function validateOpeningBooksBody(raw) {
  if (!isObjectRecord(raw.data)) return 'data must be an object';
  if (!Array.isArray(raw.data.books)) return 'data.books must be an array';
  return null;
}

async function dbGetOpeningBooks(ownerEmail, levelId) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT data, updated_at FROM opening_books WHERE owner_email = $1 AND level_id = $2',
    [ownerEmail, levelId],
  );
  return rows[0] || null;
}

async function dbPutOpeningBooks(ownerEmail, levelId, data) {
  await ensureDbReady();
  const { rows } = await pool.query(
    `INSERT INTO opening_books (owner_email, level_id, data)
       VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (owner_email, level_id) DO UPDATE SET
       data = EXCLUDED.data,
       updated_at = now()
     RETURNING updated_at`,
    [ownerEmail, levelId, JSON.stringify(data)],
  );
  return rows[0].updated_at;
}

app.get('/api/opening-books/:levelId', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const levelId = validOpeningBooksLevelId(req.params.levelId);
  if (!levelId) {
    res.status(400).json({ error: 'invalid_level_id' });
    return;
  }
  try {
    const row = await dbGetOpeningBooks(user.email, levelId);
    const data = row && row.data && Array.isArray(row.data.books) ? row.data : { nextId: 1, books: [] };
    res.status(200).json({ data });
  } catch (error) {
    dbUnavailable(res, 'opening books read failed', error, 'opening_books_unavailable');
  }
});

app.put('/api/opening-books/:levelId', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const levelId = validOpeningBooksLevelId(req.params.levelId);
  if (!levelId) {
    res.status(400).json({ error: 'invalid_level_id' });
    return;
  }
  const raw = req.body && typeof req.body === 'object' ? req.body : {};
  const validationError = validateOpeningBooksBody(raw);
  if (validationError) {
    res.status(400).json({ error: 'invalid_opening_books', details: validationError });
    return;
  }
  try {
    const updatedAt = await dbPutOpeningBooks(user.email, levelId, raw.data);
    res.status(200).json({ ok: true, updated_at: updatedAt });
  } catch (error) {
    dbUnavailable(res, 'opening books write failed', error, 'opening_books_unavailable');
  }
});

// --- Official (global) campaign tier (ADR-0038) ----------------------------
// Global game content readable by everyone (public GET) and authored by admins
// (requireAdmin PUT). One upserted row per id holding a complete Workspace — the SOLE
// source of official campaigns (no committed fixture fallback); a DB miss simply shows
// no officials. Mirrors the design_portfolios global pattern.
const OFFICIAL_CAMPAIGNS_STORE_SCHEMA_VERSION = 1;
const OFFICIAL_CAMPAIGN_ROW_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
function officialCampaignsRowId(raw) {
  const id = String(raw || '').trim();
  return OFFICIAL_CAMPAIGN_ROW_ID_PATTERN.test(id) ? id : null;
}

// Every campaign/level id in an official Workspace must be an `off-` prefixed,
// lowercase, DIGIT-FREE slug — exactly what the client minter produces
// (`off-<c|l>-<slug>`, slug ∈ [a-z-]). Digit-free so officials can't collide the
// per-user `c/l<n>` id counter; lowercase-only so the id matches isOfficialId and the
// loader's assumptions (rejects off-FOO, off-a_b, off-l-1).
const OFFICIAL_WORKSPACE_ID_PATTERN = /^off-[a-z]+(-[a-z]+)*$/;
function validateOfficialWorkspaceIds(data) {
  const validId = (id) => typeof id === 'string' && OFFICIAL_WORKSPACE_ID_PATTERN.test(id);
  for (const key of Object.keys((data && data.levels) || {})) {
    if (!validId(key)) return `level id "${key}" must be an off- prefixed, lowercase, digit-free slug`;
  }
  for (const campaign of (data && data.campaigns) || []) {
    if (!validId(campaign && campaign.id)) return `campaign id "${campaign && campaign.id}" must be an off- prefixed, lowercase, digit-free slug`;
  }
  for (const war of (data && data.wars) || []) {
    if (!validId(war && war.id)) return `war id "${war && war.id}" must be an off- prefixed, lowercase, digit-free slug`;
  }
  return null;
}

async function dbGetOfficialCampaigns(id) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT data, client_schema_version, revision, created_at, updated_at, updated_by FROM official_campaigns WHERE id = $1',
    [id],
  );
  return rows[0] || null;
}

async function dbUpsertOfficialCampaigns(id, input, expectedRevision) {
  return withEditorDocumentTransaction(async (client) => {
    // Row locks cannot serialize two first writers while the row is absent.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('official-campaigns:' || $1, 0))",
      [id],
    );
    const currentResult = await client.query(
      `SELECT data, client_schema_version, revision, created_at, updated_at, updated_by
         FROM official_campaigns WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const current = currentResult.rows[0] || null;
    if ((Number(current && current.revision) || 0) !== expectedRevision) {
      return { conflict: 'revision', row: current };
    }
    await withThumbnailRenderInputs(() => dbApplyWorkspaceBackgroundVersionBoundary(client, {
      workspaceKind: 'official',
      workspaceId: id,
      ownerEmail: null,
      levels: input.data.levels,
      actorEmail: input.updated_by,
      actorName: input.updated_by_name,
      makePublic: true,
    }), client);
    if (!current) {
      const { rows } = await client.query(
        `INSERT INTO official_campaigns (id, data, client_schema_version, revision, updated_by)
         VALUES ($1, $2::jsonb, $3, 1, $4)
         RETURNING data, client_schema_version, revision, created_at, updated_at, updated_by`,
        [id, JSON.stringify(input.data), input.client_schema_version, input.updated_by],
      );
      return { row: rows[0] };
    }
    const { rows } = await client.query(
      `UPDATE official_campaigns
          SET data = $2::jsonb,
              client_schema_version = $3,
              revision = revision + 1,
              updated_at = now(),
              updated_by = $4
        WHERE id = $1
        RETURNING data, client_schema_version, revision, created_at, updated_at, updated_by`,
      [id, JSON.stringify(input.data), input.client_schema_version, input.updated_by],
    );
    return { row: rows[0] };
  });
}

function publicOfficialCampaignsDocument(id, document) {
  return {
    id,
    data: isObjectRecord(document && document.data) ? document.data : {},
    client_schema_version: document && Object.hasOwn(document, 'client_schema_version') ? document.client_schema_version : null,
    revision: Number.isInteger(document && document.revision) ? document.revision : 0,
    created_at: document && document.created_at ? document.created_at : null,
    updated_at: document && document.updated_at ? document.updated_at : null,
    updated_by: document && document.updated_by ? document.updated_by : null,
  };
}

app.get('/api/official-campaigns/:id', async (req, res) => {
  const id = officialCampaignsRowId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_official_campaign_id' });
    return;
  }
  try {
    const document = await dbGetOfficialCampaigns(id);
    const portfolio = publicOfficialCampaignsDocument(id, document);
    const levels = isObjectRecord(portfolio.data?.levels) ? portfolio.data.levels : {};
    res.status(200).json({
      portfolio,
      thumbnail_urls: await memoizedLevelThumbnailUrls(
        `official:${id}`,
        `v${portfolio.revision}`,
        Object.entries(levels).map(([levelId, level]) => [`official:${id}:${levelId}`, levelId, level]),
      ),
      store_schema_version: OFFICIAL_CAMPAIGNS_STORE_SCHEMA_VERSION,
    });
  } catch (error) {
    dbUnavailable(res, 'official campaigns read failed', error, 'official_campaign_store_unavailable');
  }
});

app.put('/api/official-campaigns/:id', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const id = officialCampaignsRowId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_official_campaign_id' });
    return;
  }
  const raw = req.body && typeof req.body === 'object' ? req.body : {};
  const expectedRevision = campaignWorkspaceRevision(raw.revision);
  if (expectedRevision === null) {
    res.status(400).json({ error: 'official_campaign_revision_required' });
    return;
  }
  if (!isObjectRecord(raw.data)) {
    res.status(400).json({ error: 'official_campaign_data_object_required' });
    return;
  }
  const validationError = validateWorkspaceBody(raw.data);
  if (validationError) {
    res.status(400).json({ error: 'invalid_workspace', details: validationError });
    return;
  }
  const idError = validateOfficialWorkspaceIds(raw.data);
  if (idError) {
    res.status(400).json({ error: 'invalid_official_ids', details: idError });
    return;
  }
  try {
    const result = await dbUpsertOfficialCampaigns(id, {
      data: { campaigns: raw.data.campaigns, wars: raw.data.wars ?? [], levels: raw.data.levels },
      client_schema_version: Object.hasOwn(raw, 'client_schema_version') ? raw.client_schema_version : null,
      updated_by: user.email,
      updated_by_name: user.name || user.email,
    }, expectedRevision);
    if (result.conflict === 'revision') {
      res.status(409).json({
        error: 'official_campaign_revision_conflict',
        portfolio: publicOfficialCampaignsDocument(id, result.row),
        store_schema_version: OFFICIAL_CAMPAIGNS_STORE_SCHEMA_VERSION,
      });
      return;
    }
    const thumbnailResults = await ensureLevelThumbnailDerivativeBatch(
      Object.entries(raw.data.levels).map(([levelId, level]) => [`official:${id}:${levelId}`, level]),
    );
    const thumbnailReady = thumbnailResults.every((thumbnailResult) => thumbnailResult.status === 'fulfilled');
    for (const thumbnailResult of thumbnailResults) {
      if (thumbnailResult.status === 'rejected') {
        console.error('saved official level thumbnail preparation failed:', thumbnailResult.reason && thumbnailResult.reason.message);
      }
    }
    res.status(200).json({
      portfolio: publicOfficialCampaignsDocument(id, result.row),
      store_schema_version: OFFICIAL_CAMPAIGNS_STORE_SCHEMA_VERSION,
      thumbnail_ready: thumbnailReady,
    });
  } catch (error) {
    if (error?.statusCode && error?.responseCode) {
      respondEditorDocumentError(res, error, 'official campaigns write');
      return;
    }
    dbUnavailable(res, 'official campaigns write failed', error, 'official_campaign_store_unavailable');
  }
});

// --- Prop-seat tuning (global) tier (ADR-0061) -----------------------------
// Live-tunable prop geometry: one complete map of propId → seat
// {anchorX,anchorY,scale,w?,h?,base?}. Public GET / requireAdmin PUT, cloning
// official_campaigns. ADR-0085 supersedes ADR-0061's committed baseline: a
// missing or invalid `default` row is unavailable content, never an empty overlay.
const PROP_SEATS_STORE_SCHEMA_VERSION = 1;
const PROP_SEATS_LOCK_KEY = 4300193003;
const PROP_SEATS_ROW_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
function propSeatsRowId(raw) {
  const id = String(raw || '').trim();
  return PROP_SEATS_ROW_ID_PATTERN.test(id) ? id : null;
}

// A prop id is a lowercase slug (letters/digits/hyphens, e.g. "oak", "cabin-2x2-house").
const PROP_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
// Validate the seat map shape + base/variant integrity: every entry has numeric anchors and a
// positive scale, optional positive-integer w/h, and any `base` must reference another entry IN
// THE SAME document (no orphan size-variant — the server-side analog of /prop-lab base-protection).
function validatePropSeatsData(data, { requireComplete = false } = {}) {
  if (!isObjectRecord(data)) return 'prop seats must be an object map of propId → seat';
  const baseIds = Object.entries(data).filter(([, seat]) => isObjectRecord(seat) && !seat.base && !seat.placement).map(([id]) => id);
  if (requireComplete && !baseIds.length) return 'prop seats must contain at least one installed base prop';
  for (const [id, seat] of Object.entries(data)) {
    if (!PROP_ID_PATTERN.test(id)) return `prop id "${id}" must be a lowercase slug`;
    if (!isObjectRecord(seat)) return `seat "${id}" must be an object`;
    if (!Number.isFinite(seat.anchorX) || !Number.isFinite(seat.anchorY)) return `seat "${id}" needs numeric anchorX/anchorY`;
    if (!(Number.isFinite(seat.scale) && seat.scale > 0)) return `seat "${id}" needs a positive scale`;
    for (const dim of ['w', 'h']) {
      if (Object.hasOwn(seat, dim) && !(Number.isInteger(seat[dim]) && seat[dim] >= 1)) return `seat "${id}" ${dim} must be a positive integer`;
    }
    if (Object.hasOwn(seat, 'parts')) {
      if (!Array.isArray(seat.parts) || seat.parts.length < 1) return `seat "${id}" parts must be a non-empty array`;
      for (const [index, part] of seat.parts.entries()) {
        if (!isObjectRecord(part)) return `seat "${id}" part ${index + 1} must be an object`;
        if (!isObjectRecord(part.source) || (part.source.kind !== 'asset' && part.source.kind !== 'prop' && part.source.kind !== 'doodad') || typeof part.source.id !== 'string' || !part.source.id) {
          return `seat "${id}" part ${index + 1} needs an asset/prop/doodad source`;
        }
        if (!Number.isFinite(part.anchorX) || !Number.isFinite(part.anchorY)) return `seat "${id}" part ${index + 1} needs numeric anchorX/anchorY`;
        if (!(Number.isFinite(part.scale) && part.scale > 0)) return `seat "${id}" part ${index + 1} needs a positive scale`;
      }
    }
    if (Object.hasOwn(seat, 'base') && (typeof seat.base !== 'string' || !Object.hasOwn(data, seat.base))) {
      return `seat "${id}" base "${seat.base}" must reference an existing prop in the same document`;
    }
    if (Object.hasOwn(seat, 'base') && !baseIds.includes(seat.base)) {
      return `seat "${id}" base "${seat.base}" must reference an installed base prop`;
    }
    if (Object.hasOwn(seat, 'placement') && seat.placement !== 'prop' && seat.placement !== 'doodad') {
      return `seat "${id}" placement must be prop or doodad`;
    }
    if (Object.hasOwn(seat, 'base') && Object.hasOwn(seat, 'placement')) {
      return `seat "${id}" cannot be both a variant and authored placement`;
    }
    if (Object.hasOwn(seat, 'source') && (
      !isObjectRecord(seat.source)
      || (seat.source.kind !== 'asset' && seat.source.kind !== 'prop' && seat.source.kind !== 'doodad')
      || typeof seat.source.id !== 'string'
      || !seat.source.id
    )) return `seat "${id}" source must be an asset/prop/doodad source`;
    if (seat.placement && !Object.hasOwn(seat, 'source') && !Object.hasOwn(seat, 'parts')) {
      return `seat "${id}" authored placement needs source or parts`;
    }
    if (Object.hasOwn(seat, 'kind') && seat.kind !== 'tree' && seat.kind !== 'house' && seat.kind !== 'rock') {
      return `seat "${id}" kind is invalid`;
    }
    if (Object.hasOwn(seat, 'terrains') && (!Array.isArray(seat.terrains) || seat.terrains.some((terrain) => typeof terrain !== 'string' || !terrain))) {
      return `seat "${id}" terrains must be non-empty strings`;
    }
    if (Object.hasOwn(seat, 'blocking') && typeof seat.blocking !== 'boolean') return `seat "${id}" blocking must be boolean`;
    if (Object.hasOwn(seat, 'label') && typeof seat.label !== 'string') return `seat "${id}" label must be a string`;
  }
  return null;
}

async function dbGetPropSeats(id, queryable = null) {
  if (!queryable) await ensureDbReady();
  const { rows } = await (queryable || pool).query(
    'SELECT data, client_schema_version, revision, created_at, updated_at, updated_by FROM prop_seats WHERE id = $1',
    [id],
  );
  return rows[0] || null;
}

async function dbSavePropSeats(id, input, expectedRevision) {
  await ensureDbReady();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // A row lock cannot serialize two concurrent creates when the row is absent.
    // The advisory transaction lock closes that gap; FOR UPDATE then protects the
    // existing row while its compare-and-swap token is checked and advanced.
    await client.query('SELECT pg_advisory_xact_lock($1)', [PROP_SEATS_LOCK_KEY]);
    const current = await client.query(
      `SELECT data, client_schema_version, revision, created_at, updated_at, updated_by
         FROM prop_seats WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = current.rows[0] || null;
    if ((!row && expectedRevision !== null) || (row && Number(row.revision) !== expectedRevision)) {
      const error = new Error('prop_seats_revision_conflict');
      error.propSeatsConflict = true;
      error.currentRevision = row ? Number(row.revision) : null;
      throw error;
    }

    let saved;
    let created = false;
    if (!row) {
      created = true;
      saved = await client.query(
        `INSERT INTO prop_seats (id, data, client_schema_version, revision, updated_by)
           VALUES ($1, $2::jsonb, $3, 1, $4)
         RETURNING data, client_schema_version, revision, created_at, updated_at, updated_by`,
        [id, JSON.stringify(input.data), input.client_schema_version, input.updated_by],
      );
    } else {
      saved = await client.query(
        `UPDATE prop_seats SET data = $2::jsonb, client_schema_version = $3,
            revision = revision + 1, updated_at = now(), updated_by = $4
          WHERE id = $1
        RETURNING data, client_schema_version, revision, created_at, updated_at, updated_by`,
        [id, JSON.stringify(input.data), input.client_schema_version, input.updated_by],
      );
    }
    await client.query('COMMIT');
    return { row: saved.rows[0], created };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    throw error;
  } finally {
    client.release();
  }
}
function publicPropSeatsDocument(id, document) {
  return {
    id,
    data: document.data,
    client_schema_version: document && Object.hasOwn(document, 'client_schema_version') ? document.client_schema_version : null,
    revision: Number.isInteger(document && document.revision) ? document.revision : 0,
    created_at: document && document.created_at ? document.created_at : null,
    updated_at: document && document.updated_at ? document.updated_at : null,
    updated_by: document && document.updated_by ? document.updated_by : null,
  };
}

function requirePropSeatsDocument(id, document) {
  if (!document) throw new Error(`required prop seats document "${id}" is missing`);
  const issue = validatePropSeatsData(document.data, { requireComplete: id === 'default' });
  if (issue) throw new Error(`required prop seats document "${id}" is invalid: ${issue}`);
  return document;
}

async function seedPropSeatsFromLiveSource() {
  const existing = await pool.query(
    'SELECT data, client_schema_version, revision, created_at, updated_at, updated_by FROM prop_seats WHERE id = $1',
    ['default'],
  );
  if (existing.rows[0]) {
    // A restarted validation slot keeps its isolated edits and does not depend
    // on the live source once the complete row has been copied successfully.
    requirePropSeatsDocument('default', existing.rows[0]);
    return;
  }
  const response = await fetch(propSeatsSeedUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`prop seats seed returned ${response.status}`);
  const bytes = await readFetchBodyAtMost(response, 2 * 1024 * 1024, 'prop seats seed');
  let body;
  try { body = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('prop seats seed is not valid JSON'); }
  const portfolio = isObjectRecord(body?.portfolio) ? body.portfolio : null;
  const revision = Number(portfolio?.revision);
  const issue = validatePropSeatsData(portfolio?.data, { requireComplete: true });
  if (!portfolio || issue || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error(`prop seats seed document is invalid${issue ? `: ${issue}` : ''}`);
  }
  const clientSchemaVersion = portfolio.client_schema_version === null
    || Number.isInteger(portfolio.client_schema_version)
    ? portfolio.client_schema_version : null;
  await pool.query(
    `INSERT INTO prop_seats (id, data, client_schema_version, revision, updated_by)
       VALUES ('default', $1::jsonb, $2, $3, 'live-prop-seats-seed')
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(portfolio.data), clientSchemaVersion, revision],
  );
  const { rows } = await pool.query(
    'SELECT data, client_schema_version, revision, created_at, updated_at, updated_by FROM prop_seats WHERE id = $1',
    ['default'],
  );
  requirePropSeatsDocument('default', rows[0] || null);
}

app.get('/api/prop-seats/:id', async (req, res) => {
  const id = propSeatsRowId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_prop_seats_id' });
    return;
  }
  try {
    const document = requirePropSeatsDocument(id, await dbGetPropSeats(id));
    res.status(200).json({
      portfolio: publicPropSeatsDocument(id, document),
      store_schema_version: PROP_SEATS_STORE_SCHEMA_VERSION,
    });
  } catch (error) {
    dbUnavailable(res, 'prop seats read failed', error, 'prop_seats_store_unavailable');
  }
});

app.put('/api/prop-seats/:id', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const id = propSeatsRowId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_prop_seats_id' });
    return;
  }
  const raw = req.body && typeof req.body === 'object' ? req.body : {};
  const expectedRevision = raw.expectedRevision === null
    ? null
    : Number.isInteger(raw.expectedRevision) && raw.expectedRevision >= 0
      ? raw.expectedRevision
      : undefined;
  if (expectedRevision === undefined) {
    res.status(400).json({
      error: 'invalid_prop_seats_write',
      details: 'expectedRevision is required (null creates only when absent; an integer must match the current revision)',
    });
    return;
  }
  if (!isObjectRecord(raw.data)) {
    res.status(400).json({ error: 'prop_seats_data_object_required' });
    return;
  }
  const validationError = validatePropSeatsData(raw.data, { requireComplete: id === 'default' });
  if (validationError) {
    res.status(400).json({ error: 'invalid_prop_seats', details: validationError });
    return;
  }
  try {
    const saved = await dbSavePropSeats(id, {
      data: raw.data,
      client_schema_version: Object.hasOwn(raw, 'client_schema_version') ? raw.client_schema_version : null,
      updated_by: user.email,
    }, expectedRevision);
    res.status(saved.created ? 201 : 200).json({
      portfolio: publicPropSeatsDocument(id, saved.row),
      store_schema_version: PROP_SEATS_STORE_SCHEMA_VERSION,
    });
  } catch (error) {
    if (error && error.propSeatsConflict) {
      res.status(409).json({ error: 'prop_seats_revision_conflict', currentRevision: error.currentRevision });
      return;
    }
    dbUnavailable(res, 'prop seats write failed', error, 'prop_seats_store_unavailable');
  }
});

// --- Global SFX profile ----------------------------------------------------
// Recording bytes are live-media slots; this complete JSON document owns the
// semantic sound-set metadata/mix and gameplay assignments. It is deliberately
// not seeded from code. Missing state means decorative silence and an unavailable
// Studio editor, never a compiled fallback.
const SFX_PROFILE_SCHEMA_VERSION = 2;
const SFX_PROFILE_ID = 'default';
const SFX_SOUND_SET_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SFX_ASSIGNABLE_TERRAINS = ['grass', 'water', 'sand', 'stone', 'road', 'bridge', 'dirt', 'pebble'];
// Mirrors INTERFACE_SFX_CUES in frontend/src/core/sfxProfile.ts: a control declares the KIND
// of interface event, and this document decides what it sounds like (ADR-0071, ADR-0089).
const SFX_INTERFACE_CUES = ['activate', 'card', 'gold'];
const SFX_PROFILE_LOCK_KEY = 4300193002;

function exactSfxKeys(value, expected) {
  if (!isObjectRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function sfxRequiredText(value, max) {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= max;
}

function sfxGain(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 2;
}

function validateSfxProfileData(data) {
  if (!exactSfxKeys(data, ['schemaVersion', 'soundSets', 'terrainAssignments', 'interfaceAssignments', 'arrival'])) {
    return 'profile must contain exactly schemaVersion, soundSets, terrainAssignments, interfaceAssignments, and arrival';
  }
  if (data.schemaVersion !== SFX_PROFILE_SCHEMA_VERSION) {
    return `schemaVersion must be ${SFX_PROFILE_SCHEMA_VERSION}`;
  }
  if (!isObjectRecord(data.soundSets)) return 'soundSets must be an object';
  const soundKeys = Object.keys(data.soundSets).sort();
  if (soundKeys.length < 1 || soundKeys.length > 64) return 'soundSets must contain 1-64 entries';
  for (const key of soundKeys) {
    if (!SFX_SOUND_SET_KEY.test(key)) return `sound set "${key}" must be a lowercase semantic key`;
    const sound = data.soundSets[key];
    if (!exactSfxKeys(sound, ['label', 'character', 'build', 'gain'])) {
      return `sound set "${key}" must contain exactly label, character, build, and gain`;
    }
    if (!sfxRequiredText(sound.label, 100)) return `sound set "${key}" label is required (max 100)`;
    if (!sfxRequiredText(sound.character, 400)) return `sound set "${key}" character is required (max 400)`;
    if (!sfxRequiredText(sound.build, 400)) return `sound set "${key}" build is required (max 400)`;
    if (!sfxGain(sound.gain)) return `sound set "${key}" gain must be from 0 to 2`;
  }
  if (!exactSfxKeys(data.terrainAssignments, SFX_ASSIGNABLE_TERRAINS)) {
    return 'terrainAssignments must contain every assignable terrain exactly once';
  }
  for (const terrain of SFX_ASSIGNABLE_TERRAINS) {
    const sample = data.terrainAssignments[terrain];
    if (sample !== null && (typeof sample !== 'string' || !Object.hasOwn(data.soundSets, sample))) {
      return `terrain assignment "${terrain}" must reference a declared sound set or null`;
    }
  }
  if (!exactSfxKeys(data.interfaceAssignments, SFX_INTERFACE_CUES)) {
    return 'interfaceAssignments must contain every interface cue exactly once';
  }
  for (const cue of SFX_INTERFACE_CUES) {
    const sample = data.interfaceAssignments[cue];
    if (sample !== null && (typeof sample !== 'string' || !Object.hasOwn(data.soundSets, sample))) {
      return `interface cue "${cue}" must reference a declared sound set or null`;
    }
  }
  if (!exactSfxKeys(data.arrival, ['sample', 'gain', 'firing'])) {
    return 'arrival must contain exactly sample, gain, and firing';
  }
  if (data.arrival.sample !== null
    && (typeof data.arrival.sample !== 'string' || !Object.hasOwn(data.soundSets, data.arrival.sample))) {
    return 'arrival.sample must reference a declared sound set or null';
  }
  if (!sfxGain(data.arrival.gain)) return 'arrival.gain must be from 0 to 2';
  if (!['per-unit', 'once'].includes(data.arrival.firing)) return 'arrival.firing must be per-unit or once';
  return null;
}

function publicSfxProfile(row) {
  return {
    id: SFX_PROFILE_ID,
    data: row.data,
    clientSchemaVersion: Number(row.client_schema_version),
    revision: Number(row.revision),
    createdAt: nullableTimestampString(row.created_at),
    updatedAt: nullableTimestampString(row.updated_at),
    updatedBy: row.updated_by || null,
  };
}

async function dbGetSfxProfile() {
  await ensureDbReady();
  const { rows } = await pool.query(
    `SELECT data, client_schema_version, revision, created_at, updated_at, updated_by
       FROM sfx_profiles WHERE id = $1`,
    [SFX_PROFILE_ID],
  );
  return rows[0] || null;
}

async function dbSaveSfxProfile(data, expectedRevision, actorEmail) {
  await ensureDbReady();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [SFX_PROFILE_LOCK_KEY]);
    const current = await client.query(
      `SELECT data, client_schema_version, revision, created_at, updated_at, updated_by
         FROM sfx_profiles WHERE id = $1 FOR UPDATE`,
      [SFX_PROFILE_ID],
    );
    const row = current.rows[0] || null;
    if ((!row && expectedRevision !== null) || (row && Number(row.revision) !== expectedRevision)) {
      const error = new Error('sfx_profile_conflict');
      error.sfxProfileConflict = true;
      error.currentRevision = row ? Number(row.revision) : null;
      throw error;
    }
    let saved;
    let created = false;
    if (!row) {
      created = true;
      saved = await client.query(
        `INSERT INTO sfx_profiles (id, data, client_schema_version, revision, updated_by)
         VALUES ($1, $2::jsonb, $3, 0, $4)
         RETURNING data, client_schema_version, revision, created_at, updated_at, updated_by`,
        [SFX_PROFILE_ID, JSON.stringify(data), SFX_PROFILE_SCHEMA_VERSION, actorEmail],
      );
    } else {
      saved = await client.query(
        `UPDATE sfx_profiles SET data = $2::jsonb, client_schema_version = $3,
            revision = revision + 1, updated_at = now(), updated_by = $4
          WHERE id = $1
        RETURNING data, client_schema_version, revision, created_at, updated_at, updated_by`,
        [SFX_PROFILE_ID, JSON.stringify(data), SFX_PROFILE_SCHEMA_VERSION, actorEmail],
      );
    }
    await client.query('COMMIT');
    return { row: saved.rows[0], created };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    throw error;
  } finally {
    client.release();
  }
}

app.get('/api/sfx-profiles/:id', async (req, res) => {
  if (req.params.id !== SFX_PROFILE_ID) { res.status(400).json({ error: 'invalid_sfx_profile_id' }); return; }
  try {
    const row = await dbGetSfxProfile();
    if (!row) { res.setHeader('Cache-Control', 'no-store'); res.status(404).json({ error: 'sfx_profile_not_found' }); return; }
    const issue = validateSfxProfileData(row.data);
    if (issue || Number(row.client_schema_version) !== SFX_PROFILE_SCHEMA_VERSION) {
      throw new Error(`stored SFX profile is invalid: ${issue || 'client schema version mismatch'}`);
    }
    const etag = `"sfx-profile-${Number(row.revision)}"`;
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) { res.status(304).end(); return; }
    res.status(200).json({ profile: publicSfxProfile(row) });
  } catch (error) {
    dbUnavailable(res, 'SFX profile read failed', error, 'sfx_profile_unavailable');
  }
});

app.put('/api/sfx-profiles/:id', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (req.params.id !== SFX_PROFILE_ID) { res.status(400).json({ error: 'invalid_sfx_profile_id' }); return; }
  const raw = isObjectRecord(req.body) ? req.body : {};
  const expectedRevision = raw.expectedRevision === null
    ? null : Number.isInteger(raw.expectedRevision) && raw.expectedRevision >= 0 ? raw.expectedRevision : undefined;
  if (expectedRevision === undefined || raw.clientSchemaVersion !== SFX_PROFILE_SCHEMA_VERSION) {
    res.status(400).json({ error: 'invalid_sfx_profile_write', details: 'expectedRevision and clientSchemaVersion are required' });
    return;
  }
  const issue = validateSfxProfileData(raw.data);
  if (issue) { res.status(400).json({ error: 'invalid_sfx_profile', details: issue }); return; }
  try {
    const saved = await dbSaveSfxProfile(raw.data, expectedRevision, user.email);
    res.status(saved.created ? 201 : 200).json({ profile: publicSfxProfile(saved.row) });
  } catch (error) {
    if (error && error.sfxProfileConflict) {
      res.status(409).json({ error: 'sfx_profile_conflict', currentRevision: error.currentRevision });
      return;
    }
    dbUnavailable(res, 'SFX profile write failed', error, 'sfx_profile_unavailable');
  }
});

// --- Database-owned drawable catalog ---------------------------------------
// A drawable is an installed content record. Its `kind` selects code-owned
// behavior; every concrete id, label, order, configuration value, and media-role
// assignment comes from Postgres. Consumers must not reconstruct this inventory
// from semantic-slot filenames.
const DRAWABLE_CATALOG_SCHEMA_VERSION = 1;
const DRAWABLE_ID_PATTERN = /^[a-z][a-z0-9._-]{0,127}$/;
const DRAWABLE_KIND_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const DRAWABLE_ROLE_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;

async function dbReadHomepageBootstrapScene() {
  await ensureDbReady();
  const { rows } = await pool.query(
    `SELECT da.id, state.revision,
            b.sha256, b.media_type, b.byte_length, b.width, b.height
       FROM drawable_assets da
       JOIN drawable_asset_media dam
         ON dam.asset_id = da.id AND dam.role = 'background'
       JOIN media_slots slot
         ON slot.slot = dam.slot AND slot.lifecycle_state = 'active'
       JOIN media_versions version
         ON version.id = slot.active_version_id
        AND version.slot = slot.slot
        AND version.status IN ('accepted', 'legacy-bridge')
       JOIN media_blobs b ON b.sha256 = version.blob_sha256
       CROSS JOIN drawable_catalog_state state
      WHERE da.kind = 'animated-scene'
        AND da.lifecycle_state = 'active'
        AND da.behavior->'roles' ? 'homepage-scene'
      ORDER BY da.sort_order, da.id
      LIMIT 2`,
  );
  if (rows.length !== 1) {
    throw mediaMutationError('homepage_bootstrap_scene_invalid', 503, { count: rows.length });
  }
  const row = rows[0];
  return {
    revision: Number(row.revision || 0),
    scene: {
      id: row.id,
      background: {
        immutableUrl: immutableMediaUrl(row.sha256),
        sha256: row.sha256,
        mediaType: row.media_type,
        byteLength: Number(row.byte_length),
        width: row.width === null ? null : Number(row.width),
        height: row.height === null ? null : Number(row.height),
      },
    },
  };
}

function normalizeDrawableInput(raw) {
  if (!isObjectRecord(raw)) return { error: 'drawable must be an object' };
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const kind = typeof raw.kind === 'string' ? raw.kind.trim() : '';
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  const sortOrder = raw.sortOrder ?? raw.sort_order ?? 0;
  const lifecycleState = raw.lifecycleState ?? raw.lifecycle_state ?? 'active';
  const behavior = raw.behavior ?? {};
  const metadata = raw.metadata ?? {};
  const media = raw.media ?? raw.mediaRoles ?? raw.media_roles;
  if (!DRAWABLE_ID_PATTERN.test(id)) return { error: 'id must be a lowercase drawable slug' };
  if (!DRAWABLE_KIND_PATTERN.test(kind)) return { error: 'kind must be a lowercase behavior slug' };
  if (!label || label.length > 160) return { error: 'label must contain 1-160 characters' };
  if (!Number.isSafeInteger(sortOrder)) return { error: 'sortOrder must be an integer' };
  if (lifecycleState !== 'active' && lifecycleState !== 'retired') return { error: 'lifecycleState must be active or retired' };
  if (!isObjectRecord(behavior)) return { error: 'behavior must be an object' };
  if (!isObjectRecord(metadata)) return { error: 'metadata must be an object' };
  if (!isObjectRecord(media)) return { error: 'media must be a role-to-slot object' };
  const roles = [];
  for (const [role, rawSlot] of Object.entries(media)) {
    const slot = mediaSlotId(rawSlot);
    if (!DRAWABLE_ROLE_PATTERN.test(role)) return { error: `invalid media role "${role}"` };
    if (!slot) return { error: `media role "${role}" has an invalid semantic slot` };
    roles.push({ role, slot });
  }
  roles.sort((left, right) => left.role.localeCompare(right.role));
  return { value: { id, kind, label, sortOrder, lifecycleState, behavior, metadata, roles } };
}

async function dbReadDrawableCatalog({ includeRetired = false, queryable = null } = {}) {
  let client = null;
  let db = queryable;
  if (!db) {
    await ensureDbReady();
    client = await pool.connect();
    db = client;
  }
  try {
    if (client) await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const state = await db.query('SELECT revision, updated_at FROM drawable_catalog_state WHERE singleton = true');
    const assets = await db.query(
      `SELECT id, kind, label, sort_order, lifecycle_state, behavior, metadata, row_revision
         FROM drawable_assets
        WHERE ($1::boolean OR lifecycle_state = 'active')
        ORDER BY kind, sort_order, label, id`,
      [includeRetired],
    );
    const media = await db.query(
      `SELECT dam.asset_id, dam.role, dam.slot,
              s.lifecycle_state AS slot_lifecycle_state,
              v.status AS version_status, b.sha256, b.media_type, b.byte_length, b.width, b.height
         FROM drawable_asset_media dam
         JOIN drawable_assets da ON da.id = dam.asset_id
         LEFT JOIN media_slots s ON s.slot = dam.slot
         LEFT JOIN media_versions v ON v.id = s.active_version_id AND v.slot = s.slot
         LEFT JOIN media_blobs b ON b.sha256 = v.blob_sha256
        WHERE ($1::boolean OR da.lifecycle_state = 'active')
        ORDER BY dam.asset_id, dam.role`,
      [includeRetired],
    );
    if (client) await client.query('COMMIT');
    const rolesByAsset = new Map();
    for (const row of media.rows) {
      const usable = row.slot_lifecycle_state === 'active'
        && ['accepted', 'legacy-bridge'].includes(row.version_status) && row.sha256;
      if (!usable && !includeRetired) {
        throw mediaMutationError('drawable_catalog_incomplete', 503, { assetId: row.asset_id, role: row.role, slot: row.slot });
      }
      const roles = rolesByAsset.get(row.asset_id) ?? {};
      roles[row.role] = {
        slot: row.slot,
        ...(usable ? { media: {
          url: encodedMediaSlotUrl(row.slot),
          immutableUrl: immutableMediaUrl(row.sha256),
          sha256: row.sha256,
          mediaType: row.media_type,
          byteLength: Number(row.byte_length),
          width: row.width === null ? null : Number(row.width),
          height: row.height === null ? null : Number(row.height),
        } } : { media: null }),
      };
      rolesByAsset.set(row.asset_id, roles);
    }
    return {
      schemaVersion: DRAWABLE_CATALOG_SCHEMA_VERSION,
      revision: Number(state.rows[0]?.revision || 0),
      updatedAt: nullableTimestampString(state.rows[0]?.updated_at),
      assets: assets.rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        label: row.label,
        sortOrder: Number(row.sort_order),
        lifecycleState: row.lifecycle_state,
        behavior: row.behavior || {},
        metadata: row.metadata || {},
        rowRevision: Number(row.row_revision),
        media: rolesByAsset.get(row.id) ?? {},
      })),
    };
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original failure */ }
    }
    throw error;
  } finally {
    if (client) client.release();
  }
}

async function dbUpsertDrawableBatch(changes, actorEmail) {
  await ensureDbReady();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { input, expectedRevision } of changes) {
      const currentResult = await client.query('SELECT * FROM drawable_assets WHERE id = $1 FOR UPDATE', [input.id]);
      const current = currentResult.rows[0] || null;
      if (current && Number(current.row_revision) !== expectedRevision) {
        throw mediaMutationError('drawable_asset_conflict', 409, { assetId: input.id, currentRevision: Number(current.row_revision) });
      }
      if (!current && expectedRevision !== 0) throw mediaMutationError('drawable_asset_not_found', 404, { assetId: input.id });
      const slots = input.roles.map(({ slot }) => slot);
      const slotResult = await client.query('SELECT slot FROM media_slots WHERE slot = ANY($1::text[])', [slots]);
      const found = new Set(slotResult.rows.map((row) => row.slot));
      const missing = slots.filter((slot) => !found.has(slot));
      if (missing.length) throw mediaMutationError('drawable_media_slot_not_found', 400, { assetId: input.id, slots: missing });
      await client.query(
        `INSERT INTO drawable_assets (id, kind, label, sort_order, lifecycle_state, behavior, metadata, row_revision, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 1, $8)
         ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, label = EXCLUDED.label,
           sort_order = EXCLUDED.sort_order, lifecycle_state = EXCLUDED.lifecycle_state,
           behavior = EXCLUDED.behavior, metadata = EXCLUDED.metadata,
           row_revision = drawable_assets.row_revision + 1, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [input.id, input.kind, input.label, input.sortOrder, input.lifecycleState,
          JSON.stringify(input.behavior), JSON.stringify(input.metadata), actorEmail],
      );
      await client.query('DELETE FROM drawable_asset_media WHERE asset_id = $1', [input.id]);
      for (const role of input.roles) {
        await client.query('INSERT INTO drawable_asset_media (asset_id, role, slot) VALUES ($1, $2, $3)', [input.id, role.role, role.slot]);
      }
      await client.query(
        'INSERT INTO drawable_asset_events (asset_id, action, actor_email, details) VALUES ($1, $2, $3, $4::jsonb)',
        [input.id, current ? 'updated' : 'created', actorEmail, JSON.stringify({ kind: input.kind, roles: input.roles })],
      );
    }
    const nextRevision = await client.query(
      'UPDATE drawable_catalog_state SET revision = revision + 1, updated_at = now() WHERE singleton = true RETURNING revision',
    );
    await client.query('COMMIT');
    return Number(nextRevision.rows[0].revision);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original failure */ }
    throw error;
  } finally {
    client.release();
  }
}

async function dbUpsertDrawable(input, expectedRevision, actorEmail) {
  return dbUpsertDrawableBatch([{ input, expectedRevision }], actorEmail);
}

// --- Shared live-media catalog ---------------------------------------------
// Stable semantic slots are the only public names. Candidate/source identities
// and object keys remain private catalog details. A hash becomes publicly
// immutable only after an accepted/legacy activation; candidate/source hashes
// never become public, while historical published hashes remain seedable.
const MEDIA_CATALOG_SCHEMA_VERSION = 1;
const MEDIA_VERSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEDIA_SHA_PATTERN = /^[0-9a-f]{64}$/;
const MEDIA_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const MEDIA_SLOT_SEGMENT_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._@+-]*$/;
const MEDIA_CATALOG_CACHE_TTL_MS = 5 * 1000;
const PUBLIC_MEDIA_SLOT_INDEX = Symbol('public-media-slot-index');
let mediaCatalogCache = { at: 0, body: null };
let mediaCatalogCacheGeneration = 0;
let mediaCatalogReadPromise = null;
const mediaBufferCache = new Map();
let mediaBufferCacheBytes = 0;
const mediaBlobRecordCache = new Map();
const mediaReadInFlight = new Map();
const liveMediaReadBudget = createByteReadBudget({
  maxBytes: LIVE_MEDIA_READ_BUDGET_BYTES,
  timeoutMs: LIVE_MEDIA_READ_TIMEOUT_MS,
});

function mediaVersionId(raw) {
  const value = String(raw || '').trim();
  return MEDIA_VERSION_ID_PATTERN.test(value) ? value.toLowerCase() : null;
}

function mediaSha(raw) {
  const value = String(raw || '').trim().toLowerCase();
  return MEDIA_SHA_PATTERN.test(value) ? value : null;
}

function mediaSlotId(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value.length > 512 || value.includes('//') || value.endsWith('/')) return null;
  if (value.split('/').some((segment) => !MEDIA_SLOT_SEGMENT_PATTERN.test(segment) || segment === '.' || segment === '..')) return null;
  if (value === 'level-thumb' || value.startsWith('level-thumb/')) return null;
  return value;
}

function mediaSourcePath(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().replace(/\\/g, '/');
  if (!value || value.length > 1024 || value.startsWith('/') || value.includes('//')) return null;
  if (value.split('/').some((segment) => !segment || segment === '.' || segment === '..')) return null;
  return value;
}

function mediaName(raw) {
  const value = String(raw || '').trim().toLowerCase();
  return MEDIA_NAME_PATTERN.test(value) ? value : null;
}

function boundedMediaText(raw, fallback, max) {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return value.length <= max ? value : null;
}

function mediaJsonObject(raw, fallback = {}) {
  if (raw === undefined) return fallback;
  return isObjectRecord(raw) ? raw : null;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObjectRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeMediaSlotMetadata(raw) {
  if (!isObjectRecord(raw)) return { error: 'slotMetadata must be an object' };
  const value = { ...raw };
  if (raw.acceptance === undefined) return { value };
  if (!isObjectRecord(raw.acceptance)) return { error: 'slotMetadata.acceptance must be an object' };
  const mode = String(raw.acceptance.mode || '').trim();
  if (mode === 'standalone') {
    value.acceptance = { mode: 'standalone' };
    return { value };
  }
  if (mode !== 'group') return { error: 'slotMetadata.acceptance.mode must be standalone or group' };
  const groupId = boundedMediaText(raw.acceptance.groupId ?? raw.acceptance.group_id, '', 160);
  const rawSlots = raw.acceptance.requiredSlots ?? raw.acceptance.required_slots;
  if (!groupId || !Array.isArray(rawSlots) || rawSlots.length < 2 || rawSlots.length > 256) {
    return { error: 'group acceptance requires groupId and 2-256 requiredSlots' };
  }
  const requiredSlots = rawSlots.map(mediaSlotId).sort();
  if (requiredSlots.some((slot) => !slot) || new Set(requiredSlots).size !== requiredSlots.length) {
    return { error: 'group requiredSlots must contain unique valid semantic slots' };
  }
  value.acceptance = { mode: 'group', groupId, requiredSlots: [...requiredSlots].sort() };
  return { value };
}

function mediaType(raw) {
  const value = String(raw || '').split(';', 1)[0].trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(value)) return null;
  return value;
}

const PUBLIC_IMAGE_MEDIA_TYPES = new Set([
  'image/png', 'image/apng', 'image/jpeg', 'image/jpg', 'image/webp',
  'image/avif', 'image/gif', 'image/bmp', 'image/x-icon', 'image/vnd.microsoft.icon',
]);
const PUBLIC_AUDIO_MEDIA_TYPES = new Set([
  'audio/wav', 'audio/x-wav', 'audio/vnd.wave', 'audio/mpeg', 'audio/ogg',
  'audio/mp4', 'audio/aac', 'audio/flac', 'audio/webm',
]);
const PUBLIC_VIDEO_MEDIA_TYPES = new Set(['video/mp4', 'video/webm', 'video/ogg']);
const PUBLIC_FONT_MEDIA_TYPES = new Set([
  'font/woff', 'font/woff2', 'font/ttf', 'font/otf',
  'application/font-woff', 'application/font-sfnt',
]);

function publicMediaTypeAllowed(value) {
  return PUBLIC_IMAGE_MEDIA_TYPES.has(value) || PUBLIC_AUDIO_MEDIA_TYPES.has(value)
    || PUBLIC_VIDEO_MEDIA_TYPES.has(value) || PUBLIC_FONT_MEDIA_TYPES.has(value);
}

function mediaIdempotencyKey(req) {
  const raw = req.get('idempotency-key');
  if (raw === undefined) return null;
  const value = String(raw).trim();
  if (!/^[A-Za-z0-9._:@+-]{1,200}$/.test(value)) {
    throw mediaMutationError('invalid_media_idempotency_key', 400);
  }
  return value;
}

function encodedMediaSlotUrl(slot) {
  return `/assets/${slot.split('/').map(encodeURIComponent).join('/')}`;
}

function immutableMediaUrl(sha256) {
  return `/api/media/${sha256}`;
}

function adminMediaUrl(sha256) {
  return `/api/admin/media/${sha256}`;
}

function contentAddressedLocalPath(rootValue, blobKey, label) {
  const root = path.resolve(rootValue);
  const target = path.resolve(root, ...String(blobKey).split('/'));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error(`invalid ${label} blob key`);
  return target;
}

function createAzureContainerClient(containerUrl) {
  const { BlobServiceClient } = require('@azure/storage-blob');
  const { DefaultAzureCredential } = require('@azure/identity');
  const url = new URL(containerUrl);
  const service = new BlobServiceClient(`${url.protocol}//${url.host}`, new DefaultAzureCredential());
  return service.getContainerClient(decodeURIComponent(url.pathname.replace(/^\/+/, '')));
}

function liveMediaStorageConfigured() {
  return Boolean(liveMediaStorageDir || liveMediaContainerUrl);
}

function liveMediaBlobKey(sha256) {
  return `objects/${sha256.slice(0, 2)}/${sha256}`;
}

function liveMediaBlobLocalPath(blobKey) {
  return contentAddressedLocalPath(liveMediaStorageDir, blobKey, 'live media');
}

function azureLiveMediaContainer() {
  if (liveMediaContainerClient) return liveMediaContainerClient;
  if (!liveMediaContainerUrl) throw new Error('LIVE_MEDIA_CONTAINER_URL is not configured');
  liveMediaContainerClient = createAzureContainerClient(liveMediaContainerUrl);
  return liveMediaContainerClient;
}

async function readNodeStreamExactly(readable, expectedLength, label, abortSignal = null) {
  const target = Buffer.allocUnsafe(expectedLength);
  let offset = 0;
  const abortRead = () => {
    const reason = abortSignal?.reason instanceof Error
      ? abortSignal.reason
      : new Error(`${label} was aborted`);
    if (typeof readable.destroy === 'function') readable.destroy(reason);
  };
  if (abortSignal?.aborted) abortRead();
  else abortSignal?.addEventListener('abort', abortRead, { once: true });
  try {
    for await (const raw of readable) {
      const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      if (offset + chunk.length > expectedLength) {
        if (typeof readable.destroy === 'function') readable.destroy();
        throw new Error(`${label} exceeded its declared byte length`);
      }
      chunk.copy(target, offset);
      offset += chunk.length;
    }
  } catch (error) {
    if (typeof readable.destroy === 'function') readable.destroy();
    throw error;
  } finally {
    abortSignal?.removeEventListener('abort', abortRead);
  }
  if (offset !== expectedLength) throw new Error(`${label} did not match its declared byte length`);
  return target;
}

async function readFetchBodyExactly(response, expectedLength, label) {
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) !== expectedLength) {
    if (response.body) await response.body.cancel().catch(() => {});
    throw new Error(`${label} Content-Length did not match the catalog`);
  }
  if (!response.body) throw new Error(`${label} response body is unavailable`);
  const target = Buffer.allocUnsafe(expectedLength);
  const reader = response.body.getReader();
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      if (offset + chunk.length > expectedLength) {
        await reader.cancel().catch(() => {});
        throw new Error(`${label} exceeded its catalog byte length`);
      }
      chunk.copy(target, offset);
      offset += chunk.length;
    }
  } finally {
    reader.releaseLock();
  }
  if (offset !== expectedLength) throw new Error(`${label} did not match its catalog byte length`);
  return target;
}

async function readFetchBodyAtMost(response, maxLength, label) {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!Number.isInteger(Number(declared)) || Number(declared) > maxLength)) {
    if (response.body) await response.body.cancel().catch(() => {});
    throw new Error(`${label} exceeds its byte limit`);
  }
  if (!response.body) throw new Error(`${label} response body is unavailable`);
  const target = Buffer.allocUnsafe(maxLength);
  const reader = response.body.getReader();
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      if (offset + chunk.length > maxLength) {
        await reader.cancel().catch(() => {});
        throw new Error(`${label} exceeds its byte limit`);
      }
      chunk.copy(target, offset);
      offset += chunk.length;
    }
  } finally {
    reader.releaseLock();
  }
  return target.subarray(0, offset);
}

async function writeLiveMediaBlob(blobKey, buffer, sha256, storedMediaType) {
  if (liveMediaStorageDir) {
    const target = liveMediaBlobLocalPath(blobKey);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    try {
      const stat = await fs.promises.stat(target);
      if (stat.size !== buffer.length) throw new Error('content-addressed local media object length mismatch');
      const existing = await readNodeStreamExactly(fs.createReadStream(target), buffer.length, 'existing local media object');
      const existingSha = crypto.createHash('sha256').update(existing).digest('hex');
      if (existingSha !== sha256) throw new Error('content-addressed local media object is corrupt');
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.promises.writeFile(temp, buffer, { flag: 'wx' });
      await fs.promises.rename(temp, target);
    } catch (error) {
      await fs.promises.rm(temp, { force: true }).catch(() => {});
      if (error.code !== 'EEXIST') throw error;
    }
    return;
  }
  const block = azureLiveMediaContainer().getBlockBlobClient(blobKey);
  try {
    await block.uploadData(buffer, {
      conditions: { ifNoneMatch: '*' },
      blobHTTPHeaders: {
        blobContentType: storedMediaType,
        blobCacheControl: 'public, max-age=31536000, immutable',
      },
      metadata: { sha256 },
    });
  } catch (error) {
    const status = error && (error.statusCode || error.status);
    if (status !== 409 && status !== 412 && error.code !== 'BlobAlreadyExists') throw error;
    const properties = await block.getProperties();
    if (
      String(properties.metadata?.sha256 || '') !== sha256 || Number(properties.contentLength) !== buffer.length
      || mediaType(properties.contentType) !== storedMediaType
    ) {
      throw new Error('content-addressed Azure media object metadata mismatch');
    }
  }
}

function liveMediaSeedImmutableUrl(sha256) {
  if (liveMediaSeedBaseUrl) return `${liveMediaSeedBaseUrl}/${sha256}`;
  if (!liveMediaSeedCatalogUrl) return '';
  return new URL(`/api/media/${sha256}`, liveMediaSeedCatalogUrl).toString();
}

async function readLiveMediaBlob(record, { allowSeed = true, abortSignal = null } = {}) {
  const expectedLength = Number(record.byte_length);
  if (!Number.isInteger(expectedLength) || expectedLength < 1 || expectedLength > LIVE_MEDIA_MAX_BYTES) {
    throw new Error('live media record has an invalid byte length');
  }
  if (liveMediaStorageDir) {
    const target = liveMediaBlobLocalPath(record.blob_key);
    try {
      const stat = await fs.promises.stat(target);
      if (stat.size !== expectedLength) throw new Error('local live media object length differs from catalog');
      return await readNodeStreamExactly(fs.createReadStream(target), expectedLength, 'local live media object', abortSignal);
    } catch (error) {
      if (error.code !== 'ENOENT' || !allowSeed || !liveMediaSeedCatalogUrl) throw error;
    }
    const sourceUrl = liveMediaSeedImmutableUrl(record.sha256);
    if (!sourceUrl) throw new Error('live media seed immutable base is unavailable');
    const timeoutSignal = AbortSignal.timeout(30_000);
    const signal = abortSignal ? AbortSignal.any([abortSignal, timeoutSignal]) : timeoutSignal;
    const response = await fetch(sourceUrl, { signal });
    if (!response.ok) throw new Error(`live media seed object returned ${response.status}`);
    const buffer = await readFetchBodyExactly(response, expectedLength, 'live media seed object');
    const digest = crypto.createHash('sha256').update(buffer).digest('hex');
    if (digest !== record.sha256 || buffer.length !== Number(record.byte_length)) {
      throw new Error('live media seed object failed content-address verification');
    }
    await writeLiveMediaBlob(record.blob_key, buffer, digest, record.media_type);
    return buffer;
  }
  const blob = azureLiveMediaContainer().getBlobClient(record.blob_key);
  const options = abortSignal ? { abortSignal } : {};
  const properties = await blob.getProperties(options);
  if (
    Number(properties.contentLength) !== expectedLength
    || String(properties.metadata?.sha256 || '') !== record.sha256
    || mediaType(properties.contentType) !== record.media_type
  ) throw new Error('Azure live media object metadata differs from catalog');
  const response = await blob.download(0, expectedLength, options);
  if (Number(response.contentLength) !== expectedLength || !response.readableStreamBody) {
    throw new Error('Azure live media download length differs from catalog');
  }
  return readNodeStreamExactly(response.readableStreamBody, expectedLength, 'Azure live media object', abortSignal);
}

function cachedMediaBuffer(sha256) {
  const entry = mediaBufferCache.get(sha256);
  if (!entry) return null;
  mediaBufferCache.delete(sha256);
  mediaBufferCache.set(sha256, entry);
  return entry.buffer;
}

function cacheMediaBuffer(sha256, buffer) {
  if (!LIVE_MEDIA_CACHE_MAX_BYTES || buffer.length > LIVE_MEDIA_CACHE_MAX_BYTES) return;
  const prior = mediaBufferCache.get(sha256);
  if (prior) {
    mediaBufferCacheBytes -= prior.buffer.length;
    mediaBufferCache.delete(sha256);
  }
  mediaBufferCache.set(sha256, { buffer });
  mediaBufferCacheBytes += buffer.length;
  while (mediaBufferCacheBytes > LIVE_MEDIA_CACHE_MAX_BYTES && mediaBufferCache.size) {
    const oldestKey = mediaBufferCache.keys().next().value;
    const oldest = mediaBufferCache.get(oldestKey);
    mediaBufferCache.delete(oldestKey);
    mediaBufferCacheBytes -= oldest.buffer.length;
  }
}

function invalidateMediaCatalogCache() {
  mediaCatalogCacheGeneration += 1;
  mediaCatalogCache = { at: 0, body: null };
}

function mediaMutationError(code, status, details = null) {
  const error = new Error(code);
  error.mediaCode = code;
  error.httpStatus = status;
  error.mediaDetails = details;
  return error;
}

function sendMediaMutationError(res, error, fallbackCode) {
  if (error && error.mediaCode) {
    const body = { error: error.mediaCode };
    if (error.mediaDetails !== null) body.details = error.mediaDetails;
    res.status(error.httpStatus || 400).json(body);
    return;
  }
  dbUnavailable(res, fallbackCode.replace(/_/g, ' '), error, fallbackCode);
}

function mediaExpectedRevision(req) {
  const body = isObjectRecord(req.body) ? req.body : {};
  const bodyValue = body.expectedRevision ?? body.expected_revision;
  if (Number.isInteger(bodyValue) && bodyValue >= 0) return bodyValue;
  const header = String(req.headers['if-match'] || '').trim().replace(/^W\//, '').replace(/^"|"$/g, '');
  return /^\d+$/.test(header) ? Number(header) : null;
}

function requireMediaExpectedRevision(req) {
  const expected = mediaExpectedRevision(req);
  if (expected === null) throw mediaMutationError('media_expected_revision_required', 428);
  return expected;
}

function assertMediaRevision(row, expected) {
  if (Number(row.row_revision) !== expected) {
    throw mediaMutationError('media_version_conflict', 409, { currentRevision: Number(row.row_revision) });
  }
}

async function withMediaCatalogTransaction(fn, { invalidatePublic = false } = {}) {
  await ensureDbReady();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    if (invalidatePublic) invalidateMediaCatalogCache();
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    throw error;
  } finally {
    client.release();
  }
}

async function bumpMediaCatalog(client) {
  const { rows } = await client.query(
    'UPDATE media_catalog_state SET revision = revision + 1, updated_at = now() WHERE singleton = true RETURNING revision',
  );
  return Number(rows[0]?.revision || 0);
}

async function currentMediaCatalogRevision(client) {
  const { rows } = await client.query('SELECT revision FROM media_catalog_state WHERE singleton = true');
  return Number(rows[0]?.revision || 0);
}

async function logMediaEvent(client, row, action, actorEmail, details = {}) {
  await client.query(
    `INSERT INTO media_asset_events (slot, source_path, version_id, action, actor_email, details)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [row.slot || null, row.source_path || null, row.id || null, action, actorEmail, JSON.stringify(details)],
  );
}

async function dbMediaVersionRow(id, queryable = pool, lock = false) {
  const { rows } = await queryable.query(
    `SELECT v.id, v.slot, v.source_path, v.domain, v.role, v.label, v.status,
            v.blob_sha256, v.metadata, v.provenance, v.native_evidence,
            v.review_evidence, v.row_revision, v.created_at, v.updated_at, v.updated_by,
            b.blob_key, b.media_type, b.byte_length, b.width, b.height,
            s.domain AS slot_domain, s.role AS slot_role, s.lifecycle_state AS slot_lifecycle_state,
            s.metadata AS slot_metadata
       FROM media_versions v
       LEFT JOIN media_blobs b ON b.sha256 = v.blob_sha256
       LEFT JOIN media_slots s ON s.slot = v.slot
      WHERE v.id = $1${lock ? ' FOR UPDATE OF v' : ''}`,
    [id],
  );
  return rows[0] || null;
}

async function mediaBlobRecord(sha256, { publicOnly = false, queryable = null } = {}) {
  if (!publicOnly && !queryable && mediaBlobRecordCache.has(sha256)) return mediaBlobRecordCache.get(sha256);
  if (!queryable) await ensureDbReady();
  const db = queryable || pool;
  const { rows } = await db.query(
    `SELECT b.sha256, b.blob_key, b.media_type, b.byte_length, b.width, b.height, b.published_at
       FROM media_blobs b
       WHERE b.sha256 = $1
         AND (NOT $2::boolean OR b.published_at IS NOT NULL)
      LIMIT 1`,
    [sha256, publicOnly],
  );
  const record = rows[0] || null;
  if (record && !publicOnly && !queryable) mediaBlobRecordCache.set(sha256, record);
  return record;
}

async function mediaBytesBySha(sha256, record = null, { publicOnly = false } = {}) {
  let buffer = cachedMediaBuffer(sha256);
  if (buffer) return buffer;
  if (mediaReadInFlight.has(sha256)) return mediaReadInFlight.get(sha256);
  const blob = record || await mediaBlobRecord(sha256, { publicOnly });
  if (!blob) return null;
  if (!liveMediaStorageConfigured()) throw new Error('live media storage is not configured');
  const pending = liveMediaReadBudget.run(Number(blob.byte_length), async (abortSignal) => {
    const loaded = await readLiveMediaBlob(blob, { abortSignal });
    const digest = crypto.createHash('sha256').update(loaded).digest('hex');
    if (digest !== sha256 || loaded.length !== Number(blob.byte_length)) {
      throw new Error('stored live media failed content-address verification');
    }
    cacheMediaBuffer(sha256, loaded);
    return loaded;
  });
  mediaReadInFlight.set(sha256, pending);
  try {
    buffer = await pending;
    return buffer;
  } finally {
    if (mediaReadInFlight.get(sha256) === pending) mediaReadInFlight.delete(sha256);
  }
}

async function verifyLiveMediaBlobPresent(record) {
  const sha256 = mediaSha(record?.sha256 ?? record?.blob_sha256);
  if (!sha256 || !record?.blob_key) {
    throw mediaMutationError('media_object_verification_failed', 409, { sha256: sha256 || null });
  }
  const blobRecord = record.sha256 === sha256 ? record : { ...record, sha256 };
  return liveMediaReadBudget.run(Number(blobRecord.byte_length), async (abortSignal) => {
    const buffer = await readLiveMediaBlob(blobRecord, {
      allowSeed: false,
      abortSignal,
    });
    const digest = crypto.createHash('sha256').update(buffer).digest('hex');
    if (digest !== sha256 || buffer.length !== Number(blobRecord.byte_length)) {
      throw mediaMutationError('media_object_verification_failed', 409, { sha256 });
    }
  });
}

async function resolvedMediaSlot(slot, queryable = null) {
  if (!queryable) await ensureDbReady();
  const db = queryable || pool;
  const { rows } = await db.query(
    `SELECT s.slot, s.domain, s.role, s.availability_policy, s.lifecycle_state,
            s.active_version_id, s.activated_at, s.retired_at, s.retirement_evidence,
            s.metadata AS slot_metadata, s.row_revision AS slot_revision,
            v.id AS version_id, v.status AS version_status, v.metadata AS version_metadata,
            v.provenance, v.native_evidence, v.row_revision AS version_revision,
            b.sha256, b.blob_key, b.media_type, b.byte_length, b.width, b.height
       FROM media_slots s
       LEFT JOIN media_versions v ON v.id = s.active_version_id AND v.slot = s.slot
       LEFT JOIN media_blobs b ON b.sha256 = v.blob_sha256
      WHERE s.slot = $1`,
    [slot],
  );
  return rows[0] || null;
}

async function resolveMediaSlotBytes(slot, catalog = null) {
  const snapshot = catalog || await publicMediaCatalog();
  const item = snapshot.slots.find((entry) => entry.slot === slot);
  if (!item?.media?.sha256) return null;
  const record = await mediaBlobRecord(item.media.sha256);
  if (!record) return null;
  const buffer = await mediaBytesBySha(record.sha256, record);
  return buffer ? { record, buffer, slot: item } : null;
}

function publicMediaSlotMetadata(row) {
  const raw = isObjectRecord(row.slot_metadata) ? row.slot_metadata : {};
  if (raw.acceptance === undefined) return {};
  const contract = mediaAcceptanceContract({ slot: row.slot, slot_metadata: raw });
  return { acceptance: contract };
}

function publicMediaSlot(row) {
  const hasActiveMedia = Boolean(
    row.version_id && row.sha256 && ['accepted', 'legacy-bridge'].includes(row.version_status),
  );
  return {
    slot: row.slot,
    domain: row.domain,
    role: row.role,
    availabilityPolicy: row.availability_policy,
    lifecycleState: row.lifecycle_state,
    activeVersionId: row.active_version_id ? String(row.active_version_id) : null,
    activatedAt: nullableTimestampString(row.activated_at),
    retiredAt: nullableTimestampString(row.retired_at),
    rowRevision: Number(row.slot_revision),
    metadata: publicMediaSlotMetadata(row),
    versionStatus: hasActiveMedia ? row.version_status : null,
    productionEligible: row.version_status === 'accepted',
    // Public consumers receive only the validated per-version runtime
    // projection. Authoring notes, migration paths, provenance, and review
    // evidence remain confined to the authenticated admin catalog.
    // A staging slot has no runtime version to project yet. In particular,
    // typed semantic slots such as ground-cover sheets require metadata on the
    // eventual active version; applying that requirement to the empty staging
    // shell makes the slot impossible to configure through the admin API.
    versionMetadata: hasActiveMedia ? publicRuntimeVersionMetadata(row) : {},
    provenance: {},
    nativeEvidence: {},
    media: hasActiveMedia ? {
      url: encodedMediaSlotUrl(row.slot),
      immutableUrl: immutableMediaUrl(row.sha256),
      sha256: row.sha256,
      mediaType: row.media_type,
      width: row.width === null ? null : Number(row.width),
      height: row.height === null ? null : Number(row.height),
      byteLength: Number(row.byte_length),
    } : null,
  };
}

async function dbReadMediaCatalog({
  includeVersions = false,
  includeEvents = false,
  eventBeforeId = null,
  eventLimit = 200,
  queryable = null,
} = {}) {
  let client = null;
  let db = queryable;
  if (!db) {
    await ensureDbReady();
    client = await pool.connect();
    db = client;
  }
  try {
    if (client) await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const stateResult = await db.query(
      'SELECT revision, updated_at FROM media_catalog_state WHERE singleton = true',
    );
    const slotResult = await db.query(
      `SELECT s.slot, s.domain, s.role, s.availability_policy, s.lifecycle_state,
              s.active_version_id, s.activated_at, s.retired_at, s.retirement_evidence,
              s.metadata AS slot_metadata, s.row_revision AS slot_revision,
              v.id AS version_id, v.status AS version_status, v.metadata AS version_metadata,
              v.provenance, v.native_evidence, v.row_revision AS version_revision,
              b.sha256, b.blob_key, b.media_type, b.byte_length, b.width, b.height
         FROM media_slots s
         LEFT JOIN media_versions v ON v.id = s.active_version_id AND v.slot = s.slot
         LEFT JOIN media_blobs b ON b.sha256 = v.blob_sha256
        ORDER BY s.slot`,
    );
    const usableActive = (row) => (
      row.lifecycle_state === 'active' && row.version_id && row.sha256
      && ['accepted', 'legacy-bridge'].includes(row.version_status)
    );
    const incompleteCritical = slotResult.rows
    .filter((row) => row.lifecycle_state === 'active' && row.availability_policy === 'critical' && (
      !row.version_id || !row.sha256 || !['accepted', 'legacy-bridge'].includes(row.version_status)
    ))
    .map((row) => row.slot);
    const rowBySlot = new Map(slotResult.rows.map((row) => [row.slot, row]));
    const incompleteDecorativeGroupSlots = new Set();
    const checkedGroups = new Set();
    for (const row of slotResult.rows.filter((candidate) => candidate.lifecycle_state === 'active')) {
      const contract = mediaAcceptanceContract({ slot: row.slot, slot_metadata: row.slot_metadata });
      if (contract.mode !== 'group') continue;
      const groupKey = `${contract.groupId}\0${contract.requiredSlots.join('\0')}`;
      if (checkedGroups.has(groupKey)) continue;
      checkedGroups.add(groupKey);
      const members = contract.requiredSlots.map((slot) => rowBySlot.get(slot) || null);
      const complete = members.every((member) => {
        if (!member || !usableActive(member)) return false;
        const memberContract = mediaAcceptanceContract({ slot: member.slot, slot_metadata: member.slot_metadata });
        return memberContract.mode === 'group' && memberContract.groupId === contract.groupId
          && canonicalJson(memberContract.requiredSlots) === canonicalJson(contract.requiredSlots);
      });
      if (complete) continue;
      const critical = members.some((member) => member?.availability_policy === 'critical')
        || row.availability_policy === 'critical';
      if (critical) {
        for (const slot of contract.requiredSlots) if (!incompleteCritical.includes(slot)) incompleteCritical.push(slot);
      } else {
        for (const slot of contract.requiredSlots) incompleteDecorativeGroupSlots.add(slot);
      }
    }
    incompleteCritical.sort();
    if (!includeVersions && incompleteCritical.length) {
      throw mediaMutationError('media_catalog_incomplete', 503, { criticalSlots: incompleteCritical });
    }
    const body = {
    schemaVersion: MEDIA_CATALOG_SCHEMA_VERSION,
    revision: Number(stateResult.rows[0]?.revision || 0),
    updatedAt: nullableTimestampString(stateResult.rows[0]?.updated_at),
    slots: (includeVersions
      ? slotResult.rows
       : slotResult.rows.filter((row) => (
         usableActive(row) && !incompleteDecorativeGroupSlots.has(row.slot)
       ))).map((row) => {
        const item = publicMediaSlot(row);
        if (includeVersions) {
          item.metadata = row.slot_metadata || {};
          item.retirementEvidence = row.retirement_evidence || {};
        }
        return item;
      }),
    };
    if (includeVersions) {
      const { rows } = await db.query(
      `SELECT v.id, v.slot, v.source_path, v.domain, v.role, v.label, v.status,
              v.blob_sha256, v.metadata, v.provenance, v.native_evidence,
              v.review_evidence, v.row_revision, v.created_at, v.updated_at, v.updated_by,
              b.media_type, b.byte_length, b.width, b.height
         FROM media_versions v LEFT JOIN media_blobs b ON b.sha256 = v.blob_sha256
        ORDER BY v.updated_at DESC, v.id`,
    );
      body.versions = rows.map((row) => ({
      id: String(row.id),
      slot: row.slot,
      sourcePath: row.source_path,
      domain: row.domain,
      role: row.role,
      label: row.label,
      status: row.status,
      productionEligible: row.status === 'accepted',
      metadata: row.metadata || {},
      provenance: row.provenance || {},
      nativeEvidence: row.native_evidence || {},
      reviewEvidence: row.review_evidence || {},
      rowRevision: Number(row.row_revision),
      createdAt: nullableTimestampString(row.created_at),
      updatedAt: nullableTimestampString(row.updated_at),
      updatedBy: row.updated_by,
      media: row.blob_sha256 ? {
        url: row.status === 'accepted' || row.status === 'legacy-bridge'
          ? immutableMediaUrl(row.blob_sha256)
          : adminMediaUrl(row.blob_sha256),
        sha256: row.blob_sha256,
        mediaType: row.media_type,
        width: row.width === null ? null : Number(row.width),
        height: row.height === null ? null : Number(row.height),
        byteLength: Number(row.byte_length),
      } : null,
      }));
    }
    if (includeEvents) {
      const { rows } = await db.query(
        `SELECT id, slot, source_path, version_id, action, actor_email, details, created_at
          FROM media_asset_events
         WHERE ($1::bigint IS NULL OR id < $1::bigint)
         ORDER BY id DESC LIMIT $2`,
        [eventBeforeId, eventLimit],
      );
      body.events = rows.map((row) => ({
      id: Number(row.id), slot: row.slot, sourcePath: row.source_path,
      versionId: row.version_id ? String(row.version_id) : null,
      action: row.action, actorEmail: row.actor_email, details: row.details || {},
      createdAt: nullableTimestampString(row.created_at),
      }));
      body.eventsPage = {
        limit: eventLimit,
        nextBeforeId: rows.length === eventLimit ? Number(rows[rows.length - 1].id) : null,
      };
    }
    if (client) await client.query('COMMIT');
    return body;
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* preserve catalog read error */ }
    }
    throw error;
  } finally {
    if (client) client.release();
  }
}

async function publicMediaCatalog() {
  const now = Date.now();
  if (mediaCatalogCache.body && now - mediaCatalogCache.at < MEDIA_CATALOG_CACHE_TTL_MS) return mediaCatalogCache.body;
  if (mediaCatalogReadPromise) return mediaCatalogReadPromise;
  const generation = mediaCatalogCacheGeneration;
  const readPromise = (async () => {
    const body = await dbReadMediaCatalog();
    if (generation !== mediaCatalogCacheGeneration) {
      if (mediaCatalogReadPromise === readPromise) mediaCatalogReadPromise = null;
      return publicMediaCatalog();
    }
    Object.defineProperty(body, PUBLIC_MEDIA_SLOT_INDEX, {
      value: new Map(body.slots.map((slot) => [slot.slot, slot])),
      enumerable: false,
    });
    mediaCatalogCache = { at: Date.now(), body };
    return body;
  })();
  mediaCatalogReadPromise = readPromise;
  try {
    return await readPromise;
  } finally {
    if (mediaCatalogReadPromise === readPromise) mediaCatalogReadPromise = null;
  }
}

const LIVE_MEDIA_READINESS_TIMEOUT_MS = 5_000;
const LIVE_MEDIA_READINESS_PROBE_SHA = '0'.repeat(64);

async function verifyLiveMediaStoreReadiness(record) {
  if (!liveMediaStorageConfigured()) throw new Error('live media object store is not configured');

  if (liveMediaStorageDir) {
    await fs.promises.mkdir(liveMediaStorageDir, { recursive: true });
    await fs.promises.access(liveMediaStorageDir, fs.constants.R_OK | fs.constants.W_OK);
    if (!record) return;

    // Local/test-slot stores may hydrate lazily from the live backend. Reading
    // the smallest active object proves both that the local store is usable and
    // that a missing local object can actually recover from its configured seed.
    const buffer = await readLiveMediaBlob(record, {
      allowSeed: true,
      abortSignal: AbortSignal.timeout(LIVE_MEDIA_READINESS_TIMEOUT_MS),
    });
    const digest = crypto.createHash('sha256').update(buffer).digest('hex');
    if (digest !== record.sha256 || buffer.length !== Number(record.byte_length)) {
      throw new Error('live media readiness object failed content-address verification');
    }
    return;
  }

  // A HEAD-equivalent property read proves workload identity, RBAC, container
  // routing, and object metadata without downloading media on every Kubernetes
  // probe. Before the first active slot exists, a correctly authorized 404 on a
  // canonical sentinel key still proves access to the configured container.
  const target = record || {
    sha256: LIVE_MEDIA_READINESS_PROBE_SHA,
    blob_key: liveMediaBlobKey(LIVE_MEDIA_READINESS_PROBE_SHA),
  };
  const blob = azureLiveMediaContainer().getBlobClient(target.blob_key);
  let properties;
  try {
    properties = await blob.getProperties({ abortSignal: AbortSignal.timeout(LIVE_MEDIA_READINESS_TIMEOUT_MS) });
  } catch (error) {
    const status = error && (error.statusCode || error.status);
    if (!record && status === 404) return;
    throw error;
  }
  if (!record) throw new Error('live media readiness sentinel unexpectedly exists');
  if (
    Number(properties.contentLength) !== Number(record.byte_length)
    || String(properties.metadata?.sha256 || '') !== record.sha256
    || mediaType(properties.contentType) !== record.media_type
  ) throw new Error('live media readiness object metadata differs from catalog');
}

async function liveMediaReadiness() {
  await ensureDbReady();

  // Read all four DB authorities afresh. Public endpoints may use short-lived
  // caches, but a Kubernetes probe must observe current catalog state and run
  // the exact typed renderer projections that browser boot/thumbnails require.
  const [catalog, drawableCatalog, propSeatsRow, unitCatalog] = await Promise.all([
    dbReadMediaCatalog(),
    dbReadDrawableCatalog(),
    dbGetPropSeats('default'),
    dbReadUnitCatalog(),
  ]);
  const propSeats = requirePropSeatsDocument('default', propSeatsRow);
  const propSeatsRevision = Number(propSeats.revision);
  const unitCatalogRevision = Number(unitCatalog.revision);
  const drawableCatalogRevision = Number(drawableCatalog.revision);
  const catalogIssue = liveCatalogReadinessIssue(catalog, { requireCritical: true });
  if (catalogIssue) throw new Error(catalogIssue);
  const catalogRevision = Number(catalog.revision);

  if (!serverRender || typeof serverRender.applyServerRenderSnapshot !== 'function') {
    throw new Error('complete live renderer snapshot validator is unavailable');
  }
  await withServerRenderCriticalSection(() => {
    serverRender.applyServerRenderSnapshot({
      mediaCatalog: catalog,
      drawableCatalog,
      propSeats: propSeats.data,
      unitCatalog,
    });
  });

  const sampleSlot = [...catalog.slots].sort((left, right) => (
    Number(right.availabilityPolicy === 'critical') - Number(left.availabilityPolicy === 'critical')
    || Number(left.media.byteLength) - Number(right.media.byteLength)
    || left.slot.localeCompare(right.slot)
  ))[0];
  const sample = sampleSlot ? await mediaBlobRecord(sampleSlot.media.sha256, { publicOnly: true }) : null;
  await verifyLiveMediaStoreReadiness(sample);
  return { catalogRevision, drawableCatalogRevision, propSeatsRevision, unitCatalogRevision };
}

async function publicMediaSlotById(slot) {
  const snapshot = await publicMediaCatalog();
  return snapshot[PUBLIC_MEDIA_SLOT_INDEX]?.get(slot) || null;
}

function publicMediaVersion(row) {
  return {
    id: String(row.id),
    slot: row.slot,
    sourcePath: row.source_path,
    domain: row.domain,
    role: row.role,
    label: row.label,
    status: row.status,
    rowRevision: Number(row.row_revision),
    metadata: row.metadata || {},
    provenance: row.provenance || {},
    nativeEvidence: row.native_evidence || {},
    reviewEvidence: row.review_evidence || {},
    media: row.blob_sha256 ? {
      url: row.status === 'accepted' || row.status === 'legacy-bridge'
        ? immutableMediaUrl(row.blob_sha256)
        : adminMediaUrl(row.blob_sha256),
      sha256: row.blob_sha256,
      mediaType: row.media_type,
      width: row.width === null ? null : Number(row.width),
      height: row.height === null ? null : Number(row.height),
      byteLength: Number(row.byte_length),
    } : null,
  };
}

const LIVE_MEDIA_MAX_RASTER_PIXELS = 8 * 1024 * 1024;

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 4 <= buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xff) offset += 1;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset++];
    if (marker === 0xd8 || marker === 0x01) continue;
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (sof.has(marker) && length >= 7) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = buffer.toString('ascii', 12, 16);
  if (kind === 'VP8X' && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (kind === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
  }
  if (kind === 'VP8 ' && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

function avifDimensions(buffer) {
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset);
    if (size < 8 || offset + size > buffer.length) break;
    const end = offset + size;
    const marker = buffer.indexOf(Buffer.from('ispe'), offset + 4);
    if (marker !== -1 && marker + 16 <= end) {
      return { width: buffer.readUInt32BE(marker + 8), height: buffer.readUInt32BE(marker + 12) };
    }
    offset = end;
  }
  // `ispe` is normally nested below meta/iprp/ipco; bounded search avoids
  // decoding before dimensions have been checked.
  const marker = buffer.indexOf(Buffer.from('ispe'));
  if (marker !== -1 && marker + 16 <= buffer.length) {
    return { width: buffer.readUInt32BE(marker + 8), height: buffer.readUInt32BE(marker + 12) };
  }
  return null;
}

function rasterHeaderDimensions(buffer, storedMediaType) {
  if (storedMediaType === 'image/png' || storedMediaType === 'image/apng') {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (storedMediaType === 'image/jpeg' || storedMediaType === 'image/jpg') return jpegDimensions(buffer);
  if (storedMediaType === 'image/webp') return webpDimensions(buffer);
  if (storedMediaType === 'image/avif') return avifDimensions(buffer);
  if (storedMediaType === 'image/gif') {
    if (buffer.length < 10 || !/^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6))) return null;
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (storedMediaType === 'image/bmp') {
    if (buffer.length < 26 || buffer.toString('ascii', 0, 2) !== 'BM') return null;
    return { width: Math.abs(buffer.readInt32LE(18)), height: Math.abs(buffer.readInt32LE(22)) };
  }
  if (storedMediaType === 'image/x-icon' || storedMediaType === 'image/vnd.microsoft.icon') {
    if (buffer.length < 8 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) return null;
    return { width: buffer[6] || 256, height: buffer[7] || 256 };
  }
  return null;
}

function mediaMagicIssue(buffer, storedMediaType) {
  const ascii = (start, end) => buffer.length >= end ? buffer.toString('ascii', start, end) : '';
  const starts = (...values) => values.some((value) => ascii(0, value.length) === value);
  const sfnt = buffer.length >= 4 && (
    starts('OTTO', 'true', 'typ1') || buffer.readUInt32BE(0) === 0x00010000
  );
  if (storedMediaType === 'font/woff2') return starts('wOF2') ? null : 'body is not WOFF2 font data';
  if (storedMediaType === 'font/woff' || storedMediaType === 'application/font-woff') {
    return starts('wOFF') ? null : 'body is not WOFF font data';
  }
  if (storedMediaType === 'font/otf') return starts('OTTO') ? null : 'body is not OpenType font data';
  if (storedMediaType === 'font/ttf' || storedMediaType === 'application/font-sfnt') {
    return sfnt ? null : 'body is not SFNT font data';
  }
  if (storedMediaType === 'audio/wav' || storedMediaType === 'audio/x-wav' || storedMediaType === 'audio/vnd.wave') {
    return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE' ? null : 'body is not WAVE audio data';
  }
  if (storedMediaType === 'audio/ogg' || storedMediaType === 'video/ogg') {
    return starts('OggS') ? null : 'body is not Ogg media data';
  }
  if (storedMediaType === 'audio/flac') return starts('fLaC') ? null : 'body is not FLAC audio data';
  if (storedMediaType === 'audio/mpeg') {
    const frameSync = buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
    return starts('ID3') || frameSync ? null : 'body is not MPEG audio data';
  }
  if (storedMediaType === 'audio/aac') {
    const adts = buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0;
    return adts ? null : 'body is not AAC audio data';
  }
  if (storedMediaType === 'audio/mp4' || storedMediaType === 'video/mp4') {
    return ascii(4, 8) === 'ftyp' ? null : 'body is not ISO BMFF media data';
  }
  if (storedMediaType === 'audio/webm' || storedMediaType === 'video/webm') {
    return buffer.length >= 4 && buffer.readUInt32BE(0) === 0x1a45dfa3 ? null : 'body is not WebM media data';
  }
  return null;
}

async function inspectLiveMedia(buffer, storedMediaType) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return { error: 'body must contain media bytes' };
  if (buffer.length > LIVE_MEDIA_MAX_BYTES) return { error: 'media exceeds the 32 MiB limit' };
  if (!storedMediaType.startsWith('image/')) {
    const magicIssue = mediaMagicIssue(buffer, storedMediaType);
    return magicIssue ? { error: magicIssue } : { width: null, height: null };
  }
  if (storedMediaType === 'image/svg+xml') {
    const head = buffer.subarray(0, Math.min(buffer.length, 1024 * 1024)).toString('utf8');
    if (!/<svg(?:\s|>)/i.test(head)) return { error: 'body is not SVG image data' };
    return { width: null, height: null };
  }
  const header = rasterHeaderDimensions(buffer, storedMediaType);
  if (!header) return { error: `unsupported or invalid ${storedMediaType} raster header` };
  if (
    !Number.isInteger(header.width) || !Number.isInteger(header.height) || header.width < 1 || header.height < 1
    || header.width > 32768 || header.height > 32768 || header.width * header.height > LIVE_MEDIA_MAX_RASTER_PIXELS
  ) return { error: 'raster dimensions exceed the 8 megapixel safety limit' };
  // Header parsing is intentionally the terminal upload inspection. Decoding
  // untrusted compressed pixels in the request path can OOM the pod, and the
  // browser/canvas consumers remain responsible for format support at render
  // time. Content hash + magic/header + bounded dimensions are the storage gate.
  return header;
}

function mediaProvenanceIssue(row) {
  if (!isObjectRecord(row.provenance) || !Object.keys(row.provenance).length) return 'non-empty provenance is required';
  return null;
}

function reviewedMediaEvidenceIssue(row) {
  const evidence = isObjectRecord(row.review_evidence) ? row.review_evidence : {};
  if (evidence.approved !== true || !evidence.approvedBy || !evidence.approvedAt) return 'owner review approval is required';
  if (evidence.contentSha256 !== row.blob_sha256) return 'owner review does not cover the current media bytes';
  const proof = isObjectRecord(evidence.evidence) ? evidence.evidence : {};
  const sourceArt = sourceArtTurntableProjection(row);
  if (predrawnBoardSlotSlug(row.slot)) {
    const issue = predrawnBoardOwnerProofIssue(row, proof, evidence.surfaceUrl);
    if (issue) return issue;
  } else if (sfxSampleSlot(row.slot)) {
    const issue = sfxSampleOwnerProofIssue(row, proof, evidence.surfaceUrl);
    if (issue) return issue;
  } else if (levelEditorBrushIconSlot(row.slot)) {
    const issue = levelEditorBrushIconOwnerProofIssue(row, proof, evidence.surfaceUrl);
    if (issue) return issue;
  } else if (strategikonBackgroundSlot(row.slot)) {
    const issue = strategikonBackgroundOwnerProofIssue(row, proof, evidence.surfaceUrl);
    if (issue) return issue;
  } else if (runCardBackSlot(row.slot) || row.role === 'card-back') {
    const projectionIssue = runCardBackMediaIssue(row);
    if (projectionIssue) return projectionIssue;
    const issue = runCardBackOwnerProofIssue(row, proof, evidence.surfaceUrl);
    if (issue) return issue;
  } else if (wallMaterialSlot(row.slot)) {
    const issue = wallMaterialOwnerProofIssue(row, proof, evidence.surfaceUrl);
    if (issue) return issue;
  } else if (sourceArt.claimed && !sourceArt.issue) {
    const issue = sourceArtTurntableOwnerProofIssue(sourceArt.value, proof, evidence.surfaceUrl);
    if (issue) return issue;
  } else {
    const runCardArt = runCardArtProjection(row);
    if (runCardArt.claimed && !runCardArt.issue) {
      const issue = runCardArtOwnerProofIssue(runCardArt.value, proof, evidence.surfaceUrl);
      if (issue) return issue;
    } else if (row.domain === 'terrain') {
      if (proof.schema !== 'terrain-surface-canonical-board-proof-v1') return 'terrain review requires the canonical board proof schema';
      if (proof.renderer !== 'BoardLabBoard/BoardTerrainLayer') return 'terrain review proof renderer is invalid';
      if (proof.canonicalScale !== 1 || proof.assetLocalScale !== 1 || proof.spatialResampling !== false) {
        return 'terrain review proof must cover exact canonical 1x pixels without resampling';
      }
      if (proof.deterministicProof !== true || !Array.isArray(proof.selectedCandidates) || !Array.isArray(proof.slotSnapshots)) {
        return 'terrain review proof is incomplete';
      }
      const selected = proof.selectedCandidates.filter((item) => isObjectRecord(item) && item.versionId === row.id);
      if (
        selected.length !== 1 || selected[0].slot !== row.slot
        || mediaSha(selected[0].sha256) !== row.blob_sha256
      ) return 'terrain review proof does not identify the reviewed version bytes';
    } else if (proof.schema === 'live-media-owner-group-proof-v1') {
      if (proof.canonicalScale !== 1 || !runtimeSemanticText(proof.surfaceKind, 160) || !Array.isArray(proof.selectedCandidates)) {
        return 'group owner proof is incomplete';
      }
      const selected = proof.selectedCandidates.filter((item) => isObjectRecord(item) && item.versionId === row.id);
      if (selected.length !== 1 || selected[0].slot !== row.slot || mediaSha(selected[0].sha256) !== row.blob_sha256) {
        return 'group owner proof does not identify the reviewed version bytes';
      }
    } else {
      if (proof.schema !== 'live-media-owner-proof-v1') return 'review requires a typed live-media owner proof';
      if (
        mediaVersionId(proof.versionId) !== row.id || mediaSha(proof.contentSha256) !== row.blob_sha256
        || proof.slot !== row.slot || proof.canonicalScale !== 1
        || !runtimeSemanticText(proof.surfaceKind, 160)
      ) return 'owner proof does not identify the reviewed version at canonical 1x';
    }
  }
  return null;
}

const VISUAL_MEDIA_DOMAINS = new Set([
  'background', 'portrait', 'prop', 'review-media', 'social-card', 'sprite-atlas',
  'run-card-art', 'terrain', 'ui-kit', 'unit-art', 'wall-decor',
]);
const RUN_CARD_ART_CARD_IDS = Object.freeze([
  'p', 'pp', 'b', 'k', 'ppp', 'pb', 'pk', 'pppp', 'ppb', 'ppk', 'ppppp', 'r',
  'bb', 'kb', 'kk', 'pppb', 'pppk', 'pppppp', 'pr', 'pbb', 'pkb', 'pkk', 'ppppb',
  'ppppk', 'ppppppp', 'ppr', 'br', 'kr', 'ppbb', 'ppkb', 'ppkk', 'pppppb', 'pppppk',
  'pppppppp', 'pppr', 'bbb', 'kbb', 'kkb', 'kkk', 'pbr', 'pkr', 'pppbb', 'pppkb',
  'pppkk', 'ppppppb', 'ppppppk', 'ppppppppp', 'ppppr', 'q',
]);
const RUN_CARD_ART_REQUIRED_SLOTS = Object.freeze(
  RUN_CARD_ART_CARD_IDS.map((id) => `ui/run/card-art/${id}/illustration.png`).sort(),
);
const RUN_CARD_ART_GROUP_ID = 'run-card-art-core-v1';
const RUN_STARTER_CARD_ART_SCHEMA = 'run-starter-card-art-v1';
const RUN_STARTER_CARD_ART_PROVENANCE_SCHEMA = 'run-starter-card-art-provenance-v1';
const RUN_STARTER_CARD_ART_BY_ID = Object.freeze({
  'his-grace': Object.freeze({ title: 'His Grace', pieces: Object.freeze(['king']), value: 0 }),
  'front-lines': Object.freeze({ title: 'Front Lines', pieces: Object.freeze(['pawn', 'pawn']), value: 2 }),
});
const RUN_CARD_ART_PIECE_VALUE = Object.freeze({ pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 });
const RUN_CARD_ART_PIECE_INITIAL = Object.freeze({ pawn: 'p', knight: 'k', bishop: 'b', rook: 'r', queen: 'q' });
const RUN_CARD_ART_PIECE_ORDER = Object.freeze(['pawn', 'knight', 'bishop', 'rook', 'queen']);
const RUN_CARD_FRAME_SLOT = 'ui/run/card-prototypes/frame-v1.png';
const RUN_CARD_PESTIFEROUS_FRAME_SLOT = 'ui/run/card-prototypes/pestiferous-frame-v1.png';
const RUN_CARD_CONCINNOUS_FRAME_SLOT = 'ui/run/card-prototypes/concinnous-frame-v1.png';
const RUN_CARD_LEGATINE_FRAME_SLOT = 'ui/run/card-prototypes/legatine-adlected-frame-v1.png';
const RUN_CARD_HIERATIC_FRAME_SLOT = 'ui/run/card-prototypes/hieratic-frame-v1.png';
const RUN_CARD_PRAECIPUUS_FRAME_SLOT = 'ui/run/card-prototypes/praecipuus-frame-v1.png';
const RUN_CARD_COST_COIN_SOURCE_SLOT = 'ui/run/card-prototypes/cost-coin-source-v1.png';
const RUN_CARD_FRAME_VARIANT_BY_SLOT = Object.freeze({
  [RUN_CARD_FRAME_SLOT]: 'standard',
  [RUN_CARD_PESTIFEROUS_FRAME_SLOT]: 'pestiferous',
  [RUN_CARD_CONCINNOUS_FRAME_SLOT]: 'concinnous',
  [RUN_CARD_LEGATINE_FRAME_SLOT]: 'legatine',
  [RUN_CARD_HIERATIC_FRAME_SLOT]: 'hieratic',
  [RUN_CARD_PRAECIPUUS_FRAME_SLOT]: 'praecipuus',
  [RUN_CARD_COST_COIN_SOURCE_SLOT]: 'cost-coin-source',
});
const RUN_CARD_FRAME_SCHEMA = 'run-card-frame-v1';
const SOURCE_ART_TURNTABLE_SCHEMA = 'structure-source-art-turntable-v1';
const SOURCE_ART_TURNTABLE_DIRECTIONS = Object.freeze([
  'south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east',
]);
const GROUND_COVER_RUNTIME_KEYS = Object.freeze([
  'terrain', 'id', 'frameWidth', 'frameHeight', 'frameCount', 'baseX', 'baseY', 'contentWidth',
]);

function runtimeInteger(value, { min = 0, max = 32768 } = {}) {
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function runtimeSemanticText(value, max = 160) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= max ? normalized : null;
}

function sourceArtTurntableProjection(row) {
  const metadata = isObjectRecord(row.version_metadata) ? row.version_metadata
    : isObjectRecord(row.metadata) ? row.metadata : {};
  const sourceArt = isObjectRecord(metadata.sourceArt) ? metadata.sourceArt : null;
  const slotSourceArt = isObjectRecord(row.slot_metadata?.sourceArt) ? row.slot_metadata.sourceArt : null;
  const claimed = row.role === 'source-art'
    || (typeof row.slot === 'string' && row.slot.startsWith('source-art/'))
    || sourceArt?.schema === SOURCE_ART_TURNTABLE_SCHEMA
    || slotSourceArt?.schema === SOURCE_ART_TURNTABLE_SCHEMA;
  if (!claimed) return { claimed: false, issue: null, value: null };
  if (row.domain !== 'prop') return { claimed: true, issue: 'structure source art requires the prop media domain', value: null };
  if (row.role !== 'source-art') return { claimed: true, issue: 'structure source art requires the source-art role', value: null };
  if (row.media_type !== 'image/png') return { claimed: true, issue: 'structure source-art views require image/png', value: null };
  if (Number(row.width) !== 512 || Number(row.height) !== 512) {
    return { claimed: true, issue: 'structure source-art views must be native 512x512 rasters', value: null };
  }
  if (!sourceArt || sourceArt.schema !== SOURCE_ART_TURNTABLE_SCHEMA) {
    return { claimed: true, issue: 'structure source-art version metadata is missing or unsupported', value: null };
  }
  if (!slotSourceArt || slotSourceArt.schema !== SOURCE_ART_TURNTABLE_SCHEMA) {
    return { claimed: true, issue: 'structure source-art slot metadata is missing or unsupported', value: null };
  }
  const assetId = mediaName(sourceArt.assetId);
  const structureId = mediaName(sourceArt.structureId);
  const direction = SOURCE_ART_TURNTABLE_DIRECTIONS.includes(sourceArt.direction) ? sourceArt.direction : null;
  const label = runtimeSemanticText(sourceArt.label, 160);
  const sortOrder = Number.isSafeInteger(sourceArt.sortOrder) && sourceArt.sortOrder >= 0 ? sourceArt.sortOrder : null;
  const placementScale = typeof sourceArt.placementScale === 'number'
    && Number.isFinite(sourceArt.placementScale) && sourceArt.placementScale > 0 && sourceArt.placementScale <= 16
    ? sourceArt.placementScale : null;
  const license = runtimeSemanticText(sourceArt.license, 160);
  const structureKind = sourceArt.structureKind === null
    ? null : mediaName(sourceArt.structureKind);
  if (
    !assetId || sourceArt.assetId !== assetId || !structureId || sourceArt.structureId !== structureId
    || !direction || !label || sortOrder === null || placementScale === null || !license
    || typeof sourceArt.existing !== 'boolean' || typeof sourceArt.sourceOnly !== 'boolean'
    || sourceArt.sourceOnly === sourceArt.existing || sourceArt.referenceOnly !== true
    || (sourceArt.structureKind !== null && !structureKind)
    || (!sourceArt.existing && !structureKind)
  ) return { claimed: true, issue: 'structure source-art version metadata is incomplete or inconsistent', value: null };
  if (
    slotSourceArt.assetId !== assetId || slotSourceArt.direction !== direction
    || row.slot !== `source-art/${assetId}/${direction}.png`
  ) return { claimed: true, issue: 'structure source-art slot identity does not match its typed version metadata', value: null };
  const requiredSlots = SOURCE_ART_TURNTABLE_DIRECTIONS
    .map((item) => `source-art/${assetId}/${item}.png`)
    .sort();
  const contract = mediaAcceptanceContract(row);
  if (
    contract.mode !== 'group' || contract.groupId !== `source-art-eight-way:${assetId}`
    || canonicalJson(contract.requiredSlots) !== canonicalJson(requiredSlots)
  ) return { claimed: true, issue: 'structure source art requires its exact atomic eight-view acceptance group', value: null };
  return {
    claimed: true,
    issue: null,
    value: {
      assetId,
      structureId,
      direction,
      label,
      sortOrder,
      existing: sourceArt.existing,
      sourceOnly: sourceArt.sourceOnly,
      structureKind,
      placementScale,
      license,
      requiredSlots,
    },
  };
}

function sourceArtTurntableOwnerProofIssue(sourceArt, proof, surfaceUrl) {
  if (
    proof.schema !== 'live-media-owner-group-proof-v1' || proof.canonicalScale !== 1
    || proof.surfaceKind !== 'Studio Source Art interactive board placement'
    || proof.renderer !== 'BoardLabBoard/SourceArtCandidateOverlay'
  ) return 'structure source-art review requires the interactive board-placement owner proof';
  if (
    !isObjectRecord(proof.decodedNativeRaster)
    || proof.decodedNativeRaster.width !== 512 || proof.decodedNativeRaster.height !== 512
    || proof.decodedNativeRaster.scale !== 1
  ) return 'structure source-art review must prove decoded native 512x512 rasters';
  if (
    !Array.isArray(proof.mountedDirections)
    || canonicalJson(proof.mountedDirections) !== canonicalJson(SOURCE_ART_TURNTABLE_DIRECTIONS)
  ) return 'structure source-art review must mount every canonical direction exactly once';
  if (!isObjectRecord(proof.placement)) return 'structure source-art review placement is missing';
  const placement = proof.placement;
  if (
    !Number.isFinite(placement.pixelX) || !Number.isFinite(placement.pixelY)
    || !Number.isFinite(placement.scale) || placement.scale <= 0 || placement.scale > 16
    || !SOURCE_ART_TURNTABLE_DIRECTIONS.includes(placement.direction)
    || placement.installedSourceScale !== sourceArt.placementScale
  ) return 'structure source-art review placement is invalid';
  try {
    const url = new URL(surfaceUrl);
    if (url.pathname !== '/studio' || url.searchParams.get('sourceArt') !== sourceArt.assetId) {
      return 'structure source-art review URL does not identify this source-art group';
    }
  } catch {
    return 'structure source-art review URL is invalid';
  }
  return null;
}

function runCardFrameProjection(row) {
  const variant = RUN_CARD_FRAME_VARIANT_BY_SLOT[row.slot];
  const claimed = Boolean(variant) || row.role === 'card-frame';
  if (!claimed) return { claimed: false, issue: null };
  if (!variant) return { claimed: true, issue: 'Run card frame role is restricted to the canonical semantic frame slots' };
  if (row.domain !== 'ui') return { claimed: true, issue: 'Run card frame requires the ui media domain' };
  if (row.role !== 'card-frame') return { claimed: true, issue: 'Run card frame requires the card-frame role' };
  if (row.media_type !== 'image/png') return { claimed: true, issue: 'Run card frame requires image/png' };
  if (Number(row.width) !== 1060 || Number(row.height) !== 1484) {
    return { claimed: true, issue: 'Run card frame must preserve the selected native 1060x1484 raster' };
  }
  const metadata = isObjectRecord(row.version_metadata) ? row.version_metadata
    : isObjectRecord(row.metadata) ? row.metadata : {};
  const slotMetadata = isObjectRecord(row.slot_metadata) ? row.slot_metadata : {};
  if (
    metadata.schema !== RUN_CARD_FRAME_SCHEMA || slotMetadata.schema !== RUN_CARD_FRAME_SCHEMA
    || metadata.referenceWidthPx !== 360 || slotMetadata.referenceWidthPx !== 360
    || metadata.aspectRatio !== '5:7' || slotMetadata.aspectRatio !== '5:7'
  ) return { claimed: true, issue: 'Run card frame requires its typed Card Layout projection metadata' };
  if (
    variant !== 'standard'
    && (metadata.variant !== variant || slotMetadata.variant !== variant)
  ) return { claimed: true, issue: `${variant} Run card frame requires its typed variant metadata` };
  if (mediaAcceptanceContract(row).mode !== 'standalone') {
    return { claimed: true, issue: 'Run card frame requires standalone atomic acceptance' };
  }
  return { claimed: true, issue: null };
}

function runStarterCardArtProjection(row, cardId, metadata, slotMetadata, provenance) {
  const definition = RUN_STARTER_CARD_ART_BY_ID[cardId];
  if (!definition) return null;
  if (metadata.schema !== RUN_STARTER_CARD_ART_SCHEMA || slotMetadata.schema !== RUN_STARTER_CARD_ART_SCHEMA) {
    return { claimed: true, issue: 'Starter-card art requires its typed runtime metadata', value: null };
  }
  if (provenance.schema !== RUN_STARTER_CARD_ART_PROVENANCE_SCHEMA) {
    return { claimed: true, issue: 'Starter-card art requires its typed Codex provenance', value: null };
  }
  if (
    metadata.cardId !== cardId || slotMetadata.cardId !== cardId
    || metadata.cardTitle !== definition.title || metadata.cardType !== 'Units'
    || slotMetadata.cardType !== 'Units'
    || metadata.nativeWidth !== 400 || metadata.nativeHeight !== 280
    || metadata.value !== definition.value
    || canonicalJson(metadata.pieces) !== canonicalJson(definition.pieces)
    || metadata.generationModel !== 'codex-imagegen'
  ) return { claimed: true, issue: 'Starter-card art identity or composition is inconsistent', value: null };
  if (
    provenance.generationModel !== 'codex-imagegen'
    || !runtimeSemanticText(provenance.promptSummary, 8_000)
    || !mediaVersionId(provenance.sourceVersionId)
    || !mediaSha(provenance.sourceSha256)
    || !runtimeSemanticText(provenance.transform, 240)
  ) return { claimed: true, issue: 'Starter-card art generated-source provenance is incomplete', value: null };
  if (row.slot !== `ui/run/card-art/${cardId}/illustration.png`) {
    return { claimed: true, issue: 'Starter-card art slot does not match its card identity', value: null };
  }
  if (mediaAcceptanceContract(row).mode !== 'standalone') {
    return { claimed: true, issue: 'Starter-card art requires standalone atomic acceptance', value: null };
  }
  return {
    claimed: true,
    issue: null,
    value: {
      kind: 'starter',
      cardId,
      versionId: String(row.id),
      slot: row.slot,
      sha256: row.blob_sha256,
    },
  };
}

function runCardArtProjection(row) {
  const claimed = row.domain === 'run-card-art'
    || (typeof row.slot === 'string' && row.slot.startsWith('ui/run/card-art/'));
  if (!claimed) return { claimed: false, issue: null, value: null };
  if (row.domain !== 'run-card-art') return { claimed: true, issue: 'Units-card art requires the run-card-art media domain', value: null };
  if (row.role !== 'illustration') return { claimed: true, issue: 'Units-card art requires the illustration role', value: null };
  if (row.media_type !== 'image/png') return { claimed: true, issue: 'Units-card art requires image/png', value: null };
  if (Number(row.width) !== 400 || Number(row.height) !== 280) {
    return { claimed: true, issue: 'Units-card art must be a native 400x280 raster', value: null };
  }
  const metadata = isObjectRecord(row.version_metadata) ? row.version_metadata
    : isObjectRecord(row.metadata) ? row.metadata : {};
  const slotMetadata = isObjectRecord(row.slot_metadata) ? row.slot_metadata : {};
  const provenance = isObjectRecord(row.provenance) ? row.provenance : {};
  const starterId = /^ui\/run\/card-art\/([^/]+)\/illustration\.png$/.exec(String(row.slot || ''))?.[1];
  const starter = starterId
    ? runStarterCardArtProjection(row, starterId, metadata, slotMetadata, provenance)
    : null;
  if (starter) return starter;
  if (metadata.schema !== 'run-card-art-plan-v2') {
    return { claimed: true, issue: 'Units-card art requires typed v2 plan metadata', value: null };
  }
  if (slotMetadata.schema !== 'run-card-art-slot-v2') {
    return { claimed: true, issue: 'Units-card art requires typed v2 slot metadata', value: null };
  }
  if (provenance.schema !== 'run-card-art-prompt-v2') {
    return { claimed: true, issue: 'Units-card art requires exact v2 prompt provenance', value: null };
  }
  const cardId = runtimeSemanticText(metadata.cardId, 32);
  const cardTitle = runtimeSemanticText(metadata.cardTitle, 160);
  const historicalAnchor = runtimeSemanticText(metadata.historicalAnchor, 160);
  const prompt = runtimeSemanticText(provenance.prompt, 8_000);
  const promptSha256 = mediaSha(provenance.promptSha256);
  const pixelLabJobId = mediaVersionId(provenance.pixelLabJobId);
  const unitIdentity = runtimeSemanticText(provenance.unitIdentity, 2_000);
  const sceneDirection = runtimeSemanticText(provenance.sceneDirection, 4_000);
  if (
    !cardId || !RUN_CARD_ART_CARD_IDS.includes(cardId) || !cardTitle || !historicalAnchor
    || !prompt || !promptSha256 || !pixelLabJobId || !unitIdentity || !sceneDirection
  ) return { claimed: true, issue: 'Units-card art provenance is incomplete', value: null };
  if (crypto.createHash('sha256').update(prompt, 'utf8').digest('hex') !== promptSha256) {
    return { claimed: true, issue: 'Units-card art prompt SHA-256 does not match its exact prompt', value: null };
  }
  if (
    provenance.generationModel !== 'pixellab-pixflux'
    || metadata.generationModel !== 'pixellab-pixflux'
    || metadata.cardType !== 'Units' || slotMetadata.cardType !== 'Units'
    || metadata.cardId !== cardId || slotMetadata.cardId !== cardId
    || metadata.nativeWidth !== 400 || metadata.nativeHeight !== 280
  ) return { claimed: true, issue: 'Units-card art identity or generation metadata is inconsistent', value: null };
  if (
    !Array.isArray(metadata.pieces) || metadata.pieces.length < 1
    || metadata.pieces.some((piece) => !RUN_CARD_ART_PIECE_ORDER.includes(piece))
  ) return { claimed: true, issue: 'Units-card art pieces are missing or invalid', value: null };
  const canonicalId = [...metadata.pieces]
    .sort((left, right) => RUN_CARD_ART_PIECE_ORDER.indexOf(left) - RUN_CARD_ART_PIECE_ORDER.indexOf(right))
    .map((piece) => RUN_CARD_ART_PIECE_INITIAL[piece])
    .join('');
  const baseCost = metadata.pieces.reduce((sum, piece) => sum + RUN_CARD_ART_PIECE_VALUE[piece], 0);
  if (canonicalId !== cardId || metadata.baseCost !== baseCost || baseCost < 1 || baseCost > 9) {
    return { claimed: true, issue: 'Units-card art composition does not match its canonical card identity', value: null };
  }
  if (row.slot !== `ui/run/card-art/${cardId}/illustration.png`) {
    return { claimed: true, issue: 'Units-card art slot does not match its canonical card identity', value: null };
  }
  const contract = mediaAcceptanceContract(row);
  if (
    contract.mode !== 'group' || contract.groupId !== RUN_CARD_ART_GROUP_ID
    || canonicalJson(contract.requiredSlots) !== canonicalJson(RUN_CARD_ART_REQUIRED_SLOTS)
  ) return { claimed: true, issue: 'Units-card art requires the complete atomic 49-card acceptance group', value: null };
  return { claimed: true, issue: null, value: { kind: 'core', cardId } };
}

function runCardArtOwnerProofIssue(runCardArt, proof, surfaceUrl) {
  if (runCardArt.kind === 'starter') {
    if (
      proof.schema !== 'live-media-owner-proof-v1' || proof.canonicalScale !== 1
      || proof.surfaceKind !== 'Studio Card Layout starter-card runtime cutover'
      || proof.renderer !== 'RunCardPrototype/RunCardFace'
      || proof.versionId !== runCardArt.versionId || proof.slot !== runCardArt.slot
      || mediaSha(proof.contentSha256) !== runCardArt.sha256
    ) return 'Starter-card art review requires the exact Card Layout owner proof';
    try {
      const url = new URL(surfaceUrl);
      if (
        url.pathname !== '/studio' || url.searchParams.get('vk') !== 'cardlayout'
        || url.searchParams.get('starterCard') !== runCardArt.cardId
      ) return 'Starter-card art review URL must identify its Card Layout starter card';
    } catch {
      return 'Starter-card art review URL is invalid';
    }
    return null;
  }
  if (
    proof.schema !== 'live-media-owner-group-proof-v1' || proof.canonicalScale !== 1
    || proof.surfaceKind !== 'Studio Card Prompts complete Units set'
    || proof.renderer !== 'RunCardPromptCatalog/RunCardArtCandidateGrid'
  ) return 'Units-card art review requires the complete Studio Card Prompts proof';
  if (
    !isObjectRecord(proof.decodedNativeRaster)
    || proof.decodedNativeRaster.width !== 400 || proof.decodedNativeRaster.height !== 280
    || proof.decodedNativeRaster.scale !== 1
    || canonicalJson(proof.mountedCardIds) !== canonicalJson([...RUN_CARD_ART_CARD_IDS].sort())
    || !proof.mountedCardIds.includes(runCardArt.cardId)
  ) return 'Units-card art review must mount all 49 native candidate rasters';
  try {
    const url = new URL(surfaceUrl);
    if (url.pathname !== '/studio' || url.searchParams.get('cat') !== 'cardprompts') {
      return 'Units-card art review URL must identify the Studio Card Prompts catalog';
    }
  } catch {
    return 'Units-card art review URL is invalid';
  }
  return null;
}

function runtimeMetadataProjection(row) {
  const metadata = isObjectRecord(row.version_metadata) ? row.version_metadata
    : isObjectRecord(row.metadata) ? row.metadata : {};
  if (metadata.runtime === undefined) {
    return { value: {} };
  }
  if (!isObjectRecord(metadata.runtime)) return { error: 'metadata.runtime must be an object' };
  const raw = metadata.runtime;
  const allowed = new Set([
    'component', 'variant', 'state', 'family', 'palette', 'direction', 'altText',
    'frameWidth', 'frameHeight', 'frameCount', 'anchorX', 'anchorY', 'durationMs', 'loop',
  ]);
  if (row.domain === 'terrain') {
    for (const key of ['logicalTerrain', 'face', 'projection', 'alphaOwnership', 'groundCover']) allowed.add(key);
  }
  if (row.domain === 'ui-kit') {
    for (const key of ['nativeRole', 'slice']) allowed.add(key);
  }
  // Sectio wraps frame live cards, so their runtime contract is the measured card
  // window on the painted canvas rather than a sprite frame.
  const sectioWrap = runSectioWrapSlotId(row.slot) !== null;
  if (sectioWrap) {
    for (const key of ['kind', 'canvasWidth', 'canvasHeight', 'window', 'slots']) allowed.add(key);
  }
  const unknown = Object.keys(raw).filter((key) => !allowed.has(key));
  if (unknown.length) return { error: `metadata.runtime contains unsupported keys: ${unknown.sort().join(', ')}` };

  const value = {};
  for (const key of ['component', 'variant', 'state', 'family', 'palette', 'direction']) {
    if (raw[key] === undefined) continue;
    const normalized = runtimeSemanticText(raw[key], 160);
    if (!normalized) return { error: `metadata.runtime.${key} must be a non-empty string up to 160 characters` };
    value[key] = normalized;
  }
  if (raw.altText !== undefined) {
    if (typeof raw.altText !== 'string' || raw.altText.length > 500) {
      return { error: 'metadata.runtime.altText must be a string up to 500 characters' };
    }
    value.altText = raw.altText;
  }
  for (const key of ['frameWidth', 'frameHeight', 'frameCount', 'durationMs']) {
    if (raw[key] === undefined) continue;
    const normalized = runtimeInteger(raw[key], { min: 1, max: key === 'durationMs' ? 3_600_000 : 32768 });
    if (normalized === null) return { error: `metadata.runtime.${key} must be a positive bounded integer` };
    value[key] = normalized;
  }
  for (const key of ['anchorX', 'anchorY']) {
    if (raw[key] === undefined) continue;
    const normalized = runtimeInteger(raw[key], { min: -32768, max: 32768 });
    if (normalized === null) return { error: `metadata.runtime.${key} must be a bounded integer` };
    value[key] = normalized;
  }
  if (raw.loop !== undefined) {
    if (typeof raw.loop !== 'boolean') return { error: 'metadata.runtime.loop must be boolean' };
    value.loop = raw.loop;
  }
  if (sectioWrap) {
    if (raw.kind !== undefined) {
      const normalized = runtimeSemanticText(raw.kind, 32);
      if (!normalized) return { error: 'metadata.runtime.kind must be a non-empty string' };
      value.kind = normalized;
    }
    for (const key of ['canvasWidth', 'canvasHeight']) {
      if (raw[key] === undefined) continue;
      const normalized = runtimeInteger(raw[key], { min: 1, max: 32768 });
      if (normalized === null) return { error: `metadata.runtime.${key} must be a positive bounded integer` };
      value[key] = normalized;
    }
    const readRect = (input, label) => {
      if (!isObjectRecord(input)) return { error: `metadata.runtime.${label} must be an object` };
      const rect = {};
      for (const key of ['x', 'y', 'w', 'h']) {
        const normalized = runtimeInteger(input[key], { min: 0, max: 32768 });
        if (normalized === null) return { error: `metadata.runtime.${label}.${key} must be a bounded whole pixel` };
        rect[key] = normalized;
      }
      return { rect };
    };
    if (raw.window !== undefined) {
      const read = readRect(raw.window, 'window');
      if (read.error) return { error: read.error };
      value.window = read.rect;
    }
    if (raw.slots !== undefined) {
      if (!Array.isArray(raw.slots)) return { error: 'metadata.runtime.slots must be an array' };
      if (raw.slots.length > 16) return { error: 'metadata.runtime.slots may not exceed 16 openings' };
      const slots = [];
      for (const [index, entry] of raw.slots.entries()) {
        const read = readRect(entry, `slots[${index}]`);
        if (read.error) return { error: read.error };
        slots.push(read.rect);
      }
      value.slots = slots;
    }
  }
  if (raw.groundCover !== undefined) {
    if (row.domain !== 'terrain') {
      return { error: 'metadata.runtime.groundCover is allowed only on terrain media' };
    }
    if (!isObjectRecord(raw.groundCover)) return { error: 'metadata.runtime.groundCover must be an object' };
    const unsupportedRuntime = Object.keys(raw).filter((key) => key !== 'groundCover');
    if (unsupportedRuntime.length) {
      return { error: `ground-cover metadata.runtime contains unsupported keys: ${unsupportedRuntime.sort().join(', ')}` };
    }
    const unsupportedGroundCover = Object.keys(raw.groundCover)
      .filter((key) => !GROUND_COVER_RUNTIME_KEYS.includes(key));
    if (unsupportedGroundCover.length) {
      return { error: `metadata.runtime.groundCover contains unsupported keys: ${unsupportedGroundCover.sort().join(', ')}` };
    }
    const terrain = mediaName(raw.groundCover.terrain);
    if (!terrain) {
      return { error: 'metadata.runtime.groundCover.terrain must be a semantic terrain name' };
    }
    const id = runtimeInteger(raw.groundCover.id, { min: 0, max: 32768 });
    if (id === null) {
      return { error: 'metadata.runtime.groundCover.id must be a bounded integer' };
    }
    const frameWidth = runtimeInteger(raw.groundCover.frameWidth, { min: 1, max: 32768 });
    const frameHeight = runtimeInteger(raw.groundCover.frameHeight, { min: 1, max: 32768 });
    const frameCount = runtimeInteger(raw.groundCover.frameCount, { min: 1, max: 32768 });
    if (frameWidth === null || frameHeight === null || frameCount === null) {
      return { error: 'metadata.runtime.groundCover frame geometry must use positive bounded integers' };
    }
    const baseX = runtimeInteger(raw.groundCover.baseX, { min: 0, max: 32767 });
    const baseY = runtimeInteger(raw.groundCover.baseY, { min: 0, max: 32767 });
    if (baseX === null || baseX >= frameWidth || baseY === null || baseY >= frameHeight) {
      return { error: 'metadata.runtime.groundCover base anchor must lie inside one frame' };
    }
    const contentWidth = runtimeInteger(raw.groundCover.contentWidth, { min: 1, max: 32768 });
    if (contentWidth === null || contentWidth > frameWidth) {
      return { error: 'metadata.runtime.groundCover.contentWidth must fit inside one frame' };
    }
    value.groundCover = {
      terrain, id, frameWidth, frameHeight, frameCount, baseX, baseY, contentWidth,
    };
  }
  if (row.domain === 'terrain') {
    if (raw.logicalTerrain !== undefined) {
      const normalized = mediaName(raw.logicalTerrain);
      if (!normalized) return { error: 'metadata.runtime.logicalTerrain must be a semantic terrain name' };
      value.logicalTerrain = normalized;
    }
    if (raw.face !== undefined) {
      if (!['top', 'side', 'animation', 'composite'].includes(raw.face)) {
        return { error: 'metadata.runtime.face is invalid' };
      }
      value.face = raw.face;
    }
    if (raw.projection !== undefined) {
      if (raw.projection !== 'iso-96x180-v1') return { error: 'metadata.runtime.projection is unsupported' };
      value.projection = raw.projection;
    }
    if (raw.alphaOwnership !== undefined) {
      if (!['top', 'side', 'animation', 'opaque', 'shared'].includes(raw.alphaOwnership)) {
        return { error: 'metadata.runtime.alphaOwnership is invalid' };
      }
      value.alphaOwnership = raw.alphaOwnership;
    }
  }
  if (row.domain === 'ui-kit') {
    if (raw.nativeRole !== undefined) {
      const normalized = mediaName(raw.nativeRole);
      if (!normalized) return { error: 'metadata.runtime.nativeRole must be a semantic role' };
      value.nativeRole = normalized;
    }
    if (raw.slice !== undefined) {
      if (!isObjectRecord(raw.slice)) return { error: 'metadata.runtime.slice must be an object' };
      const slice = {};
      for (const edge of ['top', 'right', 'bottom', 'left']) {
        const normalized = runtimeInteger(raw.slice[edge], { min: 0, max: 4096 });
        if (normalized === null) return { error: `metadata.runtime.slice.${edge} must be a bounded integer` };
        slice[edge] = normalized;
      }
      if (Object.keys(raw.slice).some((key) => !['top', 'right', 'bottom', 'left'].includes(key))) {
        return { error: 'metadata.runtime.slice contains unsupported keys' };
      }
      value.slice = slice;
    }
  }
  return { value };
}

function publicRuntimeVersionMetadata(row) {
  const projected = runtimeMetadataProjection(row);
  if (projected.error) {
    throw mediaMutationError('media_runtime_projection_invalid', 503, { slot: row.slot, reason: projected.error });
  }
  return Object.keys(projected.value).length ? { runtime: projected.value } : {};
}

function mediaDomainProjectionIssue(row) {
  const runtime = runtimeMetadataProjection(row);
  if (runtime.error) return runtime.error;
  if (predrawnBoardSlotSlug(row.slot)) {
    if (mediaAcceptanceContract(row).mode !== 'standalone') {
      return 'pre-drawn board plates require standalone atomic acceptance';
    }
    return predrawnBoardMediaIssue(row, runtime.value);
  }
  if (runLipsanonIconSlotId(row.slot)) {
    return runLipsanonIconMediaIssue(row, runtime.value);
  }
  if (runCardCostCoinSlot(row.slot)) {
    return runCardCostCoinMediaIssue(row, runtime.value);
  }
  if (runCardBackSlot(row.slot) || row.role === 'card-back') {
    return runCardBackMediaIssue(row, runtime.value);
  }
  if (runResourceIconSlotId(row.slot)) {
    return runResourceIconMediaIssue(row, runtime.value);
  }
  if (runSectioWrapSlotId(row.slot)) {
    return runSectioWrapMediaIssue(row, runtime.value);
  }
  if (gameConditionIconSlot(row.slot)) {
    return gameConditionIconMediaIssue(row, runtime.value);
  }
  if (cardTypeRowTextureSlot(row.slot)) {
    return cardTypeRowTextureMediaIssue(row, runtime.value);
  }
  if (levelEditorBrushIconSlot(row.slot)) {
    return levelEditorBrushIconMediaIssue(row, runtime.value);
  }
  if (sfxSampleSlot(row.slot)) {
    return sfxSampleMediaIssue(row, runtime.value);
  }
  if (strategikonBackgroundSlot(row.slot)) {
    return strategikonBackgroundMediaIssue(row, runtime.value);
  }
  // Walls sit in the terrain domain but own the ADR-0086 full-height frame, not the 96x180
  // tile projection, so they resolve before the board-tile rules below.
  if (wallMaterialSlot(row.slot)) {
    return wallMaterialMediaIssue(row, runtime.value);
  }
  if (workspaceBackgroundSlotId(row.slot)) {
    return workspaceBackgroundMediaIssue(row, runtime.value);
  }
  if (runLipsanonMatSlot(row.slot)) {
    return runLipsanonMatMediaIssue(row, runtime.value);
  }
  if (ataraxiaNumeralSlot(row.slot)) {
    return ataraxiaNumeralMediaIssue(row, runtime.value);
  }
  const runCardFrame = runCardFrameProjection(row);
  if (runCardFrame.claimed) return runCardFrame.issue;
  const runCardArt = runCardArtProjection(row);
  if (runCardArt.claimed) return runCardArt.issue;
  const sourceArt = sourceArtTurntableProjection(row);
  if (sourceArt.claimed) return sourceArt.issue;
  const knownDomain = VISUAL_MEDIA_DOMAINS.has(row.domain) || row.domain === 'font' || row.domain === 'sfx';
  if (!knownDomain) return `runtime acceptance requires a registered domain projection, not ${row.domain}`;
  if (row.domain !== 'terrain') {
    return `${row.domain} candidates remain bridge-only until their typed completeness validator and game-owned review instrument exist`;
  }
  if (row.domain === 'font' && !PUBLIC_FONT_MEDIA_TYPES.has(row.media_type)) return 'font slots require an allowed font media type';
  if (row.domain === 'sfx' && !PUBLIC_AUDIO_MEDIA_TYPES.has(row.media_type)) return 'sfx slots require an allowed audio media type';
  if (VISUAL_MEDIA_DOMAINS.has(row.domain) && !PUBLIC_IMAGE_MEDIA_TYPES.has(row.media_type)) {
    return `${row.domain} slots require an allowed raster image media type`;
  }
  if (PUBLIC_IMAGE_MEDIA_TYPES.has(row.media_type) && (
    row.width === null || row.height === null || !Number.isInteger(Number(row.width)) || !Number.isInteger(Number(row.height))
  )) {
    return 'raster runtime media requires decoded header dimensions';
  }
  if (row.domain === 'ui-kit' && runtime.value.slice) {
    if (
      runtime.value.slice.left + runtime.value.slice.right > Number(row.width)
      || runtime.value.slice.top + runtime.value.slice.bottom > Number(row.height)
    ) return 'ui-kit runtime slices exceed uploaded image geometry';
  }
  if (row.domain !== 'terrain') return null;

  if (runtime.value.groundCover) {
    if (row.role !== 'media') return 'ground-cover slots require the terrain media role';
    if (row.media_type !== 'image/png') return 'ground-cover sheets require image/png';
    const projection = runtime.value.groundCover;
    if (!projection) return 'ground-cover slots require the typed runtime projection';
    if (
      Number(row.width) !== projection.frameWidth * projection.frameCount
      || Number(row.height) !== projection.frameHeight
    ) return 'ground-cover runtime metadata does not match uploaded sheet geometry';
    return 'ground-cover candidates remain bridge-only until their game-owned exact-byte review instrument exists';
  }

  const terrainRole = ['top', 'side', 'animation'].includes(row.role) ? row.role : null;
  if (!terrainRole) return `terrain role ${row.role} has no typed runtime projection`;
  if (row.media_type !== 'image/png') return 'projected terrain surfaces require image/png';
  if (terrainRole === 'top' || terrainRole === 'side') {
    if (Number(row.width) !== 96 || Number(row.height) !== 180) return 'terrain top/side frames must be native 96x180';
  }
  if (terrainRole === 'animation') {
    if (Number(row.height) !== 180 || Number(row.width) < 96 || Number(row.width) % 96 !== 0) {
      return 'terrain animation sheets must contain horizontal 96x180 frames';
    }
  }
  if (runtime.value.face !== undefined && runtime.value.face !== terrainRole) return 'terrain runtime face must match the slot role';
  if (runtime.value.projection !== undefined && runtime.value.projection !== 'iso-96x180-v1') {
    return 'terrain runtime projection does not match the canonical board projection';
  }
  const expectedFrameCount = terrainRole === 'animation' ? Number(row.width) / 96 : 1;
  if (runtime.value.frameWidth !== undefined && runtime.value.frameWidth !== 96) {
    return 'terrain runtime frameWidth does not match uploaded geometry';
  }
  if (runtime.value.frameHeight !== undefined && runtime.value.frameHeight !== Number(row.height)) {
    return 'terrain runtime frameHeight does not match uploaded geometry';
  }
  if (runtime.value.frameCount !== undefined && expectedFrameCount !== null && runtime.value.frameCount !== expectedFrameCount) {
    return 'terrain runtime frameCount does not match uploaded geometry';
  }
  return null;
}

async function seedLiveMediaCatalogFromLiveSource() {
  if (!liveMediaStorageDir || liveMediaContainerUrl) {
    throw new Error('LIVE_MEDIA_SEED_CATALOG_URL is allowed only with isolated LIVE_MEDIA_STORAGE_DIR storage');
  }
  const countResult = await pool.query(
    'SELECT (SELECT count(*) FROM media_slots) AS slots, (SELECT count(*) FROM media_versions) AS versions',
  );
  if (Number(countResult.rows[0]?.slots) || Number(countResult.rows[0]?.versions)) return;
  const response = await fetch(liveMediaSeedCatalogUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`live media seed catalog returned ${response.status}`);
  const catalogBytes = await readFetchBodyAtMost(response, LIVE_MEDIA_SEED_CATALOG_MAX_BYTES, 'live media seed catalog');
  let catalog;
  try { catalog = JSON.parse(catalogBytes.toString('utf8')); } catch { throw new Error('live media seed catalog is not valid JSON'); }
  if (Number(catalog.schemaVersion) !== MEDIA_CATALOG_SCHEMA_VERSION || !Array.isArray(catalog.slots)) {
    throw new Error('live media seed catalog schema is invalid');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of catalog.slots) {
      const slot = mediaSlotId(item.slot);
      const id = mediaVersionId(item.activeVersionId);
      const status = item.versionStatus === 'accepted' ? 'accepted'
        : item.versionStatus === 'legacy-bridge' ? 'legacy-bridge' : null;
      const sha256 = mediaSha(item.media?.sha256);
      const type = mediaType(item.media?.mediaType);
      if (!slot || !id || !status || !sha256 || !type) throw new Error('live media seed catalog contains an invalid active slot');
      const byteLength = Number(item.media.byteLength);
      const width = item.media.width === null ? null : Number(item.media.width);
      const height = item.media.height === null ? null : Number(item.media.height);
      await client.query(
        `INSERT INTO media_slots (slot, domain, role, availability_policy, metadata, row_revision, updated_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'live-catalog-seed')`,
        [slot, mediaName(item.domain), mediaName(item.role), item.availabilityPolicy === 'decorative' ? 'decorative' : 'critical',
          JSON.stringify(isObjectRecord(item.metadata) ? item.metadata : {}), Number(item.rowRevision) || 0],
      );
      await client.query(
        `INSERT INTO media_blobs (sha256, blob_key, media_type, byte_length, width, height, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, now()) ON CONFLICT (sha256) DO NOTHING`,
        [sha256, liveMediaBlobKey(sha256), type, byteLength, width, height],
      );
      await client.query(
        `INSERT INTO media_versions (
           id, slot, domain, role, label, status, blob_sha256, metadata, provenance,
           native_evidence, review_evidence, row_revision, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, '{}'::jsonb, 0, 'live-catalog-seed')`,
        [id, slot, mediaName(item.domain), mediaName(item.role), `Seeded ${slot}`, status, sha256,
          JSON.stringify(isObjectRecord(item.versionMetadata) ? item.versionMetadata : {}),
          JSON.stringify({ seed: { kind: 'live-catalog', catalogUrl: liveMediaSeedCatalogUrl } }),
          JSON.stringify({})],
      );
      await client.query(
        `UPDATE media_slots SET active_version_id = $2, lifecycle_state = 'active',
           activated_at = now() WHERE slot = $1`,
        [slot, id],
      );
    }
    await client.query(
      'UPDATE media_catalog_state SET revision = $1, updated_at = now() WHERE singleton = true',
      [Number(catalog.revision) || 0],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  invalidateMediaCatalogCache();
  console.log(`seeded ${catalog.slots.length} live media slots into ephemeral catalog; objects remain lazy`);
}

function validateMediaVersionInput(raw) {
  if (!isObjectRecord(raw)) return { error: 'media version metadata must be an object' };
  const hasSlot = raw.slot !== null && raw.slot !== undefined;
  const slot = hasSlot ? mediaSlotId(raw.slot) : null;
  const sourcePath = raw.sourcePath === undefined && raw.source_path === undefined
    ? null : mediaSourcePath(raw.sourcePath ?? raw.source_path);
  if (hasSlot && !slot) return { error: 'slot is not a valid semantic asset path' };
  if (!slot && !sourcePath) return { error: 'slot or sourcePath is required' };
  const domain = mediaName(raw.domain);
  const role = mediaName(raw.role);
  if (!domain || !role) return { error: 'domain and role must be lowercase semantic names' };
  const label = boundedMediaText(raw.label, '', 160);
  if (!label) return { error: 'label must be 1-160 characters' };
  const availabilityPolicy = String(raw.availabilityPolicy ?? raw.availability_policy ?? 'critical').trim();
  if (availabilityPolicy !== 'critical' && availabilityPolicy !== 'decorative') {
    return { error: 'availabilityPolicy must be critical or decorative' };
  }
  const slotMetadataProvided = raw.slotMetadata !== undefined || raw.slot_metadata !== undefined;
  const slotMetadataResult = normalizeMediaSlotMetadata(raw.slotMetadata ?? raw.slot_metadata ?? {});
  const slotMetadata = slotMetadataResult.value;
  const metadata = mediaJsonObject(raw.metadata, {});
  const provenance = mediaJsonObject(raw.provenance, {});
  const nativeEvidence = mediaJsonObject(raw.nativeEvidence ?? raw.native_evidence, {});
  if (slotMetadataResult.error) return { error: slotMetadataResult.error };
  if (slot && slotMetadata.acceptance?.mode === 'group' && !slotMetadata.acceptance.requiredSlots.includes(slot)) {
    return { error: 'group requiredSlots must include this slot' };
  }
  if (!metadata || !provenance || !nativeEvidence) return { error: 'metadata and evidence fields must be objects' };
  return {
    value: {
      slot, sourcePath, domain, role, label, availabilityPolicy,
      slotMetadata, slotMetadataProvided, metadata, provenance, nativeEvidence,
    },
  };
}

function mediaVersionPatch(raw, current) {
  if (!isObjectRecord(raw)) return { error: 'media version patch must be an object' };
  const patch = {};
  if (raw.label !== undefined) {
    patch.label = boundedMediaText(raw.label, current.label, 160);
    if (!patch.label) return { error: 'label must be 1-160 characters' };
  }
  for (const [input, output] of [
    ['metadata', 'metadata'], ['provenance', 'provenance'],
    ['nativeEvidence', 'native_evidence'], ['native_evidence', 'native_evidence'],
  ]) {
    if (raw[input] === undefined) continue;
    const value = mediaJsonObject(raw[input]);
    if (!value) return { error: `${input} must be an object` };
    patch[output] = value;
  }
  if (!Object.keys(patch).length) return { error: 'no editable media version fields supplied' };
  return { value: patch };
}

app.get('/api/app-bootstrap-scene', async (req, res) => {
  const path = String(req.query.path || '/').replace(/\/+$/, '') || '/';
  if (!['/', '/main-menu', '/menu-next'].includes(path)) {
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).json({ schemaVersion: 1, scene: null });
    return;
  }
  try {
    const projection = await dbReadHomepageBootstrapScene();
    const etag = `"app-bootstrap-${projection.revision}-${projection.scene.background.sha256}"`;
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) { res.status(304).end(); return; }
    res.status(200).json({ schemaVersion: 1, ...projection });
  } catch (error) {
    if (error && error.mediaCode) { sendMediaMutationError(res, error, 'app_bootstrap_unavailable'); return; }
    dbUnavailable(res, 'app bootstrap scene read failed', error, 'app_bootstrap_unavailable');
  }
});

app.get('/api/drawable-catalog', async (req, res) => {
  try {
    const catalog = await dbReadDrawableCatalog();
    const etag = `"drawable-catalog-${catalog.revision}"`;
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) { res.status(304).end(); return; }
    res.status(200).json(catalog);
  } catch (error) {
    if (error && error.mediaCode) { sendMediaMutationError(res, error, 'drawable_catalog_unavailable'); return; }
    dbUnavailable(res, 'drawable catalog read failed', error, 'drawable_catalog_unavailable');
  }
});

app.get('/api/admin/drawable-assets', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(await dbReadDrawableCatalog({ includeRetired: true }));
  } catch (error) {
    if (error && error.mediaCode) { sendMediaMutationError(res, error, 'drawable_catalog_unavailable'); return; }
    dbUnavailable(res, 'drawable admin catalog read failed', error, 'drawable_catalog_unavailable');
  }
});

app.put('/api/admin/drawable-assets', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const records = Array.isArray(req.body?.assets) ? req.body.assets : null;
  if (!records || records.length < 1 || records.length > 200) {
    res.status(400).json({ error: 'invalid_drawable_asset_batch', details: 'assets must contain 1-200 records' });
    return;
  }
  const ids = new Set();
  const changes = [];
  for (const raw of records) {
    const normalized = normalizeDrawableInput(raw);
    if (normalized.error) { res.status(400).json({ error: 'invalid_drawable_asset', details: normalized.error }); return; }
    if (ids.has(normalized.value.id)) { res.status(400).json({ error: 'invalid_drawable_asset_batch', details: `duplicate id ${normalized.value.id}` }); return; }
    ids.add(normalized.value.id);
    const expectedRevision = Number(raw?.expectedRevision);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      res.status(400).json({ error: 'invalid_drawable_asset_batch', details: `${normalized.value.id} expectedRevision is required` });
      return;
    }
    changes.push({ input: normalized.value, expectedRevision });
  }
  try {
    const catalogRevision = await dbUpsertDrawableBatch(changes, user.email);
    res.status(200).json({ catalogRevision });
  } catch (error) {
    if (error && error.mediaCode) { sendMediaMutationError(res, error, 'drawable_asset_write_failed'); return; }
    dbUnavailable(res, 'drawable asset batch write failed', error, 'drawable_catalog_unavailable');
  }
});

app.put('/api/admin/drawable-assets/:id', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const raw = isObjectRecord(req.body) ? { ...req.body, id: req.params.id } : { id: req.params.id };
  const normalized = normalizeDrawableInput(raw);
  if (normalized.error) { res.status(400).json({ error: 'invalid_drawable_asset', details: normalized.error }); return; }
  try {
    const expectedRevision = requireMediaExpectedRevision(req);
    const catalogRevision = await dbUpsertDrawable(normalized.value, expectedRevision, user.email);
    const catalog = await dbReadDrawableCatalog({ includeRetired: true });
    res.status(200).json({ asset: catalog.assets.find((asset) => asset.id === normalized.value.id), catalogRevision });
  } catch (error) {
    if (error && error.mediaCode) { sendMediaMutationError(res, error, 'drawable_asset_write_failed'); return; }
    dbUnavailable(res, 'drawable asset write failed', error, 'drawable_catalog_unavailable');
  }
});

app.get('/api/asset-catalog', async (req, res) => {
  try {
    const catalog = await publicMediaCatalog();
    const etag = `"asset-catalog-${catalog.revision}"`;
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) { res.status(304).end(); return; }
    res.status(200).json(catalog);
  } catch (error) {
    if (error && error.mediaCode) { sendMediaMutationError(res, error, 'media_catalog_unavailable'); return; }
    dbUnavailable(res, 'media catalog read failed', error, 'media_catalog_unavailable');
  }
});

app.get('/api/admin/media-assets', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  try {
    const rawLimit = String(req.query.eventLimit ?? req.query.event_limit ?? '').trim();
    const eventLimit = rawLimit ? Number(rawLimit) : 200;
    const rawBefore = String(req.query.eventBeforeId ?? req.query.event_before_id ?? '').trim();
    const eventBeforeId = rawBefore ? Number(rawBefore) : null;
    if (!Number.isInteger(eventLimit) || eventLimit < 1 || eventLimit > 1000) {
      res.status(400).json({ error: 'invalid_media_event_limit' });
      return;
    }
    if (eventBeforeId !== null && (!Number.isSafeInteger(eventBeforeId) || eventBeforeId < 1)) {
      res.status(400).json({ error: 'invalid_media_event_cursor' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(await dbReadMediaCatalog({
      includeVersions: true,
      includeEvents: true,
      eventBeforeId,
      eventLimit,
    }));
  } catch (error) {
    dbUnavailable(res, 'media admin catalog read failed', error, 'media_catalog_unavailable');
  }
});

app.patch(/^\/api\/admin\/media-slots\/(.+)$/, async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  let slot = null;
  try { slot = mediaSlotId(String(req.params[0]).split('/').map(decodeURIComponent).join('/')); } catch { slot = null; }
  if (!slot) { res.status(400).json({ error: 'invalid_media_slot' }); return; }
  try {
    const expected = requireMediaExpectedRevision(req);
    const raw = isObjectRecord(req.body) ? req.body : {};
    const hasMetadata = raw.metadata !== undefined || raw.slotMetadata !== undefined || raw.slot_metadata !== undefined;
    const hasPolicy = raw.availabilityPolicy !== undefined || raw.availability_policy !== undefined;
    if (!hasMetadata && !hasPolicy) throw mediaMutationError('invalid_media_slot_patch', 400);
    const metadataResult = hasMetadata
      ? normalizeMediaSlotMetadata(raw.metadata ?? raw.slotMetadata ?? raw.slot_metadata)
      : { value: null };
    if (metadataResult.error) throw mediaMutationError('invalid_media_slot_patch', 400, metadataResult.error);
    if (
      metadataResult.value?.acceptance?.mode === 'group'
      && !metadataResult.value.acceptance.requiredSlots.includes(slot)
    ) throw mediaMutationError('invalid_media_slot_patch', 400, 'group requiredSlots must include this slot');
    const policy = hasPolicy ? String(raw.availabilityPolicy ?? raw.availability_policy).trim() : null;
    if (hasPolicy && policy !== 'critical' && policy !== 'decorative') {
      throw mediaMutationError('invalid_media_slot_patch', 400, 'availabilityPolicy must be critical or decorative');
    }
    const catalogRevision = await withMediaCatalogTransaction(async (client) => {
      const result = await client.query('SELECT * FROM media_slots WHERE slot = $1 FOR UPDATE', [slot]);
      const current = result.rows[0];
      if (!current) throw mediaMutationError('media_slot_not_found', 404);
      if (current.lifecycle_state === 'retired') throw mediaMutationError('media_slot_retired', 409);
      if (Number(current.row_revision) !== expected) {
        throw mediaMutationError('media_slot_conflict', 409, { currentRevision: Number(current.row_revision) });
      }
      if ((hasMetadata || hasPolicy) && (current.lifecycle_state !== 'staging' || current.active_version_id)) {
        throw mediaMutationError('active_media_slot_contract_immutable', 409, { slot });
      }
      const before = {
        metadata: current.metadata || {},
        availabilityPolicy: current.availability_policy,
        rowRevision: Number(current.row_revision),
      };
      await client.query(
        `UPDATE media_slots SET metadata = COALESCE($2::jsonb, metadata),
           availability_policy = COALESCE($3, availability_policy), row_revision = row_revision + 1,
           updated_at = now(), updated_by = $4 WHERE slot = $1`,
        [slot, metadataResult.value === null ? null : JSON.stringify(metadataResult.value), policy, user.email],
      );
      await logMediaEvent(client, { slot, source_path: null, id: null }, 'slot-contract-updated', user.email, {
        before,
        after: {
          metadata: metadataResult.value ?? before.metadata,
          availabilityPolicy: policy ?? before.availabilityPolicy,
          rowRevision: before.rowRevision + 1,
        },
      });
      return current.active_version_id ? bumpMediaCatalog(client) : currentMediaCatalogRevision(client);
    }, { invalidatePublic: true });
    res.status(200).json({ slot: publicMediaSlot(await resolvedMediaSlot(slot)), catalogRevision });
  } catch (error) {
    sendMediaMutationError(res, error, 'media_slot_update_failed');
  }
});

function validateMediaRetirementProof(raw) {
  const reason = boundedMediaText(raw.reason, '', 4000);
  const evidence = mediaJsonObject(raw.evidence, {});
  if (!reason || !evidence || !Object.keys(evidence).length) {
    throw mediaMutationError('media_retirement_evidence_required', 400);
  }
  return { reason, evidence, confirmCriticalRetirement: raw.confirmCriticalRetirement === true };
}

async function retireMediaSlotBatch(items, proof, actorEmail) {
  const normalized = items.map((item) => ({
    slot: mediaSlotId(item && item.slot),
    expectedRevision: Number.isInteger(item && item.expectedRevision) && item.expectedRevision >= 0
      ? item.expectedRevision : null,
  }));
  if (
    !normalized.length || normalized.length > 256
    || normalized.some((item) => !item.slot || item.expectedRevision === null)
    || new Set(normalized.map((item) => item.slot)).size !== normalized.length
  ) throw mediaMutationError('invalid_media_retire_batch', 400);
  const batchId = crypto.randomUUID();
  const result = await withMediaCatalogTransaction(async (client) => {
    const requested = new Map(normalized.map((item) => [item.slot, item]));
    const slots = [...requested.keys()].sort();
    const slotResult = await client.query(
      'SELECT * FROM media_slots WHERE slot = ANY($1::text[]) ORDER BY slot FOR UPDATE',
      [slots],
    );
    if (slotResult.rows.length !== slots.length) throw mediaMutationError('media_slot_not_found', 404);
    const rows = slotResult.rows;
    for (const row of rows) {
      if (Number(row.row_revision) !== requested.get(row.slot).expectedRevision) {
        throw mediaMutationError('media_slot_conflict', 409, { slot: row.slot, currentRevision: Number(row.row_revision) });
      }
      if (row.lifecycle_state === 'retired') throw mediaMutationError('media_slot_retired', 409, { slot: row.slot });
      if (row.availability_policy === 'critical' && !proof.confirmCriticalRetirement) {
        throw mediaMutationError('critical_media_retirement_confirmation_required', 409, { slot: row.slot });
      }
    }
    const bySlot = new Map(rows.map((row) => [row.slot, row]));
    const grouped = new Map();
    for (const row of rows) {
      const contract = mediaAcceptanceContract({ slot: row.slot, slot_metadata: row.metadata });
      if (contract.mode !== 'group') continue;
      if (!grouped.has(contract.groupId)) grouped.set(contract.groupId, contract.requiredSlots);
      if (JSON.stringify(grouped.get(contract.groupId)) !== JSON.stringify(contract.requiredSlots)) {
        throw mediaMutationError('media_group_contract_mismatch', 409, { groupId: contract.groupId });
      }
    }
    for (const [groupId, requiredSlots] of grouped) {
      const missingSlots = requiredSlots.filter((slot) => !bySlot.has(slot));
      if (missingSlots.length) throw mediaMutationError('media_group_retirement_incomplete', 409, { groupId, missingSlots });
      for (const slot of requiredSlots) {
        const member = mediaAcceptanceContract({ slot, slot_metadata: bySlot.get(slot).metadata });
        if (member.mode !== 'group' || member.groupId !== groupId) {
          throw mediaMutationError('media_group_contract_mismatch', 409, { groupId, slot });
        }
      }
    }
    const drawableDependencies = await client.query(
      `SELECT media.slot, media.asset_id, media.role
         FROM drawable_asset_media media
         JOIN drawable_assets asset ON asset.id = media.asset_id
        WHERE media.slot = ANY($1::text[])
          AND asset.lifecycle_state = 'active'
        ORDER BY media.slot, media.asset_id, media.role`,
      [slots],
    );
    if (drawableDependencies.rows.length) {
      throw mediaMutationError('media_slot_in_use', 409, {
        dependencies: drawableDependencies.rows.map((row) => ({
          slot: row.slot,
          assetId: row.asset_id,
          role: row.role,
        })),
      });
    }
    let changedPublicCatalog = false;
    for (const row of rows) {
      const previousId = row.active_version_id ? String(row.active_version_id) : null;
      if (previousId) {
        await client.query(
          `UPDATE media_versions SET status = 'archived', row_revision = row_revision + 1,
             updated_at = now(), updated_by = $2 WHERE id = $1`,
          [previousId, actorEmail],
        );
      }
      const retirementEvidence = {
        reason: proof.reason,
        evidence: proof.evidence,
        confirmedCriticalRetirement: row.availability_policy === 'critical',
        retiredBy: actorEmail,
        retiredAt: new Date().toISOString(),
        previousVersionId: previousId,
        batchId,
      };
      await client.query(
        `UPDATE media_slots SET active_version_id = NULL, lifecycle_state = 'retired',
           retired_at = now(), retirement_evidence = $2::jsonb,
           row_revision = row_revision + 1, updated_at = now(), updated_by = $3
         WHERE slot = $1`,
        [row.slot, JSON.stringify(retirementEvidence), actorEmail],
      );
      await logMediaEvent(client, {
        slot: row.slot, source_path: null, id: previousId,
      }, rows.length === 1 ? 'slot-retired' : 'slot-retired-batch', actorEmail, retirementEvidence);
      changedPublicCatalog ||= row.lifecycle_state === 'active';
    }
    const catalogRevision = changedPublicCatalog
      ? await bumpMediaCatalog(client) : await currentMediaCatalogRevision(client);
    return { catalogRevision, slots };
  }, { invalidatePublic: true });
  const retired = await Promise.all(result.slots.map(async (slot) => resolvedMediaSlot(slot)));
  return {
    batchId,
    catalogRevision: result.catalogRevision,
    slots: retired.map((row) => ({ ...publicMediaSlot(row), retirementEvidence: row.retirement_evidence || {} })),
  };
}

app.post('/api/admin/media-slots/retire-batch', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  try {
    const raw = isObjectRecord(req.body) ? req.body : {};
    if (!Array.isArray(raw.items)) throw mediaMutationError('invalid_media_retire_batch', 400);
    res.status(200).json(await retireMediaSlotBatch(raw.items, validateMediaRetirementProof(raw), user.email));
  } catch (error) {
    sendMediaMutationError(res, error, 'media_slot_retirement_failed');
  }
});

/**
 * Patch one slot's own metadata (ADR-0374). Creating a version already refuses to rewrite a
 * slot's contract silently — it throws `media_slot_metadata_requires_patch` — but nothing
 * implemented the patch it names, so a slot's acceptance contract could never be corrected
 * once written. A group contract that must gain or drop a member needs exactly this: the
 * members that are NOT moving still have to learn the group's new required set.
 *
 * This changes the contract a slot declares, never its accepted bytes or its active version.
 */
app.post(/^\/api\/admin\/media-slots\/(.+)\/metadata$/, async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  let slot = null;
  try { slot = mediaSlotId(String(req.params[0]).split('/').map(decodeURIComponent).join('/')); } catch { slot = null; }
  if (!slot) { res.status(400).json({ error: 'invalid_media_slot' }); return; }
  try {
    const expected = requireMediaExpectedRevision(req);
    const raw = isObjectRecord(req.body) ? req.body : {};
    const metadata = mediaJsonObject(raw.metadata, null);
    if (!metadata) throw mediaMutationError('invalid_media_slot_metadata', 400);
    const result = await withMediaCatalogTransaction(async (client) => {
      const current = await client.query('SELECT * FROM media_slots WHERE slot = $1 FOR UPDATE', [slot]);
      const row = current.rows[0];
      if (!row) throw mediaMutationError('media_slot_not_found', 404, { slot });
      if (Number(row.row_revision) !== expected) {
        throw mediaMutationError('media_slot_conflict', 409, { slot, currentRevision: Number(row.row_revision) });
      }
      if (row.lifecycle_state === 'retired') throw mediaMutationError('media_slot_retired', 409, { slot });
      await client.query(
        `UPDATE media_slots SET metadata = $2::jsonb, row_revision = row_revision + 1,
           updated_at = now(), updated_by = $3 WHERE slot = $1`,
        [slot, JSON.stringify(metadata), user.email],
      );
      return { catalogRevision: await bumpMediaCatalog(client) };
    });
    res.status(200).json({ slot, catalogRevision: result.catalogRevision });
  } catch (error) {
    sendMediaMutationError(res, error, 'media_slot_metadata_update_failed');
  }
});

app.post(/^\/api\/admin\/media-slots\/(.+)\/retire$/, async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  let slot = null;
  try { slot = mediaSlotId(String(req.params[0]).split('/').map(decodeURIComponent).join('/')); } catch { slot = null; }
  if (!slot) { res.status(400).json({ error: 'invalid_media_slot' }); return; }
  try {
    const expected = requireMediaExpectedRevision(req);
    const result = await retireMediaSlotBatch(
      [{ slot, expectedRevision: expected }],
      validateMediaRetirementProof(isObjectRecord(req.body) ? req.body : {}),
      user.email,
    );
    res.status(200).json({ slot: result.slots[0], catalogRevision: result.catalogRevision, batchId: result.batchId });
  } catch (error) {
    sendMediaMutationError(res, error, 'media_slot_retirement_failed');
  }
});

app.post('/api/admin/media-versions', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const idempotencyKey = mediaIdempotencyKey(req);
  const allocation = req.body?.allocateSlot;
  if (allocation !== undefined && allocation !== 'predrawn-board') {
    res.status(400).json({ error: 'invalid_media_version', details: 'allocateSlot is invalid' }); return;
  }
  if (allocation && !idempotencyKey) {
    res.status(400).json({ error: 'invalid_media_version', details: 'allocated slots require an idempotency key' }); return;
  }
  const createInput = allocation ? { ...req.body, slot: `boards/${crypto.randomUUID()}/plate.png` } : req.body;
  const validated = validateMediaVersionInput(createInput);
  if (validated.error) { res.status(400).json({ error: 'invalid_media_version', details: validated.error }); return; }
  const value = validated.value;
  try {
    const idempotencyActor = String(user.email).trim().toLowerCase();
    const fingerprintValue = allocation ? { ...value, slot: null, allocateSlot: allocation } : value;
    const requestFingerprint = crypto.createHash('sha256').update(canonicalJson(fingerprintValue)).digest('hex');
    const requestedId = crypto.randomUUID();
    const result = await withMediaCatalogTransaction(async (client) => {
      if (idempotencyKey) {
        const replay = await client.query(
          `SELECT id, request_fingerprint FROM media_versions
            WHERE idempotency_actor = $1 AND idempotency_key = $2`,
          [idempotencyActor, idempotencyKey],
        );
        if (replay.rows[0]) {
          if (replay.rows[0].request_fingerprint !== requestFingerprint) {
            throw mediaMutationError('media_idempotency_conflict', 409);
          }
          return {
            id: String(replay.rows[0].id),
            created: false,
            catalogRevision: await currentMediaCatalogRevision(client),
          };
        }
      }
      if (value.slot) {
        await client.query(
          `INSERT INTO media_slots (slot, domain, role, availability_policy, metadata, updated_by)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6)
           ON CONFLICT (slot) DO NOTHING`,
          [value.slot, value.domain, value.role, value.availabilityPolicy, JSON.stringify(value.slotMetadata), user.email],
        );
        const currentSlot = await client.query('SELECT * FROM media_slots WHERE slot = $1 FOR UPDATE', [value.slot]);
        const current = currentSlot.rows[0];
        if (!current) throw new Error('media slot insert did not produce a row');
        if (current.lifecycle_state === 'retired') {
          throw mediaMutationError('media_slot_retired', 409, { slot: value.slot });
        } else if (
          current.domain !== value.domain || current.role !== value.role
          || current.availability_policy !== value.availabilityPolicy
        ) {
          throw mediaMutationError('media_slot_contract_conflict', 409, {
            slot: value.slot,
            current: { domain: current.domain, role: current.role, availabilityPolicy: current.availability_policy },
          });
        } else if (value.slotMetadataProvided && canonicalJson(current.metadata || {}) !== canonicalJson(value.slotMetadata)) {
          throw mediaMutationError('media_slot_metadata_requires_patch', 409, { slot: value.slot });
        }
      }
      const inserted = await client.query(
        `INSERT INTO media_versions (
           id, slot, source_path, domain, role, label, metadata, provenance, native_evidence,
           idempotency_actor, idempotency_key, request_fingerprint, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12, $13)
         ON CONFLICT (idempotency_actor, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
         RETURNING id`,
        [requestedId, value.slot, value.sourcePath, value.domain, value.role, value.label,
          JSON.stringify(value.metadata), JSON.stringify(value.provenance), JSON.stringify(value.nativeEvidence),
          idempotencyKey ? idempotencyActor : null, idempotencyKey, idempotencyKey ? requestFingerprint : null, user.email],
      );
      if (!inserted.rows[0]) {
        const replay = await client.query(
          `SELECT id, request_fingerprint FROM media_versions
            WHERE idempotency_actor = $1 AND idempotency_key = $2`,
          [idempotencyActor, idempotencyKey],
        );
        if (!replay.rows[0] || replay.rows[0].request_fingerprint !== requestFingerprint) {
          throw mediaMutationError('media_idempotency_conflict', 409);
        }
        return {
          id: String(replay.rows[0].id),
          created: false,
          catalogRevision: await currentMediaCatalogRevision(client),
        };
      }
      await logMediaEvent(client, { id: requestedId, slot: value.slot, source_path: value.sourcePath }, 'created', user.email, {
        idempotencyKey: idempotencyKey || null,
        requestFingerprint: idempotencyKey ? requestFingerprint : null,
      });
      return {
        id: requestedId,
        created: true,
        catalogRevision: await currentMediaCatalogRevision(client),
      };
    });
    const version = await dbMediaVersionRow(result.id);
    res.setHeader('Location', `/api/admin/media-versions/${result.id}`);
    res.status(result.created ? 201 : 200).json({
      version: publicMediaVersion(version),
      catalogRevision: result.catalogRevision,
      idempotentReplay: !result.created,
    });
  } catch (error) {
    sendMediaMutationError(res, error, 'media_version_create_failed');
  }
});

app.patch('/api/admin/media-versions/:id', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const id = mediaVersionId(req.params.id);
  if (!id) { res.status(400).json({ error: 'invalid_media_version_id' }); return; }
  try {
    const expected = requireMediaExpectedRevision(req);
    const catalogRevision = await withMediaCatalogTransaction(async (client) => {
      const current = await dbMediaVersionRow(id, client, true);
      if (!current) throw mediaMutationError('media_version_not_found', 404);
      assertMediaRevision(current, expected);
      if (current.status !== 'candidate') throw mediaMutationError('media_version_locked', 409, { status: current.status });
      const validated = mediaVersionPatch(req.body, current);
      if (validated.error) throw mediaMutationError('invalid_media_version', 400, validated.error);
      const value = validated.value;
      const before = {
        label: current.label,
        metadata: current.metadata || {},
        provenance: current.provenance || {},
        nativeEvidence: current.native_evidence || {},
        reviewEvidence: current.review_evidence || {},
        rowRevision: Number(current.row_revision),
      };
      await client.query(
        `UPDATE media_versions SET
           label = COALESCE($2, label), metadata = COALESCE($3::jsonb, metadata),
           provenance = COALESCE($4::jsonb, provenance), native_evidence = COALESCE($5::jsonb, native_evidence),
           review_evidence = '{}'::jsonb, row_revision = row_revision + 1,
           updated_at = now(), updated_by = $6 WHERE id = $1`,
        [id, value.label ?? null, value.metadata === undefined ? null : JSON.stringify(value.metadata),
          value.provenance === undefined ? null : JSON.stringify(value.provenance),
          value.native_evidence === undefined ? null : JSON.stringify(value.native_evidence), user.email],
      );
      await logMediaEvent(client, current, 'metadata-updated', user.email, {
        before,
        after: {
          label: value.label ?? before.label,
          metadata: value.metadata ?? before.metadata,
          provenance: value.provenance ?? before.provenance,
          nativeEvidence: value.native_evidence ?? before.nativeEvidence,
          reviewEvidence: {},
          rowRevision: before.rowRevision + 1,
        },
      });
      return currentMediaCatalogRevision(client);
    });
    res.status(200).json({ version: publicMediaVersion(await dbMediaVersionRow(id)), catalogRevision });
  } catch (error) {
    sendMediaMutationError(res, error, 'media_version_update_failed');
  }
});

app.put(
  '/api/admin/media-versions/:id/content',
  async (req, res) => {
    const user = req.rawUploadAdmin || await requireAdmin(req, res);
    if (!user) return;
    const id = mediaVersionId(req.params.id);
    if (!id) { res.status(400).json({ error: 'invalid_media_version_id' }); return; }
    if (!liveMediaStorageConfigured()) { res.status(503).json({ error: 'live_media_storage_unavailable' }); return; }
    const storedMediaType = mediaType(req.headers['content-type']);
    if (!storedMediaType) { res.status(415).json({ error: 'unsupported_media_type' }); return; }
    const inspected = await inspectLiveMedia(req.body, storedMediaType);
    if (inspected.error) { res.status(400).json({ error: 'invalid_media_content', details: inspected.error }); return; }
    const sha256 = crypto.createHash('sha256').update(req.body).digest('hex');
    const blobKey = liveMediaBlobKey(sha256);
    try {
      const expected = requireMediaExpectedRevision(req);
      const before = await dbMediaVersionRow(id);
      if (!before) throw mediaMutationError('media_version_not_found', 404);
      assertMediaRevision(before, expected);
      if (before.status !== 'candidate') throw mediaMutationError('media_version_locked', 409, { status: before.status });
      await writeLiveMediaBlob(blobKey, req.body, sha256, storedMediaType);
      const catalogRevision = await withMediaCatalogTransaction(async (client) => {
        const current = await dbMediaVersionRow(id, client, true);
        if (!current) throw mediaMutationError('media_version_not_found', 404);
        assertMediaRevision(current, expected);
        if (current.status !== 'candidate') throw mediaMutationError('media_version_locked', 409, { status: current.status });
        await client.query(
          `INSERT INTO media_blobs (sha256, blob_key, media_type, byte_length, width, height)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (sha256) DO NOTHING`,
          [sha256, blobKey, storedMediaType, req.body.length, inspected.width, inspected.height],
        );
        const stored = await mediaBlobRecord(sha256, { queryable: client });
        if (
          !stored || stored.blob_key !== blobKey || stored.media_type !== storedMediaType
          || Number(stored.byte_length) !== req.body.length
          || (stored.width === null ? null : Number(stored.width)) !== inspected.width
          || (stored.height === null ? null : Number(stored.height)) !== inspected.height
        ) throw new Error('media blob metadata conflicts with existing content hash');
        const preserveNativeEvidence = preservesNativeEvidenceForUpload(current, {
          sha256,
          mediaType: storedMediaType,
          width: inspected.width,
          height: inspected.height,
        });
        await client.query(
          `UPDATE media_versions SET blob_sha256 = $2,
             native_evidence = CASE WHEN $3::boolean THEN native_evidence ELSE '{}'::jsonb END,
             review_evidence = '{}'::jsonb, row_revision = row_revision + 1,
             updated_at = now(), updated_by = $4 WHERE id = $1`,
          [id, sha256, preserveNativeEvidence, user.email],
        );
        await logMediaEvent(client, current, 'content-uploaded', user.email, {
          before: {
            sha256: current.blob_sha256,
            nativeEvidence: current.native_evidence || {},
            reviewEvidence: current.review_evidence || {},
            rowRevision: Number(current.row_revision),
          },
          after: {
            sha256,
            mediaType: storedMediaType,
            width: inspected.width,
            height: inspected.height,
            byteLength: req.body.length,
            nativeEvidencePreserved: preserveNativeEvidence,
            reviewEvidence: {},
            rowRevision: Number(current.row_revision) + 1,
          },
        });
        return currentMediaCatalogRevision(client);
      });
      res.status(200).json({ version: publicMediaVersion(await dbMediaVersionRow(id)), catalogRevision });
    } catch (error) {
      sendMediaMutationError(res, error, 'media_content_upload_failed');
    }
  },
);

const ATARAXIA_NUMERAL_REVIEW_PATH = /^(?:\/(?:play|run))?\/(?:strategikon\/)?enchiridion\/ataraxia$/;

function gameOwnedReviewSurfaceUrl(req, raw) {
  const value = boundedMediaText(raw, '', 2048);
  if (!value) return null;
  try {
    const url = new URL(value);
    const requestOrigin = String(req.get('origin') || '').trim().replace(/\/+$/, '');
    const sameOrigin = requestOrigin
      ? url.origin === requestOrigin
      : url.host.toLowerCase() === String(req.get('host') || '').toLowerCase();
    // Each entry is a surface some art domain is genuinely reviewed on; the Ataraxia rung
    // marks are worn by the Ataraxia reference rows, on either host (ADR-0363).
    const gameOwnedPath = url.pathname === '/studio' || url.pathname === '/editor/level'
      || url.pathname === '/play/strategikon/enchiridion/units'
      || ATARAXIA_NUMERAL_REVIEW_PATH.test(url.pathname);
    if (!sameOrigin || (url.protocol !== 'http:' && url.protocol !== 'https:') || !gameOwnedPath || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function validateMediaReviewProofSnapshot(client, current, evidence, surfaceUrl) {
  if (predrawnBoardSlotSlug(current.slot)) {
    const projectionIssue = mediaDomainProjectionIssue(current);
    if (projectionIssue) {
      throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: projectionIssue });
    }
    const proofIssue = predrawnBoardOwnerProofIssue(current, evidence, surfaceUrl);
    if (proofIssue) throw mediaMutationError('invalid_media_review_proof', 409, proofIssue);
    const selected = evidence.selectedCandidates[0];
    const snapshot = evidence.slotSnapshots[0];
    const slotResult = await client.query(
      'SELECT slot, active_version_id, row_revision FROM media_slots WHERE slot = $1',
      [current.slot],
    );
    const slotRow = slotResult.rows[0];
    if (!slotRow) throw mediaMutationError('media_slot_not_found', 404);
    if (
      Number(snapshot.rowRevision) !== Number(slotRow.row_revision)
      || (snapshot.activeVersionId ?? null) !== (slotRow.active_version_id ? String(slotRow.active_version_id) : null)
    ) throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: 'slot snapshot mismatch' });
    if (
      current.status !== 'candidate' || Number(selected.rowRevision) !== Number(current.row_revision)
    ) throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: 'candidate snapshot mismatch' });
    return;
  }
  if (sfxSampleSlot(current.slot)) {
    const projectionIssue = mediaDomainProjectionIssue(current);
    if (projectionIssue) {
      throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: projectionIssue });
    }
    const proofIssue = sfxSampleOwnerProofIssue(current, evidence, surfaceUrl);
    if (proofIssue) {
      throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: proofIssue });
    }
    const selected = evidence.selectedCandidates[0];
    const snapshot = evidence.slotSnapshots[0];
    const slotResult = await client.query(
      'SELECT slot, active_version_id, row_revision FROM media_slots WHERE slot = $1',
      [current.slot],
    );
    const slotRow = slotResult.rows[0];
    if (!slotRow) throw mediaMutationError('media_slot_not_found', 404);
    if (
      Number(snapshot.rowRevision) !== Number(slotRow.row_revision)
      || (snapshot.activeVersionId ?? null) !== (slotRow.active_version_id ? String(slotRow.active_version_id) : null)
    ) throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: 'slot snapshot mismatch' });
    if (
      current.status !== 'candidate' || Number(selected.rowRevision) !== Number(current.row_revision)
    ) throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: 'candidate snapshot mismatch' });
    return;
  }
  if (levelEditorBrushIconSlot(current.slot) || strategikonBackgroundSlot(current.slot)) {
    const projectionIssue = mediaDomainProjectionIssue(current);
    if (projectionIssue) {
      throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: projectionIssue });
    }
    const proofIssue = levelEditorBrushIconSlot(current.slot)
      ? levelEditorBrushIconOwnerProofIssue(current, evidence, surfaceUrl)
      : strategikonBackgroundOwnerProofIssue(current, evidence, surfaceUrl);
    if (proofIssue) {
      throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: proofIssue });
    }
    const selected = evidence.selectedCandidates[0];
    const snapshot = evidence.slotSnapshots[0];
    const slotResult = await client.query(
      'SELECT slot, active_version_id, row_revision FROM media_slots WHERE slot = $1',
      [current.slot],
    );
    const slotRow = slotResult.rows[0];
    if (!slotRow) throw mediaMutationError('media_slot_not_found', 404);
    if (
      Number(snapshot.rowRevision) !== Number(slotRow.row_revision)
      || (snapshot.activeVersionId ?? null) !== (slotRow.active_version_id ? String(slotRow.active_version_id) : null)
    ) throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: 'slot snapshot mismatch' });
    if (current.status !== 'candidate' || Number(selected.rowRevision) !== Number(current.row_revision)) {
      throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: 'candidate snapshot mismatch' });
    }
    return;
  }
  if (runCardBackSlot(current.slot) || current.role === 'card-back') {
    const projectionIssue = runCardBackMediaIssue(current);
    if (projectionIssue) {
      throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: projectionIssue });
    }
    const proofIssue = runCardBackOwnerProofIssue(current, evidence, surfaceUrl);
    if (proofIssue) {
      throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: proofIssue });
    }
    const selected = evidence.selectedCandidates[0];
    const snapshot = evidence.slotSnapshots[0];
    const slotResult = await client.query(
      'SELECT slot, active_version_id, row_revision FROM media_slots WHERE slot = $1',
      [current.slot],
    );
    const slotRow = slotResult.rows[0];
    if (!slotRow) throw mediaMutationError('media_slot_not_found', 404);
    if (
      Number(snapshot.rowRevision) !== Number(slotRow.row_revision)
      || (snapshot.activeVersionId ?? null) !== (slotRow.active_version_id ? String(slotRow.active_version_id) : null)
    ) throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: 'slot snapshot mismatch' });
    if (current.status !== 'candidate' || Number(selected.rowRevision) !== Number(current.row_revision)) {
      throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: 'candidate snapshot mismatch' });
    }
    return;
  }
  if (ataraxiaNumeralSlot(current.slot)) {
    const projectionIssue = mediaDomainProjectionIssue(current);
    if (projectionIssue) {
      throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: projectionIssue });
    }
    const proofIssue = ataraxiaNumeralOwnerProofIssue(current, evidence, surfaceUrl);
    if (proofIssue) {
      throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: proofIssue });
    }
    const selected = evidence.selectedCandidates[0];
    const snapshot = evidence.slotSnapshots[0];
    const slotResult = await client.query(
      'SELECT slot, active_version_id, row_revision FROM media_slots WHERE slot = $1',
      [current.slot],
    );
    const slotRow = slotResult.rows[0];
    if (!slotRow) throw mediaMutationError('media_slot_not_found', 404);
    if (
      Number(snapshot.rowRevision) !== Number(slotRow.row_revision)
      || (snapshot.activeVersionId ?? null) !== (slotRow.active_version_id ? String(slotRow.active_version_id) : null)
    ) throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: 'slot snapshot mismatch' });
    if (current.status !== 'candidate' || Number(selected.rowRevision) !== Number(current.row_revision)) {
      throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: 'candidate snapshot mismatch' });
    }
    return;
  }
  if (new URL(surfaceUrl).pathname !== '/studio') {
    throw mediaMutationError('invalid_media_review_proof', 409, 'this media domain requires its Studio proof surface');
  }
  if (wallMaterialSlot(current.slot)) {
    const projectionIssue = mediaDomainProjectionIssue(current);
    if (projectionIssue) {
      throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: projectionIssue });
    }
    const proofIssue = wallMaterialOwnerProofIssue(current, evidence, surfaceUrl);
    if (proofIssue) {
      throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: proofIssue });
    }
    // One wall proof covers the whole batch, so pin this candidate against its own entries.
    const selected = evidence.selectedCandidates.find((item) => isObjectRecord(item) && item.slot === current.slot);
    const snapshot = evidence.slotSnapshots.find((item) => isObjectRecord(item) && item.slot === current.slot);
    const slotResult = await client.query(
      'SELECT slot, active_version_id, row_revision FROM media_slots WHERE slot = $1',
      [current.slot],
    );
    const slotRow = slotResult.rows[0];
    if (!slotRow) throw mediaMutationError('media_slot_not_found', 404);
    if (
      Number(snapshot.rowRevision) !== Number(slotRow.row_revision)
      || (snapshot.activeVersionId ?? null) !== (slotRow.active_version_id ? String(slotRow.active_version_id) : null)
    ) throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: 'slot snapshot mismatch' });
    if (current.status !== 'candidate' || Number(selected.rowRevision) !== Number(current.row_revision)) {
      throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: 'candidate snapshot mismatch' });
    }
    return;
  }
  if (current.domain !== 'terrain') {
    const runCardArt = runCardArtProjection(current);
    if (runCardArt.claimed) {
      if (runCardArt.issue) {
        throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: runCardArt.issue });
      }
      const proofIssue = runCardArtOwnerProofIssue(runCardArt.value, evidence, surfaceUrl);
      if (proofIssue) {
        throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: proofIssue });
      }
    }
    const sourceArt = sourceArtTurntableProjection(current);
    if (sourceArt.claimed) {
      if (sourceArt.issue) {
        throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: sourceArt.issue });
      }
      const proofIssue = sourceArtTurntableOwnerProofIssue(sourceArt.value, evidence, surfaceUrl);
      if (proofIssue) {
        throw mediaMutationError('invalid_media_review_proof', 409, { slot: current.slot, reason: proofIssue });
      }
    }
    const contract = mediaAcceptanceContract(current);
    if (contract.mode === 'group') {
      if (
        evidence.schema !== 'live-media-owner-group-proof-v1' || evidence.canonicalScale !== 1
        || !runtimeSemanticText(evidence.surfaceKind, 160) || !Array.isArray(evidence.selectedCandidates)
        || !Array.isArray(evidence.slotSnapshots) || !isObjectRecord(evidence.acceptanceGroup)
        || evidence.acceptanceGroup.groupId !== contract.groupId
        || canonicalJson(evidence.acceptanceGroup.requiredSlots) !== canonicalJson(contract.requiredSlots)
      ) throw mediaMutationError('invalid_media_review_proof', 409, 'typed group owner proof is incomplete');
      const selected = evidence.selectedCandidates.filter(isObjectRecord);
      const snapshots = evidence.slotSnapshots.filter(isObjectRecord);
      const selectedBySlot = new Map(selected.map((item) => [item.slot, item]));
      const snapshotBySlot = new Map(snapshots.map((item) => [item.slot, item]));
      if (
        selected.length !== contract.requiredSlots.length || selectedBySlot.size !== contract.requiredSlots.length
        || snapshots.length !== contract.requiredSlots.length || snapshotBySlot.size !== contract.requiredSlots.length
      ) throw mediaMutationError('invalid_media_review_proof', 409, 'group proof must cover each slot exactly once');
      const slotResult = await client.query(
        'SELECT slot, active_version_id, row_revision FROM media_slots WHERE slot = ANY($1::text[]) ORDER BY slot',
        [contract.requiredSlots],
      );
      const selectedIds = [];
      if (slotResult.rows.length !== contract.requiredSlots.length) throw mediaMutationError('media_slot_not_found', 404);
      for (const slotRow of slotResult.rows) {
        const selectedRow = selectedBySlot.get(slotRow.slot);
        const snapshot = snapshotBySlot.get(slotRow.slot);
        const selectedId = mediaVersionId(selectedRow?.versionId);
        if (
          !selectedId || !snapshot || Number(snapshot.rowRevision) !== Number(slotRow.row_revision)
          || (snapshot.activeVersionId ?? null) !== (slotRow.active_version_id ? String(slotRow.active_version_id) : null)
        ) throw mediaMutationError('invalid_media_review_proof', 409, { slot: slotRow.slot, reason: 'group slot snapshot mismatch' });
        selectedIds.push(selectedId);
      }
      const candidateResult = await client.query(
        `SELECT id, slot, status, blob_sha256, row_revision
           FROM media_versions WHERE id = ANY($1::uuid[]) ORDER BY slot`,
        [selectedIds],
      );
      if (candidateResult.rows.length !== contract.requiredSlots.length) throw mediaMutationError('invalid_media_review_proof', 409, 'group candidates are incomplete');
      for (const row of candidateResult.rows) {
        const selectedRow = selectedBySlot.get(row.slot);
        if (
          row.status !== 'candidate' || String(row.id) !== selectedRow?.versionId || row.blob_sha256 !== selectedRow?.sha256
          || Number(row.row_revision) !== Number(selectedRow?.rowRevision)
        ) throw mediaMutationError('invalid_media_review_proof', 409, { slot: row.slot, reason: 'group candidate snapshot mismatch' });
      }
      return;
    }
    if (
      evidence.schema !== 'live-media-owner-proof-v1' || mediaVersionId(evidence.versionId) !== current.id
      || mediaSha(evidence.contentSha256) !== current.blob_sha256 || evidence.slot !== current.slot
      || evidence.canonicalScale !== 1 || !runtimeSemanticText(evidence.surfaceKind, 160)
    ) throw mediaMutationError('invalid_media_review_proof', 409, 'typed owner proof does not match this candidate');
    return;
  }
  if (
    evidence.schema !== 'terrain-surface-canonical-board-proof-v1'
    || evidence.surfaceUrl !== surfaceUrl || evidence.renderer !== 'BoardLabBoard/BoardTerrainLayer'
    || evidence.canonicalScale !== 1 || evidence.assetLocalScale !== 1
    || evidence.spatialResampling !== false || evidence.deterministicProof !== true
    || !Array.isArray(evidence.selectedCandidates) || !Array.isArray(evidence.slotSnapshots)
  ) throw mediaMutationError('invalid_media_review_proof', 409, 'canonical terrain proof fields are incomplete');

  const contract = mediaAcceptanceContract(current);
  const requiredSlots = contract.mode === 'group' ? contract.requiredSlots : [current.slot];
  const selected = evidence.selectedCandidates.filter(isObjectRecord);
  const selectedBySlot = new Map(selected.map((item) => [item.slot, item]));
  const snapshots = evidence.slotSnapshots.filter(isObjectRecord);
  const snapshotBySlot = new Map(snapshots.map((item) => [item.slot, item]));
  if (contract.mode === 'group') {
    if (
      selected.length !== requiredSlots.length || selectedBySlot.size !== requiredSlots.length
      || snapshots.length !== requiredSlots.length || snapshotBySlot.size !== requiredSlots.length
      || evidence.surfaceOnly !== true
      || requiredSlots.some((slot) => selectedBySlot.get(slot)?.role !== 'top')
      || !Array.isArray(evidence.acceptanceGroups)
    ) throw mediaMutationError('invalid_media_review_proof', 409, 'group terrain proof must cover every required surface exactly once');
    const group = evidence.acceptanceGroups.find((item) => (
      isObjectRecord(item) && item.groupId === contract.groupId
      && canonicalJson(item.requiredSlots) === canonicalJson(requiredSlots)
    ));
    if (!group) throw mediaMutationError('invalid_media_review_proof', 409, 'terrain proof is missing its acceptance group');
  }
  const slotResult = await client.query(
    'SELECT slot, active_version_id, row_revision FROM media_slots WHERE slot = ANY($1::text[]) ORDER BY slot',
    [requiredSlots],
  );
  if (slotResult.rows.length !== requiredSlots.length) throw mediaMutationError('media_slot_not_found', 404);
  const selectedIds = [];
  for (const slotRow of slotResult.rows) {
    const proofSlot = selectedBySlot.get(slotRow.slot);
    const proofSnapshot = snapshotBySlot.get(slotRow.slot);
    const proofId = mediaVersionId(proofSlot?.versionId);
    if (
      !proofSlot || !proofSnapshot || !proofId || mediaSha(proofSlot.sha256) === null
      || Number(proofSnapshot.rowRevision) !== Number(slotRow.row_revision)
      || (proofSnapshot.activeVersionId ?? null) !== (slotRow.active_version_id ? String(slotRow.active_version_id) : null)
    ) throw mediaMutationError('invalid_media_review_proof', 409, { slot: slotRow.slot, reason: 'slot snapshot mismatch' });
    selectedIds.push(proofId);
  }
  const candidateResult = await client.query(
    `SELECT id, slot, status, blob_sha256, row_revision
       FROM media_versions WHERE id = ANY($1::uuid[]) ORDER BY slot`,
    [selectedIds],
  );
  if (candidateResult.rows.length !== requiredSlots.length) throw mediaMutationError('invalid_media_review_proof', 409, 'proof candidates are incomplete');
  for (const row of candidateResult.rows) {
    const proof = selectedBySlot.get(row.slot);
    if (
      row.status !== 'candidate' || String(row.id) !== proof?.versionId || row.blob_sha256 !== proof?.sha256
      || Number(row.row_revision) !== Number(proof?.rowRevision)
    ) throw mediaMutationError('invalid_media_review_proof', 409, { slot: row.slot, reason: 'candidate snapshot mismatch' });
  }
}

function mediaReviewRequest(req) {
  const raw = isObjectRecord(req.body) ? req.body : {};
  if (raw.approved !== true) throw mediaMutationError('media_review_approval_required', 400);
  const notes = boundedMediaText(raw.notes, '', 4000);
  const surfaceUrl = gameOwnedReviewSurfaceUrl(req, raw.surfaceUrl ?? raw.surface_url);
  const evidence = mediaJsonObject(raw.evidence, {});
  if (!notes || !surfaceUrl || !evidence || !Object.keys(evidence).length) {
    throw mediaMutationError('invalid_media_review', 400, 'notes, same-origin game-owned surfaceUrl, and non-empty evidence are required');
  }
  return { raw, notes, surfaceUrl, evidence };
}

async function approveMediaReviewBatch(items, review, actorEmail, { allowGroup = true } = {}) {
  const normalized = items.map((item) => ({
    id: mediaVersionId(item?.id),
    expectedRevision: Number.isInteger(item?.expectedRevision) && item.expectedRevision >= 0
      ? item.expectedRevision : null,
  }));
  if (
    !normalized.length || normalized.length > 256
    || normalized.some((item) => !item.id || item.expectedRevision === null)
    || new Set(normalized.map((item) => item.id)).size !== normalized.length
  ) throw mediaMutationError('invalid_media_review_batch', 400);
  const reviewBatchId = crypto.randomUUID();
  const result = await withMediaCatalogTransaction(async (client) => {
    const expectedById = new Map(normalized.map((item) => [item.id, item.expectedRevision]));
    const rows = [];
    for (const id of [...expectedById.keys()].sort()) {
      const current = await dbMediaVersionRow(id, client, true);
      if (!current) throw mediaMutationError('media_version_not_found', 404, { id });
      assertMediaRevision(current, expectedById.get(id));
      if (current.status !== 'candidate') throw mediaMutationError('media_version_locked', 409, { id, status: current.status });
      if (!current.blob_sha256) throw mediaMutationError('media_content_required', 409, { id });
      rows.push(current);
    }
    const grouped = rows.map((row) => ({ row, contract: mediaAcceptanceContract(row) }))
      .filter((item) => item.contract.mode === 'group');
    if (grouped.length) {
      const contract = grouped[0].contract;
      if (!allowGroup) throw mediaMutationError('media_group_review_batch_required', 409, contract);
      const slots = rows.map((row) => row.slot).sort();
      if (
        grouped.length !== rows.length || grouped.some((item) => (
          item.contract.groupId !== contract.groupId
          || canonicalJson(item.contract.requiredSlots) !== canonicalJson(contract.requiredSlots)
        )) || canonicalJson(slots) !== canonicalJson(contract.requiredSlots)
      ) throw mediaMutationError('media_group_review_incomplete', 409, contract);
    } else if (rows.length !== 1) {
      throw mediaMutationError('media_review_batch_requires_one_acceptance_group', 409);
    }
    for (const row of rows) await validateMediaReviewProofSnapshot(client, row, review.evidence, review.surfaceUrl);
    const approvedAt = new Date().toISOString();
    for (const row of rows) {
      const reviewEvidence = {
        approved: true,
        approvedBy: actorEmail,
        approvedAt,
        contentSha256: row.blob_sha256,
        notes: review.notes,
        surfaceUrl: review.surfaceUrl,
        evidence: review.evidence,
        reviewBatchId,
      };
      await client.query(
        `UPDATE media_versions SET review_evidence = $2::jsonb, row_revision = row_revision + 1,
           updated_at = now(), updated_by = $3 WHERE id = $1`,
        [row.id, JSON.stringify(reviewEvidence), actorEmail],
      );
      await logMediaEvent(client, row, rows.length === 1 ? 'owner-review-approved' : 'owner-review-approved-batch', actorEmail, {
        reviewEvidence,
      });
    }
    return {
      ids: rows.map((row) => String(row.id)),
      catalogRevision: await currentMediaCatalogRevision(client),
    };
  });
  return {
    reviewBatchId,
    catalogRevision: result.catalogRevision,
    versions: await Promise.all(result.ids.map(async (id) => publicMediaVersion(await dbMediaVersionRow(id)))),
  };
}

app.post('/api/admin/media-versions/review-batch', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  try {
    const review = mediaReviewRequest(req);
    if (!Array.isArray(review.raw.items)) throw mediaMutationError('invalid_media_review_batch', 400);
    res.status(200).json(await approveMediaReviewBatch(review.raw.items, review, user.email));
  } catch (error) {
    sendMediaMutationError(res, error, 'media_review_batch_failed');
  }
});

app.post('/api/admin/media-versions/:id/review', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const id = mediaVersionId(req.params.id);
  if (!id) { res.status(400).json({ error: 'invalid_media_version_id' }); return; }
  try {
    const expected = requireMediaExpectedRevision(req);
    const result = await approveMediaReviewBatch(
      [{ id, expectedRevision: expected }], mediaReviewRequest(req), user.email, { allowGroup: false },
    );
    res.status(200).json({
      version: result.versions[0],
      catalogRevision: result.catalogRevision,
      reviewBatchId: result.reviewBatchId,
    });
  } catch (error) {
    sendMediaMutationError(res, error, 'media_review_failed');
  }
});

function mediaAcceptanceContract(row) {
  const raw = isObjectRecord(row.slot_metadata?.acceptance) ? row.slot_metadata.acceptance : null;
  if (!raw || raw.mode === undefined || raw.mode === 'standalone') return { mode: 'standalone' };
  if (raw.mode !== 'group') throw mediaMutationError('media_slot_acceptance_contract_invalid', 409, { slot: row.slot });
  const groupId = boundedMediaText(raw.groupId ?? raw.group_id, '', 160);
  const rawSlots = raw.requiredSlots ?? raw.required_slots;
  if (!groupId || !Array.isArray(rawSlots) || rawSlots.length < 2 || rawSlots.length > 256) {
    throw mediaMutationError('media_slot_acceptance_contract_invalid', 409, { slot: row.slot });
  }
  const requiredSlots = rawSlots.map(mediaSlotId).sort();
  if (requiredSlots.some((slot) => !slot) || new Set(requiredSlots).size !== requiredSlots.length || !requiredSlots.includes(row.slot)) {
    throw mediaMutationError('media_slot_acceptance_contract_invalid', 409, { slot: row.slot });
  }
  return { mode: 'group', groupId, requiredSlots };
}

function assertPredrawnBoardAcceptanceProof(row, slot) {
  if (!predrawnBoardSlotSlug(row.slot)) return;
  if (mediaAcceptanceContract(row).mode !== 'standalone') {
    throw mediaMutationError('media_group_contract_mismatch', 409, { slot: row.slot });
  }
  const review = isObjectRecord(row.review_evidence) ? row.review_evidence : {};
  const proof = isObjectRecord(review.evidence) ? review.evidence : {};
  const issue = predrawnBoardOwnerProofIssue(row, proof, review.surfaceUrl);
  if (issue) throw mediaMutationError('media_owner_review_required', 409, { slot: row.slot, reason: issue });
  const selected = proof.selectedCandidates[0];
  const snapshot = proof.slotSnapshots[0];
  if (
    Number(selected.rowRevision) + 1 !== Number(row.row_revision)
    || !slot || Number(snapshot.rowRevision) !== Number(slot.row_revision)
    || (snapshot.activeVersionId ?? null) !== (slot.active_version_id ? String(slot.active_version_id) : null)
  ) throw mediaMutationError('media_review_slot_snapshot_stale', 409, { slot: row.slot });
}

function assertSfxSampleAcceptanceProof(row, slot) {
  if (!sfxSampleSlot(row.slot)) return;
  if (mediaAcceptanceContract(row).mode !== 'standalone') {
    throw mediaMutationError('media_group_contract_mismatch', 409, { slot: row.slot });
  }
  const review = isObjectRecord(row.review_evidence) ? row.review_evidence : {};
  const proof = isObjectRecord(review.evidence) ? review.evidence : {};
  const issue = sfxSampleOwnerProofIssue(row, proof, review.surfaceUrl);
  if (issue) throw mediaMutationError('media_owner_review_required', 409, { slot: row.slot, reason: issue });
  const selected = proof.selectedCandidates[0];
  const snapshot = proof.slotSnapshots[0];
  if (
    Number(selected.rowRevision) + 1 !== Number(row.row_revision)
    || !slot || Number(snapshot.rowRevision) !== Number(slot.row_revision)
    || (snapshot.activeVersionId ?? null) !== (slot.active_version_id ? String(slot.active_version_id) : null)
  ) throw mediaMutationError('media_review_slot_snapshot_stale', 409, { slot: row.slot });
}

function assertLevelEditorBrushIconAcceptanceProof(row, slot) {
  if (!levelEditorBrushIconSlot(row.slot)) return;
  if (mediaAcceptanceContract(row).mode !== 'standalone') {
    throw mediaMutationError('media_group_contract_mismatch', 409, { slot: row.slot });
  }
  const review = isObjectRecord(row.review_evidence) ? row.review_evidence : {};
  const proof = isObjectRecord(review.evidence) ? review.evidence : {};
  const issue = levelEditorBrushIconOwnerProofIssue(row, proof, review.surfaceUrl);
  if (issue) throw mediaMutationError('media_owner_review_required', 409, { slot: row.slot, reason: issue });
  const selected = proof.selectedCandidates[0];
  const snapshot = proof.slotSnapshots[0];
  if (
    Number(selected.rowRevision) + 1 !== Number(row.row_revision)
    || !slot || Number(snapshot.rowRevision) !== Number(slot.row_revision)
    || (snapshot.activeVersionId ?? null) !== (slot.active_version_id ? String(slot.active_version_id) : null)
  ) throw mediaMutationError('media_review_slot_snapshot_stale', 409, { slot: row.slot });
}

function assertStrategikonBackgroundAcceptanceProof(row, slot) {
  if (!strategikonBackgroundSlot(row.slot)) return;
  if (mediaAcceptanceContract(row).mode !== 'standalone') {
    throw mediaMutationError('media_group_contract_mismatch', 409, { slot: row.slot });
  }
  const review = isObjectRecord(row.review_evidence) ? row.review_evidence : {};
  const proof = isObjectRecord(review.evidence) ? review.evidence : {};
  const issue = strategikonBackgroundOwnerProofIssue(row, proof, review.surfaceUrl);
  if (issue) throw mediaMutationError('media_owner_review_required', 409, { slot: row.slot, reason: issue });
  const selected = proof.selectedCandidates[0];
  const snapshot = proof.slotSnapshots[0];
  if (
    Number(selected.rowRevision) + 1 !== Number(row.row_revision)
    || !slot || Number(snapshot.rowRevision) !== Number(slot.row_revision)
    || (snapshot.activeVersionId ?? null) !== (slot.active_version_id ? String(slot.active_version_id) : null)
  ) throw mediaMutationError('media_review_slot_snapshot_stale', 409, { slot: row.slot });
}

function assertTerrainAcceptanceProof(rows, slotById, contract = null) {
  if (!rows.length || rows.some((row) => row.domain !== 'terrain')) return;
  const expectedSlots = contract?.mode === 'group' ? contract.requiredSlots : rows.map((row) => row.slot).sort();
  const expectedBySlot = new Map(rows.map((row) => [row.slot, row]));
  let sharedProof = null;
  for (const row of rows) {
    const proof = row.review_evidence?.evidence;
    if (!isObjectRecord(proof)) throw mediaMutationError('media_owner_review_required', 409, { slot: row.slot, reason: 'terrain proof missing' });
    const snapshot = Array.isArray(proof.slotSnapshots)
      ? proof.slotSnapshots.find((item) => isObjectRecord(item) && item.slot === row.slot) : null;
    const slot = slotById.get(row.slot);
    if (
      !isObjectRecord(snapshot) || !slot || Number(snapshot.rowRevision) !== Number(slot.row_revision)
      || (snapshot.activeVersionId ?? null) !== (slot.active_version_id ? String(slot.active_version_id) : null)
    ) throw mediaMutationError('media_review_slot_snapshot_stale', 409, { slot: row.slot });
    const ownProof = Array.isArray(proof.selectedCandidates)
      ? proof.selectedCandidates.find((item) => isObjectRecord(item) && item.slot === row.slot) : null;
    if (
      !isObjectRecord(ownProof) || ownProof.versionId !== row.id || ownProof.sha256 !== row.blob_sha256
      || Number(ownProof.rowRevision) + 1 !== Number(row.row_revision)
      || (contract?.mode === 'group' && ownProof.role !== row.role)
    ) throw mediaMutationError('media_review_candidate_snapshot_stale', 409, { slot: row.slot });
    if (contract?.mode === 'group') {
      const canonical = canonicalJson(proof);
      if (sharedProof === null) sharedProof = canonical;
      if (canonical !== sharedProof) throw mediaMutationError('media_group_review_proof_mismatch', 409, { groupId: contract.groupId });
    }
  }
  if (contract?.mode !== 'group') return;
  const proof = rows[0].review_evidence.evidence;
  const selected = Array.isArray(proof.selectedCandidates) ? proof.selectedCandidates.filter(isObjectRecord) : [];
  const selectedBySlot = new Map(selected.map((item) => [item.slot, item]));
  if (
    selected.length !== expectedSlots.length || selectedBySlot.size !== expectedSlots.length
    || expectedSlots.some((slot) => !selectedBySlot.has(slot) || !expectedBySlot.has(slot))
  ) throw mediaMutationError('media_group_review_proof_incomplete', 409, { groupId: contract.groupId });
  for (const slot of expectedSlots) {
    const selectedRow = selectedBySlot.get(slot);
    const current = expectedBySlot.get(slot);
    if (
      selectedRow.versionId !== current.id || selectedRow.sha256 !== current.blob_sha256
      || Number(selectedRow.rowRevision) + 1 !== Number(current.row_revision)
    ) throw mediaMutationError('media_group_review_proof_stale', 409, { groupId: contract.groupId, slot });
  }
}

function assertGroupedOwnerAcceptanceProof(rows, slotById, contract) {
  if (!rows.length || rows.every((row) => row.domain === 'terrain')) return;
  let sharedProof = null;
  const bySlot = new Map(rows.map((row) => [row.slot, row]));
  for (const row of rows) {
    const proof = row.review_evidence?.evidence;
    if (!isObjectRecord(proof) || proof.schema !== 'live-media-owner-group-proof-v1') {
      throw mediaMutationError('media_group_review_proof_mismatch', 409, { groupId: contract.groupId });
    }
    const canonical = canonicalJson(proof);
    if (sharedProof === null) sharedProof = canonical;
    if (canonical !== sharedProof) throw mediaMutationError('media_group_review_proof_mismatch', 409, { groupId: contract.groupId });
  }
  const proof = rows[0].review_evidence.evidence;
  const selected = proof.selectedCandidates.filter(isObjectRecord);
  const snapshots = proof.slotSnapshots.filter(isObjectRecord);
  const selectedBySlot = new Map(selected.map((item) => [item.slot, item]));
  const snapshotBySlot = new Map(snapshots.map((item) => [item.slot, item]));
  if (
    selected.length !== contract.requiredSlots.length || selectedBySlot.size !== contract.requiredSlots.length
    || snapshots.length !== contract.requiredSlots.length || snapshotBySlot.size !== contract.requiredSlots.length
    || contract.requiredSlots.some((slot) => !bySlot.has(slot))
  ) throw mediaMutationError('media_group_review_proof_incomplete', 409, { groupId: contract.groupId });
  for (const slotName of contract.requiredSlots) {
    const row = bySlot.get(slotName);
    const slot = slotById.get(slotName);
    const selectedRow = selectedBySlot.get(slotName);
    const snapshot = snapshotBySlot.get(slotName);
    if (
      !slot || !selectedRow || !snapshot || selectedRow.versionId !== row.id || selectedRow.sha256 !== row.blob_sha256
      || Number(selectedRow.rowRevision) + 1 !== Number(row.row_revision)
      || Number(snapshot.rowRevision) !== Number(slot.row_revision)
      || (snapshot.activeVersionId ?? null) !== (slot.active_version_id ? String(slot.active_version_id) : null)
    ) throw mediaMutationError('media_group_review_proof_stale', 409, { groupId: contract.groupId, slot: slotName });
  }
}

function assertSourceArtTurntableAcceptanceGroup(rows, contract) {
  const projections = rows.map(sourceArtTurntableProjection);
  if (!projections.some((projection) => projection.claimed)) return;
  if (
    rows.length !== SOURCE_ART_TURNTABLE_DIRECTIONS.length
    || projections.some((projection) => !projection.claimed || projection.issue || !projection.value)
  ) throw mediaMutationError('media_source_art_group_invalid', 409, { groupId: contract.groupId });
  const values = projections.map((projection) => projection.value);
  const first = values[0];
  if (
    contract.groupId !== `source-art-eight-way:${first.assetId}`
    || canonicalJson(contract.requiredSlots) !== canonicalJson(first.requiredSlots)
    || new Set(values.map((value) => value.direction)).size !== SOURCE_ART_TURNTABLE_DIRECTIONS.length
    || SOURCE_ART_TURNTABLE_DIRECTIONS.some((direction) => !values.some((value) => value.direction === direction))
  ) throw mediaMutationError('media_source_art_group_invalid', 409, { groupId: contract.groupId });
  const shared = (value) => canonicalJson({
    assetId: value.assetId,
    structureId: value.structureId,
    label: value.label,
    sortOrder: value.sortOrder,
    existing: value.existing,
    sourceOnly: value.sourceOnly,
    structureKind: value.structureKind,
    placementScale: value.placementScale,
    license: value.license,
  });
  const expected = shared(first);
  if (values.some((value) => shared(value) !== expected)) {
    throw mediaMutationError('media_source_art_group_invalid', 409, {
      groupId: contract.groupId,
      reason: 'turntable metadata differs between directions',
    });
  }
}

async function acceptMediaVersionBatch(items, actorEmail) {
  const batchId = crypto.randomUUID();
  const normalized = items.map((item) => ({
    id: mediaVersionId(item && item.id),
    expectedRevision: Number.isInteger(item && item.expectedRevision) && item.expectedRevision >= 0
      ? item.expectedRevision : null,
    expectedSlotRevision: Number.isInteger(item && item.expectedSlotRevision) && item.expectedSlotRevision >= 0
      ? item.expectedSlotRevision : null,
    expectedActiveVersionId: item && Object.prototype.hasOwnProperty.call(item, 'expectedActiveVersionId')
      ? (item.expectedActiveVersionId === null ? null : (mediaVersionId(item.expectedActiveVersionId) || undefined))
      : undefined,
  }));
  if (
    !normalized.length || normalized.length > 256 || normalized.some((item) => (
      !item.id || item.expectedRevision === null || item.expectedSlotRevision === null
      || item.expectedActiveVersionId === undefined
    ))
    || new Set(normalized.map((item) => item.id)).size !== normalized.length
  ) throw mediaMutationError('invalid_media_accept_batch', 400);

  // Verify immutable objects before opening the pointer transaction. The
  // no-delete Blob role + retention make a successful preflight durable; the
  // transaction then rechecks candidate revision/hash and slot CAS before swap.
  const preflightRows = [];
  for (const item of normalized) {
    const row = await dbMediaVersionRow(item.id);
    if (!row) throw mediaMutationError('media_version_not_found', 404, { id: item.id });
    assertMediaRevision(row, item.expectedRevision);
    if (row.status !== 'candidate' || !row.blob_sha256) {
      throw mediaMutationError('media_accept_requires_candidate_content', 409, { id: item.id, status: row.status });
    }
    preflightRows.push(row);
  }
  const uniquePreflightBlobs = new Map(preflightRows.map((row) => [row.blob_sha256, row]));
  await Promise.all([...uniquePreflightBlobs.values()].map(verifyLiveMediaBlobPresent));

  const result = await withMediaCatalogTransaction(async (client) => {
    const rows = [];
    for (const item of [...normalized].sort((a, b) => a.id.localeCompare(b.id))) {
      const current = await dbMediaVersionRow(item.id, client, true);
      if (!current) throw mediaMutationError('media_version_not_found', 404, { id: item.id });
      assertMediaRevision(current, item.expectedRevision);
      if (current.status !== 'candidate') throw mediaMutationError('media_version_locked', 409, { id: item.id, status: current.status });
      if (!current.slot || !current.blob_sha256) throw mediaMutationError('media_accept_requires_slotted_content', 409, { id: item.id });
      if (!publicMediaTypeAllowed(current.media_type)) {
        throw mediaMutationError('media_type_not_public_runtime', 409, { id: item.id, mediaType: current.media_type });
      }
      const provenanceIssue = mediaProvenanceIssue(current);
      if (provenanceIssue) throw mediaMutationError('media_provenance_required', 409, { id: item.id, reason: provenanceIssue });
      const nativeIssue = nativeMediaEvidenceIssue(current);
      if (nativeIssue) throw mediaMutationError('media_native_evidence_required', 409, { id: item.id, reason: nativeIssue });
      const reviewIssue = reviewedMediaEvidenceIssue(current);
      if (reviewIssue) throw mediaMutationError('media_owner_review_required', 409, { id: item.id, reason: reviewIssue });
      const projectionIssue = mediaDomainProjectionIssue(current);
      if (projectionIssue) throw mediaMutationError('media_domain_projection_invalid', 409, { id: item.id, reason: projectionIssue });
      current.accept_request = item;
      rows.push(current);
    }
    if (new Set(rows.map((row) => row.slot)).size !== rows.length) {
      throw mediaMutationError('media_accept_batch_duplicate_slot', 409);
    }

    const slots = rows.map((row) => row.slot).sort();
    const slotResult = await client.query(
      `SELECT slot, active_version_id, lifecycle_state, domain, role, metadata, row_revision
         FROM media_slots WHERE slot = ANY($1::text[]) ORDER BY slot FOR UPDATE`,
      [slots],
    );
    if (slotResult.rows.length !== slots.length) throw mediaMutationError('media_slot_not_found', 404);
    const slotById = new Map(slotResult.rows.map((row) => [row.slot, row]));
    for (const row of rows) {
      const slotRow = slotById.get(row.slot);
      if (slotRow.lifecycle_state === 'retired') throw mediaMutationError('media_slot_retired', 409, { slot: row.slot });
      if (Number(slotRow.row_revision) !== row.accept_request.expectedSlotRevision) {
        throw mediaMutationError('media_slot_conflict', 409, {
          slot: row.slot,
          currentRevision: Number(slotRow.row_revision),
          currentActiveVersionId: slotRow.active_version_id ? String(slotRow.active_version_id) : null,
        });
      }
      const currentActiveVersionId = slotRow.active_version_id ? String(slotRow.active_version_id) : null;
      if (currentActiveVersionId !== row.accept_request.expectedActiveVersionId) {
        throw mediaMutationError('media_slot_pointer_conflict', 409, {
          slot: row.slot,
          currentRevision: Number(slotRow.row_revision),
          currentActiveVersionId,
        });
      }
      if (row.domain !== slotRow.domain || row.role !== slotRow.role) {
        throw mediaMutationError('media_slot_projection_mismatch', 409, { slot: row.slot });
      }
      row.slot_metadata = slotRow.metadata;
    }

    for (const row of rows) {
      if (row.domain === 'terrain' && mediaAcceptanceContract(row).mode === 'standalone') {
        assertTerrainAcceptanceProof([row], slotById);
      }
      assertPredrawnBoardAcceptanceProof(row, slotById.get(row.slot));
      assertSfxSampleAcceptanceProof(row, slotById.get(row.slot));
      assertLevelEditorBrushIconAcceptanceProof(row, slotById.get(row.slot));
      assertStrategikonBackgroundAcceptanceProof(row, slotById.get(row.slot));
    }

    const bySlot = new Map(rows.map((row) => [row.slot, row]));
    const grouped = new Map();
    for (const row of rows) {
      const contract = mediaAcceptanceContract(row);
      if (contract.mode !== 'group') continue;
      if (!grouped.has(contract.groupId)) grouped.set(contract.groupId, { required: contract.requiredSlots, rows: [] });
      const group = grouped.get(contract.groupId);
      if (JSON.stringify(group.required) !== JSON.stringify(contract.requiredSlots)) {
        throw mediaMutationError('media_group_contract_mismatch', 409, { groupId: contract.groupId });
      }
      group.rows.push(row);
    }
    for (const [groupId, group] of grouped) {
      const missingSlots = group.required.filter((slot) => !bySlot.has(slot));
      if (missingSlots.length) throw mediaMutationError('media_group_incomplete', 409, { groupId, missingSlots });
      for (const slot of group.required) {
        const memberContract = mediaAcceptanceContract(bySlot.get(slot));
        if (memberContract.mode !== 'group' || memberContract.groupId !== groupId) {
          throw mediaMutationError('media_group_contract_mismatch', 409, { groupId, slot });
        }
      }
      const cardTypeTextureGroup = group.rows.some((row) => cardTypeRowTextureSlot(row.slot))
        || group.required.some((slot) => cardTypeRowTextureSlot(slot));
      if (cardTypeTextureGroup) {
        const issue = cardTypeRowTextureAcceptanceGroupIssue(group.rows, {
          groupId, requiredSlots: group.required,
        });
        if (issue) throw mediaMutationError('media_group_contract_mismatch', 409, { groupId, reason: issue });
      }
      const [first] = group.rows;
      for (const row of group.rows) {
        if (
          row.domain !== first.domain || row.role !== first.role || row.media_type !== first.media_type
          || (!cardTypeTextureGroup && (
            Number(row.width) !== Number(first.width) || Number(row.height) !== Number(first.height)
          ))
        ) throw mediaMutationError('media_group_projection_mismatch', 409, { groupId, slot: row.slot });
      }
      assertTerrainAcceptanceProof(group.rows, slotById, {
        mode: 'group', groupId, requiredSlots: group.required,
      });
      assertSourceArtTurntableAcceptanceGroup(group.rows, {
        mode: 'group', groupId, requiredSlots: group.required,
      });
      assertGroupedOwnerAcceptanceProof(group.rows, slotById, {
        mode: 'group', groupId, requiredSlots: group.required,
      });
    }
    if (rows.length === 1 && mediaAcceptanceContract(rows[0]).mode === 'group') {
      throw mediaMutationError('media_group_accept_required', 409, {
        groupId: mediaAcceptanceContract(rows[0]).groupId,
        requiredSlots: mediaAcceptanceContract(rows[0]).requiredSlots,
      });
    }

    const activeBySlot = new Map(slotResult.rows.map((row) => [row.slot, row.active_version_id ? String(row.active_version_id) : null]));
    for (const row of rows) {
      const previousId = activeBySlot.get(row.slot);
      if (previousId && previousId !== String(row.id)) {
        await client.query(
          `UPDATE media_versions SET status = 'archived', row_revision = row_revision + 1,
             updated_at = now(), updated_by = $2 WHERE id = $1`,
          [previousId, actorEmail],
        );
      }
      await client.query(
        `UPDATE media_versions SET status = 'accepted', row_revision = row_revision + 1,
           updated_at = now(), updated_by = $2 WHERE id = $1`,
        [row.id, actorEmail],
      );
      await client.query(
        'UPDATE media_blobs SET published_at = COALESCE(published_at, now()) WHERE sha256 = $1',
        [row.blob_sha256],
      );
      await client.query(
        `UPDATE media_slots SET active_version_id = $2, lifecycle_state = 'active',
           activated_at = COALESCE(activated_at, now()), row_revision = row_revision + 1,
           updated_at = now(), updated_by = $3 WHERE slot = $1`,
        [row.slot, row.id, actorEmail],
      );
      await logMediaEvent(client, row, rows.length === 1 ? 'accepted' : 'accepted-batch', actorEmail, {
        batchId, previousVersionId: previousId, sha256: row.blob_sha256,
      });
    }
    return { catalogRevision: await bumpMediaCatalog(client), ids: rows.map((row) => String(row.id)) };
  }, { invalidatePublic: true });
  return {
    catalogRevision: result.catalogRevision,
    batchId,
    versions: await Promise.all(result.ids.map(async (id) => publicMediaVersion(await dbMediaVersionRow(id)))),
  };
}

app.post('/api/admin/media-versions/accept-batch', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  try {
    const raw = isObjectRecord(req.body) ? req.body : {};
    if (!Array.isArray(raw.items)) throw mediaMutationError('invalid_media_accept_batch', 400);
    const result = await acceptMediaVersionBatch(raw.items, user.email);
    res.status(200).json(result);
  } catch (error) {
    sendMediaMutationError(res, error, 'media_accept_batch_failed');
  }
});

app.post('/api/admin/media-versions/:id/accept', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const id = mediaVersionId(req.params.id);
  if (!id) { res.status(400).json({ error: 'invalid_media_version_id' }); return; }
  try {
    const expected = requireMediaExpectedRevision(req);
    const raw = isObjectRecord(req.body) ? req.body : {};
    const result = await acceptMediaVersionBatch([{
      id,
      expectedRevision: expected,
      expectedSlotRevision: raw.expectedSlotRevision,
      expectedActiveVersionId: Object.prototype.hasOwnProperty.call(raw, 'expectedActiveVersionId')
        ? raw.expectedActiveVersionId : undefined,
    }], user.email);
    res.status(200).json({ version: result.versions[0], catalogRevision: result.catalogRevision, batchId: result.batchId });
  } catch (error) {
    sendMediaMutationError(res, error, 'media_accept_failed');
  }
});

app.post('/api/admin/media-versions/:id/archive', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const id = mediaVersionId(req.params.id);
  if (!id) { res.status(400).json({ error: 'invalid_media_version_id' }); return; }
  try {
    const expected = requireMediaExpectedRevision(req);
    const raw = isObjectRecord(req.body) ? req.body : {};
    const reason = boundedMediaText(raw.reason, '', 4000);
    const evidence = mediaJsonObject(raw.evidence, {});
    if (!reason || !evidence || !Object.keys(evidence).length) {
      throw mediaMutationError('media_archive_evidence_required', 400);
    }
    const catalogRevision = await withMediaCatalogTransaction(async (client) => {
      const current = await dbMediaVersionRow(id, client, true);
      if (!current) throw mediaMutationError('media_version_not_found', 404);
      assertMediaRevision(current, expected);
      if (current.status !== 'candidate') throw mediaMutationError('media_version_locked', 409, { status: current.status });
      if (current.slot) {
        const active = await client.query('SELECT active_version_id FROM media_slots WHERE slot = $1 FOR UPDATE', [current.slot]);
        if (String(active.rows[0]?.active_version_id || '') === id) throw mediaMutationError('active_media_version_cannot_archive', 409);
      }
      await client.query(
        `UPDATE media_versions SET status = 'archived', row_revision = row_revision + 1,
           updated_at = now(), updated_by = $2 WHERE id = $1`,
        [id, user.email],
      );
      await logMediaEvent(client, current, current.blob_sha256 ? 'candidate-archived' : 'candidate-abandoned', user.email, {
        reason,
        evidence,
        sha256: current.blob_sha256,
        rowRevision: Number(current.row_revision),
      });
      return currentMediaCatalogRevision(client);
    });
    res.status(200).json({ version: publicMediaVersion(await dbMediaVersionRow(id)), catalogRevision });
  } catch (error) {
    sendMediaMutationError(res, error, 'media_archive_failed');
  }
});

function parseMediaRange(raw, length) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(raw || '').trim());
  if (!match || (!match[1] && !match[2])) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isInteger(suffix) || suffix < 1) return null;
    start = Math.max(0, length - suffix);
    end = length - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : length - 1;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= length || end < start) return null;
  return { start, end: Math.min(end, length - 1) };
}

async function serveImmutableMedia(req, res, record, { privateRead = false } = {}) {
  // Verify/load the object before setting any successful immutable response
  // metadata. A missing or corrupt object must produce a no-store error, never
  // a cacheable 503 carrying the asset's Content-Type/ETag.
  const buffer = await mediaBytesBySha(record.sha256, record);
  if (!buffer) { res.status(404).setHeader('Cache-Control', 'no-store'); res.send('not found'); return; }
  const etag = `"${record.sha256}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', privateRead ? 'private, no-store' : 'public, max-age=31536000, immutable');
  res.setHeader('Content-Type', record.media_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (
    privateRead && !record.media_type.startsWith('image/') && !record.media_type.startsWith('audio/')
    && !record.media_type.startsWith('video/') && !record.media_type.startsWith('font/')
  ) res.setHeader('Content-Disposition', `attachment; filename="${record.sha256}"`);
  if (record.media_type === 'image/svg+xml') res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'");
  if (req.headers['if-none-match'] === etag) { res.status(304).end(); return; }
  res.setHeader('Accept-Ranges', 'bytes');
  if (req.headers.range) {
    const range = parseMediaRange(req.headers.range, buffer.length);
    if (!range) {
      res.setHeader('Content-Range', `bytes */${buffer.length}`);
      res.status(416).end();
      return;
    }
    const body = buffer.subarray(range.start, range.end + 1);
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${buffer.length}`);
    res.setHeader('Content-Length', String(body.length));
    res.status(206).end(body);
    return;
  }
  res.setHeader('Content-Length', String(buffer.length));
  res.status(200).end(buffer);
}

// Private campaign list thumbnails may contain private pre-drawn scene pixels.
// Keep their content-addressed bytes out of the anonymous /api/media namespace;
// this route proves both current ownership and the exact current derivative.
app.get(/^\/api\/campaign-workspace\/level-thumbnails\/([^/]{1,80})\/([0-9a-f]{64})\.png$/, async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const levelId = levelStoreId(req.params[0]);
  const requestedSha256 = mediaSha(req.params[1]);
  try {
    const workspace = await dbGetWorkspace(user.email);
    const levels = isObjectRecord(workspace?.body?.levels) ? workspace.body.levels : {};
    const level = levelId && isObjectRecord(levels[levelId]) ? levels[levelId] : null;
    if (!level || !requestedSha256) {
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(404).send('not found');
      return;
    }
    const authorityKey = `user:${user.email}:${levelId}`;
    const [thumbnail, preparedBatch] = await Promise.all([
      storedLevelThumbnail(authorityKey),
      prepareLevelThumbnailEntries([[authorityKey, level]]),
    ]);
    const prepared = preparedBatch.entries[0];
    if (
      !thumbnail
      || thumbnail.content_version !== prepared.contentVersion
      || thumbnail.blob_sha256 !== requestedSha256
    ) {
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(404).send('not found');
      return;
    }
    const record = await mediaBlobRecord(requestedSha256);
    if (!record) {
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(404).send('not found');
      return;
    }
    await serveImmutableMedia(req, res, record, { privateRead: true });
  } catch (error) {
    console.error('private level thumbnail read failed:', error && error.message);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(503).json({ error: 'thumbnail_unavailable' });
  }
});

// Once an accepted or imported bridge hash has been published it remains
// readable for honest immutable caching, historical pointers, and optional
// read-only test-slot snapshots. Candidate and source hashes never become public.
app.get(/^\/api\/media\/([0-9a-f]{64})$/, async (req, res) => {
  const sha256 = mediaSha(req.params[0]);
  try {
    const record = sha256 ? await mediaBlobRecord(sha256, { publicOnly: true }) : null;
    if (!record) { res.setHeader('Cache-Control', 'no-store'); res.status(404).send('not found'); return; }
    await serveImmutableMedia(req, res, record);
  } catch (error) {
    console.error('public immutable media read failed:', error && error.message);
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({ error: 'media_unavailable' });
  }
});

app.get(/^\/api\/admin\/media\/([0-9a-f]{64})$/, async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const sha256 = mediaSha(req.params[0]);
  try {
    const record = sha256 ? await mediaBlobRecord(sha256) : null;
    if (!record) { res.setHeader('Cache-Control', 'private, no-store'); res.status(404).send('not found'); return; }
    await serveImmutableMedia(req, res, record, { privateRead: true });
  } catch (error) {
    console.error('admin immutable media read failed:', error && error.message);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(503).json({ error: 'media_unavailable' });
  }
});

// --- Live unit-art catalog -------------------------------------------------
// Gameplay has exactly six stable unit identities. Candidate assets are Studio
// records that can be accepted for one of those identities; no asset UUID is
// ever written into gameplay state. Sprite bytes are immutable/content-addressed
// while these rows provide the editable mapping and render geometry.
const UNIT_CATALOG_SCHEMA_VERSION = 1;
const UNIT_FAMILY_IDS = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
const UNIT_PALETTE_IDS = ['navy-blue', 'crimson', 'golden', 'emerald', 'black', 'white'];
const UNIT_DIRECTION_IDS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const UNIT_FAMILY_SET = new Set(UNIT_FAMILY_IDS);
const UNIT_PALETTE_SET = new Set(UNIT_PALETTE_IDS);
const UNIT_DIRECTION_SET = new Set(UNIT_DIRECTION_IDS);
const UNIT_ASSET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNIT_SPRITE_SHA_PATTERN = /^[0-9a-f]{64}$/;
const UNIT_CATALOG_CACHE_TTL_MS = 5 * 1000;
let unitCatalogCache = { at: 0, body: null };
const unitSpriteBufferCache = new Map();
let unitSpriteBufferCacheBytes = 0;

function unitAssetId(raw) {
  const id = String(raw || '').trim();
  return UNIT_ASSET_ID_PATTERN.test(id) ? id.toLowerCase() : null;
}

function unitFamilyId(raw) {
  const family = String(raw || '').trim().toLowerCase();
  return UNIT_FAMILY_SET.has(family) ? family : null;
}

function unitPaletteId(raw) {
  const palette = String(raw || '').trim().toLowerCase();
  return UNIT_PALETTE_SET.has(palette) ? palette : null;
}

function unitDirectionId(raw) {
  const direction = String(raw || '').trim().toLowerCase();
  return UNIT_DIRECTION_SET.has(direction) ? direction : null;
}

function boundedUnitText(raw, fallback, max) {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return value.length <= max ? value : null;
}

function finiteUnitNumber(raw, fallback, min, max) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function integerUnitNumber(raw, fallback, min, max) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function nativeUnitScalePercent(sourceCanvasWidth, sourceCanvasHeight) {
  if (!serverRender || typeof serverRender.nativeScalePercentFromCanvas !== 'function') {
    throw new Error('board-render native scale contract is unavailable');
  }
  return serverRender.nativeScalePercentFromCanvas(Number(sourceCanvasWidth), Number(sourceCanvasHeight));
}

function unitAssetAcceptanceBlockReason(asset, currentReason = null) {
  if (currentReason) return currentReason;
  if (!serverRender || typeof serverRender.unitAssetProductionEligibility !== 'function') {
    throw new Error('board-render unit production eligibility contract is unavailable');
  }
  const eligibility = serverRender.unitAssetProductionEligibility(asset);
  return eligibility.eligible ? null : eligibility.reason;
}

function validateUnitAssetInput(raw, current = null) {
  if (!isObjectRecord(raw)) return { error: 'unit asset metadata must be an object' };
  const family = current ? current.family : unitFamilyId(raw.family);
  if (!family) return { error: 'family must be pawn, rook, knight, bishop, queen, or king' };
  const label = boundedUnitText(raw.label, current ? current.label : '', 80);
  if (label === null || !label) return { error: 'label must be 1-80 characters' };
  const method = boundedUnitText(raw.method, current ? current.method : 'Imported', 80);
  if (method === null || !method) return { error: 'method must be 1-80 characters' };
  const notes = boundedUnitText(raw.notes, current ? current.notes : '', 2000);
  if (notes === null) return { error: 'notes must be at most 2000 characters' };
  const footprintShape = String(raw.footprintShape ?? raw.footprint_shape ?? current?.footprint_shape ?? 'circle');
  if (footprintShape !== 'circle' && footprintShape !== 'square') return { error: 'footprintShape must be circle or square' };
  const sourceCanvasWidth = integerUnitNumber(
    raw.sourceCanvasWidth ?? raw.source_canvas_width,
    current ? Number(current.source_canvas_width) : 512,
    1,
    4096,
  );
  const sourceCanvasHeight = integerUnitNumber(
    raw.sourceCanvasHeight ?? raw.source_canvas_height,
    current ? Number(current.source_canvas_height) : 512,
    1,
    4096,
  );
  const sourceFootprintPx = finiteUnitNumber(
    raw.sourceFootprintPx ?? raw.source_footprint_px,
    current ? Number(current.source_footprint_px) : 150,
    1,
    4096,
  );
  const anchorX = finiteUnitNumber(raw.anchorX ?? raw.anchor_x, current ? Number(current.anchor_x) : 0.5, 0, 1);
  const anchorY = finiteUnitNumber(raw.anchorY ?? raw.anchor_y, current ? Number(current.anchor_y) : 0.80241, 0, 1);
  if (sourceCanvasWidth === null || sourceCanvasHeight === null) return { error: 'source canvas dimensions must be integers from 1-4096' };
  if (sourceFootprintPx === null) return { error: 'sourceFootprintPx must be between 1 and 4096' };
  if (anchorX === null || anchorY === null) return { error: 'anchor coordinates must be between 0 and 1' };
  return {
    value: {
      family,
      label,
      method,
      notes,
      footprintShape,
      sourceCanvasWidth,
      sourceCanvasHeight,
      sourceFootprintPx,
      anchorX,
      anchorY,
    },
  };
}

function requestExpectedRevision(req) {
  const rawBody = isObjectRecord(req.body) ? req.body : {};
  const bodyValue = rawBody.expectedRevision ?? rawBody.expected_revision;
  if (Number.isInteger(bodyValue) && bodyValue >= 0) return bodyValue;
  const rawHeader = String(req.headers['if-match'] || '').trim().replace(/^W\//, '').replace(/^"|"$/g, '');
  if (/^\d+$/.test(rawHeader)) return Number(rawHeader);
  return null;
}

function unitMutationError(code, status, details = null) {
  const error = new Error(code);
  error.unitCode = code;
  error.httpStatus = status;
  error.unitDetails = details;
  return error;
}

function sendUnitMutationError(res, error, fallbackCode) {
  if (error && error.unitCode) {
    const body = { error: error.unitCode };
    if (error.unitDetails !== null) body.details = error.unitDetails;
    res.status(error.httpStatus || 400).json(body);
    return;
  }
  dbUnavailable(res, fallbackCode.replace(/_/g, ' '), error, fallbackCode);
}

function inspectUnitPng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) {
    return { error: 'body must be a PNG image' };
  }
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return { error: 'PNG is missing its IHDR header' };
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 4096 || height > 4096) {
    return { error: 'PNG dimensions must be between 1 and 4096 pixels' };
  }
  if (buffer.length > UNIT_ASSET_MAX_BYTES) return { error: 'PNG exceeds the 10 MB limit' };
  return { width, height };
}

function unitBlobKey(sha256) {
  return `sprites/${sha256.slice(0, 2)}/${sha256}.png`;
}

function unitBlobLocalPath(blobKey) {
  return contentAddressedLocalPath(unitAssetStorageDir, blobKey, 'unit');
}

function unitStorageConfigured() {
  return Boolean(unitAssetStorageDir || unitAssetContainerUrl);
}

function azureUnitContainer() {
  if (unitAssetContainerClient) return unitAssetContainerClient;
  if (!unitAssetContainerUrl) throw new Error('UNIT_ASSET_CONTAINER_URL is not configured');
  unitAssetContainerClient = createAzureContainerClient(unitAssetContainerUrl);
  return unitAssetContainerClient;
}

async function writeUnitBlob(blobKey, buffer, sha256) {
  if (unitAssetStorageDir) {
    const target = unitBlobLocalPath(blobKey);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target)) fs.writeFileSync(target, buffer);
    return;
  }
  const block = azureUnitContainer().getBlockBlobClient(blobKey);
  try {
    await block.uploadData(buffer, {
      conditions: { ifNoneMatch: '*' },
      blobHTTPHeaders: {
        blobContentType: 'image/png',
        blobCacheControl: 'public, max-age=31536000, immutable',
      },
      metadata: { sha256 },
    });
  } catch (error) {
    const status = error && (error.statusCode || error.status);
    if (status !== 409 && status !== 412 && error.code !== 'BlobAlreadyExists') throw error;
  }
}

async function readUnitBlob(blobKey) {
  if (unitAssetStorageDir) return fs.promises.readFile(unitBlobLocalPath(blobKey));
  return azureUnitContainer().getBlobClient(blobKey).downloadToBuffer();
}

function cachedUnitSprite(sha256) {
  const entry = unitSpriteBufferCache.get(sha256);
  if (!entry) return null;
  unitSpriteBufferCache.delete(sha256);
  unitSpriteBufferCache.set(sha256, entry);
  return entry.buffer;
}

function cacheUnitSprite(sha256, buffer) {
  if (!UNIT_SPRITE_CACHE_MAX_BYTES || buffer.length > UNIT_SPRITE_CACHE_MAX_BYTES) return;
  const prior = unitSpriteBufferCache.get(sha256);
  if (prior) {
    unitSpriteBufferCacheBytes -= prior.buffer.length;
    unitSpriteBufferCache.delete(sha256);
  }
  unitSpriteBufferCache.set(sha256, { buffer });
  unitSpriteBufferCacheBytes += buffer.length;
  while (unitSpriteBufferCacheBytes > UNIT_SPRITE_CACHE_MAX_BYTES && unitSpriteBufferCache.size) {
    const oldestKey = unitSpriteBufferCache.keys().next().value;
    const oldest = unitSpriteBufferCache.get(oldestKey);
    unitSpriteBufferCache.delete(oldestKey);
    unitSpriteBufferCacheBytes -= oldest.buffer.length;
  }
}

async function seedUnitCatalogFromLiveSource() {
  if (!unitAssetStorageDir) {
    throw new Error('UNIT_ASSET_SEED_CATALOG_URL requires ephemeral UNIT_ASSET_STORAGE_DIR');
  }
  if (!serverRender || typeof serverRender.assertLiveUnitCatalog !== 'function') {
    throw new Error('board-render catalog validator is unavailable');
  }

  const catalogUrl = new URL(unitAssetSeedCatalogUrl);
  const response = await fetch(catalogUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`unit catalog seed returned ${response.status}`);
  const catalog = await response.json();
  serverRender.assertLiveUnitCatalog(catalog);

  const assetsById = new Map(catalog.assets.map((asset) => [asset.id, asset]));
  const accepted = catalog.families.map((family) => ({
    family,
    asset: assetsById.get(family.acceptedAssetId),
  }));
  const spritesBySha = new Map();
  for (const { asset } of accepted) {
    for (const palette of UNIT_PALETTE_IDS) for (const direction of UNIT_DIRECTION_IDS) {
      const sprite = asset.sprites[palette][direction];
      spritesBySha.set(sprite.sha256, sprite);
    }
  }

  const downloads = [...spritesBySha.values()];
  let cursor = 0;
  const worker = async () => {
    while (cursor < downloads.length) {
      const sprite = downloads[cursor++];
      const blobKey = unitBlobKey(sprite.sha256);
      if (fs.existsSync(unitBlobLocalPath(blobKey))) continue;
      const spriteUrl = new URL(sprite.url, catalogUrl);
      if (spriteUrl.origin !== catalogUrl.origin) throw new Error('unit catalog seed sprite changed origin');
      const spriteResponse = await fetch(spriteUrl, { signal: AbortSignal.timeout(30_000) });
      if (!spriteResponse.ok) throw new Error(`unit sprite seed returned ${spriteResponse.status}`);
      const png = Buffer.from(await spriteResponse.arrayBuffer());
      const inspected = inspectUnitPng(png);
      if (inspected.error) throw new Error(`unit sprite seed is invalid: ${inspected.error}`);
      const digest = crypto.createHash('sha256').update(png).digest('hex');
      if (digest !== sprite.sha256) throw new Error('unit sprite seed hash mismatch');
      await writeUnitBlob(blobKey, png, digest);
    }
  };
  await Promise.all(Array.from({ length: Math.min(12, downloads.length) }, () => worker()));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { family, asset } of accepted) {
      const acceptanceBlockReason = unitAssetAcceptanceBlockReason(asset, asset.acceptanceBlockReason);
      await client.query(
        `INSERT INTO unit_assets (
           id, family, label, method, notes, acceptance_block_reason, status, footprint_shape,
           source_canvas_width, source_canvas_height, source_footprint_px,
           anchor_x, anchor_y, row_revision, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, 'candidate', $7, $8, $9, $10, $11, $12, $13, 'live-catalog-seed')
         ON CONFLICT (id) DO UPDATE SET
           family = EXCLUDED.family, label = EXCLUDED.label, method = EXCLUDED.method,
           notes = EXCLUDED.notes, status = 'candidate', footprint_shape = EXCLUDED.footprint_shape,
           acceptance_block_reason = COALESCE(unit_assets.acceptance_block_reason, EXCLUDED.acceptance_block_reason),
           source_canvas_width = EXCLUDED.source_canvas_width,
           source_canvas_height = EXCLUDED.source_canvas_height,
           source_footprint_px = EXCLUDED.source_footprint_px,
           anchor_x = EXCLUDED.anchor_x, anchor_y = EXCLUDED.anchor_y,
           row_revision = EXCLUDED.row_revision, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [asset.id, asset.family, asset.label, asset.method, asset.notes, acceptanceBlockReason, asset.footprint.shape,
          asset.footprint.sourceCanvasWidth, asset.footprint.sourceCanvasHeight,
          asset.footprint.sourceFootprintPx, asset.anchor.x, asset.anchor.y, asset.rowRevision],
      );
      for (const palette of UNIT_PALETTE_IDS) for (const direction of UNIT_DIRECTION_IDS) {
        const sprite = asset.sprites[palette][direction];
        await client.query(
          `INSERT INTO unit_sprites (asset_id, palette, direction, sha256, blob_key, width, height, byte_length)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (asset_id, palette, direction) DO UPDATE SET
             sha256 = EXCLUDED.sha256, blob_key = EXCLUDED.blob_key,
             width = EXCLUDED.width, height = EXCLUDED.height,
             byte_length = EXCLUDED.byte_length, updated_at = now()`,
          [asset.id, palette, direction, sprite.sha256, unitBlobKey(sprite.sha256),
            sprite.width, sprite.height, sprite.byteLength],
        );
      }
      await client.query(
        `UPDATE unit_families SET accepted_asset_id = $2, display_scale_percent = $3,
           row_revision = $4, updated_at = now(), updated_by = 'live-catalog-seed'
         WHERE family = $1`,
        [family.family, asset.id, family.displayScalePercent, family.rowRevision],
      );
    }
    await client.query(
      'UPDATE unit_catalog_state SET revision = GREATEST(revision, $1), updated_at = now() WHERE singleton = true',
      [catalog.revision],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  invalidateUnitCatalogCache();
  console.log(`seeded ${accepted.length} live unit families into ephemeral storage`);
}

function invalidateUnitCatalogCache() {
  unitCatalogCache = { at: 0, body: null };
}

async function withUnitCatalogTransaction(fn) {
  await ensureDbReady();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    invalidateUnitCatalogCache();
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    throw error;
  } finally {
    client.release();
  }
}

async function bumpUnitCatalog(client) {
  const { rows } = await client.query(
    'UPDATE unit_catalog_state SET revision = revision + 1, updated_at = now() WHERE singleton = true RETURNING revision',
  );
  return Number(rows[0]?.revision || 0);
}

async function logUnitAssetEvent(client, family, assetIdValue, action, actorEmail, details = {}) {
  await client.query(
    `INSERT INTO unit_asset_events (family, asset_id, action, actor_email, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [family, assetIdValue, action, actorEmail, JSON.stringify(details)],
  );
}

async function dbUnitAssetRow(id, queryable = pool, lock = false) {
  const { rows } = await queryable.query(
    `SELECT id, family, label, method, notes, acceptance_block_reason, status, footprint_shape,
            source_canvas_width, source_canvas_height, source_footprint_px,
            anchor_x, anchor_y, row_revision, created_at, updated_at, updated_by
       FROM unit_assets WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0] || null;
}

function assertUnitRevision(row, expected) {
  if (expected !== null && Number(row.row_revision) !== expected) {
    throw unitMutationError('unit_asset_conflict', 409, { currentRevision: Number(row.row_revision) });
  }
}

async function dbReadUnitCatalog({ includeArchived = false, queryable = null } = {}) {
  let client = null;
  let db = queryable;
  if (!db) {
    await ensureDbReady();
    client = await pool.connect();
    db = client;
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  }
  try {
    const stateResult = await db.query(
      'SELECT revision, updated_at FROM unit_catalog_state WHERE singleton = true',
    );
    const familyResult = await db.query(
      `SELECT family, accepted_asset_id, display_scale_percent, row_revision, updated_at, updated_by
         FROM unit_families
        ORDER BY array_position($1::text[], family)`,
      [UNIT_FAMILY_IDS],
    );
    const assetResult = await db.query(
      `SELECT id, family, label, method, notes, acceptance_block_reason, status, footprint_shape,
              source_canvas_width, source_canvas_height, source_footprint_px,
              anchor_x, anchor_y, row_revision, created_at, updated_at, updated_by
         FROM unit_assets
        WHERE $1::boolean OR status <> 'archived'
        ORDER BY family, created_at DESC`,
      [includeArchived],
    );
    const spriteResult = await db.query(
      `SELECT s.asset_id, s.palette, s.direction, s.sha256, s.width, s.height, s.byte_length
         FROM unit_sprites s
         JOIN unit_assets a ON a.id = s.asset_id
        WHERE $1::boolean OR a.status <> 'archived'
        ORDER BY s.asset_id, s.palette, s.direction`,
      [includeArchived],
    );

    const acceptedIds = new Set(familyResult.rows.map((row) => row.accepted_asset_id).filter(Boolean).map(String));
    const assets = assetResult.rows.map((row) => ({
    id: String(row.id),
    family: row.family,
    label: row.label,
    method: row.method,
    notes: row.notes,
    acceptanceBlockReason: row.acceptance_block_reason,
    status: row.status,
    accepted: acceptedIds.has(String(row.id)),
    footprint: {
      shape: row.footprint_shape,
      sourceCanvasWidth: Number(row.source_canvas_width),
      sourceCanvasHeight: Number(row.source_canvas_height),
      sourceFootprintPx: Number(row.source_footprint_px),
    },
    nativeScalePercent: nativeUnitScalePercent(row.source_canvas_width, row.source_canvas_height),
    anchor: { x: Number(row.anchor_x), y: Number(row.anchor_y) },
    rowRevision: Number(row.row_revision),
    createdAt: nullableTimestampString(row.created_at),
    updatedAt: nullableTimestampString(row.updated_at),
    updatedBy: row.updated_by,
    sprites: {},
    spriteCount: 0,
    complete: false,
    }));
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    for (const row of spriteResult.rows) {
      const asset = byId.get(String(row.asset_id));
      if (!asset) continue;
      if (!asset.sprites[row.palette]) asset.sprites[row.palette] = {};
      asset.sprites[row.palette][row.direction] = {
      url: `/api/unit-sprites/${row.sha256}.png`,
      sha256: row.sha256,
      width: Number(row.width),
      height: Number(row.height),
      byteLength: Number(row.byte_length),
      };
      asset.spriteCount += 1;
    }
    for (const asset of assets) {
      asset.complete = UNIT_PALETTE_IDS.every((palette) =>
        UNIT_DIRECTION_IDS.every((direction) => Boolean(asset.sprites[palette]?.[direction])));
    }

    const body = {
      schemaVersion: UNIT_CATALOG_SCHEMA_VERSION,
      revision: Number(stateResult.rows[0]?.revision || 0),
      updatedAt: nullableTimestampString(stateResult.rows[0]?.updated_at),
      families: familyResult.rows.map((row) => ({
      family: row.family,
      acceptedAssetId: row.accepted_asset_id ? String(row.accepted_asset_id) : null,
      displayScalePercent: Number(row.display_scale_percent),
      rowRevision: Number(row.row_revision),
      updatedAt: nullableTimestampString(row.updated_at),
      updatedBy: row.updated_by,
      })),
      assets,
    };
    if (client) await client.query('COMMIT');
    return body;
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    }
    throw error;
  } finally {
    if (client) client.release();
  }
}

async function publicUnitCatalog() {
  const now = Date.now();
  if (unitCatalogCache.body && now - unitCatalogCache.at < UNIT_CATALOG_CACHE_TTL_MS) return unitCatalogCache.body;
  const body = await dbReadUnitCatalog();
  unitCatalogCache = { at: now, body };
  return body;
}

async function sendFreshUnitCatalog(res, status = 200, includeArchived = false) {
  const catalog = includeArchived ? await dbReadUnitCatalog({ includeArchived: true }) : await publicUnitCatalog();
  res.status(status).json(catalog);
}

app.get('/api/unit-catalog', async (req, res) => {
  try {
    const catalog = await publicUnitCatalog();
    const etag = `"unit-catalog-${catalog.revision}"`;
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.status(200).json(catalog);
  } catch (error) {
    dbUnavailable(res, 'unit catalog read failed', error, 'unit_catalog_unavailable');
  }
});

async function unitSpriteRecord(sha256) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT blob_key, byte_length FROM unit_sprites WHERE sha256 = $1 LIMIT 1',
    [sha256],
  );
  return rows[0] || null;
}

async function unitSpriteBytes(sha256, record = null) {
  let png = cachedUnitSprite(sha256);
  if (png) return png;
  const sprite = record || await unitSpriteRecord(sha256);
  if (!sprite) return null;
  if (!unitStorageConfigured()) throw new Error('unit asset storage is not configured');
  png = await readUnitBlob(sprite.blob_key);
  cacheUnitSprite(sha256, png);
  return png;
}

async function thumbnailDynamicSprite(src, mediaCatalog = null, privateBackgroundScope = null) {
  const value = String(src || '').split('?', 1)[0];
  const backgroundMatch = /^\/api\/background-versions\/([0-9a-f-]{36})\/content$/i.exec(value);
  if (backgroundMatch) {
    const versionId = backgroundVersionId(backgroundMatch[1]);
    const row = versionId ? await dbAnyBackgroundVersionRow(versionId) : null;
    const publiclyReadable = row?.status === 'published';
    const privatelyReadable = row?.status === 'ready'
      && privateBackgroundScope
      && row.owner_email === privateBackgroundScope.ownerEmail
      && row.level_id === privateBackgroundScope.levelId
      && privateBackgroundScope.allowedVersionIds.has(String(row.id));
    if ((!publiclyReadable && !privatelyReadable) || !row.blob_sha256 || !row.blob_key) return null;
    return mediaBytesBySha(
      row.blob_sha256,
      { ...row, sha256: row.blob_sha256 },
      { publicOnly: publiclyReadable },
    );
  }
  const unitMatch = /^\/api\/unit-sprites\/([0-9a-f]{64})\.png$/.exec(value);
  if (unitMatch) return unitSpriteBytes(unitMatch[1]);
  const immutableMatch = /^\/api\/media\/([0-9a-f]{64})$/.exec(value);
  if (immutableMatch) {
    const snapshotAllows = mediaCatalog
      ? mediaCatalog.slots.some((slot) => slot.media?.sha256 === immutableMatch[1])
      : Boolean(await mediaBlobRecord(immutableMatch[1], { publicOnly: true }));
    if (!snapshotAllows) return null;
    const record = await mediaBlobRecord(immutableMatch[1]);
    return record ? mediaBytesBySha(immutableMatch[1], record) : null;
  }
  if (value.startsWith('/assets/') && !value.startsWith('/assets/level-thumb/')) {
    let slot = null;
    try {
      slot = mediaSlotId(value.slice('/assets/'.length).split('/').map(decodeURIComponent).join('/'));
    } catch { slot = null; }
    if (!slot) return null;
    const resolved = await resolveMediaSlotBytes(slot, mediaCatalog);
    return resolved ? resolved.buffer : null;
  }
  return null;
}

app.get(/^\/api\/unit-sprites\/([0-9a-f]{64})\.png$/, async (req, res) => {
  const sha256 = String(req.params[0] || '').toLowerCase();
  if (!UNIT_SPRITE_SHA_PATTERN.test(sha256)) { res.status(404).send('not found'); return; }
  try {
    const record = await unitSpriteRecord(sha256);
    if (!record) { res.status(404).send('not found'); return; }
    const etag = `"${sha256}"`;
    if (req.headers['if-none-match'] === etag) {
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.status(304).end();
      return;
    }
    const png = await unitSpriteBytes(sha256, record);
    if (!png) { res.status(404).send('not found'); return; }
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', String(png.length));
    res.status(200).end(png);
  } catch (error) {
    console.error('unit sprite read failed:', error && error.message);
    res.status(503).json({ error: 'unit_sprite_unavailable' });
  }
});

app.get('/api/admin/unit-assets', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  try {
    await sendFreshUnitCatalog(res, 200, true);
  } catch (error) {
    dbUnavailable(res, 'unit catalog admin read failed', error, 'unit_catalog_unavailable');
  }
});

app.post('/api/admin/unit-assets', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const validated = validateUnitAssetInput(isObjectRecord(req.body) ? req.body : {});
  if (validated.error) { res.status(400).json({ error: 'invalid_unit_asset', details: validated.error }); return; }
  const id = crypto.randomUUID();
  const asset = validated.value;
  try {
    const acceptanceBlockReason = unitAssetAcceptanceBlockReason(asset);
    await withUnitCatalogTransaction(async (client) => {
      await client.query(
        `INSERT INTO unit_assets (
           id, family, label, method, notes, acceptance_block_reason, footprint_shape, source_canvas_width,
           source_canvas_height, source_footprint_px, anchor_x, anchor_y, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [id, asset.family, asset.label, asset.method, asset.notes, acceptanceBlockReason, asset.footprintShape,
          asset.sourceCanvasWidth, asset.sourceCanvasHeight, asset.sourceFootprintPx,
          asset.anchorX, asset.anchorY, user.email],
      );
      await logUnitAssetEvent(client, asset.family, id, 'created', user.email, { acceptanceBlockReason });
      await bumpUnitCatalog(client);
    });
    res.setHeader('Location', `/api/admin/unit-assets/${id}`);
    const catalog = await dbReadUnitCatalog({ includeArchived: true });
    res.status(201).json({ assetId: id, catalog });
  } catch (error) {
    sendUnitMutationError(res, error, 'unit_asset_create_failed');
  }
});

app.patch('/api/admin/unit-assets/:id', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const id = unitAssetId(req.params.id);
  if (!id) { res.status(400).json({ error: 'invalid_unit_asset_id' }); return; }
  const expected = requestExpectedRevision(req);
  try {
    await withUnitCatalogTransaction(async (client) => {
      const current = await dbUnitAssetRow(id, client, true);
      if (!current) throw unitMutationError('unit_asset_not_found', 404);
      assertUnitRevision(current, expected);
      const validated = validateUnitAssetInput(isObjectRecord(req.body) ? req.body : {}, current);
      if (validated.error) throw unitMutationError('invalid_unit_asset', 400, validated.error);
      const asset = validated.value;
      const acceptanceBlockReason = unitAssetAcceptanceBlockReason(asset, current.acceptance_block_reason);
      await client.query(
        `UPDATE unit_assets SET
           label = $2, method = $3, notes = $4, acceptance_block_reason = $5, footprint_shape = $6,
           source_canvas_width = $7, source_canvas_height = $8,
           source_footprint_px = $9, anchor_x = $10, anchor_y = $11,
           row_revision = row_revision + 1, updated_at = now(), updated_by = $12
         WHERE id = $1`,
        [id, asset.label, asset.method, asset.notes, acceptanceBlockReason, asset.footprintShape,
          asset.sourceCanvasWidth, asset.sourceCanvasHeight, asset.sourceFootprintPx,
          asset.anchorX, asset.anchorY, user.email],
      );
      await logUnitAssetEvent(client, current.family, id, 'metadata-updated', user.email, { acceptanceBlockReason });
      await bumpUnitCatalog(client);
    });
    const catalog = await dbReadUnitCatalog({ includeArchived: true });
    res.status(200).json({ assetId: id, catalog });
  } catch (error) {
    sendUnitMutationError(res, error, 'unit_asset_update_failed');
  }
});

app.put('/api/admin/unit-assets/:id/sprites/:palette/:direction', async (req, res) => {
  const user = req.rawUploadAdmin || await requireAdmin(req, res);
  if (!user) return;
  const id = unitAssetId(req.params.id);
  const palette = unitPaletteId(req.params.palette);
  const direction = unitDirectionId(req.params.direction);
  if (!id || !palette || !direction) { res.status(400).json({ error: 'invalid_unit_sprite_address' }); return; }
  if (!unitStorageConfigured()) { res.status(503).json({ error: 'unit_asset_storage_unavailable' }); return; }
  const inspected = inspectUnitPng(req.body);
  if (inspected.error) { res.status(400).json({ error: 'invalid_unit_sprite', details: inspected.error }); return; }
  const expected = requestExpectedRevision(req);
  try {
    await ensureDbReady();
    const before = await dbUnitAssetRow(id);
    if (!before) throw unitMutationError('unit_asset_not_found', 404);
    assertUnitRevision(before, expected);
    if (inspected.width !== Number(before.source_canvas_width) || inspected.height !== Number(before.source_canvas_height)) {
      throw unitMutationError('unit_sprite_canvas_mismatch', 400, {
        expected: { width: Number(before.source_canvas_width), height: Number(before.source_canvas_height) },
        actual: { width: inspected.width, height: inspected.height },
      });
    }
    const familyRow = await pool.query('SELECT accepted_asset_id FROM unit_families WHERE family = $1', [before.family]);
    if (String(familyRow.rows[0]?.accepted_asset_id || '') === id) {
      throw unitMutationError('accepted_unit_asset_locked', 409, 'Create a candidate before replacing accepted sprite frames.');
    }
    const sha256 = crypto.createHash('sha256').update(req.body).digest('hex');
    const blobKey = unitBlobKey(sha256);
    await writeUnitBlob(blobKey, req.body, sha256);
    const result = await withUnitCatalogTransaction(async (client) => {
      const current = await dbUnitAssetRow(id, client, true);
      if (!current) throw unitMutationError('unit_asset_not_found', 404);
      assertUnitRevision(current, expected);
      if (current.status === 'archived') throw unitMutationError('unit_asset_archived', 409);
      const lockedFamily = await client.query(
        'SELECT accepted_asset_id FROM unit_families WHERE family = $1 FOR UPDATE',
        [current.family],
      );
      if (String(lockedFamily.rows[0]?.accepted_asset_id || '') === id) {
        throw unitMutationError('accepted_unit_asset_locked', 409, 'Create a candidate before replacing accepted sprite frames.');
      }
      await client.query(
        `INSERT INTO unit_sprites (asset_id, palette, direction, sha256, blob_key, width, height, byte_length)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (asset_id, palette, direction) DO UPDATE SET
           sha256 = EXCLUDED.sha256, blob_key = EXCLUDED.blob_key,
           width = EXCLUDED.width, height = EXCLUDED.height,
           byte_length = EXCLUDED.byte_length, updated_at = now()`,
        [id, palette, direction, sha256, blobKey, inspected.width, inspected.height, req.body.length],
      );
      const updated = await client.query(
        `UPDATE unit_assets SET row_revision = row_revision + 1, updated_at = now(), updated_by = $2
          WHERE id = $1 RETURNING row_revision`,
        [id, user.email],
      );
      await logUnitAssetEvent(client, current.family, id, 'sprite-uploaded', user.email, { palette, direction, sha256 });
      const catalogRevision = await bumpUnitCatalog(client);
      return { rowRevision: Number(updated.rows[0].row_revision), catalogRevision };
    });
    res.status(200).json({
      assetId: id,
      palette,
      direction,
      rowRevision: result.rowRevision,
      catalogRevision: result.catalogRevision,
      sprite: { url: `/api/unit-sprites/${sha256}.png`, sha256, width: inspected.width, height: inspected.height, byteLength: req.body.length },
    });
  } catch (error) {
    sendUnitMutationError(res, error, 'unit_sprite_upload_failed');
  }
});

app.patch('/api/admin/unit-families/:family', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const family = unitFamilyId(req.params.family);
  if (!family) { res.status(400).json({ error: 'invalid_unit_family' }); return; }
  const raw = isObjectRecord(req.body) ? req.body : {};
  const scale = integerUnitNumber(raw.displayScalePercent ?? raw.display_scale_percent, null, 60, 140);
  if (scale === null) { res.status(400).json({ error: 'invalid_unit_scale', details: 'displayScalePercent must be an integer from 60-140' }); return; }
  const expected = requestExpectedRevision(req);
  try {
    await withUnitCatalogTransaction(async (client) => {
      const { rows } = await client.query('SELECT row_revision FROM unit_families WHERE family = $1 FOR UPDATE', [family]);
      if (!rows[0]) throw unitMutationError('unit_family_not_found', 404);
      if (expected !== null && Number(rows[0].row_revision) !== expected) {
        throw unitMutationError('unit_family_conflict', 409, { currentRevision: Number(rows[0].row_revision) });
      }
      await client.query(
        `UPDATE unit_families SET display_scale_percent = $2, row_revision = row_revision + 1,
           updated_at = now(), updated_by = $3 WHERE family = $1`,
        [family, scale, user.email],
      );
      await logUnitAssetEvent(client, family, null, 'display-scale-published', user.email, { displayScalePercent: scale });
      await bumpUnitCatalog(client);
    });
    const catalog = await dbReadUnitCatalog({ includeArchived: true });
    res.status(200).json({ family, catalog });
  } catch (error) {
    sendUnitMutationError(res, error, 'unit_family_update_failed');
  }
});

app.post('/api/admin/unit-assets/:id/accept', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const id = unitAssetId(req.params.id);
  if (!id) { res.status(400).json({ error: 'invalid_unit_asset_id' }); return; }
  const expected = requestExpectedRevision(req);
  try {
    await withUnitCatalogTransaction(async (client) => {
      const asset = await dbUnitAssetRow(id, client, true);
      if (!asset) throw unitMutationError('unit_asset_not_found', 404);
      assertUnitRevision(asset, expected);
      if (asset.acceptance_block_reason) {
        throw unitMutationError('unit_asset_calibration_only', 409, {
          reason: asset.acceptance_block_reason,
          adr: 'ADR-0076',
        });
      }
      const { rows: spriteRows } = await client.query(
        'SELECT palette, direction FROM unit_sprites WHERE asset_id = $1',
        [id],
      );
      const present = new Set(spriteRows.map((row) => `${row.palette}/${row.direction}`));
      const missing = [];
      for (const palette of UNIT_PALETTE_IDS) for (const direction of UNIT_DIRECTION_IDS) {
        if (!present.has(`${palette}/${direction}`)) missing.push(`${palette}/${direction}`);
      }
      if (missing.length) throw unitMutationError('unit_asset_incomplete', 409, { missing });
      const familyResult = await client.query(
        'SELECT accepted_asset_id, row_revision FROM unit_families WHERE family = $1 FOR UPDATE',
        [asset.family],
      );
      const nativeScalePercent = nativeUnitScalePercent(asset.source_canvas_width, asset.source_canvas_height);
      const previousId = familyResult.rows[0]?.accepted_asset_id ? String(familyResult.rows[0].accepted_asset_id) : null;
      if (previousId && previousId !== id) {
        await client.query(
          `UPDATE unit_assets SET status = 'archived', row_revision = row_revision + 1,
             updated_at = now(), updated_by = $2 WHERE id = $1`,
          [previousId, user.email],
        );
      }
      await client.query(
        `UPDATE unit_assets SET status = 'candidate', row_revision = row_revision + 1,
           updated_at = now(), updated_by = $2 WHERE id = $1`,
        [id, user.email],
      );
      await client.query(
        `UPDATE unit_families SET accepted_asset_id = $2, display_scale_percent = $3,
           row_revision = row_revision + 1, updated_at = now(), updated_by = $4 WHERE family = $1`,
        [asset.family, id, nativeScalePercent, user.email],
      );
      await logUnitAssetEvent(client, asset.family, id, 'accepted', user.email, {
        previousAssetId: previousId,
        displayScalePercent: nativeScalePercent,
      });
      await bumpUnitCatalog(client);
    });
    const catalog = await dbReadUnitCatalog({ includeArchived: true });
    res.status(200).json({ assetId: id, catalog });
  } catch (error) {
    sendUnitMutationError(res, error, 'unit_asset_accept_failed');
  }
});

app.post('/api/admin/unit-assets/:id/archive', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const id = unitAssetId(req.params.id);
  if (!id) { res.status(400).json({ error: 'invalid_unit_asset_id' }); return; }
  const expected = requestExpectedRevision(req);
  try {
    await withUnitCatalogTransaction(async (client) => {
      const asset = await dbUnitAssetRow(id, client, true);
      if (!asset) throw unitMutationError('unit_asset_not_found', 404);
      assertUnitRevision(asset, expected);
      const familyResult = await client.query('SELECT accepted_asset_id FROM unit_families WHERE family = $1 FOR UPDATE', [asset.family]);
      if (String(familyResult.rows[0]?.accepted_asset_id || '') === id) {
        throw unitMutationError('accepted_unit_asset_cannot_archive', 409, 'Accept another candidate first.');
      }
      await client.query(
        `UPDATE unit_assets SET status = 'archived', row_revision = row_revision + 1,
           updated_at = now(), updated_by = $2 WHERE id = $1`,
        [id, user.email],
      );
      await logUnitAssetEvent(client, asset.family, id, 'archived', user.email);
      await bumpUnitCatalog(client);
    });
    const catalog = await dbReadUnitCatalog({ includeArchived: true });
    res.status(200).json({ assetId: id, catalog });
  } catch (error) {
    sendUnitMutationError(res, error, 'unit_asset_archive_failed');
  }
});

// Global shipped per-level AI weights (ship-to-everyone). Public GET returns the whole
// map (every player's live AI reads it before falling back to DEFAULT weights);
// admin-gated PUT sets one level's vector, or clears it with { weights: null }. A
// player's PERSONAL adopted override (opening_books blob) still wins over this.
const AI_WEIGHTS_LEN = 14; // 6 piece values + 8 term weights (encodeWeights order)
function validAiWeightsVec(v) {
  return Array.isArray(v) && v.length === AI_WEIGHTS_LEN && v.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);
}

app.get('/api/ai-weights', async (_req, res) => {
  try { res.status(200).json({ weights: await dbGetAllAiWeights() }); }
  catch (error) { dbUnavailable(res, 'ai weights read failed', error, 'ai_weights_unavailable'); }
});

app.put('/api/ai-weights/:levelId', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const levelId = String(req.params.levelId || '').trim();
  if (!levelId || levelId.length > 256) { res.status(400).json({ error: 'invalid_level_id' }); return; }
  const raw = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    if (raw.weights === null) { await dbDeleteAiWeights(levelId); res.status(200).json({ ok: true, cleared: true }); return; }
    if (!validAiWeightsVec(raw.weights)) { res.status(400).json({ error: 'invalid_ai_weights', details: `weights must be ${AI_WEIGHTS_LEN} finite non-negative numbers` }); return; }
    await dbUpsertAiWeights(levelId, raw.weights, user.email);
    res.status(200).json({ ok: true });
  } catch (error) { dbUnavailable(res, 'ai weights write failed', error, 'ai_weights_unavailable'); }
});

// --- Shareable public maps -------------------------------------------------
// A user's map lives in their per-owner workspace blob keyed by a per-owner l<n> id, so it has no
// global name a signed-out crawler/visitor could resolve. Publishing mints a stable, owner-free
// public_id and snapshots the level into public_maps, which the UNAUTH GET /api/maps/:id and the OG
// thumbnail path read. Officials keep their global off-* ids and are unaffected.
const PUBLIC_ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // no 0/o/1/l ambiguity
const PUBLIC_ID_RE = new RegExp(`^[${PUBLIC_ID_ALPHABET}]{8,24}$`);
function newPublicId() {
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (const b of bytes) out += PUBLIC_ID_ALPHABET[b % 32];
  return out;
}
async function dbEnsurePublicId(ownerEmail, levelId, level, contentHash, queryable = pool) {
  await ensureDbReady();
  const name = level && typeof level.name === 'string' ? level.name : null;
  const bodyJson = JSON.stringify(level);
  const existing = await queryable.query(
    'SELECT public_id FROM public_maps WHERE owner_email = $1 AND level_id = $2', [ownerEmail, levelId],
  );
  if (existing.rows[0]) {
    const id = existing.rows[0].public_id;
    await queryable.query(
      'UPDATE public_maps SET name = $2, content_hash = $3, body = $4::jsonb, updated_at = now() WHERE public_id = $1',
      [id, name, contentHash, bodyJson],
    );
    return id;
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = newPublicId();
    try {
      await queryable.query(
        'INSERT INTO public_maps (public_id, owner_email, level_id, name, content_hash, body) VALUES ($1,$2,$3,$4,$5,$6::jsonb)',
        [id, ownerEmail, levelId, name, contentHash, bodyJson],
      );
      return id;
    } catch (error) {
      if (error && error.code === '23505') continue; // PK collision — retry with a fresh id
      throw error;
    }
  }
  throw new Error('public_id_allocation_failed');
}

async function dbPublishPublicMap(owner, levelId) {
  return withEditorDocumentTransaction(async (client) => {
    // Keep the same lock order as editor Save: working copy, canonical
    // workspace, then selected immutable versions. That makes the snapshot and
    // its public media transition one transaction without a Save/publish
    // deadlock.
    const document = await dbGetEditorDocumentByLevel(
      owner.email,
      { kind: 'user', id: 'campaign' },
      levelId,
      client,
      { lock: true },
    );
    const workspaceResult = await client.query(
      'SELECT body FROM campaign_workspaces WHERE owner_email = $1 FOR UPDATE',
      [owner.email],
    );
    const workspaceBody = isObjectRecord(workspaceResult.rows[0]?.body)
      ? workspaceResult.rows[0].body
      : null;
    const levels = workspaceBody && isObjectRecord(workspaceBody.levels)
      ? workspaceBody.levels
      : null;
    const storedLevel = levels && isObjectRecord(levels[levelId]) ? levels[levelId] : null;
    if (!storedLevel) throw editorDocumentError(404, 'level_not_found');
    const level = { ...storedLevel, id: levelId };
    await withThumbnailRenderInputs(async () => {
      const surface = decodedVersionedPredrawnSurface(level, { activeOnly: true });
      if (surface) {
        if (!document) {
          throw editorDocumentError(
            409,
            'predrawn_background_document_not_found',
            null,
            'the public map selection is not backed by an editor document',
          );
        }
        await dbPublishLevelBackgroundVersions(
          client,
          document,
          level,
          owner.email,
          owner.name,
          { makePublic: true },
        );
      }
    }, client);
    let contentHash = null;
    try {
      contentHash = serverRender && await withThumbnailRenderInputs((renderInputs) => (
        thumbnailVersion(serverRender.levelRenderPlan(level), renderInputs)
      ), client);
    } catch { contentHash = null; }
    const publicId = await dbEnsurePublicId(
      owner.email,
      levelId,
      level,
      contentHash,
      client,
    );
    return { publicId, level };
  });
}
async function dbGetPublicMap(publicId) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT public_id, owner_email, level_id, name, content_hash, body FROM public_maps WHERE public_id = $1',
    [publicId],
  );
  return rows[0] || null;
}

// POST /api/maps/publish { levelId } -> { public_id, url }. Mints/refreshes the shareable id for one
// of the CALLER's own maps (verified against their workspace blob). Copy-link data source — no
// rendering here; the thumbnail is produced on demand at crawl time.
app.post('/api/maps/publish', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const levelId = req.body && typeof req.body.levelId === 'string' ? req.body.levelId : '';
  if (!levelId) { res.status(400).json({ error: 'invalid_level_id' }); return; }
  try {
    const owner = await withDisplayName(user);
    const published = await dbPublishPublicMap(owner, levelId);
    res.status(200).json({
      public_id: published.publicId,
      url: `${publicOrigin}/play?map=${published.publicId}`,
    });
  } catch (error) {
    if (error?.statusCode && error?.responseCode) {
      respondEditorDocumentError(res, error, 'map publish');
      return;
    }
    dbUnavailable(res, 'map publish failed', error, 'map_store_unavailable');
  }
});
// GET /api/maps/:publicId — PUBLIC: the level snapshot for a shared map, so a signed-out visitor can
// play it and the SPA can hydrate it. Officials are served by their own tier, not here.
app.get('/api/maps/:publicId', async (req, res) => {
  const publicId = String(req.params.publicId || '');
  if (!PUBLIC_ID_RE.test(publicId)) { res.status(400).json({ error: 'invalid_map_id' }); return; }
  try {
    const row = await dbGetPublicMap(publicId);
    if (!row) { res.status(404).json({ error: 'map_not_found' }); return; }
    res.status(200).json({ public_id: row.public_id, level: row.body });
  } catch (error) {
    dbUnavailable(res, 'map read failed', error, 'map_store_unavailable');
  }
});

// --- Account-scoped campaign progress --------------------------------------
// Per-owner cleared/stars, mirroring the workspace-blob pattern. localStorage stays the offline/guest
// source of truth on the client; this is the durable cross-device copy that a monotonic merge folds
// guest progress into on sign-in. Body: { "<levelId>": { completed: bool, stars: 0..3 } }.
function sanitizeProgress(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [levelId, v] of Object.entries(raw)) {
    if (typeof levelId !== 'string' || !levelId || levelId.length > 128) continue;
    if (!v || typeof v !== 'object') continue;
    const stars = Number(v.stars);
    out[levelId] = {
      completed: Boolean(v.completed),
      stars: Number.isFinite(stars) ? Math.max(0, Math.min(3, Math.round(stars))) : 0,
    };
  }
  return out;
}
async function dbGetProgress(ownerEmail) {
  await ensureDbReady();
  const { rows } = await pool.query('SELECT body FROM campaign_progress WHERE owner_email = $1', [ownerEmail]);
  return rows[0] ? rows[0].body : null;
}
async function dbPutProgress(ownerEmail, body) {
  await ensureDbReady();
  await pool.query(
    `INSERT INTO campaign_progress (owner_email, body) VALUES ($1, $2::jsonb)
     ON CONFLICT (owner_email) DO UPDATE SET body = EXCLUDED.body, updated_at = now()`,
    [ownerEmail, JSON.stringify(body)],
  );
}
app.get('/api/campaign-progress', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    res.status(200).json({ progress: sanitizeProgress(await dbGetProgress(user.email)) });
  } catch (error) {
    dbUnavailable(res, 'progress read failed', error, 'progress_store_unavailable');
  }
});
app.put('/api/campaign-progress', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const progress = sanitizeProgress(req.body && req.body.progress);
  try {
    await dbPutProgress(user.email, progress);
    res.status(200).json({ ok: true, progress });
  } catch (error) {
    dbUnavailable(res, 'progress write failed', error, 'progress_store_unavailable');
  }
});

// --- Account-scoped Ataraxia progression ---------------------------------
// Unlocks are monotonic and separate from the active Run, which is deleted when
// finished or abandoned. Browser progression remains the offline/guest authority.
function sanitizeRunProgression(raw) {
  const tier = Number(raw && raw.highestCompletedAtaraxiaTier);
  return {
    formatVersion: 1,
    highestCompletedAtaraxiaTier: Number.isSafeInteger(tier)
      ? Math.max(-1, Math.min(100, tier))
      : -1,
  };
}

app.get('/api/run-progression', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    await ensureDbReady();
    const { rows } = await pool.query(
      'SELECT highest_completed_ataraxia_tier FROM run_progression WHERE owner_email = $1',
      [user.email],
    );
    res.status(200).json({
      progression: sanitizeRunProgression({
        highestCompletedAtaraxiaTier: rows[0]?.highest_completed_ataraxia_tier ?? -1,
      }),
    });
  } catch (error) {
    dbUnavailable(res, 'Run progression read failed', error, 'run_progression_store_unavailable');
  }
});

app.put('/api/run-progression', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const progression = sanitizeRunProgression(req.body && req.body.progression);
  try {
    await ensureDbReady();
    const { rows } = await pool.query(
      `INSERT INTO run_progression (owner_email, highest_completed_ataraxia_tier)
       VALUES ($1, $2)
       ON CONFLICT (owner_email) DO UPDATE
         SET highest_completed_ataraxia_tier = GREATEST(
               run_progression.highest_completed_ataraxia_tier,
               EXCLUDED.highest_completed_ataraxia_tier
             ),
             updated_at = now()
       RETURNING highest_completed_ataraxia_tier`,
      [user.email, progression.highestCompletedAtaraxiaTier],
    );
    res.status(200).json({
      ok: true,
      progression: sanitizeRunProgression({
        highestCompletedAtaraxiaTier: rows[0].highest_completed_ataraxia_tier,
      }),
    });
  } catch (error) {
    dbUnavailable(res, 'Run progression write failed', error, 'run_progression_store_unavailable');
  }
});

// --- Account-scoped active Run (ADR-0193) ---------------------------------
// Anonymous Runs stay in browser storage. Once signed in, the client adopts that
// document here; the server owns one CAS-updated active Run per account.
const ACTIVE_RUN_PHASES = new Set(['aftermath', 'bona-vacantia', 'deployment', 'battle', 'sectio', 'victory']);
const ACTIVE_RUN_PIECES = new Set(['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']);
const ACTIVE_RUN_UNIT_SOURCES = new Set(['king', 'starting', 'adlectio']);
const ACTIVE_RUN_PIECE_VALUES = Object.freeze({ pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 });
const ACTIVE_RUN_ABILITIES = new Set(['adlected', 'eutactic', 'agminate']);
const ACTIVE_RUN_MODIFIERS = new Set(['cacochymic']);
const ACTIVE_RUN_CACOCHYMIC_DISCOUNTS = Object.freeze({ pawn: 0, knight: 1, bishop: 1, rook: 2, queen: 3 });
const ACTIVE_RUN_SECTIO_FIELDS = new Set([
  'kind',
  'afterBattleIndex',
  'conflictIndex',
  'victoryGoldTenths',
  'cardOffers',
  'adlectedCardOfferIds',
  'paidLipsanonOffer',
  'paidLipsanonBought',
  'alienatedUnits',
  'expunctedCard',
  'entrySnapshot',
]);
const ACTIVE_RUN_VACANTIA_FIELDS = new Set([
  'kind',
  'conflictIndex',
  'afterBattleIndex',
  'victoryGoldTenths',
  'offers',
]);
const ACTIVE_RUN_AFTERMATH_FIELDS = new Set([
  'battleIndex',
  'turns',
  'elapsedMs',
  'goldTenths',
  'bonusGoldTenths',
  'survivingUnitIds',
  'fallenUnits',
]);
const ACTIVE_RUN_DEPLOYMENT_FIELDS = new Set([
  'battleIndex',
  'seed',
  'dealtCardIds',
  'deployingUnitIds',
  'unavailableUnitIds',
  'capacityResolved',
  'placements',
  'activeCardIndex',
  'unitCursor',
  'discardCursor',
  'revealedCardIds',
  'settlingUnitIds',
  'transport',
  'stage',
  'blockedUnitIds',
  'manualPlacements',
  'temporaryAdlectedUnitId',
]);
const ACTIVE_RUN_SAVE_VERSION = serverRender?.CURRENT_RUN_SAVE_VERSION;
const RUN_LIPSANA = Array.isArray(serverRender?.RUN_LIPSANA) ? serverRender.RUN_LIPSANA : [];
const LIPSANON_BY_ID = serverRender?.LIPSANON_BY_ID ?? {};
const RUN_LIPSANON_IDS = new Set(RUN_LIPSANA.map((lipsanon) => lipsanon.id));
/**
 * Gold the Run's held lipsana paid the moment they were taken. Read from the model's own
 * table (RUN_LIPSANON_IMMEDIATE_GOLD) rather than restated here, so the opening Sectio's pinned
 * gold check stays exact when a lipsanon's payout changes.
 */
function openingLipsanonGoldTenths(run) {
  if (!Array.isArray(run.lipsana)) return 0;
  if (typeof serverRender?.lipsanonImmediateGoldTenths === 'function') {
    return serverRender.lipsanonImmediateGoldTenths(run.lipsana);
  }
  const table = serverRender?.RUN_LIPSANON_IMMEDIATE_GOLD ?? {};
  return run.lipsana.reduce((total, lipsanon) => total + (table[lipsanon] ?? 0) * 10, 0);
}

function validateActiveRunBody(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) return 'run must be an object';
  if (run.runSaveVersion !== ACTIVE_RUN_SAVE_VERSION) return 'run.runSaveVersion is unsupported';
  if ('formatVersion' in run) return 'run contains the retired formatVersion field';
  if ('shop' in run) return 'run contains retired Shop state';
  if (typeof run.id !== 'string' || !run.id || run.id.length > 160) return 'run.id is invalid';
  if (!isFiniteInteger(run.seed) || run.seed < 0 || run.seed > 0xffffffff) return 'run.seed is invalid';
  if (run.ataraxiaTier !== 0 && run.ataraxiaTier !== 1) return 'run.ataraxiaTier is invalid';
  if (typeof run.updatedAt !== 'string' || !run.updatedAt) return 'run.updatedAt is required';
  if (!ACTIVE_RUN_PHASES.has(run.phase)) return 'run.phase is invalid';
  if ('draftOffers' in run || 'chosenDraftId' in run) return 'run contains retired draft state';
  if (!isFiniteInteger(run.battleIndex) || run.battleIndex < 0) return 'run.battleIndex is invalid';
  if (!isFiniteInteger(run.conflictIndex) || run.conflictIndex < 0) return 'run.conflictIndex is invalid';
  if (typeof run.goldTenths !== 'number' || !Number.isFinite(run.goldTenths) || run.goldTenths < 0) return 'run.goldTenths is invalid';
  if (!run.war || typeof run.war !== 'object' || Array.isArray(run.war)) return 'run.war is required';
  if (typeof run.war.id !== 'string' || !run.war.id || typeof run.war.name !== 'string' || typeof run.war.description !== 'string') {
    return 'run.war identity is invalid';
  }
  if (!Array.isArray(run.war.battles) || run.war.battles.length < 1 || run.war.battles.length > 100) {
    return 'run.war.battles is invalid';
  }
  for (const [index, battle] of run.war.battles.entries()) {
    if (!battle || typeof battle !== 'object' || typeof battle.loot !== 'boolean') return `run.war.battles.${index} is invalid`;
    const level = battle.level;
    const levelError = validateWorkspaceLevel(level, level && level.id);
    if (levelError) return `run.war.battles.${index}: ${levelError}`;
  }
  if (run.battleIndex >= run.war.battles.length) return 'run.battleIndex is outside the War';
  if (!Array.isArray(run.army) || run.army.length < 1 || run.army.length > 200) return 'run.army is invalid';
  const unitIds = new Set();
  for (const unit of run.army) {
    if (!unit || typeof unit.id !== 'string' || !unit.id || unitIds.has(unit.id) || !ACTIVE_RUN_PIECES.has(unit.type)) {
      return 'run.army contains an invalid unit';
    }
    if (!ACTIVE_RUN_UNIT_SOURCES.has(unit.source)) {
      return 'run.army contains an invalid source';
    }
    unitIds.add(unit.id);
    const validName = typeof unit.name === 'string' && unit.name.trim().length > 0 && unit.name.length <= 80;
    if (!validName) {
      return 'run.army contains an invalid unit name';
    }
    if (
      !Array.isArray(unit.abilities)
      || new Set(unit.abilities).size !== unit.abilities.length
      || unit.abilities.some((ability) => !ACTIVE_RUN_ABILITIES.has(ability))
      || unit.abilities.length > 1
    ) {
      return 'run.army contains invalid abilities';
    }
    if (!Array.isArray(unit.modifiers) || unit.modifiers.some((modifier) => !ACTIVE_RUN_MODIFIERS.has(modifier))) {
      return 'run.army contains invalid modifiers';
    }
    if (unit.number !== undefined && (!isFiniteInteger(unit.number) || unit.number < 1)) {
      return 'run.army contains an invalid unit number';
    }
    if (!isFiniteInteger(unit.inspectionSeed) || unit.inspectionSeed < 0 || unit.inspectionSeed > 0xffffffff) {
      return 'run.army contains an invalid inspection seed';
    }
  }
  if (
    run.army.filter((unit) => unit.id === 'run-king' && unit.type === 'king').length !== 1
    || run.army.filter((unit) => unit.type === 'king').length !== 1
  ) return 'run.army must retain its one King';
  {
    if (!Array.isArray(run.cards) || run.cards.length > 200) return 'run.cards is invalid';
    const cardIds = new Set();
    const cardUnitIds = new Set();
    const lostCardUnitIds = new Set();
    const cacochymicTargetUnitIds = new Set();
    const unitIdsForCard = (card) => card.unitSeats.filter((unitId) => typeof unitId === 'string');
    for (const card of run.cards) {
      if (!isObjectRecord(card)) return 'run.cards contains an invalid card';
      const cardTypeValid = card.cardType === null
        || card.cardType === 'pestiferous'
        || card.cardType === 'concinnous'
        || card.cardType === 'legatine'
        || card.cardType === 'hieratic';
      const directEffectTarget = card.effectTargetUnitId;
      const effectTarget = directEffectTarget;
      const attachedUnitIds = Array.isArray(card.unitSeats) ? unitIdsForCard(card) : [];
      const affectedCard = card.cardType === 'concinnous'
        || card.cardType === 'legatine'
        || card.cardType === 'hieratic';
      // Each acquisition qualifier grants exactly one ability to its recorded target unit.
      const expectedGrantedAbility = card.cardType === 'legatine'
        ? 'adlected'
        : card.cardType === 'hieratic'
          ? 'agminate'
          : 'eutactic';
      const effectTargetValid = affectedCard
        ? directEffectTarget === null
          || (typeof effectTarget === 'string'
            && effectTarget.length > 0
            && effectTarget.length <= 160
            && attachedUnitIds.includes(effectTarget))
        : directEffectTarget === null;
      if (
        typeof card.id !== 'string'
        || !card.id
        || card.id.length > 160
        || cardIds.has(card.id)
        || typeof card.coreId !== 'string'
        || !card.coreId
        || card.coreId.length > 160
        || !cardTypeValid
        || !effectTargetValid
        || !isFiniteInteger(card.effectSeed)
        || card.effectSeed < 0
        || card.effectSeed > 0xffffffff
        || !Array.isArray(card.unitSeats)
        || card.unitSeats.length > 200
        || card.unitSeats.some((unitId) => unitId !== null && typeof unitId !== 'string')
        || !Array.isArray(card.lostUnitIds)
        || card.lostUnitIds.length > 200
        || !isFiniteInteger(card.acquiredAfterBattleIndex)
        || card.acquiredAfterBattleIndex < 0
        || card.acquiredAfterBattleIndex >= run.war.battles.length
      ) return 'run.cards contains an invalid card';
      if (affectedCard && effectTarget !== null) {
        const targetUnit = run.army.find((unit) => unit.id === effectTarget);
        if (!targetUnit?.abilities.includes(expectedGrantedAbility)) return 'run.cards contains an invalid ability target';
      }
      {
        const validPlaguedTarget = card.cardType === 'pestiferous'
          ? attachedUnitIds.length > 0
            ? typeof card.cacochymicUnitId === 'string' && attachedUnitIds.includes(card.cacochymicUnitId)
            : card.cacochymicUnitId === null
          : card.cacochymicUnitId === null;
        if (!validPlaguedTarget) return 'run.cards contains an invalid Cacochymic target';
        if (card.cacochymicUnitId !== null) cacochymicTargetUnitIds.add(card.cacochymicUnitId);
      }
      cardIds.add(card.id);
      if (new Set(attachedUnitIds).size !== attachedUnitIds.length) return 'run.cards repeats unit membership';
      for (const unitId of attachedUnitIds) {
        if (
          typeof unitId !== 'string'
          || !unitId
          || !unitIds.has(unitId)
          || cardUnitIds.has(unitId)
          || lostCardUnitIds.has(unitId)
        ) {
          return 'run.cards contains invalid unit membership';
        }
        cardUnitIds.add(unitId);
      }
      for (const unitId of card.lostUnitIds) {
        if (
          typeof unitId !== 'string'
          || !unitId
          || unitIds.has(unitId)
          || cardUnitIds.has(unitId)
          || lostCardUnitIds.has(unitId)
        ) return 'run.cards contains invalid loss history';
        lostCardUnitIds.add(unitId);
      }
    }
    for (const unit of run.army) {
      if (unit.modifiers.includes('cacochymic') !== cacochymicTargetUnitIds.has(unit.id)) {
        return 'run.army Cacochymic modifiers do not match card targets';
      }
    }
    const hisGraceCards = run.cards.filter((card) => card.coreId === 'his-grace');
    const frontLinesCards = run.cards.filter((card) => card.coreId === 'front-lines');
    if (
      hisGraceCards.length !== 1
      || hisGraceCards[0].id !== 'run-card-his-grace'
      || hisGraceCards[0].cardType !== null
      || hisGraceCards[0].effectTargetUnitId !== null
      || hisGraceCards[0].cacochymicUnitId !== null
      || hisGraceCards[0].unitSeats.length !== 1
      || hisGraceCards[0].unitSeats[0] !== 'run-king'
      || hisGraceCards[0].lostUnitIds.length !== 0
    ) return 'run.cards must retain His Grace';
    if (frontLinesCards.length > 1) return 'run.cards repeats Front Lines';
    if (frontLinesCards.length === 1) {
      const frontLines = frontLinesCards[0];
      const startingPawnIds = run.army
        .filter((unit) => unit.type === 'pawn' && unit.source === 'starting')
        .map((unit) => unit.id);
      if (
        frontLines.id !== 'run-card-front-lines'
        || frontLines.cardType !== null
        || frontLines.effectTargetUnitId !== null
        || frontLines.cacochymicUnitId !== null
        || frontLines.lostUnitIds.length !== 0
        || unitIdsForCard(frontLines).some((unitId) => {
          const unit = run.army.find((candidate) => candidate.id === unitId);
          return unit?.type !== 'pawn' || unit.source !== 'starting';
        })
        || startingPawnIds.length !== unitIdsForCard(frontLines).length
        || startingPawnIds.some((unitId) => !unitIdsForCard(frontLines).includes(unitId))
      ) return 'run.cards contains invalid Front Lines membership';
    }
    if (
      frontLinesCards.length === 0
      && run.army.some((unit) => unit.type === 'pawn' && unit.source === 'starting')
    ) return 'run.army retains units from removed Front Lines';
    if (!Array.isArray(run.pestiferousLosses) || run.pestiferousLosses.length > 20000) {
      return 'run.pestiferousLosses is invalid';
    }
    const lossKeys = new Set();
    const lossUnitIds = new Set();
    for (const loss of run.pestiferousLosses) {
      const unit = loss && loss.unit;
      const card = loss && run.cards.find((candidate) => candidate.id === loss.cardId);
      const key = loss ? `${loss.cardId}:${loss.battleIndex}` : '';
      if (
        !isObjectRecord(loss)
        || !isFiniteInteger(loss.battleIndex)
        || loss.battleIndex < 0
        || loss.battleIndex >= run.war.battles.length
        || !card
        || card.cardType !== 'pestiferous'
        || lossKeys.has(key)
        || !isObjectRecord(unit)
        || typeof unit.id !== 'string'
        || !card.lostUnitIds.includes(unit.id)
        || lossUnitIds.has(unit.id)
        || !ACTIVE_RUN_PIECES.has(unit.type)
        || unit.type === 'king'
        || typeof unit.name !== 'string'
        || !unit.name.trim()
        || unit.name.length > 80
        || !Array.isArray(unit.abilities)
        || unit.abilities.some((ability) => !ACTIVE_RUN_ABILITIES.has(ability))
        || !Array.isArray(unit.modifiers)
        || !unit.modifiers.includes('cacochymic')
        || unit.modifiers.some((modifier) => !ACTIVE_RUN_MODIFIERS.has(modifier))
        || !ACTIVE_RUN_UNIT_SOURCES.has(unit.source)
        || !isFiniteInteger(unit.inspectionSeed)
        || unit.inspectionSeed < 0
        || unit.inspectionSeed > 0xffffffff
      ) return 'run.pestiferousLosses contains an invalid loss';
      lossKeys.add(key);
      lossUnitIds.add(unit.id);
    }
    if (lossUnitIds.size !== lostCardUnitIds.size) return 'run.cards loss history is incomplete';
    if (!isFiniteInteger(run.nextCardSequence) || run.nextCardSequence < 1) return 'run.nextCardSequence is invalid';
  }
  {
    const deployment = run.deployment;
    if (run.phase === 'battle' && deployment === null) return 'run.deployment is required during Battle';
    if (run.phase !== 'deployment' && run.phase !== 'battle') {
      if (deployment !== null) return 'run.deployment is invalid outside deployment and Battle';
    } else if (deployment !== null) {
      if (!isObjectRecord(deployment)) return 'run.deployment is invalid';
      if (Object.keys(deployment).some((field) => !ACTIVE_RUN_DEPLOYMENT_FIELDS.has(field))) {
        return 'run.deployment contains an unsupported field';
      }
      const validUniqueIds = (value, allowedIds, maximum = 200) => Array.isArray(value)
        && value.length <= maximum
        && new Set(value).size === value.length
        && value.every((id) => typeof id === 'string' && allowedIds.has(id));
      const cardIds = new Set(run.cards.map((card) => card.id));
      const deploymentStages = new Set([
        'awaiting-deal',
        'dealing',
        'card',
        'revealing',
        'unit',
        'settling',
        'discarding',
        'complete',
      ]);
      if (
        deployment.battleIndex !== run.battleIndex
        || !isFiniteInteger(deployment.seed)
        || deployment.seed < 0
        || deployment.seed > 0xffffffff
        || !validUniqueIds(deployment.dealtCardIds, cardIds)
        || deployment.dealtCardIds[0] !== 'run-card-his-grace'
        || !validUniqueIds(deployment.deployingUnitIds, unitIds)
        || !validUniqueIds(deployment.unavailableUnitIds, unitIds)
        || typeof deployment.capacityResolved !== 'boolean'
        || !isFiniteInteger(deployment.activeCardIndex)
        || deployment.activeCardIndex < 0
        || deployment.activeCardIndex > deployment.dealtCardIds.length
        || !isFiniteInteger(deployment.unitCursor)
        || deployment.unitCursor < 0
        || !isFiniteInteger(deployment.discardCursor)
        || deployment.discardCursor < 0
        || deployment.discardCursor > deployment.dealtCardIds.length
        || !validUniqueIds(deployment.revealedCardIds, cardIds)
        || !validUniqueIds(deployment.settlingUnitIds, unitIds)
        || !deploymentStages.has(deployment.stage)
        || !['paused', 'playing', 'full-deploy'].includes(deployment.transport)
        || !isObjectRecord(deployment.placements)
        || !isObjectRecord(deployment.manualPlacements)
        || !validUniqueIds(deployment.blockedUnitIds, unitIds)
      ) return 'run.deployment contains invalid state';
      const deployingIds = new Set(deployment.deployingUnitIds);
      const unavailableIds = new Set(deployment.unavailableUnitIds);
      if (
        [...deployingIds].some((id) => unavailableIds.has(id))
        || new Set([...deployingIds, ...unavailableIds]).size !== unitIds.size
        || deployment.blockedUnitIds.length !== deployment.unavailableUnitIds.length
        || deployment.blockedUnitIds.some((id, index) => id !== deployment.unavailableUnitIds[index])
      ) return 'run.deployment unit pools are inconsistent';
      const dealtUnitOrder = deployment.dealtCardIds.flatMap((cardId) => {
        const card = run.cards.find((candidate) => candidate.id === cardId);
        return Array.isArray(card?.unitSeats)
          ? card.unitSeats.filter((unitId) => typeof unitId === 'string')
          : [];
      });
      const dealtUnitIds = new Set(dealtUnitOrder);
      if (
        deployment.deployingUnitIds.some((id) => !dealtUnitIds.has(id))
        || deployment.deployingUnitIds.some((id, index) => id !== dealtUnitOrder[index])
        || (!deployment.capacityResolved && deployment.deployingUnitIds.length !== dealtUnitOrder.length)
      ) return 'run.deployment pool does not match its dealt cards';
      const placementEntries = Object.entries(deployment.placements);
      const placementSquares = new Set();
      for (const [unitId, square] of placementEntries) {
        if (
          !deployingIds.has(unitId)
          || typeof square !== 'string'
          || !/^-?\d+,-?\d+$/.test(square)
          || placementSquares.has(square)
        ) return 'run.deployment placements are invalid';
        placementSquares.add(square);
      }
      for (const [unitId, square] of Object.entries(deployment.manualPlacements)) {
        if (deployment.placements[unitId] !== square) return 'run.deployment manual placements are invalid';
      }
      const activeCardId = deployment.dealtCardIds[deployment.activeCardIndex];
      const activeCard = run.cards.find((card) => card.id === activeCardId);
      const activeSeats = Array.isArray(activeCard?.unitSeats) ? activeCard.unitSeats : [];
      if (
        deployment.unitCursor > activeSeats.length
        || deployment.discardCursor !== deployment.activeCardIndex
      ) return 'run.deployment cursors are inconsistent';
      const expectedRevealedCount = ['revealing', 'unit', 'settling', 'discarding'].includes(deployment.stage)
        ? deployment.activeCardIndex + 1
        : deployment.activeCardIndex;
      if (
        deployment.revealedCardIds.length !== expectedRevealedCount
        || deployment.revealedCardIds.some((cardId, index) => cardId !== deployment.dealtCardIds[index])
      ) return 'run.deployment revealed cards are inconsistent';
      if (
        deployment.settlingUnitIds.some((unitId) => (
          !deployingIds.has(unitId) || !Object.hasOwn(deployment.placements, unitId)
        ))
        || (deployment.stage === 'settling') !== (deployment.settlingUnitIds.length > 0)
      ) return 'run.deployment settling units are invalid';
      if (
        deployment.temporaryAdlectedUnitId !== undefined
        && !deployingIds.has(deployment.temporaryAdlectedUnitId)
      ) return 'run.deployment temporary Adlected unit is invalid';
      if (
        (deployment.stage === 'awaiting-deal' || deployment.stage === 'dealing')
        && (deployment.transport !== 'paused' || deployment.activeCardIndex !== 0 || deployment.unitCursor !== 0)
      ) {
        return 'run.deployment pre-placement state is invalid';
      }
      if (
        run.phase === 'battle'
        && (!deployment.capacityResolved
          || deployment.stage !== 'complete'
          || deployment.activeCardIndex !== deployment.dealtCardIds.length
          || deployment.discardCursor !== deployment.dealtCardIds.length
          || deployment.settlingUnitIds.length !== 0)
      ) return 'run Battle has incomplete deployment state';
    }
  }
  for (const field of ['lipsana', 'seenLipsana']) {
    if (!Array.isArray(run[field]) || run[field].length > 100 || run[field].some((id) => typeof id !== 'string' || !id)) {
      return `run.${field} is invalid`;
    }
  }
  if (!isFiniteInteger(run.nextArmyUnitSequence) || run.nextArmyUnitSequence < 1) return 'run.nextArmyUnitSequence is invalid';
  if (run.nextArmyUnitNumberByType !== undefined) {
    if (!isObjectRecord(run.nextArmyUnitNumberByType)) return 'run.nextArmyUnitNumberByType is invalid';
    for (const type of ACTIVE_RUN_PIECES) {
      if (!isFiniteInteger(run.nextArmyUnitNumberByType[type]) || run.nextArmyUnitNumberByType[type] < 1) {
        return 'run.nextArmyUnitNumberByType is invalid';
      }
    }
  }
  if (run.phase === 'sectio' && !isObjectRecord(run.sectio)) return 'run.sectio is required';
  if (run.phase !== 'sectio' && run.sectio !== null) return 'run.sectio is invalid outside the Sectio phase';
  // Bona Vacantia carries its own offers and, like the Sectio, exists only in its own phase.
  {
    if (run.phase === 'bona-vacantia') {
      if (!isObjectRecord(run.vacantia)) return 'run.vacantia is required';
      const vacantia = run.vacantia;
      if (Object.keys(vacantia).some((field) => !ACTIVE_RUN_VACANTIA_FIELDS.has(field))) {
        return 'run.vacantia contains an unsupported field';
      }
      if (vacantia.kind !== 'opening' && vacantia.kind !== 'post-battle') return 'run.vacantia.kind is invalid';
      if (!isFiniteInteger(vacantia.conflictIndex) || vacantia.conflictIndex < 0) return 'run.vacantia.conflictIndex is invalid';
      if (!isFiniteInteger(vacantia.afterBattleIndex) || vacantia.afterBattleIndex < 0) return 'run.vacantia.afterBattleIndex is invalid';
      if (!isFiniteInteger(vacantia.victoryGoldTenths) || vacantia.victoryGoldTenths < 0) return 'run.vacantia.victoryGoldTenths is invalid';
      if (!Array.isArray(vacantia.offers) || vacantia.offers.length < 1 || vacantia.offers.length > 3) {
        return 'run.vacantia.offers is invalid';
      }
      if (new Set(vacantia.offers).size !== vacantia.offers.length) return 'run.vacantia.offers repeats a lipsanon';
      for (const lipsanon of vacantia.offers) {
        if (!RUN_LIPSANON_IDS.has(lipsanon)) return 'run.vacantia.offers is invalid';
        // An offer the player already holds could never have been revealed.
        if (Array.isArray(run.lipsana) && run.lipsana.includes(lipsanon)) return 'run.vacantia offers a held lipsanon';
      }
    } else if (run.vacantia !== null && run.vacantia !== undefined) {
      return 'run.vacantia is invalid outside the bona-vacantia phase';
    }
  }
  // The aftermath report is the aftermath phase: it exists only there, and cannot be absent
  // there, because the Sectio that follows is opened from the survivors it carries.
  {
    if (run.phase === 'aftermath') {
      if (!isObjectRecord(run.aftermath)) return 'run.aftermath is required';
      const aftermath = run.aftermath;
      if (Object.keys(aftermath).some((field) => !ACTIVE_RUN_AFTERMATH_FIELDS.has(field))) {
        return 'run.aftermath contains an unsupported field';
      }
      if (!isFiniteInteger(aftermath.battleIndex) || aftermath.battleIndex < 0) return 'run.aftermath.battleIndex is invalid';
      if (!isFiniteInteger(aftermath.turns) || aftermath.turns < 0) return 'run.aftermath.turns is invalid';
      if (aftermath.elapsedMs !== null && (!isFiniteInteger(aftermath.elapsedMs) || aftermath.elapsedMs < 0)) {
        return 'run.aftermath.elapsedMs is invalid';
      }
      for (const field of ['goldTenths', 'bonusGoldTenths']) {
        if (!isFiniteInteger(aftermath[field]) || aftermath[field] < 0) return `run.aftermath.${field} is invalid`;
      }
      if (aftermath.bonusGoldTenths > aftermath.goldTenths) return 'run.aftermath.bonusGoldTenths is invalid';
      if (
        !Array.isArray(aftermath.survivingUnitIds)
        || aftermath.survivingUnitIds.length > 100
        || aftermath.survivingUnitIds.some((id) => typeof id !== 'string' || !id)
      ) return 'run.aftermath.survivingUnitIds is invalid';
      if (!Array.isArray(aftermath.fallenUnits) || aftermath.fallenUnits.length > 100) {
        return 'run.aftermath.fallenUnits is invalid';
      }
      for (const unit of aftermath.fallenUnits) {
        if (!isObjectRecord(unit)) return 'run.aftermath.fallenUnits is invalid';
        if (typeof unit.id !== 'string' || !unit.id || unit.id.length > 160) return 'run.aftermath.fallenUnits is invalid';
        if (typeof unit.name !== 'string' || unit.name.length > 160) return 'run.aftermath.fallenUnits is invalid';
        if (!ACTIVE_RUN_PIECES.has(unit.type)) return 'run.aftermath.fallenUnits is invalid';
      }
    } else if (run.aftermath !== null && run.aftermath !== undefined) {
      return 'run.aftermath is invalid outside the aftermath phase';
    }
  }
  if (run.sectio !== null && run.sectio !== undefined) {
    if (!isObjectRecord(run.sectio)) return 'run.sectio is invalid';
    if (Object.keys(run.sectio).some((field) => !ACTIVE_RUN_SECTIO_FIELDS.has(field))) {
      return 'run.sectio contains an unsupported field';
    }
    if (run.sectio.kind !== 'opening' && run.sectio.kind !== 'post-battle') {
      return 'run.sectio.kind is invalid';
    }
    if (run.sectio.alienatedUnits !== undefined && !Array.isArray(run.sectio.alienatedUnits)) return 'run.sectio.alienatedUnits is invalid';
    if (!Object.hasOwn(run.sectio, 'expunctedCard')) return 'run.sectio.expunctedCard is required';
    if (run.sectio.expunctedCard !== null && !isObjectRecord(run.sectio.expunctedCard)) {
      return 'run.sectio.expunctedCard is invalid';
    }
    if (run.sectio.entrySnapshot !== undefined && !isObjectRecord(run.sectio.entrySnapshot)) {
      return 'run.sectio.entrySnapshot is invalid';
    }
    if (
      Array.isArray(run.sectio.alienatedUnits)
      && run.sectio.alienatedUnits.some((alienated) => (
        !isObjectRecord(alienated)
        || !isObjectRecord(alienated.unit)
        || !ACTIVE_RUN_UNIT_SOURCES.has(alienated.unit.source)
      ))
    ) return 'run.sectio.alienatedUnits contains an invalid unit source';
    if (
      Array.isArray(run.sectio.entrySnapshot?.army)
      && run.sectio.entrySnapshot.army.some((unit) => (
        !isObjectRecord(unit) || !ACTIVE_RUN_UNIT_SOURCES.has(unit.source)
      ))
    ) return 'run.sectio.entrySnapshot.army contains an invalid unit source';
    const expunctedCard = run.sectio.expunctedCard;
    if (expunctedCard) {
      const card = expunctedCard.card;
      const units = expunctedCard.units;
      const attachedUnitIds = Array.isArray(card?.unitSeats)
        ? card.unitSeats.filter((unitId) => typeof unitId === 'string')
        : [];
      if (
        !isObjectRecord(card)
        || card.coreId === 'his-grace'
        || typeof card.id !== 'string'
        || !card.id
        || run.cards.some((candidate) => candidate.id === card.id)
        || !Array.isArray(card.unitSeats)
        || !Array.isArray(card.lostUnitIds)
        || !Array.isArray(units)
        || units.length !== attachedUnitIds.length
        || units.some((unit, index) => (
          !isObjectRecord(unit)
          || unit.id !== attachedUnitIds[index]
          || unitIds.has(unit.id)
          || !ACTIVE_RUN_PIECES.has(unit.type)
          || !ACTIVE_RUN_UNIT_SOURCES.has(unit.source)
          || typeof unit.name !== 'string'
          || !unit.name.trim()
          || !Array.isArray(unit.abilities)
          || !Array.isArray(unit.modifiers)
        ))
        || new Set(attachedUnitIds).size !== attachedUnitIds.length
        || (card.effectTargetUnitId !== null && !attachedUnitIds.includes(card.effectTargetUnitId))
        || (card.cardType === 'pestiferous'
          ? attachedUnitIds.length > 0
            ? !attachedUnitIds.includes(card.cacochymicUnitId)
            : card.cacochymicUnitId !== null
          : card.cacochymicUnitId !== null)
        || !isFiniteInteger(expunctedCard.priceTenths)
        || expunctedCard.priceTenths <= 0
        || typeof serverRender?.cardExpunctioPriceTenths !== 'function'
        || serverRender.cardExpunctioPriceTenths(card, units) !== expunctedCard.priceTenths
      ) return 'run.sectio.expunctedCard is invalid';
    }
    {
      if (!Array.isArray(run.sectio.cardOffers) || run.sectio.cardOffers.length < 1 || run.sectio.cardOffers.length > 10) {
        return 'run.sectio.cardOffers is invalid';
      }
      const offerIds = new Set();
      const offerValues = new Set();
      for (const offer of run.sectio.cardOffers) {
        if (!isObjectRecord(offer)) return 'run.sectio.cardOffers contains an invalid offer';
        const cardTypeValid = offer.cardType === null
          || offer.cardType === 'pestiferous'
          || offer.cardType === 'concinnous'
          || offer.cardType === 'legatine'
          || offer.cardType === 'hieratic';
        const effectTargetValid = offer.cardType === 'concinnous'
          ? isFiniteInteger(offer.effectTargetIndex)
            && offer.effectTargetIndex >= 0
            && offer.effectTargetIndex < offer.pieces?.length
          : offer.effectTargetIndex === null;
        const costValid = isFiniteInteger(offer.cost)
          && offer.cost >= 1
          && offer.cost <= 12;
        if (
          typeof offer.offerId !== 'string'
          || !offer.offerId
          || offer.offerId.startsWith('shop-')
          || offerIds.has(offer.offerId)
          || typeof offer.id !== 'string'
          || !offer.id
          || !Array.isArray(offer.pieces)
          || offer.pieces.length < 1
          || offer.pieces.length > 9
          || offer.pieces.some((piece) => !ACTIVE_RUN_PIECES.has(piece) || piece === 'king')
          || !isFiniteInteger(offer.value)
          || offer.value < 1
          || offer.value > 9
          || !costValid
          || !cardTypeValid
          || !effectTargetValid
          || !isFiniteInteger(offer.effectSeed)
          || offer.effectSeed < 0
          || offer.effectSeed > 0xffffffff
          || offer.pieces.reduce((total, piece) => total + ACTIVE_RUN_PIECE_VALUES[piece], 0) !== offer.value
        ) return 'run.sectio.cardOffers contains an invalid offer';
        const validPlaguedTarget = offer.cardType === 'pestiferous'
          ? isFiniteInteger(offer.cacochymicPieceIndex)
            && offer.cacochymicPieceIndex >= 0
            && offer.cacochymicPieceIndex < offer.pieces.length
          : offer.cacochymicPieceIndex === null;
        if (!validPlaguedTarget) return 'run.sectio.cardOffers contains an invalid Cacochymic target';
        const plaguedPiece = offer.cacochymicPieceIndex === null ? null : offer.pieces[offer.cacochymicPieceIndex];
        const expectedCost = offer.cardType === 'pestiferous'
          ? offer.value - (plaguedPiece ? ACTIVE_RUN_CACOCHYMIC_DISCOUNTS[plaguedPiece] : 0)
          : offer.value + (
            offer.cardType === 'legatine' || offer.cardType === 'hieratic'
              ? 3
              : offer.cardType === 'concinnous' ? 2 : 0
          );
        if (offer.cost !== expectedCost) {
          return 'run.sectio.cardOffers contains invalid affected pricing';
        }
        offerIds.add(offer.offerId);
        offerValues.add(offer.value);
      }
      if (
        !Array.isArray(run.sectio.adlectedCardOfferIds)
        || run.sectio.adlectedCardOfferIds.length > run.sectio.cardOffers.length
        || new Set(run.sectio.adlectedCardOfferIds).size !== run.sectio.adlectedCardOfferIds.length
        || run.sectio.adlectedCardOfferIds.some((offerId) => !offerIds.has(offerId))
      ) return 'run.sectio.adlectedCardOfferIds is invalid';
      if (
        run.sectio.entrySnapshot !== undefined
        && (
          !Array.isArray(run.sectio.entrySnapshot.cards)
          || !Array.isArray(run.sectio.entrySnapshot.pestiferousLosses)
          || !isFiniteInteger(run.sectio.entrySnapshot.nextCardSequence)
          || run.sectio.entrySnapshot.nextCardSequence < 1
        )
      ) return 'run.sectio.entrySnapshot card state is invalid';
      if (
        run.sectio.entrySnapshot !== undefined
        && run.sectio.entrySnapshot.cards.some((card) => (
          !isObjectRecord(card)
          || !Array.isArray(card.unitSeats)
          || (
            card.cardType === 'pestiferous'
              ? card.unitSeats.some((unitId) => typeof unitId === 'string')
                ? typeof card.cacochymicUnitId !== 'string' || !card.unitSeats.includes(card.cacochymicUnitId)
                : card.cacochymicUnitId !== null
              : card.cacochymicUnitId !== null
          )
        ))
      ) return 'run.sectio.entrySnapshot contains an invalid Cacochymic target';
      if (run.sectio.entrySnapshot !== undefined) {
        const transactionCards = expunctedCard
          ? [...run.cards, expunctedCard.card]
          : run.cards;
        const entryCardIds = new Set(run.sectio.entrySnapshot.cards.map((card) => card.id));
        const adlectedCards = transactionCards.filter((card) => !entryCardIds.has(card.id));
        if (
          transactionCards.length !== run.sectio.entrySnapshot.cards.length + run.sectio.adlectedCardOfferIds.length
          || run.sectio.entrySnapshot.cards.some((card) => !transactionCards.some((candidate) => candidate.id === card.id))
          || adlectedCards.length !== run.sectio.adlectedCardOfferIds.length
          || run.sectio.adlectedCardOfferIds.some((offerId) => {
            const offer = run.sectio.cardOffers.find((candidate) => candidate.offerId === offerId);
            return !offer || !adlectedCards.some((card) => (
              card.coreId === offer.id
              && card.cardType === offer.cardType
              && card.effectSeed === offer.effectSeed
            ));
          })
        ) return 'run.sectio Adlectio state is invalid';
      }
      if (run.sectio.kind === 'opening') {
        if (
          run.phase !== 'sectio'
          || run.battleIndex !== 0
          || run.conflictIndex !== 0
          || run.sectio.afterBattleIndex !== 0
          || run.sectio.conflictIndex !== 0
          || run.sectio.victoryGoldTenths !== 0
          || run.sectio.cardOffers.length !== 3
          || offerValues.size !== 3
          // Opening offers carry the same qualifiers as any other draw and are priced by the
          // shared affected-pricing rule checked above, so a qualifier may price one past the
          // starting gold. At least one remains buyable even though leaving without Adlectio is
          // allowed; the first Deployment deal can consequently contain only the two starter cards.
          || run.sectio.cardOffers.some((offer) => offer.value > 8)
          || !run.sectio.cardOffers.some((offer) => offer.cost <= 8)
          || run.sectio.paidLipsanonOffer !== null
          || run.sectio.paidLipsanonBought !== false
          || !isObjectRecord(run.sectio.entrySnapshot)
          // Bona Vacantia runs BEFORE the opening Sectio, so a lipsanon taken there may already
          // have paid out. The gold is still pinned value-by-value -- to the starting gold
          // plus exactly what the lipsana held are worth on acquisition, computed from the
          // model's own payout table so the two cannot drift.
          || run.sectio.entrySnapshot.goldTenths !== 80 + openingLipsanonGoldTenths(run)
          || !Array.isArray(run.sectio.entrySnapshot.army)
          || run.sectio.entrySnapshot.army.length !== 3
          || run.sectio.entrySnapshot.army[0]?.id !== 'run-king'
          || run.sectio.entrySnapshot.army[0]?.type !== 'king'
          || run.sectio.entrySnapshot.army[0]?.abilities?.length !== 0
          || run.sectio.entrySnapshot.army[1]?.id !== 'run-pawn-a'
          || run.sectio.entrySnapshot.army[1]?.type !== 'pawn'
          || run.sectio.entrySnapshot.army[1]?.source !== 'starting'
          || run.sectio.entrySnapshot.army[2]?.id !== 'run-pawn-b'
          || run.sectio.entrySnapshot.army[2]?.type !== 'pawn'
          || run.sectio.entrySnapshot.army[2]?.source !== 'starting'
          || !Array.isArray(run.sectio.entrySnapshot.cards)
          || run.sectio.entrySnapshot.cards.length !== 2
          || run.sectio.entrySnapshot.cards[0]?.id !== 'run-card-his-grace'
          || run.sectio.entrySnapshot.cards[0]?.coreId !== 'his-grace'
          || run.sectio.entrySnapshot.cards[0]?.unitSeats?.length !== 1
          || run.sectio.entrySnapshot.cards[0]?.unitSeats?.[0] !== 'run-king'
          || run.sectio.entrySnapshot.cards[1]?.id !== 'run-card-front-lines'
          || run.sectio.entrySnapshot.cards[1]?.coreId !== 'front-lines'
          || run.sectio.entrySnapshot.cards[1]?.unitSeats?.length !== 2
          || !run.sectio.entrySnapshot.cards[1]?.unitSeats?.includes('run-pawn-a')
          || !run.sectio.entrySnapshot.cards[1]?.unitSeats?.includes('run-pawn-b')
        ) return 'run opening Sectio is invalid';
        const openingUnitIds = new Set([
          'run-king',
          'run-pawn-a',
          'run-pawn-b',
          ...run.cards.flatMap((card) => card.unitSeats.filter((unitId) => typeof unitId === 'string')),
        ]);
        if (run.army.some((unit) => !openingUnitIds.has(unit.id))) {
          return 'run opening Sectio purchase state is invalid';
        }
      }
    }
  }
  return null;
}

function publicActiveRun(row) {
  return {
    run: row && isObjectRecord(row.body) ? row.body : null,
    revision: Number(row && row.revision) || 0,
    updated_at: row && row.updated_at ? row.updated_at : null,
  };
}

app.get('/api/active-run', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    await ensureDbReady();
    const { rows } = await pool.query(
      'SELECT body, revision, updated_at FROM active_runs WHERE owner_email = $1',
      [user.email],
    );
    res.status(200).json(publicActiveRun(rows[0] || null));
  } catch (error) {
    dbUnavailable(res, 'active Run read failed', error, 'active_run_store_unavailable');
  }
});

app.put('/api/active-run', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const raw = req.body && typeof req.body === 'object' ? req.body : {};
  const expectedRevision = campaignWorkspaceRevision(raw.revision);
  if (expectedRevision === null) {
    res.status(400).json({ error: 'active_run_revision_required' });
    return;
  }
  const validation = validateActiveRunBody(raw.run);
  if (validation) {
    res.status(400).json({ error: 'invalid_active_run', details: validation });
    return;
  }
  try {
    await ensureDbReady();
    const result = await withEditorDocumentTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`active-run:${user.email}`]);
      const currentResult = await client.query(
        'SELECT body, revision, updated_at FROM active_runs WHERE owner_email = $1 FOR UPDATE',
        [user.email],
      );
      const current = currentResult.rows[0] || null;
      if ((Number(current && current.revision) || 0) !== expectedRevision) return { conflict: true, row: current };
      if (!current) {
        const { rows } = await client.query(
          `INSERT INTO active_runs (owner_email, body, revision)
           VALUES ($1, $2::jsonb, 1)
           RETURNING body, revision, updated_at`,
          [user.email, JSON.stringify(raw.run)],
        );
        return { row: rows[0] };
      }
      const { rows } = await client.query(
        `UPDATE active_runs
            SET body = $2::jsonb, revision = revision + 1, updated_at = now()
          WHERE owner_email = $1
          RETURNING body, revision, updated_at`,
        [user.email, JSON.stringify(raw.run)],
      );
      return { row: rows[0] };
    });
    if (result.conflict) {
      res.status(409).json({ error: 'active_run_revision_conflict', ...publicActiveRun(result.row) });
      return;
    }
    res.status(200).json(publicActiveRun(result.row));
  } catch (error) {
    dbUnavailable(res, 'active Run write failed', error, 'active_run_store_unavailable');
  }
});

app.delete('/api/active-run', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const expectedRevision = campaignWorkspaceRevision(req.body && req.body.revision);
  if (expectedRevision === null) {
    res.status(400).json({ error: 'active_run_revision_required' });
    return;
  }
  try {
    await ensureDbReady();
    const result = await withEditorDocumentTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`active-run:${user.email}`]);
      const currentResult = await client.query(
        'SELECT body, revision, updated_at FROM active_runs WHERE owner_email = $1 FOR UPDATE',
        [user.email],
      );
      const current = currentResult.rows[0] || null;
      if (!current) return { missing: true };
      if (Number(current.revision) !== expectedRevision) return { conflict: true, row: current };
      await client.query('DELETE FROM active_runs WHERE owner_email = $1', [user.email]);
      return { deleted: true };
    });
    if (result.conflict) {
      res.status(409).json({ error: 'active_run_revision_conflict', ...publicActiveRun(result.row) });
      return;
    }
    res.status(200).json({ ok: true, revision: 0 });
  } catch (error) {
    dbUnavailable(res, 'active Run delete failed', error, 'active_run_store_unavailable');
  }
});

function runCraftError(message) {
  const error = new Error(message);
  error.name = 'RunCraftError';
  return error;
}

// Read a craft spec out of a request. Two ways to say the same thing: the JSON grammar, and the
// readable address grammar for a spec typed by hand. Neither is the LINK — a crafted state is
// handed over as its id (ADR-0354), and both of these are ways to mint one.
function runCraftSpecFromRequest(body) {
  if (typeof body.address === 'string') {
    const spec = serverRender.parseRunCraftSpec(body.address);
    if (!spec) throw runCraftError('craft: this address asks for no Run state. A craft address carries ?craft=<phase>.');
    return spec;
  }
  return serverRender.runCraftSpecFromJson(body.spec === undefined ? body : body.spec);
}

// Mint the craft link for a spec, or return the one it already has. The id is the fingerprint of
// the spec's own canonical text, so asking for the same state twice — in this session or one a
// month from now — yields the same address, and re-minting writes nothing new.
async function mintRunCraftLink(spec, ownerEmail) {
  const canonical = serverRender.runCraftSpecFingerprint(spec);
  const id = crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
  await ensureDbReady();
  await pool.query(
    `INSERT INTO run_craft_links (id, spec, created_by)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (id) DO NOTHING`,
    [id, canonical, ownerEmail],
  );
  return { id, url: serverRender.runCraftLinkForId(id) };
}

// The spec a craft link stands for. A link that resolves to nothing is reported as such: the id
// is all the address carries, so a wrong or truncated one has no other way to be noticed.
async function runCraftLinkSpec(id) {
  await ensureDbReady();
  const { rows } = await pool.query('SELECT spec FROM run_craft_links WHERE id = $1', [id]);
  if (!rows[0]) throw runCraftError('This craft link is not one this server minted. Check the whole link was copied.');
  return serverRender.runCraftSpecFromJson(rows[0].spec);
}

// Compose the crafted Run for a spec, against the official Wars this server serves.
async function craftedRunForSpec(spec) {
  const document = await dbGetOfficialCampaigns('default');
  const data = (document && document.data) || {};
  // Origin is a client-side tag; every War in the official workspace is official by definition.
  const wars = (Array.isArray(data.wars) ? data.wars : []).map((war) => ({ ...war, origin: 'official' }));
  const levels = data.levels && typeof data.levels === 'object' ? data.levels : {};
  return serverRender.craftRunDocument(spec, serverRender.selectCraftWar(spec, wars, levels));
}

// Replace the caller's active Run with a crafted document. Crafting deliberately overwrites
// whatever Run is there: it is the caller asking for this account to be at that state, so there
// is no revision to agree with first.
async function writeCraftedActiveRun(run, ownerEmail) {
  await ensureDbReady();
  return withEditorDocumentTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`active-run:${ownerEmail}`]);
    const currentResult = await client.query(
      'SELECT revision FROM active_runs WHERE owner_email = $1 FOR UPDATE',
      [ownerEmail],
    );
    if (!currentResult.rows[0]) {
      const { rows } = await client.query(
        `INSERT INTO active_runs (owner_email, body, revision)
         VALUES ($1, $2::jsonb, 1)
         RETURNING body, revision, updated_at`,
        [ownerEmail, JSON.stringify(run)],
      );
      return rows[0];
    }
    const { rows } = await client.query(
      `UPDATE active_runs
          SET body = $2::jsonb, revision = revision + 1, updated_at = now()
        WHERE owner_email = $1
        RETURNING body, revision, updated_at`,
      [ownerEmail, JSON.stringify(run)],
    );
    return rows[0];
  });
}

function craftedRunSummary(run) {
  return {
    war: run.war.name,
    phase: run.phase,
    battle: `${run.battleIndex + 1}/${run.war.battles.length}`,
    gold: run.goldTenths / 10,
    army: run.army.map((unit) => unit.type),
    offers: run.sectio ? run.sectio.cardOffers.map((offer) => `${offer.pieces.join('+')}@${offer.cost}`) : null,
    lipsana: run.lipsana,
  };
}

function craftRouteUnavailable(res) {
  if (typeof serverRender?.runCraftSpecFromJson === 'function') return false;
  res.status(503).json({ error: 'run_crafter_unavailable' });
  return true;
}

function reportCraftFailure(res, error, message) {
  if (error && error.name === 'RunCraftError') {
    res.status(400).json({ error: 'invalid_run_craft_spec', details: error.message });
    return;
  }
  // Craft links are a debugging instrument, so their table is not a readiness requirement: a
  // database that has not been advanced to migration 50 loses craft links and nothing else, and
  // says which rather than reporting the Run store as broken.
  if (error && error.code === '42P01') {
    res.status(503).json({
      error: 'run_craft_links_unavailable',
      details: 'This server’s database has no craft-link store yet. Apply schema migration 50.',
    });
    return;
  }
  dbUnavailable(res, message, error, 'active_run_store_unavailable');
}

// POST /api/run-craft-links — ADMIN: mint the link for a Run state without crafting it.
//
// The Run screen uses this to turn a hand-typed ?craft= address into its permanent id address,
// so the readable grammar stays a way to WRITE a spec while the id remains the only thing a
// crafted state is ever handed over as.
app.post('/api/run-craft-links', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (craftRouteUnavailable(res)) return;
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const spec = runCraftSpecFromRequest(body);
    res.status(200).json({ ...(await mintRunCraftLink(spec, user.email)), spec: serverRender.runCraftSpecToJson(spec) });
  } catch (error) {
    reportCraftFailure(res, error, 'Run craft link mint failed');
  }
});

// POST /api/active-run/craft/:id — ADMIN: set the caller's OWN active Run from a minted link.
//
// This is what a craft link does when it is opened, and it is why the link is a restart button:
// the id resolves to the stored spec and the Run is composed from it again, whatever the account
// has since played.
app.post('/api/active-run/craft/:id', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (craftRouteUnavailable(res)) return;
  const id = String(req.params.id || '').toLowerCase();
  let run = null;
  let spec = null;
  try {
    if (!serverRender.runCraftLinkId(serverRender.runCraftLinkForId(id))) {
      throw runCraftError('This is not a craft link id. Check the whole link was copied.');
    }
    spec = await runCraftLinkSpec(id);
    run = await craftedRunForSpec(spec);
  } catch (error) {
    reportCraftFailure(res, error, 'Run craft from link failed');
    return;
  }
  const validation = validateActiveRunBody(run);
  if (validation) {
    res.status(500).json({ error: 'crafted_run_invalid', details: validation });
    return;
  }
  try {
    const result = await writeCraftedActiveRun(run, user.email);
    res.status(200).json({
      ...publicActiveRun(result),
      url: serverRender.runCraftLinkForId(id),
      runUrl: serverRender.runLinkForRun(run.id),
      runId: run.id,
      summary: craftedRunSummary(run),
      // The persisted Run remains an ordinary Battle. This admin-only response tells the
      // client when the craft link names its terminal board presentation as well.
      battleResult: spec.phase === 'battle-victory' ? 'player' : null,
    });
  } catch (error) {
    dbUnavailable(res, 'Run craft write failed', error, 'active_run_store_unavailable');
  }
});

// POST /api/active-run/craft — ADMIN: set the caller's OWN active Run to a named state (ADR-0338).
//
// Debugging and feature work need a Run parked at an exact Sectio, deployment, Battle or victory.
// Writing active_runs by hand is already possible for anyone with database access and produces
// documents this endpoint's own validator would reject; crafting composes the state out of the
// game's real transitions instead, so what lands in the row is a Run the game could have played.
// This is the one call an agent makes: it mints the link, sets the Run, and answers with both.
// The reply's `url` is the link to hand over — an id that CRAFTS the state again (ADR-0354),
// not merely one that names it, so a state handed over can always be returned to.
app.post('/api/active-run/craft', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (craftRouteUnavailable(res)) return;
  let run = null;
  let link = null;
  let spec = null;
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    spec = runCraftSpecFromRequest(body);
    link = await mintRunCraftLink(spec, user.email);
    run = await craftedRunForSpec(spec);
  } catch (error) {
    reportCraftFailure(res, error, 'Run craft failed');
    return;
  }
  // The crafter composes with the game's transitions, so a rejection here is a defect in this
  // server's own contract rather than bad input — report it as one instead of a 400.
  const validation = validateActiveRunBody(run);
  if (validation) {
    res.status(500).json({ error: 'crafted_run_invalid', details: validation });
    return;
  }
  try {
    const result = await writeCraftedActiveRun(run, user.email);
    res.status(200).json({
      ...publicActiveRun(result),
      // The address to hand over: opening it crafts this state again and lands on the Run screen,
      // so it is both "go and look at this" and the way back after the Run has been played on.
      url: link.url,
      craftId: link.id,
      // The identity address, which asserts this exact Run instead of rebuilding it. Useful only
      // for pointing at a Run already in hand: it cannot restore one that has moved on.
      runUrl: serverRender.runLinkForRun(run.id),
      runId: run.id,
      summary: craftedRunSummary(run),
      battleResult: spec.phase === 'battle-victory' ? 'player' : null,
    });
  } catch (error) {
    dbUnavailable(res, 'Run craft write failed', error, 'active_run_store_unavailable');
  }
});

// --- Account-scoped Run lipsanon history (ADR-0231) --------------------------
// The mutable active Run cannot answer lifetime questions after completion or
// abandonment. Clients submit deterministic facts; the composite key makes
// retries and cross-tab delivery idempotent.
const RUN_LIPSANON_STAT_KINDS = new Set(['picked', 'battle-win']);
const RUN_LIPSANON_STAT_EVENT_ID = /^[a-z0-9][a-z0-9:._-]{0,239}$/;

function validateLipsanonStatEvents(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 500) {
    return { error: 'events must contain 1-500 entries' };
  }
  const events = [];
  for (const event of raw) {
    if (!isObjectRecord(event)
      || !RUN_LIPSANON_STAT_EVENT_ID.test(String(event.eventId || ''))
      || !RUN_LIPSANON_IDS.has(event.lipsanonId)
      || !RUN_LIPSANON_STAT_KINDS.has(event.kind)) {
      return { error: 'events contain an invalid eventId, lipsanonId, or kind' };
    }
    events.push({
      eventId: String(event.eventId),
      lipsanonId: String(event.lipsanonId),
      kind: String(event.kind),
    });
  }
  return { events };
}

app.get('/api/run-lipsanon-statistics', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    await ensureDbReady();
    const { rows } = await pool.query(
      `SELECT lipsanon_id,
              count(*) FILTER (WHERE event_kind = 'picked')::integer AS times_picked,
              count(*) FILTER (WHERE event_kind = 'battle-win')::integer AS battles_won_while_held
         FROM lipsanon_stat_events
        WHERE owner_email = $1
        GROUP BY lipsanon_id`,
      [user.email],
    );
    res.status(200).json({
      statistics: Object.fromEntries(rows.map((row) => [
        row.lipsanon_id,
        {
          timesPicked: Number(row.times_picked) || 0,
          battlesWonWhileHeld: Number(row.battles_won_while_held) || 0,
        },
      ])),
    });
  } catch (error) {
    dbUnavailable(res, 'Run lipsanon statistics read failed', error, 'run_lipsanon_statistics_unavailable');
  }
});

app.post('/api/run-lipsanon-stat-events', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const validation = validateLipsanonStatEvents(req.body && req.body.events);
  if (validation.error) {
    res.status(400).json({ error: 'invalid_lipsanon_stat_events', details: validation.error });
    return;
  }
  try {
    await ensureDbReady();
    const result = await withEditorDocumentTransaction(async (client) => {
      let accepted = 0;
      for (const event of validation.events) {
        const inserted = await client.query(
          `INSERT INTO lipsanon_stat_events (owner_email, event_id, lipsanon_id, event_kind)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (owner_email, event_id, lipsanon_id) DO NOTHING`,
          [user.email, event.eventId, event.lipsanonId, event.kind],
        );
        accepted += inserted.rowCount || 0;
      }
      return accepted;
    });
    res.status(200).json({ ok: true, received: validation.events.length, inserted: result });
  } catch (error) {
    dbUnavailable(res, 'Run lipsanon statistics write failed', error, 'run_lipsanon_statistics_unavailable');
  }
});

// --- Administrator playtest interventions (ADR-0194) -----------------------
// Battles are deliberately client-simulated, including the surrounding Run model.
// This endpoint is the server-owned capability check for every administrator control:
// the UI may expose an affordance from /api/auth/me, but no intervention is armed or
// applied until this fail-closed ADMIN_EMAILS gate acknowledges its exact shape.
const ADMIN_PLAYTEST_ACTIONS = new Set([
  'free-move',
  'kill-unit',
  'win-battle',
  'gain-gold',
  'gain-lipsanon',
]);
const ADMIN_PLAYTEST_LIPSANA = RUN_LIPSANON_IDS;

app.post('/api/admin/playtest/authorize', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  if (!ADMIN_PLAYTEST_ACTIONS.has(body.action)) {
    res.status(400).json({ error: 'invalid_admin_playtest_action' });
    return;
  }
  if (
    body.action === 'gain-gold'
    && (!isFiniteInteger(body.amountTenths) || body.amountTenths < 1 || body.amountTenths > 10_000_000)
  ) {
    res.status(400).json({ error: 'invalid_admin_gold_amount' });
    return;
  }
  if (
    body.action === 'gain-lipsanon'
    && (
      !ADMIN_PLAYTEST_LIPSANA.has(body.lipsanonId)
      || (
        body.targetUnitId !== undefined
        && (typeof body.targetUnitId !== 'string' || !body.targetUnitId || body.targetUnitId.length > 160)
      )
    )
  ) {
    res.status(400).json({ error: 'invalid_admin_lipsanon_grant' });
    return;
  }
  res.status(200).json({ ok: true, action: body.action });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.use((req, res, next) => {
  if (Object.hasOwn(req.query || {}, 'screen')) {
    res.status(404).send('not found');
    return;
  }
  next();
});
// Cache policy for statically-served files. Three tiers:
//   - HTML (the app shell / SPA fallback): no-cache, so a new deploy is always
//     picked up on the next navigation.
//   - Vite content-hashed bundles: emitted as flat files directly under
//     app-code/ with a content hash in the name (e.g. app-code/index-Cy4ekEXV.js).
//     The name changes whenever the bytes change, so these are immutable for a
//     year. `/assets/*` is not static at all; the live-media backend route owns it.
//   - Other public app code: a modest 1h TTL that trims repeat-visit payload but
//     stays short enough that a hot static override is reflected quickly.
const VITE_HASHED_ASSET = /^app-code\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/;
function makeStaticCacheHeaders(rootDir) {
  return (res, filePath) => {
    const rel = path.relative(rootDir, filePath).split(path.sep).join('/');
    if (path.extname(filePath).toLowerCase() === '.html') {
      res.setHeader('Cache-Control', 'no-cache');
      return;
    }
    if (VITE_HASHED_ASSET.test(rel)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
  };
}

// --- Open Graph unfurls + on-demand board thumbnails ------------------------
// Shared content links must unfurl on Discord/Slack/Twitter (crawlers fetch the
// URL server-side — no JS, no auth). The SPA fallback injects route-specific
// og:/twitter: tags. Levels point at an on-demand board render; canonical lipsanon
// addresses point at the exact installed live icon. Generic pages use the
// branded default-image semantic slot. Targeted media never masks missing
// content/media with it.
const OG_SITE_NAME = 'Chess Tactics';
const OG_DEFAULT_DESC = 'Tactical chess battles on a living board.';
// Owner-facing objective labels — mirrors frontend core/objectives.ts MODE_NAME (5 stable entries).
const OG_MODE_NAME = {
  'capture-all': 'Last Man Standing', 'capture-king': 'King Assault',
  'rival-kings': 'Rival Kings', survive: 'Survive', reach: 'Reach',
};

// mtime-cached file read: HTML is served no-cache so crawlers re-hit — keep it allocation-light while
// still reflecting a STATIC_FRONTEND_DIR hot-swap. null-safe (never throws).
const _fileCache = new Map();
function readFileCached(absPath) {
  let stat;
  try { stat = fs.statSync(absPath); } catch { return null; }
  const hit = _fileCache.get(absPath);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit.content;
  let content;
  try { content = fs.readFileSync(absPath, 'utf8'); } catch { return null; }
  _fileCache.set(absPath, { mtimeMs: stat.mtimeMs, content });
  return content;
}
function htmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Official campaigns for the OG/thumbnail path come ONLY from the LIVE DB — the same source the game
// loads (GET /api/official-campaigns/default) — so a thumbnail can never drift from a re-published
// level. A short TTL keeps the crawler hot path off the DB (≤1 query/minute); the last SUCCESSFUL
// read is kept in memory so a transient DB blip still serves REAL (last-known) data. There is no
// committed fixture: stale/test data must be impossible to show on a remote unfurl. On a cold start
// during a DB outage (no cached read yet) this resolves to empty → the generic card.
const OFFICIAL_WS_TTL_MS = 60 * 1000;
let _officialCache = { at: 0, ws: null }; // last SUCCESSFUL DB read
async function officialWorkspace() {
  const now = Date.now();
  if (_officialCache.ws && now - _officialCache.at < OFFICIAL_WS_TTL_MS) return _officialCache.ws;
  try {
    const doc = await dbGetOfficialCampaigns('default');
    const data = doc && doc.data;
    if (data && Array.isArray(data.campaigns) && data.campaigns.length) {
      _officialCache = {
        at: now,
        ws: { campaigns: data.campaigns, levels: data.levels && typeof data.levels === 'object' ? data.levels : {} },
      };
      return _officialCache.ws;
    }
  } catch { /* DB unreachable — fall through to the last-good real read below, else empty */ }
  return _officialCache.ws || { campaigns: [], levels: {} };
}
const {
  thumbnailAvailabilityCatalogFromRows,
  thumbnailSourceAvailability,
} = require(path.join(bakedBackendDir, 'thumbnailAvailability'));
let _thumbnailMediaAvailabilityCache = { revision: null, catalog: null };
async function thumbnailPropSeats(queryable = null) {
  return requirePropSeatsDocument('default', await dbGetPropSeats('default', queryable));
}
async function thumbnailMediaAvailabilityCatalog(mediaCatalog, queryable = null) {
  if (!mediaCatalog) return null;
  const expectedRevision = Number(mediaCatalog.revision || 0);
  if (
    !queryable
    && _thumbnailMediaAvailabilityCache.catalog
    && _thumbnailMediaAvailabilityCache.revision === expectedRevision
  ) return _thumbnailMediaAvailabilityCache.catalog;
  try {
    if (!queryable) await ensureDbReady();
    // One statement gives policy rows and their catalog revision from the same
    // PostgreSQL snapshot. Public catalogs omit unavailable decorative slots;
    // thumbnails still need those slots' DB-owned fail-soft policy.
    const { rows } = await (queryable || pool).query(
      `SELECT state.revision AS catalog_revision, s.slot, s.availability_policy
         FROM media_catalog_state state
         LEFT JOIN media_slots s ON true
        WHERE state.singleton = true
        ORDER BY s.slot`,
    );
    const catalog = thumbnailAvailabilityCatalogFromRows(mediaCatalog, rows);
    if (catalog === mediaCatalog) return mediaCatalog;
    if (!queryable) {
      _thumbnailMediaAvailabilityCache = { revision: expectedRevision, catalog };
    }
    return catalog;
  } catch (error) {
    if (queryable) throw error;
    // The deliverable catalog still classifies every active version. Unknown
    // sources fail closed as critical in the renderer adapter.
    return mediaCatalog;
  }
}
async function loadThumbnailRenderInputs(queryable = null) {
  // A derivative fingerprints the exact plan and sources projected from this
  // snapshot. Global revisions isolate loader caches and snapshot freshness;
  // they are deliberately not derivative invalidation keys.
  // The public projection's short TTL is appropriate for request fan-out, but
  // reusing it here can still mint a brand-new derivative from an old snapshot.
  // Mutation callers pass their transaction client through every reader. This
  // is both the authoritative transaction view and a hard no-extra-checkout
  // boundary when the pool's remaining connections are occupied.
  const {
    mediaCatalog,
    drawableCatalog,
    seats,
    unitCatalog,
    mediaAvailability,
  } = await loadRendererSnapshotSources({
    queryable,
    readMediaCatalog: (db) => dbReadMediaCatalog({ queryable: db }),
    readDrawableCatalog: (db) => dbReadDrawableCatalog({ queryable: db }),
    readPropSeats: (db) => thumbnailPropSeats(db),
    readUnitCatalog: (db) => (db ? dbReadUnitCatalog({ queryable: db }) : publicUnitCatalog()),
    readMediaAvailability: (catalog, db) => thumbnailMediaAvailabilityCatalog(catalog, db),
  });
  const mediaCatalogRevision = mediaCatalog.revision || 0;
  return {
    mediaCatalogRevision,
    mediaCatalog,
    drawableCatalog,
    mediaAvailability,
    propSeats: seats.data,
    unitCatalog,
  };
}
async function withThumbnailRenderInputs(task, queryable = null) {
  if (!serverRender || typeof serverRender.applyServerThumbnailSnapshot !== 'function') {
    throw new Error('bounded thumbnail renderer snapshot validator is unavailable');
  }
  const renderInputs = await loadThumbnailRenderInputs(queryable);
  return withAppliedThumbnailRenderInputs(renderInputs, task);
}
async function withAppliedThumbnailRenderInputs(renderInputs, task) {
  if (!serverRender || typeof serverRender.applyServerThumbnailSnapshot !== 'function') {
    throw new Error('bounded thumbnail renderer snapshot validator is unavailable');
  }
  return withServerRenderCriticalSection(async () => {
    serverRender.applyServerThumbnailSnapshot(renderInputs);
    return task(renderInputs);
  });
}
const BOARD_THUMBNAIL_RENDER_REVISION = 9;

function thumbnailVersion(
  plan,
  renderInputs,
  {
    kind = 'board-thumbnail',
    exactRenderInputs = { plan },
    extraSources = [],
  } = {},
) {
  return thumbnailContentVersionForPlan({
    kind,
    rendererRevision: BOARD_THUMBNAIL_RENDER_REVISION,
    plan,
    exactRenderInputs,
    extraSources,
    mediaCatalog: renderInputs.mediaCatalog,
    mediaAvailability: renderInputs.mediaAvailability,
  });
}

function prepareLevelThumbnailEntry(rawEntry, renderInputs) {
  const [authorityKey, second, third] = rawEntry;
  const levelId = third === undefined ? null : second;
  const level = third === undefined ? second : third;
  const plan = serverRender.levelRenderPlan(level);
  return {
    authorityKey,
    levelId,
    level,
    plan,
    contentVersion: thumbnailVersion(plan, renderInputs),
  };
}

async function prepareLevelThumbnailEntries(entries, providedRenderInputs = null) {
  if (!serverRender) throw new Error('thumbnail renderer unavailable');
  const renderInputs = providedRenderInputs || await loadThumbnailRenderInputs();
  // ADR-0258: plan projection is CPU work proportional to the level count. Yield
  // between levels so a cold pass never starves unrelated requests; the critical
  // section stays held, which other render users already queue on.
  const prepared = await withAppliedThumbnailRenderInputs(renderInputs, async () => {
    const projected = [];
    for (const entry of entries) {
      projected.push(prepareLevelThumbnailEntry(entry, renderInputs));
      await new Promise((resolve) => setImmediate(resolve));
    }
    return projected;
  });
  return { renderInputs, entries: prepared };
}

async function storedLevelThumbnail(authorityKey) {
  await ensureDbReady();
  const { rows } = await pool.query(
    `SELECT authority_key, content_version, blob_sha256, width, height
       FROM level_thumbnail_derivatives WHERE authority_key = $1`,
    [authorityKey],
  );
  return rows[0] || null;
}

async function currentStoredLevelThumbnailUrls(preparedEntries) {
  if (!preparedEntries.length) return {};
  await ensureDbReady();
  const keys = preparedEntries.map((entry) => entry.authorityKey);
  const entryByAuthority = new Map(preparedEntries.map((entry) => [entry.authorityKey, entry]));
  const { rows } = await pool.query(
    `SELECT authority_key, content_version, blob_sha256
       FROM level_thumbnail_derivatives
      WHERE authority_key = ANY($1::text[])`,
    [keys],
  );
  return Object.fromEntries(rows.flatMap((row) => {
    const entry = entryByAuthority.get(row.authority_key);
    if (!entry) return [];
    if (row.content_version !== entry.contentVersion) return [];
    const url = row.authority_key.startsWith('user:')
      ? `/api/campaign-workspace/level-thumbnails/${encodeURIComponent(entry.levelId)}/${row.blob_sha256}.png`
      : `/api/media/${row.blob_sha256}`;
    return [[entry.levelId, url]];
  }));
}

async function storedLevelThumbnailUrls(authorityEntries) {
  const preparedBatch = await prepareLevelThumbnailEntries(authorityEntries);
  const current = await currentStoredLevelThumbnailUrls(preparedBatch.entries);
  const missing = preparedBatch.entries.filter((entry) => !Object.hasOwn(current, entry.levelId));
  if (!missing.length) return current;

  const retries = await ensurePreparedLevelThumbnailDerivativeBatch(missing, preparedBatch.renderInputs);
  for (const retry of retries) {
    if (retry.status === 'rejected') {
      console.error('canonical level thumbnail read repair failed:', retry.reason && retry.reason.message);
    }
  }
  return currentStoredLevelThumbnailUrls(preparedBatch.entries);
}

const levelThumbnailDerivativeInFlight = new Map();

// ADR-0258 read-side memo plumbing. The inputs key concatenates every
// revision-tracked catalog input that can change a thumbnail manifest; the
// document revision rides separately in the memo so a retained manifest can
// never cross level sets. One UNION round trip keeps the freshness check ~free.
async function thumbnailManifestInputsKey() {
  await ensureDbReady();
  const { rows } = await pool.query(
    `SELECT 'media' AS source, revision FROM media_catalog_state WHERE singleton = true
     UNION ALL SELECT 'drawable', revision FROM drawable_catalog_state WHERE singleton = true
     UNION ALL SELECT 'unit', revision FROM unit_catalog_state WHERE singleton = true
     UNION ALL SELECT 'prop-seats', revision FROM prop_seats WHERE id = 'default'`,
  );
  const revisions = new Map(rows.map((row) => [row.source, Number(row.revision)]));
  return [
    `m${revisions.get('media') ?? 0}`,
    `d${revisions.get('drawable') ?? 0}`,
    `u${revisions.get('unit') ?? 0}`,
    `p${revisions.get('prop-seats') ?? 0}`,
    `r${BOARD_THUMBNAIL_RENDER_REVISION}`,
    `s${THUMBNAIL_DEPENDENCY_SCHEMA_VERSION}`,
  ].join('-');
}

async function storedLevelThumbnailManifest(authorityEntries) {
  const value = await storedLevelThumbnailUrls(authorityEntries);
  // A gap means a derivative could not be repaired. Retain but never settle:
  // reads stay fast while later reads keep retrying in the background.
  const settled = authorityEntries.every((entry) => Object.hasOwn(value, entry[1]));
  return { value, settled };
}

async function memoizedLevelThumbnailUrls(key, docRevision, authorityEntries) {
  const read = await thumbnailManifestMemo.read({
    key,
    docRevision,
    inputsKey: await thumbnailManifestInputsKey(),
    compute: () => storedLevelThumbnailManifest(authorityEntries),
  });
  return read.value;
}

// ADR-0258: after a deploy the officials manifest recomputes in the background
// so no reader ever pays the cold pass. Best-effort by design.
function warmOfficialCampaignThumbnailManifest(reason) {
  (async () => {
    const id = officialCampaignsRowId('default');
    const document = await dbGetOfficialCampaigns(id);
    const portfolio = publicOfficialCampaignsDocument(id, document);
    const levels = isObjectRecord(portfolio.data?.levels) ? portfolio.data.levels : {};
    await memoizedLevelThumbnailUrls(
      `official:${id}`,
      `v${portfolio.revision}`,
      Object.entries(levels).map(([levelId, level]) => [`official:${id}:${levelId}`, levelId, level]),
    );
  })().catch((error) => {
    console.error(`official thumbnail manifest warmup failed (${reason}):`, error && error.message);
  });
}

async function createPreparedLevelThumbnailDerivative(prepared, renderInputs) {
  if (!serverRender) throw new Error('thumbnail renderer unavailable');
  const current = await storedLevelThumbnail(prepared.authorityKey);
  if (current && current.content_version === prepared.contentVersion) return current;

  const privateAuthority = /^user:(.+):([^:]+)$/.exec(prepared.authorityKey);
  const selectedSurface = privateAuthority
    ? decodedVersionedPredrawnSurface(prepared.level, { activeOnly: true })
    : null;
  const privateBackgroundScope = privateAuthority
    ? {
        ownerEmail: privateAuthority[1],
        levelId: privateAuthority[2],
        allowedVersionIds: new Set([
          selectedSurface?.background_version_id,
          selectedSurface?.occlusion_version_id,
        ].filter(Boolean)),
      }
    : null;

  const { renderBoardThumbnail, BOARD_THUMB_W, BOARD_THUMB_H } = require(path.join(bakedBackendDir, 'boardThumbnail'));
  const png = await renderBoardThumbnail({
    plan: prepared.plan,
    loadDynamicSprite: (src) => thumbnailDynamicSprite(
      src,
      renderInputs.mediaCatalog,
      privateBackgroundScope,
    ),
    mediaCatalogRevision: renderInputs.mediaCatalogRevision,
    sourceAvailability: (src) => thumbnailSourceAvailability(src, renderInputs.mediaAvailability),
  });
  const contentVersion = prepared.contentVersion;
  const width = BOARD_THUMB_W;
  const height = BOARD_THUMB_H;
  const sha256 = crypto.createHash('sha256').update(png).digest('hex');
  const blobKey = liveMediaBlobKey(sha256);
  const publishDerivative = prepared.authorityKey.startsWith('official:');
  await writeLiveMediaBlob(blobKey, png, sha256, 'image/png');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO media_blobs (sha256, blob_key, media_type, byte_length, width, height, published_at)
       VALUES ($1, $2, 'image/png', $3, $4, $5, CASE WHEN $6::boolean THEN now() ELSE NULL END)
       ON CONFLICT (sha256) DO UPDATE SET published_at = CASE
         WHEN $6::boolean THEN COALESCE(media_blobs.published_at, now())
         ELSE media_blobs.published_at
       END`,
      [sha256, blobKey, png.length, width, height, publishDerivative],
    );
    const { rows } = await client.query(
      `INSERT INTO level_thumbnail_derivatives
         (authority_key, content_version, blob_sha256, width, height)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (authority_key) DO UPDATE SET
         content_version = EXCLUDED.content_version,
         blob_sha256 = EXCLUDED.blob_sha256,
         width = EXCLUDED.width,
         height = EXCLUDED.height,
         updated_at = now()
       RETURNING authority_key, content_version, blob_sha256, width, height`,
      [prepared.authorityKey, contentVersion, sha256, width, height],
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function ensurePreparedLevelThumbnailDerivative(prepared, renderInputs) {
  const existing = levelThumbnailDerivativeInFlight.get(prepared.authorityKey);
  if (existing) {
    if (existing.contentVersion === prepared.contentVersion) return existing.pending;
    await existing.pending.catch(() => {});
    return ensureLevelThumbnailDerivative(prepared.authorityKey, prepared.level);
  }
  const pending = withLevelThumbnailRenderSlot(() => (
    createPreparedLevelThumbnailDerivative(prepared, renderInputs)
  ));
  const record = { contentVersion: prepared.contentVersion, pending };
  levelThumbnailDerivativeInFlight.set(prepared.authorityKey, record);
  try {
    return await pending;
  } finally {
    if (levelThumbnailDerivativeInFlight.get(prepared.authorityKey) === record) {
      levelThumbnailDerivativeInFlight.delete(prepared.authorityKey);
    }
  }
}

async function ensureLevelThumbnailDerivative(authorityKey, level) {
  const preparedBatch = await prepareLevelThumbnailEntries([[authorityKey, level]]);
  return ensurePreparedLevelThumbnailDerivative(preparedBatch.entries[0], preparedBatch.renderInputs);
}

async function ensurePreparedLevelThumbnailDerivativeBatch(entries, renderInputs) {
  return Promise.allSettled(entries.map((entry) => (
    ensurePreparedLevelThumbnailDerivative(entry, renderInputs)
  )));
}

async function ensureLevelThumbnailDerivativeBatch(entries) {
  if (!entries.length) return [];
  const preparedBatch = await prepareLevelThumbnailEntries(entries);
  return ensurePreparedLevelThumbnailDerivativeBatch(preparedBatch.entries, preparedBatch.renderInputs);
}

function playScreenName(input) {
  if (serverRender && typeof serverRender.playRouteScreenName === 'function') {
    try { return serverRender.playRouteScreenName({ path: '/play', ...input }); } catch { /* fall back below */ }
  }
  if (input && input.mapId) return 'Community Map';
  if (input && input.campaignId && input.levelId) return 'Campaign';
  if (input && input.levelId) return 'Official Level';
  return 'Skirmish';
}
// Resolve a share reference to { level, title, subtitle, description }. Officials read the live
// official workspace cache; user maps read public_maps. Returns null when unresolvable.
async function resolveShareTarget({ levelId, campaignId, mapId }) {
  if (mapId) {
    const row = await dbGetPublicMap(mapId).catch(() => null);
    if (!row || !row.body || typeof row.body !== 'object') return null;
    const level = row.body;
    const objective = OG_MODE_NAME[level.objective] || null;
    return {
      level,
      screenName: playScreenName({ mapId }),
      title: row.name || level.name || OG_SITE_NAME,
      subtitle: objective ? `Community map · ${objective}` : 'Community map',
      description: objective ? `A community-made ${objective} map.` : OG_DEFAULT_DESC,
    };
  }
  if (levelId && OFFICIAL_WORKSPACE_ID_PATTERN.test(levelId)) {
    const ws = await officialWorkspace();
    const level = Object.hasOwn(ws.levels, levelId) && ws.levels[levelId] && typeof ws.levels[levelId] === 'object'
      ? ws.levels[levelId] : null;
    if (!level) return null;
    const campaign = campaignId ? ws.campaigns.find((c) => c && c.id === campaignId) || null : null;
    const objective = OG_MODE_NAME[level.objective] || null;
    return {
      level,
      screenName: playScreenName({ levelId, campaignId: campaign ? campaignId : null }),
      title: campaign && campaign.name ? `${level.name} — ${campaign.name}` : (level.name || OG_SITE_NAME),
      subtitle: [campaign && campaign.name, objective].filter(Boolean).join(' · ') || null,
      description: level.notes || (campaign && campaign.name ? `A level in ${campaign.name}.` : OG_DEFAULT_DESC),
    };
  }
  return null;
}

// On-demand board thumbnail: /assets/level-thumb/<id>.png (?v=<hash> only busts caches).
// Registered before express.static so the .png is not handled by the SPA asset guard.
const { ByteWeightedAsyncCache } = require(path.join(bakedBackendDir, 'byteWeightedCache'));
const THUMB_CACHE_MAX_BYTES = 24 * 1024 * 1024;
const _thumbCache = new ByteWeightedAsyncCache({ maxBytes: THUMB_CACHE_MAX_BYTES });

async function prepareLevelCardThumbnail(target, providedRenderInputs = null) {
  const renderInputs = providedRenderInputs || await loadThumbnailRenderInputs();
  const prepared = await withAppliedThumbnailRenderInputs(renderInputs, () => {
    const plan = serverRender.levelRenderPlan(target.level);
    const backgroundSrc = typeof serverRender.worldBackgroundSrc === 'function'
      ? serverRender.worldBackgroundSrc()
      : null;
    const presentation = resolveLevelCardPresentation(renderInputs.drawableCatalog);
    const extraSources = [
      backgroundSrc,
      presentation.fontSrc,
      ...Object.values(presentation.uiMedia),
    ].filter(Boolean);
    const exactRenderInputs = {
      plan,
      title: target.title || null,
      subtitle: target.subtitle || null,
      screenName: target.screenName || null,
      backgroundSrc,
      presentation,
    };
    return {
      plan,
      backgroundSrc,
      presentation,
      contentVersion: thumbnailVersion(plan, renderInputs, {
        kind: 'level-card',
        exactRenderInputs,
        extraSources,
      }),
    };
  });
  return { ...prepared, renderInputs };
}

app.get(/^\/assets\/level-thumb\/(.+)\.png$/, async (req, res) => {
  const id = String(req.params[0] || '');
  const isOfficial = OFFICIAL_WORKSPACE_ID_PATTERN.test(id);
  const isMap = PUBLIC_ID_RE.test(id);
  const campaignId = typeof req.query.campaignId === 'string' ? req.query.campaignId : null;
  if (!isOfficial && !isMap) { res.status(404).send('not found'); return; }
  try {
    if (!serverRender) { res.status(503).json({ error: 'thumbnail_renderer_unavailable' }); return; }
    const target = await resolveShareTarget(isOfficial ? { levelId: id, campaignId } : { mapId: id });
    if (!target) { res.status(404).send('not found'); return; }
    const prepared = await prepareLevelCardThumbnail(target);
    const cacheKey = `${id}:${campaignId || ''}:${prepared.contentVersion}`;
    const png = await _thumbCache.getOrCreate(cacheKey, () => (
      withLevelThumbnailRenderSlot(async () => {
        const { renderLevelCard } = require(path.join(bakedBackendDir, 'boardThumbnail'));
        return renderLevelCard({
          plan: prepared.plan,
          title: target.title,
          subtitle: target.subtitle,
          screenName: target.screenName,
          backgroundSrc: prepared.backgroundSrc,
          loadDynamicSprite: (src) => thumbnailDynamicSprite(src, prepared.renderInputs.mediaCatalog),
          mediaCatalogRevision: prepared.renderInputs.mediaCatalogRevision,
          sourceAvailability: (src) => thumbnailSourceAvailability(src, prepared.renderInputs.mediaAvailability),
          fontSrc: prepared.presentation.fontSrc,
          uiMedia: prepared.presentation.uiMedia,
        });
      })
    ));
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).end(png);
  } catch (error) {
    console.error('level-thumb render failed:', error && error.message);
    res.status(503).json({ error: 'thumbnail_render_unavailable' });
  }
});

// Stable semantic asset resolution. This is deliberately before every static
// middleware so an absent DB slot can never fall through to a packaged file.
// The server-rendered level-thumbnail route above is the sole dynamic /assets namespace carveout.
app.get(/^\/assets\/(?!level-thumb\/)(.+)$/, async (req, res) => {
  let slot = null;
  try {
    const encoded = req.path.slice('/assets/'.length);
    slot = mediaSlotId(encoded.split('/').map(decodeURIComponent).join('/'));
  } catch { slot = null; }
  if (!slot) { res.setHeader('Cache-Control', 'no-store'); res.status(404).send('not found'); return; }
  try {
    const record = await publicMediaSlotById(slot);
    if (!record || !record.media) { res.setHeader('Cache-Control', 'no-store'); res.status(404).send('not found'); return; }
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.setHeader('Location', record.media.immutableUrl);
    res.status(302).end();
  } catch (error) {
    dbUnavailable(res, 'asset slot resolution failed', error, 'asset_slot_unavailable');
  }
});

async function ogTagsFor(req) {
  const origin = publicOrigin; // TRUSTED canonical origin, never the spoofable Host header
  const levelId = typeof req.query.levelId === 'string' ? req.query.levelId : null;
  const campaignId = typeof req.query.campaignId === 'string' ? req.query.campaignId : null;
  const mapId = typeof req.query.map === 'string' && PUBLIC_ID_RE.test(req.query.map) ? req.query.map : null;
  const lipsanonMatch = /^\/enchiridion\/lipsana\/([a-z][a-z0-9-]*)\/?$/.exec(req.path);
  const lipsanon = lipsanonMatch && Object.hasOwn(LIPSANON_BY_ID, lipsanonMatch[1])
    ? LIPSANON_BY_ID[lipsanonMatch[1]]
    : null;
  const target = lipsanon ? null : await resolveShareTarget({ levelId, campaignId, mapId }).catch(() => null);

  let title = OG_SITE_NAME;
  let description = OG_DEFAULT_DESC;
  const drawableCatalog = await dbReadDrawableCatalog();
  let image = null;
  let imageWidth = 1200;
  let imageHeight = 630;
  let imageType = 'image/png';
  let imageAlt = `${OG_SITE_NAME} preview`;
  let twitterCard = 'summary_large_image';
  if (lipsanon) {
    const icon = resolveLipsanonIcon(drawableCatalog, lipsanon.id);
    title = lipsanon.name;
    description = lipsanon.description;
    image = `${origin}${icon.src}`;
    imageWidth = icon.width;
    imageHeight = icon.height;
    imageType = icon.mediaType;
    imageAlt = `${lipsanon.name} lipsanon`;
    twitterCard = 'summary';
  } else {
    const defaultOgPath = resolveDefaultOgImage(drawableCatalog);
    image = `${origin}${defaultOgPath}`;
    if (target) {
      title = target.title || OG_SITE_NAME;
      description = target.description || target.subtitle || OG_DEFAULT_DESC;
      imageAlt = `${title} board preview`;
      if (serverRender) {
        const key = mapId || levelId;
        let hash = '';
        try {
          hash = (await prepareLevelCardThumbnail(target)).contentVersion;
        } catch { hash = ''; }
        const imageParams = new URLSearchParams();
        if (hash) imageParams.set('v', hash);
        if (campaignId && key === levelId) imageParams.set('campaignId', campaignId);
        const qs = imageParams.toString();
        image = `${origin}/assets/level-thumb/${encodeURIComponent(key)}.png${qs ? `?${qs}` : ''}`;
      }
    }
  }
  const url = `${origin}${req.originalUrl}`;
  const meta = [
    ['og:type', 'website'], ['og:site_name', OG_SITE_NAME], ['og:title', title],
    ['og:description', description], ['og:url', url], ['og:image', image],
    ['og:image:type', imageType], ['og:image:width', imageWidth], ['og:image:height', imageHeight],
    ['og:image:alt', imageAlt],
  ].map(([p, c]) => `<meta property="${p}" content="${htmlEscape(c)}">`);
  const tw = [
    ['twitter:card', twitterCard], ['twitter:title', title],
    ['twitter:description', description], ['twitter:image', image], ['twitter:image:alt', imageAlt],
  ].map(([n, c]) => `<meta name="${n}" content="${htmlEscape(c)}">`);
  return { title, headTags: [...meta, ...tw].join('') };
}
async function renderShellWithOg(req) {
  const html = readFileCached(frontendIndexFile());
  if (html == null) return null;
  const { title, headTags } = await ogTagsFor(req);
  // Function replacers: a level name/notes can contain `$`, which a STRING replacement would treat
  // as a special pattern ($&/$'/$$) and corrupt the head.
  let out = html.replace('</head>', () => `${headTags}</head>`);
  if (title !== OG_SITE_NAME) out = out.replace(/<title>[^<]*<\/title>/, () => `<title>${htmlEscape(title)}</title>`);
  return out;
}

if (staticFrontendDir) {
  // index:false so a request for '/' (or a directory) is NOT served the untagged index.html here —
  // it falls through to the OG-injecting SPA fallback below.
  app.use(express.static(staticFrontendDir, { index: false, setHeaders: makeStaticCacheHeaders(staticFrontendDir) }));
}
app.use((req, res, next) => {
  if (MIGRATED_RAW_ASSET_PATHS.has(req.path)) {
    res.status(404).send('not found');
    return;
  }
  next();
});
app.use(express.static(frontendDir, { index: false, setHeaders: makeStaticCacheHeaders(frontendDir) }));

// SPA fallback: serve index.html for client routes. Only 404 for genuine
// static-asset extensions (a missing .png/.js/etc.) — NOT for app routes whose
// last path segment merely contains dots, e.g.
// /design/catalog/main-menu-buttons/button-9slice.main-menu.
const STATIC_ASSET_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico',
  '.css', '.js', '.mjs', '.map', '.json', '.wasm', '.txt', '.xml',
  '.woff', '.woff2', '.ttf', '.eot', '.webmanifest',
  '.mp3', '.wav', '.ogg', '.mp4', '.webm',
]);
app.use(async (req, res) => {
  if (STATIC_ASSET_EXTENSIONS.has(path.extname(req.path).toLowerCase())) {
    res.status(404).send('not found');
    return;
  }
  res.setHeader('Cache-Control', 'no-cache');
  // Inject per-level Open Graph tags so the link unfurls on Discord/Slack/Twitter; on any failure
  // fall back to streaming the untagged shell so the app never fails to serve.
  let html = null;
  try { html = await renderShellWithOg(req); } catch { html = null; }
  if (html == null) {
    res.sendFile(frontendIndexFile(), { dotfiles: 'allow' });
    return;
  }
  res.type('html').send(html);
});

function startServer() {
  app.listen(port, () => {
    console.log(`chess-tactics listening on :${port}`);
  });
}

// Configure the durable store, then start the recoverable process. A database or
// schema failure does not crash-loop the pod: `/health` remains live and
// ensureDbReady() retries. `/ready` stays 503, however, so Kubernetes never sends
// game traffic to a process that cannot resolve its live assets.
pool = buildPool();
if (schemaMigrationCommand) {
  if (!pool) {
    console.error('schema migration command requires DATABASE_URL or POSTGRES_HOST/POSTGRES_DATABASE/POSTGRES_USER');
    process.exitCode = 1;
  } else if (schemaMigrationMode !== 'auto') {
    console.error('schema migration command requires SCHEMA_MIGRATIONS=auto');
    process.exitCode = 1;
    pool.end().catch(() => {});
  } else {
    console.log(
      `postgres schema migration target: ${formatSchemaMigrationTarget(schemaMigrationTarget(process.env))}`,
    );
    pool.on('error', (error) => console.error('postgres pool error:', error));
    runMigrations()
      .then((report) => {
        console.log(`postgres schema migration complete; ${formatMigrationRunResult(report)}`);
      })
      .catch((error) => {
        if (error instanceof MigrationExecutionError) {
          console.error(`postgres schema migration failed; ${formatMigrationRunFailure(error)}`);
        } else {
          console.error('postgres schema migration failed:', error);
        }
        process.exitCode = 1;
      })
      .finally(() => pool.end());
  }
} else if (pool) {
  if (schemaMigrationMode === 'auto') {
    console.log(
      `postgres schema migration target: ${formatSchemaMigrationTarget(schemaMigrationTarget(process.env))}`,
    );
  }
  pool.on('error', (error) => console.error('postgres pool error:', error));
  ensureDbReady()
    .then(() => {
      console.log(`postgres ready (mode=${databaseUrl ? 'connection-string' : 'workload-identity'}, schema=${schemaMigrationMode}); ${schemaReadyMessage()}`);
      warmOfficialCampaignThumbnailManifest('boot');
    })
    .catch((error) => {
      if (error instanceof MigrationExecutionError) {
        console.error(
          `postgres init failed; application readiness will remain 503 until it recovers or schema is prepared; ${formatMigrationRunFailure(error)}`,
        );
      } else {
        console.error('postgres init failed; application readiness will remain 503 until it recovers or schema is prepared:', error);
      }
    })
    .finally(startServer);
} else {
  console.warn('no database configured (set DATABASE_URL, or POSTGRES_HOST/POSTGRES_DATABASE/POSTGRES_USER); application readiness will remain 503');
  startServer();
}
