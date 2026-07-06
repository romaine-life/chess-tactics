const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');

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

// Game Lab runs carry whole recorded-game batches (validateLabRun allows up to
// ~8 MB of JSON), far past the global 256kb ceiling. Mount their larger parser
// first: once it has consumed the body, the global parser below sees the
// request as already read and skips it, so every other route keeps the 256kb
// limit.
app.use('/api/lab-runs', express.json({ limit: '10mb' }));
// Training run specs embed a whole level object (+ optionally a generated book), so
// they exceed the 256kb global ceiling; mount a larger parser first, like lab-runs.
app.use('/api/train-runs', express.json({ limit: '10mb' }));
// Opening-book blobs carry every book's capped training trajectory (up to a few
// hundred points each across several books), which can exceed the global 256kb
// ceiling. Mount a larger parser first, same as lab-runs; the global parser below
// then sees the body as already read and skips it.
app.use('/api/opening-books', express.json({ limit: '4mb' }));
// Official-campaigns holds the ENTIRE official workspace (every campaign + all their level
// docs, each carrying a full per-cell terrain array + boardCode), so it grows well past the
// 256kb ceiling. Mount a larger parser first, same as lab-runs; the global parser below skips it.
app.use('/api/official-campaigns', express.json({ limit: '10mb' }));
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
    dbReady = true;
    return;
  }
  if (schemaMigrationMode === 'auto') {
    await runMigrations();
    dbReady = true;
    return;
  }
  await checkMigrations();
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

function publicLobby(lobby, viewerEmail) {
  return {
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
    seed: lobby.seed ?? null,
    move_count: lobby.moves ? lobby.moves.length : 0,
    // Terminal outcome (resignation) in board terms, or null while the match is live.
    result: lobby.result ?? null,
    your_side: viewerEmail === lobby.host.email
      ? 'player'
      : (lobby.guest && viewerEmail === lobby.guest.email ? 'enemy' : null),
  };
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
  return Array.from(lobbies.values())
    .filter((lobby) => lobby.phase !== 'closed')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function userActiveLobby(email) {
  return activeLobbies().find((lobby) => lobby.host.email === email || (lobby.guest && lobby.guest.email === email)) || null;
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
  broadcastToLobby(lobby.id, (sub) => ({ type: 'lobby', lobby: publicLobby(lobby, sub.email) }));
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
  res.status(200).json({
    lobbies: activeLobbies().map((lobby) => publicLobby(lobby, user.email)),
    current: userActiveLobby(user.email) ? publicLobby(userActiveLobby(user.email), user.email) : null,
  });
});

app.post('/api/lobbies', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const existing = userActiveLobby(user.email);
  if (existing) {
    res.status(200).json({ lobby: publicLobby(existing, user.email) });
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
    host: user,
    guest: null,
    levelId: null,
    seed: null,
    moves: [],
    // Terminal outcome from a non-move event (a player resigning). `null` while the
    // match is live; once set, both clients read it off the lobby frame and end the
    // game — so it survives reconnect/late-join the way the move log does. Checkmate/
    // stalemate/objective ends stay purely client-side (deterministic replay).
    result: null,
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
  const lobby = lobbies.get(req.params.id);
  if (!lobby || lobby.phase === 'closed') {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  res.status(200).json({ lobby: publicLobby(lobby, user.email) });
});

app.post('/api/lobbies/:id/join', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbies.get(req.params.id);
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
  lobby.phase = 'ready';
  lobby.updatedAt = new Date().toISOString();
  broadcastLobbies();
  broadcastLobbyState(lobby);
  res.status(200).json({ lobby: publicLobby(lobby, user.email) });
});

// Host picks the level (before start). phase must be waiting|ready.
app.post('/api/lobbies/:id/level', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbies.get(req.params.id);
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
  const levelId = req.body && typeof req.body.levelId === 'string' ? req.body.levelId.trim() : '';
  if (!levelId) {
    res.status(400).json({ error: 'missing_level_id' });
    return;
  }
  lobby.levelId = levelId;
  lobby.updatedAt = new Date().toISOString();
  broadcastLobbies();
  broadcastLobbyState(lobby);
  res.status(200).json({ lobby: publicLobby(lobby, user.email) });
});

app.post('/api/lobbies/:id/start', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbies.get(req.params.id);
  if (!lobby || lobby.phase === 'closed') {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  if (lobby.host.email !== user.email) {
    res.status(403).json({ error: 'host_only' });
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
  // Lock a positive-integer seed for deterministic shared placement (crypto so it
  // is not predictable). Both clients build the identical board from (level, seed).
  lobby.seed = 1 + (crypto.randomInt ? crypto.randomInt(900000) : Math.floor(Math.random() * 900000));
  // Fresh match: drop any relayed moves and terminal result from a prior game played in
  // this lobby (a lobby is reusable — e.g. a guest leaves after a match and a new one
  // joins), so both clients start from an empty log rather than backfilling the old game.
  lobby.moves = [];
  lobby.result = null;
  lobby.phase = 'started';
  lobby.updatedAt = new Date().toISOString();
  broadcastLobbies();
  broadcastLobbyState(lobby);
  res.status(200).json({ lobby: publicLobby(lobby, user.email) });
});

// Relay one applyMove. Caller must be host/guest; lobby must be started. The
// server does NOT validate chess legality — clients do (deterministic replay).
app.post('/api/lobbies/:id/moves', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbies.get(req.params.id);
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
  // The match is already decided by a resignation — no further moves are relayed. (A
  // well-behaved client stops sending once its board shows a winner; this guards a
  // stale/racing POST from re-opening a finished game.)
  if (lobby.result) {
    res.status(409).json({ error: 'match_over' });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const pieceId = typeof body.pieceId === 'string' ? body.pieceId : '';
  const move = body.move;
  if (
    !pieceId ||
    !move || typeof move !== 'object' || Array.isArray(move) ||
    typeof move.x !== 'number' || !Number.isFinite(move.x) ||
    typeof move.y !== 'number' || !Number.isFinite(move.y)
  ) {
    res.status(400).json({ error: 'bad_move' });
    return;
  }
  // Turn integrity: the client store applies moves without AP mode, so every move flips
  // the turn — strict one-move-per-turn alternation. Host ('player') therefore posts at
  // EVEN relay indices, guest ('enemy') at odd. Reject a post from the side whose turn it
  // isn't, so a tampered/misbehaving client can't move out of turn (which desyncs boards).
  const expectHost = lobby.moves.length % 2 === 0;
  if (isHost !== expectHost) {
    res.status(409).json({ error: 'not_your_turn' });
    return;
  }
  const event = {
    i: lobby.moves.length,
    side: isHost ? 'player' : 'enemy',
    pieceId,
    move,
  };
  lobby.moves.push(event);
  lobby.updatedAt = new Date().toISOString();
  broadcastToLobby(lobby.id, { type: 'move', move: event });
  res.status(200).json({ move: event });
});

// Resign the match. Caller must be host/guest; lobby must be started. Records a
// terminal result (the OTHER side wins) on the lobby and pushes it to both clients
// over the game channel — they end the game from their own seat's perspective. Unlike
// a move, resignation isn't turn-gated (a player may resign any time) and it's stored
// on the lobby (not the move log) so a reconnecting/late client learns the match ended.
app.post('/api/lobbies/:id/resign', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbies.get(req.params.id);
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
  if (!lobby.result) {
    lobby.result = { winner: isHost ? 'enemy' : 'player', reason: 'resign' };
    lobby.updatedAt = new Date().toISOString();
    broadcastLobbyState(lobby);
    broadcastLobbies();
  }
  res.status(200).json({ lobby: publicLobby(lobby, user.email) });
});

// Backfill relayed moves since index N (reconnect / late join). Same visibility
// as GET /api/lobbies/:id (host/guest/observer — lobby exists & not closed).
app.get('/api/lobbies/:id/moves', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbies.get(req.params.id);
  if (!lobby || lobby.phase === 'closed') {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  const parsed = Number.parseInt(req.query.since, 10);
  const since = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  res.status(200).json({ moves: lobby.moves.slice(since) });
});

// PER-LOBBY game SSE channel. Auth; lobby must exist & be open. Sends the current
// lobby frame immediately (projected for this viewer), then move + lobby frames.
app.get('/api/lobbies/:id/events', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbies.get(req.params.id);
  if (!lobby || lobby.phase === 'closed') {
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
  sseWrite(res, `data: ${JSON.stringify({ type: 'lobby', lobby: publicLobby(lobby, user.email) })}\n\n`);
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
  const lobby = lobbies.get(req.params.id);
  if (!lobby || lobby.phase === 'closed') {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  if (lobby.host.email === user.email) {
    lobby.phase = 'closed';
    lobby.updatedAt = new Date().toISOString();
    // Notify game-channel subscribers (guest sees the lobby close) before dropping it.
    broadcastLobbyState(lobby);
    // Proactively end the per-lobby SSE streams so their heartbeats/timers don't linger
    // against a now-deleted lobby (ending each res fires its own 'close' handler, which
    // clears the heartbeat and removes the sub). Otherwise it only self-heals whenever the
    // guest's socket eventually drops.
    const subs = lobbyChannelSubscribers.get(lobby.id);
    if (subs) {
      for (const sub of subs) { try { sub.res.end(); } catch { /* already closed */ } }
      lobbyChannelSubscribers.delete(lobby.id);
    }
    lobbies.delete(lobby.id);
    broadcastLobbies();
    res.status(204).end();
    return;
  }
  if (lobby.guest && lobby.guest.email === user.email) {
    lobby.guest = null;
    lobby.phase = 'waiting';
    lobby.updatedAt = new Date().toISOString();
    broadcastLobbies();
    broadcastLobbyState(lobby);
    res.status(200).json({ lobby: publicLobby(lobby, user.email) });
    return;
  }
  res.status(403).json({ error: 'not_in_lobby' });
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

// Campaign-editor workspace persistence (Phase 4 cont.): the whole campaign +
// level set as one per-user document in the Postgres `campaign_workspaces`
// table (one row per signed-in owner).
async function dbGetWorkspace(ownerEmail) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT body, updated_at FROM campaign_workspaces WHERE owner_email = $1',
    [ownerEmail],
  );
  return rows[0] || null;
}

async function dbPutWorkspace(ownerEmail, body) {
  await ensureDbReady();
  const { rows } = await pool.query(
    `INSERT INTO campaign_workspaces (owner_email, body)
       VALUES ($1, $2::jsonb)
     ON CONFLICT (owner_email) DO UPDATE SET
       body = EXCLUDED.body,
       updated_at = now()
     RETURNING updated_at`,
    [ownerEmail, JSON.stringify(body)],
  );
  return rows[0].updated_at;
}

app.get('/api/campaign-workspace', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const row = await dbGetWorkspace(user.email);
    const body = row && row.body ? row.body : { campaigns: [], levels: {} };
    res.status(200).json({
      campaigns: Array.isArray(body.campaigns) ? body.campaigns : [],
      levels: body.levels && typeof body.levels === 'object' ? body.levels : {},
      updated_at: row ? row.updated_at : null,
    });
  } catch (error) {
    dbUnavailable(res, 'campaign workspace read failed', error, 'workspace_unavailable');
  }
});

app.put('/api/campaign-workspace', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const raw = req.body && typeof req.body === 'object' ? req.body : {};
  const validationError = validateWorkspaceBody(raw);
  if (validationError) {
    res.status(400).json({ error: 'invalid_workspace', details: validationError });
    return;
  }
  try {
    const updatedAt = await dbPutWorkspace(user.email, { campaigns: raw.campaigns, levels: raw.levels });
    res.status(200).json({ ok: true, campaigns: raw.campaigns.length, updated_at: updatedAt });
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

async function dbUpsertOfficialCampaigns(id, input) {
  await ensureDbReady();
  const { rows } = await pool.query(
    `INSERT INTO official_campaigns (id, data, client_schema_version, revision, updated_by)
       VALUES ($1, $2::jsonb, $3, 1, $4)
     ON CONFLICT (id) DO UPDATE SET
       data = EXCLUDED.data,
       client_schema_version = EXCLUDED.client_schema_version,
       revision = official_campaigns.revision + 1,
       updated_at = now(),
       updated_by = EXCLUDED.updated_by
     RETURNING data, client_schema_version, revision, created_at, updated_at, updated_by`,
    [id, JSON.stringify(input.data), input.client_schema_version, input.updated_by],
  );
  return rows[0];
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
    const document = await dbUpsertOfficialCampaigns(id, {
      data: { campaigns: raw.data.campaigns, levels: raw.data.levels },
      client_schema_version: Object.hasOwn(raw, 'client_schema_version') ? raw.client_schema_version : null,
      updated_by: user.email,
    });
    res.status(200).json({
      portfolio: publicOfficialCampaignsDocument(id, document),
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
const PUBLIC_ID_RE = /^[a-hjkmnp-z2-9]{8,24}$/;
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
    // content_hash was only a server-thumbnail cache-buster; that path is gone, so it's null now.
    const publicId = await dbEnsurePublicId(user.email, levelId, { ...level, id: levelId }, null);
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
//     assets/ with a content hash in the name (e.g. assets/index-Cy4ekEXV.js).
//     The name changes whenever the bytes change, so these are immutable for a
//     year. Public assets always live in nested subdirs (assets/ui, assets/
//     fonts, ...), never flat under assets/, so they never match this rule.
//   - Everything else (public images/fonts/audio/json): a modest 1h TTL that
//     trims repeat-visit payload but stays short enough that a hot static
//     override (STATIC_FRONTEND_DIR) is reflected to clients quickly.
const VITE_HASHED_ASSET = /^assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/;
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

// --- Open Graph unfurl ------------------------------------------------------
// A shared level link must unfurl on Discord/Slack/Twitter (crawlers fetch the URL server-side — no
// JS, no auth). The SPA fallback injects per-level og:/twitter: title/description tags; og:image is
// the branded default card. (Per-level server-rendered preview images were removed — the in-app
// thumbnails are client-baked and nothing else consumed the server render path.)
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
// Resolve a share reference to { level, title, subtitle, description }. Officials read the on-disk
// baked file (sync, no DB); user maps read public_maps (async). Returns null when unresolvable.
async function resolveShareTarget({ levelId, campaignId, mapId }) {
  if (mapId) {
    const row = await dbGetPublicMap(mapId).catch(() => null);
    if (!row || !row.body || typeof row.body !== 'object') return null;
    const level = row.body;
    const objective = OG_MODE_NAME[level.objective] || null;
    return {
      level,
      title: row.name || level.name || OG_SITE_NAME,
      subtitle: objective ? `Community map · ${objective}` : 'Community map',
      description: objective ? `A community-made ${objective} map.` : OG_DEFAULT_DESC,
    };
  }
  if (levelId && /^off-[a-z-]+$/.test(levelId)) {
    const ws = await officialWorkspace();
    const level = Object.hasOwn(ws.levels, levelId) && ws.levels[levelId] && typeof ws.levels[levelId] === 'object'
      ? ws.levels[levelId] : null;
    if (!level) return null;
    const campaign = campaignId ? ws.campaigns.find((c) => c && c.id === campaignId) || null : null;
    const objective = OG_MODE_NAME[level.objective] || null;
    return {
      level,
      title: campaign && campaign.name ? `${level.name} — ${campaign.name}` : (level.name || OG_SITE_NAME),
      subtitle: [campaign && campaign.name, objective].filter(Boolean).join(' · ') || null,
      description: level.notes || (campaign && campaign.name ? `A level in ${campaign.name}.` : OG_DEFAULT_DESC),
    };
  }
  return null;
}

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
    // og:image stays the branded default card — per-level server-rendered previews were removed.
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

// Configure the durable store, then start serving. The game (static + /play)
// must stay up even if the database is unreachable or behind schema, so a
// DB/schema-readiness failure is logged and surfaced as 503 on the persistence
// endpoints — it never blocks startup, and ensureDbReady() retries on the next
// request.
pool = buildPool();
if (pool) {
  pool.on('error', (error) => console.error('postgres pool error:', error));
  ensureDbReady()
    .then(() => console.log(`postgres ready (mode=${databaseUrl ? 'connection-string' : 'workload-identity'}, schema=${schemaMigrationMode}); ${schemaReadyMessage()}`))
    .catch((error) => console.error('postgres init failed; persistence endpoints will return 503 until it recovers or schema is prepared:', error))
    .finally(startServer);
} else {
  console.warn('no database configured (set DATABASE_URL, or POSTGRES_HOST/POSTGRES_DATABASE/POSTGRES_USER); persistence endpoints will return 503');
  startServer();
}
