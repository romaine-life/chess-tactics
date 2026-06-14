#!/usr/bin/env node
// BGM asset slugger + index generator.
//
// Single source of truth that keeps three things in lockstep:
//   - the blob names uploaded to Azure Storage,
//   - the `file` entries in the container's index.json (read by GET /api/bgm),
//   - the display titles shown in the player.
//
// The blob container is the source of truth: this writes both the slugged track
// copies AND the index.json that is uploaded *into* the container next to them.
// The backend reads that index and prepends BGM_BASE_URL, so the index stores
// only {title, file} — never a base URL or absolute path. Deterministic: the
// same input directory yields identical slugs, ordering, and index.
//
// Usage:
//   node tools/bgm/generate.mjs --src <dir> [--out <dir>] [--check <index.json>]
//     --src    directory of raw .mp3 files (required)
//     --out    write slugged track copies + index.json here (ready to upload)
//     --check  compare generated track files against an existing index.json and
//              exit non-zero on any mismatch
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = argv[i + 1];
  }
  return args;
}

const titleCase = (s) => s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));

function buildTracks(srcDir) {
  const files = fs
    .readdirSync(srcDir)
    .filter((f) => f.toLowerCase().endsWith('.mp3'))
    .sort();
  const seen = new Set();
  return files.map((f) => {
    const base = f.replace(/\.mp3$/i, '');
    let slug = `${base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}.mp3`;
    while (seen.has(slug)) slug = slug.replace(/\.mp3$/, '-x.mp3');
    seen.add(slug);
    const title = titleCase(base.replace(/^\d+\s*[-.\s]\s*/, '').replace(/\s+/g, ' ').trim());
    return { src: f, title, file: slug };
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.src) {
    console.error('error: --src <dir> is required');
    process.exit(2);
  }
  const entries = buildTracks(args.src);
  const index = { schemaVersion: 1, tracks: entries.map(({ title, file }) => ({ title, file })) };
  const json = `${JSON.stringify(index, null, 2)}\n`;

  if (args.out) {
    fs.rmSync(args.out, { recursive: true, force: true });
    fs.mkdirSync(args.out, { recursive: true });
    for (const e of entries) fs.copyFileSync(path.join(args.src, e.src), path.join(args.out, e.file));
    fs.writeFileSync(path.join(args.out, 'index.json'), json);
    console.log(`wrote ${entries.length} tracks + index.json -> ${args.out}`);
  }

  if (args.check) {
    const existing = JSON.parse(fs.readFileSync(args.check, 'utf8'));
    const got = entries.map((e) => e.file).sort();
    const want = (existing.tracks || []).map((t) => t.file).sort();
    const missing = want.filter((f) => !got.includes(f));
    const extra = got.filter((f) => !want.includes(f));
    if (missing.length || extra.length) {
      console.error('index mismatch vs', args.check);
      if (missing.length) console.error('  in index but not generated:', missing);
      if (extra.length) console.error('  generated but not in index:', extra);
      process.exit(1);
    }
    console.log(`index check OK: ${got.length} tracks match ${args.check}`);
  }

  if (!args.out && !args.check) process.stdout.write(json);
}

main();
