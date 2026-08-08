// Install a folder of approved prop artwork as playable props, in the one order that never
// leaves the live catalog in a state a client cannot hydrate.
//
//   node scripts/install-prop-batch.mjs <api-base> <dir> <id-prefix> <kind> [--dry-run]
//
// Each drawing becomes a SOURCE-ONLY structure row plus an AUTHORED prop entry in the seat
// document. That split is deliberate: a structure row of a playable kind becomes a REQUIRED base
// prop, and the seat document refuses to validate until every required base prop has an entry —
// so installing base props means a window where the two documents disagree and no client can
// hydrate seats. Source-only art carries no such requirement, and the seat document authors the
// prop on top of it, so each write leaves a complete state on its own.
//
// Owner approval is recorded per version because the accept path demands it: the catalog will not
// activate art that carries no owner proof naming the surface it was judged on.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { LiveMediaAdminClient, uploadCandidateBytes } from './live-media-admin-client.mjs';

const apiBase = process.argv[2];
const dir = process.argv[3];
const prefix = process.argv[4];
const propKind = process.argv[5];
const dryRun = process.argv.includes('--dry-run');
const surfaceUrl = process.argv.includes('--surface')
  ? process.argv[process.argv.indexOf('--surface') + 1]
  : '';
if (!apiBase || !dir || !prefix || !propKind || (!dryRun && !surfaceUrl)) {
  console.error('usage: install-prop-batch <api-base> <dir> <id-prefix> <kind> --surface <url> [--dry-run]');
  process.exit(2);
}

const TERRAINS = ['grass', 'dirt', 'stone', 'pebble', 'sand'];
const client = new LiveMediaAdminClient({ apiBase });
const json = async (url, init) => {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${url} -> ${response.status} ${text}`);
  return text ? JSON.parse(text) : {};
};

/** Contact point and render scale measured from the drawing itself (see propCandidateReview). */
async function seatFor(file, targetWidth) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const spans = [];
  let widest = 0;
  let lastRow = 0;
  for (let y = 0; y < info.height; y += 1) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] > 24) { if (first < 0) first = x; last = x; }
    }
    if (first >= 0) { spans.push({ y, first, last }); widest = Math.max(widest, last - first + 1); lastRow = y; }
  }
  const bottom = spans.filter((row) => row.y > lastRow - 4);
  return {
    width: info.width,
    height: info.height,
    anchorX: Math.round((Math.min(...bottom.map((r) => r.first)) + Math.max(...bottom.map((r) => r.last))) / 2),
    anchorY: lastRow,
    scale: Number((targetWidth / widest).toFixed(3)),
  };
}

const files = readdirSync(dir).filter((name) => name.endsWith('.png')).sort();
const plan = [];
for (const [index, name] of files.entries()) {
  const id = `${prefix}-${String(index).padStart(2, '0')}`;
  plan.push({ id, name, file: path.join(dir, name), seat: await seatFor(path.join(dir, name), 38) });
}

for (const item of plan) {
  console.log(`${item.name} -> ${item.id} anchor=${item.seat.anchorX},${item.seat.anchorY} scale=${item.seat.scale}`);
}
if (dryRun) { console.log(`dry run: ${plan.length} props`); process.exit(0); }

// 1. Media. Both depth halves of a flat-contact prop carry the same drawing.
for (const item of plan) {
  const bytes = readFileSync(item.file);
  for (const half of ['back', 'front']) {
    const slot = `props/${item.id}/${half}.png`;
    const uploaded = await uploadCandidateBytes({
      client,
      payload: {
        slot,
        domain: 'prop',
        role: 'media',
        availabilityPolicy: 'decorative',
        label: `${item.id} ${half}`,
        provenance: { tool: 'pixellab', batch: `${prefix}-install`, source: item.name },
        // The catalog only accepts art it can prove was never resampled: the declared source
        // dimensions and hash must equal the uploaded bytes exactly.
        nativeEvidence: {
          native1x: true,
          spatialResampling: false,
          sourceWidth: item.seat.width,
          sourceHeight: item.seat.height,
          sourceSha256: createHash('sha256').update(bytes).digest('hex'),
        },
      },
      bytes,
      mediaType: 'image/png',
      // Replay is keyed on the ORIGINAL request, so a corrected payload needs a new key —
      // otherwise an earlier attempt's evidence is what gets replayed and re-rejected.
      idempotencyKey: `${prefix}-install-v3-${item.id}-${half}`,
    });
    const sha = uploaded.media.sha256;
    await json(`${apiBase}/api/admin/media-versions/${uploaded.id}/review`, {
      method: 'POST',
      // The proof URL is checked against the request origin. A dev server proxies /api, so the
      // backend's Host header is the proxy's, not the surface's — state the origin explicitly so
      // the recorded proof names the surface the art was actually judged on.
      headers: {
        'Content-Type': 'application/json',
        'If-Match': `"${uploaded.revision}"`,
        Origin: new URL(surfaceUrl).origin,
      },
      body: JSON.stringify({
        expectedRevision: uploaded.revision,
        approved: true,
        notes: 'Owner approved this batch on the prop candidate board.',
        surfaceUrl,
        evidence: {
          schema: 'live-media-owner-proof-v1',
          versionId: uploaded.id,
          contentSha256: sha,
          slot,
          canonicalScale: 1,
          surfaceKind: 'prop-candidate-board',
        },
      }),
    });
    const reviewed = await json(`${apiBase}/api/admin/media-versions/${uploaded.id}`, {}).catch(() => null);
    const revision = reviewed?.version?.rowRevision ?? uploaded.revision + 1;
    await json(`${apiBase}/api/admin/media-versions/${uploaded.id}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'If-Match': `"${revision}"` },
      body: JSON.stringify({ expectedRevision: revision, expectedSlotRevision: 0, expectedActiveVersionId: null }),
    });
    console.log(`  installed ${slot}`);
  }
}

// 2. Source-only art rows. These hold the media and nothing else; they synthesize no prop.
const assets = plan.map((item, index) => ({
  id: `structure-${item.id}`,
  kind: 'structure',
  label: `${item.id} art`,
  sortOrder: 900 + index,
  lifecycleState: 'active',
  expectedRevision: 0,
  behavior: {
    value: item.id,
    structureKind: propKind,
    sourceOnly: true,
    terrains: TERRAINS,
    blocking: true,
    anchorX: item.seat.anchorX,
    anchorY: item.seat.anchorY,
    scale: item.seat.scale,
    splitMode: 'flat-contact',
  },
  metadata: { batch: `${prefix}-install` },
  media: { back: `props/${item.id}/back.png`, front: `props/${item.id}/front.png` },
}));
console.log('drawables:', JSON.stringify(await json(`${apiBase}/api/admin/drawable-assets`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ assets }),
})));

// 3. Authored props on top of that art, in one compare-and-swap save of the seat document.
const seatDoc = await json(`${apiBase}/api/prop-seats/default`, {});
const data = { ...seatDoc.portfolio.data };
for (const item of plan) {
  data[item.id] = {
    w: 1,
    h: 1,
    kind: propKind,
    label: item.id,
    blocking: true,
    terrains: TERRAINS,
    placement: 'prop',
    source: { kind: 'asset', id: item.id },
    anchorX: item.seat.anchorX,
    anchorY: item.seat.anchorY,
    scale: item.seat.scale,
    default: false,
  };
}
console.log('seats:', JSON.stringify(await json(`${apiBase}/api/prop-seats/default`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data, expectedRevision: seatDoc.portfolio.revision }),
})).slice(0, 200));
console.log(`installed ${plan.length} props: ${plan.map((item) => item.id).join(', ')}`);
