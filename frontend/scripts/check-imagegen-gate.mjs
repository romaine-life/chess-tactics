// Durable CI guard — enforcement, not a buried memory.
//
// The codex image-gen METHOD must be verified against the ROLLOUT
// (`~/.codex/sessions/.../rollout-*-<thread_id>.jsonl`), never `codex exec --json`
// STDOUT — which is an abridged thread/turn/item stream that NEVER carries the
// `image_generation_call` event. The retired kit-forge gated on stdout, so it
// marked every real generation "code-drawn" and discarded it (the recurring
// time-sink every agent rediscovered — see docs/kit-forge.md).
//
// Rule enforced here: any forge script that checks `image_generation_call` MUST
// also read the rollout/sessions log. If it references the event but never the
// rollout, it's gating on stdout — the broken pattern — and this fails the build.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { rolloutImageGenEvidence } from './codex-imagegen.mjs';

const SCRIPTS = fileURLToPath(new URL('.', import.meta.url));
const FRONTEND = join(SCRIPTS, '..');
const ROOT = join(FRONTEND, '..');
const SELF = 'check-imagegen-gate.mjs';
const LIMITING_ROOK_NE = join(
  ROOT,
  'docs/art/wall-art-concepts/proof-inputs/accepted-rook-navy-north-east-c396999a.png',
);
const LIMITING_ROOK_NE_SHA256 = 'c396999a1cec31c94311548d47e662f61634132b82b8acb59e287cfc012e8356';
const LOS_KNIGHT_WEST = join(
  ROOT,
  'docs/art/wall-art-concepts/proof-inputs/accepted-knight-navy-west-f40b46bb.png',
);
const LOS_KNIGHT_WEST_SHA256 = 'f40b46bb3e70bf3378fc29a8a06f85371a4fd278b160e069a6fb494e71ee7343';

export function stdoutGateOffenders() {
  const offenders = [];
  for (const f of readdirSync(SCRIPTS)) {
    if (!f.endsWith('.mjs') || f === SELF) continue;
    const src = readFileSync(join(SCRIPTS, f), 'utf8');
    // Mentions the event but never the place it actually lives → stdout gate.
    if (src.includes('image_generation_call') && !/rollout|sessions/i.test(src)) offenders.push(f);
  }
  return offenders;
}

export function verifyRolloutShapes() {
  const legacy = JSON.stringify({ type: 'response_item', payload: { type: 'image_generation_call' } });
  const modern = [
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        name: 'exec',
        input: 'const result = await tools.image_gen__imagegen({ prompt: "sprite" });',
      },
    }),
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        output: [{ type: 'input_image', image_url: 'data:image/png;base64,AAAA' }],
      },
    }),
  ].join('\n');
  const unverified = [
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        name: 'exec',
        input: 'const result = await tools.image_gen__imagegen({ prompt: "sprite" });',
      },
    }),
    JSON.stringify({
      type: 'response_item',
      payload: { type: 'function_call_output', output: 'no image returned' },
    }),
  ].join('\n');

  assert.equal(rolloutImageGenEvidence(legacy).ok, true, 'legacy image_generation_call rollout must pass');
  assert.equal(rolloutImageGenEvidence(modern).ok, true, 'built-in image_gen + returned bitmap rollout must pass');
  assert.equal(rolloutImageGenEvidence(unverified).ok, false, 'tool source without a returned bitmap must fail');
}

export function verifyGrandGalleryFaceParity() {
  const assetDir = join(FRONTEND, 'public/assets/wall-decor');
  for (const layer of ['', '-glass']) {
    const west = PNG.sync.read(readFileSync(join(assetDir, `mirror-grand-gallery-west${layer}.png`)));
    const north = PNG.sync.read(readFileSync(join(assetDir, `mirror-grand-gallery-north${layer}.png`)));
    assert.equal(north.width, west.width, `Grand Gallery north${layer} width must match west`);
    assert.equal(north.height, west.height, `Grand Gallery north${layer} height must match west`);
    for (let y = 0; y < west.height; y += 1) {
      for (let x = 0; x < west.width; x += 1) {
        const westOffset = (y * west.width + (west.width - 1 - x)) * 4;
        const northOffset = (y * north.width + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          assert.equal(
            north.data[northOffset + channel],
            west.data[westOffset + channel],
            `Grand Gallery north${layer} must be the exact horizontal counterpart of west at ${x},${y}`,
          );
        }
      }
    }
  }

  const manifest = JSON.parse(readFileSync(join(assetDir, 'manifest.json'), 'utf8'));
  const gallery = manifest.assets.find((asset) => asset.id === 'mirror-grand-gallery');
  assert.ok(gallery, 'Grand Gallery must exist in the wall-decor manifest');
  assert.equal(gallery.faces.north.mountX, gallery.faces.west.width - gallery.faces.west.mountX);
  assert.equal(gallery.faces.north.mountY, gallery.faces.west.mountY);
  const points = (aperture) => Array.from({ length: aperture.length / 2 }, (_, index) =>
    `${aperture[index * 2].toFixed(6)},${aperture[index * 2 + 1].toFixed(6)}`,
  ).sort();
  const mirroredWest = gallery.faces.west.aperture.flatMap((coordinate, index) =>
    index % 2 === 0 ? [1 - coordinate] : [coordinate]);
  assert.deepEqual(points(gallery.faces.north.aperture), points(mirroredWest));
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const projectGridPoint = ({ x, y }) => ({ left: (x - y) * 48, top: (x + y) * 27 });
const WALL_FLOOR_SEAM_OFFSET_Y = -28;
const SUPPORT_VERTICAL_EXTENT = 512;

function pointInConvexPolygon(x, y, polygon) {
  let sign = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    const next = Math.sign(cross);
    if (!sign) sign = next;
    else if (sign !== next) return false;
  }
  return true;
}

/** Repeat the renderer's per-cell wall-face partition. The lower edge is the generated wall's
 * projected wall/floor seam; material below it belongs behind the terrain tile and is therefore
 * not supported wall-face content. First/last segments retain the same half-cell art overhang. */
function wallSupportSegments(faceId, targetGrid, span) {
  const tangent = faceId === 'west'
    ? { left: -48, top: 27 }
    : { left: 48, top: 27 };
  return Array.from({ length: span }, (_, index) => {
    const anchor = faceId === 'west'
      ? { x: targetGrid.x, y: targetGrid.y + index }
      : { x: targetGrid.x + index, y: targetGrid.y };
    const seat = projectGridPoint(anchor);
    let start = { left: seat.left, top: seat.top + WALL_FLOOR_SEAM_OFFSET_Y };
    let end = { left: start.left + tangent.left, top: start.top + tangent.top };
    if (index === 0) {
      start = { left: start.left - tangent.left / 2, top: start.top - tangent.top / 2 };
    }
    if (index === span - 1) {
      end = { left: end.left + tangent.left / 2, top: end.top + tangent.top / 2 };
    }
    return {
      start,
      end,
      polygon: [
        { x: start.left, y: start.top - SUPPORT_VERTICAL_EXTENT },
        { x: end.left, y: end.top - SUPPORT_VERTICAL_EXTENT },
        { x: end.left, y: end.top },
        { x: start.left, y: start.top },
      ],
    };
  });
}

function classifyWallHit(x, y, aperture, supportSegments) {
  const tangentSegment = supportSegments.find((segment) =>
    x >= Math.min(segment.start.left, segment.end.left) - 1e-9
    && x <= Math.max(segment.start.left, segment.end.left) + 1e-9);
  if (!tangentSegment) return 'unsupported';

  const seamDx = tangentSegment.end.left - tangentSegment.start.left;
  const seamDy = tangentSegment.end.top - tangentSegment.start.top;
  const seamT = (x - tangentSegment.start.left) / seamDx;
  const seamY = tangentSegment.start.top + seamT * seamDy;
  if (y > seamY + 1e-9) return 'floor-occluded';
  if (!pointInConvexPolygon(x, y, tangentSegment.polygon)) return 'unsupported';
  if (!pointInConvexPolygon(x, y, aperture)) return 'blocked';
  return 'supported-glass';
}

/** Durable acceptance guard for Grand Gallery's authored coverage. This intentionally repeats the
 * fixed runtime projection in arithmetic rather than importing a built package: npm check must fail
 * on a stale/shifted manifest, slot, limiting sprite, or canonical wall bake before optional proof scripts
 * are run. There is no aperture-centering or fit search here. */
export function verifyGrandGalleryExactSeat() {
  const bytes = readFileSync(LIMITING_ROOK_NE);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), LIMITING_ROOK_NE_SHA256, 'limiting accepted rook/NE proof input hash drifted');
  const unit = PNG.sync.read(bytes);
  assert.deepEqual([unit.width, unit.height], [57, 67], 'limiting accepted rook/NE delivery raster drifted');
  const knightBytes = readFileSync(LOS_KNIGHT_WEST);
  assert.equal(createHash('sha256').update(knightBytes).digest('hex'), LOS_KNIGHT_WEST_SHA256, 'semantic LOS knight/west proof input hash drifted');
  const knight = PNG.sync.read(knightBytes);
  assert.deepEqual([knight.width, knight.height], [512, 512], 'semantic LOS knight/west source raster drifted');

  const manifest = readJson(join(FRONTEND, 'public/assets/wall-decor/manifest.json'));
  const artMap = readJson(join(ROOT, 'packages/board-render/src/core/wallArt.json'));
  const gallery = manifest.assets.find((asset) => asset.id === 'mirror-grand-gallery');
  const galleryArt = artMap['mirror-grand-gallery-wall'];
  assert.ok(gallery, 'Grand Gallery is missing from the wall-decor manifest');
  assert.ok(galleryArt, 'Grand Gallery is missing from baseline wall art');
  for (const mirror of manifest.assets.filter((asset) => asset.kind === 'mirror')) {
    const expectedCoverage = mirror.id === 'mirror-grand-gallery' ? 'full-body' : 'authored-crop';
    assert.equal(
      mirror.mirrorCoverage,
      expectedCoverage,
      `${mirror.id} must declare its semantic mirror coverage role`,
    );
  }
  assert.equal(gallery.mirrorCoverage, 'full-body', 'Grand Gallery must retain full-body mirror coverage');
  assert.equal(galleryArt.span, 3, 'Grand Gallery exact-seat audit expects its authored three-wall span');

  const seatW = 72 * 0.73;
  const seatH = 86 * 0.73;
  const localLeft = -0.5 * seatW + (seatW - unit.width) / 2;
  const localTop = -0.80241 * seatH + (seatH - unit.height) / 2;
  const physicalGrid = { x: 1, y: 1 };
  const physicalSeat = projectGridPoint(physicalGrid);
  const knightSeatW = 72;
  const knightSeatH = 86;
  const knightOp = {
    left: physicalSeat.left - 0.5 * knightSeatW + (knightSeatW - 78) / 2,
    top: physicalSeat.top - 0.80241 * knightSeatH + (knightSeatH - 92) / 2,
    width: 78,
    height: 92,
  };
  const wallAnchor = { x: 64, y: 192 };
  const wallFrame = { width: 128, height: 336 };
  const reports = [];

  for (const faceId of ['west', 'north']) {
    const slot = galleryArt.slots.find((entry) => entry.face === faceId && entry.sourceId === gallery.id);
    const face = gallery.faces[faceId];
    assert.ok(slot && face, `Grand Gallery ${faceId} slot/face is missing`);
    assert.equal(slot.y, 72, `Grand Gallery ${faceId} lower rail must remain on grounded slot y=72`);
    assert.equal(face.previewY, slot.y, `Grand Gallery ${faceId} manifest preview must use runtime slot coordinates`);
    assert.equal(face.previewX, slot.x, `Grand Gallery ${faceId} manifest preview x drifted from baseline slot`);

    const wall = PNG.sync.read(readFileSync(join(
      FRONTEND,
      `public/assets/tiles/feature/wall-stone-${faceId === 'west' ? 8 : 1}.png`,
    )));
    assert.deepEqual([wall.width, wall.height], [wallFrame.width, wallFrame.height], `Grand Gallery ${faceId} canonical wall bake drifted`);

    const targetGrid = faceId === 'west' ? { x: 0, y: 1 } : { x: 1, y: 0 };
    const targetSeat = projectGridPoint(targetGrid);
    const faceOrigin = {
      left: targetSeat.left - 64 + slot.x - face.mountX,
      top: targetSeat.top - 96 + slot.y - face.mountY,
    };
    const firstWallOrigin = {
      left: targetSeat.left - wallAnchor.x,
      top: targetSeat.top - wallAnchor.y,
    };
    const reflectedGrid = faceId === 'west'
      ? { x: -1 - physicalGrid.x, y: physicalGrid.y }
      : { x: physicalGrid.x, y: -1 - physicalGrid.y };
    const reflectedSeat = projectGridPoint(reflectedGrid);
    const reflectedOrigin = {
      left: reflectedSeat.left - localLeft - unit.width,
      top: reflectedSeat.top + localTop,
    };
    const faceLocalOrigin = {
      left: reflectedOrigin.left - faceOrigin.left,
      top: reflectedOrigin.top - faceOrigin.top,
    };
    const aperture = [];
    for (let index = 0; index < face.aperture.length; index += 2) {
      aperture.push({ x: face.aperture[index] * face.width, y: face.aperture[index + 1] * face.height });
    }

    const globalAperture = aperture.map((point) => ({
      x: faceOrigin.left + point.x,
      y: faceOrigin.top + point.y,
    }));
    const supportSegments = wallSupportSegments(faceId, targetGrid, galleryArt.span);
    const wallSeat = projectGridPoint(faceId === 'west'
      ? { x: -0.5, y: physicalGrid.y }
      : { x: physicalGrid.x, y: -0.5 });
    const hitShift = {
      x: wallSeat.left - physicalSeat.left,
      y: wallSeat.top - physicalSeat.top,
    };
    const fit = Math.min(knightOp.width / knight.width, knightOp.height / knight.height);
    const innerLeft = (knightOp.width - knight.width * fit) / 2;
    const innerTop = (knightOp.height - knight.height * fit) / 2;
    let visibleKnightPixels = 0;
    let supportedGlassPixels = 0;
    let floorOccludedPixels = 0;
    let blockedKnightPixels = 0;
    let unsupportedKnightPixels = 0;
    for (let drawY = Math.floor(knightOp.top); drawY < Math.ceil(knightOp.top + knightOp.height); drawY += 1) {
      for (let drawX = Math.floor(knightOp.left); drawX < Math.ceil(knightOp.left + knightOp.width); drawX += 1) {
        const physicalX = drawX + 0.5;
        const physicalY = drawY + 0.5;
        const sourceX = Math.floor((physicalX - knightOp.left - innerLeft) / fit);
        const sourceY = Math.floor((physicalY - knightOp.top - innerTop) / fit);
        if (sourceX < 0 || sourceY < 0 || sourceX >= knight.width || sourceY >= knight.height) continue;
        if (knight.data[(sourceY * knight.width + sourceX) * 4 + 3] === 0) continue;
        visibleKnightPixels += 1;
        const classification = classifyWallHit(
          physicalX + hitShift.x,
          physicalY + hitShift.y,
          globalAperture,
          supportSegments,
        );
        if (classification === 'supported-glass') supportedGlassPixels += 1;
        else if (classification === 'floor-occluded') floorOccludedPixels += 1;
        else if (classification === 'blocked') blockedKnightPixels += 1;
        else unsupportedKnightPixels += 1;
      }
    }
    assert.ok(visibleKnightPixels > 0, `Grand Gallery ${faceId} semantic LOS proof sampled no knight pixels`);
    assert.equal(blockedKnightPixels, 0, `Grand Gallery ${faceId} has above-floor physical-knight crossings blocked by authored glass`);
    assert.equal(unsupportedKnightPixels, 0, `Grand Gallery ${faceId} has physical-knight crossings outside its supporting wall segments`);
    assert.equal(
      supportedGlassPixels + floorOccludedPixels,
      visibleKnightPixels,
      `Grand Gallery ${faceId} must classify every physical-knight crossing as supported glass or floor-occluded`,
    );
    const expectedLos = faceId === 'west'
      ? { supportedGlassPixels: 1007, floorOccludedPixels: 114 }
      : { supportedGlassPixels: 1004, floorOccludedPixels: 117 };
    assert.deepEqual(
      { supportedGlassPixels, floorOccludedPixels },
      expectedLos,
      `Grand Gallery ${faceId} bounded wall/floor-seam audit drifted`,
    );

    let clippedVisiblePixels = 0;
    for (let sourceY = 0; sourceY < unit.height; sourceY += 1) {
      for (let sourceX = 0; sourceX < unit.width; sourceX += 1) {
        if (unit.data[(sourceY * unit.width + sourceX) * 4 + 3] === 0) continue;
        const finalX = faceLocalOrigin.left + (unit.width - 1 - sourceX) + 0.5;
        const finalY = faceLocalOrigin.top + sourceY + 0.5;
        const globalFinalX = faceOrigin.left + finalX;
        const globalFinalY = faceOrigin.top + finalY;
        if (
          !pointInConvexPolygon(finalX, finalY, aperture)
          || !supportSegments.some((segment) => pointInConvexPolygon(globalFinalX, globalFinalY, segment.polygon))
        ) clippedVisiblePixels += 1;
      }
    }
    assert.equal(clippedVisiblePixels, 0, `Grand Gallery ${faceId} clips the limiting accepted rook/NE at its exact reflected floor anchor or wall support`);

    const wallOrigins = Array.from({ length: galleryArt.span }, (_, index) => {
      const grid = faceId === 'west'
        ? { x: targetGrid.x, y: targetGrid.y + index }
        : { x: targetGrid.x + index, y: targetGrid.y };
      const seat = projectGridPoint(grid);
      return { left: seat.left - wallAnchor.x - firstWallOrigin.left, top: seat.top - wallAnchor.y - firstWallOrigin.top };
    });
    const wallBounds = {
      left: Math.min(...wallOrigins.map((origin) => origin.left)),
      top: Math.min(...wallOrigins.map((origin) => origin.top)),
      right: Math.max(...wallOrigins.map((origin) => origin.left + wallFrame.width)),
      bottom: Math.max(...wallOrigins.map((origin) => origin.top + wallFrame.height)),
    };
    const faceInWall = {
      left: faceOrigin.left - firstWallOrigin.left,
      top: faceOrigin.top - firstWallOrigin.top,
      right: faceOrigin.left - firstWallOrigin.left + face.width,
      bottom: faceOrigin.top - firstWallOrigin.top + face.height,
    };
    assert.ok(
      wallBounds.left <= faceInWall.left && wallBounds.top <= faceInWall.top &&
        faceInWall.right <= wallBounds.right && faceInWall.bottom <= wallBounds.bottom,
      `Grand Gallery ${faceId} frame canvas escapes its generated canonical wall assembly`,
    );
    reports.push(`${faceId} face-local=${faceLocalOrigin.left.toFixed(3)},${faceLocalOrigin.top.toFixed(3)} frame-top=${faceInWall.top}px LOS=${supportedGlassPixels} glass + ${floorOccludedPixels} floor = ${visibleKnightPixels}/${visibleKnightPixels}`);
  }
  return reports;
}

// CLI mode (npm run check / direct node). Skipped when imported (e.g. by the test).
const invokedDirectly = !!process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith(`/${SELF}`);
if (invokedDirectly) {
  verifyRolloutShapes();
  verifyGrandGalleryFaceParity();
  const galleryReports = verifyGrandGalleryExactSeat();
  const bad = stdoutGateOffenders();
  if (bad.length) {
    console.error(`\n✗ codex image-gen method gate must read the ROLLOUT, not \`codex exec --json\` stdout.\n  These scripts check image_generation_call but never read the rollout/sessions log:\n${bad.map((b) => `    - frontend/scripts/${b}`).join('\n')}\n  stdout is abridged and NEVER carries image_generation_call — see docs/kit-forge.md.\n`);
    process.exit(1);
  }
  console.log(`✓ image-gen rollout shapes and Grand Gallery exact-seat coverage verified (${galleryReports.join('; ')}); no stdout-based gate found`);
}
