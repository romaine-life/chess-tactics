// Stage generated prop artwork as REVIEW CANDIDATES on an existing prop's live-media slots.
//
//   node scripts/upload-prop-candidates.mjs <api-base> <prop-id> <dir>
//
// Candidates are uploaded, never accepted: the accept path requires owner review evidence
// carrying a live surface URL, so installing art is something the owner does from the review
// surface, not something a generator can do on its own. This only puts the bytes where that
// surface can find them.
//
// A flat-contact prop draws one image through two depth-half slots, so the same bytes are
// staged on both; the review surface accepts them as one group.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { LiveMediaAdminClient, uploadCandidateBytes } from './live-media-admin-client.mjs';

const apiBase = process.argv[2];
const propId = process.argv[3];
const dir = process.argv[4];
if (!apiBase || !propId || !dir) {
  console.error('usage: upload-prop-candidates <api-base> <prop-id> <dir-of-pngs>');
  process.exit(2);
}

const client = new LiveMediaAdminClient({ apiBase });
const catalog = await fetch(`${apiBase}/api/asset-catalog`).then((response) => response.json());
const slots = ['back', 'front'].map((half) => {
  const slot = catalog.slots.find((entry) => entry.slot === `props/${propId}/${half}.png`);
  if (!slot) throw new Error(`prop ${propId} has no ${half} slot`);
  return slot;
});

const files = readdirSync(dir).filter((name) => name.endsWith('.png')).sort();
for (const [index, name] of files.entries()) {
  const bytes = readFileSync(path.join(dir, name));
  const tag = `${propId}-cand-${String(index).padStart(2, '0')}`;
  for (const slot of slots) {
    const uploaded = await uploadCandidateBytes({
      client,
      payload: {
        // The slot already exists, so its contract must be restated exactly — creating a version
        // refuses to rewrite a slot's domain/role/policy silently.
        slot: slot.slot,
        domain: slot.domain,
        role: slot.role,
        availabilityPolicy: slot.availabilityPolicy,
        label: `${propId} candidate ${index} (${name})`,
        provenance: { tool: 'pixellab', batch: 'rock-silhouette-bakeoff', source: name },
        nativeEvidence: { native1x: true, width: 0, height: 0 },
      },
      bytes,
      mediaType: 'image/png',
      idempotencyKey: `${tag}-${slot.slot}`.replace(/[^A-Za-z0-9._-]/g, '-'),
    });
    console.log(`${name} -> ${slot.slot} candidate ${uploaded.id}${uploaded.reused ? ' (replay)' : ''}`);
  }
}
console.log(`staged ${files.length} candidates on props/${propId}`);
