#!/usr/bin/env node

// Dry-run all unused rows by default. For surgical cleanup, repeat
// `--asset-id <uuid>`; apply still requires the exact scoped count.

import crypto from 'node:crypto';
import pg from 'pg';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';

const { Pool } = pg;
const args = process.argv.slice(2);
const apply = args.includes('--apply');

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function options(name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    values.push(value);
  }
  return values;
}

const expectedCount = Number(option('--expected-count'));
if (apply && (!Number.isInteger(expectedCount) || expectedCount < 0)) {
  throw new Error('--apply requires --expected-count <number>');
}
const requestedAssetIds = options('--asset-id');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (requestedAssetIds.some((id) => !uuidPattern.test(id))) {
  throw new Error('--asset-id values must be UUIDs');
}
if (new Set(requestedAssetIds).size !== requestedAssetIds.length) {
  throw new Error('--asset-id values must be unique');
}

const archiveContainerUrl = (
  process.env.UNIT_ART_ARCHIVE_CONTAINER_URL ||
  'https://chesstacticsmedia.blob.core.windows.net/unit-art-archive'
).replace(/\/+$/, '');
const databaseUrl = process.env.DATABASE_URL || '';
const pgHost = process.env.POSTGRES_HOST || 'chess-tactics-pg.postgres.database.azure.com';
const pgDatabase = process.env.POSTGRES_DATABASE || 'chess_tactics';
const pgUser = process.env.POSTGRES_USER || 'nelson-devops-project@outlook.com';
const credential = new DefaultAzureCredential();

function createPool() {
  if (databaseUrl) {
    const ssl = /sslmode=require/i.test(databaseUrl) || /\.postgres\.database\.azure\.com/i.test(databaseUrl);
    return new Pool({
      connectionString: databaseUrl,
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
      max: 2,
      connectionTimeoutMillis: 10_000,
    });
  }
  return new Pool({
    host: pgHost,
    port: 5432,
    database: pgDatabase,
    user: pgUser,
    password: async () => {
      const token = await credential.getToken('https://ossrdbms-aad.database.windows.net/.default');
      if (!token?.token) throw new Error('failed to acquire an Azure Postgres token');
      return token.token;
    },
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 10_000,
  });
}

async function readUnusedSnapshot(queryable, lock = false, assetIds = requestedAssetIds) {
  const scopeClause = assetIds.length ? 'AND a.id = ANY($1::uuid[])' : '';
  const scopeParams = assetIds.length ? [assetIds] : [];
  const assets = await queryable.query(
    `SELECT a.id, a.family, a.label, a.method, a.notes, a.status,
            a.footprint_shape, a.source_canvas_width, a.source_canvas_height,
            a.source_footprint_px, a.anchor_x, a.anchor_y, a.row_revision,
            a.created_at, a.updated_at, a.updated_by
       FROM unit_assets a
      WHERE NOT EXISTS (
        SELECT 1 FROM unit_families f WHERE f.accepted_asset_id = a.id
      )
      ${scopeClause}
      ORDER BY a.family, a.created_at, a.id
      ${lock ? 'FOR UPDATE OF a' : ''}`,
    scopeParams,
  );
  const ids = assets.rows.map((row) => String(row.id));
  const sprites = await queryable.query(
    `SELECT asset_id, palette, direction, sha256, blob_key, content_type,
            width, height, byte_length, created_at, updated_at
       FROM unit_sprites
      WHERE asset_id = ANY($1::uuid[])
      ORDER BY asset_id, palette, direction`,
    [ids],
  );
  const events = await queryable.query(
    `SELECT id, family, asset_id, action, actor_email, details, created_at
       FROM unit_asset_events
      WHERE asset_id = ANY($1::uuid[])
      ORDER BY id`,
    [ids],
  );
  const families = await queryable.query(
    `SELECT family, accepted_asset_id, display_scale_percent, row_revision,
            updated_at, updated_by
       FROM unit_families
      ORDER BY family`,
  );
  const catalogState = await queryable.query(
    'SELECT revision, updated_at FROM unit_catalog_state WHERE singleton = true',
  );
  return {
    assets: assets.rows,
    sprites: sprites.rows,
    events: events.rows,
    families: families.rows,
    catalogState: catalogState.rows[0] || null,
  };
}

function fingerprint(snapshot) {
  return crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function summary(snapshot) {
  const bytes = snapshot.sprites.reduce((total, row) => total + Number(row.byte_length), 0);
  return {
    assets: snapshot.assets.length,
    sprites: snapshot.sprites.length,
    events: snapshot.events.length,
    bytes,
    mib: Number((bytes / 1024 / 1024).toFixed(2)),
    ids: snapshot.assets.map((row) => String(row.id)),
  };
}

async function archiveManifest(manifest) {
  const url = new URL(archiveContainerUrl);
  const service = new BlobServiceClient(`${url.protocol}//${url.host}`, credential);
  const container = service.getContainerClient(decodeURIComponent(url.pathname.replace(/^\/+/, '')));
  await container.createIfNotExists();

  const body = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const sha256 = crypto.createHash('sha256').update(body).digest('hex');
  const stamp = manifest.archivedAt.replace(/[:.]/g, '-');
  const blobKey = `database/${stamp}-unused-unit-assets-${sha256.slice(0, 12)}.json`;
  const block = container.getBlockBlobClient(blobKey);
  await block.uploadData(body, {
    conditions: { ifNoneMatch: '*' },
    blobHTTPHeaders: { blobContentType: 'application/json' },
    tier: 'Cool',
    metadata: {
      sha256,
      assetcount: String(manifest.summary.assets),
      spritecount: String(manifest.summary.sprites),
    },
  });
  const downloaded = await block.downloadToBuffer();
  const downloadedSha = crypto.createHash('sha256').update(downloaded).digest('hex');
  if (downloadedSha !== sha256) throw new Error('uploaded database archive failed SHA-256 verification');
  return { blobKey, sha256, bytes: body.length };
}

const pool = createPool();
try {
  const snapshot = await readUnusedSnapshot(pool);
  const currentSummary = summary(snapshot);
  const missingAssetIds = requestedAssetIds.filter((id) => !currentSummary.ids.includes(id));
  if (missingAssetIds.length) {
    throw new Error(`requested assets are absent, accepted, or already removed: ${missingAssetIds.join(', ')}`);
  }
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    target: `${pgHost}/${pgDatabase}`,
    scope: requestedAssetIds.length ? { assetIds: requestedAssetIds } : 'all-unused',
    ...currentSummary,
  }, null, 2));
  if (!apply) {
    console.log('Dry run only. Re-run with --apply --expected-count <assets> to archive and prune.');
    process.exitCode = 0;
  } else {
    if (snapshot.assets.length !== expectedCount) {
      throw new Error(`expected ${expectedCount} unused assets, found ${snapshot.assets.length}`);
    }
    const snapshotFingerprint = fingerprint(snapshot);
    const manifest = {
      schemaVersion: 1,
      archivedAt: new Date().toISOString(),
      purpose: requestedAssetIds.length
        ? 'Targeted Unit Art operational-catalog cleanup'
        : 'Unit Art operational-catalog cleanup',
      blobsRetained: true,
      snapshotFingerprint,
      summary: currentSummary,
      records: snapshot,
    };
    const archive = await archiveManifest(manifest);

    const client = await pool.connect();
    let deletedAssets = 0;
    let deletedEvents = 0;
    let catalogRevision = null;
    try {
      await client.query('BEGIN');
      await client.query('SELECT family, accepted_asset_id FROM unit_families ORDER BY family FOR UPDATE');
      const locked = await readUnusedSnapshot(client, true, requestedAssetIds);
      if (fingerprint(locked) !== snapshotFingerprint) {
        throw new Error('unused unit catalog changed after it was archived; nothing was deleted');
      }
      const ids = locked.assets.map((row) => String(row.id));
      const eventDelete = await client.query(
        'DELETE FROM unit_asset_events WHERE asset_id = ANY($1::uuid[])',
        [ids],
      );
      const assetDelete = await client.query(
        `DELETE FROM unit_assets a
          WHERE a.id = ANY($1::uuid[])
            AND NOT EXISTS (SELECT 1 FROM unit_families f WHERE f.accepted_asset_id = a.id)`,
        [ids],
      );
      if (assetDelete.rowCount !== expectedCount) {
        throw new Error(`refused partial prune: expected ${expectedCount} deletes, got ${assetDelete.rowCount}`);
      }
      const revision = await client.query(
        'UPDATE unit_catalog_state SET revision = revision + 1, updated_at = now() WHERE singleton = true RETURNING revision',
      );
      deletedAssets = assetDelete.rowCount;
      deletedEvents = eventDelete.rowCount;
      catalogRevision = Number(revision.rows[0]?.revision || 0);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    console.log(JSON.stringify({
      archived: archive,
      deletedAssets,
      deletedEvents,
      retainedBlobs: currentSummary.sprites,
      catalogRevision,
    }, null, 2));
  }
} finally {
  await pool.end();
}
