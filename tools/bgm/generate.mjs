#!/usr/bin/env node
// BGM asset slugger + manifest generator.
//
// Single source of truth that keeps three things in lockstep:
//   - the blob names uploaded to Azure Storage,
//   - the `file` entries in frontend/public/assets/audio/bgm-manifest.json,
//   - the display titles shown in the player.
//
// Deterministic: same input directory -> identical slugs, ordering, and
// manifest. That lets the upload workflow regenerate slugged copies of the raw
// tracks and `--check` them against the committed manifest before uploading, so
// a track can never be live under a name the player doesn't request.
//
// Usage:
//   node tools/bgm/generate.mjs --src <dir> [--out <dir>] [--base <url>]
//        [--write-manifest <path>] [--check <manifest.json>]
//
//   --src             directory of raw .mp3 files (required)
//   --out             copy slugged files here (for upload); optional
//   --base            manifest baseUrl (default: the prod blob container URL)
//   --write-manifest  write the generated manifest JSON to this path
//   --check           compare generated manifest tracks against an existing
//                     manifest file; exit non-zero on any mismatch
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_BASE = 'https://chesstacticsmedia.blob.core.windows.net/bgm/';

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
  const base = args.base || DEFAULT_BASE;
  const entries = buildTracks(args.src);
  const manifest = {
    schemaVersion: 1,
    baseUrl: base,
    tracks: entries.map(({ title, file }) => ({ title, file })),
  };
  const json = `${JSON.stringify(manifest, null, 2)}\n`;

  if (args.out) {
    fs.rmSync(args.out, { recursive: true, force: true });
    fs.mkdirSync(args.out, { recursive: true });
    for (const e of entries) fs.copyFileSync(path.join(args.src, e.src), path.join(args.out, e.file));
  }

  if (args['write-manifest']) {
    fs.mkdirSync(path.dirname(args['write-manifest']), { recursive: true });
    fs.writeFileSync(args['write-manifest'], json);
    console.log(`wrote manifest -> ${args['write-manifest']}`);
  }

  if (args.check) {
    const existing = JSON.parse(fs.readFileSync(args.check, 'utf8'));
    const got = manifest.tracks.map((t) => t.file).sort();
    const want = (existing.tracks || []).map((t) => t.file).sort();
    const missing = want.filter((f) => !got.includes(f));
    const extra = got.filter((f) => !want.includes(f));
    if (missing.length || extra.length) {
      console.error('manifest mismatch vs', args.check);
      if (missing.length) console.error('  in manifest but not generated:', missing);
      if (extra.length) console.error('  generated but not in manifest:', extra);
      process.exit(1);
    }
    console.log(`manifest check OK: ${got.length} tracks match ${args.check}`);
  }

  if (!args['write-manifest'] && !args.check) process.stdout.write(json);
}

main();
