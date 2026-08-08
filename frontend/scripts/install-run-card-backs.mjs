#!/usr/bin/env node
// Install the player-selectable Run card backs (ADR-0521).
//
// Every back the picker offers already exists as an accepted-quality candidate under the single
// review slot `review/run-card-back/standard.png`, where the whole card-back study was mounted on
// 2026-08-04. This promotes the chosen six to their own runtime slots, byte-identically: the bytes
// are fetched by their content hash and re-posted, so a promoted back is the same raster the owner
// looked at, never a re-render or a resample.
//
//   node scripts/install-run-card-backs.mjs --base <url> [--dry-run]
//
// Idempotent: a slot that already carries the intended sha256 is left alone, so a partial run is
// repaired by running it again.
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? (argv[index + 1] ?? true) : fallback;
};
const baseUrl = String(flag('base', 'http://title-bar.chess-tactics.localhost')).replace(/\/+$/, '');
const dryRun = argv.includes('--dry-run');

const REVIEW_SLOT = 'review/run-card-back/standard.png';
const LEGACY_SLOT = 'ui/run/card-back/standard.png';

/**
 * The offered set, in the order the picker lists them. `reviewLabel` is the exact label the study
 * gave the candidate — the join key, because a review slot holds every candidate ever mounted to
 * it and the version ids are not memorable. `conceptId` keeps each runtime version pointing back
 * at the prompt record that produced it.
 */
const BACKS = [
  { id: 'kings-position', title: 'The King’s Position', conceptId: 'kings-position', reviewLabel: 'The King\'s Position — Codex', prompts: 'run-card-back-king-prompts-v3.json#kings-position-codex' },
  { id: 'fivefold-gambit', title: 'The Fivefold Gambit', conceptId: 'fivefold-gambit', reviewLabel: 'The Fivefold Gambit — Codex', prompts: 'run-card-back-prompts-v2.json#fivefold-gambit-codex' },
  { id: 'closed-position', title: 'The Closed Position', conceptId: 'closed-position', reviewLabel: 'The Closed Position — Codex v2', prompts: 'run-card-back-prompts-v2.json#closed-position-codex' },
  { id: 'arcane-relic', title: 'The Arcane Relic', conceptId: 'arcane-relic', reviewLabel: 'The Arcane Relic — Codex', prompts: 'run-card-back-prompts-v2.json#arcane-relic-codex' },
  { id: 'crowned-gambit', title: 'The Crowned Gambit', conceptId: 'crowned-gambit', reviewLabel: 'The Crowned Gambit — Codex', prompts: 'run-card-back-king-prompts-v3.json#crowned-gambit-codex' },
  { id: 'register', title: 'The Register', conceptId: 'register', reviewLabel: 'Run card back Codex candidate 01', prompts: 'run-card-back-prompts-v1.json#codex-01' },
];

/** The shipped default. The legacy universal slot is kept on these same bytes; see below. */
const DEFAULT_BACK = 'kings-position';
/** Where the candidates this installs are looked at and published from. */
const REVIEW_SURFACE_PATH = '/studio?mode=viewer&vk=cardlayout&backStudy=1';

async function api(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const runtimeSlot = (id) => `ui/run/card-back/${id}.png`;

function versionPayload(back, source, slot) {
  return {
    slot,
    domain: 'ui-kit',
    role: 'card-back',
    label: `${back.title} — Codex`,
    availabilityPolicy: 'critical',
    slotMetadata: { schema: 'run-card-back-slot-v1', aspectRatio: '5:7', universalDefault: back.id === DEFAULT_BACK },
    metadata: {
      schema: 'run-card-back-runtime-v1',
      provider: 'codex',
      universal: true,
      conceptId: back.conceptId,
      conceptLabel: back.title,
      aspectRatio: '5:7',
      nativeWidth: 1060,
      nativeHeight: 1484,
      // The player-facing identity. `selectable` is what separates this from the pre-ADR-0521
      // world, where one accepted back was the only one a Run could deal.
      selectable: true,
      settingValue: back.id,
      runtime: {
        altText: '',
        variant: back.id,
        component: 'run-card-back',
        frameCount: 1,
        frameWidth: 1060,
        frameHeight: 1484,
        nativeRole: 'run-card-back',
      },
    },
    provenance: {
      schema: 'run-card-back-runtime-provenance-v1',
      decision: 'ADR-0521',
      generator: 'Codex built-in image generation',
      transform: 'none; byte-identical native source',
      reviewSlot: REVIEW_SLOT,
      promptSource: `docs/art/${back.prompts}`,
      reviewCandidateSha256: source.media.sha256,
      reviewCandidateVersionId: source.id,
      liveMediaBatch: {
        kind: 'candidate',
        schema: 'live-media-candidate-batch-provenance-v1',
        batchId: 'run-card-back-selectable-set-2026-08-08-v1',
        entryId: `${back.id}-runtime`,
        contentSha256: source.media.sha256,
        sources: [{
          sha256: source.media.sha256,
          entryId: `${back.id}-runtime-source`,
          versionId: source.id,
          sourcePath: `generated/run-card-back/${back.id}.png`,
        }],
      },
    },
    nativeEvidence: {
      schema: 'native-raster-evidence-v1',
      native1x: true,
      sourceWidth: 1060,
      sourceHeight: 1484,
      sourceSha256: source.media.sha256,
      spatialResampling: false,
    },
  };
}

async function main() {
  const catalog = await api('/api/admin/media-assets');
  const byLabel = new Map(catalog.versions.filter((v) => v.slot === REVIEW_SLOT).map((v) => [v.label, v]));
  const slotByName = new Map(catalog.slots.map((s) => [s.slot, s]));

  // Only the six offered backs. The legacy universal slot is deliberately NOT re-pointed: every
  // face-down card in the Run now resolves through the setting, so that slot has no reader left to
  // mislead, and it is separately in flight for a backdrop-cut migration of its own. Two unrelated
  // changes converging on one slot is how one of them gets silently thrown away.
  const targets = BACKS.map((back) => ({ back, slot: runtimeSlot(back.id) }));

  const plan = [];
  for (const { back, slot } of targets) {
    const source = byLabel.get(back.reviewLabel);
    if (!source?.media?.sha256) throw new Error(`${back.id}: no reviewed candidate labelled "${back.reviewLabel}"`);
    const live = slotByName.get(slot);
    const activeSha = live?.activeVersionId
      ? catalog.versions.find((v) => v.id === live.activeVersionId)?.media?.sha256 ?? null
      : null;
    plan.push({ back, slot, source, activeSha, satisfied: activeSha === source.media.sha256 });
  }

  const pending = plan.filter((p) => !p.satisfied);
  if (dryRun || !pending.length) {
    process.stdout.write(`${JSON.stringify({
      dryRun, base: baseUrl, catalogRevision: catalog.revision,
      satisfied: plan.filter((p) => p.satisfied).map((p) => p.slot),
      pending: pending.map((p) => ({ slot: p.slot, from: p.activeSha, to: p.source.media.sha256 })),
    }, null, 2)}\n`);
    return;
  }

  const created = [];
  for (const item of pending) {
    const payload = versionPayload(item.back, item.source, item.slot);
    const { version } = await api('/api/admin/media-versions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Slot paths carry `/`, which the key charset forbids, so the target is named by back id
        // plus which slot it is filling. Both are stable, and the hash makes the key change if the
        // intended bytes ever do.
        'idempotency-key': `run-card-back-selectable-v1:${item.back.id}:${item.slot === LEGACY_SLOT ? 'legacy' : 'runtime'}:${item.source.media.sha256}`,
      },
      body: JSON.stringify(payload),
    });
    let current = version;
    if (!current.media) {
      const bytes = Buffer.from(await (await fetch(`${baseUrl}/api/admin/media/${item.source.media.sha256}`)).arrayBuffer());
      const digest = crypto.createHash('sha256').update(bytes).digest('hex');
      if (digest !== item.source.media.sha256) throw new Error(`${item.slot}: fetched bytes do not match the reviewed hash`);
      await api(`/api/admin/media-versions/${encodeURIComponent(current.id)}/content`, {
        method: 'PUT',
        headers: { 'content-type': 'image/png', 'if-match': `"${current.rowRevision}"` },
        body: bytes,
      });
      current = (await api('/api/admin/media-assets')).versions.find((v) => v.id === current.id);
    }
    created.push({ item, version: current });
  }

  // Review and acceptance deliberately do NOT happen here. The backend requires a game-owned
  // review surface, and the honest one for a card back is the Studio's Card Back study, which
  // mounts each of these through the real RunCardBack component at canonical 1x. Publishing from
  // there records that page's own address as the proof URL. This script's whole job is to get the
  // candidate rows and their immutable bytes in place for it to show.
  const after = await api('/api/admin/media-assets');
  process.stdout.write(`${JSON.stringify({
    catalogRevision: after.revision,
    candidates: created.map(({ item, version }) => ({
      slot: item.slot, back: item.back.id, status: version.status, sha256: version.media?.sha256 ?? null,
    })),
    publishOn: `${baseUrl}${REVIEW_SURFACE_PATH}`,
  }, null, 2)}\n`);
}

await main();
