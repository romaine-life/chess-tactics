import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FROZEN_LEGACY_CUTOVER,
  SYNTHETIC_TEST_MEDIA_MAX_BYTES,
  collectNoCommittedMediaViolations,
  committedMediaFilesystemAssumptionReason,
  committedMediaWriterReason,
  embeddedMediaLiteralReason,
  frozenCutoverSnapshot,
  isAllowedSyntheticTestMedia,
  isMediaPath,
  isStaticPromotionAuthority,
} from './check-no-committed-media.mjs';

describe('no-committed-media guard', () => {
  it('covers runtime formats and editable source-art formats', () => {
    expect(isMediaPath('frontend/public/assets/tiles/water.png')).toBe(true);
    expect(isMediaPath('docs/art/source/terrain.blend')).toBe(true);
    expect(isMediaPath('docs/art/source/ui.psd')).toBe(true);
    expect(isMediaPath('frontend/public/assets/fonts/game.woff2')).toBe(true);
    expect(isMediaPath('docs/art/prompts/water.txt')).toBe(false);
    expect(isMediaPath('frontend/src/net/assets.ts')).toBe(false);
    for (const extension of [
      'opus', 'aif', 'aifc', 'aiff', 'mpeg', 'mpg', 'cur', 'pcx', 'sketch', 'fig',
      'raw', 'dng', 'cr2', 'cr3', 'nef', 'arw', 'orf', 'rw2', 'raf', 'pef', 'x3f',
      'tar', 'tgz', 'gz', 'bz2', 'xz', 'zst',
    ]) {
      expect(isMediaPath(`docs/art/source/asset.${extension}`), extension).toBe(true);
    }
  });

  it('rejects embedded media data URIs and serialized SVG/XML material', () => {
    for (const mediaType of ['image/png', 'audio/ogg', 'font/woff2']) {
      const dataUri = ['data', ':', mediaType, ';base64,', 'AAAA'].join('');
      expect(embeddedMediaLiteralReason(
        'frontend/src/runtime.ts',
        `export const payload = ${JSON.stringify(dataUri)};`,
      )).toMatch(/data URI/);
    }
    const svg = ['<', 'svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h8v8z"/></svg>'].join('');
    expect(embeddedMediaLiteralReason(
      'packages/board-render/src/runtime.ts',
      `export const art = ${JSON.stringify(svg)};`,
    )).toMatch(/SVG\/XML/);
    const splitUriSource = `const art = ${JSON.stringify('data:')} + ${JSON.stringify('image/png;base64,')} + ${JSON.stringify('AAAA')};`;
    expect(embeddedMediaLiteralReason('frontend/src/runtime.ts', splitUriSource)).toMatch(/split/);
  });

  it('rejects media-signature and large opaque encoded literals without rejecting short application data', () => {
    const pngBytes = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32, 0),
    ]);
    const encodedPng = pngBytes.toString('base64');
    expect(embeddedMediaLiteralReason(
      'frontend/src/runtime.ts',
      `const payload = ${JSON.stringify(encodedPng)};`,
    )).toMatch(/base64 literal decodes to media/);

    const opaque = Buffer.alloc(3_200, 0x5a).toString('base64');
    expect(embeddedMediaLiteralReason(
      'frontend/src/runtime.ts',
      `const payload = ${JSON.stringify(opaque)};`,
    )).toMatch(/large opaque base64/);

    const boardCode = Buffer.from(JSON.stringify({ columns: 3, rows: 8, terrain: ['grass', 'stone'] })).toString('base64');
    expect(embeddedMediaLiteralReason(
      'frontend/src/game/fixture.ts',
      `const boardCode = ${JSON.stringify(boardCode)};`,
    )).toBeNull();

    const percentPng = [...pngBytes.subarray(0, 8)].map((value) => `%${value.toString(16).padStart(2, '0')}`).join('');
    expect(embeddedMediaLiteralReason(
      'frontend/src/runtime.ts',
      `const payload = ${JSON.stringify(percentPng)};`,
    )).toMatch(/percent-encoded literal decodes to media/);
  });

  it('rejects large byte arrays but permits them only inside tiny named synthetic fixture files', () => {
    const values = Array.from({ length: 300 }, (_, index) => index % 251).join(',');
    const byteArraySource = `const payload = new Uint8Array([${values}]);`;
    expect(embeddedMediaLiteralReason('frontend/src/runtime.ts', byteArraySource)).toMatch(/byte-array/);

    const dataUri = ['data', ':image/png;base64,AAAA'].join('');
    const syntheticSource = `export const pixel = ${JSON.stringify(dataUri)};`;
    expect(embeddedMediaLiteralReason(
      'frontend/src/test/fixtures/synthetic-media/synthetic-data-uri.ts',
      syntheticSource,
    )).toBeNull();
    expect(embeddedMediaLiteralReason(
      'frontend/src/test/fixtures/synthetic-media/production-data-uri.ts',
      syntheticSource,
    )).toMatch(/data URI/);
    expect(embeddedMediaLiteralReason(
      'frontend/src/test/fixtures/synthetic-media/synthetic-data-uri.ts',
      syntheticSource,
      SYNTHETIC_TEST_MEDIA_MAX_BYTES + 1,
    )).toMatch(/data URI/);
  });

  it('allows only tiny explicitly named synthetic fixtures in exact test roots', () => {
    expect(isAllowedSyntheticTestMedia(
      'frontend/src/test/fixtures/synthetic-media/synthetic-one-pixel.png',
      72,
    )).toBe(true);
    expect(isAllowedSyntheticTestMedia(
      'frontend/src/test/fixtures/synthetic-media/production-water.png',
      72,
    )).toBe(false);
    expect(isAllowedSyntheticTestMedia('frontend/src/test/fixtures/synthetic-one-pixel.png', 72)).toBe(false);
    expect(isAllowedSyntheticTestMedia(
      'frontend/src/test/fixtures/synthetic-media/synthetic-large.png',
      SYNTHETIC_TEST_MEDIA_MAX_BYTES + 1,
    )).toBe(false);
  });

  it('rejects producers targeting committed media but not read-only audits', () => {
    expect(committedMediaWriterReason(
      'frontend/scripts/build-water.mjs',
      "writeFileSync('frontend/public/assets/tiles/water.png', bytes);",
    )).toMatch(/producer/);
    expect(committedMediaWriterReason(
      'docs/art/render_water.py',
      "image.save('docs/art/water-review.png')",
    )).toMatch(/producer/);
    expect(committedMediaWriterReason(
      'frontend/scripts/audit-assets.mjs',
      "readFileSync('frontend/public/assets/tiles/water.png');",
    )).toBeNull();
    expect(committedMediaFilesystemAssumptionReason(
      'frontend/scripts/audit-assets.mjs',
      "readFileSync('frontend/public/assets/tiles/water.png');",
    )).toMatch(/assumes committed/);
    expect(committedMediaWriterReason(
      'docs/art/write_prompt.py',
      "Path('docs/art/prompts/water.txt').write_text('prompt')",
    )).toBeNull();
    expect(committedMediaFilesystemAssumptionReason(
      'docs/art/write_prompt.py',
      "Path('docs/art/prompts/water.txt').read_text()",
    )).toBeNull();
    expect(committedMediaWriterReason(
      'docs/art/write_run.py',
      "Path('docs/art/runs/water.json').write_text('{}')",
    )).toBeNull();
    expect(committedMediaWriterReason(
      'docs/art/write_review.py',
      "image.save('docs/art/reviews/water.png')",
    )).toMatch(/producer/);
    expect(committedMediaFilesystemAssumptionReason(
      'frontend/scripts/build-review.py',
      "Image.open('docs/art/reviews/water.png')",
    )).toMatch(/committed/);
    expect(committedMediaFilesystemAssumptionReason(
      'scripts/generate-unit-art.py',
      '{"sourcePath": "docs/art/unit-concepts/source-assets/pawn/Pawn.stl"}',
    )).toBeNull();
    expect(committedMediaFilesystemAssumptionReason(
      'scripts/generate-unit-art.py',
      "Path('docs/art/unit-concepts/source-assets/pawn/Pawn.stl').read_bytes()",
    )).toMatch(/committed/);
    expect(committedMediaWriterReason(
      'docs/art/write_source.py',
      "writeFileSync('docs/art/sources/water.blend', bytes)",
    )).toMatch(/producer/);
    expect(committedMediaWriterReason(
      'frontend/src/net/media.ts',
      "writeFileSync('frontend/public/assets/tiles/water.png', bytes);",
    )).toBeNull();
  });

  it('fingerprints the exact frozen cutover set by canonical path, size, and content hash', () => {
    expect(frozenCutoverSnapshot([
      { path: 'b.png', byteLength: 2, sha256: 'b'.repeat(64) },
      { path: 'a.png', byteLength: 1, sha256: 'a'.repeat(64) },
    ])).toEqual({
      count: 2,
      bytes: 3,
      sha256: 'fa965ad94a918980402d90489c5423d380aa486d237f9c306666bd9102443868',
    });
    expect(FROZEN_LEGACY_CUTOVER).toEqual({
      count: 2217,
      bytes: 358412274,
      sha256: '11a6290a9aed299d8124581b4d566a716f53f4578c03bb6685bcdcfcf180fda9',
    });
  });

  it('rejects committed promotion authority without rejecting live-catalog code or tests', () => {
    expect(isStaticPromotionAuthority('frontend/src/asset-catalog.json', '{}')).toBe(true);
    expect(isStaticPromotionAuthority(
      'docs/art/run.json',
      '{"registeredForProduction": true}',
    )).toBe(true);
    expect(isStaticPromotionAuthority(
      'frontend/src/ui/surfaces.ts',
      "import accepted from '../../public/assets/ui/surfaces/accepted-surfaces.json';",
    )).toBe(true);
    expect(isStaticPromotionAuthority(
      'frontend/src/net/liveMedia.ts',
      "fetch('/api/asset-catalog')",
    )).toBe(false);
    expect(isStaticPromotionAuthority(
      'frontend/src/net/liveMedia.test.ts',
      'const row = { status: "promoted" };',
    )).toBe(false);
    expect(isStaticPromotionAuthority(
      'frontend/src/ui/portraitCandidates.ts',
      "export const PRODUCTION_PORTRAIT_METHOD: Method = 'codex-stone';\n"
        + "export const PORTRAIT_METHODS = [{ key: 'codex-stone', production: true }];\n"
        + "const src = '/assets/portrait-candidates/codex-stone/pawn/navy-blue.png';",
    )).toBe(true);
    expect(isStaticPromotionAuthority(
      'frontend/src/ui/fenceCandidateProfiles.ts',
      "export const FENCE_CANDIDATE_PROFILES = [{ status: 'native-pass', statusLabel: 'Accepted · rail only', railE: '/assets/fence.png' }];",
    )).toBe(true);
    expect(isStaticPromotionAuthority(
      'frontend/src/core/matchmaking.ts',
      "const PRODUCTION_RETRY_METHOD = 'jitter'; const state = { production: true };",
    )).toBe(false);
    expect(isStaticPromotionAuthority(
      'packages/board-render/src/ui/unitCatalog.ts',
      "export const productionUnitAssets = rows.filter((row) => row.status === 'accepted');",
    )).toBe(false);
    expect(isStaticPromotionAuthority(
      'docs/art/run.json',
      '{"authority":"historical-provenance-only","production_status":"accepted_and_frozen"}',
    )).toBe(false);
    expect(isStaticPromotionAuthority(
      'frontend/src/ui/SceneAnimLab.tsx',
      "const RIGHT_CANDIDATES = { water: [{ category: 'candidate', sheet: '/assets/candidate.png' }] };",
    )).toBe(true);
  });

  it('strict mode rejects cutover switches and media copied into the production build', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'no-committed-media-final-test-'));
    const write = (relativePath, value) => {
      const target = path.join(repoRoot, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, value);
    };
    try {
      write('backend/server.js', "const flag = process.env.LIVE_MEDIA_SERVING_ENABLED; app.post('/bridge', handler);");
      write('frontend/package.json', '{"scripts":{"check":"node guard --allow-frozen-cutover hash"}}');
      write('frontend/dist/assets/disguised.dat', Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(16, 0),
      ]));
      const violations = collectNoCommittedMediaViolations({
        repoRoot,
        trackedFiles: ['backend/server.js', 'frontend/package.json'],
      });
      expect(violations.map(({ kind, path: violationPath }) => `${kind}:${violationPath}`)).toEqual([
        'built-media:frontend/dist/assets/disguised.dat',
        'temporary-cutover-scaffold:backend/server.js',
        'temporary-cutover-scaffold:frontend/package.json',
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects external source fetchers that bypass backend archival', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'no-committed-source-fetch-test-'));
    const relativePath = 'frontend/scripts/fetch-art-source.mjs';
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "const bytes = await (await fetch(url)).arrayBuffer(); await writeFile(out, bytes);", 'utf8');
    try {
      const violations = collectNoCommittedMediaViolations({
        repoRoot,
        trackedFiles: [relativePath],
        allowCutoverImporter: true,
      });
      expect(violations).toEqual([expect.objectContaining({ kind: 'external-source-fetcher-bypass', path: relativePath })]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('integrates tracked-media, public-root, writer, and synthetic-fixture rules', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'no-committed-media-test-'));
    const write = (relativePath, value) => {
      const target = path.join(repoRoot, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, value);
    };
    try {
      const trackedFiles = [
        'docs/art/review.png',
        'frontend/public/assets/manifest.json',
        'frontend/scripts/build-review.mjs',
        'frontend/src/test/fixtures/synthetic-media/synthetic-pixel.png',
        'frontend/src/runtime-embedded.ts',
        'frontend/src/test/fixtures/synthetic-media/synthetic-embedded.ts',
        'frontend/src/runtime-payload.dat',
        'frontend/src/runtime-vector',
        'frontend/src/non-media.dat',
        'frontend/src/runtime-compressed.dat',
        'frontend/src/runtime-tar',
      ];
      write(trackedFiles[0], Buffer.from([1]));
      write(trackedFiles[1], '{}');
      write(trackedFiles[2], "writeFileSync('frontend/public/assets/review.png', bytes);");
      write(trackedFiles[3], Buffer.from([1]));
      const embeddedUri = ['data', ':image/png;base64,AAAA'].join('');
      write(trackedFiles[4], `export const art = ${JSON.stringify(embeddedUri)};`);
      write(trackedFiles[5], `export const pixel = ${JSON.stringify(embeddedUri)};`);
      write(trackedFiles[6], Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(32, 0),
      ]));
      write(trackedFiles[7], '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h8v8z"/></svg>');
      write(trackedFiles[8], Buffer.from([0x00, 0x02, 0x04, 0x08, 0x10, 0x20]));
      write(trackedFiles[9], Buffer.concat([Buffer.from([0x1f, 0x8b]), Buffer.alloc(16, 0)]));
      const tarBytes = Buffer.alloc(512, 0);
      tarBytes.write('ustar', 257, 'ascii');
      write(trackedFiles[10], tarBytes);
      const violations = collectNoCommittedMediaViolations({ repoRoot, trackedFiles, allowCutoverImporter: true });
      expect(violations.map(({ kind, path: violationPath }) => `${kind}:${violationPath}`)).toEqual([
        'committed-media-filesystem-assumption:frontend/scripts/build-review.mjs',
        'committed-media-writer:frontend/scripts/build-review.mjs',
        'embedded-media:frontend/src/runtime-embedded.ts',
        'tracked-media:docs/art/review.png',
        'tracked-media:frontend/src/runtime-compressed.dat',
        'tracked-media:frontend/src/runtime-payload.dat',
        'tracked-media:frontend/src/runtime-tar',
        'tracked-media:frontend/src/runtime-vector',
        'tracked-public-asset-file:frontend/public/assets/manifest.json',
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
