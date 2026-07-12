const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');

// Shared DOM-free board-render geometry. server.js is hot-copied to and run
// from a temp dir by supervisor.js, so sibling backend assets must resolve from
// the baked backend dir instead of this process' __dirname.
const bakedBackendDir = process.env.BAKED_BACKEND_DIR || __dirname;
const { createByteReadBudget } = require(path.join(bakedBackendDir, 'liveMediaReadBudget'));
const {
  nativeMediaEvidenceIssue,
  preservesNativeEvidenceForUpload,
} = require(path.join(bakedBackendDir, 'liveMediaPolicy'));
let serverRender = null;
try {
  serverRender = require('@chess-tactics/board-render');
} catch (error) {
  console.error('board-render package unavailable; level thumbnails will return 503:', error && error.message);
}

const app = express();
const port = process.env.PORT || 3000;
const frontendDir = process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend', 'dist');
const staticFrontendDir = process.env.STATIC_FRONTEND_DIR || '';
const authBaseUrl = (process.env.AUTH_BASE_URL || 'https://auth.romaine.life').replace(/\/+$/, '');
const publicOrigin = (process.env.PUBLIC_ORIGIN || 'https://chess.romaine.life').replace(/\/+$/, '');
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

// Background music. The browser streams tracks directly from BGM_BASE_URL (the
// public-read blob container). The backend assembles the /api/bgm playlist one
// of two ways:
//   - BGM_READ_URL set -> read a static index.json served there (test slots and
//     local dev point this at a same-origin fixture). Plain HTTPS, no creds.
//   - else, an Azure blob base -> LIST the container live (with each blob's
//     title/artist/album metadata) using the pod's workload identity. The
//     container is the single source of truth: drop or delete a track in the
//     container and the playlist follows it — there is no manifest to regenerate.
// Either way this is non-critical chrome: /api/bgm never 500s — it degrades to
// the last good list, then to an empty playlist.
const bgmBaseUrl = (process.env.BGM_BASE_URL || '').replace(/\/+$/, '');
const bgmIndexUrl = (process.env.BGM_READ_URL || '').replace(/\/+$/, '');
const bgmIsAzureBlob = (() => {
  if (!bgmBaseUrl) return false;
  try { return /(^|\.)blob\.core\.windows\.net$/i.test(new URL(bgmBaseUrl).hostname); }
  catch { return false; }
})();
const BGM_CACHE_TTL_MS = 5 * 60 * 1000;
let bgmCache = { tracks: null, expiry: 0 };
let bgmContainerClient = null; // lazily built Azure ContainerClient (list mode only)

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
function liveMediaServingFlag(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error('LIVE_MEDIA_SERVING_ENABLED must be true or false');
}
function liveMediaImportFlag(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error('LIVE_MEDIA_IMPORT_ENABLED must be true or false');
}
// One-time cutover scaffold: false leaves the legacy static namespace in place
// while migration 18 + admin import run; true switches stable /assets resolution
// and thumbnails to live media. The final deletion-complete cutover removes this
// flag and its legacy branch rather than retaining a permanent fallback switch.
const liveMediaServingEnabled = liveMediaServingFlag(process.env.LIVE_MEDIA_SERVING_ENABLED);
// One-time migration capability. Production enables this only for the staged
// Git cutover; the deletion-complete release removes the endpoint and flag.
const liveMediaImportEnabled = liveMediaImportFlag(process.env.LIVE_MEDIA_IMPORT_ENABLED);
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
    // alone ⇒ global, cloning official_campaigns), holding a map of propId → seat
    // {anchorX,anchorY,scale,w?,h?,base?}. Public GET / admin-gated PUT. The committed
    // propSeats.json is the always-render BASELINE the client overlays this row over,
    // so props never depend on this row (an empty/missing row = "no overrides").
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
    // Global wall art definitions: one row per id holding a map of wallArtId →
    // {label,span,slots[]}. Public GET / admin PUT mirrors prop_seats, with
    // committed wallArt.json as the always-render baseline.
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
];

let pool = null;
let dbReady = false;
let schemaReadinessPromise = null;
const REQUIRED_SCHEMA_MIGRATION_VERSIONS = MIGRATIONS.map((migration) => migration.version);

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

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);
    try {
      await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      const { rows } = await client.query('SELECT version FROM schema_migrations');
      const applied = new Set(rows.map((row) => row.version));
      for (const migration of MIGRATIONS) {
        if (applied.has(migration.version)) continue;
        await client.query('BEGIN');
        try {
          await client.query(migration.sql);
          await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [migration.version]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
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

async function checkMigrations() {
  const client = await pool.connect();
  try {
    const registry = await client.query("SELECT to_regclass('public.schema_migrations') AS table_name");
    if (!registry.rows[0] || !registry.rows[0].table_name) {
      throw new SchemaMigrationRequiredError('schema_migrations table is missing', {
        missing_versions: REQUIRED_SCHEMA_MIGRATION_VERSIONS,
      });
    }
    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.version));
    const missing = REQUIRED_SCHEMA_MIGRATION_VERSIONS.filter((version) => !applied.has(version));
    if (missing.length) {
      throw new SchemaMigrationRequiredError(`schema migrations missing versions: ${missing.join(', ')}`, {
        missing_versions: missing,
      });
    }
  } finally {
    client.release();
  }
}

async function prepareDbSchema() {
  if (schemaMigrationMode === 'off') {
    // The caller explicitly owns schema readiness.
  } else if (schemaMigrationMode === 'auto') {
    await runMigrations();
  } else {
    await checkMigrations();
  }
  if (unitAssetSeedCatalogUrl) await seedUnitCatalogFromLiveSource();
  if (liveMediaSeedCatalogUrl) await seedLiveMediaCatalogFromLiveSource();
  if (schemaMigrationMode !== 'off') {
    const activeMedia = await pool.query("SELECT count(*) AS count FROM media_slots WHERE lifecycle_state = 'active'");
    if (Number(activeMedia.rows[0]?.count) > 0 && !liveMediaStorageConfigured()) {
      throw new Error('live media catalog has active slots but no live media object store is configured');
    }
  }
  dbReady = true;
}

function schemaReadyMessage() {
  if (schemaMigrationMode === 'auto') return 'schema migrations applied';
  if (schemaMigrationMode === 'off') return 'schema migrations skipped';
  return 'schema migrations verified';
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
  const responseCode = error && error.code === 'schema_migration_required' ? error.code : code;
  const details = responseCode === 'schema_migration_required' && error.details ? { details: error.details } : {};
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

function requestOrigin(req) {
  if (process.env.PUBLIC_ORIGIN) return publicOrigin;

  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host');
  if (!host) return publicOrigin;
  return `${proto}://${host}`;
}

function callbackUrl(req) {
  const pathOnly = safeReturnPath(req.query.returnTo);
  return `${requestOrigin(req)}${pathOnly}`;
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
// Prod pods never set DEV_AUTH and their ingress Host is chess.romaine.life, so a
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

async function readSession(req) {
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
  }
  const cookie = req.get('cookie');
  if (!cookie) return null;
  const upstream = await fetch(`${authBaseUrl}/api/auth/get-session`, {
    headers: {
      accept: 'application/json',
      cookie,
    },
  });
  if (!upstream.ok) {
    const error = new Error('auth_unavailable');
    error.statusCode = 502;
    throw error;
  }
  return upstream.json();
}

async function requireUser(req, res) {
  let session;
  try {
    session = await readSession(req);
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

function forwardSetCookie(upstream, res) {
  const cookies = typeof upstream.headers.getSetCookie === 'function'
    ? upstream.headers.getSetCookie()
    : [upstream.headers.get('set-cookie')].filter(Boolean);
  cookies.forEach((cookie) => res.append('set-cookie', cookie));
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

// Readable fallback title from a slugged blob name, used only when a track has no
// `title` metadata yet (e.g. just dropped in the container, not synced). e.g.
// "03-heavens-devils.mp3" -> "Heavens Devils".
function bgmTitleFromName(file) {
  const base = String(file).replace(/\.mp3$/i, '').replace(/^\d+\s*[-._\s]\s*/, '');
  const words = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return words.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1)) || String(file);
}

// List the BGM container's .mp3 blobs with metadata (prod / Azure mode).
// DefaultAzureCredential uses the pod's federated workload-identity token — the
// same mechanism the Postgres pool uses — authorized by the Storage Blob Data
// Reader role on the media account (tofu/storage.tf). Lazily required so non-Azure
// environments (the index path) never load the SDK.
async function listBgmTracksFromContainer() {
  if (!bgmContainerClient) {
    const { BlobServiceClient } = require('@azure/storage-blob');
    const { DefaultAzureCredential } = require('@azure/identity');
    const u = new URL(bgmBaseUrl);
    const service = new BlobServiceClient(`${u.protocol}//${u.host}`, new DefaultAzureCredential());
    bgmContainerClient = service.getContainerClient(u.pathname.replace(/^\/+/, ''));
  }
  const tracks = [];
  for await (const blob of bgmContainerClient.listBlobsFlat({ includeMetadata: true })) {
    if (!/\.mp3$/i.test(blob.name)) continue;
    const md = blob.metadata || {};
    const title = (md.title || '').trim();
    const artist = (md.artist || '').trim();
    const album = (md.album || '').trim();
    tracks.push({
      title: title || bgmTitleFromName(blob.name),
      ...(artist ? { artist } : {}),
      ...(album ? { album } : {}),
      url: `${bgmBaseUrl}/${encodeURIComponent(blob.name)}`,
    });
  }
  // Stable order so the cached payload is deterministic; the player reshuffles.
  tracks.sort((a, b) => a.url.localeCompare(b.url));
  return tracks;
}

// Background-music playlist. The frontend consumes this app-owned contract; the
// blob storage account stays under the backend (borrow primitives, not
// boundaries). Cached briefly so we don't re-list / re-fetch on every page load.
// BGM is non-critical chrome: this endpoint never 500s — it degrades to the
// last good list, then to an empty playlist.
app.get('/api/bgm', async (_req, res) => {
  if (!bgmBaseUrl) {
    res.status(200).json({ tracks: [] });
    return;
  }
  const now = Date.now();
  if (bgmCache.tracks && bgmCache.expiry > now) {
    res.status(200).json({ tracks: bgmCache.tracks });
    return;
  }
  try {
    let tracks;
    if (bgmIndexUrl) {
      const response = await fetch(`${bgmIndexUrl}/index.json`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`index ${response.status}`);
      const index = await response.json();
      const list = Array.isArray(index && index.tracks) ? index.tracks : [];
      tracks = list
        .filter((track) => track && typeof track.file === 'string' && track.file)
        .map((track) => ({
          title: typeof track.title === 'string' && track.title ? track.title : track.file,
          ...(typeof track.artist === 'string' && track.artist ? { artist: track.artist } : {}),
          ...(typeof track.album === 'string' && track.album ? { album: track.album } : {}),
          url: `${bgmBaseUrl}/${encodeURIComponent(track.file)}`,
        }));
    } else if (bgmIsAzureBlob) {
      tracks = await listBgmTracksFromContainer();
    } else {
      tracks = [];
    }
    bgmCache = { tracks, expiry: now + BGM_CACHE_TTL_MS };
    res.status(200).json({ tracks });
  } catch (error) {
    if (bgmCache.tracks) {
      res.status(200).json({ tracks: bgmCache.tracks });
      return;
    }
    console.warn(`/api/bgm: could not load playlist (${bgmIndexUrl ? 'index' : 'list'}): ${error.message}`);
    res.status(200).json({ tracks: [] });
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
    const session = await readSession(req);
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

app.get('/api/auth/sign-in', (req, res) => {
  if (isDevAuthHost(req)) {
    res.setHeader('Set-Cookie', 'better-auth.session=mock-dev-session; Path=/; HttpOnly');
    const returnTo = req.query.returnTo || '/';
    res.redirect(302, returnTo);
    return;
  }
  const next = encodeURIComponent(callbackUrl(req));
  res.redirect(302, `${authBaseUrl}/sign-in/microsoft?callbackURL=${next}`);
});

app.post('/api/auth/sign-out', async (req, res) => {
  const cookie = req.get('cookie');
  if (cookie) {
    try {
      const upstream = await fetch(`${authBaseUrl}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          cookie,
          origin: requestOrigin(req),
        },
        body: '{}',
      });
      forwardSetCookie(upstream, res);
      if (!upstream.ok) {
        res.status(502).json({ error: 'sign_out_failed' });
        return;
      }
    } catch (error) {
      console.error('auth sign-out failed:', error);
      res.status(502).json({ error: 'auth_unavailable' });
      return;
    }
  }
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
const WORKSPACE_ZONE_TYPES = new Set(['region', 'player-spawn', 'enemy-spawn', 'enemy-threat', 'objective', 'falling-rock', 'pawn-promotion']);
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
  if (!Array.isArray(action.zoneIds) || action.zoneIds.length === 0 || action.zoneIds.some((id) => typeof id !== 'string' || !id.trim())) {
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

function isFiniteInteger(value) {
  return Number.isInteger(value) && Number.isFinite(value);
}

function validateWorkspaceCoord(cell, cols, rows) {
  return cell && isFiniteInteger(cell.x) && isFiniteInteger(cell.y)
    && cell.x >= 0 && cell.x < cols && cell.y >= 0 && cell.y < rows;
}

function validateWorkspaceLevel(level, key) {
  if (!level || typeof level !== 'object') return `levels.${key} must be an object`;
  if (level.formatVersion !== 1) return `levels.${key}.formatVersion must be 1`;
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
  if (!Array.isArray(raw.campaigns) || !raw.levels || typeof raw.levels !== 'object' || Array.isArray(raw.levels)) {
    return 'invalid_workspace';
  }
  const levelEntries = Object.entries(raw.levels);
  if (levelEntries.length > 200) return 'workspace_too_large';
  for (const [key, level] of levelEntries) {
    const levelError = validateWorkspaceLevel(level, key);
    if (levelError) return levelError;
  }
  if (raw.campaigns.length > 100) return 'workspace_too_large';
  const campaignIds = new Set();
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
const EDITOR_DOCUMENT_COLUMNS = 'document_id, owner_email, workspace_kind, workspace_id, level_id, body, revision, saved_revision, baseline_hash, created_at, updated_at';

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
    never_saved: !hasSavedBaseline,
    baseline_conflict: Boolean(row && row.baseline_conflict),
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
    never_saved: !hasSavedBaseline,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function editorDocumentError(statusCode, code, row = null, details = null) {
  const error = new Error(code);
  error.statusCode = statusCode;
  error.responseCode = code;
  error.row = row;
  error.details = details;
  return error;
}

function respondEditorDocumentError(res, error, operation) {
  if (error && error.statusCode && error.responseCode) {
    res.status(error.statusCode).json({
      error: error.responseCode,
      ...(error.details ? { details: error.details } : {}),
      ...(error.row ? { document: publicEditorDocument(error.row) } : {}),
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
    try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    throw error;
  } finally {
    client.release();
  }
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

async function dbListEditorDocuments(ownerEmail, {
  includeOfficial = false,
  status = 'all',
  limit = 100,
  offset = 0,
} = {}) {
  await ensureDbReady();
  const { rows } = await pool.query(
    `SELECT document_id, workspace_kind, workspace_id, level_id,
            body->>'name' AS name, revision, saved_revision, baseline_hash, created_at, updated_at
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
  return rows[0] || null;
}

function assertEditorDocumentRevision(row, expectedRevision) {
  if (!row) throw editorDocumentError(404, 'editor_document_not_found');
  if (Number(row.revision) !== expectedRevision) {
    throw editorDocumentError(409, 'editor_document_revision_conflict', row);
  }
}

async function dbCanonicalLevel(client, ownerEmail, workspace, levelId, { lock = false } = {}) {
  if (workspace.kind === 'user') {
    const { rows } = await client.query(
      `SELECT body, updated_at, md5(((body->'levels')->$2)::text) AS level_hash
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

function editorDocumentIsDirty(row) {
  return Number(row && row.revision) !== Number(row && row.saved_revision);
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

  // A clean document has no work to preserve, so follow the newer canonical
  // Level automatically. A dirty document keeps its body and reports the
  // divergence; only Discard may deliberately replace it.
  if (editorDocumentIsDirty(row) || !canonical.level) {
    return { ...row, baseline_conflict: true };
  }
  const parsed = editorDocumentLevel(canonical.level, row.level_id);
  if (parsed.error) throw editorDocumentError(409, 'saved_level_invalid', row, parsed.details);
  const { rows } = await client.query(
    `UPDATE level_working_copies
        SET body = $3::jsonb,
            revision = revision + 1,
            saved_revision = revision + 1,
            baseline_hash = $4,
            updated_at = now()
      WHERE owner_email = $1 AND document_id = $2
      RETURNING ${EDITOR_DOCUMENT_COLUMNS}`,
    [row.owner_email, row.document_id, JSON.stringify(parsed.level), canonical.hash],
  );
  return { ...rows[0], baseline_conflict: false };
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
       VALUES ($1, '{"campaigns":[],"levels":{}}'::jsonb)
       ON CONFLICT (owner_email) DO NOTHING`,
      [ownerEmail],
    );
    const workspaceResult = await client.query(
      'SELECT body FROM campaign_workspaces WHERE owner_email = $1 FOR UPDATE',
      [ownerEmail],
    );
    const workspaceBody = isObjectRecord(workspaceResult.rows[0] && workspaceResult.rows[0].body)
      ? workspaceResult.rows[0].body
      : { campaigns: [], levels: {} };
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
    return rows[0];
  });
}

async function dbLoadEditorDocument(ownerEmail, documentId) {
  return withEditorDocumentTransaction(async (client) => {
    const row = await dbLockEditorDocument(client, ownerEmail, documentId);
    if (!row) return null;
    return dbReconcileEditorDocument(client, row);
  });
}

async function dbAnnotateEditorDocumentBaseline(row, client = pool) {
  if (!row) return row;
  const workspace = { kind: row.workspace_kind, id: row.workspace_id };
  const canonical = await dbCanonicalLevel(client, row.owner_email, workspace, row.level_id);
  return { ...row, baseline_conflict: editorDocumentBaselineChanged(row, canonical) };
}

async function dbAutosaveEditorDocument(ownerEmail, documentId, expectedRevision, level) {
  await ensureDbReady();
  const { rows } = await pool.query(
    `UPDATE level_working_copies
        SET body = $4::jsonb,
            revision = revision + 1,
            saved_revision = CASE
              WHEN md5(($4::jsonb)::text) = baseline_hash THEN revision + 1
              ELSE saved_revision
            END,
            updated_at = now()
      WHERE owner_email = $1 AND document_id = $2 AND revision = $3
      RETURNING ${EDITOR_DOCUMENT_COLUMNS}`,
    [ownerEmail, documentId, expectedRevision, JSON.stringify(level)],
  );
  if (rows[0]) return dbAnnotateEditorDocumentBaseline(rows[0]);
  const current = await dbGetEditorDocument(ownerEmail, documentId);
  if (!current) throw editorDocumentError(404, 'editor_document_not_found');
  throw editorDocumentError(409, 'editor_document_revision_conflict', await dbAnnotateEditorDocumentBaseline(current));
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
       VALUES ($1, '{"campaigns":[],"levels":{}}'::jsonb)
       ON CONFLICT (owner_email) DO NOTHING`,
      [ownerEmail],
    );
    canonical = await dbCanonicalLevel(client, ownerEmail, workspace, levelId, { lock: true });
  }
  const existing = canonical.body || { campaigns: [], levels: {} };
  const existingCampaigns = Array.isArray(existing.campaigns) ? existing.campaigns : [];
  const nextBody = {
    campaigns: editorDocumentCampaignsWithAssignment(existingCampaigns, levelId, level, campaignId),
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

async function dbSaveEditorDocument(ownerEmail, documentId, expectedRevision, requestedLevel, campaignId) {
  return withEditorDocumentTransaction(async (client) => {
    const current = await dbLockEditorDocument(client, ownerEmail, documentId);
    assertEditorDocumentRevision(current, expectedRevision);
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
         VALUES ($1, '{"campaigns":[],"levels":{}}'::jsonb)
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
    const workspaceRevision = await dbPromoteCanonicalLevel(client, ownerEmail, workspace, levelId, level, campaignId);
    const baselineHash = await dbJsonbHash(client, level);
    const { rows } = await client.query(
      `UPDATE level_working_copies
          SET body = $3::jsonb,
              revision = revision + 1,
              saved_revision = revision + 1,
              baseline_hash = $4,
              updated_at = now()
        WHERE owner_email = $1 AND document_id = $2
        RETURNING ${EDITOR_DOCUMENT_COLUMNS}`,
      [ownerEmail, documentId, JSON.stringify(level), baselineHash],
    );
    return { row: rows[0], workspaceRevision };
  });
}

async function dbDiscardEditorDocument(ownerEmail, documentId, expectedRevision) {
  return withEditorDocumentTransaction(async (client) => {
    const current = await dbLockEditorDocument(client, ownerEmail, documentId);
    assertEditorDocumentRevision(current, expectedRevision);
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
              updated_at = now()
        WHERE owner_email = $1 AND document_id = $2
        RETURNING ${EDITOR_DOCUMENT_COLUMNS}`,
      [ownerEmail, documentId, JSON.stringify(parsed.level), canonical.hash],
    );
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

app.get('/api/editor-documents/:documentId', async (req, res) => {
  const input = editorDocumentOperationRequest(req, res);
  if (!input) return;
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const stored = await dbGetEditorDocument(user.email, input.documentId);
    if (!stored) { res.status(404).json({ error: 'editor_document_not_found' }); return; }
    if (!editorDocumentRowIsAuthorized(stored, user, res)) return;
    const row = await dbLoadEditorDocument(user.email, input.documentId);
    if (!row) { res.status(404).json({ error: 'editor_document_not_found' }); return; }
    res.status(200).json({ document: publicEditorDocument(row) });
  } catch (error) {
    respondEditorDocumentError(res, error, 'read');
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
    const parsed = editorDocumentLevel(input.raw.level, current.level_id);
    if (parsed.error) { res.status(400).json({ error: parsed.error, ...(parsed.details ? { details: parsed.details } : {}) }); return; }
    const row = await dbAutosaveEditorDocument(user.email, input.documentId, revision, parsed.level);
    res.status(200).json({ document: publicEditorDocument(row) });
  } catch (error) {
    respondEditorDocumentError(res, error, 'autosave');
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
    const saved = await dbSaveEditorDocument(user.email, input.documentId, revision, level, campaignId);
    res.status(200).json({
      document: publicEditorDocument(saved.row),
      workspace_revision: saved.workspaceRevision,
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
    const row = await dbDiscardEditorDocument(user.email, input.documentId, revision);
    res.status(200).json({ document: publicEditorDocument(row) });
  } catch (error) {
    respondEditorDocumentError(res, error, 'discard');
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
  const body = row && isObjectRecord(row.body) ? row.body : { campaigns: [], levels: {} };
  return {
    campaigns: Array.isArray(body.campaigns) ? body.campaigns : [],
    levels: isObjectRecord(body.levels) ? body.levels : {},
    revision: Number(row && row.revision) || 0,
    updated_at: row && row.updated_at ? row.updated_at : null,
  };
}

async function dbPutWorkspace(ownerEmail, body, expectedRevision) {
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
    res.status(200).json(publicCampaignWorkspace(row));
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
    const result = await dbPutWorkspace(
      user.email,
      { campaigns: raw.campaigns, levels: raw.levels },
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
    res.status(200).json({
      portfolio: publicOfficialCampaignsDocument(id, document),
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
      data: { campaigns: raw.data.campaigns, levels: raw.data.levels },
      client_schema_version: Object.hasOwn(raw, 'client_schema_version') ? raw.client_schema_version : null,
      updated_by: user.email,
    }, expectedRevision);
    if (result.conflict === 'revision') {
      res.status(409).json({
        error: 'official_campaign_revision_conflict',
        portfolio: publicOfficialCampaignsDocument(id, result.row),
        store_schema_version: OFFICIAL_CAMPAIGNS_STORE_SCHEMA_VERSION,
      });
      return;
    }
    res.status(200).json({
      portfolio: publicOfficialCampaignsDocument(id, result.row),
      store_schema_version: OFFICIAL_CAMPAIGNS_STORE_SCHEMA_VERSION,
    });
  } catch (error) {
    dbUnavailable(res, 'official campaigns write failed', error, 'official_campaign_store_unavailable');
  }
});

// --- Prop-seat tuning (global) tier (ADR-0061) -----------------------------
// Live-tunable prop geometry: a map of propId → seat {anchorX,anchorY,scale,w?,h?,base?}.
// Public GET / requireAdmin PUT, cloning official_campaigns. The committed propSeats.json is
// the always-render BASELINE the client overlays this row over — an empty/missing row just
// means "no overrides" (props still render), so props/`play` never depend on this row.
const PROP_SEATS_STORE_SCHEMA_VERSION = 1;
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
function validatePropSeatsData(data) {
  if (!isObjectRecord(data)) return 'prop seats must be an object map of propId → seat';
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
        if (!isObjectRecord(part.source) || (part.source.kind !== 'asset' && part.source.kind !== 'prop' && part.source.kind !== 'doodad') || typeof part.source.id !== 'string') {
          return `seat "${id}" part ${index + 1} needs an asset/prop/doodad source`;
        }
        if (!Number.isFinite(part.anchorX) || !Number.isFinite(part.anchorY)) return `seat "${id}" part ${index + 1} needs numeric anchorX/anchorY`;
        if (!(Number.isFinite(part.scale) && part.scale > 0)) return `seat "${id}" part ${index + 1} needs a positive scale`;
      }
    }
    if (Object.hasOwn(seat, 'base') && (typeof seat.base !== 'string' || !Object.hasOwn(data, seat.base))) {
      return `seat "${id}" base "${seat.base}" must reference an existing prop in the same document`;
    }
  }
  return null;
}

async function dbGetPropSeats(id) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT data, client_schema_version, revision, created_at, updated_at, updated_by FROM prop_seats WHERE id = $1',
    [id],
  );
  return rows[0] || null;
}

async function dbUpsertPropSeats(id, input) {
  await ensureDbReady();
  const { rows } = await pool.query(
    `INSERT INTO prop_seats (id, data, client_schema_version, revision, updated_by)
       VALUES ($1, $2::jsonb, $3, 1, $4)
     ON CONFLICT (id) DO UPDATE SET
       data = EXCLUDED.data,
       client_schema_version = EXCLUDED.client_schema_version,
       revision = prop_seats.revision + 1,
       updated_at = now(),
       updated_by = EXCLUDED.updated_by
     RETURNING data, client_schema_version, revision, created_at, updated_at, updated_by`,
    [id, JSON.stringify(input.data), input.client_schema_version, input.updated_by],
  );
  return rows[0];
}

function publicPropSeatsDocument(id, document) {
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

app.get('/api/prop-seats/:id', async (req, res) => {
  const id = propSeatsRowId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_prop_seats_id' });
    return;
  }
  try {
    const document = await dbGetPropSeats(id);
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
  if (!isObjectRecord(raw.data)) {
    res.status(400).json({ error: 'prop_seats_data_object_required' });
    return;
  }
  const validationError = validatePropSeatsData(raw.data);
  if (validationError) {
    res.status(400).json({ error: 'invalid_prop_seats', details: validationError });
    return;
  }
  try {
    const document = await dbUpsertPropSeats(id, {
      data: raw.data,
      client_schema_version: Object.hasOwn(raw, 'client_schema_version') ? raw.client_schema_version : null,
      updated_by: user.email,
    });
    res.status(200).json({
      portfolio: publicPropSeatsDocument(id, document),
      store_schema_version: PROP_SEATS_STORE_SCHEMA_VERSION,
    });
  } catch (error) {
    dbUnavailable(res, 'prop seats write failed', error, 'prop_seats_store_unavailable');
  }
});

// --- Wall-art tuning (global) tier ----------------------------------------
// Placeable wall art: N face artwork slots mounted on existing walls.
// Public GET / requireAdmin PUT, parallel to prop_seats. The committed
// wallArt.json is the baseline; this row is an optional live overlay.
const WALL_ART_STORE_SCHEMA_VERSION = 1;
const WALL_ART_ROW_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const WALL_ART_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const WALL_ART_FACES = new Set(['west', 'north']);

function wallArtRowId(raw) {
  const id = String(raw || '').trim();
  return WALL_ART_ROW_ID_PATTERN.test(id) ? id : null;
}

function validateWallArtData(data) {
  if (!isObjectRecord(data)) return 'wall art must be an object map of wallArtId → definition';
  for (const [id, asset] of Object.entries(data)) {
    if (!WALL_ART_ID_PATTERN.test(id)) return `wall art id "${id}" must be a lowercase slug`;
    if (!isObjectRecord(asset)) return `wall art "${id}" must be an object`;
    if (typeof asset.label !== 'string' || !asset.label.trim()) return `wall art "${id}" needs a label`;
    if (Object.hasOwn(asset, 'span') && !(Number.isInteger(asset.span) && asset.span >= 1 && asset.span <= 16)) return `wall art "${id}" span must be an integer from 1 to 16`;
    if (!Array.isArray(asset.slots)) return `wall art "${id}" slots must be an array`;
    for (const [index, slot] of asset.slots.entries()) {
      if (!isObjectRecord(slot)) return `wall art "${id}" slot ${index + 1} must be an object`;
      if (typeof slot.id !== 'string' || !WALL_ART_ID_PATTERN.test(slot.id)) return `wall art "${id}" slot ${index + 1} needs a lowercase slug id`;
      if (typeof slot.sourceId !== 'string' || !WALL_ART_ID_PATTERN.test(slot.sourceId)) return `wall art "${id}" slot ${index + 1} needs a sourceId`;
      if (typeof slot.face !== 'string' || !WALL_ART_FACES.has(slot.face)) return `wall art "${id}" slot ${index + 1} face must be west or north`;
      if (!Number.isFinite(slot.x) || !Number.isFinite(slot.y)) return `wall art "${id}" slot ${index + 1} needs numeric x/y`;
      if (!(Number.isFinite(slot.scale) && slot.scale > 0)) return `wall art "${id}" slot ${index + 1} needs a positive scale`;
    }
  }
  return null;
}

async function dbGetWallArt(id) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT data, client_schema_version, revision, created_at, updated_at, updated_by FROM wall_art WHERE id = $1',
    [id],
  );
  return rows[0] || null;
}

async function dbUpsertWallArt(id, input) {
  await ensureDbReady();
  const { rows } = await pool.query(
    `INSERT INTO wall_art (id, data, client_schema_version, revision, updated_by)
       VALUES ($1, $2::jsonb, $3, 1, $4)
     ON CONFLICT (id) DO UPDATE SET
       data = EXCLUDED.data,
       client_schema_version = EXCLUDED.client_schema_version,
       revision = wall_art.revision + 1,
       updated_at = now(),
       updated_by = EXCLUDED.updated_by
     RETURNING data, client_schema_version, revision, created_at, updated_at, updated_by`,
    [id, JSON.stringify(input.data), input.client_schema_version, input.updated_by],
  );
  return rows[0];
}

function publicWallArtDocument(id, document) {
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

app.get('/api/wall-art/:id', async (req, res) => {
  const id = wallArtRowId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_wall_art_id' });
    return;
  }
  try {
    const document = await dbGetWallArt(id);
    res.status(200).json({
      portfolio: publicWallArtDocument(id, document),
      store_schema_version: WALL_ART_STORE_SCHEMA_VERSION,
    });
  } catch (error) {
    dbUnavailable(res, 'wall art read failed', error, 'wall_art_store_unavailable');
  }
});

app.put('/api/wall-art/:id', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const id = wallArtRowId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_wall_art_id' });
    return;
  }
  const raw = req.body && typeof req.body === 'object' ? req.body : {};
  if (!isObjectRecord(raw.data)) {
    res.status(400).json({ error: 'wall_art_data_object_required' });
    return;
  }
  const validationError = validateWallArtData(raw.data);
  if (validationError) {
    res.status(400).json({ error: 'invalid_wall_art', details: validationError });
    return;
  }
  try {
    const document = await dbUpsertWallArt(id, {
      data: raw.data,
      client_schema_version: Object.hasOwn(raw, 'client_schema_version') ? raw.client_schema_version : null,
      updated_by: user.email,
    });
    res.status(200).json({
      portfolio: publicWallArtDocument(id, document),
      store_schema_version: WALL_ART_STORE_SCHEMA_VERSION,
    });
  } catch (error) {
    dbUnavailable(res, 'wall art write failed', error, 'wall_art_store_unavailable');
  }
});

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
    activatedAt: row.activated_at || null,
    retiredAt: row.retired_at || null,
    rowRevision: Number(row.slot_revision),
    metadata: publicMediaSlotMetadata(row),
    versionStatus: hasActiveMedia ? row.version_status : null,
    productionEligible: row.version_status === 'accepted',
    // Public consumers receive only the validated per-version runtime
    // projection. Authoring notes, migration paths, provenance, and review
    // evidence remain confined to the authenticated admin catalog.
    versionMetadata: publicRuntimeVersionMetadata(row),
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
} = {}) {
  await ensureDbReady();
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const [stateResult, slotResult] = await Promise.all([
      client.query('SELECT revision, updated_at FROM media_catalog_state WHERE singleton = true'),
      client.query(
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
    ),
    ]);
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
    updatedAt: stateResult.rows[0]?.updated_at || null,
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
      const { rows } = await client.query(
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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
      const { rows } = await client.query(
        `SELECT id, slot, source_path, version_id, action, actor_email, details, created_at
          FROM media_asset_events
         WHERE ($1::bigint IS NULL OR id < $1::bigint)
         ORDER BY id DESC LIMIT $2`,
        [eventBeforeId, eventLimit],
      );
      body.events = rows.map((row) => ({
      id: Number(row.id), slot: row.slot, sourcePath: row.source_path,
      versionId: row.version_id ? String(row.version_id) : null,
      action: row.action, actorEmail: row.actor_email, details: row.details || {}, createdAt: row.created_at,
      }));
      body.eventsPage = {
        limit: eventLimit,
        nextBeforeId: rows.length === eventLimit ? Number(rows[rows.length - 1].id) : null,
      };
    }
    await client.query('COMMIT');
    return body;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve catalog read error */ }
    throw error;
  } finally {
    client.release();
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

  // Do a fresh catalog read on every probe. `dbReady` records successful schema
  // initialization, but readiness must also detect a database or catalog that
  // became unavailable after startup. During the temporary stage-1 import only,
  // serving remains Git-backed and partial bridge groups are allowed; the final
  // live-only image removes that flag and always takes the strict public branch.
  let catalogRevision;
  if (liveMediaServingEnabled) {
    const catalog = await dbReadMediaCatalog();
    catalogRevision = Number(catalog.revision);
  } else {
    const state = await pool.query('SELECT revision FROM media_catalog_state WHERE singleton = true');
    if (!state.rows[0]) throw new Error('live media catalog state is missing');
    catalogRevision = Number(state.rows[0].revision);
  }

  const sample = await pool.query(
    `SELECT b.sha256, b.blob_key, b.media_type, b.byte_length
       FROM media_slots s
       JOIN media_versions v ON v.id = s.active_version_id AND v.slot = s.slot
       JOIN media_blobs b ON b.sha256 = v.blob_sha256
      WHERE s.lifecycle_state = 'active'
        AND v.status IN ('accepted', 'legacy-bridge')
      ORDER BY CASE WHEN s.availability_policy = 'critical' THEN 0 ELSE 1 END,
               b.byte_length, s.slot
      LIMIT 1`,
  );
  await verifyLiveMediaStoreReadiness(sample.rows[0] || null);
  return { catalogRevision };
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
  if (row.domain === 'terrain') {
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
  } else {
    if (proof.schema === 'live-media-owner-group-proof-v1') {
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
  'terrain', 'ui-kit', 'unit-art', 'wall-decor',
]);
const WATER_SIDE_REQUIRED_SLOTS = Object.freeze(
  Array.from({ length: 8 }, (_, index) => `tiles/surface/water-${index}-side.png`),
);

function runtimeInteger(value, { min = 0, max = 32768 } = {}) {
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function runtimeSemanticText(value, max = 160) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= max ? normalized : null;
}

function runtimeMetadataProjection(row) {
  const metadata = isObjectRecord(row.version_metadata) ? row.version_metadata
    : isObjectRecord(row.metadata) ? row.metadata : {};
  if (metadata.runtime === undefined) return { value: {} };
  if (!isObjectRecord(metadata.runtime)) return { error: 'metadata.runtime must be an object' };
  const raw = metadata.runtime;
  const allowed = new Set([
    'component', 'variant', 'state', 'family', 'palette', 'direction', 'altText',
    'frameWidth', 'frameHeight', 'frameCount', 'anchorX', 'anchorY', 'durationMs', 'loop',
  ]);
  if (row.domain === 'terrain') {
    for (const key of ['logicalTerrain', 'face', 'projection', 'alphaOwnership']) allowed.add(key);
  }
  if (row.domain === 'ui-kit') {
    for (const key of ['nativeRole', 'slice']) allowed.add(key);
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

function mediaDomainProjectionIssue(row, { legacyBridge = false } = {}) {
  const runtime = runtimeMetadataProjection(row);
  if (runtime.error) return runtime.error;
  const knownDomain = VISUAL_MEDIA_DOMAINS.has(row.domain) || row.domain === 'font' || row.domain === 'sfx';
  if (!knownDomain && !legacyBridge) return `runtime acceptance requires a registered domain projection, not ${row.domain}`;
  if (!legacyBridge && row.domain !== 'terrain') {
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

  const suffixRole = row.slot?.endsWith('-top-anim.png') ? 'animation'
    : row.slot?.endsWith('-top.png') ? 'top'
      : row.slot?.endsWith('-side.png') ? 'side' : null;
  if (suffixRole && row.role !== suffixRole) return `terrain slot suffix requires role ${suffixRole}`;
  if (['top', 'side', 'animation'].includes(row.role) && !suffixRole) {
    return `terrain ${row.role} role requires a matching semantic slot suffix`;
  }
  if (!legacyBridge && !WATER_SIDE_REQUIRED_SLOTS.includes(row.slot)) {
    return 'terrain acceptance is currently registered only for the atomic Water side projection';
  }
  if (suffixRole && row.media_type !== 'image/png') return 'projected terrain faces require image/png';
  if (suffixRole === 'top' || suffixRole === 'side') {
    if (Number(row.width) !== 96 || Number(row.height) !== 180) return 'terrain top/side frames must be native 96x180';
  }
  if (suffixRole === 'animation') {
    if (Number(row.height) !== 180 || Number(row.width) < 96 || Number(row.width) % 96 !== 0) {
      return 'terrain animation sheets must contain horizontal 96x180 frames';
    }
  }
  if (runtime.value.face !== undefined && runtime.value.face !== suffixRole) return 'terrain runtime face must match the slot role';
  if (runtime.value.projection !== undefined && runtime.value.projection !== 'iso-96x180-v1') {
    return 'terrain runtime projection does not match the canonical board projection';
  }
  const expectedFrameCount = suffixRole === 'animation' ? Number(row.width) / 96 : suffixRole ? 1 : null;
  if (runtime.value.frameWidth !== undefined && runtime.value.frameWidth !== (suffixRole ? 96 : Number(row.width))) {
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

function legacyBridgeEvidenceIssue(row) {
  const migration = isObjectRecord(row.provenance?.migration) ? row.provenance.migration : {};
  if (migration.kind !== 'git-media-cutover') return 'migration.kind must be git-media-cutover';
  if (migration.byteExact !== true) return 'migration.byteExact must be true';
  if (mediaSha(migration.sha256) !== row.blob_sha256) return 'migration.sha256 must equal the uploaded content hash';
  if (!boundedMediaText(migration.repositoryCommit, '', 160)) return 'migration.repositoryCommit is required';
  const originalPath = mediaSourcePath(migration.originalRepositoryPath);
  if (!originalPath || !row.source_path || originalPath !== row.source_path) {
    return 'migration.originalRepositoryPath must equal the version sourcePath';
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
  const validated = validateMediaVersionInput(req.body);
  if (validated.error) { res.status(400).json({ error: 'invalid_media_version', details: validated.error }); return; }
  const value = validated.value;
  try {
    const idempotencyKey = mediaIdempotencyKey(req);
    const idempotencyActor = String(user.email).trim().toLowerCase();
    const requestFingerprint = crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
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

function gameOwnedReviewSurfaceUrl(req, raw) {
  const value = boundedMediaText(raw, '', 2048);
  if (!value) return null;
  try {
    const url = new URL(value);
    const requestOrigin = String(req.get('origin') || '').trim().replace(/\/+$/, '');
    const sameOrigin = requestOrigin
      ? url.origin === requestOrigin
      : url.host.toLowerCase() === String(req.get('host') || '').toLowerCase();
    if (!sameOrigin || (url.protocol !== 'http:' && url.protocol !== 'https:') || url.pathname !== '/studio' || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function validateMediaReviewProofSnapshot(client, current, evidence, surfaceUrl) {
  if (current.domain !== 'terrain') {
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
  assertRequiredMediaAcceptanceContract(current, contract);
  const requiredSlots = contract.mode === 'group' ? contract.requiredSlots : [current.slot];
  const selected = evidence.selectedCandidates.filter(isObjectRecord);
  const selectedBySlot = new Map(selected.map((item) => [item.slot, item]));
  const snapshots = evidence.slotSnapshots.filter(isObjectRecord);
  const snapshotBySlot = new Map(snapshots.map((item) => [item.slot, item]));
  if (contract.mode === 'group') {
    if (
      selected.length !== requiredSlots.length || selectedBySlot.size !== requiredSlots.length
      || snapshots.length !== requiredSlots.length || snapshotBySlot.size !== requiredSlots.length
      || evidence.abruptExposedEdge !== true
      || canonicalJson(evidence.exposedFaces) !== canonicalJson(['south', 'east'])
      || requiredSlots.some((slot) => (
        canonicalJson(selectedBySlot.get(slot)?.faces) !== canonicalJson(['south', 'east'])
      ))
      || !Array.isArray(evidence.acceptanceGroups)
    ) throw mediaMutationError('invalid_media_review_proof', 409, 'group terrain proof must cover every required face exactly once');
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
    throw mediaMutationError('invalid_media_review', 400, 'notes, same-origin Studio surfaceUrl, and non-empty evidence are required');
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

app.post('/api/admin/media-versions/:id/bridge', async (req, res) => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (!liveMediaImportEnabled) {
    res.status(410).json({ error: 'legacy_media_import_closed' });
    return;
  }
  const id = mediaVersionId(req.params.id);
  if (!id) { res.status(400).json({ error: 'invalid_media_version_id' }); return; }
  try {
    const expected = requireMediaExpectedRevision(req);
    const preflight = await dbMediaVersionRow(id);
    if (!preflight) throw mediaMutationError('media_version_not_found', 404);
    assertMediaRevision(preflight, expected);
    if (preflight.status !== 'candidate' || !preflight.blob_sha256) {
      throw mediaMutationError('media_bridge_requires_candidate_content', 409);
    }
    await verifyLiveMediaBlobPresent(preflight);
    const catalogRevision = await withMediaCatalogTransaction(async (client) => {
      const current = await dbMediaVersionRow(id, client, true);
      if (!current) throw mediaMutationError('media_version_not_found', 404);
      assertMediaRevision(current, expected);
      if (current.status !== 'candidate') throw mediaMutationError('media_version_locked', 409, { status: current.status });
      if (!current.slot || !current.blob_sha256) throw mediaMutationError('media_bridge_requires_slotted_content', 409);
      if (!publicMediaTypeAllowed(current.media_type)) throw mediaMutationError('media_type_not_public_runtime', 409, current.media_type);
      const projectionIssue = mediaDomainProjectionIssue(current, { legacyBridge: true });
      if (projectionIssue) throw mediaMutationError('media_domain_projection_invalid', 409, { id, reason: projectionIssue });
      const bridgeEvidenceIssue = legacyBridgeEvidenceIssue(current);
      if (bridgeEvidenceIssue) throw mediaMutationError('media_bridge_migration_evidence_required', 409, bridgeEvidenceIssue);
      assertRequiredMediaAcceptanceContract(current, mediaAcceptanceContract(current));
      const slotResult = await client.query(
        'SELECT active_version_id, lifecycle_state FROM media_slots WHERE slot = $1 FOR UPDATE',
        [current.slot],
      );
      if (!slotResult.rows[0]) throw mediaMutationError('media_slot_not_found', 404);
      if (slotResult.rows[0].lifecycle_state !== 'staging' || slotResult.rows[0].active_version_id) {
        throw mediaMutationError('media_bridge_requires_staging_slot', 409);
      }
      await client.query(
        `UPDATE media_versions SET status = 'legacy-bridge', row_revision = row_revision + 1,
           updated_at = now(), updated_by = $2 WHERE id = $1`,
        [id, user.email],
      );
      await client.query(
        'UPDATE media_blobs SET published_at = COALESCE(published_at, now()) WHERE sha256 = $1',
        [current.blob_sha256],
      );
      await client.query(
        `UPDATE media_slots SET active_version_id = $2, lifecycle_state = 'active',
           activated_at = COALESCE(activated_at, now()), row_revision = row_revision + 1,
           updated_at = now(), updated_by = $3 WHERE slot = $1`,
        [current.slot, id, user.email],
      );
      await logMediaEvent(client, current, 'legacy-bridge-activated', user.email, { sha256: current.blob_sha256 });
      return bumpMediaCatalog(client);
    }, { invalidatePublic: true });
    res.status(200).json({ version: publicMediaVersion(await dbMediaVersionRow(id)), catalogRevision });
  } catch (error) {
    sendMediaMutationError(res, error, 'media_bridge_failed');
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

function requiredMediaAcceptanceContract(row) {
  if (!WATER_SIDE_REQUIRED_SLOTS.includes(row.slot)) return null;
  return {
    mode: 'group',
    groupId: 'terrain/water/side-v1',
    requiredSlots: [...WATER_SIDE_REQUIRED_SLOTS],
  };
}

function assertRequiredMediaAcceptanceContract(row, actual) {
  const required = requiredMediaAcceptanceContract(row);
  if (!required) return;
  if (
    actual.mode !== required.mode || actual.groupId !== required.groupId
    || canonicalJson(actual.requiredSlots) !== canonicalJson(required.requiredSlots)
  ) {
    throw mediaMutationError('media_required_group_contract_missing', 409, {
      slot: row.slot,
      required,
    });
  }
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
      || (contract?.mode === 'group'
        && canonicalJson(ownProof.faces) !== canonicalJson(['south', 'east']))
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
    }

    const bySlot = new Map(rows.map((row) => [row.slot, row]));
    const grouped = new Map();
    for (const row of rows) {
      const contract = mediaAcceptanceContract(row);
      assertRequiredMediaAcceptanceContract(row, contract);
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
      const [first] = group.rows;
      for (const row of group.rows) {
        if (
          row.domain !== first.domain || row.role !== first.role || row.media_type !== first.media_type
          || Number(row.width) !== Number(first.width) || Number(row.height) !== Number(first.height)
        ) throw mediaMutationError('media_group_projection_mismatch', 409, { groupId, slot: row.slot });
      }
      assertTerrainAcceptanceProof(group.rows, slotById, {
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

// Public immutable hash reads stay available during the staged import so the
// importer and ephemeral-slot seeder can verify published pointers byte-for-byte.
// Only the stable /assets namespace and thumbnails are cut over by the one-time
// serving flag. Once a hash has been published it remains readable for honest
// immutable caching and lazy test-slot snapshots; candidates never become public.
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
  if (!queryable) await ensureDbReady();
  const db = queryable || pool;
  const [stateResult, familyResult, assetResult, spriteResult] = await Promise.all([
    db.query('SELECT revision, updated_at FROM unit_catalog_state WHERE singleton = true'),
    db.query(
      `SELECT family, accepted_asset_id, display_scale_percent, row_revision, updated_at, updated_by
         FROM unit_families
        ORDER BY array_position($1::text[], family)`,
      [UNIT_FAMILY_IDS],
    ),
    db.query(
      `SELECT id, family, label, method, notes, acceptance_block_reason, status, footprint_shape,
              source_canvas_width, source_canvas_height, source_footprint_px,
              anchor_x, anchor_y, row_revision, created_at, updated_at, updated_by
         FROM unit_assets
        WHERE $1::boolean OR status <> 'archived'
        ORDER BY family, created_at DESC`,
      [includeArchived],
    ),
    db.query(
      `SELECT s.asset_id, s.palette, s.direction, s.sha256, s.width, s.height, s.byte_length
         FROM unit_sprites s
         JOIN unit_assets a ON a.id = s.asset_id
        WHERE $1::boolean OR a.status <> 'archived'
        ORDER BY s.asset_id, s.palette, s.direction`,
      [includeArchived],
    ),
  ]);

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

  return {
    schemaVersion: UNIT_CATALOG_SCHEMA_VERSION,
    revision: Number(stateResult.rows[0]?.revision || 0),
    updatedAt: stateResult.rows[0]?.updated_at || null,
    families: familyResult.rows.map((row) => ({
      family: row.family,
      acceptedAssetId: row.accepted_asset_id ? String(row.accepted_asset_id) : null,
      displayScalePercent: Number(row.display_scale_percent),
      rowRevision: Number(row.row_revision),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    })),
    assets,
  };
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

async function legacyThumbnailAssetBytes(src) {
  let decoded = null;
  try { decoded = String(src).split('/').map(decodeURIComponent).join('/'); } catch { decoded = null; }
  if (!decoded || !decoded.startsWith('/assets/') || decoded.split('/').some((segment) => segment === '..')) return null;
  const root = path.resolve(frontendDir);
  const target = path.resolve(root, `.${decoded}`);
  if (!target.startsWith(`${root}${path.sep}`)) return null;
  try { return await fs.promises.readFile(target); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function thumbnailDynamicSprite(src, mediaCatalog = null) {
  const value = String(src || '').split('?', 1)[0];
  const unitMatch = /^\/api\/unit-sprites\/([0-9a-f]{64})\.png$/.exec(value);
  if (unitMatch) return unitSpriteBytes(unitMatch[1]);
  if (!liveMediaServingEnabled && value.startsWith('/assets/')) return legacyThumbnailAssetBytes(value);
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
async function dbEnsurePublicId(ownerEmail, levelId, level, contentHash) {
  await ensureDbReady();
  const name = level && typeof level.name === 'string' ? level.name : null;
  const bodyJson = JSON.stringify(level);
  const existing = await pool.query(
    'SELECT public_id FROM public_maps WHERE owner_email = $1 AND level_id = $2', [ownerEmail, levelId],
  );
  if (existing.rows[0]) {
    const id = existing.rows[0].public_id;
    await pool.query(
      'UPDATE public_maps SET name = $2, content_hash = $3, body = $4::jsonb, updated_at = now() WHERE public_id = $1',
      [id, name, contentHash, bodyJson],
    );
    return id;
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = newPublicId();
    try {
      await pool.query(
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
    const row = await dbGetWorkspace(user.email);
    const level = row && row.body && row.body.levels && typeof row.body.levels === 'object'
      ? row.body.levels[levelId] : null;
    if (!level || typeof level !== 'object') { res.status(404).json({ error: 'level_not_found' }); return; }
    let contentHash = null;
    try {
      const renderInputs = await applyThumbnailRenderInputs();
      contentHash = serverRender && thumbnailVersion(serverRender.boardHashForLevel(level), renderInputs);
    } catch { contentHash = null; }
    const publicId = await dbEnsurePublicId(user.email, levelId, { ...level, id: levelId }, contentHash);
    res.status(200).json({ public_id: publicId, url: `${publicOrigin}/play?map=${publicId}` });
  } catch (error) {
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

// --- Open Graph unfurl + on-demand board thumbnails -------------------------
// A shared level link must unfurl on Discord/Slack/Twitter (crawlers fetch the URL server-side — no
// JS, no auth). The SPA fallback injects per-level og:/twitter: tags, and og:image points at an
// on-demand board render served here. Officials resolve from the LIVE DB; user maps from public_maps.
// Generic pages use the branded default-image semantic slot. A targeted level
// thumbnail never masks missing content/media with it: missing targets are 404
// and renderer/catalog/media failures are explicit 503s.
const OG_SITE_NAME = 'Chess Tactics';
const OG_DEFAULT_DESC = 'Tactical chess battles on a living board.';
const DEFAULT_OG_IMAGE = '/assets/og/default.png';
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
const THUMBNAIL_PROP_SEATS_TTL_MS = 60 * 1000;
let _thumbnailPropSeatsCache = { at: 0, data: null, revision: 0 }; // last SUCCESSFUL DB read
let _thumbnailMediaAvailabilityCache = { revision: null, catalog: null };
async function thumbnailPropSeats() {
  const now = Date.now();
  if (_thumbnailPropSeatsCache.data && now - _thumbnailPropSeatsCache.at < THUMBNAIL_PROP_SEATS_TTL_MS) {
    return _thumbnailPropSeatsCache;
  }
  try {
    const doc = await dbGetPropSeats('default');
    const data = doc && doc.data && typeof doc.data === 'object' ? doc.data : {};
    _thumbnailPropSeatsCache = {
      at: now,
      data,
      revision: Number.isInteger(doc && doc.revision) ? doc.revision : 0,
    };
    return _thumbnailPropSeatsCache;
  } catch { /* DB unreachable — fall through to the last-good seats below, else baseline */ }
  return _thumbnailPropSeatsCache.data ? _thumbnailPropSeatsCache : { at: now, data: {}, revision: 0 };
}
async function thumbnailMediaAvailabilityCatalog(mediaCatalog) {
  if (!mediaCatalog) return null;
  const expectedRevision = Number(mediaCatalog.revision || 0);
  if (
    _thumbnailMediaAvailabilityCache.catalog
    && _thumbnailMediaAvailabilityCache.revision === expectedRevision
  ) return _thumbnailMediaAvailabilityCache.catalog;
  try {
    await ensureDbReady();
    // One statement gives policy rows and their catalog revision from the same
    // PostgreSQL snapshot. Public catalogs omit unavailable decorative slots;
    // thumbnails still need those slots' DB-owned fail-soft policy.
    const { rows } = await pool.query(
      `SELECT state.revision AS catalog_revision, s.slot, s.availability_policy
         FROM media_catalog_state state
         LEFT JOIN media_slots s ON true
        WHERE state.singleton = true
        ORDER BY s.slot`,
    );
    const catalog = thumbnailAvailabilityCatalogFromRows(mediaCatalog, rows);
    if (catalog === mediaCatalog) return mediaCatalog;
    _thumbnailMediaAvailabilityCache = { revision: expectedRevision, catalog };
    return catalog;
  } catch {
    // The deliverable catalog still classifies every active version. Unknown
    // sources fail closed as critical in the renderer adapter.
    return mediaCatalog;
  }
}
async function applyThumbnailRenderInputs() {
  const seats = await thumbnailPropSeats();
  if (serverRender && typeof serverRender.applyPropSeatOverrides === 'function') {
    try { serverRender.applyPropSeatOverrides(seats.data); } catch { /* keep the renderer's last-good seats */ }
  }
  if (!serverRender || typeof serverRender.applyLiveUnitCatalog !== 'function') {
    throw new Error('unit catalog renderer is unavailable');
  }
  const catalog = await publicUnitCatalog();
  serverRender.applyLiveUnitCatalog(catalog);
  const unitCatalogRevision = catalog.revision || 0;
  const mediaCatalog = liveMediaServingEnabled ? await publicMediaCatalog() : null;
  const mediaCatalogRevision = mediaCatalog?.revision || 0;
  const mediaAvailability = await thumbnailMediaAvailabilityCatalog(mediaCatalog);
  return {
    propSeatsRevision: seats.revision || 0,
    unitCatalogRevision,
    mediaCatalogRevision,
    mediaCatalog,
    mediaAvailability,
  };
}
function thumbnailVersion(boardHash, renderInputs) {
  const propSeatsRevision = renderInputs && renderInputs.propSeatsRevision ? `ps${renderInputs.propSeatsRevision}` : '';
  const unitCatalogRevision = renderInputs && renderInputs.unitCatalogRevision ? `uc${renderInputs.unitCatalogRevision}` : '';
  const mediaCatalogRevision = renderInputs && renderInputs.mediaCatalogRevision ? `mc${renderInputs.mediaCatalogRevision}` : '';
  return [boardHash, propSeatsRevision, unitCatalogRevision, mediaCatalogRevision].filter(Boolean).join('-');
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
    const renderInputs = await applyThumbnailRenderInputs();
    const plan = serverRender.levelRenderPlan(target.level);
    const cacheKey = `${id}:${campaignId || ''}:${thumbnailVersion(plan.contentHash, renderInputs)}`;
    const png = await _thumbCache.getOrCreate(cacheKey, async () => {
      const { renderLevelCard } = require(path.join(bakedBackendDir, 'boardThumbnail'));
      const backgroundSrc = typeof serverRender.worldBackgroundSrc === 'function' ? serverRender.worldBackgroundSrc() : undefined;
      return renderLevelCard({
        plan,
        frontendDir,
        title: target.title,
        subtitle: target.subtitle,
        screenName: target.screenName,
        backgroundSrc,
        loadDynamicSprite: (src) => thumbnailDynamicSprite(src, renderInputs.mediaCatalog),
        mediaCatalogRevision: renderInputs.mediaCatalogRevision,
        sourceAvailability: (src) => thumbnailSourceAvailability(src, renderInputs.mediaAvailability),
      });
    });
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
// The level-thumbnail route above is the sole dynamic /assets namespace carveout.
app.get(/^\/assets\/(?!level-thumb\/)(.+)$/, async (req, res, next) => {
  if (!liveMediaServingEnabled) { next(); return; }
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
  const target = await resolveShareTarget({ levelId, campaignId, mapId }).catch(() => null);

  let title = OG_SITE_NAME;
  let description = OG_DEFAULT_DESC;
  let image = `${origin}${DEFAULT_OG_IMAGE}`;
  if (target) {
    title = target.title || OG_SITE_NAME;
    description = target.description || target.subtitle || OG_DEFAULT_DESC;
    if (serverRender) {
      const key = mapId || levelId;
      let hash = '';
      try {
        const renderInputs = await applyThumbnailRenderInputs();
        hash = thumbnailVersion(serverRender.boardHashForLevel(target.level), renderInputs);
      } catch { hash = ''; }
      const imageParams = new URLSearchParams();
      if (hash) imageParams.set('v', hash);
      if (campaignId && key === levelId) imageParams.set('campaignId', campaignId);
      const qs = imageParams.toString();
      image = `${origin}/assets/level-thumb/${encodeURIComponent(key)}.png${qs ? `?${qs}` : ''}`;
    }
  }
  const url = `${origin}${req.originalUrl}`;
  const meta = [
    ['og:type', 'website'], ['og:site_name', OG_SITE_NAME], ['og:title', title],
    ['og:description', description], ['og:url', url], ['og:image', image],
    ['og:image:width', '1200'], ['og:image:height', '630'],
  ].map(([p, c]) => `<meta property="${p}" content="${htmlEscape(c)}">`);
  const tw = [
    ['twitter:card', 'summary_large_image'], ['twitter:title', title],
    ['twitter:description', description], ['twitter:image', image],
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
if (pool) {
  pool.on('error', (error) => console.error('postgres pool error:', error));
  ensureDbReady()
    .then(() => console.log(`postgres ready (mode=${databaseUrl ? 'connection-string' : 'workload-identity'}, schema=${schemaMigrationMode}); ${schemaReadyMessage()}`))
    .catch((error) => console.error('postgres init failed; application readiness will remain 503 until it recovers or schema is prepared:', error))
    .finally(startServer);
} else {
  console.warn('no database configured (set DATABASE_URL, or POSTGRES_HOST/POSTGRES_DATABASE/POSTGRES_USER); application readiness will remain 503');
  startServer();
}
