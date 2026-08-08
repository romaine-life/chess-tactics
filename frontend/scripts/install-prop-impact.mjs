// Install one-shot IMPACT sheets for props whose art is already live.
//
//   node scripts/install-prop-impact.mjs <api-base> <dir-of-strips> <surface-url>
//
// Each file is named <propId>.png and is a horizontal strip whose FIRST frame is the prop's
// resting drawing. The frame geometry travels with the media as runtime metadata, so the sheet
// and the numbers that cut it cannot be separated. Owner approval is recorded per version because
// acceptance refuses art carrying no proof of the surface it was judged on.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { LiveMediaAdminClient, uploadCandidateBytes } from "./live-media-admin-client.mjs";
const [apiBase, dir, surfaceUrl] = process.argv.slice(2);
const client = new LiveMediaAdminClient({ apiBase });
const json = async (url, init) => { const r = await fetch(url, init); const t = await r.text();
  if (!r.ok) throw new Error(`${init?.method ?? "GET"} ${url} -> ${r.status} ${t}`); return t ? JSON.parse(t) : {}; };
const cat = await json(`${apiBase}/api/drawable-catalog`, {});
for (const name of readdirSync(dir).filter(n => n.endsWith(".png")).sort()) {
  const id = name.replace(/\.png$/, "");
  const file = path.join(dir, name);
  const bytes = readFileSync(file);
  const meta = await sharp(file).metadata();
  const frameHeight = meta.height, frameCount = meta.width / meta.height, frameWidth = meta.height;
  const slot = `props/${id}/impact.png`;
  const runtime = { frameWidth, frameHeight, frameCount };
  const up = await uploadCandidateBytes({ client, payload: { slot, domain: "prop", role: "media",
    availabilityPolicy: "decorative", label: `${id} impact sheet`,
    metadata: { runtime },
    provenance: { tool: "pixellab", batch: "rock-impact", source: name },
    nativeEvidence: { native1x: true, spatialResampling: false, sourceWidth: meta.width, sourceHeight: meta.height,
      sourceSha256: createHash("sha256").update(bytes).digest("hex") } },
    bytes, mediaType: "image/png", idempotencyKey: `rock-impact-v1-${id}` });
  await json(`${apiBase}/api/admin/media-versions/${up.id}/review`, { method: "POST",
    headers: { "Content-Type": "application/json", "If-Match": `"${up.revision}"`, Origin: new URL(surfaceUrl).origin },
    body: JSON.stringify({ expectedRevision: up.revision, approved: true, notes: "Owner asked for the crack on landing.",
      surfaceUrl, evidence: { schema: "live-media-owner-proof-v1", versionId: up.id, contentSha256: up.media.sha256,
        slot, canonicalScale: 1, surfaceKind: "prop-candidate-board" } }) });
  await json(`${apiBase}/api/admin/media-versions/${up.id}/accept`, { method: "POST",
    headers: { "Content-Type": "application/json", "If-Match": `"${up.revision + 1}"` },
    body: JSON.stringify({ expectedRevision: up.revision + 1, expectedSlotRevision: 0, expectedActiveVersionId: null }) });
  const row = cat.assets.find(a => a.behavior?.value === id);
  await json(`${apiBase}/api/admin/drawable-assets`, { method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assets: [{ id: row.id, kind: "structure", label: row.label, sortOrder: row.sortOrder,
      lifecycleState: "active", expectedRevision: row.rowRevision, behavior: row.behavior,
      metadata: { ...row.metadata, impact: runtime },
      media: { back: row.media.back.slot, front: row.media.front.slot, impact: slot } }] }) });
  console.log(`impact installed ${id} ${frameCount}x${frameWidth}px`);
}
