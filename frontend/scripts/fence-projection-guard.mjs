import fs from 'node:fs';
import crypto from 'node:crypto';
import { PNG } from 'pngjs';

export function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function extractActiveFenceCandidateProfiles(source) {
  const roots = new Map(
    [...source.matchAll(/const\s+([A-Z_]+)\s*=\s*'([^']+)'/g)].map((match) => [match[1], match[2]]),
  );
  const activeBlock = source.match(/export const FENCE_CANDIDATE_PROFILES:[\s\S]*?=\s*\[([\s\S]*?)\]\s*as const;/)?.[1];
  if (!activeBlock) return [];
  const idMatches = [...activeBlock.matchAll(/\bid:\s*'([^']+)'/g)];
  return idMatches.map((match, index) => {
    const end = idMatches[index + 1]?.index ?? activeBlock.length;
    const entry = activeBlock.slice(match.index, end);
    const asset = (field) => {
      const fieldMatch = entry.match(new RegExp(`${field}:\\s*\`\\$\\{([A-Z_]+)\\}/([^\`]+)\``));
      if (!fieldMatch) return null;
      const root = roots.get(fieldMatch[1]);
      return root ? `${root}/${fieldMatch[2]}` : null;
    };
    return { id: match[1], railE: asset('railE'), railS: asset('railS'), post: asset('post') };
  });
}

export function measureRailProjection(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const topByX = Array(png.width).fill(Number.POSITIVE_INFINITY);
  const bottomByX = Array(png.width).fill(Number.NEGATIVE_INFINITY);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const alpha = png.data[(y * png.width + x) * 4 + 3];
      if (alpha === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      topByX[x] = Math.min(topByX[x], y);
      bottomByX[x] = Math.max(bottomByX[x], y);
    }
  }

  if (!Number.isFinite(minX)) {
    return { width: png.width, height: png.height, bbox: null, midlineSlope: null };
  }

  const points = [];
  for (let x = minX; x <= maxX; x += 1) {
    if (!Number.isFinite(topByX[x])) continue;
    points.push({ x, y: (topByX[x] + bottomByX[x]) / 2 });
  }
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const numerator = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0);
  const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);

  return {
    width: png.width,
    height: png.height,
    bbox: [minX, minY, maxX + 1, maxY + 1],
    midlineSlope: denominator === 0 ? null : numerator / denominator,
  };
}

export function validateBoardEdgeRailPair({ id, railE, railS, contract }) {
  const failures = [];
  const expectedFrame = contract.frame;
  const expectedSlope = contract.expected_abs_midline_slope;
  const slopeTolerance = contract.midline_slope_tolerance;
  const expectedRanges = contract.alpha_x_ranges;

  for (const [direction, file] of [['E', railE], ['S', railS]]) {
    const measurement = measureRailProjection(file);
    const label = `${id} ${direction} rail`;
    if (measurement.width !== expectedFrame[0] || measurement.height !== expectedFrame[1]) {
      failures.push(`${label} frame is ${measurement.width}x${measurement.height}, expected ${expectedFrame.join('x')}`);
    }
    if (!measurement.bbox) {
      failures.push(`${label} has no visible alpha`);
      continue;
    }
    const [expectedMinX, expectedMaxX] = expectedRanges[direction];
    if (measurement.bbox[0] !== expectedMinX || measurement.bbox[2] !== expectedMaxX) {
      failures.push(`${label} alpha span is x=${measurement.bbox[0]}..${measurement.bbox[2]}, expected ${expectedMinX}..${expectedMaxX}`);
    }
    const expectedSign = direction === 'E' ? -1 : 1;
    const slope = measurement.midlineSlope;
    if (slope == null || Math.sign(slope) !== expectedSign) {
      failures.push(`${label} direction is ${slope == null ? 'unmeasurable' : slope.toFixed(3)}, expected ${direction === 'E' ? 'negative' : 'positive'} screen-y slope`);
      continue;
    }
    if (Math.abs(Math.abs(slope) - expectedSlope) > slopeTolerance) {
      failures.push(`${label} pitch is ${Math.abs(slope).toFixed(3)}, expected ${expectedSlope.toFixed(3)} ± ${slopeTolerance.toFixed(3)}`);
    }
  }

  return failures;
}

export function validateFenceRealignmentLiveProof({
  run,
  manifestActiveIds,
  expected,
  screenshotExists,
}) {
  const failures = [];
  const activeIds = Array.isArray(manifestActiveIds) ? manifestActiveIds : [];
  const runActiveIds = Array.isArray(run?.active_candidate_ids) ? run.active_candidate_ids : [];

  if (activeIds.length !== 4 || new Set(activeIds).size !== activeIds.length) {
    failures.push('realignment manifest must expose exactly four unique active candidates for live proof');
  }
  if (JSON.stringify(runActiveIds) !== JSON.stringify(activeIds)) {
    failures.push('realignment live-proof active candidate ids must match the candidate manifest exactly and in cycle order');
  }
  if (run?.candidate_manifest !== expected.candidateManifest) {
    failures.push('realignment run must point at the active candidate manifest');
  }
  if (run?.review_status !== 'ready_for_owner_verification') {
    failures.push('realignment live proof must remain ready for owner verification');
  }

  const proof = run?.game_surface_proof;
  if (proof?.status !== 'ready' || proof?.kind !== 'level_editor_document') {
    failures.push('realignment live proof must be a ready durable Level Editor document');
  }
  if (proof?.route !== expected.route) {
    failures.push(`realignment live proof route must remain the exact durable document+level route with ${expected.selectedCandidateId} selected`);
  }
  if (proof?.document_id !== expected.documentId || proof?.level_id !== expected.levelId) {
    failures.push('realignment live proof document and level identities must match the pinned route');
  }
  if (proof?.selector !== '[data-testid=level-editor]') {
    failures.push('realignment live proof must focus the Level Editor drawing surface');
  }
  if (proof?.private_account_document !== true || proof?.editable_in_handoff_browser !== true) {
    failures.push('realignment live proof must be a private durable document editable in the handoff browser');
  }
  if (proof?.canonical_scale !== 1) {
    failures.push('realignment live proof must remain at canonical scale 1');
  }
  if (proof?.mounting !== 'isolated_review_assets_not_runtime_promotion') {
    failures.push('realignment live proof must keep candidate mounting isolated from runtime promotion');
  }
  if (JSON.stringify(proof?.draw_targets) !== JSON.stringify(['rails_on_board_edges', 'posts_on_board_vertices'])) {
    failures.push('realignment live proof must expose both exact rail-edge and post-vertex drawing targets');
  }
  if (JSON.stringify(proof?.rail_only_ids) !== JSON.stringify(['pixellab-stone-rail-r2'])) {
    failures.push('realignment live proof must disclose PixelLab stone as the one intentional rail-only kit');
  }

  const primaryScreenshot = proof?.primary_screenshot;
  if (typeof primaryScreenshot !== 'string' || !screenshotExists(primaryScreenshot)) {
    failures.push('realignment live proof primary screenshot is missing');
  }

  const captures = Array.isArray(proof?.candidate_captures) ? proof.candidate_captures : [];
  const captureIds = captures.map((capture) => capture?.id);
  const capturePaths = captures.map((capture) => capture?.screenshot);
  const coversActiveExactlyOnce = captures.length === 4
    && captures.length === activeIds.length
    && new Set(captureIds).size === captures.length
    && JSON.stringify([...captureIds].sort()) === JSON.stringify([...activeIds].sort());
  if (!coversActiveExactlyOnce) {
    failures.push('realignment live proof must capture all four active candidates exactly once');
  }
  if (new Set(capturePaths).size !== captures.length) {
    failures.push('realignment live proof must use four distinct candidate capture screenshots');
  }
  for (const capture of captures) {
    if (typeof capture?.screenshot !== 'string' || !screenshotExists(capture.screenshot)) {
      failures.push(`realignment live proof capture is missing for ${String(capture?.id ?? 'unknown candidate')}`);
    }
  }

  const selectedCapture = captures.find((capture) => capture?.id === expected.selectedCandidateId);
  if (!selectedCapture || selectedCapture.screenshot !== primaryScreenshot) {
    failures.push(`realignment primary screenshot must be the selected ${expected.selectedCandidateId} candidate capture`);
  }

  return failures;
}
