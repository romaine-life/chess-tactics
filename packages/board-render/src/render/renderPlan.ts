import { boardLabCellPosition } from './boardProjection';
import {
  TILE_FRAME_EQUATOR_Y,
  TILE_FRAME_HEIGHT,
  TILE_STEP_X,
  TILE_STEP_Y,
} from '../art/projectionContract';
import { studioFamilies, assetFrameSrc, type StudioAsset } from '../ui/studioBoard';
import { featureFrameSrc, fenceFrameSrc, fencePostSrc, wallFrameSrc, WALL_FRAME_GEOMETRY } from '../art/tileset';
import {
  unitArtForId,
  unitAnchorFraction,
  hasDirectionSprite,
  type UnitAsset,
  type Direction,
  type Faction,
} from '../ui/unitCatalog';
import { doodadAsset, type DoodadAsset } from '../ui/doodadCatalog';
import {
  resolveFeatureOverlays,
  resolveFenceOverlays,
  resolveFencePosts,
  resolveWallOverlays,
  type ResolvedFenceOverlay,
  type ResolvedFencePost,
} from '../core/featureAutotile';
import { resolveWallArtFaces, slotSource, wallArtSlotsForFace } from '../core/wallArt';
import { flatContactClipRects, propZBracket, structureSeatPoint, structureSourceHalfSrc, structureSourceSprite, structureSourceSplitMode } from './structureGeometry';
import { fenceOverlayZIndex, fencePostZIndex, groundCoverZIndex, objectBaseZIndex, wallArtOverlayZIndex, wallOverlayZIndex } from './sceneDepth';
import { propDef, type StructureSourceRef } from '../core/props';
import { densityFieldAt, groundCoverSet, resolveGroundCover, type GroundCover } from '../core/groundCover';
import { familyOfTile } from '../core/levelBoard';
import type { TileFamilyId } from '../core/tileSockets';
import type { EditorBoard } from '../ui/boardCode';
import { macroTileAsset, macroTileBreakIndices, macroTileFrame, macroTileOwnedCellIndices, resolveMacroTilePlacements } from '../core/macroTiles';
import { liveMediaSlotUrl } from '../art/liveMediaCatalog';
import { predrawnBoardPlacement } from './predrawnBoard';
import {
  TERRAIN_SIDE_FACE_COLUMN,
  TERRAIN_SIDE_FACES,
  resolveTerrainSideExposure,
  resolveTerrainSideFaces,
  resolveTerrainSideMaterials,
} from './terrainSides';
import {
  mirrorGlassOpsForSurfaces,
  mirrorSurfacesForPlacements,
  reflectedOpsForSubjects,
  wallArtFrameOpsForPlacements,
  type MirrorReflectionSubject,
} from './mirrorReflection';

const TILE_FRAME_W = TILE_STEP_X * 2;
const TILE_FRAME_H = TILE_FRAME_HEIGHT;
const TILE_EQUATOR = TILE_FRAME_EQUATOR_Y;
const WALL_FRAME_W = WALL_FRAME_GEOMETRY.width;
const WALL_FRAME_H = WALL_FRAME_GEOMETRY.height;
const WALL_ANCHOR_X = WALL_FRAME_GEOMETRY.anchorX;
const WALL_ANCHOR_Y = WALL_FRAME_GEOMETRY.anchorY;
const DOODAD_FRAME_W = TILE_FRAME_W;
const DOODAD_FRAME_H = TILE_FRAME_H;
const DOODAD_ANCHOR_Y = 69;
const UNIT_SEAT_W = 72;
const UNIT_SEAT_H = 86;
const TERRAIN_TOP_DEPTH_OFFSET = 1000;
const TERRAIN_MACRO_TILE_DEPTH_OFFSET = 2000;
const TERRAIN_FEATURE_DEPTH_OFFSET = 3000;
export const UNIT_IMG_MAX_W = 78;
export const UNIT_IMG_MAX_H = 92;

export type BoardDrawLayer = 'terrain' | 'linear-feature' | 'scene';

export interface BoardSpriteAnimation {
  kind: 'ground-cover-sway';
  frameCount: number;
  durationMs: number;
  phase: number;
}

export interface BoardDrawOp {
  /** Semantic ownership used by composed renderers; never infer this from `src`. */
  layer?: BoardDrawLayer;
  src: string;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  z: number;
  contain?: boolean;
  flipX?: boolean;
  opacity?: number;
  sx?: number;
  sy?: number;
  sw?: number;
  sh?: number;
  /** Code-owned playback policy over catalog-declared sprite-sheet geometry. */
  animation?: BoardSpriteAnimation;
  /** Board-space polygon paths used to expose broken cells inside a composite terrain image. */
  clipPolygons?: number[][];
}

export function isBoardDrawOpInLayer(
  op: BoardDrawOp,
  ...layers: readonly BoardDrawLayer[]
): boolean {
  return !!op.layer && layers.includes(op.layer);
}

export function withoutBoardDrawLayers<TOp extends BoardDrawOp>(
  ops: readonly TOp[],
  ...layers: readonly BoardDrawLayer[]
): TOp[] {
  return ops.filter((op) => !isBoardDrawOpInLayer(op, ...layers));
}

export interface BakeBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export type RenderBoard = EditorBoard;

export interface BoardDrawOptions {
  coverSeed?: number;
  ambientCover?: boolean;
}

const studioTiles: StudioAsset[] = studioFamilies.flatMap((family) => family.assets);
const resolveTile = (id: string): StudioAsset | undefined => studioTiles.find((asset) => asset.id === id);
const resolveUnit = (id: string): UnitAsset | undefined => unitArtForId(id);
const resolveDoodad = (id: string): DoodadAsset | undefined => doodadAsset(id);

function staticUnitSubject(
  key: string,
  placement: RenderBoard['units'][string],
): MirrorReflectionSubject | null {
  const [x, y] = key.split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const unit = resolveUnit(placement.unitId);
  if (!unit) return null;
  const direction = placement.direction as Direction;
  const faction = placement.faction as Faction;
  if (!hasDirectionSprite(unit, direction)) return null;
  const src = unit.sprite(faction, direction);
  if (!src) return null;
  const scale = unit.defaultScale / 100;
  const nativeScale = unit.nativeScalePercent / 100;
  const seatW = UNIT_SEAT_W * nativeScale * scale;
  const seatH = UNIT_SEAT_H * nativeScale * scale;
  const imageW = Math.min(UNIT_IMG_MAX_W, unit.footprint.sourceCanvasPx) * scale;
  const imageH = Math.min(UNIT_IMG_MAX_H, unit.footprint.sourceCanvasHeightPx) * scale;
  const seat = boardLabCellPosition({ x, y });
  const seatX = seat.left - unitAnchorFraction(unit.unitAnchorX) * seatW;
  const seatY = seat.top - unitAnchorFraction(unit.unitAnchorY) * seatH;
  return {
    grid: { x, y },
    seat,
    facing: direction,
    spriteForFacing: (facing) => hasDirectionSprite(unit, facing)
      ? unit.sprite(faction, facing) ?? src
      : src,
    op: {
      layer: 'scene',
      src,
      dx: seatX + (seatW - imageW) / 2,
      dy: seatY + (seatH - imageH) / 2,
      dw: imageW,
      dh: imageH,
      z: objectBaseZIndex({ x, y }),
      contain: true,
    },
  };
}

function terrainCellClipPolygon(index: number, columns: number): number[] {
  const x = index % columns;
  const y = Math.floor(index / columns);
  const { left, top } = boardLabCellPosition({ x, y });
  return [
    left, top - TILE_STEP_Y,
    left + TILE_STEP_X, top,
    left, top + TILE_STEP_Y,
    left - TILE_STEP_X, top,
  ];
}

function pushStructureDrawOps(
  ops: BoardDrawOp[],
  source: StructureSourceRef,
  sourceSprite: { w: number; h: number },
  anchorY: number,
  scale: number,
  dx: number,
  dy: number,
  backZ: number,
  frontZ: number,
): void {
  const fullW = sourceSprite.w * scale;
  const fullH = sourceSprite.h * scale;
  if (structureSourceSplitMode(source) !== 'flat-contact') {
    ops.push({ layer: 'scene', src: structureSourceHalfSrc(source, 'back'), dx, dy, dw: fullW, dh: fullH, z: backZ });
    ops.push({ layer: 'scene', src: structureSourceHalfSrc(source, 'front'), dx, dy, dw: fullW, dh: fullH, z: frontZ });
    return;
  }

  const clips = flatContactClipRects({ w: sourceSprite.w, h: sourceSprite.h, anchorY });
  if (clips.back.sh > 0) {
    ops.push({
      layer: 'scene',
      src: structureSourceHalfSrc(source, 'back'),
      sx: clips.back.sx,
      sy: clips.back.sy,
      sw: clips.back.sw,
      sh: clips.back.sh,
      dx,
      dy,
      dw: fullW,
      dh: clips.back.sh * scale,
      z: backZ,
    });
  }
  if (clips.front.sh > 0) {
    ops.push({
      layer: 'scene',
      src: structureSourceHalfSrc(source, 'front'),
      sx: clips.front.sx,
      sy: clips.front.sy,
      sw: clips.front.sw,
      sh: clips.front.sh,
      dx,
      dy: dy + clips.front.sy * scale,
      dw: fullW,
      dh: clips.front.sh * scale,
      z: frontZ,
    });
  }
}

function pushFenceDrawOps(
  ops: BoardDrawOp[],
  cell: { x: number; y: number },
  fence: ResolvedFenceOverlay,
): void {
  const { left, top } = boardLabCellPosition(cell);
  const z = fenceOverlayZIndex(cell);
  ops.push({
    layer: 'scene',
    src: fenceFrameSrc(fence.material, fence.mask),
    dx: left - TILE_STEP_X,
    dy: top - TILE_EQUATOR,
    dw: TILE_FRAME_W,
    dh: TILE_FRAME_H,
    z,
  });
}

function pushFencePostDrawOp(ops: BoardDrawOp[], post: ResolvedFencePost): void {
  const { left, top: vertexCellTop } = boardLabCellPosition(post);
  const top = vertexCellTop - TILE_STEP_Y;
  ops.push({
    layer: 'scene',
    src: fencePostSrc(post.material),
    dx: left - TILE_STEP_X,
    dy: top - TILE_EQUATOR,
    dw: TILE_FRAME_W,
    dh: TILE_FRAME_H,
    z: fencePostZIndex(post),
  });
}

export function boardDrawOps(board: RenderBoard, options: BoardDrawOptions = {}): BoardDrawOp[] {
  const ops: BoardDrawOp[] = [];
  const predrawn = board.surface?.kind === 'predrawn' ? board.surface : undefined;
  if (predrawn) {
    const gridCells = Array.from({ length: board.rows }, (_, y) =>
      Array.from({ length: board.cols }, (__, x) => ({ x, y }))).flat();
    const placement = predrawnBoardPlacement(predrawn, gridCells);
    ops.push({
      layer: 'terrain',
      src: liveMediaSlotUrl(predrawn.slot),
      dx: placement.left,
      dy: placement.top,
      dw: placement.width,
      dh: placement.height,
      z: -100000,
    });
  }

  const isSevered = (edge: string): boolean => board.featureCuts[edge] === true;
  const isExit = (edge: string): boolean => board.featureExits[edge] === true;
  const overlays = resolveFeatureOverlays(board.features, isSevered, isExit);
  const fenceOverlays = predrawn ? new Map() : resolveFenceOverlays(board.fences ?? {});
  const fencePosts = predrawn ? new Map() : resolveFencePosts(board.fences ?? {}, board.fencePosts ?? {});
  const wallBounds = { cols: board.cols, rows: board.rows };
  const wallOverlays = predrawn ? new Map() : resolveWallOverlays(board.walls ?? {}, wallBounds);
  const wallFaceStyles = predrawn ? new Map() : resolveWallArtFaces(board.wallArt, wallBounds);
  const hasWall = (edge: string): boolean => Boolean(board.walls?.[edge]);
  const mirrorSurfaces = (predrawn ? [] : mirrorSurfacesForPlacements(board.wallArt, wallBounds))
    .filter((surface) => surface.segments.every((segment) => !segment.edge || hasWall(segment.edge)));
  const staticUnitSubjects = new Map<string, MirrorReflectionSubject>();
  for (const [key, placement] of Object.entries(board.units)) {
    const subject = staticUnitSubject(key, placement);
    if (subject) staticUnitSubjects.set(key, subject);
  }
  ops.push(...mirrorGlassOpsForSurfaces(mirrorSurfaces));
  ops.push(...reflectedOpsForSubjects(mirrorSurfaces, [...staticUnitSubjects.values()]));
  ops.push(...wallArtFrameOpsForPlacements(board.wallArt, wallBounds, { hasWall }));
  const occupiedTerrain = new Set(
    Object.entries(board.cells)
      .filter(([, id]) => !!resolveTile(id))
      .map(([key]) => key),
  );
  const acceptedMacroTiles = resolveMacroTilePlacements({
    placements: board.macroTiles,
    columns: board.cols,
    rows: board.rows,
    familyAt: (x, y) => familyOfTile(board.cells[`${x},${y}`] ?? ''),
  });
  const macroOwnedTerrain = new Set<string>();
  for (const placement of acceptedMacroTiles) {
    for (const index of macroTileOwnedCellIndices(placement, board.cols, board.rows)) {
      macroOwnedTerrain.add(`${index % board.cols},${Math.floor(index / board.cols)}`);
    }
  }

  for (let y = 0; y < board.rows; y += 1) {
    for (let x = 0; x < board.cols; x += 1) {
      const key = `${x},${y}`;
      const { left, top, zIndex } = boardLabCellPosition({ x, y });
      const frameX = left - TILE_STEP_X;
      const frameY = top - TILE_EQUATOR;

      const tile = board.cells[key] ? resolveTile(board.cells[key]) : undefined;
      if (tile && !predrawn) {
        const frameSrc = assetFrameSrc(tile, 0);
        const sideFaces = resolveTerrainSideFaces(
          resolveTerrainSideExposure({ x, y }, (nextX, nextY) => occupiedTerrain.has(`${nextX},${nextY}`)),
          resolveTerrainSideMaterials(tile, undefined, (source) => (
            assetFrameSrc(source, 0).replace(/\.png$/, '-side.png')
          )),
        );
        for (const face of TERRAIN_SIDE_FACES) {
          const { exposed, material } = sideFaces[face];
          if (!exposed || !material) continue;
          const faceX = TERRAIN_SIDE_FACE_COLUMN[face] * TILE_STEP_X;
          ops.push({
            layer: 'terrain',
            src: material,
            sx: faceX,
            sy: 0,
            sw: TILE_STEP_X,
            sh: TILE_FRAME_H,
            dx: frameX + faceX,
            dy: frameY,
            dw: TILE_STEP_X,
            dh: TILE_FRAME_H,
            z: zIndex,
          });
        }
        if (!macroOwnedTerrain.has(key)) {
          ops.push({ layer: 'terrain', src: frameSrc.replace(/\.png$/, '-top.png'), dx: frameX, dy: frameY, dw: TILE_FRAME_W, dh: TILE_FRAME_H, z: TERRAIN_TOP_DEPTH_OFFSET + zIndex });
        }
      }

      const feature = overlays[key];
      if (feature && !predrawn) {
        ops.push({
          layer: 'linear-feature',
          src: featureFrameSrc(feature.kind, feature.material, feature.mask),
          dx: frameX,
          dy: frameY,
          dw: TILE_FRAME_W,
          dh: TILE_FRAME_H,
          z: TERRAIN_FEATURE_DEPTH_OFFSET + zIndex,
        });
      }

      const wall = wallOverlays.get(key);
      if (wall) {
        const wallZ = wallOverlayZIndex({ x, y });
        ops.push({
          layer: 'scene',
          src: wallFrameSrc(wall.material, wall.mask),
          dx: left - WALL_ANCHOR_X,
          dy: top - WALL_ANCHOR_Y,
          dw: WALL_FRAME_W,
          dh: WALL_FRAME_H,
          z: wallZ,
        });
        const faceStyles = wallFaceStyles.get(key);
        for (const face of ['west', 'north'] as const) {
          const maskBit = face === 'west' ? 8 : 1;
          if (!(wall.mask & maskBit)) continue;
          for (const slot of wallArtSlotsForFace(faceStyles?.[face], face)) {
            const source = slotSource(slot);
            if (!source) continue;
            if (source.kind === 'mirror') continue;
            const faceAsset = source.faces[face];
            ops.push({
              layer: 'scene',
              src: faceAsset.src,
              dx: left - WALL_ANCHOR_X + slot.x - faceAsset.mountX * slot.scale,
              dy: top - WALL_ANCHOR_Y + slot.y - faceAsset.mountY * slot.scale,
              dw: faceAsset.width * slot.scale,
              dh: faceAsset.height * slot.scale,
              z: wallArtOverlayZIndex({ x, y }),
            });
          }
        }
      }
    }
  }

  // Posts cap their incident rails at a positive half-depth bias. Keep insertion order only as a
  // secondary deterministic tie breaker; numeric z owns the visible ordering.
  for (const post of fencePosts.values()) pushFencePostDrawOp(ops, post);
  // Fence owners can be off-board phantom cells for north/west boundary rails. Iterating the
  // resolved map (instead of looking fences up only while walking in-bounds tiles) paints those
  // rails. Posts resolve separately by canonical vertex, so a shared corner/join is drawn once.
  for (const [key, fence] of fenceOverlays) {
    const [x, y] = key.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    pushFenceDrawOps(ops, { x, y }, fence);
  }

  for (const placement of predrawn ? [] : acceptedMacroTiles) {
    const asset = macroTileAsset(placement.assetId);
    if (!asset) continue;
    const { left, top } = boardLabCellPosition(placement);
    const frame = macroTileFrame(asset);
    const breaks = macroTileBreakIndices(placement);
    const clipPolygons = breaks.length > 0
      ? macroTileOwnedCellIndices(placement, board.cols, board.rows).map((index) => terrainCellClipPolygon(index, board.cols))
      : undefined;
    ops.push({
      layer: 'terrain',
      src: asset.src,
      dx: left + frame.left,
      dy: top + frame.top,
      dw: frame.width,
      dh: frame.height,
      z: TERRAIN_MACRO_TILE_DEPTH_OFFSET,
      ...(clipPolygons ? { clipPolygons } : {}),
    });
  }

  for (const key of new Set([...Object.keys(board.units), ...Object.keys(board.doodads)])) {
    const [x, y] = key.split(',').map(Number);
    const { left, top } = boardLabCellPosition({ x, y });
    const base = objectBaseZIndex({ x, y });

    const doodadPlacement = board.doodads[key];
    const doodad = doodadPlacement ? resolveDoodad(doodadPlacement.doodadId) : undefined;
    if (doodad) {
      const sprite = doodad.sprite ?? { w: DOODAD_FRAME_W, h: DOODAD_FRAME_H, anchorX: TILE_STEP_X, anchorY: DOODAD_ANCHOR_Y };
      const parts = doodad.parts?.length
        ? doodad.parts
        : [{ source: doodad.source ?? { kind: 'doodad' as const, id: doodad.id }, anchorX: sprite.anchorX, anchorY: sprite.anchorY, scale: sprite.scale ?? 1 }];
      for (const part of parts) {
        const sourceSprite = structureSourceSprite(part.source);
        const scale = part.scale ?? 1;
        pushStructureDrawOps(
          ops,
          part.source,
          sourceSprite,
          part.anchorY,
          scale,
          left - part.anchorX * scale,
          top - part.anchorY * scale,
          base - 1,
          base + 1,
        );
      }
    }

    const unitSubject = staticUnitSubjects.get(key);
    if (unitSubject) ops.push(unitSubject.op);
  }

  for (const [key, placement] of Object.entries(predrawn ? {} : (board.props ?? {}))) {
    const def = propDef(placement.propId);
    if (!def) continue;
    const [ax, ay] = key.split(',').map(Number);
    const { left, top } = structureSeatPoint({ x: ax, y: ay }, def.w, def.h);
    const { back, front } = propZBracket(ax, ay, def.w, def.h);
    const parts = def.spriteParts?.length
      ? def.spriteParts
      : [{ source: def.spriteSource ?? { kind: 'prop' as const, id: def.spriteId }, anchorX: def.sprite.anchorX, anchorY: def.sprite.anchorY, scale: def.sprite.scale ?? 1 }];
    for (const part of parts) {
      const sourceSprite = structureSourceSprite(part.source);
      const s = part.scale ?? 1;
      const dx = left - part.anchorX * s;
      const dy = top - part.anchorY * s;
      pushStructureDrawOps(ops, part.source, sourceSprite, part.anchorY, s, dx, dy, back, front);
    }
  }

  const COVER_SEED = options.coverSeed ?? 1234;
  const coverCells: Array<{ x: number; y: number; terrain: TileFamilyId; groundCover?: GroundCover }> = [];
  for (let y = 0; y < board.rows; y += 1) {
    for (let x = 0; x < board.cols; x += 1) {
      const key = `${x},${y}`;
      const tileId = board.cells[key];
      const tileTerrain = tileId ? familyOfTile(tileId) : undefined;
      const terrain = board.coverTypes?.[key] ?? tileTerrain;
      if (terrain && groundCoverSet(terrain)) coverCells.push({ x, y, terrain });
    }
  }
  // An EditorBoard is exact authoring data: an empty cover map means bare terrain, just as it
  // does in the live editor and exact-board play path. Legacy generated game states can opt
  // into ambient fallback explicitly while they are being adapted for the shared renderer.
  const hasPaintedCover = Object.keys(board.cover ?? {}).length > 0;
  const ambientCover = options.ambientCover ?? false;
  resolveGroundCover(coverCells, COVER_SEED, (cell) =>
    board.cover?.[`${cell.x},${cell.y}`] ?? (hasPaintedCover || !ambientCover ? null : densityFieldAt(cell.x, cell.y, COVER_SEED)));
  for (const cell of coverCells) {
    if (!cell.groundCover) continue;
    const set = groundCoverSet(cell.terrain);
    if (!set) continue;
    const { left, top } = boardLabCellPosition(cell);
    for (const tuft of cell.groundCover.tufts) {
      const meta = set.variants.find((v) => v.id === tuft.variant);
      if (!meta) continue;
      ops.push({
        layer: 'scene',
        src: meta.src,
        sx: 0,
        sy: 0,
        sw: meta.frameWidth,
        sh: meta.frameHeight,
        dx: left + tuft.dx - meta.baseX,
        dy: top + tuft.dy - meta.baseY,
        dw: meta.frameWidth,
        dh: meta.frameHeight,
        z: groundCoverZIndex(cell, tuft.dy),
        flipX: tuft.flip,
        animation: {
          kind: 'ground-cover-sway',
          frameCount: set.frameCount,
          durationMs: 1140,
          phase: tuft.phase,
        },
      });
    }
  }

  ops.sort((a, b) => a.z - b.z);
  return ops;
}

export function uniqueDrawSrcs(board: RenderBoard, options: BoardDrawOptions = {}): string[] {
  return [...new Set(boardDrawOps(board, options).map((op) => op.src))];
}

export function boardContentHash(board: RenderBoard): string {
  const sortedEntries = (record: Record<string, unknown>): string =>
    Object.keys(record)
      .sort()
      .map((key) => `${key}=${JSON.stringify(record[key])}`)
      .join(';');
  const macroTiles = [...(board.macroTiles ?? [])]
    .sort((a, b) => a.y - b.y || a.x - b.x || a.assetId.localeCompare(b.assetId));
  const parts = [
    `c${board.cols}`,
    `r${board.rows}`,
    `pd:${JSON.stringify(board.surface ?? null)}`,
    `t:${sortedEntries(board.cells)}`,
    `mt:${JSON.stringify(macroTiles)}`,
    `u:${sortedEntries(board.units)}`,
    `d:${sortedEntries(board.doodads)}`,
    `p:${sortedEntries(board.props ?? {})}`,
    `v:${sortedEntries(board.cover)}`,
    `ct:${sortedEntries(board.coverTypes ?? {})}`,
    `f:${sortedEntries(board.features)}`,
    `fe:${sortedEntries(board.fences ?? {})}`,
    `fp:${sortedEntries(board.fencePosts ?? {})}`,
    `wl:${sortedEntries(board.walls ?? {})}`,
    `wa:${sortedEntries(board.wallArt ?? {})}`,
    `x:${sortedEntries(board.featureCuts)}`,
    `xe:${sortedEntries(board.featureExits)}`,
  ];
  return fnv1a(parts.join('|'));
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function boardBounds(board: RenderBoard, options: BoardDrawOptions = {}): BakeBounds {
  const ops = boardDrawOps(board, options);
  if (ops.length === 0) {
    return { minX: -TILE_STEP_X, minY: -TILE_EQUATOR, width: TILE_FRAME_W, height: TILE_FRAME_H };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const op of ops) {
    minX = Math.min(minX, op.dx);
    minY = Math.min(minY, op.dy);
    maxX = Math.max(maxX, op.dx + op.dw);
    maxY = Math.max(maxY, op.dy + op.dh);
  }
  return { minX, minY, width: Math.ceil(maxX - minX), height: Math.ceil(maxY - minY) };
}

export function boardSocialFramingBounds(board: RenderBoard): BakeBounds {
  const drawBounds = boardBounds(board);
  let surfaceMaxY = -Infinity;
  for (const key of Object.keys(board.cells)) {
    const [x, y] = key.split(',').map(Number);
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
    const { top } = boardLabCellPosition({ x, y });
    surfaceMaxY = Math.max(surfaceMaxY, top + TILE_STEP_Y);
  }
  if (!Number.isFinite(surfaceMaxY)) return drawBounds;

  return {
    minX: drawBounds.minX,
    minY: drawBounds.minY,
    width: drawBounds.width,
    height: Math.max(1, Math.ceil(surfaceMaxY - drawBounds.minY)),
  };
}

export const BAKE_GEOMETRY = { TILE_FRAME_W, TILE_FRAME_H, TILE_STEP_X, TILE_STEP_Y, TILE_EQUATOR } as const;
