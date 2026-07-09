import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const publicRoot = path.resolve(process.env.UNIT_ASSET_SOURCE_DIR || path.join(repoRoot, 'frontend', 'public'));
const storageDir = String(process.env.UNIT_ASSET_STORAGE_DIR || '').trim();
const containerUrl = String(process.env.UNIT_ASSET_CONTAINER_URL || '').replace(/\/+$/, '');
const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');

const palettes = ['navy-blue', 'crimson', 'golden', 'emerald', 'black', 'white'];
const directions = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const units = {
  pawn: {
    label: 'Pawn', shape: 'circle', footprint: 150, anchorX: 0.5, anchorY: 0.80241,
    notes: 'Helmeted pawn pixel-art production unit.',
  },
  rook: {
    label: 'Rook', shape: 'square', footprint: 428, anchorX: 0.5, anchorY: 0.80241,
    notes: 'Board-calibrated castle rook with exact eight-direction rotations.',
  },
  knight: {
    label: 'Knight', shape: 'circle', footprint: 178, anchorX: 0.5, anchorY: 0.80241,
    notes: 'Carved warhorse with a procedural navy fur coat.',
  },
  bishop: {
    label: 'Bishop', shape: 'circle', footprint: 126, anchorX: 0.5, anchorY: 0.80241,
    notes: 'Mitre bishop rendered as a true-isometric production unit.',
  },
  queen: {
    label: 'Queen', shape: 'circle', footprint: 150, anchorX: 0.5, anchorY: 0.80241,
    notes: 'Coronet queen rendered as a true-isometric production unit.',
  },
  king: {
    label: 'King', shape: 'circle', footprint: 148, anchorX: 0.5, anchorY: 0.80241,
    notes: 'Crowned king rendered as a true-isometric production unit.',
  },
};

function deterministicUuid(seed) {
  const bytes = Buffer.from(crypto.createHash('sha256').update(seed).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function inspectPng(buffer, source) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature) || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`${source} is not a valid PNG`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function localBlobPath(blobKey) {
  const root = path.resolve(storageDir);
  const target = path.resolve(root, ...blobKey.split('/'));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error('invalid blob key');
  return target;
}

let containerClient = null;
function container() {
  if (containerClient) return containerClient;
  if (!containerUrl) throw new Error('set UNIT_ASSET_CONTAINER_URL or UNIT_ASSET_STORAGE_DIR');
  const url = new URL(containerUrl);
  const service = new BlobServiceClient(`${url.protocol}//${url.host}`, new DefaultAzureCredential());
  containerClient = service.getContainerClient(decodeURIComponent(url.pathname.replace(/^\/+/, '')));
  return containerClient;
}

async function uploadBlob(blobKey, bytes, sha256) {
  if (dryRun) return;
  if (storageDir) {
    const target = localBlobPath(blobKey);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target)) fs.writeFileSync(target, bytes);
    return;
  }
  const block = container().getBlockBlobClient(blobKey);
  try {
    await block.uploadData(bytes, {
      conditions: { ifNoneMatch: '*' },
      blobHTTPHeaders: { blobContentType: 'image/png', blobCacheControl: 'public, max-age=31536000, immutable' },
      metadata: { sha256 },
    });
  } catch (error) {
    if (error.statusCode !== 409 && error.statusCode !== 412 && error.code !== 'BlobAlreadyExists') throw error;
  }
}

function buildPool() {
  if (process.env.DATABASE_URL) {
    const azure = /\.postgres\.database\.azure\.com/i.test(process.env.DATABASE_URL);
    return new Pool({ connectionString: process.env.DATABASE_URL, ssl: azure ? { rejectUnauthorized: false } : undefined });
  }
  const host = process.env.POSTGRES_HOST;
  const database = process.env.POSTGRES_DATABASE;
  const user = process.env.POSTGRES_USER;
  if (!host || !database || !user) throw new Error('set DATABASE_URL or POSTGRES_HOST/POSTGRES_DATABASE/POSTGRES_USER');
  const credential = new DefaultAzureCredential();
  return new Pool({
    host,
    port: 5432,
    database,
    user,
    ssl: { rejectUnauthorized: false },
    password: async () => (await credential.getToken('https://ossrdbms-aad.database.windows.net/.default')).token,
  });
}

async function main() {
  const pool = dryRun ? null : buildPool();
  const client = pool ? await pool.connect() : null;
  try {
    if (client) {
      const migration = await client.query('SELECT 1 FROM schema_migrations WHERE version = 14');
      if (!migration.rowCount) throw new Error('database migration 14 is required before importing units');
    }
    const current = client ? await client.query('SELECT family, accepted_asset_id FROM unit_families') : { rows: [] };
    const accepted = new Map(current.rows.map((row) => [row.family, row.accepted_asset_id]));
    const prepared = [];

    for (const [family, metadata] of Object.entries(units)) {
      if (accepted.get(family) && !force) {
        process.stdout.write(`skip ${family}: already has accepted art\n`);
        continue;
      }
      const assetId = deterministicUuid(`chess-tactics:accepted-unit:v1:${family}`);
      const sprites = [];
      for (const palette of palettes) {
        for (const direction of directions) {
          const source = path.join(publicRoot, 'assets', 'units', family, palette, `${direction}.png`);
          if (!fs.existsSync(source)) throw new Error(`missing ${source}`);
          const bytes = fs.readFileSync(source);
          const { width, height } = inspectPng(bytes, source);
          const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
          const blobKey = `sprites/${sha256.slice(0, 2)}/${sha256}.png`;
          await uploadBlob(blobKey, bytes, sha256);
          sprites.push({ palette, direction, sha256, blobKey, width, height, byteLength: bytes.length });
        }
      }
      prepared.push({ family, metadata, assetId, sprites });
      process.stdout.write(`${dryRun ? 'checked' : 'uploaded'} ${family}: ${sprites.length} frames\n`);
    }

    if (dryRun || !prepared.length || !client) return;
    await client.query('BEGIN');
    try {
      for (const item of prepared) {
        const { family, metadata, assetId, sprites } = item;
        const prior = accepted.get(family) || null;
        await client.query(
          `INSERT INTO unit_assets (
             id, family, label, method, notes, status, footprint_shape,
             source_canvas_width, source_canvas_height, source_footprint_px,
             anchor_x, anchor_y, updated_by
           ) VALUES ($1, $2, $3, 'Baseline import', $4, 'candidate', $5, 512, 512, $6, $7, $8, 'baseline-import')
           ON CONFLICT (id) DO UPDATE SET
             label = EXCLUDED.label, method = EXCLUDED.method, notes = EXCLUDED.notes, status = 'candidate',
             footprint_shape = EXCLUDED.footprint_shape,
             source_canvas_width = EXCLUDED.source_canvas_width,
             source_canvas_height = EXCLUDED.source_canvas_height,
             source_footprint_px = EXCLUDED.source_footprint_px,
             anchor_x = EXCLUDED.anchor_x, anchor_y = EXCLUDED.anchor_y,
             row_revision = unit_assets.row_revision + 1,
             updated_at = now(), updated_by = EXCLUDED.updated_by`,
          [assetId, family, metadata.label, metadata.notes, metadata.shape, metadata.footprint, metadata.anchorX, metadata.anchorY],
        );
        for (const sprite of sprites) {
          await client.query(
            `INSERT INTO unit_sprites (asset_id, palette, direction, sha256, blob_key, width, height, byte_length)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (asset_id, palette, direction) DO UPDATE SET
               sha256 = EXCLUDED.sha256, blob_key = EXCLUDED.blob_key,
               width = EXCLUDED.width, height = EXCLUDED.height,
               byte_length = EXCLUDED.byte_length, updated_at = now()`,
            [assetId, sprite.palette, sprite.direction, sprite.sha256, sprite.blobKey, sprite.width, sprite.height, sprite.byteLength],
          );
        }
        if (force && prior && String(prior) !== assetId) {
          await client.query("UPDATE unit_assets SET status = 'archived', updated_at = now(), updated_by = 'baseline-import' WHERE id = $1", [prior]);
        }
        await client.query(
          `UPDATE unit_families SET accepted_asset_id = $2, row_revision = row_revision + 1,
             updated_at = now(), updated_by = 'baseline-import' WHERE family = $1`,
          [family, assetId],
        );
        await client.query(
          `INSERT INTO unit_asset_events (family, asset_id, action, actor_email, details)
             VALUES ($1, $2, 'baseline-imported', 'baseline-import', $3::jsonb)`,
          [family, assetId, JSON.stringify({ previousAssetId: prior })],
        );
      }
      await client.query('UPDATE unit_catalog_state SET revision = revision + 1, updated_at = now() WHERE singleton = true');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    process.stdout.write(`accepted ${prepared.length} baseline unit families\n`);
  } finally {
    client?.release();
    if (pool) await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
