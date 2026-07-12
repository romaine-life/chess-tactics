import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  FROZEN_LEGACY_CUTOVER,
  SYNTHETIC_TEST_MEDIA_MAX_BYTES,
  chromeInstalledSourceAuthorityReason,
  collectNoCommittedMediaViolations,
  committedMediaFilesystemAssumptionReason,
  committedMediaWriterReason,
  createCanonicalGitByteReader,
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
      count: 3984,
      bytes: 428728479,
      sha256: 'c4ed900d39d9be8721ff2ea1fae6ff1f70bb89c7ca2ce8555d5e63b78c263106',
    });
  });

  it('freezes canonical Git blobs across CRLF checkouts and uses working bytes for modifications', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-git-bytes-test-'));
    const relativePath = 'frontend/public/assets/crlf-catalog.json';
    const absolutePath = path.join(repoRoot, relativePath);
    const canonicalLf = Buffer.from('{"row":1}\n{"row":2}\n', 'utf8');
    const checkoutCrlf = Buffer.from('{"row":1}\r\n{"row":2}\r\n', 'utf8');
    const git = (args) => execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const cutoverRun = () => {
      const violations = collectNoCommittedMediaViolations({
        repoRoot,
        trackedFiles: [relativePath],
        allowFrozenCutover: FROZEN_LEGACY_CUTOVER.sha256,
      });
      const mismatch = violations.find((violation) => violation.kind === 'frozen-cutover-mismatch');
      expect(mismatch).toBeDefined();
      return {
        actual: JSON.parse(mismatch.detail.slice(mismatch.detail.indexOf('{'))).actual,
        violations,
      };
    };
    try {
      git(['init', '--quiet']);
      git(['config', 'user.email', 'guard@example.test']);
      git(['config', 'user.name', 'Media guard test']);
      git(['config', 'core.autocrlf', 'false']);
      git(['config', 'core.safecrlf', 'false']);
      git(['config', 'commit.gpgSign', 'false']);
      fs.writeFileSync(
        path.join(repoRoot, '.gitattributes'),
        `${relativePath} text eol=crlf\n`,
      );
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, canonicalLf);
      git(['add', '.gitattributes', relativePath]);
      git(['commit', '--quiet', '-m', 'fixture']);
      fs.rmSync(absolutePath);
      git(['checkout', '--quiet', '--', relativePath]);

      const workingBytes = fs.readFileSync(absolutePath);
      expect(workingBytes.equals(checkoutCrlf)).toBe(true);
      expect(git(['status', '--porcelain'])).toBe('');

      const reader = createCanonicalGitByteReader(repoRoot);
      expect(reader.head).toMatch(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
      expect(reader.changedPaths.has(relativePath)).toBe(false);
      expect(reader.canonicalBlobSizes.get(relativePath)).toBe(canonicalLf.length);
      const canonicalBytes = reader.read(relativePath, workingBytes);
      expect(canonicalBytes.equals(canonicalLf)).toBe(true);
      expect(reader.read(relativePath, workingBytes)).toBe(canonicalBytes);
      const attributesWorkingBytes = fs.readFileSync(path.join(repoRoot, '.gitattributes'));
      expect(reader.read('.gitattributes', attributesWorkingBytes)).toBe(attributesWorkingBytes);

      const expectedCanonicalSnapshot = frozenCutoverSnapshot([{
        path: relativePath,
        byteLength: canonicalLf.length,
        sha256: crypto.createHash('sha256').update(canonicalLf).digest('hex'),
      }]);
      const cleanRun = cutoverRun();
      expect(cleanRun.actual).toEqual(expectedCanonicalSnapshot);
      expect(cleanRun.violations).toContainEqual(expect.objectContaining({
        kind: 'tracked-public-asset-file',
        path: relativePath,
        byteLength: workingBytes.length,
      }));

      const modifiedWorkingBytes = Buffer.from('{"row":1}\r\n{"row":2}\r\n{"row":3}\r\n', 'utf8');
      fs.writeFileSync(absolutePath, modifiedWorkingBytes);
      const modifiedReader = createCanonicalGitByteReader(repoRoot);
      expect(modifiedReader.changedPaths.has(relativePath)).toBe(true);
      expect(modifiedReader.read(relativePath, modifiedWorkingBytes)).toBe(modifiedWorkingBytes);
      const expectedModifiedSnapshot = frozenCutoverSnapshot([{
        path: relativePath,
        byteLength: modifiedWorkingBytes.length,
        sha256: crypto.createHash('sha256').update(modifiedWorkingBytes).digest('hex'),
      }]);
      const modifiedRun = cutoverRun();
      expect(modifiedRun.actual).toEqual(expectedModifiedSnapshot);
      expect(modifiedRun.violations).toContainEqual(expect.objectContaining({
        kind: 'tracked-public-asset-file',
        path: relativePath,
        byteLength: modifiedWorkingBytes.length,
      }));
      expect(expectedModifiedSnapshot.sha256).not.toBe(expectedCanonicalSnapshot.sha256);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
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

  it('rejects committed Chrome candidate databases, including renamed generated catalogs', () => {
    for (const relativePath of [
      'frontend/src/ui/chromeCandidateManifest.json',
      'frontend/src/ui/nativeRailCandidateManifest.json',
      'frontend/config/native-rail-families.json',
      'frontend/src/ui/generatedChromeCandidateCatalog.json',
      'frontend/config/chrome-candidate-database.ts',
    ]) {
      expect(isStaticPromotionAuthority(relativePath, '{}'), relativePath).toBe(true);
    }
    expect(isStaticPromotionAuthority(
      'frontend/src/ui/generatedChromeSources.json',
      JSON.stringify({
        generatedBy: 'scripts/rebuild-chrome-sources.mjs',
        sources: [{ id: 'outer-candidate-01', src: '/assets/ui/chrome-candidates/outer/candidate-01.png' }],
      }),
    )).toBe(true);
    expect(isStaticPromotionAuthority(
      'frontend/src/ui/liveChromeCatalog.test.ts',
      "const candidateCatalog = { generatedBy: 'test', sources: ['/assets/ui/chrome-candidates/test.png'] };",
    )).toBe(false);
  });

  it('rejects #478-style installed Chrome candidate selection but permits only canonical backend slots', () => {
    const generatedCandidateDefaults = JSON.stringify({
      outer: {
        atomSourceId: 'outer-atoms-img2img-32-v1-08',
        railSourceId: 'outer-rails-v3-01',
        railThickness: 24,
      },
      inner: {
        atomSourceId: 'inner-atoms-img2img-micro-v2-10',
        railSourceId: 'inner-rails-repeat-v4-02',
        railThickness: 7,
      },
      divider: { atomSourceId: 'divider-atoms-pixellab-cover-v1-21', atomSize: 32 },
    });
    expect(chromeInstalledSourceAuthorityReason(
      'frontend/config/chrome-lab-defaults.json',
      generatedCandidateDefaults,
    )).toMatch(/canonical .*backend slot|generated candidate/i);
    expect(isStaticPromotionAuthority(
      'frontend/config/chrome-lab-defaults.json',
      generatedCandidateDefaults,
    )).toBe(true);
    expect(isStaticPromotionAuthority(
      'frontend/src/ui/chromeFamilyRuntime.ts',
      "import committedChromeDefaults from '../../config/chrome-lab-defaults.json';\n"
        + "const src = `/assets/ui/chrome-candidates/exploded/${setId}/candidate-01.png`;",
    )).toBe(true);

    const canonicalBackendDefaults = JSON.stringify({
      outer: {
        atomSourceId: '/assets/ui/chrome/outer/atom.png',
        railSourceId: 'ui/chrome/outer/rail.png',
        railThickness: 24,
      },
      inner: {
        atomSourceId: 'ui/chrome/inner/atom.png',
        railSourceId: '/assets/ui/chrome/inner/rail.png',
        railThickness: 7,
      },
      divider: { atomSourceId: 'ui/chrome/divider/joint.png', atomSize: 32 },
    });
    expect(chromeInstalledSourceAuthorityReason(
      'frontend/config/chrome-lab-defaults.json',
      canonicalBackendDefaults,
    )).toBeNull();
    expect(isStaticPromotionAuthority(
      'frontend/config/chrome-lab-defaults.json',
      canonicalBackendDefaults,
    )).toBe(false);
    expect(isStaticPromotionAuthority(
      'frontend/config/chrome-lab-defaults.json',
      canonicalBackendDefaults.replace('ui/chrome/divider/joint.png', 'ui/chrome/divider/atom.png'),
    )).toBe(true);
    expect(isStaticPromotionAuthority(
      'frontend/src/ui/installedChromeSources.ts',
      [
        'export const installedChromeSources = {',
        "  outerAtomSourceId: '/assets/ui/chrome/outer/atom.png',",
        "  outerRailSourceId: 'ui/chrome/outer/rail.png',",
        "  innerAtomSourceId: 'ui/chrome/inner/atom.png',",
        "  innerRailSourceId: '/assets/ui/chrome/inner/rail.png',",
        "  dividerAtomSourceId: 'ui/chrome/divider/joint.png',",
        '};',
      ].join('\n'),
    )).toBe(false);
    expect(isStaticPromotionAuthority(
      'frontend/config/chrome-lab-defaults.json',
      JSON.stringify({ outer: { railThickness: 24, atomSize: 41 }, inner: { railThickness: 7 } }),
    )).toBe(false);
  });

  it('keeps the geometry-only empty-panel guard exempt from media-authority rules', () => {
    const inspectorSource = [
      "const defaults = JSON.parse(readFileSync('frontend/config/chrome-lab-defaults.json', 'utf8'));",
      "const candidate = '/assets/ui/chrome-candidates/exploded/outer/candidate-01.png';",
      "if (defaults.outer.railSourceId !== 'outer-rails-v3-01') failures.push('wrong geometry');",
    ].join('\n');
    const relativePath = 'frontend/scripts/check-empty-panel-frame-overlay.mjs';
    expect(isStaticPromotionAuthority(relativePath, inspectorSource)).toBe(false);
    expect(chromeInstalledSourceAuthorityReason(relativePath, inspectorSource)).toBeNull();
    expect(committedMediaWriterReason(relativePath, inspectorSource)).toBeNull();
    expect(committedMediaFilesystemAssumptionReason(relativePath, inspectorSource)).toBeNull();
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
