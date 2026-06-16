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
const lobbies = new Map();
const campaigns = new Map();

// Background music: the blob container is the source of truth. BGM_BASE_URL is
// the public base for both the index.json playlist and the track files; the
// browser uses it directly to stream. BGM_READ_URL overrides only where the
// server fetches the index from (e.g. a test slot serving it same-origin) and
// defaults to the public base. No Azure credentials — the index and tracks are
// public-read blobs fetched over plain HTTPS, the same way the server already
// calls auth.romaine.life.
const bgmBaseUrl = (process.env.BGM_BASE_URL || '').replace(/\/+$/, '');
const bgmReadUrl = (process.env.BGM_READ_URL || bgmBaseUrl).replace(/\/+$/, '');
const BGM_CACHE_TTL_MS = 5 * 60 * 1000;
let bgmCache = { tracks: null, expiry: 0 };

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
// This lives inline on purpose: the supervisor hot-swaps only server.js, so the
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
    name: 'design asset catalog (metadata + binary images)',
    sql: `
      CREATE TABLE IF NOT EXISTS design_assets (
        id           text        PRIMARY KEY,
        content_type text        NOT NULL,
        bytes        bytea       NOT NULL,
        slots        jsonb       NOT NULL DEFAULT '{}'::jsonb,
        status       text,
        metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
        revision     integer     NOT NULL DEFAULT 0,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now(),
        updated_by   text
      );
    `,
  },
];

let pool = null;
let dbReady = false;
let migrationPromise = null;

function buildPool() {
  if (databaseUrl) {
    return new Pool({
      connectionString: databaseUrl,
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

// Idempotent, self-healing readiness: migrations run once; a failed attempt is
// retried on the next request rather than wedging persistence until a redeploy.
async function ensureDbReady() {
  if (!pool) throw new Error('database_not_configured');
  if (dbReady) return;
  if (!migrationPromise) {
    migrationPromise = runMigrations()
      .then(() => { dbReady = true; })
      .catch((error) => { migrationPromise = null; throw error; });
  }
  await migrationPromise;
}

function dbUnavailable(res, message, error, code) {
  console.error(`${message}:`, error);
  res.status(503).json({ error: code });
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
const DESIGN_ASSET_STORE_SCHEMA_VERSION = 1;
// Asset ids carry dotted family/variant segments, e.g. button-9slice.main-menu
// and button-icon.main-menu.sword, so dots are allowed (unlike portfolio ids).
const DESIGN_ASSET_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
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
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=${size}`;
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

// --- Design asset catalog (metadata + binary images) -----------------------
// The main-menu asset catalog, DB-backed: catalog metadata (slots/status/etc.)
// AND the binary PNGs live in the `design_assets` table, mirroring the
// design_portfolios document store. Listing never reads `bytes` (a separate
// per-image endpoint streams them); writes COALESCE so a metadata-only PUT
// keeps the existing image.
function assetId(raw) {
  const id = String(raw || '').trim();
  return DESIGN_ASSET_ID_PATTERN.test(id) ? id : null;
}

function designAssetImageUrl(id) {
  return `/api/design-assets/${id}/image`;
}

async function dbListDesignAssets() {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT id, content_type, slots, status, metadata, revision, updated_at FROM design_assets ORDER BY id',
  );
  return rows;
}

async function dbGetDesignAssetBytes(id) {
  await ensureDbReady();
  const { rows } = await pool.query(
    'SELECT content_type, bytes FROM design_assets WHERE id = $1',
    [id],
  );
  return rows[0] || null;
}

async function dbUpsertDesignAsset(id, input) {
  await ensureDbReady();
  const bytes = input.bytes instanceof Buffer ? input.bytes : null;
  const slots = JSON.stringify(isObjectRecord(input.slots) ? input.slots : {});
  const status = input.status ?? null;
  const metadata = JSON.stringify(isObjectRecord(input.metadata) ? input.metadata : {});
  const updatedBy = input.updated_by ?? null;
  // Branch on whether an image is supplied. `bytes` is NOT NULL, and Postgres
  // checks NOT NULL on the proposed row *before* ON CONFLICT runs — so a
  // metadata-only INSERT can't be COALESCE'd away. With an image we
  // create-or-replace; without one we UPDATE the existing row, leaving the
  // bytes/content_type untouched. (The handler guarantees the row exists for
  // metadata-only writes.)
  if (bytes) {
    const { rows } = await pool.query(
      `INSERT INTO design_assets (id, content_type, bytes, slots, status, metadata, revision, updated_by)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, 1, $7)
       ON CONFLICT (id) DO UPDATE SET
         bytes = EXCLUDED.bytes,
         content_type = EXCLUDED.content_type,
         slots = EXCLUDED.slots,
         status = EXCLUDED.status,
         metadata = EXCLUDED.metadata,
         revision = design_assets.revision + 1,
         updated_at = now(),
         updated_by = EXCLUDED.updated_by
       RETURNING id, content_type, slots, status, metadata, revision, updated_at`,
      [id, input.content_type, bytes, slots, status, metadata, updatedBy],
    );
    return rows[0];
  }
  const { rows } = await pool.query(
    `UPDATE design_assets SET
       slots = $2::jsonb,
       status = $3,
       metadata = $4::jsonb,
       revision = revision + 1,
       updated_at = now(),
       updated_by = $5
     WHERE id = $1
     RETURNING id, content_type, slots, status, metadata, revision, updated_at`,
    [id, slots, status, metadata, updatedBy],
  );
  return rows[0] || null;
}

function publicDesignAsset(row) {
  return {
    id: row.id,
    status: row.status ?? null,
    slots: isObjectRecord(row.slots) ? row.slots : {},
    metadata: isObjectRecord(row.metadata) ? row.metadata : {},
    revision: Number.isInteger(row.revision) ? row.revision : 0,
    updated_at: row.updated_at ?? null,
    image: designAssetImageUrl(row.id),
  };
}

// Resolve a catalog image path (e.g. /assets/ui/main-menu/icon-sword.png) to
// bytes on disk. The backend runtime image may not carry frontend/src, so we
// try the served frontend dir first, then the built dist, then public sources.
function readSeedAssetBytes(relPath) {
  if (typeof relPath !== 'string' || !relPath) return null;
  const candidates = [
    path.join(frontendDir, relPath),
    path.resolve(__dirname, `../frontend/dist${relPath}`),
    path.resolve(__dirname, `../frontend/public${relPath}`),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return fs.readFileSync(candidate);
    } catch (_error) {
      // Ignore unreadable candidates and fall through to the next.
    }
  }
  return null;
}

// Idempotent seed: on first boot (empty table) populate design_assets from the
// committed catalog + PNG bytes. Guarded so it runs at most once per process and
// never blocks startup — a failure here leaves the table empty and is logged.
let designAssetsSeeded = false;
async function seedDesignAssetsOnce() {
  if (designAssetsSeeded || !pool) return;
  designAssetsSeeded = true;
  try {
    const { rows } = await pool.query('SELECT count(*)::int AS count FROM design_assets');
    if (rows[0] && rows[0].count > 0) return;

    // The hot-swap supervisor runs this file from HOT_BACKEND_DIR, so __dirname
    // is NOT the baked backend dir — read the catalog from the served frontend
    // dir (the one baked path the backend reliably has; the seed PNGs resolve
    // there too). Vite copies frontend/public/asset-catalog.json into dist.
    const seedCandidates = [
      path.join(frontendDir, 'asset-catalog.json'),
      path.resolve(__dirname, '..', 'frontend', 'public', 'asset-catalog.json'),
      path.resolve(__dirname, '..', 'frontend', 'src', 'asset-catalog.json'),
    ];
    let seedPath = null;
    for (const candidate of seedCandidates) {
      try { if (fs.existsSync(candidate)) { seedPath = candidate; break; } } catch (_e) { /* try next candidate */ }
    }
    if (!seedPath) {
      console.warn(`design asset seed skipped: catalog not found (tried ${seedCandidates.join(', ')})`);
      return;
    }
    const catalog = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    const assets = Array.isArray(catalog && catalog.assets) ? catalog.assets : [];
    let seeded = 0;
    for (const asset of assets) {
      if (!asset || typeof asset !== 'object') continue;
      const id = assetId(asset.id);
      if (!id) {
        console.warn(`design asset seed skipped invalid id: ${asset && asset.id}`);
        continue;
      }
      const relPath = asset.source && typeof asset.source.image === 'string' ? asset.source.image : '';
      const bytes = readSeedAssetBytes(relPath);
      if (!bytes) {
        console.warn(`design asset seed skipped ${id}: image not found (${relPath || 'no source.image'})`);
        continue;
      }
      const slots = {};
      if (asset.sheet !== undefined) slots.sheet = asset.sheet;
      if (asset.states !== undefined) slots.states = asset.states;
      if (asset.rules !== undefined) slots.rules = asset.rules;
      if (asset.rect !== undefined) slots.rect = asset.rect;
      await dbUpsertDesignAsset(id, {
        content_type: 'image/png',
        bytes,
        slots,
        status: typeof asset.status === 'string' ? asset.status : null,
        metadata: {
          type: asset.type ?? null,
          title: asset.title ?? null,
          summary: asset.summary ?? null,
          source: asset.source ?? null,
        },
        updated_by: 'seed',
      });
      seeded += 1;
    }
    console.log(`design asset catalog seeded (${seeded}/${assets.length} assets)`);
  } catch (error) {
    console.error('design asset seed failed; catalog will be empty until re-seeded or written:', error);
  }
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

function userCampaigns(email) {
  return Array.from(campaigns.values())
    .filter((campaign) => campaign.owner.email === email)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function campaignForUser(id, email) {
  const campaign = campaigns.get(id);
  if (!campaign || campaign.owner.email !== email) return null;
  return campaign;
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

async function readSession(req) {
  const host = req.get('host') || '';
  if (host.includes('.tank.dev.romaine.life')) {
    const cookie = req.get('cookie') || '';
    if (cookie.includes('better-auth.session=mock-dev-session')) {
      return {
        user: {
          email: 'player@example.com',
          name: 'Tactics Player',
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

async function requireDesignPortfolioWriter(req, res) {
  const host = req.get('host') || '';
  if (host.includes('.tank.dev.romaine.life')) {
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

// Background-music playlist. The frontend consumes this app-owned contract; the
// blob storage account stays under the backend (borrow primitives, not
// boundaries). The list is the durable index.json the upload pipeline writes
// into the container, cached briefly so we don't refetch on every page load.
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
    const response = await fetch(`${bgmReadUrl}/index.json`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`index ${response.status}`);
    const index = await response.json();
    const list = Array.isArray(index && index.tracks) ? index.tracks : [];
    const tracks = list
      .filter((track) => track && typeof track.file === 'string' && track.file)
      .map((track) => ({
        title: typeof track.title === 'string' && track.title ? track.title : track.file,
        url: `${bgmBaseUrl}/${encodeURIComponent(track.file)}`,
      }));
    bgmCache = { tracks, expiry: now + BGM_CACHE_TTL_MS };
    res.status(200).json({ tracks });
  } catch (error) {
    if (bgmCache.tracks) {
      res.status(200).json({ tracks: bgmCache.tracks });
      return;
    }
    console.warn(`/api/bgm: could not load index from ${bgmReadUrl}: ${error.message}`);
    res.status(200).json({ tracks: [] });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const session = await readSession(req);
    res.status(200).json(publicUser(session));
  } catch (error) {
    console.error('auth session check failed:', error);
    res.status(502).json({ signed_in: false, error: 'auth_unavailable' });
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
  };
  lobbies.set(id, lobby);
  res.status(201).json({ lobby: publicLobby(lobby, user.email) });
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
  lobby.phase = 'started';
  lobby.updatedAt = new Date().toISOString();
  res.status(200).json({ lobby: publicLobby(lobby, user.email) });
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
    lobbies.delete(lobby.id);
    res.status(204).end();
    return;
  }
  if (lobby.guest && lobby.guest.email === user.email) {
    lobby.guest = null;
    lobby.phase = 'waiting';
    lobby.updatedAt = new Date().toISOString();
    res.status(200).json({ lobby: publicLobby(lobby, user.email) });
    return;
  }
  res.status(403).json({ error: 'not_in_lobby' });
});

app.get('/api/campaigns', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.status(200).json({ campaigns: userCampaigns(user.email).map(campaignSummary) });
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
  campaigns.set(campaign.id, campaign);
  res.status(201).json({ campaign: campaignSummary(campaign) });
});

app.get('/api/campaigns/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const campaign = campaignForUser(req.params.id, user.email);
  if (!campaign) {
    res.status(404).json({ error: 'campaign_not_found' });
    return;
  }
  res.status(200).json({ campaign: campaignSummary(campaign) });
});

app.patch('/api/campaigns/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const campaign = campaignForUser(req.params.id, user.email);
  if (!campaign) {
    res.status(404).json({ error: 'campaign_not_found' });
    return;
  }
  const raw = req.body && typeof req.body === 'object' ? req.body : {};
  if (Object.hasOwn(raw, 'title')) campaign.title = clampText(raw.title, campaign.title, 64);
  if (Object.hasOwn(raw, 'description')) campaign.description = clampText(raw.description, campaign.description, 220);
  campaign.updatedAt = new Date().toISOString();
  res.status(200).json({ campaign: campaignSummary(campaign) });
});

app.delete('/api/campaigns/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const campaign = campaignForUser(req.params.id, user.email);
  if (!campaign) {
    res.status(404).json({ error: 'campaign_not_found' });
    return;
  }
  campaigns.delete(campaign.id);
  res.status(204).end();
});

app.post('/api/campaigns/:id/levels', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const campaign = campaignForUser(req.params.id, user.email);
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
  res.status(201).json({ campaign: campaignSummary(campaign), level: publicLevel(level) });
});

app.patch('/api/campaigns/:id/levels/:levelId', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const campaign = campaignForUser(req.params.id, user.email);
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
  res.status(200).json({ campaign: campaignSummary(campaign), level: publicLevel(level) });
});

app.delete('/api/campaigns/:id/levels/:levelId', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const campaign = campaignForUser(req.params.id, user.email);
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
  res.status(200).json({ campaign: campaignSummary(campaign) });
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

// Design asset catalog: the DB-backed main-menu catalog. The list returns
// metadata only (slots/status/etc.) plus a per-image URL; the image route
// streams the bytea; the gated PUT replaces metadata and, optionally, the image.
app.get('/api/design-assets', async (_req, res) => {
  try {
    const rows = await dbListDesignAssets();
    res.status(200).json({
      assets: rows.map(publicDesignAsset),
      store_schema_version: DESIGN_ASSET_STORE_SCHEMA_VERSION,
    });
  } catch (error) {
    dbUnavailable(res, 'design asset list failed', error, 'design_asset_store_unavailable');
  }
});

app.get('/api/design-assets/:id/image', async (req, res) => {
  const id = assetId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_design_asset_id' });
    return;
  }
  try {
    const row = await dbGetDesignAssetBytes(id);
    if (!row || !row.bytes) {
      res.status(404).json({ error: 'design_asset_not_found' });
      return;
    }
    res.setHeader('Content-Type', row.content_type || 'application/octet-stream');
    // Catalog images are edited in place (the row's bytea is the source of
    // truth); no-cache keeps editors/reviewers seeing the latest in dev.
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(row.bytes);
  } catch (error) {
    dbUnavailable(res, 'design asset image read failed', error, 'design_asset_store_unavailable');
  }
});

// Image uploads travel as base64 in the JSON body, so this route needs a larger
// limit than the global 256kb parser (the catalog PNGs are several hundred KB).
app.put('/api/design-assets/:id', express.json({ limit: '12mb' }), async (req, res) => {
  const user = await requireDesignPortfolioWriter(req, res);
  if (!user) return;
  const id = assetId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_design_asset_id' });
    return;
  }
  const raw = req.body && typeof req.body === 'object' ? req.body : {};
  const hasImage = typeof raw.image_base64 === 'string' && raw.image_base64.length > 0;
  const hasMetadata = Object.hasOwn(raw, 'slots') || Object.hasOwn(raw, 'status') || Object.hasOwn(raw, 'metadata');
  if (!hasImage && !hasMetadata) {
    res.status(400).json({ error: 'design_asset_update_required' });
    return;
  }
  let bytes = null;
  if (hasImage) {
    if (typeof raw.content_type !== 'string' || !raw.content_type.trim()) {
      res.status(400).json({ error: 'design_asset_content_type_required' });
      return;
    }
    bytes = Buffer.from(raw.image_base64, 'base64');
    if (!bytes.length) {
      res.status(400).json({ error: 'design_asset_image_invalid' });
      return;
    }
  }
  try {
    // A brand-new asset must arrive with an image: the bytea column is NOT NULL,
    // and a metadata-only first write has nothing to COALESCE against.
    if (!hasImage) {
      const existing = await dbGetDesignAssetBytes(id);
      if (!existing) {
        res.status(400).json({ error: 'design_asset_image_required' });
        return;
      }
    }
    const row = await dbUpsertDesignAsset(id, {
      content_type: hasImage ? raw.content_type.trim() : null,
      bytes,
      slots: isObjectRecord(raw.slots) ? raw.slots : {},
      status: typeof raw.status === 'string' ? raw.status : null,
      metadata: isObjectRecord(raw.metadata) ? raw.metadata : {},
      updated_by: user.email,
    });
    res.status(200).json({
      asset: publicDesignAsset(row),
      store_schema_version: DESIGN_ASSET_STORE_SCHEMA_VERSION,
    });
  } catch (error) {
    dbUnavailable(res, 'design asset write failed', error, 'design_asset_store_unavailable');
  }
});

app.get('/api/auth/sign-in', (req, res) => {
  const host = req.get('host') || '';
  if (host.includes('.tank.dev.romaine.life')) {
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
  if (!Array.isArray(raw.campaigns) || !raw.levels || typeof raw.levels !== 'object') {
    res.status(400).json({ error: 'invalid_workspace' });
    return;
  }
  try {
    const updatedAt = await dbPutWorkspace(user.email, { campaigns: raw.campaigns, levels: raw.levels });
    res.status(200).json({ ok: true, campaigns: raw.campaigns.length, updated_at: updatedAt });
  } catch (error) {
    dbUnavailable(res, 'campaign workspace write failed', error, 'workspace_unavailable');
  }
});

app.use((req, res, next) => {
  if (Object.hasOwn(req.query || {}, 'screen')) {
    res.status(404).send('not found');
    return;
  }
  next();
});
if (staticFrontendDir) {
  app.use(express.static(staticFrontendDir));
}
app.use((req, res, next) => {
  if (MIGRATED_RAW_ASSET_PATHS.has(req.path)) {
    res.status(404).send('not found');
    return;
  }
  next();
});
app.use(express.static(frontendDir));

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
app.use((req, res) => {
  if (STATIC_ASSET_EXTENSIONS.has(path.extname(req.path).toLowerCase())) {
    res.status(404).send('not found');
    return;
  }
  res.sendFile(frontendIndexFile());
});

function startServer() {
  app.listen(port, () => {
    console.log(`chess-tactics listening on :${port}`);
  });
}

// Configure the durable store, then start serving. The game (static + /play)
// must stay up even if the database is unreachable, so a DB/migration failure is
// logged and surfaced as 503 on the persistence endpoints — it never blocks
// startup, and ensureDbReady() retries on the next request.
pool = buildPool();
if (pool) {
  pool.on('error', (error) => console.error('postgres pool error:', error));
  ensureDbReady()
    .then(() => console.log(`postgres ready (mode=${databaseUrl ? 'connection-string' : 'workload-identity'}); schema migrations applied`))
    .then(seedDesignAssetsOnce)
    .catch((error) => console.error('postgres init failed; persistence endpoints will return 503 until it recovers:', error))
    .finally(startServer);
} else {
  console.warn('no database configured (set DATABASE_URL, or POSTGRES_HOST/POSTGRES_DATABASE/POSTGRES_USER); persistence endpoints will return 503');
  startServer();
}
