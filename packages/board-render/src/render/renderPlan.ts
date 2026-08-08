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
  resolveDecorativeWallOverlays,
  resolveFenceOverlays,
  resolveFencePosts,
  resolveWallOverlays,
  parseEdgeKey,
  type ResolvedFenceOverlay,
  type ResolvedFencePost,
} from '../core/featureAutotile';
import { resolveWallArtFaces, slotSource, wallArtSlotsForFace } from '../core/wallArt';
import { flatContactClipRects, propZBracket, structureSeatPoint, structureSourceHalfSrc, structureSourceSprite, structureSourceSplitMode } from './structureGeometry';
import { fenceOverlayZIndex, fencePostZIndex, groundCoverZIndex, objectBaseZIndex, projectedSceneObjectZBracket, wallArtOverlayZIndex, wallOverlayZIndex } from './sceneDepth';
import { propDef, resolvePlacedPropId, type PropKind, type StructureSourceRef } from '../core/props';
import {
  structureArtAsset,
  structureArtDirectionHalfSrc,
  structureArtDirectionSplitMode,
  structureArtDirectionSprite,
} from '../core/structureArt';
import { densityFieldAt, groundCoverSet, LEGACY_GROUND_COVER_SEED, resolveGroundCover, type GroundCover } from '../core/groundCover';
import { familyOfTile } from '../core/levelBoard';
import type { TileFamilyId } from '../core/tileSockets';
import {
  boardBackgroundMode,
  isVersionedPredrawnBoardSurface,
  predrawnRenderSurface,
  type EditorBoard,
  type FloatingArtworkPlacement,
} from '../ui/boardCode';
import { macroTileAsset, macroTileBreakIndices, macroTileFrame, macroTileOwnedCellIndices, resolveMacroTilePlacements } from '../core/macroTiles';
import { liveMediaSlotUrl } from '../art/liveMediaCatalog';
import {
  predrawnBoardPlacement,
  predrawnBoardRasterBounds,
  predrawnBoardRasterTransform,
  type PredrawnBoardRasterTransform,
} from './predrawnBoard';
import {
  TERRAIN_SIDE_FACE_COLUMN,
  TERRAIN_SIDE_FACES,
  resolveTerrainSideExposure,
  resolveTerrainSideFaces,
  type TerrainSideMaterials,
} from './terrainSides';
import { subterrainFaceKey, subterrainMaterialSrc } from '../core/subterrain';
import { decorativeTerrainApronCoordinates, scenicTerrainValueAt } from '../core/scenicTerrain';
import { playableBoardFramingBounds } from './boardFraming';
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

/**
 * A sprite sheet played ONCE from a known moment and then held on its last frame forever. The
 * board's only existing sheet policy loops (grass sway); an impact is the opposite — it happens,
 * and what it leaves behind is the object's new resting appearance. A rock that cracks when it
 * lands stays cracked, so the final frame is not the end of an animation, it is the sprite.
 */
export interface BoardSpriteImpact {
  kind: 'structure-impact';
  frameCount: number;
  durationMs: number;
  /** Timeline moment the first frame is shown, on the same clock the renderer paints with. */
  startMs: number;
}

export type BoardSpritePlayback = BoardSpriteAnimation | BoardSpriteImpact;

/**
 * Which placed structure an op's pixels belong to. A prop is drawn as several ops (two depth
 * halves, one pair per authored part), and a renderer that wants to move the WHOLE prop — the
 * board-assembly drop (ADR-0045) is the first such caller — has to move every one of them by
 * the same amount or the halves shear apart. Carrying the anchor identity on the op is how a
 * flat op list stays groupable without the renderer re-deriving placement from board data.
 */
export interface BoardStructureIdentity {
  /** Anchor cell key `"x,y"` of the placed prop, exactly as it is keyed in `board.props`. */
  key: string;
  /** Gameplay kind, so a caller can animate rocks without animating trees and houses. */
  kind: PropKind;
  /** Anchor cell, pre-split so depth-ordered choreography needs no key parsing. */
  x: number;
  y: number;
  /** The structure art this prop draws, so a renderer can look up its impact sheet. */
  artId: string;
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
  animation?: BoardSpritePlayback;
  /** Present on every op drawn for a placed prop; absent on terrain, cover and units. */
  structure?: BoardStructureIdentity;
  /** Board-space polygon paths used to expose broken cells inside a composite terrain image. */
  clipPolygons?: number[][];
  /** Complete-scene inverse raster map. Present only on a persisted registered pre-drawn plate. */
  predrawnTransform?: PredrawnBoardRasterTransform;
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
  /**
   * Uniform ground-cover tuft scale (default 1), anchored at each tuft's planted base.
   * Miniature scenes (the Run card vignettes) use it to keep grass in proportion;
   * gameplay boards never pass it.
   */
  coverScale?: number;
  /** Generation-reference mode: retain tops, features, and only explicitly authored Subterrain. */
  topSurfacesOnly?: boolean;
  /**
   * A complete generated background is mounted by the caller. This is additive with a persisted
   * pre-drawn surface so temporary candidates receive the same environment suppression.
   */
  predrawnBackgroundActive?: boolean;
}

/** A generated plate owns baked environment pixels; canonical units and authored cover stay live. */
export function isPredrawnBackgroundActive(
  board: Pick<RenderBoard, 'backgroundMode' | 'surface'>,
  options: Pick<BoardDrawOptions, 'predrawnBackgroundActive'> = {},
): boolean {
  // AI is the saved rendering mode even when its remembered selection is unavailable. In that
  // fail-closed state the legacy environment must stay suppressed rather than becoming a fallback.
  return boardBackgroundMode(board) === 'ai' || options.predrawnBackgroundActive === true;
}

export interface BoardVisualTerrainCell {
  key: string;
  x: number;
  y: number;
  tileId?: string;
  decorative: boolean;
}

const resolveTile = (id: string): StudioAsset | undefined =>
  studioFamilies.flatMap((family) => family.assets).find((asset) => asset.id === id);
const resolveUnit = (id: string): UnitAsset | undefined => unitArtForId(id);
const resolveDoodad = (id: string): DoodadAsset | undefined => doodadAsset(id);

const EMPTY_SCENIC_EXTENTS = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

/**
 * Resolve the complete authored visual terrain surface while keeping the playable grid as the
 * projection origin. The sparse footprint owns scenic membership; retained material alone never
 * activates a cell. Invalid or unavailable tile ids resolve as void, matching the live editor.
 */
export function boardVisualTerrainCells(board: RenderBoard): BoardVisualTerrainCell[] {
  const validTileId = (id: string | undefined): string | undefined => id && resolveTile(id) ? id : undefined;
  const cells: BoardVisualTerrainCell[] = [];
  for (let y = 0; y < board.rows; y += 1) {
    for (let x = 0; x < board.cols; x += 1) {
      const key = `${x},${y}`;
      cells.push({ key, x, y, tileId: validTileId(board.cells[key]), decorative: false });
    }
  }
  for (const { x, y } of decorativeTerrainApronCoordinates(
    board.cols,
    board.rows,
    board.decorativeApron ?? EMPTY_SCENIC_EXTENTS,
    board.decorativeFootprint ?? [],
  )) {
    const key = `${x},${y}`;
    const tileId = scenicTerrainValueAt(
      x,
      y,
      board.cols,
      board.rows,
      (sourceX, sourceY) => validTileId(board.cells[`${sourceX},${sourceY}`]),
      (authoredX, authoredY) => validTileId(board.decorativeCells?.[`${authoredX},${authoredY}`]),
    );
    cells.push({ key, x, y, tileId, decorative: true });
  }
  return cells;
}

/** Feature topology follows the same active visual surface as its terrain. */
export function boardVisualFeatures(
  board: RenderBoard,
  terrainCells: readonly BoardVisualTerrainCell[] = boardVisualTerrainCells(board),
): RenderBoard['features'] {
  const visibleScenicTerrain = new Set(
    terrainCells.filter((cell) => cell.decorative && cell.tileId).map((cell) => cell.key),
  );
  return {
    ...board.features,
    ...Object.fromEntries(
      Object.entries(board.decorativeFeatures ?? {}).filter(([key]) => visibleScenicTerrain.has(key)),
    ),
  };
}

function wallLeavesPlayableBoard(edge: string, board: Pick<RenderBoard, 'cols' | 'rows'>): boolean {
  const parsed = parseEdgeKey(edge);
  if (!parsed) return false;
  return [
    [parsed.ax, parsed.ay],
    [parsed.bx, parsed.by],
  ].some(([x, y]) => x < 0 || x >= board.cols || y < 0 || y >= board.rows);
}

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
  structure?: BoardStructureIdentity,
): void {
  const fullW = sourceSprite.w * scale;
  const fullH = sourceSprite.h * scale;
  if (structureSourceSplitMode(source) !== 'flat-contact') {
    ops.push({ layer: 'scene', src: structureSourceHalfSrc(source, 'back'), dx, dy, dw: fullW, dh: fullH, z: backZ, structure });
    ops.push({ layer: 'scene', src: structureSourceHalfSrc(source, 'front'), dx, dy, dw: fullW, dh: fullH, z: frontZ, structure });
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
      structure,
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
      structure,
    });
  }
}

export function floatingArtworkDrawOps(
  placement: FloatingArtworkPlacement,
): BoardDrawOp[] {
  const ops: BoardDrawOp[] = [];
  const sourceSprite = structureArtDirectionSprite(placement.sourceArtId, placement.direction);
  if (!sourceSprite) return ops;
  const scale = sourceSprite.scale * placement.scale;
  const fullW = sourceSprite.w * scale;
  const fullH = sourceSprite.h * scale;
  const dx = placement.pixelX - fullW / 2;
  const dy = placement.pixelY - fullH / 2;
  const { back: backZ, front: frontZ } = projectedSceneObjectZBracket(
    dy + sourceSprite.anchorY * scale,
  );
  const sourceArtId = placement.sourceArtId;
  const direction = placement.direction;
  const anchorY = sourceSprite.anchorY;
  const srcFor = (half: 'back' | 'front') => structureArtDirectionHalfSrc(sourceArtId, direction, half);
  if (structureArtDirectionSplitMode(sourceArtId, direction) !== 'flat-contact') {
    ops.push({ layer: 'scene', src: srcFor('back'), dx, dy, dw: fullW, dh: fullH, z: backZ });
    ops.push({ layer: 'scene', src: srcFor('front'), dx, dy, dw: fullW, dh: fullH, z: frontZ });
    return ops;
  }
  const clips = flatContactClipRects({ w: sourceSprite.w, h: sourceSprite.h, anchorY });
  if (clips.back.sh > 0) {
    ops.push({
      layer: 'scene',
      src: srcFor('back'),
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
      src: srcFor('front'),
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
  return ops;
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
  const visualTerrainCells = boardVisualTerrainCells(board);
  const predrawn = isPredrawnBackgroundActive(board) && board.surface?.kind === 'predrawn'
    ? predrawnRenderSurface(board)
    : undefined;
  const predrawnBackgroundActive = isPredrawnBackgroundActive(board, options);
  if (predrawn) {
    if (isVersionedPredrawnBoardSurface(predrawn)) {
      ops.push({
        layer: 'terrain',
        src: `/api/background-versions/${encodeURIComponent(predrawn.backgroundVersionId)}/content`,
        dx: predrawn.worldBounds.minX,
        dy: predrawn.worldBounds.minY,
        dw: predrawn.worldBounds.width,
        dh: predrawn.worldBounds.height,
        z: -100000,
      });
    } else {
      const gridCells = Array.from({ length: board.rows }, (_, y) =>
        Array.from({ length: board.cols }, (__, x) => ({ x, y }))).flat();
      const registeredTransform = predrawn.registration
        ? predrawnBoardRasterTransform(predrawn, gridCells, predrawn.registration)
        : undefined;
      const registeredBounds = registeredTransform
        ? predrawnBoardRasterBounds(registeredTransform)
        : undefined;
      const placement = registeredBounds
        ? {
            left: registeredBounds.minX,
            top: registeredBounds.minY,
            width: registeredBounds.width,
            height: registeredBounds.height,
          }
        : predrawnBoardPlacement(predrawn, gridCells);
      ops.push({
        layer: 'terrain',
        src: liveMediaSlotUrl(predrawn.slot),
        dx: placement.left,
        dy: placement.top,
        dw: placement.width,
        dh: placement.height,
        z: -100000,
        ...(registeredTransform && registeredBounds
          ? { predrawnTransform: registeredTransform }
          : {}),
      });
    }
  }

  const isSevered = (edge: string): boolean => board.featureCuts[edge] === true;
  const isExit = (edge: string): boolean => board.featureExits[edge] === true;
  const overlays = resolveFeatureOverlays(boardVisualFeatures(board, visualTerrainCells), isSevered, isExit);
  const visualFences = { ...(board.decorativeFences ?? {}), ...(board.fences ?? {}) };
  const visualFencePosts = { ...(board.decorativeFencePosts ?? {}), ...(board.fencePosts ?? {}) };
  const fenceOverlays = predrawnBackgroundActive ? new Map() : resolveFenceOverlays(visualFences);
  const fencePosts = predrawnBackgroundActive ? new Map() : resolveFencePosts(visualFences, visualFencePosts);
  const wallBounds = { cols: board.cols, rows: board.rows };
  const wallOverlays = predrawnBackgroundActive ? new Map() : resolveWallOverlays(board.walls ?? {}, wallBounds);
  if (!predrawnBackgroundActive) {
    const exteriorWalls = {
      ...(board.decorativeWalls ?? {}),
      ...Object.fromEntries(Object.entries(board.walls ?? {}).filter(([edge]) => wallLeavesPlayableBoard(edge, board))),
    };
    for (const [key, overlay] of resolveDecorativeWallOverlays(exteriorWalls)) {
      const prior = wallOverlays.get(key);
      wallOverlays.set(key, {
        mask: (prior?.mask ?? 0) | overlay.mask,
        material: prior?.material ?? overlay.material,
      });
    }
  }
  const wallFaceStyles = predrawnBackgroundActive ? new Map() : resolveWallArtFaces(board.wallArt, wallBounds);
  const hasWall = (edge: string): boolean => Boolean(board.walls?.[edge]);
  const mirrorSurfaces = (predrawnBackgroundActive ? [] : mirrorSurfacesForPlacements(board.wallArt, wallBounds))
    .filter((surface) => surface.segments.every((segment) => !segment.edge || hasWall(segment.edge)));
  const staticUnitSubjects = new Map<string, MirrorReflectionSubject>();
  for (const [key, placement] of Object.entries(board.units)) {
    const subject = staticUnitSubject(key, placement);
    if (subject) staticUnitSubjects.set(key, subject);
  }
  ops.push(...mirrorGlassOpsForSurfaces(mirrorSurfaces));
  ops.push(...reflectedOpsForSubjects(mirrorSurfaces, [...staticUnitSubjects.values()]));
  if (!predrawnBackgroundActive) {
    ops.push(...wallArtFrameOpsForPlacements(board.wallArt, wallBounds, { hasWall }));
  }
  const occupiedTerrain = new Set(visualTerrainCells.filter((cell) => cell.tileId).map((cell) => cell.key));
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

  for (const visualCell of visualTerrainCells) {
    const { x, y, key } = visualCell;
    const { left, top, zIndex } = boardLabCellPosition({ x, y });
    const frameX = left - TILE_STEP_X;
    const frameY = top - TILE_EQUATOR;

    const tile = visualCell.tileId ? resolveTile(visualCell.tileId) : undefined;
    if (tile && !predrawnBackgroundActive) {
      const sideFaces = resolveTerrainSideFaces(
        resolveTerrainSideExposure({ x, y }, (nextX, nextY) => occupiedTerrain.has(`${nextX},${nextY}`)),
        Object.fromEntries(TERRAIN_SIDE_FACES.flatMap((face) => {
          const material = board.subterrain?.[subterrainFaceKey(x, y, face)];
          return material ? [[face, subterrainMaterialSrc(material)]] : [];
        })) as TerrainSideMaterials<string>,
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
      const frameSrc = assetFrameSrc(tile, 0);
      if (!macroOwnedTerrain.has(key)) {
        ops.push({ layer: 'terrain', src: frameSrc, dx: frameX, dy: frameY, dw: TILE_FRAME_W, dh: TILE_FRAME_H, z: TERRAIN_TOP_DEPTH_OFFSET + zIndex });
      }
    }

    const feature = overlays[key];
    if (feature && !predrawnBackgroundActive) {
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

  // Posts sit between farther and nearer incident rail bands. Keep insertion order only as a
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

  for (const placement of predrawnBackgroundActive ? [] : acceptedMacroTiles) {
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

  for (const key of new Set([
    ...Object.keys(board.units),
    ...(predrawnBackgroundActive ? [] : Object.keys(board.doodads)),
  ])) {
    const [x, y] = key.split(',').map(Number);
    const { left, top } = boardLabCellPosition({ x, y });
    const base = objectBaseZIndex({ x, y });

    const doodadPlacement = predrawnBackgroundActive ? undefined : board.doodads[key];
    const doodad = doodadPlacement ? resolveDoodad(doodadPlacement.doodadId) : undefined;
    if (doodad) {
      const sprite = doodad.sprite ?? { w: DOODAD_FRAME_W, h: DOODAD_FRAME_H, anchorX: TILE_STEP_X, anchorY: DOODAD_ANCHOR_Y };
      const spriteScale = 'scale' in sprite && typeof sprite.scale === 'number' ? sprite.scale : undefined;
      const parts = doodad.parts?.length
        ? doodad.parts
        : spriteScale
          ? [{ source: doodad.source ?? { kind: 'doodad' as const, id: doodad.id }, anchorX: sprite.anchorX, anchorY: sprite.anchorY, scale: spriteScale }]
          : (() => { throw new Error(`doodad "${doodad.id}" has no DB-owned scale`); })();
      for (const part of parts) {
        const sourceSprite = structureSourceSprite(part.source);
        const scale = part.scale;
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

  for (const [key, placement] of Object.entries(predrawnBackgroundActive ? {} : (board.props ?? {}))) {
    const [ax, ay] = key.split(',').map(Number);
    // A retired rock draws as its successor, so the editor and the battle agree about what is
    // standing on the cell without either of them rewriting the saved level.
    const def = propDef(resolvePlacedPropId(placement.propId, ax, ay));
    if (!def) continue;
    const { left, top } = structureSeatPoint({ x: ax, y: ay }, def.w, def.h);
    const { back, front } = propZBracket(ax, ay, def.w, def.h);
    const parts = def.spriteParts?.length
      ? def.spriteParts
      : [{ source: def.spriteSource ?? { kind: 'prop' as const, id: def.spriteId }, anchorX: def.sprite.anchorX, anchorY: def.sprite.anchorY, scale: def.sprite.scale }];
    const structure: BoardStructureIdentity = { key, kind: def.kind, x: ax, y: ay, artId: def.spriteId };
    for (const part of parts) {
      const sourceSprite = structureSourceSprite(part.source);
      const s = part.scale;
      const dx = left - part.anchorX * s;
      const dy = top - part.anchorY * s;
      pushStructureDrawOps(ops, part.source, sourceSprite, part.anchorY, s, dx, dy, back, front, structure);
    }
  }

  for (const placement of predrawnBackgroundActive ? [] : (board.floatingArtwork ?? [])) {
    // The placement remains free projected-pixel art. Its installed directional anchor supplies
    // only a render-time ground contact, which seats it in the same continuous depth bands as
    // walls and board-addressed objects. No board coordinate or z enters persisted content.
    ops.push(...floatingArtworkDrawOps(placement));
  }

  // Ambient/legacy fallback only. A painted cell uses the seed baked into it at paint time.
  const COVER_SEED = options.coverSeed ?? LEGACY_GROUND_COVER_SEED;
  const coverCells: Array<{ x: number; y: number; terrain: TileFamilyId; groundCover?: GroundCover }> = [];
  for (const visualCell of visualTerrainCells) {
    const tileTerrain = visualCell.tileId ? familyOfTile(visualCell.tileId) : undefined;
    const terrain = board.coverTypes?.[visualCell.key] ?? tileTerrain;
    if (terrain && groundCoverSet(terrain)) coverCells.push({ x: visualCell.x, y: visualCell.y, terrain });
  }
  // An EditorBoard is exact authoring data: an empty cover map means bare terrain, just as it
  // does in the live editor and exact-board play path. Legacy generated game states can opt
  // into ambient fallback explicitly while they are being adapted for the shared renderer.
  const hasPaintedCover = Object.keys(board.cover ?? {}).length > 0;
  const ambientCover = options.ambientCover ?? false;
  resolveGroundCover(coverCells, (cell) => board.coverSeeds?.[`${cell.x},${cell.y}`] ?? COVER_SEED, (cell) =>
    board.cover?.[`${cell.x},${cell.y}`] ?? (hasPaintedCover || !ambientCover ? null : densityFieldAt(cell.x, cell.y, COVER_SEED)));
  const coverScale = options.coverScale ?? 1;
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
        // The planted base point (baseX/baseY) stays fixed while the sprite scales.
        dx: left + tuft.dx - meta.baseX * coverScale,
        dy: top + tuft.dy - meta.baseY * coverScale,
        dw: meta.frameWidth * coverScale,
        dh: meta.frameHeight * coverScale,
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
    `bm:${boardBackgroundMode(board)}`,
    `pd:${JSON.stringify(board.surface ?? null)}`,
    `da:${JSON.stringify(board.decorativeApron ?? null)}`,
    `df:${JSON.stringify([...(board.decorativeFootprint ?? [])].sort())}`,
    `dt:${sortedEntries(board.decorativeCells ?? {})}`,
    `dr:${sortedEntries(board.decorativeFeatures ?? {})}`,
    `dfe:${sortedEntries(board.decorativeFences ?? {})}`,
    `dfp:${sortedEntries(board.decorativeFencePosts ?? {})}`,
    `dwl:${sortedEntries(board.decorativeWalls ?? {})}`,
    `t:${sortedEntries(board.cells)}`,
    `mt:${JSON.stringify(macroTiles)}`,
    `u:${sortedEntries(board.units)}`,
    `d:${sortedEntries(board.doodads)}`,
    `p:${sortedEntries(board.props ?? {})}`,
    `fa:${JSON.stringify(board.floatingArtwork ?? [])}`,
    `v:${sortedEntries(board.cover)}`,
    `ct:${sortedEntries(board.coverTypes ?? {})}`,
    `f:${sortedEntries(board.features)}`,
    `fe:${sortedEntries(board.fences ?? {})}`,
    `fp:${sortedEntries(board.fencePosts ?? {})}`,
    `wl:${sortedEntries(board.walls ?? {})}`,
    `wa:${sortedEntries(board.wallArt ?? {})}`,
    `st:${sortedEntries(board.subterrain ?? {})}`,
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

/** Board-owned preview framing; generated art and scene content never move the opening shot. */
export function boardPreviewFramingBounds(board: RenderBoard): BakeBounds {
  return playableBoardFramingBounds(board);
}

export const BAKE_GEOMETRY = { TILE_FRAME_W, TILE_FRAME_H, TILE_STEP_X, TILE_STEP_Y, TILE_EQUATOR } as const;
