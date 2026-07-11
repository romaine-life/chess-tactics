import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  extractActiveFenceCandidateProfiles,
  measureRailProjection,
  sha256File,
  validateBoardEdgeRailPair,
  validateFenceRealignmentLiveProof,
} from './fence-projection-guard.mjs';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(FRONTEND, '..');
const CANDIDATES = path.join(FRONTEND, 'public', 'assets', 'tiles', 'feature', 'candidates', '2026-07-10');
const REALIGNMENT = path.join(FRONTEND, 'public', 'assets', 'tiles', 'feature', 'candidates', '2026-07-10-realignment');
const REALIGNMENT_MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'art', 'fence-concepts', 'candidates', '2026-07-10-realignment', 'manifest.json'), 'utf8'));
const REALIGNMENT_RUN = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'art', 'fence-concepts', 'runs', 'fence-realignment-2026-07-10.json'), 'utf8'));
const REALIGNMENT_PROOF_EXPECTED = {
  candidateManifest: 'docs/art/fence-concepts/candidates/2026-07-10-realignment/manifest.json',
  route: '/editor/level?document=5d04d83f-474e-4d76-a49e-094bbe26ec0d&levelId=l6&from=studio&layer=fence&kind=fence&artReview=fence-native-candidates-2026-07-10&fenceArt=pixellab-stone-rail-r2',
  documentId: '5d04d83f-474e-4d76-a49e-094bbe26ec0d',
  levelId: 'l6',
  selectedCandidateId: 'pixellab-stone-rail-r2',
};
const proofScreenshotExists = (recordedPath) => fs.existsSync(path.resolve(ROOT, recordedPath));
const CONTRACT = {
  frame: [96, 180],
  expected_abs_midline_slope: 27 / 48,
  midline_slope_tolerance: 0.08,
  alpha_x_ranges: { E: [48, 96], S: [0, 48] },
};

const pair = (prefix) => ({
  railE: path.join(CANDIDATES, `${prefix}-rail-e.png`),
  railS: path.join(CANDIDATES, `${prefix}-rail-s.png`),
});

const realignedPair = (prefix) => ({
  railE: path.join(REALIGNMENT, `${prefix}-rail-e.png`),
  railS: path.join(REALIGNMENT, `${prefix}-rail-s.png`),
});

describe('fence projection acceptance guard', () => {
  it('accepts the native Blender pair against the canonical board edge', () => {
    expect(validateBoardEdgeRailPair({ id: 'blender-stone', ...pair('blender-stone'), contract: CONTRACT })).toEqual([]);
  });

  it('rejects the accepted PixelLab stone appearance as a standard edge-aligned pair', () => {
    const failures = validateBoardEdgeRailPair({ id: 'pixellab-stone', ...pair('pixellab-stone'), contract: CONTRACT });
    expect(failures.some((failure) => failure.includes('alpha span'))).toBe(true);
    expect(failures.some((failure) => failure.includes('pitch'))).toBe(true);
  });

  it('rejects the Codex pair whose shown E/S directions are reversed', () => {
    const failures = validateBoardEdgeRailPair({ id: 'codex-wood', ...pair('codex-wood'), contract: CONTRACT });
    expect(failures.filter((failure) => failure.includes('direction'))).toHaveLength(2);
  });

  it('measures the output pixels rather than trusting metadata', () => {
    const measurement = measureRailProjection(path.join(CANDIDATES, 'pixellab-stone-rail-e.png'));
    expect(measurement.bbox).toEqual([48, 70, 90, 96]);
    expect(measurement.midlineSlope).toBeCloseTo(-0.398, 3);
  });

  it('accepts all three active canonical realignment pairs', () => {
    for (const id of ['pixellab-wood-canonical-r2', 'codex-wood-canonical-r2', 'codex-stone-canonical-r2']) {
      expect(validateBoardEdgeRailPair({ id, ...realignedPair(id), contract: CONTRACT }), id).toEqual([]);
    }
  });

  it('keeps the manifest active ids identical to FENCE_CANDIDATE_PROFILES', () => {
    const source = fs.readFileSync(path.join(FRONTEND, 'src', 'ui', 'fenceCandidateProfiles.ts'), 'utf8');
    const profiles = extractActiveFenceCandidateProfiles(source);
    expect(profiles.map((profile) => profile.id)).toEqual(REALIGNMENT_MANIFEST.active_kits);
    expect(profiles).toHaveLength(4);
  });

  it('pins every retained post source/output and its y=68 frame anchor', () => {
    const postless = REALIGNMENT_MANIFEST.active_kit_assets.find((kit) => kit.id === 'pixellab-stone-rail-r2');
    expect(postless.post).toBeNull();
    expect(postless.post_policy).toBe('intentionally_none');
    for (const kit of REALIGNMENT_MANIFEST.active_kit_assets.filter((entry) => entry.post)) {
      const source = path.resolve(ROOT, kit.post.source.path);
      const output = path.resolve(ROOT, kit.post.selected_output.path);
      expect(sha256File(source), `${kit.id} post source`).toBe(kit.post.source.sha256);
      expect(sha256File(output), `${kit.id} post output`).toBe(kit.post.selected_output.sha256);
      const measurement = measureRailProjection(output);
      expect([measurement.width, measurement.height], `${kit.id} post frame`).toEqual([96, 180]);
      expect(measurement.bbox?.[3] - 1, `${kit.id} post anchor`).toBe(68);
    }
  });

  it('keeps the one accepted stone rail-only kit on the exact frozen old rail bytes', () => {
    const stoneKits = REALIGNMENT_MANIFEST.active_kit_assets.filter((kit) => kit.id.startsWith('pixellab-stone-'));
    expect(stoneKits).toHaveLength(1);
    for (const kit of stoneKits) {
      expect(kit.rails.E.sha256).toBe('b5895225c48b8e281a269dd3a0843b93ae1747f24f00f415a9219f6e5c456f6e');
      expect(kit.rails.S.sha256).toBe('fa56aa41713a16d16879ee143ef67464b5ebca3fec5bc1d9231e4c6b4ef84748');
      expect(sha256File(path.resolve(ROOT, kit.rails.E.path))).toBe(kit.rails.E.sha256);
      expect(sha256File(path.resolve(ROOT, kit.rails.S.path))).toBe(kit.rails.S.sha256);
    }
  });

  it('records PixelLab wood as native-pixel output and Codex previews as resampled non-production', () => {
    expect(REALIGNMENT_MANIFEST.pixellab.wood_canonical.spatial_resampling).toBe(false);
    for (const output of REALIGNMENT_MANIFEST.pixellab.wood_canonical.outputs) {
      expect(sha256File(path.resolve(ROOT, output.path)), output.role).toBe(output.sha256);
    }
    expect(REALIGNMENT_MANIFEST.codex.spatial_resampling).toBe(true);
    expect(REALIGNMENT_MANIFEST.codex.production_status).toBe('calibration_only');
    for (const kit of REALIGNMENT_MANIFEST.active_kit_assets.filter((entry) => entry.id.startsWith('codex-'))) {
      expect(kit.shown_preview_spatial_resampling).toBe(true);
      expect(kit.production_eligibility).toBe(false);
    }
  });

  it('pins a complete editable live proof for every active realignment candidate', () => {
    expect(validateFenceRealignmentLiveProof({
      run: REALIGNMENT_RUN,
      manifestActiveIds: REALIGNMENT_MANIFEST.active_kits,
      expected: REALIGNMENT_PROOF_EXPECTED,
      screenshotExists: proofScreenshotExists,
    })).toEqual([]);
  });

  it('rejects a stale route and incomplete or duplicated realignment captures', () => {
    const broken = structuredClone(REALIGNMENT_RUN);
    broken.active_candidate_ids = broken.active_candidate_ids.slice(0, 3);
    broken.game_surface_proof.route = broken.game_surface_proof.route.replace('pixellab-stone-rail-r2', 'codex-stone-canonical-r2');
    broken.game_surface_proof.private_account_document = false;
    broken.game_surface_proof.canonical_scale = 0.75;
    broken.game_surface_proof.draw_targets = ['rails_on_board_edges'];
    broken.game_surface_proof.rail_only_ids = [];
    broken.game_surface_proof.candidate_captures[3] = {
      id: broken.game_surface_proof.candidate_captures[0].id,
      screenshot: 'docs/art/fence-concepts/proofs/realignment-2026-07-10/missing.png',
    };

    const failures = validateFenceRealignmentLiveProof({
      run: broken,
      manifestActiveIds: REALIGNMENT_MANIFEST.active_kits,
      expected: REALIGNMENT_PROOF_EXPECTED,
      screenshotExists: proofScreenshotExists,
    });
    expect(failures).toEqual(expect.arrayContaining([
      expect.stringContaining('active candidate ids'),
      expect.stringContaining('exact durable document+level route'),
      expect.stringContaining('private durable document'),
      expect.stringContaining('canonical scale 1'),
      expect.stringContaining('both exact rail-edge and post-vertex'),
      expect.stringContaining('one intentional rail-only kit'),
      expect.stringContaining('all four active candidates exactly once'),
      expect.stringContaining('capture is missing'),
    ]));
  });
});
