import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SYNTHETIC_TEST_MEDIA_MAX_BYTES,
  chromeInstalledSourceAuthorityReason,
  collectNoCommittedMediaViolations,
  committedMediaFilesystemAssumptionReason,
  committedMediaWriterReason,
  embeddedMediaLiteralReason,
  isAllowedSyntheticTestMedia,
  isMediaPath,
  isStaticPromotionAuthority,
  scrollbarStaticAuthorityReason,
} from './check-no-committed-media.mjs';

describe('no-committed-media guard', () => {
  it('rejects scrollbar preferred state and committed browse rosters but permits stable preview geometry', () => {
    const oldRoster = [
      'export const SCROLLBAR_ASSETS = [',
      "  { name: 'oak-pixellab', file: '/assets/ui/scrollbars/oak-pixellab.png', kind: 'sprite', preferred: true },",
      "  { name: 'oak-forge', file: '/assets/ui/scrollbars/oak-forge.png', kind: 'sprite' },",
      '];',
    ].join('\n');
    expect(scrollbarStaticAuthorityReason('frontend/src/ui/scrollbarCatalog.ts', oldRoster)).toMatch(/preferred\/default/);
    expect(isStaticPromotionAuthority('frontend/src/ui/scrollbarCatalog.ts', oldRoster)).toBe(true);

    const renamedRoster = [
      'const grips = [',
      "  { name: 'oak-pixellab', label: 'Oak PixelLab', kind: 'sprite' },",
      "  { name: 'oak-forge', label: 'Oak Forge', kind: 'sprite' },",
      '];',
    ].join('\n');
    expect(scrollbarStaticAuthorityReason('frontend/src/ui/scrollbarBrowser.ts', renamedRoster)).toMatch(/browse roster/);
    expect(isStaticPromotionAuthority('frontend/src/ui/scrollbarBrowser.ts', renamedRoster)).toBe(true);

    const geometryOnly = [
      'const PREVIEW_KIND_BY_STABLE_SLOT = {',
      "  'ui/scrollbars/oak-pixellab.png': 'sprite',",
      "  'ui/scrollbars/oak-forge.png': 'sprite',",
      '} as const;',
    ].join('\n');
    expect(scrollbarStaticAuthorityReason('frontend/src/ui/scrollbarCatalog.ts', geometryOnly)).toBeNull();
    expect(isStaticPromotionAuthority('frontend/src/ui/scrollbarCatalog.ts', geometryOnly)).toBe(false);
  });

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
    expect(isStaticPromotionAuthority(
      'frontend/config/asset-catalog.yaml',
      'registeredForProduction: true\nacceptedAssetId: frozen-pointer',
    )).toBe(true);
    expect(isStaticPromotionAuthority(
      'frontend/config/asset-catalog.toml',
      'productionAccepted = true',
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
      dividers: {
        outer: { atomSourceId: 'divider-atoms-pixellab-cover-v1-21', atomSize: 32 },
        inner: { atomSourceId: 'none', atomSize: 11 },
      },
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
      dividers: {
        outer: { atomSourceId: 'ui/chrome/divider/joint.png', atomSize: 32 },
        inner: { atomSourceId: 'none', atomSize: 11 },
      },
    });
    expect(chromeInstalledSourceAuthorityReason(
      'frontend/config/chrome-lab-defaults.json',
      canonicalBackendDefaults,
    )).toBeNull();
    expect(isStaticPromotionAuthority(
      'frontend/config/chrome-lab-defaults.json',
      canonicalBackendDefaults,
    )).toBe(false);
    const hiddenCandidateDefaults = JSON.stringify({
      ...JSON.parse(canonicalBackendDefaults),
      candidate: { atomSourceId: 'private-candidate-version' },
    });
    expect(chromeInstalledSourceAuthorityReason(
      'frontend/config/chrome-lab-defaults.json',
      hiddenCandidateDefaults,
    )).toMatch(/candidate\.atomSourceId.*generated candidate/i);
    expect(isStaticPromotionAuthority(
      'frontend/config/chrome-lab-defaults.json',
      hiddenCandidateDefaults,
    )).toBe(true);
    expect(isStaticPromotionAuthority(
      'frontend/config/chrome-lab-defaults.json',
      canonicalBackendDefaults.replace('"none"', '"none?candidate-version"'),
    )).toBe(true);
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

  it('rejects the retired cutover release ceremony under renamed live paths', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-cutover-release-test-'));
    const write = (relativePath, value) => {
      const target = path.join(repoRoot, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, value, 'utf8');
    };
    try {
      write('.github/workflows/release.yml', 'run: gh pr comment 42 --body exact-image-approval');
      write('backend/package.json', '{"scripts":{"release":"node scripts/verify-live-media-cutover.mjs"}}');
      const trackedFiles = ['.github/workflows/release.yml', 'backend/package.json'];
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles })).toEqual([
        expect.objectContaining({ kind: 'temporary-cutover-scaffold', path: '.github/workflows/release.yml' }),
        expect.objectContaining({ kind: 'temporary-cutover-scaffold', path: 'backend/package.json' }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('does not ban unrelated pull-request comments', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ordinary-pr-comment-test-'));
    const relativePath = '.github/workflows/notify.yml';
    const target = path.join(repoRoot, relativePath);
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, 'run: gh pr comment 42 --body "preview is ready"', 'utf8');
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual([]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects cutover switches and packaged readers moved out of server.js', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'moved-cutover-scaffold-test-'));
    const write = (relativePath, value) => {
      const target = path.join(repoRoot, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, value, 'utf8');
    };
    try {
      write('backend/liveMediaToggle.js', "export const enabled = process.env.LIVE_MEDIA_IMPORT_ENABLED;");
      write('backend/liveMediaFallback.js', "export const root = path.join(frontendDir, 'assets');");
      const trackedFiles = ['backend/liveMediaToggle.js', 'backend/liveMediaFallback.js'];
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles })).toEqual([
        expect.objectContaining({ kind: 'temporary-cutover-scaffold', path: 'backend/liveMediaFallback.js' }),
        expect.objectContaining({ kind: 'temporary-cutover-scaffold', path: 'backend/liveMediaToggle.js' }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects a renamed backend mutation that can create another legacy bridge', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'renamed-bridge-mutation-test-'));
    const target = path.join(repoRoot, 'backend', 'mediaImportAdmin.js');
    const toolTarget = path.join(repoRoot, 'scripts', 'reactivate-media.mjs');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.mkdirSync(path.dirname(toolTarget), { recursive: true });
    fs.writeFileSync(target, [
      "app.post('/api/admin/media-versions/:id/imported', async (req, res) => {",
      "  await pool.query(`UPDATE media_versions SET status = 'legacy-bridge' WHERE id = $1`, [req.params.id]);",
      '  res.sendStatus(204);',
      '});',
    ].join('\n'), 'utf8');
    fs.writeFileSync(
      toolTarget,
      "await sql(`UPDATE media_versions SET status = 'legacy-bridge' WHERE id = $1`, [id]);\n",
      'utf8',
    );
    try {
      expect(collectNoCommittedMediaViolations({
        repoRoot,
        trackedFiles: ['backend/mediaImportAdmin.js', 'scripts/reactivate-media.mjs'],
      })).toEqual([
        expect.objectContaining({
          kind: 'temporary-cutover-scaffold',
          path: 'backend/mediaImportAdmin.js',
          detail: 'retired legacy-bridge creation capability remains after final cutover',
        }),
        expect.objectContaining({
          kind: 'temporary-cutover-scaffold',
          path: 'scripts/reactivate-media.mjs',
          detail: 'retired legacy-bridge creation capability remains after final cutover',
        }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects public-root catalogs, immutable hash pins, and bridge methods in the canonical client', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'renamed-live-authority-test-'));
    const write = (relativePath, value) => {
      const target = path.join(repoRoot, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, value, 'utf8');
    };
    const sha = 'a'.repeat(64);
    const trackedFiles = [
      'frontend/public/media/catalog.json',
      'frontend/public/ambience/client.js',
      'frontend/public/legal/fonts/test/OFL.txt',
      'frontend/src/pinnedMedia.ts',
      'frontend/scripts/live-media-admin-client.mjs',
    ];
    write(trackedFiles[0], JSON.stringify({ slot: 'ui/panel.png', hash: sha }));
    write(trackedFiles[1], 'export const executable = true;');
    write(trackedFiles[2], 'Synthetic license text');
    write(trackedFiles[3], `export const media = '/api/media/${sha}';`);
    write(trackedFiles[4], "export const bridge = (id) => fetch(`/api/admin/media-versions/${id}/bridge`, { method: 'POST' });");
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles })).toEqual([
        expect.objectContaining({
          kind: 'hardcoded-immutable-media-pointer',
          path: 'frontend/src/pinnedMedia.ts',
        }),
        expect.objectContaining({
          kind: 'temporary-cutover-scaffold',
          path: 'frontend/scripts/live-media-admin-client.mjs',
        }),
        expect.objectContaining({
          kind: 'tracked-public-file',
          path: 'frontend/public/media/catalog.json',
        }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('checks Docker build output explicitly without requiring Git metadata', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'built-output-only-media-test-'));
    const cleanChunk = path.join(repoRoot, 'frontend', 'dist', 'app-code', 'index.js');
    const disguisedMedia = path.join(repoRoot, 'frontend', 'dist', 'app-code', 'payload.dat');
    fs.mkdirSync(path.dirname(cleanChunk), { recursive: true });
    fs.writeFileSync(cleanChunk, 'export const ready = true;\n', 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, builtOutputOnly: true })).toEqual([]);
      fs.writeFileSync(disguisedMedia, Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(16, 0),
      ]));
      expect(collectNoCommittedMediaViolations({ repoRoot, builtOutputOnly: true })).toEqual([
        expect.objectContaining({ kind: 'built-media', path: 'frontend/dist/app-code/payload.dat' }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('permanently rejects recreation of the retired Git-media importer', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-git-media-path-test-'));
    const relativePath = 'frontend/scripts/migrate-live-assets.mjs';
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '// one-time importer must stay deleted\n', 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual([
        expect.objectContaining({ kind: 'retired-git-media-path', path: relativePath }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it.each([
    'frontend/src/core/propSeats.json',
    'packages/board-render/src/core/propSeats.json',
  ])('permanently rejects recreation of the retired prop-seat baseline %s', (relativePath) => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-prop-seat-path-test-'));
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '{}\n', 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual([
        expect.objectContaining({ kind: 'retired-git-media-path', path: relativePath }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it.each([
    'frontend/src/ui/design/wallDecorManifest.json',
    'packages/board-render/src/ui/design/wallDecorManifest.json',
  ])('permanently rejects recreation of the retired wall-decoration manifest %s', (relativePath) => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-wall-decor-path-test-'));
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '{}\n', 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual([
        expect.objectContaining({ kind: 'retired-git-media-path', path: relativePath }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects a renamed runtime import of the retired wall-decoration manifest', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-wall-decor-import-test-'));
    const relativePath = 'packages/board-render/src/core/legacyWallDecor.ts';
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "import manifest from '../design/wallDecorManifest.json';\n", 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual([
        expect.objectContaining({
          kind: 'temporary-cutover-scaffold',
          path: relativePath,
          detail: 'committed wall-decoration media manifest remains after live-catalog cutover',
        }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects a moved prop-seat overlay or last-good fallback implementation', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-prop-seat-fallback-test-'));
    const relativePath = 'packages/board-render/src/core/legacySeats.ts';
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'export function applyPropSeatOverrides(value) { return value; }\n', 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual([
        expect.objectContaining({
          kind: 'temporary-cutover-scaffold',
          path: relativePath,
          detail: 'committed or last-good prop-seat fallback remains after DB-only cutover',
        }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('permanently rejects recreation or renamed imports of the retired portrait crop table', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-portrait-crops-test-'));
    const tablePath = 'frontend/src/art/portraitCrops.json';
    const importPath = 'frontend/src/ui/LegacyPortraits.ts';
    for (const relativePath of [tablePath, importPath]) {
      const target = path.join(repoRoot, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, relativePath === tablePath ? '{}\n' : 'const COMMITTED_CROPS = {};\n', 'utf8');
    }
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [tablePath, importPath] })).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'retired-git-media-path', path: tablePath }),
        expect.objectContaining({ kind: 'retired-portrait-crop-authority', path: importPath }),
      ]));
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects recreation of a compiled terrain-family gameplay map', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-terrain-map-test-'));
    const relativePath = 'frontend/src/core/legacyTerrainMap.ts';
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "const FAMILY_TO_TERRAIN = { grass: 'grass' };\n", 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual([
        expect.objectContaining({ kind: 'retired-terrain-gameplay-map', path: relativePath }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it.each([
    'frontend/config/chrome-lab-defaults.json',
    'frontend/config/nine-slice-registry.json',
    'frontend/config/nine-slice/panel.json',
    'frontend/src/generated/nine-slice.css',
    'frontend/scripts/nine-slice-kit.mjs',
    'frontend/scripts/vite-chrome-lab-defaults-plugin.mjs',
    'frontend/scripts/vite-nine-slice-geometry-plugin.mjs',
  ])('permanently rejects recreation of retired presentation authority %s', (relativePath) => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-presentation-path-test-'));
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '{}\n', 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'retired-git-media-path' }),
      ]));
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it.each([
    "const DEFAULT_OG_IMAGE = '/assets/og/default.png';",
    "const PREVIEW_KIND_BY_STABLE_SLOT = { 'ui/scrollbars/oak.png': 'sprite' };",
    "import registry from '../../config/nine-slice-registry.json';",
  ])('rejects renamed compiled presentation authority: %s', (source) => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-presentation-source-test-'));
    const relativePath = 'frontend/src/ui/renamedPresentationAuthority.ts';
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${source}\n`, 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual(expect.arrayContaining([
        expect.objectContaining({ detail: 'compiled installed presentation identity/default/configuration remains after drawable-catalog cutover' }),
      ]));
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects recreation of a compiled Subterrain inventory', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-subterrain-catalog-test-'));
    const relativePath = 'packages/board-render/src/core/subterrainLegacy.ts';
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "export const SUBTERRAIN_MATERIALS = ['earth', 'roots'];\n", 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual([
        expect.objectContaining({
          kind: 'temporary-cutover-scaffold',
          path: relativePath,
          detail: 'compiled Subterrain inventory remains after drawable-catalog cutover',
        }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it.each([
    'export function waterSideCanonicalProofBoard() {}',
    "const groupId = 'terrain/water/side-v1';",
    "const TEMPORARY_PREDRAWN_REVIEW_SLOT = 'boards/review/uncommitted/plate.png';",
    'const abruptExposedEdge = true;',
    "const exposedFaces = ['south', 'east'];",
    "const top = frameSrc.replace(/\\.png$/, '-top.png');",
  ])('rejects retired tile-side and filename-derived media paths: %s', (source) => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-tile-side-test-'));
    const relativePath = 'frontend/src/render/renamedTerrainPath.ts';
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${source}\n`, 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'temporary-cutover-scaffold',
          detail: 'retired tile-coupled side proof, fabricated review slot, or filename-derived terrain media remains',
        }),
      ]));
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects filename-derived review membership', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'filename-review-membership-test-'));
    const relativePath = 'frontend/src/ui/renamedReviewCatalog.ts';
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'const inferredKitId = slotLeaf.match(/rail-e/);\n', 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual([
        expect.objectContaining({
          kind: 'temporary-cutover-scaffold',
          detail: 'review membership must come from explicit backend metadata, not semantic-slot filenames',
        }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects filename-derived Studio catalog taxonomy', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'filename-studio-taxonomy-test-'));
    const relativePath = 'frontend/src/ui/renamedStudioCatalog.ts';
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'const ARTWORK_TAXONOMY = [{ classify: (slot) => slot.match(/backgrounds/) }];\n', 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual([
        expect.objectContaining({
          kind: 'temporary-cutover-scaffold',
          detail: 'Studio catalog membership and grouping must come from drawable records, not semantic-slot filename taxonomy',
        }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects compiled installed Chrome tint configuration', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'compiled-chrome-tint-test-'));
    const relativePath = 'frontend/src/ui/renamedChrome.ts';
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "const CHROME_FILL_TINTS = [{ id: 'night', rgb: [4, 13, 20] }];\n", 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual([
        expect.objectContaining({
          kind: 'temporary-cutover-scaffold',
          detail: 'installed Chrome tint identities and RGB configuration must come from drawable records',
        }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects restoration of the obsolete installed design-catalog tree', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'compiled-design-tree-test-'));
    const relativePath = 'frontend/src/ui/design/renamedCatalog.ts';
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "export const ASSET_TREE_PROTOTYPE = [{ label: 'Main Menu' }];\n", 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual([
        expect.objectContaining({
          kind: 'temporary-cutover-scaffold',
          detail: 'obsolete Git-owned installed design-catalog taxonomy must not be restored',
        }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects board media identities constructed from level ids', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'constructed-board-media-test-'));
    const relativePath = 'frontend/src/ui/renamedOnboarding.ts';
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'const predrawnBoardSlotForLevel = (id) => `/assets/level-list-thumb/${id}`;\n', 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual([
        expect.objectContaining({
          kind: 'temporary-cutover-scaffold',
          detail: 'board media and thumbnail identities must be assigned or projected by the backend, not constructed from level ids',
        }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it.each([
    'const SAMPLE_GAINS = { grass: 0.5 };',
    "const TERRAIN_SAMPLE = { grass: 'grass' };",
    "export const ARRIVAL_BAKED = { sample: 'arrival' };",
    'export const SFX_ASSETS = [];',
    "button.textContent = 'Copy for Claude'; // bake SFX into source",
  ])('rejects retired hardcoded/copy-to-source SFX authority: %s', (source) => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-sfx-profile-test-'));
    const relativePath = 'frontend/src/sfxLegacy.ts';
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${source}\n`, 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual([
        expect.objectContaining({
          kind: 'temporary-cutover-scaffold',
          path: relativePath,
          detail: 'hardcoded or copy-to-source SFX profile authority remains after DB profile cutover',
        }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects a compiled wall material inventory after the drawable cutover', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-wall-inventory-test-'));
    const relativePath = 'packages/board-render/src/core/walls.ts';
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "export const WALL_MATERIALS = ['stone', 'brick'];\n", 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual([
        expect.objectContaining({ detail: 'compiled feature/barrier material inventory remains after drawable-catalog cutover' }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects compiled ground-cover and wall-decoration inventories after the drawable cutover', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-drawable-inventory-test-'));
    const relativePath = 'packages/board-render/src/core/decorLegacy.ts';
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "const GROUND_COVER_IDS = ['grass']; const WALL_DECOR_DEFINITIONS = []; const REQUIRED_PROP_SEAT_IDS = ['oak'];\n", 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual([
        expect.objectContaining({ detail: 'compiled ground-cover/wall-decoration/prop inventory remains after drawable-catalog cutover' }),
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects compiled editor terrain and animated-scene inventories after the drawable cutover', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-editor-scene-inventory-test-'));
    const relativePath = 'frontend/src/ui/legacyScene.ts';
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "const LE_SCATTER_FAMILIES = ['grass']; const SCENE_SLOT = 'ui/main.png';\n", 'utf8');
    try {
      expect(collectNoCommittedMediaViolations({ repoRoot, trackedFiles: [relativePath] })).toEqual([
        expect.objectContaining({ detail: 'compiled terrain/editor/scene presentation inventory remains after drawable-catalog cutover' }),
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
      const violations = collectNoCommittedMediaViolations({ repoRoot, trackedFiles });
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
