#!/usr/bin/env node
// Upload the confirm-mark candidates for `ui/kit/icons/confirm.png` (ADR-0638).
//
//   node scripts/install-confirm-mark.mjs --base <url> --dir <folder> [--dry-run]
//
// The mark a COMMITTING verb wears — the press that takes you into the Run, whether you are
// resuming one or beginning one. One mark for the act, so one slot, and installing it binds every
// confirm band at once.
//
// Three batches were generated before one was chosen, and all three stay uploaded so the decision
// can be re-read against what it was made against. `index` is what the review surface sorts on,
// so it is also the record of which idea came last: hands 1-4, go marks 11-14, checks 21-24.
// The owner's pick is `hand-placing`, accepted from the Studio's Confirm Mark surface.
//
// This script's whole job is to get the candidate rows and their immutable bytes in place.
// Review and acceptance deliberately do NOT happen here: the backend requires a game-owned
// review surface, and the honest one is the Studio's **Confirm Mark** category, which mounts
// each candidate in the real verb band at native size. Publishing from there records that
// page's own address as the proof URL.
//
//   /studio?mode=catalog&cat=confirmmark
//
// The generator's 64x64 output is uploaded BYTE-FOR-BYTE. No downscale, no recanvas: the bytes
// reviewed are the bytes drawn, which is what `nativeEvidence.native1x` asserts.
//
// Idempotent: a candidate whose sha256 is already on the slot is skipped, so a partial run is
// repaired by running it again.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? (argv[index + 1] ?? true) : fallback;
};
const baseUrl = String(flag('base', 'http://127.0.0.1:5173')).replace(/\/+$/, '');
const sourceDir = flag('dir', null);
const dryRun = argv.includes('--dry-run');
const cookie = process.env.LIVE_MEDIA_COOKIE ?? '';

const SLOT = 'ui/kit/icons/confirm.png';
const REVIEW_SURFACE_PATH = '/studio?mode=catalog&cat=confirmmark';
const BATCH_ID = 'confirm-mark-2026-08-12-v1';
const GO_BATCH_ID = 'confirm-mark-go-2026-08-12-v1';
const HAND_BATCH_ID = 'confirm-mark-hand-2026-08-12-v1';
/** The accepted one. A check means "valid"; these buttons mean "make your move". */
const INSTALLED = { batchId: HAND_BATCH_ID, entryId: '04-placing', label: 'Hand placing a pawn on the board' };

/**
 * The candidates, in the order the review surface offers them. `file` is the generator's own
 * output; `prompt` and `jobId` are the record of where it came from, which is what makes the
 * provenance non-empty and therefore the version installable.
 */
const CANDIDATES = [
  {
    index: 1,
    file: '01-green-check.png',
    label: 'Green check',
    jobId: 'effb3535-6186-4fcd-8832-f3f485606119',
    prompt: 'game UI icon: a bold thick green check mark tick, confirm/accept symbol, centered, thick black outline, saturated colors, subtle bevel shading, GBA-era pixel art icon',
    canvas: '64x64, no_background, single color black outline, medium shading, low detail, side view, seed 7',
  },
  {
    index: 2,
    file: '02-seal-parchment.png',
    label: 'Seal on parchment',
    jobId: '3f5f3d7c-f337-4909-a900-8e8469da03ca',
    prompt: 'game UI icon: red wax seal stamped on parchment with a gold check mark on it, confirm accept symbol, thick black outline, GBA-era pixel art icon',
    canvas: '64x64, no_background, single color black outline, medium shading, low detail, side view, seed 7',
  },
  {
    index: 3,
    file: '03-wax-seal.png',
    label: 'Wax seal',
    jobId: '94670b20-23db-43ef-aa05-dc9b3cbcae44',
    prompt: 'game UI icon: dark red wax seal blob stamped with a bold check mark, no paper, single round seal only, thick black outline, GBA-era pixel art icon',
    canvas: '64x64, no_background, single color black outline, medium shading, low detail, side view, seed 3',
  },
  {
    index: 4,
    file: '04-gold-check.png',
    label: 'Gold check',
    jobId: '87489159-e698-48f6-a095-140bada979be',
    prompt: 'game UI icon: a thick beveled gold check mark tick with dark outline and highlight, confirm accept symbol, centered on transparent background, GBA-era pixel art icon',
    canvas: '64x64, no_background, single color black outline, detailed shading, low detail, side view, seed 5',
  },
];

async function api(route, init = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...init,
    headers: { ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${route} → ${response.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

/** The bounding box of every non-transparent pixel — what `nativeEvidence.inkBox` records, and
 *  the number the icon-seat gate reads when a mark's drawn size has to be checked against its
 *  declaration. Computed from the exact bytes being uploaded, never from the prompt. */
function inkBox(bytes) {
  const png = PNG.sync.read(bytes);
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[(png.width * y + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('the candidate has no opaque pixels');
  return {
    box: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    width: png.width,
    height: png.height,
  };
}

function versionPayload(candidate, bytes) {
  const { box, width, height } = inkBox(bytes);
  return {
    slot: SLOT,
    domain: 'ui-kit',
    role: 'icon',
    label: `Confirm mark (${candidate.label})`,
    availabilityPolicy: 'critical',
    metadata: {
      candidateIndex: candidate.index,
      candidateLabel: candidate.label,
      runtime: {
        altText: '',
        variant: 'confirm',
        component: 'chrome-confirm-verb',
        nativeRole: 'chrome-confirm-verb',
      },
    },
    provenance: {
      schema: 'pixellab-generated-mark-v1',
      tool: 'create_image_pixflux',
      generator: 'pixellab',
      jobId: candidate.jobId,
      prompt: candidate.prompt,
      subject: 'confirm mark for a committing verb',
      subjectChosenBy: 'owner',
      generatedCanvas: candidate.canvas,
      postProcess: 'none — the generator output is uploaded byte-for-byte at its native 64x64',
      decision: 'ADR-0638',
      liveMediaBatch: {
        kind: 'candidate',
        schema: 'live-media-candidate-batch-provenance-v1',
        batchId: BATCH_ID,
        entryId: candidate.file.replace(/\.png$/, ''),
        contentSha256: createHash('sha256').update(bytes).digest('hex'),
      },
    },
    nativeEvidence: {
      schema: 'native-raster-evidence-v1',
      note: "The generator's own 64x64 output, uploaded byte-for-byte. No downscale, no recanvas — the bytes reviewed are the bytes drawn.",
      native1x: true,
      inkBox: box,
      sourceWidth: width,
      sourceHeight: height,
      sourceSha256: createHash('sha256').update(bytes).digest('hex'),
      spatialResampling: false,
    },
  };
}

async function main() {
  if (!sourceDir) throw new Error('--dir <folder> holding the generator output is required');
  const present = new Set(readdirSync(sourceDir));
  const catalog = await api('/api/admin/media-assets?slot=' + encodeURIComponent(SLOT));
  const existing = new Set((catalog.versions ?? [])
    .filter((version) => version.slot === SLOT && version.media?.sha256)
    .map((version) => version.media.sha256));

  const plan = CANDIDATES.map((candidate) => {
    if (!present.has(candidate.file)) throw new Error(`${candidate.file} is not in ${sourceDir}`);
    const bytes = readFileSync(path.join(sourceDir, candidate.file));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    return { candidate, bytes, sha256, satisfied: existing.has(sha256) };
  });

  const pending = plan.filter((entry) => !entry.satisfied);
  if (dryRun || !pending.length) {
    process.stdout.write(`${JSON.stringify({
      dryRun,
      base: baseUrl,
      slot: SLOT,
      catalogRevision: catalog.revision,
      satisfied: plan.filter((entry) => entry.satisfied).map((entry) => entry.candidate.file),
      pending: pending.map((entry) => ({ file: entry.candidate.file, sha256: entry.sha256 })),
      reviewOn: `${baseUrl}${REVIEW_SURFACE_PATH}`,
    }, null, 2)}\n`);
    return;
  }

  const created = [];
  for (const entry of pending) {
    const { version } = await api('/api/admin/media-versions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Slot paths carry `/`, which the key charset forbids, so the target is named by batch
        // plus entry. The hash makes the key change if the intended bytes ever do.
        'idempotency-key': `${BATCH_ID}:${entry.candidate.index}:${entry.sha256}`,
      },
      body: JSON.stringify(versionPayload(entry.candidate, entry.bytes)),
    });
    let current = version;
    if (!current.media) {
      await api(`/api/admin/media-versions/${encodeURIComponent(current.id)}/content`, {
        method: 'PUT',
        headers: { 'content-type': 'image/png', 'if-match': `"${current.rowRevision}"` },
        body: entry.bytes,
      });
      const after = await api('/api/admin/media-assets?slot=' + encodeURIComponent(SLOT));
      current = after.versions.find((candidate) => candidate.id === current.id);
    }
    created.push({ entry, version: current });
  }

  const after = await api('/api/admin/media-assets?slot=' + encodeURIComponent(SLOT));
  process.stdout.write(`${JSON.stringify({
    catalogRevision: after.revision,
    slot: SLOT,
    candidates: created.map(({ entry, version }) => ({
      file: entry.candidate.file,
      label: entry.candidate.label,
      status: version.status,
      sha256: version.media?.sha256 ?? null,
    })),
    reviewOn: `${baseUrl}${REVIEW_SURFACE_PATH}`,
  }, null, 2)}\n`);
}

await main();
